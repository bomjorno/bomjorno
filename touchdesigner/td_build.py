# ============================================================
#  EMERALD DUST — TouchDesigner project builder
#  Run once in TouchDesigner:  Textport (Alt+T)  ->  exec(open(r'<path>/td_build.py').read())
#  It creates /project1/emerald_dust with everything wired.
#  Then: select  movie_in  and put ANY video into its File parameter. Done.
# ============================================================
MOVIE_PATH = ''          # optional: path to a video; or set it later on movie_in
P1_GLSL = r"""// PASS 1: camera drift + dissolve into particles + emerald grade.
// Host provides: vec4 T0(vec2 uv) = source frame; float uTime, uBurst, uDissolve; vec2 uRes.
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<4;i++){s+=a*vn(p);p=p*2.03+7.1;a*=.5;}return s;}
vec2 curl(vec2 p){float e=.03;
  float a=fbm(p+vec2(0,e)),b=fbm(p-vec2(0,e)),c=fbm(p+vec2(e,0)),d=fbm(p-vec2(e,0));
  return vec2(a-b,-(c-d))/(2.*e);}
float lum(vec3 c){return dot(c,vec3(.299,.587,.114));}
vec3 pal(float L){
  vec3 c0=vec3(0.),c1=vec3(.008,.085,.05),c2=vec3(.10,.52,.29),c3=vec3(.52,.94,.64),c4=vec3(.92,1.,.88);
  vec3 c=mix(c0,c1,smoothstep(0.,.25,L));
  c=mix(c,c2,smoothstep(.25,.55,L));
  c=mix(c,c3,smoothstep(.55,.85,L));
  return mix(c,c4,smoothstep(.85,1.1,L));}
vec4 pass1(vec2 uv){
  float t=uTime, B=uBurst, D=clamp(uDissolve+B*.9,0.,1.2);
  // camera: slow push + roll + drift, kicked by bursts
  vec2 q=uv-.5;
  float z=1.07+.035*sin(t*.5)+.07*B;
  float r=.025*sin(t*.37)+.03*B*sin(t*9.);
  q=mat2(cos(r),-sin(r),sin(r),cos(r))*q/z;
  q+=vec2(.012*sin(t*.31),.01*cos(t*.43));
  vec2 cuv=clamp(q+.5,0.,1.);
  vec2 wind=normalize(vec2(-1.,.55));
  vec2 flow=curl(cuv*2.2+vec2(t*.15,-t*.1));
  vec3 base=T0(cuv).rgb;
  float L0=lum(base);
  // dissolve mask: bright areas rot first, driven by noise front
  float front=fbm(cuv*2.6+vec2(t*.12,t*.05))+L0*.38;
  float m=smoothstep(1.15-D*.9,1.15-D*.9+.22,front);
  // smeared streaks pulled from upstream
  vec3 sm=vec3(0.);float ws=0.;
  for(int k=0;k<7;k++){float f=float(k)/6.;
    vec2 o=(wind*.05+flow*.03)*D*f;
    float w=1.-f*.8;sm+=T0(clamp(cuv-o,0.,1.)).rgb*w;ws+=w;}
  sm/=ws;
  // discrete sparks
  vec2 cell=floor(cuv*uRes/2.);
  float hr=h21(cell+floor(t*14.));
  float hs=h21(cell*1.37+3.1);
  vec2 po=(wind*.06+flow*.05)*D*(hs+.3);
  vec3 ps=T0(clamp(cuv-po,0.,1.)).rgb;
  float spark=step(1.-.20*D,hr)*pow(lum(ps),1.4)*3.2;
  vec3 col=base*(1.-m*.88)+sm*m*.75+vec3(spark)*m;
  // emerald grade
  float L=lum(col);
  L=clamp((L-.04)*1.3,0.,1.2);L=pow(L,1.9);
  return vec4(pal(L)*.95,1.);}
"""
P2_GLSL = r"""// PASS 2: bloom + local exposure + DOF + chroma + vignette + grain.
// Host provides: vec4 S(vec2 uv, float lod) = pass-1 image at blur level lod; uTime, uBurst, uRes.
float g21(vec2 p){p=fract(p*vec2(443.897,441.423));p+=dot(p,p+19.19);return fract(p.x*p.y);}
vec4 pass2(vec2 uv){
  vec2 c=uv-.5;float rr=dot(c,c);
  float B=uBurst;
  vec2 ca=c*(.010+.02*B);
  float lod=rr*3.2+B*1.2;
  vec3 s=vec3(S(uv+ca,lod).r,S(uv,lod).g,S(uv-ca,lod).b);
  vec3 bloom=(S(uv,3.)*.34+S(uv,4.)*.30+S(uv,5.)*.24+S(uv,6.)*.18+S(uv,7.)*.12).rgb;
  float low=dot(S(uv,6.).rgb,vec3(.3,.59,.11));
  float expo=mix(.40,1.35,smoothstep(.01,.20,low));
  vec3 col=s*expo+bloom*(.85+.5*B);
  col*=smoothstep(.95,.18,sqrt(rr)*1.25);
  col*=1.-.5*smoothstep(.0,.9,rr*2.);
  col=1.-exp(-col*1.1);
  col+=(g21(uv*uRes+fract(uTime*7.))-.5)*.035*(.4+col);
  return vec4(max(col,0.),1.);}
"""
H1_GLSL = r"""layout(location = 0) out vec4 fragColor;
uniform float uTime; uniform float uBurst; uniform float uDissolve; uniform vec2 uRes;
vec4 T0(vec2 u){ return texture(sTD2DInputs[0], u); }
"""
M1_GLSL = r"""void main(){ fragColor = TDOutputSwizzle(pass1(vUV.st)); }
"""
H2_GLSL = r"""layout(location = 0) out vec4 fragColor;
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
M2_GLSL = r"""void main(){ fragColor = TDOutputSwizzle(pass2(vUV.st)); }
"""

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
