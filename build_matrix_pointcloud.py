"""
build_matrix_pointcloud.py
==========================
TouchDesigner network builder: "Matrix 3D Point Cloud Disintegration &
Cinematic Camera".

Run it from the Textport (see the 2-step instructions in the README block at the
bottom of this file) or from a Text DAT (right-click > Run Script).

The script is idempotent: re-running it deletes and rebuilds only the nodes it
owns (matched by name) inside PARENT_PATH.

Tested against the TouchDesigner 2023.x / 2024.x Python API. Parameter names that
differ between builds are set through `setp()`, which logs a warning instead of
crashing, so the network always builds. Read the console summary at the end.
"""

# =============================================================================
#  USER SETTINGS
# =============================================================================
PARENT_PATH      = '/project1'
VIDEO_PATH       = ''          # e.g. 'C:/media/clip.mp4'  or  '/Users/me/clip.mp4'
RENDER_RES       = (1920, 1080)  # render / output resolution (reference clip is 720x720)

GRID_RES         = 250         # grid rows == cols  -> GRID_RES^2 instances (62 500)
GRID_WIDTH       = 3.2         # world-space width of the point-cloud sheet
POINT_SIZE       = 0.008       # instance cube size (micro-cubes / point sprites)
DEPTH_SCALE      = 1.2         # Z displacement from luminance (world units)

NOISE_INTENSITY  = 0.35        # how much 3D noise perturbs depth
NOISE_SPEED      = 0.15        # noise phase speed  (absTime.seconds * NOISE_SPEED)
NOISE_PERIOD     = 0.55        # spatial scale of the noise field
DISSOLVE_AMOUNT  = 0.52        # 0 = intact image, 1 = fully dust
DRIFT_DISTANCE   = 1.1         # how far dissolving particles wander
DRIFT_RISE       = 0.35         # upward drift of dissolving particles

DEPTH_GAMMA      = 1.2         # depth_level gamma
DEPTH_CONTRAST   = 1.5         # depth_level contrast

# camera rig (CHOP driven).  (freq Hz, from -> to)
CAM_PITCH        = dict(freq=0.031, lo=-10.0, hi=10.0)     # rx, degrees
CAM_YAW          = dict(freq=0.022, lo=-30.0, hi=30.0)     # ry, degrees
CAM_DIST         = dict(freq=0.043, lo=2.5,   hi=4.5)      # tz, world units
CAM_LAG_SECONDS  = 1.5
CAM_FOV          = 45.0

FEEDBACK_DECAY   = 0.90        # 0.88 - 0.92 : particle persistence / trails
FEEDBACK_BLUR    = 4           # px blur inside the trail loop
DOF_BLUR_SIZE    = 14          # bokeh blur size (px)
BLOOM_BLUR_SIZE  = 28
BLOOM_GAIN       = 0.9
GRADE_BLACK      = 0.07        # crushed shadows (level black point)
EMERALD          = (0.0, 1.0, 0.533)    # #00FF88
CYAN             = (0.0, 0.898, 1.0)    # #00E5FF

X_STEP, Y_STEP   = 210, 140    # layout grid spacing in the network editor

# =============================================================================
#  HELPERS
# =============================================================================
parent = op(PARENT_PATH)
if parent is None:
    raise RuntimeError('PARENT_PATH %r does not exist' % PARENT_PATH)

_warnings = []
_created = []


def log(msg):
    print('[matrix_pc] ' + msg)


def setp(node, name, value, expr=False):
    """Set a parameter (or expression) without ever raising."""
    try:
        p = getattr(node.par, name)
    except Exception:
        p = None
    if p is None:
        _warnings.append('%s has no parameter "%s"' % (node.name, name))
        return False
    try:
        if expr:
            p.expr = value
            p.mode = ParMode.EXPRESSION
        else:
            p.val = value
        return True
    except Exception as e:
        _warnings.append('%s.%s = %r failed (%s)' % (node.name, name, value, e))
        return False


def setp_any(node, names, value, expr=False):
    """Try several candidate parameter names, first success wins."""
    for n in names:
        try:
            if getattr(node.par, n) is not None:
                return setp(node, n, value, expr)
        except Exception:
            pass
    _warnings.append('%s: none of %s exist' % (node.name, list(names)))
    return False


