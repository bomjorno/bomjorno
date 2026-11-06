"""Generates td_build.py (shaders inlined) -> paste/exec once in TouchDesigner Textport to build the whole project."""
import pathlib
here = pathlib.Path(__file__).parent
p1 = (here / "shaders/pass1_dust_grade.glsl").read_text()
p2 = (here / "shaders/pass2_finish.glsl").read_text()

H1 = """layout(location = 0) out vec4 fragColor;
uniform float uTime; uniform float uBurst; uniform float uDissolve; uniform vec2 uRes;
vec4 T0(vec2 u){ return texture(sTD2DInputs[0], u); }
"""
M1 = "void main(){ fragColor = TDOutputSwizzle(pass1(vUV.st)); }\n"
H2 = """layout(location = 0) out vec4 fragColor;
uniform float uTime; uniform float uBurst; uniform float uDissolve; uniform vec2 uRes;
// inputs: 0 = sharp scene, 1..6 = Blur TOPs ~ mip levels 2..7 (blur size 4,8,16,32,64,128 px)
vec4 lv(int k, vec2 u){
  if(k<=0) return texture(sTD2DInputs[0],u);
  if(k==1) return texture(sTD2DInputs[1],u);
  if(k==2) return texture(sTD2DInputs[2],u);
  if(k==3) return texture(sTD2DInputs[3],u);
  if(k==4) return texture(sTD2DInputs[4],u);
  if(k==5) return texture(sTD2DInputs[5],u);
  return texture(sTD2DInputs[6],u);
}
vec4 S(vec2 u, float l){
  // lod 0 -> sharp, lod 2..7 -> inputs 1..6 (lod 1 blends sharp and input 1)
  float x = clamp(l - 1., 0., 6.);
  int k = int(floor(x)); float f = x - float(k);
  if(k>=6) return lv(6,u);
  return mix(lv(k,u), lv(k+1,u), f);
}
"""
M2 = "void main(){ fragColor = TDOutputSwizzle(pass2(vUV.st)); }\n"