def mk(optype, name, col, row):
    """Create (or recreate) a node at layout cell (col,row)."""
    old = parent.op(name)
    if old is not None:
        old.destroy()
    n = parent.create(optype, name)
    n.nodeX = int(col * X_STEP)
    n.nodeY = int(-row * Y_STEP)
    _created.append(n)
    return n


def wire(src, dst, idx=0):
    """src output -> dst input #idx"""
    dst.inputConnectors[idx].connect(src)


def chain(*nodes):
    for a, b in zip(nodes[:-1], nodes[1:]):
        wire(a, b)


def custom_res(node, w, h):
    setp(node, 'outputresolution', 'custom')
    setp(node, 'resolutionw', w)
    setp(node, 'resolutionh', h)


def comment(txt, col, row):
    try:
        c = parent.create(annotateCOMP, 'note_' + str(len(_created)))
        c.nodeX = int(col * X_STEP)
        c.nodeY = int(-row * Y_STEP)
        c.par.Titletext = txt
        _created.append(c)
    except Exception:
        pass


ASPECT = RENDER_RES[0] / float(RENDER_RES[1])

# =============================================================================
#  A. VIDEO INPUT & DEPTH PROCESSING (TOPs)
# =============================================================================
ROW_A = 0
video_in = mk(moviefileinTOP, 'video_in', 0, ROW_A)
if VIDEO_PATH:
    setp(video_in, 'file', VIDEO_PATH)
else:
    _warnings.append('VIDEO_PATH is empty -> set video_in.par.file (or VIDEO_PATH) to your clip')
setp(video_in, 'play', 1)
setp(video_in, 'extend', 'loop')          # loop at end of clip
setp(video_in, 'playmode', 'sequential')  # sequential playback (not locked to timeline index)

mono_depth = mk(monochromeTOP, 'mono_depth', 1, ROW_A)
depth_level = mk(levelTOP, 'depth_level', 2, ROW_A)
setp(depth_level, 'gamma1', DEPTH_GAMMA)
setp(depth_level, 'contrast', DEPTH_CONTRAST)

# 32-bit float mono+alpha animated 3D noise
noise_displace = mk(noiseTOP, 'noise_displace', 2, ROW_A + 1)
setp(noise_displace, 'type', 'simplex3d')
setp(noise_displace, 'period', NOISE_PERIOD)
setp(noise_displace, 'harmon', 3)
setp(noise_displace, 'amp', 0.5)
setp(noise_displace, 'offset', 0.5)       # keep 0..1 so shader can threshold it
if not setp(noise_displace, 'format', 'monoalpha32float'):
    setp(noise_displace, 'format', 'rgba32float')
custom_res(noise_displace, GRID_RES, GRID_RES)
# animated phase = absTime.seconds * 0.15   (Noise TOP's 3rd translate axis is its time axis)
setp(noise_displace, 'tz', 'absTime.seconds * %s' % NOISE_SPEED, expr=True)

# noise -> centred & attenuated -> added on top of luminance depth
noise_atten = mk(mathTOP, 'noise_atten', 3, ROW_A + 1)
setp(noise_atten, 'preoff', -0.5)
setp(noise_atten, 'gain', NOISE_INTENSITY)
wire(noise_displace, noise_atten)

combine_disp = mk(compositeTOP, 'combine_disp', 3, ROW_A)
setp(combine_disp, 'operand', 'add')
custom_res(combine_disp, GRID_RES, GRID_RES)

chain(video_in, mono_depth, depth_level)
wire(depth_level, combine_disp, 0)
wire(noise_atten, combine_disp, 1)

# colour branch resampled to the grid so pixel i == instance i
color_res = mk(resolutionTOP, 'color_res', 1, ROW_A + 2)
custom_res(color_res, GRID_RES, GRID_RES)
wire(video_in, color_res)

# ---- GLSL: build position texture (xyz = translate, a = instance scale / alive)
POS_GLSL = """
// build_pos : input0 = combined depth, input1 = raw noise (0..1)
out vec4 fragColor;
const float WIDTH     = %(w)f;
const float ASPECT    = %(a)f;
const float ZDEPTH    = %(z)f;
const float DISSOLVE  = %(d)f;
const float DRIFT     = %(dr)f;
const float RISE      = %(ri)f;

void main()
{
    vec2  uv    = vUV.st;
    float depth = texture(sTD2DInputs[0], uv).r;
    float n1    = texture(sTD2DInputs[1], uv).r;
    float n2    = texture(sTD2DInputs[1], uv + vec2(0.37, 0.11)).r;
    float n3    = texture(sTD2DInputs[1], uv + vec2(0.71, 0.53)).r;

    vec3 pos = vec3((uv.x - 0.5) * WIDTH,
                    (uv.y - 0.5) * WIDTH / ASPECT,
                    depth * ZDEPTH);

    // disintegration mask: bright/near areas hold together longer, noise eats the rest
    float t    = n1 + (1.0 - depth) * 0.30 + (uv.x - 0.5) * 0.25;
    float mask = smoothstep(1.0 - DISSOLVE - 0.12, 1.0 - DISSOLVE + 0.12, t);

    vec3 dir = (vec3(n1, n2, n3) - 0.5) * 2.0;
    pos += dir * mask * DRIFT + vec3(0.0, mask * RISE, 0.0) * (0.5 + n2);

    // dust shrinks then vanishes
    float scale = mix(1.0, 0.55, mask) * (1.0 - smoothstep(0.88, 1.0, mask));
    fragColor = TDOutputSwizzle(vec4(pos, scale));
}
""" % dict(w=GRID_WIDTH, a=ASPECT, z=DEPTH_SCALE, d=DISSOLVE_AMOUNT,
           dr=DRIFT_DISTANCE, ri=DRIFT_RISE)

COL_GLSL = """
// build_col : input0 = video colour, input1 = raw noise, input2 = combined depth
out vec4 fragColor;
const float DISSOLVE = %(d)f;
const vec3  EMERALD  = vec3(%(e0)f, %(e1)f, %(e2)f);
const vec3  CYANC    = vec3(%(c0)f, %(c1)f, %(c2)f);

void main()
{
    vec2  uv    = vUV.st;
    vec3  col   = texture(sTD2DInputs[0], uv).rgb;
    float n1    = texture(sTD2DInputs[1], uv).r;
    float depth = texture(sTD2DInputs[2], uv).r;

    float t    = n1 + (1.0 - depth) * 0.30 + (uv.x - 0.5) * 0.25;
    float mask = smoothstep(1.0 - DISSOLVE - 0.12, 1.0 - DISSOLVE + 0.12, t);

    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3  base = mix(EMERALD * 0.55, CYANC, smoothstep(0.35, 1.0, luma)) * (0.25 + luma * 1.6);
    vec3  dust = CYANC * (1.2 + n1) ;                // emissive dust
    vec3  outc = mix(base, dust, mask);
    fragColor = TDOutputSwizzle(vec4(outc, 1.0));
}
""" % dict(d=DISSOLVE_AMOUNT, e0=EMERALD[0], e1=EMERALD[1], e2=EMERALD[2],
           c0=CYAN[0], c1=CYAN[1], c2=CYAN[2])

pos_code = mk(textDAT, 'glsl_pos_code', 4, ROW_A + 3)
pos_code.text = POS_GLSL
col_code = mk(textDAT, 'glsl_col_code', 4, ROW_A + 4)
col_code.text = COL_GLSL

build_pos = mk(glslTOP, 'build_pos', 4, ROW_A)
setp(build_pos, 'pixeldat', pos_code.name)
custom_res(build_pos, GRID_RES, GRID_RES)
setp(build_pos, 'format', 'rgba32float')
wire(combine_disp, build_pos, 0)
wire(noise_displace, build_pos, 1)

build_col = mk(glslTOP, 'build_col', 4, ROW_A + 2)
setp(build_col, 'pixeldat', col_code.name)
custom_res(build_col, GRID_RES, GRID_RES)
setp(build_col, 'format', 'rgba16float')
wire(color_res, build_col, 0)
wire(noise_displace, build_col, 1)
wire(combine_disp, build_col, 2)