build = r'''# ============================================================
#  EMERALD DUST — TouchDesigner project builder
#  Run once in TouchDesigner:  Textport (Alt+T)  ->  exec(open(r'<path>/td_build.py').read())
#  It creates /project1/emerald_dust with everything wired.
#  Then: select  movie_in  and put ANY video into its File parameter. Done.
# ============================================================
MOVIE_PATH = ''          # optional: path to a video; or set it later on movie_in
P1_GLSL = r"""@@P1@@"""
P2_GLSL = r"""@@P2@@"""
H1_GLSL = r"""@@H1@@"""
M1_GLSL = r"""@@M1@@"""
H2_GLSL = r"""@@H2@@"""
M2_GLSL = r"""@@M2@@"""

root = op('/project1')
old = root.op('emerald_dust')
if old: old.destroy()
c = root.create(baseCOMP, 'emerald_dust')

def top(t, name, x, y):
    n = c.create(t, name); n.nodeX, n.nodeY = x, y; return n
def chop(t, name, x, y):
    n = c.create(t, name); n.nodeX, n.nodeY = x, y; return n

# --- source ------------------------------------------------
mv = top(moviefileinTOP, 'movie_in', 0, 0)
if MOVIE_PATH: mv.par.file = MOVIE_PATH
mv.par.play = True
try: mv.par.extend = 'cycle'      # loop the clip
except Exception as e: print('movie loop param:', e)
fit = top(fitTOP, 'fit', 200, 0)
fit.par.outputresolution = 'custom'; fit.par.resolutionw = 1080; fit.par.resolutionh = 1080
fit.par.fit = 'fill'
fit.inputConnectors[0].connect(mv)

# --- drivers (CHOPs): burst from motion energy, dissolve from LFOs ----
cache = top(cacheTOP, 'prev_frame', 200, -200)
cache.par.cachesize = 2; cache.par.outputindex = 1
cache.inputConnectors[0].connect(fit)
diff = top(compositeTOP, 'diff', 400, -200)
diff.par.operand = 'difference'
diff.inputConnectors[0].connect(fit); diff.inputConnectors[0].connect(cache)
small = top(resolutionTOP, 'diff_small', 600, -200)
small.par.outputresolution = 'custom'; small.par.resolutionw = 48; small.par.resolutionh = 48
small.inputConnectors[0].connect(diff)
t2c = chop(toptoCHOP, 'diff_chop', 800, -200); t2c.par.top = small.path
ana = chop(analyzeCHOP, 'motion_avg', 1000, -200); ana.par.function = 'average'
ana.inputConnectors[0].connect(t2c)
ana2 = chop(analyzeCHOP, 'motion_avg2', 1200, -200); ana2.par.function = 'average'
ana2.inputConnectors[0].connect(ana)
mth = chop(mathCHOP, 'burst_gain', 1400, -200)
mth.par.gain = 7; mth.par.postoff = 0
mth.par.preoff = 0
try: mth.par.clamp1 = True; mth.par.clampmin = 0; mth.par.clampmax = 1   # burst stays 0..1
except Exception as e: print('clamp params:', e)
mth.inputConnectors[0].connect(ana2)
lag = chop(lagCHOP, 'burst_lag', 1600, -200)
lag.par.lag1 = 0.0; lag.par.lag2 = 0.45      # instant attack, ~0.5 s decay
lag.inputConnectors[0].connect(mth)
burst = chop(nullCHOP, 'burst', 1800, -200); burst.inputConnectors[0].connect(lag)

l1 = chop(lfoCHOP, 'lfo_slow', 1000, -400); l1.par.frequency = 0.175; l1.par.amp = 0.22; l1.par.offset = 0.30
l2 = chop(lfoCHOP, 'lfo_fast', 1000, -520); l2.par.frequency = 0.366; l2.par.amp = 0.12; l2.par.offset = 0
adds = chop(mathCHOP, 'dissolve_sum', 1400, -450); adds.par.combinechops = 'add'
adds.inputConnectors[0].connect(l1); adds.inputConnectors[0].connect(l2)
dis = chop(nullCHOP, 'dissolve', 1800, -450); dis.inputConnectors[0].connect(adds)

# --- pass 1 : camera drift + dissolve + emerald grade -------------------
def setup_glsl(n, body, header, main):
    d = c.create(textDAT, n.name + '_code'); d.nodeX, d.nodeY = n.nodeX, n.nodeY + 150
    d.text = header + body + '\n' + main
    n.par.pixeldat = d
    n.par.outputresolution = 'custom'; n.par.resolutionw = 1080; n.par.resolutionh = 1080
    for i, (nm, ex) in enumerate([('uTime', "absTime.seconds"),
                                  ('uBurst', "op('burst')[0]"),
                                  ('uDissolve', "op('dissolve')[0]")]):
        setattr(n.par, 'uniname%d' % i, nm)
        getattr(n.par, 'value%dx' % i).expr = ex
    n.par.uniname3 = 'uRes'
    n.par.value3x.expr = "me.width"; n.par.value3y.expr = "me.height"

g1 = top(glslTOP, 'pass1_dust_grade', 400, 0)
setup_glsl(g1, P1_GLSL, H1_GLSL, M1_GLSL)
g1.inputConnectors[0].connect(fit)

# --- pass 2 : bloom/exposure/DOF/CA/vignette/grain (needs blur pyramid) ----
blurs = []
for k, size in enumerate([4, 8, 16, 32, 64, 128]):
    b = top(blurTOP, 'blur_%d' % size, 600 + k * 0, 200 + k * -0)
    b.nodeX, b.nodeY = 600, 200 - k * 120
    b.par.size = size
    b.inputConnectors[0].connect(g1)
    blurs.append(b)
g2 = top(glslTOP, 'pass2_finish', 900, 0)
setup_glsl(g2, P2_GLSL, H2_GLSL, M2_GLSL)
g2.inputConnectors[0].connect(g1)
for b in blurs: g2.inputConnectors[0].connect(b)

out = top(nullTOP, 'OUT', 1200, 0); out.inputConnectors[0].connect(g2)
out.viewer = True

# --- optional recorder (set file path, flip 'record' on) ----------------
rec = top(moviefileoutTOP, 'record_mp4', 1400, 0)
rec.inputConnectors[0].connect(out)
try:
    rec.par.type = 'h264'
except Exception: pass

# default driver dissolve/burst preview on the network
c.viewer = True
print('emerald_dust built. Put your video into /project1/emerald_dust/movie_in -> File. View: OUT')
'''
build = (build.replace("@@P1@@", p1).replace("@@P2@@", p2)
         .replace("@@H1@@", H1).replace("@@M1@@", M1).replace("@@H2@@", H2).replace("@@M2@@", M2))
(here / "td_build.py").write_text(build)
print("td_build.py written", len(build), "bytes")