null_disp = mk(nullTOP, 'null_disp', 5, ROW_A)
null_color = mk(nullTOP, 'null_color', 5, ROW_A + 2)
wire(build_pos, null_disp)
wire(build_col, null_color)

# =============================================================================
#  B. 3D INSTANCED POINT CLOUD (SOP / COMP / MAT)
# =============================================================================
ROW_B = 5
grid_base = mk(gridSOP, 'grid_base', 0, ROW_B)
setp(grid_base, 'rows', GRID_RES)
setp(grid_base, 'cols', GRID_RES)
setp(grid_base, 'sizex', GRID_WIDTH)
setp(grid_base, 'sizey', GRID_WIDTH / ASPECT)
setp(grid_base, 'surfacetype', 'points')       # reference lattice (see note below)
setp_any(grid_base, ('orient', 'plane'), 'xy')

mat_points = mk(constantMAT, 'mat_points', 1, ROW_B)
setp(mat_points, 'colorr', 1); setp(mat_points, 'colorg', 1); setp(mat_points, 'colorb', 1)
# additive, emissive particle blending
setp(mat_points, 'blending', 1)
setp(mat_points, 'srcblend', 'one')
setp(mat_points, 'destblend', 'one')
setp(mat_points, 'depthwriting', 0)
setp_any(mat_points, ('useinstancecolor', 'instancecolor'), 1)

geo_points = mk(geometryCOMP, 'geo_points', 2, ROW_B)
for c in list(geo_points.children):            # drop the default torus
    c.destroy()
unit_cube = geo_points.create(boxSOP, 'unit_cube')
setp(unit_cube, 'sizex', 1); setp(unit_cube, 'sizey', 1); setp(unit_cube, 'sizez', 1)
unit_cube.display = True
unit_cube.render = True
setp(geo_points, 'material', mat_points.path)
for ax in ('sx', 'sy', 'sz'):
    setp(geo_points, ax, POINT_SIZE)

# GPU instancing: one instance per pixel of the position TOP (GRID_RES x GRID_RES,
# i.e. exactly the lattice of grid_base). XY come from the grid UV, Z from depth.
setp(geo_points, 'instancing', 1)
setp(geo_points, 'instanceop', null_disp.path)
setp(geo_points, 'instancetx', 'r')
setp(geo_points, 'instancety', 'g')
setp(geo_points, 'instancetz', 'b')
for ax in ('instancesx', 'instancesy', 'instancesz'):
    setp(geo_points, ax, 'a')                  # alpha = dissolve scale
# instance colour sampled from null_color (parameter names vary a bit per build)
setp_any(geo_points, ('instancecolorop',), null_color.path)
setp_any(geo_points, ('instancecolorr', 'instancer'), 'r')
setp_any(geo_points, ('instancecolorg', 'instanceg'), 'g')
setp_any(geo_points, ('instancecolorb', 'instanceb'), 'b')

# =============================================================================
#  C. CHOP MODULATION RIG
# =============================================================================
ROW_C = 8


def lfo_branch(tag, cfg, row, phase):
    lfo = mk(lfoCHOP, 'lfo_cam_' + tag, 0, row)
    setp(lfo, 'wavetype', 'sin')
    setp(lfo, 'frequency', cfg['freq'])
    setp(lfo, 'amp', 1.0)
    setp(lfo, 'offset', 0.0)
    setp(lfo, 'phase', phase)
    setp(lfo, 'channelname', tag)
    m = mk(mathCHOP, 'math_cam_' + tag, 1, row)
    setp(m, 'fromrange1', -1.0); setp(m, 'fromrange2', 1.0)
    setp(m, 'torange1', cfg['lo']); setp(m, 'torange2', cfg['hi'])
    wire(lfo, m)
    return m


m_rx = lfo_branch('rx', CAM_PITCH, ROW_C, 0.00)
m_ry = lfo_branch('ry', CAM_YAW,   ROW_C + 1, 0.25)
m_tz = lfo_branch('tz', CAM_DIST,  ROW_C + 2, 0.60)

merge_cam = mk(mergeCHOP, 'merge_cam', 2, ROW_C + 1)
wire(m_rx, merge_cam, 0); wire(m_ry, merge_cam, 1); wire(m_tz, merge_cam, 2)

limit_cam = mk(limitCHOP, 'limit_cam', 3, ROW_C + 1)
setp(limit_cam, 'type', 'clamp')
setp(limit_cam, 'min', -45.0)
setp(limit_cam, 'max', 45.0)
wire(merge_cam, limit_cam)

lag_smooth = mk(lagCHOP, 'lag_smooth', 4, ROW_C + 1)
setp(lag_smooth, 'lag1', CAM_LAG_SECONDS)
setp(lag_smooth, 'lag2', CAM_LAG_SECONDS)
wire(limit_cam, lag_smooth)

null_cam_control = mk(nullCHOP, 'null_cam_control', 5, ROW_C + 1)
wire(lag_smooth, null_cam_control)

# =============================================================================
#  D. CAMERA, LIGHT-FREE RENDER
# =============================================================================
# A look-at camera ignores rx/ry, so orbit is done by a pivot null (cam_rig) that sits on
# the subject; cam1 is parented to it. rx/ry drive the rig, tz drives cam1's distance.
cam_rig = mk(nullCOMP, 'cam_rig', 6, ROW_C)
cam1 = mk(cameraCOMP, 'cam1', 7, ROW_C)
setp(cam1, 'parent', cam_rig.path)
setp(cam1, 'fov', CAM_FOV)
setp(cam1, 'near', 0.05)
setp(cam1, 'far', 60)
setp(cam1, 'tz', "op('null_cam_control')[2]", expr=True)            # distance
setp(cam_rig, 'rx', "op('null_cam_control')[0]", expr=True)         # pitch
setp(cam_rig, 'ry', "op('null_cam_control')[1]", expr=True)         # yaw
# aim the camera at the cloud's pivot (geo_points sits at the origin, so rig == target)
setp(cam_rig, 'tx', 0); setp(cam_rig, 'ty', 0); setp(cam_rig, 'tz', 0.3 * DEPTH_SCALE)

render1 = mk(renderTOP, 'render1', 8, ROW_C)
setp(render1, 'camera', cam1.path)
setp(render1, 'geometry', geo_points.path)
setp(render1, 'lights', '')
custom_res(render1, RENDER_RES[0], RENDER_RES[1])
setp(render1, 'bgcolorr', 0); setp(render1, 'bgcolorg', 0)
setp(render1, 'bgcolorb', 0); setp(render1, 'bgcolora', 1)
setp(render1, 'format', 'rgba16float')
setp(render1, 'antialias', 'aa4')
# depth buffer: kept on for the optional depth-based DoF (see DoF section)
setp_any(render1, ('depthbuffer', 'depthformat', 'rendersdepth'), 1)

# =============================================================================
#  E. POST-PROCESSING CHAIN
# =============================================================================
ROW_E = 12

# ---- trails: feedback loop  render + decay(blur(feedback))
feedback1 = mk(feedbackTOP, 'feedback1', 0, ROW_E)
wire(render1, feedback1)

fb_blur = mk(blurTOP, 'fb_blur', 1, ROW_E)
setp(fb_blur, 'size', FEEDBACK_BLUR)
wire(feedback1, fb_blur)

fb_level = mk(levelTOP, 'fb_level', 2, ROW_E)
setp(fb_level, 'brightness1', FEEDBACK_DECAY)
setp(fb_level, 'opacity', FEEDBACK_DECAY)
wire(fb_blur, fb_level)

comp_trails = mk(compositeTOP, 'comp_trails', 3, ROW_E)
setp(comp_trails, 'operand', 'add')
wire(render1, comp_trails, 0)
wire(fb_level, comp_trails, 1)
setp(feedback1, 'top', comp_trails.path)   # close the loop

# ---- depth of field : lumablur driven by a mask (white = blurred)
#  default mask = radial tilt/bokeh falloff; if your Render TOP exposes a depth buffer,
#  point dof_mask at a Render Select / Depth TOP instead.
dof_mask = mk(rampTOP, 'dof_mask', 3, ROW_E + 1)
setp(dof_mask, 'type', 'radial')
custom_res(dof_mask, RENDER_RES[0], RENDER_RES[1])

depth_of_field = mk(lumablurTOP, 'depth_of_field', 4, ROW_E)
setp_any(depth_of_field, ('size', 'blursize', 'filtersize'), DOF_BLUR_SIZE)
wire(comp_trails, depth_of_field, 0)
wire(dof_mask, depth_of_field, 1)

# ---- Matrix grade : crush shadows, tint emerald; cyan bloom on highlights
grade_level = mk(levelTOP, 'grade_level', 5, ROW_E)
setp(grade_level, 'blacklevel', GRADE_BLACK)
setp(grade_level, 'gamma1', 1.15)
setp(grade_level, 'contrast', 1.2)
wire(depth_of_field, grade_level)

const_emerald = mk(constantTOP, 'const_emerald', 5, ROW_E + 1)
setp(const_emerald, 'colorr', EMERALD[0]); setp(const_emerald, 'colorg', EMERALD[1])
setp(const_emerald, 'colorb', EMERALD[2]); setp(const_emerald, 'alpha', 1)
custom_res(const_emerald, RENDER_RES[0], RENDER_RES[1])

matrix_grade = mk(compositeTOP, 'matrix_grade', 6, ROW_E)
setp(matrix_grade, 'operand', 'multiply')
wire(grade_level, matrix_grade, 0)
wire(const_emerald, matrix_grade, 1)

bloom_blur = mk(blurTOP, 'bloom_blur', 6, ROW_E + 2)
setp(bloom_blur, 'size', BLOOM_BLUR_SIZE)
wire(depth_of_field, bloom_blur)

const_cyan = mk(constantTOP, 'const_cyan', 7, ROW_E + 2)
setp(const_cyan, 'colorr', CYAN[0] * BLOOM_GAIN); setp(const_cyan, 'colorg', CYAN[1] * BLOOM_GAIN)
setp(const_cyan, 'colorb', CYAN[2] * BLOOM_GAIN); setp(const_cyan, 'alpha', 1)
custom_res(const_cyan, RENDER_RES[0], RENDER_RES[1])

bloom_tint = mk(compositeTOP, 'bloom_tint', 7, ROW_E + 1)
setp(bloom_tint, 'operand', 'multiply')
wire(bloom_blur, bloom_tint, 0)
wire(const_cyan, bloom_tint, 1)

final_add = mk(compositeTOP, 'final_add', 8, ROW_E)
setp(final_add, 'operand', 'add')
wire(matrix_grade, final_add, 0)
wire(bloom_tint, final_add, 1)

OUT = mk(nullTOP, 'OUT', 9, ROW_E)
wire(final_add, OUT)
OUT.viewer = True          # display flag ON
OUT.current = True
try:
    OUT.par.display = True
except Exception:
    pass

# =============================================================================
#  SECTION LABELS
# =============================================================================
comment('A  VIDEO + DEPTH + NOISE  ->  position/colour textures', 0, -1)
comment('B  INSTANCED POINT CLOUD', 0, ROW_B - 1)
comment('C  CHOP CAMERA RIG', 0, ROW_C - 1)
comment('E  POST: trails / DoF / matrix grade / bloom', 0, ROW_E - 1)

# =============================================================================
#  REPORT
# =============================================================================
log('built %d nodes in %s' % (len(_created), PARENT_PATH))
if _warnings:
    log('%d parameter notes (version differences / things to set by hand):' % len(_warnings))
    for w in _warnings:
        log('  - ' + w)
else:
    log('no warnings')
log('view /project1/OUT. If the image is black, check video_in.par.file and play.')

"""
HOW TO RUN (2 steps)
--------------------
1. In TouchDesigner open the Textport (Alt+T / Dialogs > Textport and DATs), and set
   VIDEO_PATH at the top of this file to your clip.
2. Paste the whole script into the Textport and press Enter - or save it as
   build_matrix_pointcloud.py and run:
       exec(open('/full/path/build_matrix_pointcloud.py').read())
"""
