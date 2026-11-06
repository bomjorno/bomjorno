(() => {
'use strict';
const $ = id => document.getElementById(id);
const setOut = (id, v) => { $(id).parentElement.querySelector('output').textContent = v; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
let AM = {};   // per-frame audio modulation of layer parameters
let tlDirty = true;
const MAX_DUR = 300, MAX_SIDE = 2560, TAU = Math.PI * 2, DEG = Math.PI / 180;
const stage = $('stage'), glc = $('gl'), view = $('view'), vctx = view.getContext('2d'), hud = $('hud'), hctx = hud.getContext('2d');

// ---------------------------------------------------------------- video + three.js
const video = document.createElement('video');
video.muted = true; video.playsInline = true; video.preload = 'auto';
let hasVideo = false, vdur = 0, tex = null;

const renderer = new THREE.WebGLRenderer({canvas: glc, antialias: false, alpha: false, preserveDrawingBuffer: true});
renderer.setClearColor(0x000000, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, 1, 1, 6000);
const group = new THREE.Group(); scene.add(group);
const W = 300;

const U = {
  uTex: {value: null}, uCell: {value: new THREE.Vector2(1, 1)}, uBg: {value: new THREE.Vector3()}, uThr: {value: 0.16},
  uBgOn: {value: 1}, uInvert: {value: 0},
  uTime: {value: 0}, uScatter: {value: 0}, uDepth: {value: 1}, uSize: {value: 1.1}, uWidth: {value: W / 2}, uHalfH: {value: 150},
  uPR: {value: 1}, uMode: {value: 1}, uWind: {value: 1}, uFloat: {value: 0.3}, uFloatN: {value: 1}, uLoop: {value: 1},
  uPulse: {value: 0}, uPulseN: {value: 3}, uWave: {value: 0}, uWaveT: {value: 0}, uWaveL: {value: 1.5}, uWaveN: {value: 1},
  uTurb: {value: 0}, uTurbN: {value: 1}, uDepthY: {value: 0}, uCloudA: {value: 1}, uP0: {value: new THREE.Vector3(0.2, 0.9, 1)}, uP1: {value: new THREE.Vector3(1, 0.3, 0.6)}, uMag: {value: 0}, uMagPol: {value: 1}, uMagR: {value: 60}, uMagPos: {value: new THREE.Vector3()},
  uScan: {value: 0}, uScanW: {value: 1}, uScanN: {value: 1},
};

const vs = `
attribute vec4 seed;
uniform sampler2D uTex; uniform vec2 uCell; uniform vec3 uBg; uniform float uThr, uBgOn, uInvert;
uniform float uCloudA; uniform float uTime,uScatter,uDepth,uSize,uWidth,uHalfH,uPR,uWind,uFloat,uFloatN,uLoop,uPulse,uPulseN,uWave,uWaveL,uWaveN,uTurb,uTurbN,uMag,uMagPol,uMagR,uScan,uScanW,uScanN;
uniform int uMode,uWaveT; uniform vec3 uMagPos, uP0, uP1; uniform float uDepthY;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 d = uCell*0.25;
  vec3 col = (texture2D(uTex, uv+d).rgb + texture2D(uTex, uv-d).rgb + texture2D(uTex, uv+vec2(d.x,-d.y)).rgb + texture2D(uTex, uv+vec2(-d.x,d.y)).rgb)*0.25;
  float lum = dot(col, vec3(0.299,0.587,0.114));
  bool kill = uBgOn > 0.5 ? distance(col, uBg) < uThr : lum < 0.03;
  if (kill) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vColor = vec3(0.0); vAlpha = 0.0; return; }
  vec3 p = position;
  float zl = uInvert > 0.5 ? 1.0-lum : lum;
  p.z = (zl - 0.5)*90.0*uDepth + (0.5 - uv.y)*uDepthY*60.0;
  float dep = clamp(zl + (0.5 - uv.y)*uDepthY*0.6, 0.0, 1.0);
  float ph = uTime*uLoop, k1 = 1.0 + floor(seed.y*2.0), pf = ph*uFloatN;
  p += vec3(sin(pf*k1 + seed.w*6.2831), cos(pf*(3.0-k1) + seed.z*6.2831), sin(pf + seed.x*6.2831)) * uFloat*uWidth*0.035*(0.4+seed.x);
  p.z += sin(pf + p.x*0.02 + p.y*0.015) * uFloat*uWidth*0.08;
  float r = length(p.xy) + 0.001;
  float pul = sin(ph*uPulseN - r/uWidth*3.5)*uPulse;
  p.xy += p.xy/r*pul*uWidth*0.07; p.z += pul*uWidth*0.12;
  float wv = uWaveT==0 ? sin(r/uWidth*uWaveL*6.2831 - ph*uWaveN)
           : uWaveT==1 ? sin(p.x/uWidth*uWaveL*3.1416 - ph*uWaveN)
           : uWaveT==2 ? sin(p.y/uWidth*uWaveL*3.1416 - ph*uWaveN)
           : 0.5*(sin(p.x/uWidth*uWaveL*3.1416 - ph*uWaveN) + sin(p.y/uWidth*uWaveL*3.1416 + ph*uWaveN));
  p.z += wv*uWave*uWidth*0.14;
  vec3 q = p/uWidth*2.0; float pt = ph*uTurbN;
  p += vec3(sin(q.y*3.1 + pt + seed.w*2.0), sin(q.x*2.3 + q.z*2.7 + pt*2.0), sin(q.x*3.3 - pt + seed.y*2.0))*uTurb*uWidth*0.07;
  vec3 dm = p - uMagPos; float fall = exp(-dot(dm.xy, dm.xy)/(uMagR*uMagR));
  if (uMagPol > 0.0) p += normalize(dm + vec3(0.0,0.0,0.01))*uMag*uMagR*0.8*fall + (seed.xyz-0.5)*fall*uMag*uWidth*0.12;
  else p -= dm*fall*uMag*0.85 - (seed.xyz-0.5)*fall*uMag*uWidth*0.05;
  float ys = mix(uHalfH*1.15, -uHalfH*1.15, fract(ph/6.2831*uScanN));
  float sb = exp(-pow((p.y - ys)/(uScanW*uHalfH*0.25 + 1.0), 2.0))*uScan;
  p.z += sb*uWidth*0.18;
  float u = clamp(p.x/uWidth*0.5+0.5, 0.0, 1.0);
  float f = clamp(uScatter*1.7 - (1.0-u)*0.7 - seed.x*0.45, 0.0, 1.0); f = f*f*(3.0-2.0*f);
  float t = uTime*0.7 + seed.w*6.2831;
  p += vec3((0.5+seed.y*1.8)*uWidth*1.7*uWind, sin(t + p.y*0.02)*uWidth*0.14 + (seed.z-0.5)*uWidth*0.3, (seed.x-0.5)*uWidth*1.1 + cos(t*1.3)*uWidth*0.1)*f;
  vec4 mv = modelViewMatrix*vec4(p,1.0);
  gl_Position = projectionMatrix*mv;
  gl_PointSize = uSize*uPR*(1100.0/-mv.z)*(1.0-f*0.35);
  if (uMode==0) vColor = col;
  else if (uMode==1) vColor = mix(vec3(0.16,0.2,0.32), vec3(1.0), pow(lum,0.8));
  else if (uMode==2) vColor = mix(vec3(0.02,0.18,0.3), vec3(0.6,1.0,1.0), lum);
  else if (uMode==3) vColor = mix(vec3(0.35,0.02,0.0), vec3(1.0,0.75,0.6), lum);
  else if (uMode==4) vColor = dep < 0.5 ? mix(vec3(0.03,0.08,0.45), vec3(0.75,0.15,0.65), dep*2.0) : mix(vec3(0.75,0.15,0.65), vec3(1.0,0.85,0.35), (dep-0.5)*2.0);
  else vColor = lum < 0.5 ? mix(uP0*0.12, uP0, lum*2.0) : mix(uP0, mix(uP1, vec3(1.0), 0.45), (lum-0.5)*2.0);
  vAlpha = (1.0 - f*0.5)*(0.55 + 0.45*lum);
  vColor = mix(vColor, vec3(0.55,1.0,1.0), clamp(sb,0.0,1.0)*0.8);
  vAlpha *= 1.0 + sb*1.5;
  vAlpha *= uCloudA;
}`;
const fs = `
varying vec3 vColor; varying float vAlpha;
void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; float a = smoothstep(0.5,0.0,d)*vAlpha; gl_FragColor = vec4(vColor*a, a); }`;
const material = new THREE.ShaderMaterial({uniforms: U, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});


// ---------------------------------------------------------------- GPU video pipeline: the clip itself is warped, re-coloured and re-printed in one shader
// VPD lists every shader parameter with its neutral value. Effects (see fx.js) only change these numbers.
const VPD = {zoom: 1, rot: 0, panx: 0, pany: 0, bulge: 0, warp: 0, warpF: 8, warpS: 1, self: 0, slice: 0, pix: 0, par: 0, camx: 0, camy: 0, ca: 0, glow: 0, edge: 0, mirror: 0, kseg: 6, duo: 0, post: 0, half: 0, dith: 0,
  grain: 0, scan: 0, vig: 0, bars: 0, fb: 0, fbz: 1, trans: 0, ttype: 0, exposure: 1, contrast: 1, sat: 1, flash: 0, vhs: 0, crt: 0, solar: 0, neg: 0, thermal: 0, night: 0, leak: 0, burn: 0, dust: 0, gtint: 0, ana: 0,
  rip: 0, ripT: 0, zb: 0, mb: 0, mba: 0, tilt: 0, sort: 0, led: 0, comic: 0, sketch: 0, hatch: 0, tone: 0, chrome: 0, streak: 0, hue: 0, gmap: 0, riso: 0, mosh: 0, tile: 1, vidA: 1};
const PNAMES = Object.keys(VPD), NVEC = Math.ceil(PNAMES.length / 4);
const pDefs = PNAMES.map((k, i) => `#define p_${k} uP[${i >> 2}].${'xyzw'[i & 3]}`).join('\n');
const VU = {uVid: {value: null}, uPrev: {value: null}, uFit: {value: new THREE.Vector2(1, 1)}, uOutAsp: {value: 1.78}, uRes: {value: new THREE.Vector2(1280, 720)}, uTime: {value: 0}, uPxS: {value: 1}, uCam: {value: new THREE.Vector2()},
  uP: {value: Array.from({length: NVEC}, () => new THREE.Vector4())}, uC0: {value: new THREE.Vector3()}, uC1: {value: new THREE.Vector3()}, uC2: {value: new THREE.Vector3()}, uC3: {value: new THREE.Vector3()}};
const VFS = `
varying vec2 vUv;
uniform sampler2D uVid, uPrev; uniform vec2 uFit, uRes, uCam; uniform float uOutAsp, uTime, uPxS;
uniform vec4 uP[${NVEC}]; uniform vec3 uC0, uC1, uC2, uC3;
${pDefs}
float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
vec3 tex(vec2 uv){ return texture2D(uVid, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 toVid(vec2 p){ vec2 q = vec2(p.x/uOutAsp, p.y) + 0.5; return (q - 0.5)/uFit + 0.5; }
float bayer4(vec2 q){ vec2 m = mod(q, 4.0); float x0 = mod(m.x, 2.0), x1 = floor(m.x/2.0), y0 = mod(m.y, 2.0), y1 = floor(m.y/2.0);
  return (abs(x0-y0)*8.0 + y0*4.0 + abs(x1-y1)*2.0 + y1)/16.0 + 0.03; }
vec3 heat(float t){ return t < 0.25 ? mix(vec3(0.0,0.0,0.12), vec3(0.3,0.0,0.7), t*4.0) : t < 0.5 ? mix(vec3(0.3,0.0,0.7), vec3(0.9,0.1,0.2), (t-0.25)*4.0) : t < 0.75 ? mix(vec3(0.9,0.1,0.2), vec3(1.0,0.8,0.0), (t-0.5)*4.0) : mix(vec3(1.0,0.8,0.0), vec3(1.0,1.0,0.92), (t-0.75)*4.0); }
vec3 chromeRamp(float t){ t = clamp(t, 0.0, 1.0); float m = clamp(t*0.75 + 0.14*sin(t*13.0) + 0.1, 0.0, 1.0);
  return m < 0.35 ? mix(vec3(0.03,0.05,0.14), vec3(0.32,0.46,0.74), m/0.35) : m < 0.7 ? mix(vec3(0.32,0.46,0.74), vec3(0.93,0.96,1.0), (m-0.35)/0.35) : mix(vec3(0.93,0.96,1.0), vec3(1.0,0.86,0.96), (m-0.7)/0.3); }
void main(){
  float tr = p_trans; int tt = int(p_ttype + 0.5);
  vec2 q = vUv; if (p_tile > 1.5) q = fract(q*floor(p_tile + 0.5));
  vec2 p = (q - 0.5)*vec2(uOutAsp, 1.0);
  p = rot2(p_rot)*p; p /= max(0.2, p_zoom); p += vec2(p_panx, p_pany);                  // camera
  if (tt == 2) p *= 1.0 - 0.1*tr;
  int mm = int(p_mirror + 0.5);                                                          // mirror, kaleidoscope
  if (mm == 1) p.x = abs(p.x); else if (mm == 2) p = abs(p);
  else if (mm == 3) { float a = atan(p.y, p.x), r = length(p), seg = 6.2831853/max(2.0, floor(p_kseg + 0.5)); a = abs(mod(a, seg) - seg*0.5); p = vec2(cos(a), sin(a))*r; }
  p *= 1.0 + (p_bulge + 0.12*p_crt)*dot(p, p);                                           // lens, CRT curvature
  if (p_rip > 0.0) { float r = length(p); p += normalize(p + vec2(0.0001))*sin(r*26.0 - p_ripT*12.0)*p_rip*0.045*exp(-r*1.4); }   // shock ring
  p += vec2(sin(p.y*p_warpF + uTime*p_warpS), cos(p.x*p_warpF*0.8 + uTime*p_warpS*1.3))*p_warp;   // wave warp
  float sl = p_slice + (tt == 3 ? 0.12*tr : 0.0);                                         // glitch slices
  if (sl > 0.001) { float tk = floor(uTime*10.0), band = floor(p.y*14.0 + 3.0*hash(tk)); float on = step(0.62, hash(band + tk*7.0)); p.x += (hash(band*3.1 + tk) - 0.5)*sl*2.0*on; }
  if (p_pix > 0.001) p = (floor(p/p_pix) + 0.5)*p_pix;                                    // mosaic
  vec2 vuv = toVid(p);
  if (tt == 1) vuv.x += 0.22*tr*tr;
  if (p_vhs > 0.0) { float y = vUv.y, rowj = (hash(floor(y*240.0) + floor(uTime*24.0)) - 0.5)*0.004;
    float tear = step(0.985, hash(floor(y*60.0) + floor(uTime*8.0)))*(hash(uTime) - 0.5)*0.09, head = (1.0 - smoothstep(0.0, 0.06, y))*(hash(y*100.0 + uTime*30.0) - 0.5)*0.1;
    vuv.x += (rowj + tear + head)*p_vhs; }
  if (p_self > 0.0) { float e = 0.004; vec2 g = vec2(lum(tex(vuv + vec2(e,0.0))) - lum(tex(vuv - vec2(e,0.0))), lum(tex(vuv + vec2(0.0,e))) - lum(tex(vuv - vec2(0.0,e)))); vuv += g*p_self*8.0; }   // picture bends by its own brightness
  if (p_par > 0.0) { float d = lum(tex(vuv)); vuv += uCam*(d - 0.5)*p_par; }              // brightness as depth: parallax
  vec2 dir = normalize(p + vec2(0.0001))*p_ca*(0.4 + length(p))*(tt == 3 ? 1.0 + 3.0*tr : 1.0) + vec2(0.0045*p_vhs, 0.0);
  float zb = p_zb + (tt == 2 ? tr : 0.0); vec2 mbv = vec2(cos(p_mba), sin(p_mba))*(p_mb + (tt == 1 ? 0.3*tr : 0.0));
  vec3 col;
  if (zb > 0.001 || length(mbv) > 0.001) { vec3 acc = vec3(0.0); for (int i = 0; i < 9; i++) { float k = float(i)/8.0 - 0.5; acc += tex(vuv + (vuv - 0.5)*k*0.12*zb + mbv*k*0.12); } col = acc/9.0; }
  else col = vec3(tex(vuv + dir).r, tex(vuv).g, tex(vuv - dir).b);
  if (p_ana > 0.0) { vec3 L = tex(vuv + vec2(p_ana*0.02, 0.0)), R = tex(vuv - vec2(p_ana*0.02, 0.0)); col = vec3(L.r, R.g, R.b); }   // red-cyan 3D
  col *= step(0.0, vuv.x)*step(vuv.x, 1.0)*step(0.0, vuv.y)*step(vuv.y, 1.0);
  if (p_tilt > 0.0) { float rr = smoothstep(0.12, 0.5, abs(vUv.y - 0.5))*p_tilt*0.012; vec3 a = col; for (int i = 0; i < 6; i++) { float an = float(i)*1.0472; a += tex(vuv + vec2(cos(an), sin(an))*rr); } col = a/7.0; }   // tilt-shift blur
  if (p_sort > 0.0) { vec3 best = col; for (int i = 1; i < 14; i++) { vec3 s = tex(vuv + vec2(0.0, float(i)*0.012*p_sort)); if (lum(s) > 0.42) best = max(best, s*(1.0 - float(i)/16.0)); } col = best; }   // bright streaks run down
  float ed = 0.0;
  if (p_edge > 0.0 || p_comic > 0.0 || p_sketch > 0.0) { float e = 0.0035; float a = lum(tex(vuv + vec2(-e,-e))), b = lum(tex(vuv + vec2(0.0,-e))), c = lum(tex(vuv + vec2(e,-e))), d = lum(tex(vuv + vec2(-e,0.0))), f = lum(tex(vuv + vec2(e,0.0))), g = lum(tex(vuv + vec2(-e,e))), h = lum(tex(vuv + vec2(0.0,e))), i = lum(tex(vuv + vec2(e,e)));
    float gx = (c + 2.0*f + i) - (a + 2.0*d + g), gy = (g + 2.0*h + i) - (a + 2.0*b + c); ed = length(vec2(gx, gy)); }
  if (p_edge > 0.0) col += uC2*smoothstep(0.08, 0.7, ed)*p_edge;                          // contour light, in the palette accent
  if (p_glow > 0.0) { vec3 bl = vec3(0.0); for (int i = 0; i < 8; i++) { float a = float(i)*0.785398; vec2 o = vec2(cos(a), sin(a))*0.012; bl += max(tex(vuv + o) - 0.55, 0.0) + 0.7*max(tex(vuv + o*2.4) - 0.55, 0.0); } col += bl/8.0*p_glow*1.3*mix(vec3(1.0), uC2*1.2, p_gtint); }   // bloom / halation
  if (p_streak > 0.0) { vec3 s = vec3(0.0); for (int i = -8; i <= 8; i++) { float k = float(i)/8.0; s += max(tex(vuv + vec2(k*0.2, 0.0)) - 0.68, 0.0)*(1.0 - abs(k)); } col += s/5.0*p_streak*mix(vec3(1.0), uC2*1.3, 0.65); }   // anamorphic flare
  col *= p_exposure; col = (col - 0.5)*p_contrast + 0.5; float l = lum(col); col = mix(vec3(l), col, p_sat);
  if (p_hue != 0.0) { float c = cos(p_hue), s = sin(p_hue); vec3 y = vec3(dot(col, vec3(0.299,0.587,0.114)), dot(col, vec3(0.596,-0.274,-0.322)), dot(col, vec3(0.211,-0.523,0.312)));
    float i2 = y.y*c - y.z*s, q2 = y.y*s + y.z*c; col = vec3(y.x + 0.956*i2 + 0.621*q2, y.x - 0.272*i2 - 0.647*q2, y.x - 1.106*i2 + 1.703*q2); }
  if (p_tone > 0.0) { float lt = lum(col); col *= mix(vec3(1.0) + (uC0 - 0.5)*p_tone*1.6, vec3(1.0) + (uC1 - 0.5)*p_tone*1.6, smoothstep(0.1, 0.9, lt)); }   // split tone
  if (p_gmap > 0.0) { float lg = lum(col); col = mix(col, lg < 0.5 ? mix(uC0, uC3, lg*2.0) : mix(uC3, uC1, (lg - 0.5)*2.0), p_gmap); }   // palette gradient map
  if (p_duo > 0.0) col = mix(col, mix(uC0, uC1, smoothstep(0.0, 1.0, lum(col))), p_duo);
  if (p_chrome > 0.0) col = mix(col, chromeRamp(lum(col))*mix(vec3(1.0), uC2*1.1 + 0.25, 0.18), p_chrome);   // Y2K chrome
  if (p_thermal > 0.0) col = mix(col, heat(clamp(lum(col)*1.1, 0.0, 1.0)), p_thermal);
  if (p_night > 0.0) col = mix(col, vec3(0.12, 1.0, 0.28)*pow(clamp(lum(col)*1.5, 0.0, 1.0), 0.8), p_night);
  if (p_solar > 0.0) col = mix(col, mix(col, 1.0 - col, step(0.5, col)), p_solar);
  if (p_neg > 0.0) col = mix(col, 1.0 - col, p_neg);
  if (p_post > 0.5) col = floor(col*p_post + 0.5)/p_post;
  if (p_comic > 0.0) { col = floor(col*4.0 + 0.5)/4.0; col *= 1.0 - smoothstep(0.1, 0.5, ed)*p_comic*0.9; col = mix(vec3(lum(col)), col, 1.25); }
  if (p_sketch > 0.0) { float ink = clamp(smoothstep(0.06, 0.4, ed) + (1.0 - lum(col))*0.28, 0.0, 1.0); col = mix(col, mix(uC1, uC0, ink), p_sketch); }
  if (p_hatch > 0.0) { float cs = 6.0*uPxS, dk = 1.0 - lum(col), ln1 = step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y)/cs)), ln2 = step(0.5, fract((gl_FragCoord.x - gl_FragCoord.y)/cs));
    float inkm = max(step(0.3, dk)*ln1, max(step(0.55, dk)*ln2, step(0.8, dk))); col = mix(col, mix(uC1, uC0, inkm), p_hatch); }
  if (p_half > 0.5) { float cs = p_half*uPxS; vec2 fc = gl_FragCoord.xy, cell = (floor(fc/cs) + 0.5)*cs, cp = (cell/uRes - 0.5)*vec2(uOutAsp, 1.0); vec3 cc = tex(toVid(cp));
    float rad = sqrt(clamp(1.0 - lum(cc)*1.08, 0.0, 1.0))*cs*0.74, m = smoothstep(rad + 0.9, rad - 0.9, length(fc - cell)); col = mix(uC1, mix(uC0, cc, 0.3), m); }   // halftone print
  if (p_riso > 0.5) { float cs = p_riso*uPxS; vec2 fc = gl_FragCoord.xy, mis = vec2(cs*0.35, cs*0.2); float a1 = 0.26, a2 = 1.31;
    vec2 g1 = rot2(a1)*fc, g2 = rot2(a2)*(fc + mis), c1 = (floor(g1/cs) + 0.5)*cs, c2 = (floor(g2/cs) + 0.5)*cs;
    vec3 s1 = tex(toVid((rot2(-a1)*c1/uRes - 0.5)*vec2(uOutAsp, 1.0))), s2 = tex(toVid(((rot2(-a2)*c2 - mis)/uRes - 0.5)*vec2(uOutAsp, 1.0)));
    float d1 = sqrt(clamp(1.0 - lum(s1), 0.0, 1.0))*cs*0.72, d2 = sqrt(clamp(1.1 - s2.g*1.1 - 0.1, 0.0, 1.0))*cs*0.72;
    float m1 = smoothstep(d1 + 0.9, d1 - 0.9, length(g1 - c1)), m2 = smoothstep(d2 + 0.9, d2 - 0.9, length(g2 - c2));
    col = uC1*mix(vec3(1.0), uC0, m1)*mix(vec3(1.0), uC2, m2*0.9); }                      // two-ink risograph, misregistered
  if (p_led > 0.5) { float cs = p_led*uPxS; vec2 fc = gl_FragCoord.xy, cell = (floor(fc/cs) + 0.5)*cs, cp = (cell/uRes - 0.5)*vec2(uOutAsp, 1.0); vec3 cc = tex(toVid(cp));
    col = cc*smoothstep(cs*0.46 + 0.8, cs*0.46 - 0.8, length(fc - cell))*1.2; }            // LED panel
  if (p_dith > 0.5) { float cs = p_dith*uPxS; col = mix(uC0, uC1, step(bayer4(floor(gl_FragCoord.xy/cs)), lum(col))); }
  if (p_fb > 0.0) { vec3 pv = texture2D(uPrev, (vUv - 0.5)/p_fbz + 0.5).rgb; col = max(col, pv*p_fb); }   // echo
  if (p_mosh > 0.0) { vec2 id = floor(gl_FragCoord.xy/(uPxS*48.0)); float h = hash2(id + floor(uTime*5.0));
    if (h < p_mosh*0.5) { vec2 mv = (vec2(hash2(id + 1.3), hash2(id + 7.1)) - 0.5)*0.06; col = mix(col, texture2D(uPrev, vUv + mv).rgb, 0.92); } }   // datamosh: blocks hold the previous frame
  if (p_leak > 0.0) { float t = uTime*0.35; vec2 u = vUv; float a = smoothstep(0.9, 0.0, length(u - vec2(0.15*sin(t), 0.35 + 0.25*cos(t*1.3)))), b = smoothstep(0.8, 0.0, length(u - vec2(1.0, 0.7 + 0.2*sin(t*0.8))));
    col += (uC2*a + mix(uC2, vec3(1.0, 0.9, 0.7), 0.5)*b*0.8)*p_leak*(0.6 + 0.4*sin(uTime*1.7)); }   // light leaks, tinted by the palette
  if (p_burn > 0.0) { float bp = pow(max(0.0, sin(uTime*1.3 + hash(floor(uTime*0.4))*6.0)), 6.0), mk = smoothstep(0.7, 0.0, vUv.x + 0.2*sin(vUv.y*6.0 + uTime)); col += mix(vec3(1.0, 0.5, 0.1), vec3(1.0, 0.92, 0.7), bp)*mk*bp*p_burn*1.2; }
  if (p_dust > 0.0) { float x0 = hash(floor(uTime*12.0)), scr = smoothstep(0.0015, 0.0, abs(vUv.x - x0))*step(0.6, hash(floor(uTime*12.0) + 3.0)), dst = step(0.9985, hash2(floor(vUv*vec2(uOutAsp*220.0, 220.0)) + floor(uTime*18.0)));
    col += (scr*0.5 + dst*0.8)*p_dust; col *= 1.0 - 0.06*p_dust*hash(floor(uTime*24.0)); }
  if (p_vhs > 0.0) { col = mix(col, vec3(lum(col)), 0.15*p_vhs) + (hash2(vec2(floor(gl_FragCoord.y/(2.0*uPxS)), floor(uTime*30.0))) - 0.5)*0.12*p_vhs; }
  col += (hash2(gl_FragCoord.xy + uTime*61.0) - 0.5)*p_grain*0.2;
  col *= 1.0 - p_scan*0.4*(0.5 - 0.5*sin(gl_FragCoord.y/uPxS*3.14159));
  if (p_crt > 0.0) { float m = mod(floor(gl_FragCoord.x/uPxS), 3.0); vec3 mk = vec3(m < 1.0 ? 1.0 : 0.62, abs(m - 1.0) < 0.5 ? 1.0 : 0.62, m > 1.5 ? 1.0 : 0.62); col *= mix(vec3(1.0), mk*1.25, p_crt*0.7); }
  col *= mix(1.0, smoothstep(1.15, 0.3, length((vUv - 0.5)*vec2(uOutAsp, 1.0))), p_vig);
  if (abs(vUv.y - 0.5) > 0.5 - p_bars) col = vec3(0.0);
  col += p_flash;
  gl_FragColor = vec4(max(col, 0.0)*p_vidA, 1.0);
}`;
const vidScene = new THREE.Scene(), blitScene = new THREE.Scene(), vidCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const VVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
vidScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({uniforms: VU, vertexShader: VVS, fragmentShader: VFS, depthTest: false, depthWrite: false})));
const blitMat = new THREE.ShaderMaterial({uniforms: {uTex: {value: null}}, vertexShader: VVS, fragmentShader: 'varying vec2 vUv; uniform sampler2D uTex; void main(){ gl_FragColor = vec4(texture2D(uTex, vUv).rgb, 1.0); }', depthTest: false, depthWrite: false});
blitScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blitMat));
let rtA = null, rtB = null;
function makeRTs(w, h){
  [rtA, rtB].forEach(r => r && r.dispose());
  const o = {minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false};
  rtA = new THREE.WebGLRenderTarget(w, h, o); rtB = new THREE.WebGLRenderTarget(w, h, o);
}
function renderGL(){
  if (!tex || !rtA) return;
  renderer.autoClear = false;
  VU.uPrev.value = rtB.texture; VU.uVid.value = tex;
  renderer.setRenderTarget(rtA); renderer.clear(); renderer.render(vidScene, vidCam);
  blitMat.uniforms.uTex.value = rtA.texture;
  renderer.setRenderTarget(null); renderer.clear(); renderer.render(blitScene, vidCam);
  if (LA.cloud > 0.01) renderer.render(scene, camera);      // the point cloud is a light-only accent on top of the processed video
  const t = rtA; rtA = rtB; rtB = t;                           // rtB now holds the newest frame for the echo
}
function pushParams(v){ PNAMES.forEach((k, i) => { VU.uP.value[i >> 2].setComponent(i & 3, v[k]); }); }

// ---------------------------------------------------------------- grid built from the video frame size
let points = null, gw = 0, gh = 0, count = 0, aspect = 16 / 9, gscale = 1;
let homeX = null, homeY = null, seeds = null;           // per grid cell
let lx = null, lcan = null, pix = null, lumA = null;    // CPU copy of the current frame at grid resolution
let bgRGB = [0, 0, 0], bgLum = 0;

function rng(seed){ let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function updateCpu(){
  if (!lx) return;
  lx.drawImage(video, 0, 0, gw, gh);
  pix = lx.getImageData(0, 0, gw, gh).data;
  for (let i = 0, n = gw * gh; i < n; i++) { const k = i * 4; lumA[i] = (0.299 * pix[k] + 0.587 * pix[k + 1] + 0.114 * pix[k + 2]) / 255; }
}
function estimateBg(){
  const cs = [[1, 1], [gw - 2, 1], [1, gh - 2], [gw - 2, gh - 2]]; let r = 0, g = 0, b = 0;
  cs.forEach(([x, y]) => { const k = (y * gw + x) * 4; r += pix[k]; g += pix[k + 1]; b += pix[k + 2]; });
  bgRGB = [r / 1020, g / 1020, b / 1020];
  bgLum = 0.299 * bgRGB[0] + 0.587 * bgRGB[1] + 0.114 * bgRGB[2];
  U.uBg.value.set(...bgRGB);
  applyBgUniforms();
}
function applyBgUniforms(){
  const on = $('bgRemove').checked;
  U.uBgOn.value = on ? 1 : 0; U.uThr.value = +$('bgThr').value;
  U.uInvert.value = on && bgLum > 0.5 ? 1 : 0;
}

function buildGrid(){
  if (!hasVideo) return;
  const N = +$('density').value, r = video.videoWidth / video.videoHeight; aspect = r;
  gw = Math.round(N * Math.sqrt(r)); gh = Math.round(N / Math.sqrt(r));
  gscale = W / Math.max(gw, gh);
  const n = gw * gh, pos = new Float32Array(n * 3), uvs = new Float32Array(n * 2), sd = new Float32Array(n * 4);
  homeX = new Float32Array(n); homeY = new Float32Array(n); seeds = sd;
  const R = rng(7);
  for (let j = 0, k = 0; j < gh; j++) for (let i = 0; i < gw; i++, k++) {
    const x = (i - gw / 2 + R() - 0.5) * gscale, y = -(j - gh / 2 + R() - 0.5) * gscale;
    pos[k * 3] = homeX[k] = x; pos[k * 3 + 1] = homeY[k] = y;
    uvs[k * 2] = (i + 0.5) / gw; uvs[k * 2 + 1] = 1 - (j + 0.5) / gh;
    sd[k * 4] = R(); sd[k * 4 + 1] = R(); sd[k * 4 + 2] = R(); sd[k * 4 + 3] = R();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('seed', new THREE.BufferAttribute(sd, 4));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), W * 3);   // points move far; never cull
  if (points) { group.remove(points); points.geometry.dispose(); }
  points = new THREE.Points(geo, material); points.frustumCulled = false; group.add(points);
  count = n;
  U.uCell.value.set(1 / gw, 1 / gh);
  U.uWidth.value = gw * gscale / 2; U.uHalfH.value = gh * gscale / 2;
  lcan = document.createElement('canvas'); lcan.width = gw; lcan.height = gh;
  lx = lcan.getContext('2d', {willReadFrequently: true}); lumA = new Float32Array(n);
  updateCpu(); estimateBg(); pickTracked(); fitCamera();
}

// ---------------------------------------------------------------- tracked points
let tracked = [], links = [], shuffleSeed = 1;
const isValid = i => { if (!pix) return false; const k = i * 4;
  return $('bgRemove').checked ? Math.hypot(pix[k] / 255 - bgRGB[0], pix[k + 1] / 255 - bgRGB[1], pix[k + 2] / 255 - bgRGB[2]) >= U.uThr.value : lumA[i] >= 0.03; };
const zOf = i => ((U.uInvert.value > 0.5 ? 1 - lumA[i] : lumA[i]) - 0.5) * 90;
const zFull = i => zOf(i) * U.uDepth.value + (((i / gw | 0) + 0.5) / gh - 0.5) * U.uDepthY.value * 60;
function pickTracked(){
  tracked = []; links = [];
  const crit = $('tPick').value, n = +$('tCount').value;
  $('pickColorRow').hidden = crit !== 'color';
  if (!count || !n || !pix) return;
  const R = rng(shuffleSeed * 977 + count), pool = [];
  for (let k = 0; k < 6000 && pool.length < 4000; k++) { const i = Math.floor(R() * count); if (isValid(i)) pool.push(i); }
  if (!pool.length) return;
  const hex = $('tPickColor').value, tr = parseInt(hex.slice(1, 3), 16) / 255, tg = parseInt(hex.slice(3, 5), 16) / 255, tb = parseInt(hex.slice(5, 7), 16) / 255;
  const L = (x, y) => lumA[clamp(y, 0, gh - 1) * gw + clamp(x, 0, gw - 1)];
  const score = i => { const x = i % gw, y = (i / gw) | 0;
    return crit === 'bright' ? lumA[i] : crit === 'dark' ? -lumA[i] : crit === 'near' ? zOf(i) : crit === 'far' ? -zOf(i)
      : crit === 'edge' ? Math.abs(L(x + 1, y) - L(x - 1, y)) + Math.abs(L(x, y + 1) - L(x, y - 1))
      : -Math.hypot(pix[i * 4] / 255 - tr, pix[i * 4 + 1] / 255 - tg, pix[i * 4 + 2] / 255 - tb); };
  let cand = pool;
  if (crit !== 'even') cand = pool.map(i => [i, score(i)]).sort((a, b) => b[1] - a[1]).slice(0, Math.max(n * 3, pool.length >> 3)).map(a => a[0]);
  const d2 = (a, b) => (homeX[a] - homeX[b]) ** 2 + (homeY[a] - homeY[b]) ** 2;
  tracked.push(cand[0]);
  const best = cand.map(c => d2(c, cand[0]));
  while (tracked.length < Math.min(n, cand.length)) {
    let bi = 0; for (let k = 1; k < cand.length; k++) if (best[k] > best[bi]) bi = k;
    const p = cand[bi]; tracked.push(p); cand.forEach((c, k) => { best[k] = Math.min(best[k], d2(c, p)); });
  }
  tracked.sort((a, b) => homeX[a] - homeX[b]);
  const mode = $('tLinks').value;
  if (mode === 'chain') for (let k = 1; k < tracked.length; k++) links.push([k - 1, k]);
  if (mode === 'net') { const seen = new Set();
    tracked.forEach((a, k) => tracked.map((b, m) => [m, d2(a, b)]).filter(([m]) => m !== k).sort((x, y) => x[1] - y[1]).slice(0, 2)
      .forEach(([m]) => { const key = Math.min(k, m) + '-' + Math.max(k, m); if (!seen.has(key)) { seen.add(key); links.push([k, m]); } })); }
}

// CPU mirror of the vertex shader, used only to place markers on the moving points
const sm = v => v * v * (3 - 2 * v);
function displaced(i, out){
  const hw = U.uWidth.value, t = U.uTime.value, ph = t * U.uLoop.value;
  let px = homeX[i], py = homeY[i], pz = zFull(i);
  const s0 = seeds[i * 4], s1 = seeds[i * 4 + 1], s2 = seeds[i * 4 + 2], s3 = seeds[i * 4 + 3];
  const k1 = 1 + Math.floor(s1 * 2), fa = U.uFloat.value * hw * 0.035 * (0.4 + s0), pf = ph * U.uFloatN.value;
  px += Math.sin(pf * k1 + s3 * TAU) * fa; py += Math.cos(pf * (3 - k1) + s2 * TAU) * fa; pz += Math.sin(pf + s0 * TAU) * fa;
  pz += Math.sin(pf + px * 0.02 + py * 0.015) * U.uFloat.value * hw * 0.08;
  const r = Math.hypot(px, py) + 0.001, pa = Math.sin(ph * U.uPulseN.value - r / hw * 3.5) * U.uPulse.value;
  px += px / r * pa * hw * 0.07; py += py / r * pa * hw * 0.07; pz += pa * hw * 0.12;
  const WT = U.uWaveT.value, WL = U.uWaveL.value, WN = U.uWaveN.value, PI = 3.1416;
  const wv = WT === 0 ? Math.sin(r / hw * WL * TAU - ph * WN) : WT === 1 ? Math.sin(px / hw * WL * PI - ph * WN) : WT === 2 ? Math.sin(py / hw * WL * PI - ph * WN)
    : 0.5 * (Math.sin(px / hw * WL * PI - ph * WN) + Math.sin(py / hw * WL * PI + ph * WN));
  pz += wv * U.uWave.value * hw * 0.14;
  const qx = px / hw * 2, qy = py / hw * 2, qz = pz / hw * 2, ta = U.uTurb.value * hw * 0.07, pt = ph * U.uTurbN.value;
  px += Math.sin(qy * 3.1 + pt + s3 * 2) * ta; py += Math.sin(qx * 2.3 + qz * 2.7 + pt * 2) * ta; pz += Math.sin(qx * 3.3 - pt + s1 * 2) * ta;
  const M = U.uMagPos.value, mr = U.uMagR.value, mg = U.uMag.value;
  const mx = px - M.x, my = py - M.y, mz = pz - M.z, fall = Math.exp(-(mx * mx + my * my) / (mr * mr));
  if (U.uMagPol.value > 0) { const mz2 = mz + 0.01, Ln = Math.hypot(mx, my, mz2) || 1, a = mg * mr * 0.8 * fall, b = fall * mg * hw * 0.12;
    px += mx / Ln * a + (s0 - 0.5) * b; py += my / Ln * a + (s1 - 0.5) * b; pz += mz2 / Ln * a + (s2 - 0.5) * b; }
  else { const a = fall * mg * 0.85, b = fall * mg * hw * 0.05; px -= mx * a - (s0 - 0.5) * b; py -= my * a - (s1 - 0.5) * b; pz -= mz * a - (s2 - 0.5) * b; }
  const HH = U.uHalfH.value, fr = (ph / TAU * U.uScanN.value) % 1, ys = HH * 1.15 - 2.3 * HH * fr;
  pz += Math.exp(-(((py - ys) / (U.uScanW.value * HH * 0.25 + 1)) ** 2)) * U.uScan.value * hw * 0.18;
  const u = clamp(px / hw * 0.5 + 0.5, 0, 1), f = sm(clamp(U.uScatter.value * 1.7 - (1 - u) * 0.7 - s0 * 0.45, 0, 1)), tt = t * 0.7 + s3 * TAU;
  px += (0.5 + s1 * 1.8) * hw * 1.7 * U.uWind.value * f;
  py += (Math.sin(tt + py * 0.02) * hw * 0.14 + (s2 - 0.5) * hw * 0.3) * f;
  pz += ((s0 - 0.5) * hw * 1.1 + Math.cos(tt * 1.3) * hw * 0.1) * f;
  return out.set(px, py, pz);
}


// ---------------------------------------------------------------- sizing
function fmtSize(){
  const v = $('format').value;
  if (v === 'src') {
    if (!hasVideo) return [1920, 1080];
    const s = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    return [Math.round(video.videoWidth * s / 2) * 2, Math.round(video.videoHeight * s / 2) * 2];
  }
  return v.split('x').map(Number);
}
let viewW = 1, viewH = 1, exporting = false;
function fitCamera(){
  const [fw, fh] = fmtSize(), asp = fw / fh; camera.aspect = asp;
  const tanH = Math.tan(17.5 * DEG), objW = W * 1.15 * Math.min(1, Math.max(aspect, 0.5)), objH = W * 1.15 / Math.max(aspect, 1);
  baseZ = Math.max(objW / (2 * tanH * asp), objH / (2 * tanH), 300) + 60;
  camera.position.set(0, 0, baseZ / zoom); camera.updateProjectionMatrix(); updateFit();
}
function setRenderSize(pw, ph){ renderer.setPixelRatio(1); renderer.setSize(pw, ph, false); U.uPR.value = ph / 900; makeRTs(pw, ph); VU.uRes.value.set(pw, ph); VU.uOutAsp.value = pw / ph; VU.uPxS.value = ph / 1080; updateFit(); }
function updateFit(){ const oa = VU.uOutAsp.value; VU.uFit.value.set(aspect > oa ? 1 : aspect / oa, aspect > oa ? oa / aspect : 1); }
function layoutStage(){
  const [fw, fh] = fmtSize(), wrap = $('stageWrap').getBoundingClientRect();
  const s = Math.min(Math.max(50, wrap.width - 32) / fw, Math.max(50, wrap.height - 32) / fh);
  viewW = Math.round(fw * s); viewH = Math.round(fh * s);
  stage.style.width = viewW + 'px'; stage.style.height = viewH + 'px';
  const dpr = Math.min(2, devicePixelRatio || 1);
  setRenderSize(viewW * dpr, viewH * dpr); hud.width = view.width = viewW * dpr; hud.height = view.height = viewH * dpr; fitCamera();
}
addEventListener('resize', () => { if (!exporting) layoutStage(); });



// ---------------------------------------------------------------- shared controls, clip window, cloud scene
const bindRange = (id, fmt, fn) => { const el = $(id), o = el.parentElement.querySelector('output');
  const upd = () => { if (o) o.textContent = fmt(+el.value); fn && fn(+el.value); }; el.addEventListener('input', upd); upd(); };
const f2 = v => v.toFixed(2);
const fmtT = v => v.toFixed(1) + ' с';
bindRange('density', v => v); $('density').addEventListener('change', () => buildGrid());
bindRange('bgThr', f2, applyBgUniforms); $('bgThr').addEventListener('change', () => pickTracked());
$('bgRemove').onchange = () => { applyBgUniforms(); pickTracked(); };
['tPick', 'tLinks'].forEach(id => $(id).onchange = () => pickTracked());
$('tPickColor').addEventListener('input', () => pickTracked());
$('format').onchange = () => layoutStage();

// camera of the point cloud (the video itself has its own camera inside the shader)
let rotY = 0, rotX = 0, zoom = 1, baseZ = 600;
const getDur = () => +$('dur').value, getStart = () => +$('tStart').value, getCycle = () => Math.max(0.5, Math.min(+$('cyc').value, getDur()));
bindRange('tStart', fmtT); bindRange('dur', fmtT); bindRange('cyc', fmtT);

// effects write these into the hidden controls that the layer code reads
const GDEF = {nDens: 100, nThr: 0.22, nShape: 'bracket', nMin: 6, nMax: 28, nStroke: 1.3, nLabels: false, lMode: 'delaunay', lDist: 16, lConf: 0.15, lOp: 0.5, lW: 1,
  dAlgo: 'atkinson', dPitch: 5, dThr: 0.5, dCon: 1.25, dPal: 'auto', dInv: false, dOp: 1, dBlend: 'source-over', cDir: 'down', cDens: 200, cLen: 35, cOp: 0.55,
  pLines: 120, pCon: 1.7, pDef: 55, pSingle: true, pW: 1.1, pAnim: 0.5, pVig: 0, pCol: '#ffffff', gCols: 110, gOp: 0.85, geoColor: 'auto', geoBlend: 'source-over', xAmt: 0.7,
  tCount: 0, tPick: 'even', tStyle: 'brackets', tSize: 6, tLabel: 'xyz', tLinks: 'chain', lAlpha: 0.35, tColor: 'white'};
const gcache = {};
function writeLegacy(W){
  let tracker = false;
  Object.keys(GDEF).forEach(k => {
    const v = k in W ? W[k] : GDEF[k]; if (gcache[k] === v) return; gcache[k] = v;
    const el = $(k); if (!el) return;
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
    if (k === 'tCount' || k === 'tPick' || k === 'tLinks') tracker = true;
  });
  if (tracker && pix) pickTracked();
}
// cloud uniforms, from the cloud effect's parameters plus the beat
const CLOUD0 = {depth: 1, size: 1, colorMode: 5, orbit: 0.4, pulse: 0, turb: 0, burst: 0, depthY: 0.3};
function applyCloud(t, c, A){
  const C = getCycle(), ph = TAU * t / C;
  U.uTime.value = t; U.uLoop.value = TAU / C; U.uMode.value = c.colorMode; U.uDepthY.value = c.depthY;
  U.uDepth.value = c.depth * (1 + A.B * 0.6); U.uSize.value = c.size + A.K * 0.8;
  U.uPulse.value = c.pulse + A.B * 0.5 * (c.pulse > 0 ? 1 : 0.4); U.uWave.value = A.M * 0.3 * (c.pulse > 0 ? 1 : 0.5); U.uTurb.value = c.turb + A.H * 0.4 * (c.turb > 0 ? 1 : 0.4);
  U.uScatter.value = A.K * c.burst; U.uFloat.value = 0.3; U.uWind.value = 1;
  group.rotation.y = rotY + Math.sin(ph) * 0.45 * c.orbit; group.rotation.x = rotX + Math.sin(ph * 2) * 0.08 * c.orbit;
  group.updateMatrixWorld(); camera.position.z = baseZ / (zoom * (1 + A.K * 0.035));
}

// ---------------------------------------------------------------- graphic layers (contours, nodes, links, dither, curtain, plotter lines)
const LA = {cloud: 0, nodes: 0, links: 0, dither: 0, curtain: 0, plot: 0, glyph: 0, glitch: 0};
const ly = k => LA[k] || 0;
bindRange('aGain', f2); bindRange('aBass', f2); bindRange('aMid', f2); bindRange('aHigh', f2); bindRange('aBeat', f2); bindRange('aScat', f2); bindRange('aFlash', f2);
const num = id => { const v = +$(id).value, f = AM[id]; return f ? f(v) : v; };
const PALETTES = {
  source: null, auto: [[63, 227, 242], [255, 77, 140]], cyan: [[63, 227, 242], [20, 120, 140]], solar: [[255, 190, 90], [255, 110, 40]], mono: [[240, 240, 240], [140, 140, 140]], violet: [[190, 150, 255], [110, 70, 220]],
};
const autoInks = () => [hexOf(mixc(PAL.dark, PAL.accent, 0.25)), PAL.lightHex];
const INKS = {cobalt: ['#1c36ff', '#ece8dc'], electric: ['#0a1cff', '#d8ff3a'], cyan: ['#0b8fa8', '#f4fbfb'], forest: ['#0f4a2c', '#eef0dc'], red: ['#e0261d', '#f3ece2'], mono: ['#0a0a0a', '#f2f2f2']};
const hex2rgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

let edgeA = null, gxA = null, gyA = null, edgeMax = 1;
function analyseEdges(){
  const n = gw * gh; if (!edgeA || edgeA.length !== n) { edgeA = new Float32Array(n); gxA = new Float32Array(n); gyA = new Float32Array(n); }
  let mx = 1e-6;
  for (let y = 1; y < gh - 1; y++) for (let x = 1; x < gw - 1; x++) {
    const i = y * gw + x, a = lumA[i - gw - 1], b = lumA[i - gw], c = lumA[i - gw + 1], d = lumA[i - 1], f = lumA[i + 1], g = lumA[i + gw - 1], h = lumA[i + gw], k = lumA[i + gw + 1];
    const sx = (c + 2 * f + k) - (a + 2 * d + g), sy = (g + 2 * h + k) - (a + 2 * b + c);
    gxA[i] = sx; gyA[i] = sy; const m = Math.hypot(sx, sy); edgeA[i] = m; if (m > mx) mx = m;
  }
  edgeMax = mx;
}
function videoRect(w, h){ let rw = w, rh = w / aspect; if (rh > h) { rh = h; rw = h * aspect; } return {x: (w - rw) / 2, y: (h - rh) / 2, w: rw, h: rh}; }
function geoRGB(i, lift){   // colour of a node / curtain strip
  const pal = PALETTES[$('geoColor').value];
  if (!pal) { const q = i * 4; return [Math.round(255 * (lift + (1 - lift) * pix[q] / 255)), Math.round(255 * (lift + (1 - lift) * pix[q + 1] / 255)), Math.round(255 * (lift + (1 - lift) * pix[q + 2] / 255))]; }
  return pal[0];
}

// nodes: strongest contour pixel per cell, so the set is stable from frame to frame
function pickNodes(){
  const N = num('nDens'), cs = Math.max(2, Math.round(Math.sqrt(gw * gh / N))), thr = num('nThr') * edgeMax, out = [];
  for (let cy = 0; cy < gh; cy += cs) for (let cx = 0; cx < gw; cx += cs) {
    let bi = -1, bm = thr;
    for (let y = cy; y < Math.min(gh - 1, cy + cs); y++) for (let x = cx; x < Math.min(gw - 1, cx + cs); x++) { const m = edgeA[y * gw + x]; if (m > bm) { bm = m; bi = y * gw + x; } }
    if (bi >= 0) out.push({i: bi, x: bi % gw, y: (bi / gw) | 0, m: bm / edgeMax, ang: Math.atan2(gyA[bi], gxA[bi]) + Math.PI / 2});
  }
  out.sort((a, b) => b.m - a.m);
  out.forEach((o, r) => { o.rank = r / Math.max(1, out.length - 1); });
  return out;
}
function delaunayEdges(P){
  const n = P.length; if (n < 3) return [];
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; P.forEach(([x, y]) => { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); });
  const dm = Math.max(x1 - x0, y1 - y0) || 1, mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  const V = P.concat([[mx - 20 * dm, my - dm], [mx, my + 20 * dm], [mx + 20 * dm, my - dm]]);
  const circ = (a, b, c) => { const [ax, ay] = V[a], [bx, by] = V[b], [cx, cy] = V[c], d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by)) || 1e-9;
    const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
    const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d; return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2]; };
  let tris = [{v: [n, n + 1, n + 2], c: circ(n, n + 1, n + 2)}];
  for (let i = 0; i < n; i++) {
    const [px, py] = V[i], bad = new Set(), cnt = new Map();
    for (const t of tris) if ((px - t.c[0]) ** 2 + (py - t.c[1]) ** 2 < t.c[2]) bad.add(t);
    for (const t of bad) for (let e = 0; e < 3; e++) { const a = t.v[e], b = t.v[(e + 1) % 3], k = Math.min(a, b) * 65536 + Math.max(a, b); cnt.set(k, (cnt.get(k) || 0) + 1); }
    tris = tris.filter(t => !bad.has(t));
    for (const [k, c] of cnt) if (c === 1) { const a = Math.floor(k / 65536), b = k % 65536; tris.push({v: [a, b, i], c: circ(a, b, i)}); }
  }
  const seen = new Set(), E = [];
  for (const t of tris) for (let e = 0; e < 3; e++) { const a = t.v[e], b = t.v[(e + 1) % 3]; if (a >= n || b >= n) continue; const k = Math.min(a, b) * 65536 + Math.max(a, b); if (!seen.has(k)) { seen.add(k); E.push([a, b]); } }
  return E;
}
function drawShape(ctx, kind, x, y, r, ang){
  ctx.beginPath();
  if (kind === 'circle') ctx.arc(x, y, r, 0, TAU);
  else if (kind === 'square') { ctx.save(); ctx.translate(x, y); ctx.rotate(ang); ctx.rect(-r, -r, 2 * r, 2 * r); ctx.restore(); }
  else if (kind === 'diamond') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
  else if (kind === 'cross') { ctx.moveTo(x - r, y); ctx.lineTo(x + r, y); ctx.moveTo(x, y - r); ctx.lineTo(x, y + r); }
  else { const c = r * 0.55, ca = Math.cos(ang), sa = Math.sin(ang), P = (u, v) => [x + u * ca - v * sa, y + u * sa + v * ca];
    const seg = (a, b, c2) => { ctx.moveTo(...P(a, b)); ctx.lineTo(...P(-r * Math.sign(a) || -r, -r * Math.sign(b))); };
    [[-1, -1], [1, 1]].forEach(([sx, sy]) => { ctx.moveTo(...P(sx * r, sy * (r - c))); ctx.lineTo(...P(sx * r, sy * r)); ctx.lineTo(...P(sx * (r - c), sy * r)); }); }
  ctx.stroke();
}
function dither(ctx, vr, w, h, alpha){
  const k = Math.min(w, h) / 1080, pitch = Math.max(1, num('dPitch') * k);
  let bw = Math.max(8, Math.round(vr.w / pitch)), bh = Math.max(8, Math.round(vr.h / pitch));
  const cap = 700000; if (bw * bh > cap) { const f = Math.sqrt(cap / (bw * bh)); bw = Math.round(bw * f); bh = Math.round(bh * f); }
  if (!dither.c) { dither.c = document.createElement('canvas'); dither.x = dither.c.getContext('2d', {willReadFrequently: true}); }
  const c = dither.c, x = dither.x; c.width = bw; c.height = bh; x.drawImage(video, 0, 0, bw, bh);
  const img = x.getImageData(0, 0, bw, bh), d = img.data, L = new Float32Array(bw * bh), con = num('dCon'), thr = num('dThr');
  for (let i = 0; i < bw * bh; i++) L[i] = clamp(((0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) / 255 - 0.5) * con + 0.5, 0, 1);
  const algo = $('dAlgo').value, B = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5], bits = new Uint8Array(bw * bh);
  const diffuse = (list, div) => { for (let y = 0; y < bh; y++) for (let xx = 0; xx < bw; xx++) { const i = y * bw + xx, o = L[i] < thr ? 0 : 1; bits[i] = o; const e = L[i] - o;
    for (const [dx, dy, wt] of list) { const X = xx + dx, Y = y + dy; if (X >= 0 && X < bw && Y < bh) L[Y * bw + X] += e * wt / div; } } };
  if (algo === 'atkinson') diffuse([[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]], 8);
  else if (algo === 'fs') diffuse([[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]], 16);
  else for (let y = 0; y < bh; y++) for (let xx = 0; xx < bw; xx++) { const i = y * bw + xx;
    const t = algo === 'bayer' ? (B[(y & 3) * 4 + (xx & 3)] + 0.5) / 16 : (52.9829189 * ((0.06711056 * xx + 0.00583715 * y) % 1)) % 1;
    bits[i] = L[i] + (thr - 0.5) > t ? 1 : 0; }
  const [inkH, paperH] = $('dPal').value === 'auto' ? autoInks() : INKS[$('dPal').value], ink = hex2rgb(inkH), paper = hex2rgb(paperH), inv = $('dInv').checked;
  for (let i = 0; i < bw * bh; i++) { const col = (bits[i] ^ (inv ? 1 : 0)) ? paper : ink; d[i * 4] = col[0]; d[i * 4 + 1] = col[1]; d[i * 4 + 2] = col[2]; d[i * 4 + 3] = 255; }
  x.putImageData(img, 0, 0);
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.globalAlpha = num('dOp') * alpha; ctx.globalCompositeOperation = $('dBlend').value;
  ctx.drawImage(c, vr.x, vr.y, vr.w, vr.h); ctx.restore();
}
function curtain(ctx, vr, k){
  const cols = Math.round(num('cDens')), dir = $('cDir').value, len = num('cLen') / 100 * vr.h, step = gw / cols, cw = vr.w / cols;
  for (let c = 0; c < cols; c++) {
    const x0 = Math.floor(c * step), x1 = Math.min(gw - 2, Math.max(x0 + 1, Math.floor((c + 1) * step)));
    let bi = -1, bm = 0.04 * edgeMax;
    for (let x = x0; x < x1; x++) for (let y = 1; y < gh - 1; y++) { const m = edgeA[y * gw + x]; if (m > bm) { bm = m; bi = y * gw + x; } }
    if (bi < 0) continue;
    const [r, g, b] = geoRGB(bi, 0.1), sx = vr.x + c * cw, sy = vr.y + ((bi / gw | 0) + 0.5) / gh * vr.h, a = num('cOp') * Math.min(1, 0.4 + bm / edgeMax);
    const dirs = dir === 'both' ? [1, -1] : [dir === 'down' ? 1 : -1];
    for (const dd of dirs) { const y2 = sy + dd * len, gr = ctx.createLinearGradient(0, sy, 0, y2); gr.addColorStop(0, `rgba(${r},${g},${b},${a})`); gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
      ctx.fillStyle = gr; ctx.fillRect(sx, Math.min(sy, y2), Math.max(1, cw - 0.5 * k), Math.abs(y2 - sy)); }
  }
}
function plotter(ctx, vr, k, t){
  const L = Math.round(num('pLines')), P = Math.round(40 + num('pDef') * 8), con = num('pCon'), single = $('pSingle').checked, vig = num('pVig'), rowH = vr.h / L;
  const amp = rowH * 1.1, ph0 = t * num('pAnim') * 2;
  ctx.strokeStyle = $('pCol').value; ctx.lineWidth = Math.max(0.5, num('pW') * k); ctx.lineJoin = 'round'; ctx.beginPath();
  for (let l = 0; l < L; l++) {
    const yn = (l + 0.5) / L, ltr = !single || l % 2 === 0; let phase = l * 1.7 + ph0, first = true;
    for (let j = 0; j <= P; j++) {
      const u = ltr ? j / P : 1 - j / P, gxp = clamp(Math.round(u * (gw - 1)), 0, gw - 1), gyp = clamp(Math.round(yn * (gh - 1)), 0, gh - 1);
      let dark = 1 - lumA[gyp * gw + gxp]; dark = clamp((dark - 0.5) * con + 0.5, 0, 1);
      if (vig > 0) { const dx = u - 0.5, dy = yn - 0.5, r = Math.sqrt(dx * dx + dy * dy) * 1.6; dark *= clamp(1 - vig * Math.pow(r, 2.2) * 2, 0, 1); }
      phase += (0.15 + dark * 1.9) * (ltr ? 1 : -1) * (TAU / P) * 8;
      const px = vr.x + u * vr.w, py = vr.y + yn * vr.h + Math.sin(phase) * amp * dark;
      if (first && !(single && l > 0)) { ctx.moveTo(px, py); first = false; } else { ctx.lineTo(px, py); first = false; }
    }
  }
  ctx.stroke();
}
function glyphs(ctx, vr, k, a){
  const cols = Math.round(num('gCols')), cw = vr.w / cols, rows = Math.max(4, Math.round(vr.h / (cw * 1.8))), ch = vr.h / rows, ramp = [' ', '.', ':', '-', '=', '+', '*', '#', '%', '@'], bgOn = $('bgRemove').checked;
  ctx.font = `${Math.max(6, Math.round(ch * 1.05))}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const kick = AV.on ? AV.K : 0;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const gx = Math.min(gw - 1, Math.floor((c + 0.5) / cols * gw)), gy = Math.min(gh - 1, Math.floor((r + 0.5) / rows * gh)), i = gy * gw + gx, l = lumA[i];
    if (l < 0.1 || (bgOn && !isValid(i))) continue;
    const idx = Math.min(9, Math.floor(clamp(l * (1.05 + kick * 0.4), 0, 0.999) * 10)), [R, G, B] = geoRGB(i, 0.3);
    ctx.fillStyle = `rgba(${R},${G},${B},${(a * num('gOp') * (0.35 + 0.65 * l)).toFixed(3)})`;
    ctx.fillText(ramp[idx], vr.x + (c + 0.5) * cw, vr.y + (r + 0.5) * ch);
  }
  ctx.textAlign = 'start';
}
function glitch(ctx, w, h, a){
  const strength = num('xAmt') * a * (AV.on ? 0.1 + AV.K * 1.4 : 0.4 + 0.4 * Math.sin(U.uTime.value * 6));
  if (strength < 0.06) return;
  if (!glitch.c) { glitch.c = document.createElement('canvas'); glitch.x = glitch.c.getContext('2d'); }
  const c = glitch.c; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  glitch.x.clearRect(0, 0, w, h); glitch.x.drawImage(ctx.canvas, 0, 0, w, h);
  const R = rng(AV.on ? AV.beatIdx * 13 + Math.floor(AV.beatPh * 4) : Math.floor(U.uTime.value * 8)), n = 2 + Math.floor(strength * 9);
  ctx.save(); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  for (let i = 0; i < n; i++) { const y = R() * h, hh = (0.01 + R() * 0.07) * h, dx = (R() - 0.5) * w * 0.14 * Math.min(1.5, strength); ctx.drawImage(c, 0, y, w, hh, dx, y, w, hh); }
  ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(0.4, 0.22 * strength); ctx.drawImage(c, strength * w * 0.007, 0); ctx.drawImage(c, -strength * w * 0.007, 0);
  ctx.restore();
}
function drawLayers(ctx, w, h){
  const vr = videoRect(w, h), k = Math.min(w, h) / 1080, t = U.uTime.value, on = n => ly(n) > 0.01;
  ctx.save();
  if (on('dither')) dither(ctx, vr, w, h, ly('dither'));
  const geo = on('nodes') || on('links') || on('curtain');
  if (geo || on('plot') || on('glyph')) ctx.globalCompositeOperation = $('geoBlend').value;
  if (geo) analyseEdges();
  if (on('curtain')) { ctx.globalAlpha = ly('curtain'); curtain(ctx, vr, k); ctx.globalAlpha = 1; }
  if (on('plot')) { ctx.globalAlpha = ly('plot'); plotter(ctx, vr, k, t); ctx.globalAlpha = 1; }
  if (on('glyph')) glyphs(ctx, vr, k, ly('glyph'));
  if (on('nodes') || on('links')) {
    const nodes = pickNodes(), at = n => [vr.x + (n.x + 0.5) / gw * vr.w, vr.y + (n.y + 0.5) / gh * vr.h];
    if (on('links') && nodes.length > 1) {
      ctx.globalAlpha = ly('links');
      const maxD = num('lDist') / 100 * vr.w, conf = num('lConf'), mode = $('lMode').value, S = new Map();
      const add = (a, b) => { const key = Math.min(a, b) * 65536 + Math.max(a, b); if (!S.has(key)) S.set(key, [a, b]); };
      const P = nodes.map(at), dist = (a, b) => Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]);
      if (mode === 'delaunay' || mode === 'hybrid') delaunayEdges(P).forEach(([a, b]) => add(a, b));
      if (mode === 'proximity') nodes.forEach((_, a) => nodes.map((__, b) => [b, dist(a, b)]).filter(([b, d]) => b !== a && d < maxD).sort((x, y) => x[1] - y[1]).slice(0, 3).forEach(([b]) => add(a, b)));
      if (mode === 'chain') { const used = new Set([0]); let cur = 0; for (let s2 = 1; s2 < nodes.length; s2++) { let bi = -1, bd = 1e9; for (let b = 0; b < nodes.length; b++) if (!used.has(b)) { const d = dist(cur, b); if (d < bd) { bd = d; bi = b; } } if (bi < 0) break; if (bd < maxD * 1.5) add(cur, bi); used.add(bi); cur = bi; } }
      if (mode === 'radial' || mode === 'hybrid') nodes.forEach((_, b) => { if (b && dist(0, b) < maxD * 1.6) add(0, b); });
      ctx.lineWidth = Math.max(0.4, num('lW') * k);
      for (const [a, b] of S.values()) {
        const d = dist(a, b); if (d > maxD * (mode === 'radial' ? 1.6 : 1) && mode !== 'chain') continue;
        const str = (nodes[a].m + nodes[b].m) / 2; if (str < conf) continue;
        const [r, g, bl] = geoRGB(nodes[a].i, 0.35); ctx.strokeStyle = `rgba(${r},${g},${bl},${(num('lOp') * (1 - d / (maxD * 1.7)) * Math.min(1, 0.4 + str)).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(...P[a]); ctx.lineTo(...P[b]); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (on('nodes')) {
      ctx.globalAlpha = ly('nodes');
      const mn = num('nMin') * k, mxs = num('nMax') * k, sh = $('nShape').value, kinds = ['bracket', 'circle', 'square', 'diamond', 'cross'];
      ctx.lineWidth = Math.max(0.5, num('nStroke') * k); ctx.font = `${Math.round(9 * k)}px ui-monospace, Menlo, monospace`; ctx.textBaseline = 'middle';
      nodes.forEach((n, idx) => {
        const [x, y] = at(n), tier = n.rank < 0.06 ? 1 : n.rank < 0.35 ? 0.5 : 0, size = mn + (mxs - mn) * (tier * 0.8 + n.m * 0.2);
        const [r, g, b] = geoRGB(n.i, 0.35); ctx.strokeStyle = ctx.fillStyle = `rgb(${r},${g},${b})`;
        drawShape(ctx, sh === 'mixed' ? kinds[(n.x * 7 + n.y * 13) % kinds.length] : sh, x, y, size / 2, n.ang);
        if (tier === 1) { ctx.beginPath(); ctx.arc(x, y, Math.max(1, 1.2 * k), 0, TAU); ctx.fill(); }
        if ($('nLabels').checked && tier > 0) ctx.fillText(`${String(idx + 1).padStart(3, '0')} ${(n.x / gw).toFixed(2)} ${(n.y / gh).toFixed(2)}`, x + size / 2 + 4 * k, y - size / 2);
      });
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
  if (on('glitch')) glitch(ctx, w, h, ly('glitch'));
}
function composeFrame(ctx, w, h){
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(glc, 0, 0, w, h);       // video (processed in the shader) + point cloud
  drawLayers(ctx, w, h);
  if (AV.on && num('aFlash') > 0 && AV.K > 0.05) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; const c = (PALETTES.auto || PALETTES.cyan)[0]; ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${Math.min(0.3, AV.K * 0.2 * num('aFlash'))})`; ctx.fillRect(0, 0, w, h); ctx.restore(); }
}



// ---------------------------------------------------------------- audio: decode the clip's track, find bands, hits, tempo, bars, sections
const AH = 100;                           // analysis rate, values per second
let AU = null, audioBuf = null;
const AV = {on: false, bass: 0, mid: 0, high: 0, kick: 0, hat: 0, vox: 0, beatIdx: 0, beatPh: 0, beatInBar: 0, bar: 0, bpm: 0, K: 0, B: 0, M: 0, H: 0};
async function analyseAudio(file){
  AU = null; audioBuf = null;
  let buf;
  try { const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext; buf = await new Ctx(2, 1, 48000).decodeAudioData(await file.arrayBuffer()); }
  catch (e) { return false; }                         // no audio track, or the browser cannot decode it
  if (!buf || buf.length < 4800) return false;
  audioBuf = buf; await tick();
  const sr = buf.sampleRate, ch = buf.numberOfChannels, dec = Math.max(1, Math.round(sr / 12000)), sr2 = sr / dec, m = Math.floor(buf.length / dec);
  const c0 = buf.getChannelData(0), c1 = ch > 1 ? buf.getChannelData(1) : c0, x = new Float32Array(m);
  for (let i = 0; i < m; i++) { let a = 0; const o = i * dec; for (let k = 0; k < dec; k++) a += c0[o + k] + c1[o + k]; x[i] = a / (2 * dec); }
  const hop = Math.max(1, Math.round(sr2 / AH)), F = Math.floor(m / hop);
  if (F < 100) return false;
  const lp = fc => { const a = Math.exp(-TAU * fc / sr2); let y = 0; return v => (y = (1 - a) * v + a * y); };
  const l1 = lp(150), l2 = lp(150), l3 = lp(300), l4 = lp(3000);
  const E = [0, 1, 2, 3].map(() => new Float32Array(F)), acc = [0, 0, 0, 0]; let cnt = 0, f = 0;
  for (let i = 0; i < m && f < F; i++) {
    const v = x[i], b = l2(l1(v)), lo3 = l4(v), mid = lo3 - l3(v), hi = v - lo3;
    acc[0] += b * b; acc[1] += mid * mid; acc[2] += hi * hi; acc[3] += v * v;
    if (++cnt === hop) { for (let j = 0; j < 4; j++) { E[j][f] = Math.sqrt(acc[j] / hop); acc[j] = 0; } cnt = 0; f++; }
  }
  const q = (a, p) => Float32Array.from(a).sort()[Math.floor(a.length * p)] || 0;
  if (q(E[3], 0.97) < 0.002) { audioBuf = null; return false; }      // silent track
  E.forEach(a => { const p = q(a, 0.97) + 1e-9; for (let i = 0; i < F; i++) a[i] = Math.min(1.3, a[i] / p); });
  await tick();
  const flux = e => { const o = new Float32Array(F); let prev = Math.log1p(20 * e[0]); for (let i = 1; i < F; i++) { const c = Math.log1p(20 * e[i]); o[i] = Math.max(0, c - prev); prev = c; } return o; };
  const fb = flux(E[0]), fm = flux(E[1]), fh = flux(E[2]), os = new Float32Array(F);
  for (let i = 0; i < F; i++) os[i] = fb[i] + 0.5 * fh[i] + 0.5 * fm[i];
  // tempo: autocorrelation of the onset curve, weighted towards 120 BPM so half/double tempo does not win
  let mean = 0; for (let i = 0; i < F; i++) mean += os[i]; mean /= F;
  const z = Float32Array.from(os, v => v - mean), minLag = Math.round(AH * 60 / 190), maxLag = Math.min(F - 2, Math.round(AH * 60 / 65)), ac = [];
  let best = -1e9, bl = Math.round(AH * 0.5);
  for (let lag = minLag; lag <= maxLag; lag++) { let sacc = 0; for (let i = lag; i < F; i++) sacc += z[i] * z[i - lag]; sacc /= (F - lag);
    const bpm = AH * 60 / lag; ac[lag] = sacc * Math.exp(-0.5 * Math.pow(Math.log2(bpm / 120) / 0.7, 2)); if (ac[lag] > best) { best = ac[lag]; bl = lag; } }
  let lagf = bl; if (ac[bl - 1] !== undefined && ac[bl + 1] !== undefined) { const a = ac[bl - 1], b = ac[bl], c = ac[bl + 1], d = a - 2 * b + c; if (d < 0) lagf = bl + 0.5 * (a - c) / d; }
  const beatLen = lagf / AH, bpm = 60 / beatLen;
  let off = 0, bo = -1;     // beat phase: the offset whose comb of beats collects the most onset energy
  for (let o = 0; o < lagf; o += 0.5) { let sacc = 0; for (let t = o; t < F - 1; t += lagf) { const j = Math.round(t); sacc += os[j] + 0.5 * (os[j - 1] || 0) + 0.5 * os[j + 1]; } if (sacc > bo) { bo = sacc; off = o; } }
  let bar0 = 0, bb = -1;    // downbeat: which of four beats carries the most bass
  for (let p0 = 0; p0 < 4; p0++) { let sacc = 0, k = 0; for (let t = off; t < F - 1; t += lagf, k++) if (k % 4 === p0) sacc += fb[Math.round(t)]; if (sacc > bb) { bb = sacc; bar0 = p0; } }
  // hits
  const ps = o => { const a = new Float64Array(F + 1); for (let i = 0; i < F; i++) a[i + 1] = a[i] + o[i]; return a; };
  const peaks = (o, th, gap, keep) => { const pre = ps(o), out = [], W = 150; let last = -1e9; const p90 = q(o, 0.95) + 1e-9;
    for (let i = 1; i < F - 1; i++) { const a = Math.max(0, i - W), b = Math.min(F, i + W), mu = (pre[b] - pre[a]) / (b - a);
      if (o[i] > o[i - 1] && o[i] >= o[i + 1] && o[i] > mu * th + 0.02 && i - last > gap && (!keep || keep(i))) { out.push([i, Math.min(1, o[i] / p90)]); last = i; } } return out; };
  const kicks = peaks(fb, 2.0, 12, i => E[0][Math.min(F - 1, i + 2)] > 0.4), hats = peaks(fh, 2.0, 6), voxs = peaks(fm, 2.2, 10, i => E[0][i] < 0.6);
  const env = (pk, tau) => { const a = new Float32Array(F), L = Math.round(tau * 6 * AH); for (const [i, v] of pk) for (let j = i; j < Math.min(F, i + L); j++) a[j] = Math.max(a[j], v * Math.exp(-(j - i) / (tau * AH))); return a; };
  // voice presence: share of the 300 Hz to 3 kHz band, smoothed
  const vp = new Float32Array(F); { let y = 0; const a = Math.exp(-1 / (0.4 * AH)); for (let i = 0; i < F; i++) { const r = E[1][i] / (E[0][i] + E[1][i] + E[2][i] + 0.05); y = (1 - a) * clamp(r * 1.7 - 0.2, 0, 1) + a * y; vp[i] = y; } }
  // sections by loudness: 0.5 s blocks, three levels, short runs merged away, edges snapped to the beat grid
  const bl2 = AH / 2, nb = Math.floor(F / bl2), Ls = [];
  for (let b = 0; b < nb; b++) { let sacc = 0; for (let i = b * bl2; i < (b + 1) * bl2; i++) sacc += E[3][i]; Ls.push(sacc / bl2); }
  const sm = Ls.map((v, i) => (Ls[i - 1] ?? v) * 0.25 + v * 0.5 + (Ls[i + 1] ?? v) * 0.25), sorted = [...sm].sort((a, b) => a - b), t1 = sorted[Math.floor(nb * 0.4)], t2 = sorted[Math.floor(nb * 0.72)];
  const lv = sm.map(v => v < t1 ? 0 : v < t2 ? 1 : 2);
  let segs = []; lv.forEach((l, b) => { if (segs.length && segs[segs.length - 1].level === l) segs[segs.length - 1].b1 = b + 1; else segs.push({b0: b, b1: b + 1, level: l}); });
  const minB = Math.max(6, Math.round(beatLen * 8 * 2));
  for (;;) { let si = -1, sl = 1e9; segs.forEach((g, i) => { if (g.b1 - g.b0 < sl) { sl = g.b1 - g.b0; si = i; } });
    if (si < 0 || sl >= minB || segs.length < 2) break;
    const nbIdx = si > 0 ? si - 1 : si + 1, nbg = segs[nbIdx]; nbg.b0 = Math.min(nbg.b0, segs[si].b0); nbg.b1 = Math.max(nbg.b1, segs[si].b1); segs.splice(si, 1);
    const merged = []; segs.forEach(g => { const l = merged[merged.length - 1]; if (l && l.level === g.level) l.b1 = g.b1; else merged.push({...g}); }); segs = merged; }
  const snap = t => clamp(Math.round((t - off / AH) / beatLen) * beatLen + off / AH, 0, F / AH);
  const sections = segs.map((g, i) => ({t0: i === 0 ? 0 : snap(g.b0 * 0.5), t1: i === segs.length - 1 ? F / AH : snap(g.b1 * 0.5), level: g.level})).filter(g => g.t1 - g.t0 > 0.2);
  AU = {F, E, kickA: env(kicks, 0.14), hatA: env(hats, 0.06), voxA: env(voxs, 0.18), vp, bpm, beatLen, off: off / AH, bar0, kicks: kicks.map(a => a[0] / AH), hats: hats.map(a => a[0] / AH), vox: voxs.map(a => a[0] / AH), sections, dur: F / AH, level: sm};
  return true;
}
function aAt(tv){
  if (!AU) { AV.on = false; return AV; }
  const f = clamp(tv * AH, 0, AU.F - 1), i = Math.floor(f), j = Math.min(AU.F - 1, i + 1), fr = f - i, g = a => a[i] * (1 - fr) + a[j] * fr;
  AV.on = true; AV.bass = Math.min(1, g(AU.E[0])); AV.mid = Math.min(1, g(AU.E[1])); AV.high = Math.min(1, g(AU.E[2]));
  AV.kick = g(AU.kickA); AV.hat = g(AU.hatA); AV.vox = g(AU.voxA);
  const b = (tv - AU.off) / AU.beatLen, n = Math.floor(b);
  AV.beatIdx = n; AV.beatPh = b - n; AV.beatInBar = (((n - AU.bar0) % 4) + 4) % 4; AV.bar = Math.floor((n - AU.bar0) / 4); AV.bpm = AU.bpm;
  return AV;
}

// ---------------------------------------------------------------- HUD (markers, links, frame), drawn in target-frame pixels
const v3 = new THREE.Vector3(), sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
function drawHud(ctx, w, h){
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  drawCam(ctx, w, h);
  if (!count) return;
  const k = Math.min(w, h) / 700, t = U.uTime.value, col = $('tColor').value === 'cyan' ? '63,227,242' : '235,248,252';
  if (false) {
    const MP = U.uMagPos.value, c = v3.copy(MP).applyMatrix4(group.matrixWorld).project(camera), cx = (c.x * 0.5 + 0.5) * w, cy = (-c.y * 0.5 + 0.5) * h;
    const e = v3.copy(MP).setX(MP.x + U.uMagR.value).applyMatrix4(group.matrixWorld).project(camera), rr = Math.abs((e.x * 0.5 + 0.5) * w - cx);
    ctx.strokeStyle = 'rgba(63,227,242,.7)'; ctx.lineWidth = Math.max(1, k); ctx.setLineDash([4 * k, 4 * k]);
    ctx.beginPath(); ctx.arc(cx, cy, rr, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(cx - 6 * k, cy); ctx.lineTo(cx + 6 * k, cy); ctx.moveTo(cx, cy - 6 * k); ctx.lineTo(cx, cy + 6 * k); ctx.stroke();
  }
  if (tracked.length) {
    const pts = tracked.map(i => { displaced(i, v3); const wx = v3.x, wy = v3.y, wz = v3.z; v3.applyMatrix4(group.matrixWorld).project(camera);
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, homeX[i] / 150, homeY[i] / 150, zFull(i) / 150, wx, wy, wz]; });
    const lm = $('tLinks').value, la = +$('lAlpha').value;
    const seg = (a, b, al) => { ctx.strokeStyle = `rgba(${col},${al})`; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    ctx.lineWidth = 0.8 * k;
    if (lm === 'radius') { const RD = 0.35 * 2 * U.uWidth.value;
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) { const d = Math.hypot(pts[a][5] - pts[b][5], pts[a][6] - pts[b][6], pts[a][7] - pts[b][7]); if (d < RD) seg(pts[a], pts[b], (la * (1 - Math.pow(d / RD, 4))).toFixed(3)); } }
    else if (lm === 'hub') pts.forEach((p, n) => n && seg(pts[0], p, la));
    else if (lm === 'all') { for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) seg(pts[a], pts[b], la * 0.6); }
    else links.forEach(([a, b]) => seg(pts[a], pts[b], la));
    const sB = +$('tSize').value * k, style = $('tStyle').value, lab = $('tLabel').value, pixc = $('tColor').value === 'pixel', lift = v => Math.round(255 * (0.3 + 0.7 * v));
    ctx.strokeStyle = ctx.fillStyle = `rgba(${col},.9)`; ctx.lineWidth = Math.max(1, 1.1 * k);
    ctx.font = `${Math.round(10.5 * k)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
    if (lm === 'hub' && pts[0]) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], sB * 2.2, 0, TAU); ctx.stroke(); }
    pts.forEach((p, n) => {
      const [x, y] = p, i = tracked[n], q = i * 4, hot = AV.on && AV.beatIdx % tracked.length === n, s = sB * (1 + (AV.on ? AV.K * (hot ? 1.1 : 0.15) : 0));
      if (pixc) ctx.strokeStyle = ctx.fillStyle = `rgb(${lift(pix[q] / 255)},${lift(pix[q + 1] / 255)},${lift(pix[q + 2] / 255)})`;
      ctx.beginPath();
      if (style === 'brackets') { const c = s * 0.55; ctx.moveTo(x - s, y - s + c); ctx.lineTo(x - s, y - s); ctx.lineTo(x - s + c, y - s); ctx.moveTo(x + s - c, y + s); ctx.lineTo(x + s, y + s); ctx.lineTo(x + s, y + s - c); ctx.stroke(); }
      else if (style === 'cross') { ctx.moveTo(x - s, y); ctx.lineTo(x - s * 0.35, y); ctx.moveTo(x + s * 0.35, y); ctx.lineTo(x + s, y); ctx.moveTo(x, y - s); ctx.lineTo(x, y - s * 0.35); ctx.moveTo(x, y + s * 0.35); ctx.lineTo(x, y + s); ctx.stroke(); }
      else if (style === 'ring') { ctx.arc(x, y, s, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(x, y, Math.max(1, s * 0.18), 0, TAU); ctx.fill(); }
      else if (style === 'square') ctx.strokeRect(x - s, y - s, s * 2, s * 2);
      else { ctx.arc(x, y, Math.max(1.5, s * 0.35), 0, TAU); ctx.fill(); }
      if (lab !== 'none') {
        const jit = Math.sin(t * 3 + n) * 0.004, num = String(n + 1).padStart(2, '0');
        const txt = lab === 'num' ? num : lab === 'depth' ? `${num} Z ${sgn(p[4])}` : lab === 'lum' ? `${num} L ${lumA[i].toFixed(2)}`
          : lab === 'hex' ? `${num} #${[0, 1, 2].map(c => pix[q + c].toString(16).padStart(2, '0')).join('').toUpperCase()}`
          : `${num} ${sgn(p[2] + jit)} ${sgn(p[3] - jit)} ${sgn(p[4])}`;
        const tx2 = hot && AV.K > 0.35 ? `BEAT ${String(((AV.beatIdx % 999) + 999) % 999).padStart(3, '0')}` : txt;
        const tw = ctx.measureText(tx2).width, flip = x + s + 5 * k + tw > w - 24 * k;
        ctx.fillText(tx2, flip ? x - s - 5 * k - tw : x + s + 5 * k, y - s);
      }
    });
  }
  if ($('frameOn').checked) {
    const m = 22 * k, L = 22 * k; ctx.strokeStyle = 'rgba(160,220,235,.55)'; ctx.lineWidth = Math.max(1, k); ctx.beginPath();
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, a, b]) => { ctx.moveTo(x, y + L * b); ctx.lineTo(x, y); ctx.lineTo(x + L * a, y); });
    ctx.stroke(); ctx.fillStyle = 'rgba(160,220,235,.75)'; ctx.font = `${Math.round(10 * k)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
    ctx.fillText(`VIDEO·FIELD   ${count.toLocaleString('ru-RU')} PTS   T ${t.toFixed(2)}S` + (AV.on ? `   BPM ${AV.bpm.toFixed(0)}   BAR ${String(AV.bar + 1).padStart(3, '0')}.${AV.beatInBar + 1}` : ''), m + 8 * k, h - m - 12 * k);
    if (shotInfo.n) {   // shot slate
      const age = shotInfo.age, al = clamp(1.4 - age / 1.8, 0, 1) * 0.9; if (al > 0.02) { ctx.fillStyle = `rgba(235,248,252,${al})`; ctx.textAlign = 'right'; ctx.fillText(`SHOT ${String(shotInfo.i + 1).padStart(2, '0')}/${String(shotInfo.n).padStart(2, '0')}   ${shotInfo.name.toUpperCase()}`, w - m - 8 * k, m + 14 * k); ctx.textAlign = 'start'; }
    }
    if (AV.on) {   // scope: three band meters + four beat cells, bottom right
      const bx = w - m - 90 * k, by = h - m - 6 * k, bw = 14 * k;
      [AV.bass, AV.mid, AV.high].forEach((v, n) => { ctx.fillStyle = 'rgba(160,220,235,.25)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k, bw, 30 * k); ctx.fillStyle = 'rgba(160,220,235,.85)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k * Math.min(1, v), bw, 30 * k * Math.min(1, v)); });
      for (let n = 0; n < 4; n++) { ctx.fillStyle = n === AV.beatInBar ? 'rgba(160,220,235,.95)' : 'rgba(160,220,235,.25)'; ctx.fillRect(bx + 3 * (bw + 4 * k) + 6 * k + n * 7 * k, by - 7 * k, 5 * k, 5 * k); }
      if (AV.vox > 0.4) { ctx.fillStyle = `rgba(160,220,235,${Math.min(1, AV.vox)})`; ctx.fillText('VOX', m + 8 * k, m + 14 * k); }
    }
  }
}


// ---------------------------------------------------------------- one frame: audio -> shot stack -> shader, layers, cloud, HUD flags
let shotInfo = {i: 0, n: 0, name: '', age: 0}, curHud = {}, curTv = 0, srcFps = 30;
function computeAudio(tv){
  const a = $('audOn').checked && AU ? aAt(tv) : (AV.on = false, AV), g = AV.on ? num('aGain') : 0;
  AV.B = a.bass * num('aBass') * g; AV.M = a.mid * num('aMid') * g; AV.H = a.high * num('aHigh') * g; AV.K = a.kick * num('aBeat') * g;
  AM = {};
  if (g > 0) { const K = AV.K, M = AV.M, B = AV.B, H = AV.H;
    AM.nDens = v => v * (1 + 0.7 * K); AM.nMax = v => v * (1 + 0.5 * K); AM.lOp = v => clamp(v + 0.4 * M, 0, 1); AM.cLen = v => v * (1 + 0.8 * B);
    AM.pCon = v => v * (1 + 0.5 * B); AM.pAnim = v => v + 3 * H; AM.dThr = v => clamp(v + 0.12 * (a.hat - 0.3), 0.2, 0.8); }
}
function applyFrame(t){
  const tv = getStart() + t; curTv = tv; computeAudio(tv);
  const si = shots.length ? shotIndexAt(tv) : -1, sh = shots[si];
  if (!sh) { pushParams(VPD); VU.uTime.value = tv; LA.cloud = 0; writeLegacy({}); curHud = {}; shotInfo = {i: 0, n: 0, name: '', age: 0}; return; }
  const age = tv - sh.t0, react = sh.react ?? 1, A = {b: AV.B * react, m: AV.M * react, h: AV.H * react, k: AV.K * react, p: clamp(age / Math.max(0.1, sh.t1 - sh.t0), 0, 1), t: age, T: tv, ph: AV.beatPh};
  const {V, C} = evalStack(sh, A, PAL), prev = si > 0 ? shots[si - 1] : null;
  V.trans = prev && age < 0.9 ? Math.exp(-age / 0.17) : 0; V.ttype = prev ? +sh.enter : 0; if (V.ttype === 4) V.flash += 0.45 * V.trans;
  const Lp = prev ? layersOf(prev) : {}, r = prev ? clamp(age / 0.15, 0, 1) : 1, e = r * r * (3 - 2 * r);
  Object.keys(LA).forEach(k => { LA[k] = (C.L[k] || 0) * e + (Lp[k] || 0) * (1 - e); });
  writeLegacy(C.W); curHud = C.hud; pushParams(V); VU.uTime.value = tv; VU.uCam.value.set(V.camx, V.camy);
  applyCloud(t, C.cloud || (LA.cloud > 0.01 ? CLOUD0 : CLOUD0), AV);
  shotInfo = {i: si, n: shots.length, name: PRESETS[sh.key] ? PRESETS[sh.key].name + (sh.edited ? ' *' : '') : 'Свой', age};
}
const fmtTC = v => { const m = Math.floor(v / 60), s = Math.floor(v % 60), f = Math.floor((v % 1) * srcFps); return `${m}:${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`; };
function drawCam(ctx, w, h){
  const amt = curHud.cam; if (!amt || !hasVideo) return;
  const k = Math.min(w, h) / 700, m = 26 * k; ctx.save(); ctx.globalAlpha = Math.min(1, amt); ctx.font = `700 ${Math.round(15 * k)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 3 * k; ctx.strokeStyle = ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = Math.max(1.5, 1.6 * k);
  [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, a, b]) => { ctx.beginPath(); ctx.moveTo(x, y + 22 * k * b); ctx.lineTo(x, y); ctx.lineTo(x + 22 * k * a, y); ctx.stroke(); });
  if (Math.floor(curTv * 1.5) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(m + 14 * k, m + 30 * k, 6 * k, 0, TAU); ctx.fill(); }
  ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fillText('REC', m + 28 * k, m + 30 * k);
  ctx.textAlign = 'right'; ctx.fillText(fmtTC(curTv), w - m - 6 * k, m + 30 * k);
  ctx.textAlign = 'left'; ctx.fillText('PLAY ▶', m + 6 * k, h - m - 28 * k);
  const bx = w - m - 44 * k, by = h - m - 36 * k; ctx.strokeRect(bx, by, 34 * k, 16 * k); ctx.fillRect(bx + 34 * k, by + 4 * k, 3 * k, 8 * k); for (let i = 0; i < 3; i++) ctx.fillRect(bx + 3 * k + i * 10 * k, by + 3 * k, 8 * k, 10 * k);
  ctx.restore();
}

// ---------------------------------------------------------------- effect catalogue: every effect is a few numbers that change the shader / layers while the frame stays recognisable
const CATS = {cam: ['Камера', 210], dist: ['Искажение кадра', 275], light: ['Свет', 42], color: ['Цвет и грейд', 330], print: ['Печать и графика', 150], tv: ['Плёнка и ТВ', 18], vol: ['Объём и схемы', 190]};
const EFX = {};
const NUM = (k, l, min, max, step, def) => ({k, l, min, max, step, def});
const SEL = (k, l, opts, def) => ({k, l, opts, def});
const AMT = (d = 0.6, l = 'Сила') => NUM('amt', l, 0, 1, 0.01, d);
function fx(id, name, cat, desc, params, apply){ EFX[id] = {id, name, cat, desc, params, apply, defaults: Object.fromEntries(params.map(p => [p.k, p.def]))}; }
const up = (V, k, x) => { V[k] += x; }, mx = (V, k, x) => { V[k] = Math.max(V[k], x); };
const noise = (t, f) => Math.sin(t * f) + 0.6 * Math.sin(t * f * 1.9 + 1.3);

// ---- camera
fx('push', 'Наезд', 'cam', 'Медленно приближает или отдаляет кадр на протяжении шота.', [AMT(0.5), SEL('out', 'Куда', [[0, 'Вперёд'], [1, 'Назад']], 0)], (V, P, a) => { V.zoom *= 1 + P.amt * 0.2 * (P.out ? 1 - a.p : a.p); });
fx('shake', 'Тряска', 'cam', 'Ручная камера: дрожь, сильнее на ударах.', [AMT(0.4)], (V, P, a) => { const k = 0.4 + a.k * 1.5; up(V, 'panx', noise(a.T, 43) * 0.006 * P.amt * k); up(V, 'pany', noise(a.T + 9, 37) * 0.006 * P.amt * k); up(V, 'rot', noise(a.T, 29) * 0.004 * P.amt * k); V.zoom *= 1 + 0.02 * P.amt; });
fx('roll', 'Крен', 'cam', 'Кадр медленно качается из стороны в сторону.', [AMT(0.3)], (V, P, a) => { up(V, 'rot', P.amt * 0.25 * Math.sin(a.t * 0.8)); V.zoom *= 1 + 0.12 * P.amt; });
fx('punch', 'Удар-зум', 'cam', 'Кадр подпрыгивает на каждом ударе.', [AMT(0.5)], (V, P, a) => { V.zoom *= 1 + P.amt * (0.04 + a.k * 0.14); });
fx('lens', 'Линза', 'cam', 'Бочка, как у широкоугольника или рыбьего глаза.', [AMT(0.4)], (V, P, a) => { up(V, 'bulge', P.amt * 0.5 * (0.6 + a.k)); });
fx('mirror', 'Зеркало', 'cam', 'Кадр отражается: лево-право, четверти или калейдоскоп.', [SEL('mode', 'Тип', [[1, 'Лево-право'], [2, 'Четверти'], [3, 'Калейдоскоп']], 1), NUM('seg', 'Сегментов', 3, 12, 1, 6)], (V, P, a) => { V.mirror = +P.mode; V.kseg = P.seg; if (+P.mode === 3) up(V, 'rot', a.t * 0.08); V.zoom *= 1.08; });
fx('tile', 'Плитка', 'cam', 'Кадр повторяется сеткой маленьких экранов.', [SEL('n', 'Сетка', [[2, '2×2'], [3, '3×3'], [4, '4×4']], 2)], (V, P) => { V.tile = +P.n; });
fx('ripple', 'Волна от удара', 'cam', 'От центра расходится кольцо, как от удара по воде.', [AMT(0.6)], (V, P, a) => { V.rip = Math.max(V.rip, P.amt * (0.5 + a.k * 1.2)); V.ripT = a.ph; });
// ---- distortion
fx('liquid', 'Жидкое стекло', 'dist', 'Картинка преломляет сама себя по яркости, как стекло или вода.', [AMT(0.55)], (V, P, a) => { up(V, 'self', P.amt * (0.03 + 0.06 * a.b)); up(V, 'warp', P.amt * 0.006 * (1 + a.m)); V.warpF = 9; V.warpS = 1.2; V.zoom *= 1.03; });
fx('wave', 'Волна кадра', 'dist', 'Весь кадр идёт синусной волной.', [AMT(0.4), NUM('freq', 'Частота', 2, 40, 1, 12)], (V, P) => { up(V, 'warp', P.amt * 0.02); V.warpF = P.freq; V.warpS = 2; });
fx('parallax', 'Параллакс', 'dist', 'Светлое и тёмное сдвигается на разную глубину: плоское видео становится объёмным.', [AMT(0.55)], (V, P, a) => { up(V, 'par', P.amt * 0.2 * (0.6 + a.b)); V.camx = Math.sin(a.t * 0.6) * 0.9; V.camy = Math.cos(a.t * 0.45) * 0.55; V.zoom *= 1.1; });
fx('slices', 'Срезы', 'dist', 'Горизонтальные полосы сдвигаются, на ударах сильнее.', [AMT(0.5)], (V, P, a) => { mx(V, 'slice', P.amt * (0.05 + 0.2 * a.k)); });
fx('mosh', 'Датамош', 'dist', 'Блоки «залипают» на предыдущем кадре, как битый поток.', [AMT(0.5)], (V, P) => { up(V, 'mosh', P.amt); });
fx('pixelate', 'Мозаика', 'dist', 'Кадр рассыпается на пиксели и собирается на ударе.', [NUM('size', 'Размер', 0.008, 0.1, 0.002, 0.035)], (V, P, a) => { V.pix = P.size * (1 - 0.85 * a.k) + 0.005; });
fx('pixsort', 'Пиксель-стрик', 'dist', 'Светлые пиксели вытягиваются вниз полосами.', [AMT(0.6)], (V, P) => { up(V, 'sort', P.amt); });
fx('zblur', 'Зум-смаз', 'dist', 'Радиальный смаз к центру, будто камеру выстрелили вперёд.', [AMT(0.4)], (V, P, a) => { up(V, 'zb', P.amt * (0.4 + a.k)); });
fx('mblur', 'Смаз движения', 'dist', 'Направленный смаз, как при быстром повороте.', [AMT(0.4), NUM('ang', 'Угол', 0, 3.14, 0.05, 0)], (V, P) => { up(V, 'mb', P.amt * 0.5); V.mba = P.ang; });
fx('tilt', 'Тилт-шифт', 'dist', 'Верх и низ размыты, кадр выглядит как миниатюра.', [AMT(0.6)], (V, P) => { up(V, 'tilt', P.amt); });
// ---- light
fx('glow', 'Свечение', 'light', 'Яркие места светятся, на середине звука сильнее.', [AMT(0.5)], (V, P, a) => { up(V, 'glow', P.amt * (0.6 + 0.8 * a.m)); });
fx('halation', 'Ореол (halation)', 'light', 'Яркие места дают мягкий ореол цвета акцента, как на плёнке.', [AMT(0.55)], (V, P) => { up(V, 'glow', P.amt * 0.9); mx(V, 'gtint', 0.85); });
fx('streak', 'Анаморфный блик', 'light', 'Горизонтальные синие полосы от ярких источников.', [AMT(0.7)], (V, P, a) => { up(V, 'streak', P.amt * (0.7 + a.h)); });
fx('leak', 'Утечки света', 'light', 'Тёплые засветы по краям, как у старой камеры.', [AMT(0.6)], (V, P) => { up(V, 'leak', P.amt); });
fx('burn', 'Киноожог', 'light', 'Оранжево-белые вспышки плёнки слева.', [AMT(0.6)], (V, P) => { up(V, 'burn', P.amt); });
fx('flash', 'Вспышка на бит', 'light', 'Кадр вспыхивает на каждом ударе.', [AMT(0.5)], (V, P, a) => { up(V, 'flash', a.k * P.amt * 0.35); });
fx('strobe', 'Строб-негатив', 'light', 'На сильных ударах цвета на мгновение инвертируются.', [AMT(0.7)], (V, P, a) => { mx(V, 'neg', a.k > 0.55 ? P.amt : 0); });
fx('neon', 'Неон-контуры', 'light', 'Затемняет кадр и подсвечивает контуры цветом палитры.', [AMT(0.9), NUM('dim', 'Затемнение', 0, 1, 0.01, 0.5)], (V, P, a) => { up(V, 'edge', P.amt * (0.8 + 1.2 * a.k)); V.exposure *= 1 - 0.45 * P.dim; V.contrast += 0.2 * P.amt; });
// ---- colour
fx('grade', 'Грейд (кино)', 'color', 'Тени и света подкрашены цветами палитры, лёгкий контраст.', [AMT(0.6)], (V, P) => { up(V, 'tone', P.amt); up(V, 'contrast', 0.12 * P.amt); V.sat *= 1 - 0.06 * P.amt; });
fx('duo', 'Две краски', 'color', 'Весь кадр в двух цветах палитры: тёмный и светлый.', [AMT(0.6)], (V, P) => { mx(V, 'duo', P.amt); });
fx('gmap', 'Градиент палитры', 'color', 'Яркость заменяется градиентом из цветов палитры.', [AMT(0.65)], (V, P) => { mx(V, 'gmap', P.amt); });
fx('hue', 'Сдвиг оттенка', 'color', 'Оттенки поворачиваются по кругу, можно крутить во времени.', [NUM('amt', 'Сдвиг', 0, 1, 0.01, 0.3), NUM('speed', 'Скорость', 0, 1, 0.01, 0)], (V, P, a) => { up(V, 'hue', P.amt * 3.14 + P.speed * a.t * 0.5); });
fx('chrome', 'Хром Y2K', 'color', 'Яркость превращается в жидкий металл, серебро и голубой.', [AMT(0.65)], (V, P) => { mx(V, 'chrome', P.amt); });
fx('thermal', 'Тепловизор', 'color', 'Яркость окрашена как на тепловизоре.', [AMT(1)], (V, P) => { mx(V, 'thermal', P.amt); });
fx('night', 'Ночное видение', 'color', 'Зелёный монохром ночного прицела.', [AMT(1)], (V, P) => { mx(V, 'night', P.amt); });
fx('solar', 'Соляризация', 'color', 'Светлые тона переворачиваются, получается графичный негатив.', [AMT(0.8)], (V, P) => { mx(V, 'solar', P.amt); });
fx('ana', 'Анаглиф 3D', 'color', 'Красно-голубое раздвоение, как в старых 3D-очках.', [AMT(0.5)], (V, P, a) => { up(V, 'ana', P.amt * (0.7 + a.k)); });
fx('rgb', 'RGB-сдвиг', 'color', 'Цветовые каналы расходятся к краям, на ударах сильнее.', [AMT(0.4)], (V, P, a) => { up(V, 'ca', P.amt * (0.006 + 0.025 * a.k)); });
fx('poster', 'Постер', 'color', 'Ограниченное число цветовых уровней.', [NUM('levels', 'Уровней', 2, 10, 1, 5)], (V, P) => { V.post = P.levels; });
fx('bleach', 'Выбеливание', 'color', 'Выцветшие цвета и жёсткий контраст, кино про войну.', [AMT(0.7)], (V, P) => { V.sat *= 1 - 0.6 * P.amt; up(V, 'contrast', 0.35 * P.amt); V.exposure *= 0.96; });
fx('bw', 'Чёрно-белое', 'color', 'Убирает цвет.', [AMT(1)], (V, P) => { V.sat *= 1 - P.amt; });
fx('negative', 'Негатив', 'color', 'Инвертирует цвета.', [AMT(1)], (V, P) => { mx(V, 'neg', P.amt); });
fx('tone', 'Свет и насыщенность', 'color', 'Экспозиция, контраст и насыщенность в одном месте.', [NUM('exp', 'Экспозиция', 0.4, 1.6, 0.01, 1), NUM('con', 'Контраст', 0.6, 1.8, 0.01, 1.1), NUM('sat', 'Насыщенность', 0, 2, 0.01, 1.2)], (V, P) => { V.exposure *= P.exp; V.contrast *= P.con; V.sat *= P.sat; });
// ---- print & graphics
fx('halftone', 'Полутон', 'print', 'Кадр из точек разного размера, как в газете. Краски из палитры.', [NUM('size', 'Размер, px', 4, 24, 1, 10)], (V, P, a) => { V.half = P.size * (1 + 0.3 * a.k); });
fx('riso', 'Ризо (две краски)', 'print', 'Два слоя точек с лёгким смещением, как печать на ризографе.', [NUM('size', 'Размер, px', 4, 20, 1, 8)], (V, P) => { V.riso = P.size; });
fx('dither', 'Дизеринг', 'print', 'Одноцветный кадр из узора точек, цвета из палитры.', [NUM('size', 'Зерно, px', 1, 8, 1, 3)], (V, P) => { V.dith = P.size; });
fx('led', 'LED-экран', 'print', 'Кадр из светящихся пикселей-лампочек.', [NUM('size', 'Размер, px', 5, 24, 1, 10)], (V, P) => { V.led = P.size; });
fx('comic', 'Комикс', 'print', 'Плакатные цвета и чёрные контуры.', [AMT(0.8)], (V, P) => { up(V, 'comic', P.amt); });
fx('sketch', 'Скетч', 'print', 'Рисунок карандашом по контурам, цвета бумаги и туши из палитры.', [AMT(0.9)], (V, P) => { mx(V, 'sketch', P.amt); });
fx('hatch', 'Штриховка', 'print', 'Тёмное закрашено диагональными линиями.', [AMT(0.9)], (V, P) => { mx(V, 'hatch', P.amt); });
fx('glyph', 'ASCII-глифы', 'print', 'Кадр собирается из символов, яркое плотнее.', [AMT(1), NUM('cols', 'Колонок', 30, 220, 5, 110), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.3)], (V, P, a, C) => { C.L.glyph = P.amt; C.W.gCols = P.cols; V.vidA = Math.min(V.vidA, P.vid); });
fx('plot', 'Плоттер-линии', 'print', 'Волнистые строки: чем темнее, тем гуще волна.', [AMT(1), NUM('lines', 'Линий', 40, 240, 2, 120), NUM('con', 'Контраст', 0.5, 4, 0.05, 1.7), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.3)], (V, P, a, C) => { C.L.plot = P.amt; C.W.pLines = P.lines; C.W.pCon = P.con; C.W.pCol = C.light; V.vidA = Math.min(V.vidA, P.vid); });
fx('dither2', 'Печать (диффузия)', 'print', 'Тот же узор, но с растекающейся ошибкой (Atkinson, Floyd–Steinberg).', [AMT(1), SEL('algo', 'Алгоритм', [['atkinson', 'Atkinson'], ['fs', 'Floyd–Steinberg'], ['bayer', 'Bayer 4×4'], ['noise', 'Шум']], 'atkinson'), NUM('pitch', 'Зерно, px', 2, 16, 1, 5)], (V, P, a, C) => { C.L.dither = P.amt; C.W.dAlgo = P.algo; C.W.dPitch = P.pitch; V.vidA = 0; });
// ---- film & TV
fx('vhs', 'VHS', 'tv', 'Помехи ленты: дрожь строк, цветовое размазывание, полосы внизу.', [AMT(0.8)], (V, P) => { up(V, 'vhs', P.amt); });
fx('crt', 'CRT-экран', 'tv', 'Выпуклый кинескоп с маской люминофора.', [AMT(0.8)], (V, P) => { mx(V, 'crt', P.amt); up(V, 'scan', 0.25 * P.amt); });
fx('grain', 'Зерно', 'tv', 'Плёночное зерно.', [AMT(0.4)], (V, P) => { up(V, 'grain', P.amt); });
fx('dust', 'Пыль и царапины', 'tv', 'Мелкая пыль, царапины и мерцание старой плёнки.', [AMT(0.6)], (V, P) => { up(V, 'dust', P.amt); });
fx('scan', 'Строчки', 'tv', 'Горизонтальные линии развёртки.', [AMT(0.4)], (V, P) => { up(V, 'scan', P.amt); });
fx('vig', 'Виньетка', 'tv', 'Затемнение по краям.', [AMT(0.5)], (V, P) => { up(V, 'vig', P.amt); });
fx('bars', 'Кино-полосы', 'tv', 'Чёрные полосы сверху и снизу.', [NUM('amt', 'Высота', 0, 0.2, 0.005, 0.1)], (V, P) => { mx(V, 'bars', P.amt); });
fx('echo', 'Эхо-шлейф', 'tv', 'Прошлые кадры тянутся шлейфом и слегка приближаются.', [AMT(0.85), NUM('zoom', 'Тоннель', 1, 1.04, 0.001, 1.012)], (V, P, a) => { mx(V, 'fb', P.amt); V.fbz = P.zoom + 0.012 * a.b; });
fx('camcorder', 'Камкордер REC', 'tv', 'Красная точка REC, таймкод и значок батареи, как на старой цифровой камере.', [AMT(1)], (V, P, a, C) => { C.hud.cam = Math.max(C.hud.cam || 0, P.amt); up(V, 'grain', 0.12); up(V, 'vhs', 0.25 * P.amt); });
// ---- volume & diagrams
fx('cloud', 'Облако точек', 'vol', 'Видео распадается на объёмные точки с цветом картинки. Добавляется светом поверх кадра.',
  [AMT(0.6, 'Яркость'), NUM('depth', 'Глубина', 0, 2.5, 0.05, 1.2), NUM('size', 'Точка', 0.4, 3, 0.05, 1), SEL('color', 'Цвет', [[0, 'Цвет видео'], [4, 'Карта глубины'], [5, 'Палитра']], 5), NUM('orbit', 'Облёт', 0, 1, 0.05, 0.4), NUM('pulse', 'Пульс', 0, 1, 0.05, 0.25), NUM('turb', 'Дрожь', 0, 1, 0.05, 0.2), NUM('burst', 'Разлёт на бит', 0, 1, 0.05, 0.2), NUM('vid', 'Видео под ним', 0, 1, 0.05, 0.4)],
  (V, P, a, C) => { C.L.cloud = P.amt; C.cloud = {depth: P.depth, size: P.size, colorMode: +P.color, orbit: P.orbit, pulse: P.pulse, turb: P.turb, burst: P.burst, depthY: 0.3}; V.vidA = Math.min(V.vidA, P.vid); });
fx('nodes', 'Узлы и фигуры', 'vol', 'Метки на сильнейших контурах кадра: уголки, круги, плюсы.', [AMT(1), NUM('dens', 'Плотность', 30, 300, 10, 90), SEL('shape', 'Форма', [['bracket', 'Уголки'], ['circle', 'Круг'], ['square', 'Квадрат'], ['diamond', 'Ромб'], ['cross', 'Плюс'], ['mixed', 'Смесь']], 'bracket')], (V, P, a, C) => { C.L.nodes = P.amt; C.W.nDens = P.dens; C.W.nShape = P.shape; });
fx('links', 'Связи', 'vol', 'Линии между узлами: сеть Delaunay, соседи, цепочка.', [AMT(1), SEL('mode', 'Способ', [['delaunay', 'Сеть Delaunay'], ['proximity', 'Соседи'], ['chain', 'Цепочка'], ['radial', 'Радиально'], ['hybrid', 'Комбинация']], 'delaunay'), NUM('dist', 'Дистанция', 4, 40, 1, 16)], (V, P, a, C) => { C.L.links = P.amt; C.W.lMode = P.mode; C.W.lDist = P.dist; });
fx('curtain', 'Завеса света', 'vol', 'Цвет сильных контуров вытягивается по вертикали, как светящиеся шторы.', [AMT(0.7), SEL('dir', 'Куда', [['down', 'Вниз'], ['up', 'Вверх'], ['both', 'В обе']], 'down'), NUM('len', 'Длина, %', 10, 80, 1, 40)], (V, P, a, C) => { C.L.curtain = P.amt; C.W.cDir = P.dir; C.W.cLen = P.len; });
fx('track', 'Трек-метки', 'vol', 'Подписанные метки на точках кадра, на биты загораются по очереди.', [NUM('count', 'Количество', 1, 30, 1, 8), SEL('style', 'Вид', [['brackets', 'Уголки'], ['cross', 'Перекрестье'], ['ring', 'Кольцо'], ['square', 'Квадрат'], ['dot', 'Точка']], 'brackets'), SEL('label', 'Подписи', [['xyz', 'Номер + XYZ'], ['num', 'Номер'], ['hex', 'Номер + цвет'], ['none', 'Нет']], 'num')], (V, P, a, C) => { C.W.tCount = P.count; C.W.tStyle = P.style; C.W.tLabel = P.label; });

// ---------------------------------------------------------------- looks: ready-made stacks, the director picks from these and the user can start from them
const L = (id, o) => [id, o || {}];
const PRESETS = {
  film:      {name: 'Кино', fam: 'g', enter: 4, lv: [3, 1.5, 0], stack: [L('grade', {amt: 0.6}), L('push', {amt: 0.5}), L('glow', {amt: 0.15}), L('grain', {amt: 0.35}), L('vig', {amt: 0.5}), L('bars', {amt: 0.095})]},
  dream:     {name: 'Мечта', fam: 'g', enter: 4, lv: [2.5, 1, 0], stack: [L('halation', {amt: 0.8}), L('glow', {amt: 0.5}), L('leak', {amt: 0.55}), L('tilt', {amt: 0.5}), L('push', {amt: 0.3}), L('grain', {amt: 0.2})]},
  y2k:       {name: 'Y2K', fam: 'g', enter: 4, lv: [1.5, 2.5, 1], stack: [L('chrome', {amt: 0.6}), L('streak', {amt: 0.8}), L('glow', {amt: 0.55}), L('rgb', {amt: 0.3}), L('grain', {amt: 0.15})]},
  burnreel:  {name: 'Киноплёнка', fam: 'g', enter: 4, lv: [1, 2, 1], stack: [L('burn', {amt: 0.7}), L('leak', {amt: 0.55}), L('dust', {amt: 0.8}), L('halation', {amt: 0.55}), L('grain', {amt: 0.6}), L('shake', {amt: 0.25})]},
  liquid:    {name: 'Жидкое стекло', fam: 'w', enter: 2, lv: [2.5, 2.5, 1.2], stack: [L('liquid', {amt: 0.6}), L('glow', {amt: 0.4}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.3}), L('roll', {amt: 0.15})]},
  parallax:  {name: 'Параллакс', fam: 'w', enter: 1, lv: [2.5, 2, 0], stack: [L('parallax', {amt: 0.6}), L('grade', {amt: 0.4}), L('glow', {amt: 0.25}), L('vig', {amt: 0.55}), L('grain', {amt: 0.14})]},
  neon:      {name: 'Неон-контур', fam: 'l', enter: 4, lv: [1, 2.5, 2], stack: [L('neon', {amt: 0.9, dim: 0.5}), L('glow', {amt: 0.7}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.5}), L('scan', {amt: 0.12})]},
  echo:      {name: 'Эхо', fam: 'l', enter: 4, lv: [2, 1.5, 1.2], stack: [L('echo', {amt: 0.88}), L('glow', {amt: 0.6}), L('gmap', {amt: 0.3}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.4})]},
  tunnel:    {name: 'Тоннель', fam: 'l', enter: 2, lv: [0, 1.2, 2.5], stack: [L('echo', {amt: 0.9, zoom: 1.025}), L('zblur', {amt: 0.5}), L('hue', {amt: 0.1, speed: 0.4}), L('glow', {amt: 0.6}), L('rgb', {amt: 0.4})]},
  grunge:    {name: 'Гранж', fam: 'v', enter: 3, lv: [0, 2.5, 2], stack: [L('bleach', {amt: 0.6}), L('grain', {amt: 0.8}), L('dust', {amt: 0.8}), L('halation', {amt: 0.5}), L('shake', {amt: 0.4}), L('scan', {amt: 0.2}), L('vig', {amt: 0.7}), L('slices', {amt: 0.15})]},
  vhs:       {name: 'VHS', fam: 'v', enter: 3, lv: [0, 2.5, 1.5], stack: [L('vhs', {amt: 0.8}), L('scan', {amt: 0.3}), L('rgb', {amt: 0.4}), L('grain', {amt: 0.3}), L('camcorder', {amt: 1})]},
  crt:       {name: 'CRT', fam: 'v', enter: 4, lv: [0, 1.5, 1], stack: [L('crt', {amt: 0.85}), L('rgb', {amt: 0.3}), L('glow', {amt: 0.3}), L('grain', {amt: 0.15})]},
  thermal:   {name: 'Тепловизор', fam: 'v', enter: 4, lv: [0, 1.5, 1], stack: [L('thermal', {amt: 1}), L('glow', {amt: 0.3}), L('grain', {amt: 0.3}), L('vig', {amt: 0.5}), L('scan', {amt: 0.15})]},
  night:     {name: 'Ночное видение', fam: 'v', enter: 4, lv: [0, 1.3, 0.8], stack: [L('night', {amt: 1}), L('grain', {amt: 0.5}), L('vig', {amt: 0.7}), L('scan', {amt: 0.2}), L('camcorder', {amt: 0.8})]},
  riso:      {name: 'Ризо', fam: 'p', enter: 3, lv: [0.5, 2, 1.5], stack: [L('riso', {size: 7}), L('grain', {amt: 0.25}), L('push', {amt: 0.3})]},
  halftone:  {name: 'Полутон', fam: 'p', enter: 3, lv: [0, 2, 2.5], stack: [L('halftone', {size: 9}), L('push', {amt: 0.3})]},
  comic:     {name: 'Комикс', fam: 'p', enter: 3, lv: [0, 1.5, 1.5], stack: [L('comic', {amt: 0.85}), L('poster', {levels: 5}), L('tone', {exp: 1, con: 1.1, sat: 1.35})]},
  sketch:    {name: 'Скетч', fam: 'p', enter: 4, lv: [0.5, 1.5, 0.5], stack: [L('sketch', {amt: 0.9}), L('grain', {amt: 0.2})]},
  hatch:     {name: 'Штриховка', fam: 'p', enter: 4, lv: [0, 1.2, 1], stack: [L('hatch', {amt: 0.9}), L('push', {amt: 0.3})]},
  led:       {name: 'LED-экран', fam: 'p', enter: 3, lv: [0, 1, 2], stack: [L('led', {size: 9}), L('glow', {amt: 0.4})]},
  mosaic:    {name: 'Мозаика', fam: 'p', enter: 3, lv: [0, 1.5, 2.5], stack: [L('pixelate', {size: 0.035}), L('poster', {levels: 6}), L('gmap', {amt: 0.4})]},
  plotter:   {name: 'Плоттер', fam: 'p', enter: 1, lv: [0.5, 1.2, 1], stack: [L('plot', {lines: 130})]},
  ascii:     {name: 'ASCII', fam: 'p', enter: 4, lv: [0.5, 1.2, 1.5], stack: [L('glyph', {cols: 110})]},
  mirror:    {name: 'Зеркало', fam: 'k', enter: 2, lv: [1, 1.5, 2.5], stack: [L('mirror', {mode: 1}), L('gmap', {amt: 0.3}), L('rgb', {amt: 0.3}), L('vig', {amt: 0.35})]},
  kaleido:   {name: 'Калейдоскоп', fam: 'k', enter: 2, lv: [0, 1.2, 2.5], stack: [L('mirror', {mode: 3, seg: 8}), L('hue', {amt: 0.2, speed: 0.3}), L('gmap', {amt: 0.35}), L('glow', {amt: 0.3})]},
  drop:      {name: 'Дроп', fam: 'x', enter: 2, lv: [0, 0.5, 3.5], stack: [L('punch', {amt: 0.8}), L('rgb', {amt: 0.8}), L('slices', {amt: 0.7}), L('flash', {amt: 0.6}), L('glow', {amt: 0.8}), L('lens', {amt: 0.4}), L('ripple', {amt: 0.5}), L('echo', {amt: 0.25})]},
  glitch:    {name: 'Рваная лента', fam: 'x', enter: 3, lv: [0, 1.2, 3], stack: [L('slices', {amt: 0.8}), L('mosh', {amt: 0.6}), L('rgb', {amt: 0.8}), L('vhs', {amt: 0.4}), L('scan', {amt: 0.4}), L('grain', {amt: 0.5})]},
  strobe:    {name: 'Строб', fam: 'x', enter: 3, lv: [0, 0.6, 2.5], stack: [L('strobe', {amt: 0.8}), L('punch', {amt: 0.6}), L('rgb', {amt: 0.5}), L('zblur', {amt: 0.4}), L('flash', {amt: 0.5})]},
  shock:     {name: 'Шоковая волна', fam: 'x', enter: 2, lv: [0, 0.8, 2.5], stack: [L('ripple', {amt: 1}), L('lens', {amt: 0.5}), L('rgb', {amt: 0.7}), L('punch', {amt: 0.7}), L('glow', {amt: 0.6})]},
  anaglyph:  {name: '3D-анаглиф', fam: 'x', enter: 3, lv: [0, 1, 2], stack: [L('ana', {amt: 0.7}), L('punch', {amt: 0.5}), L('slices', {amt: 0.3})]},
  pixsort:   {name: 'Пиксель-стрик', fam: 'x', enter: 3, lv: [0, 1.5, 1.5], stack: [L('pixsort', {amt: 0.7}), L('glow', {amt: 0.3}), L('rgb', {amt: 0.3})]},
  volume:    {name: 'Объём', fam: 'o', enter: 1, lv: [2, 1.5, 1], stack: [L('cloud', {amt: 0.55, color: 5}), L('parallax', {amt: 0.3}), L('glow', {amt: 0.3}), L('vig', {amt: 0.4})]},
  blueprint: {name: 'Схема', fam: 'o', enter: 4, lv: [0.8, 1, 0.5], stack: [L('gmap', {amt: 0.85}), L('neon', {amt: 0.7, dim: 0.4}), L('nodes', {dens: 100}), L('links', {mode: 'delaunay'}), L('track', {count: 7, label: 'xyz'})]},
  curtain:   {name: 'Свет', fam: 'o', enter: 4, lv: [1.5, 2, 1.5], stack: [L('curtain', {amt: 0.7}), L('glow', {amt: 0.3}), L('grade', {amt: 0.3})]},
};
// ---- shot stacks -> shader parameters
function stackOf(key){ const pr = PRESETS[key]; return pr.stack.map(([id, p]) => ({id, on: true, p: {...EFX[id].defaults, ...p}})); }
function evalStack(sh, a, pal){
  const V = {...VPD}, C = {L: {}, W: {}, hud: {}, cloud: null, light: pal.lightHex};
  for (const it of sh.stack) { if (it.on === false) continue; const d = EFX[it.id]; if (d) d.apply(V, {...d.defaults, ...it.p}, a, C); }
  return {V, C};
}
function layersOf(sh){ const L2 = {}; for (const it of sh.stack) { if (it.on === false) continue; const d = EFX[it.id]; if (!d) continue; const P = {...d.defaults, ...it.p};
  if (it.id === 'glyph') L2.glyph = P.amt; else if (it.id === 'plot') L2.plot = P.amt; else if (it.id === 'dither2') L2.dither = P.amt; else if (it.id === 'cloud') L2.cloud = P.amt; else if (it.id === 'nodes') L2.nodes = P.amt; else if (it.id === 'links') L2.links = P.amt; else if (it.id === 'curtain') L2.curtain = P.amt; } return L2; }

// ---------------------------------------------------------------- palette from the video, shots, director, undo
const rgb2hsl = ([r, g, b]) => { const mx2 = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx2 + mn) / 2, d = mx2 - mn; let h = 0, s = 0;
  if (d > 1e-6) { s = d / (1 - Math.abs(2 * l - 1)); h = mx2 === r ? ((g - b) / d) % 6 : mx2 === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360; } return [h, s, l]; };
const hsl2rgb = (h, sa, l) => { const a = sa * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
const mixc = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const lumc = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
const hexOf = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
const unhex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const ROLES = [['dark', 'Тени'], ['mid', 'Середина'], ['light', 'Света'], ['accent', 'Акцент'], ['accent2', 'Второй акцент']];
let PAL = {dark: [0.03, 0.04, 0.09], mid: [0.3, 0.32, 0.42], light: [0.96, 0.94, 0.9], accent: [0.25, 0.9, 0.95], accent2: [1, 0.3, 0.55], lightHex: '#f5f0e6'};
function setPalette(p, fromUser){
  PAL = {...PAL, ...p}; PAL.lightHex = hexOf(PAL.light);
  VU.uC0.value.set(...PAL.dark); VU.uC1.value.set(...PAL.light); VU.uC2.value.set(...PAL.accent); VU.uC3.value.set(...PAL.mid);
  PALETTES.auto = [PAL.accent.map(v => Math.round(v * 255)), PAL.accent2.map(v => Math.round(v * 255))]; U.uP0.value.set(...PAL.accent); U.uP1.value.set(...PAL.accent2);
  const root = document.documentElement.style, ac = hexOf(PAL.accent); root.setProperty('--accent', ac); root.setProperty('--accent2', hexOf(PAL.accent2)); root.setProperty('--ink', lumc(PAL.accent) > 0.5 ? '#050709' : '#f4f7f8');
  ROLES.forEach(([k]) => { const el = $('pal_' + k); if (el) el.value = hexOf(PAL[k]); });
  const bar = $('palBar'); if (bar) bar.style.background = `linear-gradient(90deg, ${ROLES.map(([k]) => hexOf(PAL[k])).join(',')})`;
}
function kmeans(px, k){
  const stride = Math.max(1, Math.floor(px.length / 4000)), P = px.filter((_, i) => i % stride === 0), C = [P[Math.floor(P.length / 2)].slice()];
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  while (C.length < k) { let bi = 0, bd = -1; P.forEach((p, i) => { const d = Math.min(...C.map(c => d2(p, c))); if (d > bd) { bd = d; bi = i; } }); C.push(P[bi].slice()); }
  let cnt = new Array(k).fill(0);
  for (let it = 0; it < 8; it++) {
    const sum = C.map(() => [0, 0, 0]); cnt = new Array(k).fill(0);
    P.forEach(p => { let bi = 0, bd = 1e9; C.forEach((c, i) => { const d = d2(p, c); if (d < bd) { bd = d; bi = i; } }); cnt[bi]++; sum[bi][0] += p[0]; sum[bi][1] += p[1]; sum[bi][2] += p[2]; });
    C.forEach((c, i) => { if (cnt[i]) { c[0] = sum[i][0] / cnt[i]; c[1] = sum[i][1] / cnt[i]; c[2] = sum[i][2] / cnt[i]; } });
  }
  return C.map((c, i) => ({c, n: cnt[i]})).filter(x => x.n > 0);
}
function paletteFrom(px){
  if (px.length < 30) return;
  const cl = kmeans(px, 6), tot = cl.reduce((a, b) => a + b.n, 0), satOf = c => { const mxv = Math.max(...c), mnv = Math.min(...c); return mxv > 0.001 ? (mxv - mnv) / mxv : 0; };
  const byL = [...cl].sort((a, b) => lumc(a.c) - lumc(b.c)), score = x => satOf(x.c) * (0.35 + Math.sqrt(x.n / tot)) * (lumc(x.c) > 0.08 ? 1 : 0.3);
  let acc = [...cl].sort((a, b) => score(b) - score(a))[0], colored = acc && satOf(acc.c) > 0.18;
  let accent, accent2;
  if (colored) {
    const [h1, s1, l1] = rgb2hsl(acc.c); accent = hsl2rgb(h1, clamp(s1, 0.6, 0.95), clamp(l1, 0.5, 0.62));
    const far = cl.filter(x => { const [h] = rgb2hsl(x.c), d = Math.min((h - h1 + 360) % 360, (h1 - h + 360) % 360); return d >= 40 && satOf(x.c) > 0.2; }).sort((a, b) => score(b) - score(a))[0];
    accent2 = far ? (() => { const [h2, s2, l2] = rgb2hsl(far.c); return hsl2rgb(h2, clamp(s2, 0.55, 0.95), clamp(l2, 0.52, 0.64)); })() : hsl2rgb((h1 + 150) % 360, 0.75, 0.6);
  } else { accent = hsl2rgb(190, 0.8, 0.58); accent2 = hsl2rgb(335, 0.75, 0.62); }
  let dark = byL[0].c, light = byL[byL.length - 1].c;
  dark = mixc(dark, [0.02, 0.02, 0.05], 0.45); if (lumc(dark) > 0.2) dark = dark.map(v => v * 0.2 / lumc(dark));
  light = mixc(light, [1, 1, 1], 0.55);
  const mid = (cl.filter(x => x.c !== byL[0].c && x.c !== byL[byL.length - 1].c).sort((a, b) => Math.abs(lumc(a.c) - 0.45) - Math.abs(lumc(b.c) - 0.45))[0] || {c: mixc(dark, light, 0.5)}).c;
  setPalette({dark, mid: mixc(mid, dark, 0.15), light, accent, accent2});
}

// ---------------------------------------------------------------- reading the picture: brightness, contours, colour, motion + palette
let VT = null;
async function visualAnalyse(){
  const st = getStart(), D = getDur(), N = 8, Wc = 64, Hc = Math.max(16, Math.round(64 / aspect));
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d', {willReadFrequently: true});
  const grab = () => { x.drawImage(video, 0, 0, Wc, Hc); return x.getImageData(0, 0, Wc, Hc).data; };
  const was = playing; video.pause();
  let lum = 0, con = 0, edge = 0, sat = 0, mot = 0; const pxs = [];
  for (let n = 0; n < N; n++) {
    const ts = st + (n + 0.5) / N * D;
    await seekTo(Math.min(ts, vdur - 0.25)); const a = grab();
    await seekTo(Math.min(ts + 0.15, vdur - 0.05)); const b = grab();
    const Lm = new Float32Array(Wc * Hc); let m = 0, m2 = 0, sa = 0, mo = 0;
    for (let i = 0; i < Wc * Hc; i++) {
      const r = a[i * 4] / 255, g = a[i * 4 + 1] / 255, bl = a[i * 4 + 2] / 255, mxv = Math.max(r, g, bl), mnv = Math.min(r, g, bl), l = 0.299 * r + 0.587 * g + 0.114 * bl;
      Lm[i] = l; m += l; m2 += l * l; sa += mxv > 0.001 ? (mxv - mnv) / mxv : 0; if (i % 3 === 0) pxs.push([r, g, bl]);
      mo += Math.abs(l - (0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2]) / 255);
    }
    let e = 0; for (let y = 0; y < Hc - 1; y++) for (let xx = 0; xx < Wc - 1; xx++) { const i = y * Wc + xx; e += Math.abs(Lm[i + 1] - Lm[i]) + Math.abs(Lm[i + Wc] - Lm[i]); }
    const nn = Wc * Hc; lum += m / nn; con += Math.sqrt(Math.max(0, m2 / nn - (m / nn) ** 2)); edge += e / nn; sat += sa / nn; mot += mo / nn;
  }
  await seekTo(st); if (was) playVideo();
  paletteFrom(pxs);
  VT = {lum: lum / N, contrast: con / N, edge: edge / N, sat: sat / N, motion: mot / N};
  return VT;
}

// ---------------------------------------------------------------- shots
let shots = [], selShot = 0, selFx = -1, shotUid = 1, markers = [], snapOn = true, seed = 1;
const hist = [], redoStack = [];
const mkShot = (t0, t1, level, key) => ({id: shotUid++, t0, t1, level, key, stack: stackOf(key), edited: false, react: 1, enter: PRESETS[key].enter});
const snapshot = () => JSON.stringify({shots, markers, selShot, selFx});
function pushUndo(){ hist.push(snapshot()); if (hist.length > 80) hist.shift(); redoStack.length = 0; }
function restore(js){ const o = JSON.parse(js); shots = o.shots; markers = o.markers; selShot = Math.min(o.selShot, shots.length - 1); selFx = o.selFx; shotUid = Math.max(shotUid, ...shots.map(s => s.id + 1)); uiDirty(); }
function undo(){ if (!hist.length) return; redoStack.push(snapshot()); restore(hist.pop()); status('Отмена.'); }
function redo(){ if (!redoStack.length) return; hist.push(snapshot()); restore(redoStack.pop()); status('Повтор.'); }
const shotIndexAt = tv => { const i = shots.findIndex(s => tv >= s.t0 && tv < s.t1); return i < 0 ? (tv < (shots[0] ? shots[0].t0 : 0) ? 0 : shots.length - 1) : i; };
const snapT = t => { if (!snapOn || !AU) return t; const n = Math.round((t - AU.off) / AU.beatLen); return Math.max(0, AU.off + n * AU.beatLen); };
function splitAt(tv){
  const i = shotIndexAt(tv), s = shots[i]; if (!s) return;
  const t = clamp(snapT(tv), s.t0 + 0.2, s.t1 - 0.2); if (t - s.t0 < 0.19 || s.t1 - t < 0.19) { status('Шот слишком короткий для разреза.'); return; }
  pushUndo();
  const b = JSON.parse(JSON.stringify(s)); b.id = shotUid++; b.t0 = t; s.t1 = t; s.edited = true; b.edited = true;
  shots.splice(i + 1, 0, b); selShot = i + 1; selFx = -1; uiDirty(); status(`Разрез на ${fmtTC(t)}.`);
}
function mergePrev(i){
  if (i <= 0 || !shots[i]) { status('Нет шота слева, чтобы склеить.'); return; }
  pushUndo(); shots[i - 1].t1 = shots[i].t1; shots[i - 1].edited = true; shots.splice(i, 1); selShot = i - 1; selFx = -1; uiDirty(); status('Шоты склеены.');
}
function moveCut(i, t){ const a = shots[i - 1], b = shots[i]; if (!a || !b) return; t = clamp(t, a.t0 + 0.2, b.t1 - 0.2); a.t1 = b.t0 = t; a.edited = b.edited = true; }
function usePreset(i, key){ const s = shots[i]; if (!s) return; pushUndo(); s.key = key; s.stack = stackOf(key); s.enter = PRESETS[key].enter; s.edited = true; selFx = -1; uiDirty(); status(`Образ «${PRESETS[key].name}» на шот ${i + 1}.`); }
function addEffect(id, all){
  if (!shots.length) return; pushUndo();
  (all ? shots : [shots[selShot]]).forEach(s => { s.stack.push({id, on: true, p: {...EFX[id].defaults}}); s.edited = true; });
  selFx = shots[selShot].stack.length - 1; uiDirty(); status(`«${EFX[id].name}» ${all ? 'добавлен ко всему клипу' : 'добавлен в шот ' + (selShot + 1)}.`);
}
function removeEffect(i, k){ const s = shots[i]; if (!s || !s.stack[k]) return; pushUndo(); s.stack.splice(k, 1); s.edited = true; selFx = Math.min(selFx, s.stack.length - 1); uiDirty(); }
function dupEffect(i, k){ const s = shots[i]; if (!s || !s.stack[k]) return; pushUndo(); s.stack.splice(k + 1, 0, JSON.parse(JSON.stringify(s.stack[k]))); s.edited = true; selFx = k + 1; uiDirty(); }

// ---------------------------------------------------------------- director: cuts on the beat grid, one idea per shot, neighbours never alike
function planRange(t0, t1, hist2, R){
  const out = [], secs = [];
  if (AU) AU.sections.forEach(g => { const a = Math.max(g.t0, t0), b = Math.min(g.t1, t1); if (b - a > 0.25) secs.push({t0: a, t1: b, level: g.level}); });
  if (!secs.length) secs.push({t0, t1, level: 1});
  secs[0].t0 = t0; secs[secs.length - 1].t1 = t1; for (let i = 1; i < secs.length; i++) secs[i].t0 = secs[i - 1].t1;
  const shotLen = AU ? clamp(AU.beatLen * 8, 3, 6) : 4;
  secs.forEach(g => { const len = g.t1 - g.t0, n = Math.max(1, Math.round(len / shotLen));
    for (let i = 0; i < n; i++) {
      const a = g.t0 + len * i / n, b = g.t0 + len * (i + 1) / n, w = {}, V = VT || {lum: 0.4, edge: 0.1, sat: 0.2, motion: 0.05}, mul = (k, f) => { if (w[k]) w[k] *= f; };
      Object.entries(PRESETS).forEach(([k, p]) => { if (p.lv[g.level] > 0) w[k] = p.lv[g.level]; });
      if (V.lum > 0.55) { mul('halftone', 1.5); mul('plotter', 1.4); mul('hatch', 1.5); mul('sketch', 1.4); mul('neon', 0.8); mul('echo', 0.7); mul('night', 0.5); }
      if (V.lum < 0.25) { mul('neon', 1.4); mul('echo', 1.3); mul('parallax', 1.2); mul('thermal', 1.2); mul('night', 1.4); mul('glitch', 1.1); }
      if (V.edge > 0.12) { mul('blueprint', 1.5); mul('neon', 1.3); mul('liquid', 1.2); mul('comic', 1.3); }
      if (V.sat > 0.3) { mul('mirror', 1.3); mul('kaleido', 1.3); mul('echo', 1.2); mul('liquid', 1.2); mul('y2k', 1.2); }
      if (V.motion > 0.08) { mul('glitch', 1.3); mul('drop', 1.2); mul('echo', 0.7); mul('tunnel', 1.1); }
      Object.keys(w).forEach(k => { if (hist2.slice(-4).includes(k)) w[k] *= 0.03; else { const f = PRESETS[k].fam; if (hist2.length && PRESETS[hist2[hist2.length - 1]].fam === f) w[k] *= 0.3; if (hist2.length > 1 && PRESETS[hist2[hist2.length - 2]].fam === f) w[k] *= 0.7; } });
      const tot = Object.values(w).reduce((x, y) => x + y, 0); let r = R() * tot, key = Object.keys(w)[0];
      for (const [k2, v] of Object.entries(w)) { r -= v; if (r <= 0) { key = k2; break; } }
      hist2.push(key); out.push(mkShot(a, b, g.level, key));
    } });
  return out;
}
function buildPlan(keepEdited){
  if (!hasVideo) return;
  pushUndo();
  const R = rng(seed * 7919 + 13), hist2 = [], res = [];
  if (!keepEdited || !shots.length) shots = [];
  if (!shots.length) res.push(...planRange(0, vdur, hist2, R));
  else {
    let run = null; const flush = () => { if (run) { res.push(...planRange(run.t0, run.t1, hist2, R)); run = null; } };
    shots.forEach(s => { if (s.edited) { flush(); res.push(s); hist2.push(s.key); } else if (run) run.t1 = s.t1; else run = {t0: s.t0, t1: s.t1}; }); flush();
  }
  shots = res; selShot = clamp(selShot, 0, shots.length - 1); selFx = -1; uiDirty();
}

// ---------------------------------------------------------------- video loading, playback, frame stepping
let playing = false, objUrl = null, rate = 1, loopShot = false, tool = 'select';
function playVideo(){ video.muted = !$('snd').checked; video.playbackRate = rate; const r = video.play(); if (r && r.catch) r.catch(() => { video.muted = true; video.play().catch(() => {}); }); }
function setPlaying(on){
  if (!hasVideo) on = false;
  playing = on;
  if (on) { const st = getStart(), en = st + getDur(); if (video.currentTime >= en - 0.05 || video.currentTime < st - 0.05) video.currentTime = st; playVideo(); } else video.pause();
  uiTransport();
}
const seekV = tv => { if (hasVideo) video.currentTime = clamp(tv, 0, Math.max(0, vdur - 0.001)); };
function stepFrames(n){ if (!hasVideo) return; setPlaying(false); const f = Math.round(video.currentTime * srcFps) + n; seekV(f / srcFps + 0.0005); }
function gotoShot(dir){
  if (!shots.length) return; const tv = video.currentTime, i = shotIndexAt(tv);
  let j = dir > 0 ? Math.min(shots.length - 1, i + 1) : (tv - shots[i].t0 > 0.3 ? i : Math.max(0, i - 1));
  selShot = j; selFx = -1; seekV(shots[j].t0 + 0.001); uiDirty();
}
const MS = {snd: null};
function loadVideo(file){
  if (!file || !file.type.startsWith('video/')) { status('Это не видеофайл.'); return; }
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(file); hasVideo = false; $('render').disabled = true; playing = false; shots = []; hist.length = 0; redoStack.length = 0; markers = [];
  video.onloadedmetadata = async () => {
    vdur = video.duration;
    if (!isFinite(vdur) || !video.videoWidth) { status('Не удалось прочитать видео. Попробуй MP4 (H.264) или WebM.'); return; }
    $('tStart').max = Math.max(0, vdur - 0.5).toFixed(1); $('tStart').value = 0;
    $('dur').max = Math.min(MAX_DUR, vdur).toFixed(1); $('dur').value = Math.min(MAX_DUR, vdur).toFixed(1);
    syncLimits(); $('cyc').value = Math.min(6, getDur()).toFixed(1); setOut('cyc', fmtT(+$('cyc').value));
    $('format').value = 'src'; layoutStage();
    const big = Math.max(video.videoWidth, video.videoHeight);
    $('vinfo').textContent = `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${vdur.toFixed(1)} с` + (vdur > MAX_DUR ? ' · в экспорт войдёт до 5 минут' : '') + (big > MAX_SIDE ? ' · больше 2K, в экспорте уменьшится' : '');
    if (tex) tex.dispose();
    await new Promise(r => { if (video.readyState >= 2) r(); else video.onloadeddata = r; });
    tex = new THREE.VideoTexture(video); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    U.uTex.value = tex; hasVideo = true; $('empty').hidden = true;
    buildGrid(); layoutStage(); video.currentTime = 0; detectFps();
    status('Анализирую звук…');
    const hasAudio = await analyseAudio(file);
    $('audInfo').textContent = hasAudio ? `Звук найден: темп ${AU.bpm.toFixed(0)} BPM, ${AU.kicks.length} ударов, ${AU.sections.length} секций по громкости. Слова не распознаются: голос определяется по ритму слогов.` : 'В файле нет звука, который удалось прочитать. Реакция на ритм отключена.';
    $('audOn').checked = hasAudio; $('audOn').disabled = !hasAudio; $('expAud').disabled = !hasAudio; $('snd').disabled = !hasAudio;
    status('Смотрю картинку: яркость, контуры, цвета, движение…'); await visualAnalyse();
    buildPlan(false); hist.length = 0; selShot = 0; $('render').disabled = false; tlFit(); uiDirty();
    status(`Готово: ${shots.length} шотов. Пробел запускает видео, клавиша «?» показывает все хоткеи.`);
    setPlaying(true);
  };
  video.onerror = () => status('Браузер не смог открыть это видео. Попробуй MP4 (H.264) или WebM.');
  video.src = objUrl;
}
function syncLimits(){
  const start = getStart(), maxD = Math.min(MAX_DUR, Math.max(0.5, vdur - start));
  $('dur').max = maxD.toFixed(1); if (getDur() > maxD) $('dur').value = maxD.toFixed(1);
  setOut('dur', fmtT(getDur())); setOut('tStart', fmtT(getStart())); tlDirty = true;
}
function detectFps(){
  if (!video.requestVideoFrameCallback) return;
  const ts = []; let n = 0;
  const cb = (now, md) => { ts.push(md.mediaTime); if (++n < 14) video.requestVideoFrameCallback(cb); else {
    // frame times of a constant-fps clip sit on a k/fps grid even when a slow machine skips frames: take the lowest fps whose grid fits all of them
    const grids = [[24000 / 1001, 24], [24, 24], [25, 25], [30000 / 1001, 30], [30, 30], [60000 / 1001, 60], [60, 60]];
    const fit = grids.find(([f]) => ts.every(t => Math.abs(t * f - Math.round(t * f)) < 0.04));
    let best;
    if (fit) best = fit[1];
    else { const d = ts.slice(1).map((v, i) => v - ts[i]).filter(x => x > 0.004 && x < 0.1).sort((a, b) => a - b); if (d.length < 5) return;
      const fps = 1 / d[d.length >> 2]; best = [24, 25, 30, 60].reduce((a, b) => Math.abs(b - fps) < Math.abs(a - fps) ? b : a); }
    srcFps = best; $('fps').value = String(best); } };
  video.requestVideoFrameCallback(cb);
}
$('tStart').addEventListener('input', () => { syncLimits(); seekV(getStart()); });
$('dur').addEventListener('input', () => { syncLimits(); });
$('snd').onchange = () => { video.muted = !$('snd').checked; };
$('vidFile').onchange = e => loadVideo(e.target.files[0]);
let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop').hidden = true; loadVideo(e.dataTransfer.files[0]); });

// ---------------------------------------------------------------- export: frame-by-frame seek -> WebGL -> WebCodecs H.264 -> MP4
const status = m => $('status').textContent = m;
const progress = v => $('bar').firstElementChild.style.width = (v * 100).toFixed(1) + '%';
const tick = () => new Promise(r => setTimeout(r, 0));
const hudOff = document.createElement('canvas'), hudCtx = hudOff.getContext('2d');
function seekTo(t){
  return new Promise(res => {
    if (Math.abs(video.currentTime - t) < 1e-3 && !video.seeking) return res();
    const f = () => { video.removeEventListener('seeked', f); res(); };
    video.addEventListener('seeked', f); video.currentTime = t;
  });
}
function renderAt(t, fw, fh, comp, cctx){
  tex.needsUpdate = true; updateCpu(); applyFrame(t); renderGL();
  composeFrame(cctx, fw, fh);
  drawHud(hudCtx, fw, fh); cctx.drawImage(hudOff, 0, 0);
}
async function pickCodec(fw, fh, fps, bitrate){
  const list = [['avc1.640034', 'avc'], ['avc1.4d0034', 'avc'], ['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['vp09.00.51.08', 'vp9']];
  for (const [codec, mux] of list) {
    const config = {codec, width: fw, height: fh, bitrate, framerate: fps, ...(mux === 'avc' ? {avc: {format: 'avc'}} : {})};
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return {config, mux}; } catch (e) {}
  }
  return null;
}
async function runExport(){
  if (exporting || !hasVideo) return;
  if (!window.VideoEncoder) { status('Этот браузер не умеет кодировать видео. Открой страницу в Chrome, Edge или Safari 16.4+ на компьютере.'); return; }
  const [fw, fh] = fmtSize(), fps = +$('fps').value, D = getDur(), st = getStart(), frames = Math.round(D * fps);
  const bitrate = Math.round(clamp(Math.min(fw * fh * fps * +$('quality').value, 80e6, 300 * 8e6 / D), 3e6, 80e6));   // file stays under ~300 MB: it is built in memory
  const pc = await pickCodec(fw, fh, fps, bitrate);
  if (!pc) { status(`Браузер не поддерживает кодирование ${fw}×${fh}. Выбери формат поменьше (1080p) или другой браузер.`); return; }
  exporting = true; $('render').disabled = true; progress(0); $('dlLink').hidden = true;
  const wasPlaying = playing, t0 = performance.now(); video.pause();
  const comp = document.createElement('canvas'); comp.width = fw; comp.height = fh; const cctx = comp.getContext('2d');
  hudOff.width = fw; hudOff.height = fh;
  try {
    setRenderSize(fw, fh); fitCamera();
    const target = new Mp4Muxer.ArrayBufferTarget();
    let audioCfg = null, audioMux = 'aac';
    if ($('expAud').checked && audioBuf && window.AudioEncoder) {
      for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {       // AAC plays everywhere; Opus-in-MP4 only if the browser cannot encode AAC
        const c = {codec, sampleRate: audioBuf.sampleRate, numberOfChannels: Math.min(2, audioBuf.numberOfChannels), bitrate: 192000};
        try { if ((await AudioEncoder.isConfigSupported(c)).supported) { audioCfg = c; audioMux = mux; break; } } catch (e) {}
      }
    }
    const mopts = {target, video: {codec: pc.mux, width: fw, height: fh, frameRate: fps}, fastStart: 'in-memory'};
    if (audioCfg) mopts.audio = {codec: audioMux, numberOfChannels: audioCfg.numberOfChannels, sampleRate: audioCfg.sampleRate};
    const muxer = new Mp4Muxer.Muxer(mopts);
    let err = null;
    const enc = new VideoEncoder({output: (c, m) => muxer.addVideoChunk(c, m), error: e => err = e});
    enc.configure(pc.config);
    for (let i = 0; i < frames; i++) {
      if (err) throw err;
      await seekTo(Math.min(st + i / fps, vdur - 0.001));
      renderAt(i / fps, fw, fh, comp, cctx);
      const vf = new VideoFrame(comp, {timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps)});
      enc.encode(vf, {keyFrame: i % (fps * 2) === 0}); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (i % 2 === 0) { progress(i / frames); const el = (performance.now() - t0) / 1000, eta = i > 20 ? Math.round(el / i * (frames - i)) : null;
        status(`Рендер: кадр ${i + 1} из ${frames} (${fw}×${fh})` + (eta !== null ? ` · осталось ~${eta >= 90 ? Math.round(eta / 60) + ' мин' : eta + ' с'}. Не закрывай и не сворачивай вкладку.` : '')); await tick(); }
    }
    await enc.flush(); enc.close();
    if (audioCfg) {
      status('Кодирую звук…');
      let aerr = null; const aenc = new AudioEncoder({output: (c, m) => muxer.addAudioChunk(c, m), error: e => aerr = e}); aenc.configure(audioCfg);
      const sr = audioBuf.sampleRate, ch = audioCfg.numberOfChannels, a0 = Math.round(st * sr), a1 = Math.min(audioBuf.length, Math.round((st + D) * sr)), CH = 4096;
      for (let o = a0; o < a1; o += CH) {
        if (aerr) throw aerr;
        const n = Math.min(CH, a1 - o), data = new Float32Array(n * ch);
        for (let c = 0; c < ch; c++) data.set(audioBuf.getChannelData(c).subarray(o, o + n), c * n);
        aenc.encode(new AudioData({format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((o - a0) / sr * 1e6), data}));
        while (aenc.encodeQueueSize > 24) await new Promise(r => setTimeout(r, 4));
      }
      await aenc.flush(); aenc.close(); if (aerr) throw aerr;
    }
    muxer.finalize();
    if (err) throw err;
    lastBlob = new Blob([target.buffer], {type: 'video/mp4'}); lastName = `video-field_${fw}x${fh}_${D}s.mp4`;
    const link = $('dlLink'); link.textContent = `⬇ Сохранить ${lastName} · ${(lastBlob.size / 1048576).toFixed(1)} МБ`; link.hidden = false;
    progress(1); status('Готово' + (audioCfg ? (audioMux === 'aac' ? ' (со звуком)' : ' (со звуком Opus: браузер не умеет AAC)') : '') + '. Нажми кнопку «Сохранить» рядом.');
  } catch (e) {
    status('Не получилось: ' + (e && e.message || e));
  } finally {
    exporting = false; $('render').disabled = false; layoutStage(); await seekTo(st);
    if (wasPlaying) playVideo();
  }
}
$('render').onclick = runExport;
let lastBlob = null, lastName = '';
$('dlLink').onclick = async () => {
  if (!lastBlob) return;
  let d = null; try { d = window.claude && await window.claude.use('downloads'); } catch (e) {}
  if (d) {
    try { await d.save({filename: lastName, data: lastBlob}); status('Файл сохранён.'); }
    catch (e) { status(e && e.code === 'declined' ? 'Сохранение отменено.' : 'Не удалось сохранить: ' + (e && (e.message || e.code))); }
    return;
  }
  const url = URL.createObjectURL(lastBlob), a = document.createElement('a'); a.href = url; a.download = lastName; document.body.appendChild(a); a.click(); a.remove();
};


// ---------------------------------------------------------------- interface: effect library, shot inspector, palette, transport, timeline, hotkeys
let uiFlags = {insp: true, tl: true};
function uiDirty(){ uiFlags.insp = true; tlDirty = true; }
const h = (tag, attrs, ...kids) => { const el = document.createElement(tag); if (attrs) for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v); } kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
const ICON = {
  play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>', back: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>', fwd: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>', fb: '<path d="M15 6l-8 6 8 6z"/><path d="M6 6h2v12H6z"/>', ff: '<path d="M9 6l8 6-8 6z"/><path d="M16 6h2v12h-2z"/>',
  razor: '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8 8.5L20 18M8 15.5L20 6" fill="none" stroke="currentColor" stroke-width="2"/>', sel: '<path d="M5 3l13 8-6 1.5L9 19z"/>', snap: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/>',
  loop: '<path d="M7 7h9l-2-2 1.4-1.4L20 8l-4.6 4.4L14 11l2-2H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 10H8l2 2-1.4 1.4L4 16l4.6-4.4L10 13l-2 2h9a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5z"/>',
  undo: '<path d="M12 5V2L6 7l6 5V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z"/>', redo: '<path d="M12 5V2l6 5-6 5V8a6 6 0 1 0 6 6h2a8 8 0 1 1-8-9z"/>', plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>', x: '<path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>',
  copy: '<path d="M8 3h11v13h-2V5H8zM5 7h11v14H5z"/>', eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>', flag: '<path d="M6 3h2v18H6zM9 4h10l-3 4 3 4H9z"/>', star: '<path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7.5L12 17l-6.3 4.5L8 14 2 9.5h7.5z"/>', kbd: '<path d="M3 6h18v12H3zm3 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM6 13v2h12v-2z"/>', film: '<path d="M4 3h16v18H4zm2 2v2h2V5zm0 4v2h2V9zm0 4v2h2v-2zm0 4v2h2v-2zm10-12v2h2V5zm0 4v2h2V9zm0 4v2h2v-2zm0 4v2h2v-2zM10 5v14h4V5z"/>'};
const icon = (n, s = 18) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', s); el.setAttribute('height', s); el.setAttribute('fill', 'currentColor'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = ICON[n]; return el; };
document.querySelectorAll('[data-ic]').forEach(b => b.prepend(icon(b.dataset.ic, +b.dataset.sz || 18)));

// ---- tabs
document.querySelectorAll('.tabs').forEach(tb => tb.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; tb.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  const scope = tb.dataset.scope; document.querySelectorAll(`[data-pane-of="${scope}"]`).forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab); }));
const openTab = (scope, tab) => document.querySelector(`.tabs[data-scope="${scope}"] button[data-tab="${tab}"]`).click();

// ---- effect library
let libMode = 'fx';
function renderLib(){
  const box = $('libList'), q = $('libSearch').value.trim().toLowerCase(); box.innerHTML = '';
  if (libMode === 'fx') Object.entries(CATS).forEach(([cat, [name, hue]]) => {
    const items = Object.values(EFX).filter(e => e.cat === cat && (!q || (e.name + ' ' + e.desc).toLowerCase().includes(q)));
    if (!items.length) return;
    box.append(h('div', {class: 'cat', style: `--h:${hue}`}, h('span', {class: 'catdot'}), name, h('em', null, items.length)));
    const grid = h('div', {class: 'cards'}); items.forEach(e => grid.append(h('button', {class: 'card', style: `--h:${hue}`, title: e.desc, onclick: ev => addEffect(e.id, $('allClip').checked || ev.altKey)}, h('b', null, e.name), h('small', null, e.desc))));
    box.append(grid);
  });
  else {
    const grid = h('div', {class: 'cards one'});
    Object.entries(PRESETS).filter(([k, p]) => !q || p.name.toLowerCase().includes(q)).forEach(([k, p]) => grid.append(h('button', {class: 'card', style: `--h:${CATS[EFX[p.stack[0][0]].cat][1]}`, title: 'Заменить стек выбранного шота', onclick: () => usePreset(selShot, k)},
      h('b', null, p.name), h('small', null, p.stack.map(([id]) => EFX[id].name).join(' · ')))));
    box.append(grid);
  }
}
$('libSearch').addEventListener('input', renderLib);
$('libTabs').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; libMode = b.dataset.m; $('libTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderLib(); });

// ---- shot inspector
function paramRow(it, P, s){
  if (P.opts) { const sel = h('select', {onchange: e => { it.p[P.k] = isNaN(+e.target.value) || e.target.value === '' ? e.target.value : +e.target.value; s.edited = true; }, onfocus: () => pushUndo()}, P.opts.map(([v, t]) => h('option', {value: v, selected: String(it.p[P.k]) === String(v)}, t)));
    return h('div', {class: 'prow'}, h('span', null, P.l), sel); }
  const out = h('output', null, '');
  const inp = h('input', {type: 'range', min: P.min, max: P.max, step: P.step, value: it.p[P.k], onpointerdown: () => pushUndo(), oninput: e => { it.p[P.k] = +e.target.value; out.textContent = fmtP(+e.target.value, P.step); s.edited = true; $('shotTag').hidden = false; tlDirty = true; }});
  out.textContent = fmtP(+it.p[P.k], P.step); return h('div', {class: 'prow'}, h('span', null, P.l), inp, out);
}
const fmtP = (v, st) => st >= 1 ? String(Math.round(v)) : st < 0.01 ? v.toFixed(3) : v.toFixed(2);
function renderShotPane(){
  const box = $('shotPane'); box.innerHTML = ''; const s = shots[selShot];
  if (!s) { box.append(h('div', {class: 'empty-state'}, h('b', null, 'Здесь появятся настройки шота'), h('p', null, 'Открой видео. Авто-режиссёр разрежет его на шоты по тактам и подберёт эффекты. Любой шот можно выбрать на таймлайне и править.'))); return; }
  box.append(h('div', {class: 'shothead'}, h('div', null, h('b', null, `Шот ${selShot + 1} из ${shots.length}`), h('span', {class: 'tc'}, `${fmtTC(s.t0)} – ${fmtTC(s.t1)} · ${(s.t1 - s.t0).toFixed(1)} с`)),
    h('span', {class: 'badge', id: 'shotTag', hidden: !s.edited}, 'правлен')));
  box.append(h('div', {class: 'frow'}, h('label', null, 'Образ', h('select', {id: 'shotPreset', onchange: e => usePreset(selShot, e.target.value)}, Object.entries(PRESETS).map(([k, p]) => h('option', {value: k, selected: k === s.key}, p.name)))),
    h('label', null, 'Переход в шот', h('select', {onchange: e => { pushUndo(); s.enter = +e.target.value; s.edited = true; }}, [[0, 'Резкий'], [1, 'Смаз'], [2, 'Зум-удар'], [3, 'Глитч'], [4, 'Вспышка']].map(([v, t]) => h('option', {value: v, selected: +s.enter === v}, t))))));
  const rr = h('output', null, (s.react ?? 1).toFixed(2));
  box.append(h('div', {class: 'prow wide'}, h('span', null, 'Реакция на звук'), h('input', {type: 'range', min: 0, max: 2, step: 0.05, value: s.react ?? 1, onpointerdown: () => pushUndo(), oninput: e => { s.react = +e.target.value; rr.textContent = (+e.target.value).toFixed(2); s.edited = true; }}), rr));
  box.append(h('div', {class: 'btnrow'}, h('button', {class: 'mini', onclick: () => splitAt(video.currentTime), title: 'Ctrl+K или C'}, icon('razor', 15), 'Разрезать'), h('button', {class: 'mini', onclick: () => mergePrev(selShot), title: 'Shift+Delete'}, 'Склеить с предыдущим'), h('button', {class: 'mini', onclick: () => usePreset(selShot, s.key)}, 'Сбросить')));
  box.append(h('div', {class: 'stackhead'}, 'Стек эффектов', h('small', null, s.stack.length ? 'порядок не важен, все складываются' : 'пусто')));
  if (!s.stack.length) box.append(h('p', {class: 'sub'}, 'Нажми любой эффект слева, чтобы добавить его в этот шот. Alt+клик или галочка «ко всему клипу» добавит его во все шоты.'));
  s.stack.forEach((it, k) => { const d = EFX[it.id]; if (!d) return;
    const head = h('div', {class: 'fxhead', onclick: () => { selFx = k; renderShotPane(); tlDirty = true; }}, h('i', {class: 'fxdot', style: `--h:${CATS[d.cat][1]}`}), h('b', null, d.name),
      h('span', {class: 'spacer'}), h('button', {class: 'ic' + (it.on === false ? '' : ' on'), title: 'Включить / выключить', onclick: e => { e.stopPropagation(); pushUndo(); it.on = it.on === false ? true : false; s.edited = true; renderShotPane(); }}, icon('eye', 15)),
      h('button', {class: 'ic', title: 'Дублировать (Ctrl+D)', onclick: e => { e.stopPropagation(); dupEffect(selShot, k); }}, icon('copy', 14)), h('button', {class: 'ic', title: 'Удалить (Delete)', onclick: e => { e.stopPropagation(); removeEffect(selShot, k); }}, icon('x', 14)));
    box.append(h('div', {class: 'fxitem' + (k === selFx ? ' sel' : '') + (it.on === false ? ' off' : ''), 'data-k': k}, head, d.params.map(P => paramRow(it, P, s)))); });
}
function renderPalette(){ setPalette({}); }
ROLES.forEach(([k]) => $('pal_' + k).addEventListener('input', e => { setPalette({[k]: unhex(e.target.value)}, true); status('Палитра изменена: все эффекты берут цвета из неё.'); }));
$('btnPalDetect').onclick = async () => { if (!hasVideo) return; status('Определяю палитру…'); const was = playing; await visualAnalyse(); if (was) setPlaying(true); status('Палитра определена заново.'); };

// ---- transport + hotkeys
function uiTransport(){
  const b = $('btnPlay'); b.innerHTML = ''; b.append(icon(playing ? 'pause' : 'play', 24)); b.setAttribute('aria-label', playing ? 'Пауза' : 'Играть'); b.classList.toggle('on', playing);
  $('btnLoop').classList.toggle('on', loopShot); $('btnSnap').classList.toggle('on', snapOn); $('toolSel').classList.toggle('on', tool === 'select'); $('toolRazor').classList.toggle('on', tool === 'razor');
  $('spd').textContent = rate === 1 ? '1×' : rate + '×'; $('tlWrap').dataset.tool = tool; $('tl').style.cursor = tool === 'razor' ? 'crosshair' : 'default';
}
$('btnPlay').onclick = () => setPlaying(!playing);
$('btnFB').onclick = () => stepFrames(-1); $('btnFF').onclick = () => stepFrames(1); $('btnPrev').onclick = () => gotoShot(-1); $('btnNext').onclick = () => gotoShot(1);
$('btnLoop').onclick = () => { loopShot = !loopShot; uiTransport(); }; $('btnSnap').onclick = () => { snapOn = !snapOn; uiTransport(); status(snapOn ? 'Привязка к битам включена.' : 'Привязка к битам выключена.'); };
$('toolSel').onclick = () => { tool = 'select'; uiTransport(); }; $('toolRazor').onclick = () => { tool = 'razor'; uiTransport(); };
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
$('btnAuto').onclick = () => { if (!hasVideo) return; seed++; buildPlan(true); status('Авто-план перебрал шоты, которые ты не правил. Правленые остались на месте.'); };
$('btnHelp').onclick = () => $('help').hidden = !$('help').hidden; $('helpClose').onclick = () => $('help').hidden = true;
const SPEEDS = [0.25, 0.5, 1, 2, 4];
function speed(d){ const i = clamp(SPEEDS.indexOf(rate) + d, 0, SPEEDS.length - 1); rate = SPEEDS[i]; video.playbackRate = rate; uiTransport(); }
function addMarker(){ if (!hasVideo) return; pushUndo(); markers.push(+video.currentTime.toFixed(3)); markers.sort((a, b) => a - b); tlDirty = true; status(`Маркер на ${fmtTC(video.currentTime)}.`); }
addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(t.type)) || t.tagName === 'SELECT');
  if (typing) { if (e.key === 'Escape') t.blur(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey; let used = true;
  if (k === ' ') setPlaying(!playing);
  else if (k === 'k' || k === 'K') { if (ctrl) splitAt(video.currentTime); else setPlaying(false); }
  else if (k === 'l' || k === 'L') { if (!playing) { rate = 1; setPlaying(true); } else speed(1); }
  else if (k === 'j' || k === 'J') { if (playing) speed(-1); else stepFrames(-10); }
  else if (k === 'ArrowLeft') { if (sh) seekV(video.currentTime - 1); else stepFrames(-1); }
  else if (k === 'ArrowRight') { if (sh) seekV(video.currentTime + 1); else stepFrames(1); }
  else if (k === 'ArrowUp') gotoShot(-1); else if (k === 'ArrowDown') gotoShot(1);
  else if (k === 'Home') seekV(getStart()); else if (k === 'End') seekV(getStart() + getDur() - 0.04);
  else if (k === 'c' || k === 'C') { if (ctrl) used = false; else { tool = tool === 'razor' ? 'select' : 'razor'; uiTransport(); } }
  else if (k === 'v' || k === 'V') { tool = 'select'; uiTransport(); }
  else if (k === 's' || k === 'S') { if (ctrl) used = false; else { snapOn = !snapOn; uiTransport(); } }
  else if (k === 'm' || k === 'M') addMarker();
  else if (k === 'i' || k === 'I') { const v = clamp(video.currentTime, 0, vdur - 0.5); const end = getStart() + getDur(); $('tStart').value = v.toFixed(1); $('dur').value = clamp(end - v, 0.5, MAX_DUR).toFixed(1); syncLimits(); status(`Начало экспорта: ${fmtTC(v)}.`); }
  else if (k === 'o' || k === 'O') { const st = getStart(); $('dur').value = clamp(video.currentTime - st, 0.5, MAX_DUR).toFixed(1); syncLimits(); status(`Конец экспорта: ${fmtTC(video.currentTime)}.`); }
  else if (k === 'x' || k === 'X') { $('tStart').value = 0; $('dur').value = Math.min(MAX_DUR, vdur).toFixed(1); syncLimits(); status('Диапазон экспорта сброшен.'); }
  else if (k === 'z' || k === 'Z') { if (ctrl) { sh ? redo() : undo(); } else used = false; }
  else if (k === 'y' || k === 'Y') { if (ctrl) redo(); else used = false; }
  else if (k === 'd' || k === 'D') { if (ctrl) dupEffect(selShot, selFx); else used = false; }
  else if (k === 'Delete' || k === 'Backspace') { if (sh) mergePrev(selShot); else if (selFx >= 0) removeEffect(selShot, selFx); else used = false; }
  else if (k === '[') { const s = shots[selShot]; if (s) { selFx = Math.max(0, selFx - 1); renderShotPane(); tlDirty = true; } }
  else if (k === ']') { const s = shots[selShot]; if (s) { selFx = Math.min(s.stack.length - 1, selFx + 1); renderShotPane(); tlDirty = true; } }
  else if (k === '=' || k === '+') tlZoom(1.4); else if (k === '-' || k === '_') tlZoom(1 / 1.4); else if (k === '\\') tlFit();
  else if (k === '/') { $('libSearch').focus(); }
  else if (k === '?') $('help').hidden = !$('help').hidden;
  else if (k === 'Escape') { $('help').hidden = true; tool = 'select'; selFx = -1; uiTransport(); renderShotPane(); }
  else if (k === 'Enter' && ctrl) { if (!$('render').disabled) runExport(); }
  else used = false;
  if (used) { e.preventDefault(); if (t && t.blur && (t.type === 'range' || t.tagName === 'BUTTON')) t.blur(); }
});
document.addEventListener('pointerup', e => { const t = e.target; if (t && t.type === 'range' && t.closest('#insp, #shotPane')) { /* keep focus on slider for fine keyboard tweaks */ } });

// ---- timeline
const tl = $('tl'), tlx = tl.getContext('2d');
const TLM = {ruler: 22, wave: 58, hits: 16, shots: 34, fxRow: 16, rows: 6, gut: 66};
let tv0 = 0, tv1 = 10, tlW = 0, tlH = 0, tlDpr = 1, tlStatic = document.createElement('canvas'), tlHover = null;
const tlFamHue = fam => ({g: 36, w: 275, l: 190, v: 14, p: 150, k: 300, x: 350, o: 215}[fam] ?? 200);
function sizeTimeline(){ const r = tl.getBoundingClientRect(); tlDpr = Math.min(2, devicePixelRatio || 1); tlW = Math.max(100, Math.round(r.width * tlDpr)); tlH = Math.max(60, Math.round(r.height * tlDpr)); tl.width = tlStatic.width = tlW; tl.height = tlStatic.height = tlH; tlDirty = true; }
function tlFit(){ tv0 = 0; tv1 = Math.max(1, vdur || 10); tlDirty = true; }
function tlZoom(f, cx){ const c = cx ?? (video.currentTime || (tv0 + tv1) / 2), span = (tv1 - tv0) / f, a = (c - tv0) / (tv1 - tv0); tv0 = c - span * a; tv1 = tv0 + span; if (span > vdur) tlFit(); else { if (tv0 < 0) { tv1 -= tv0; tv0 = 0; } if (tv1 > vdur) { tv0 -= tv1 - vdur; tv1 = vdur; } tv0 = Math.max(0, tv0); } tlDirty = true; }
const tX = t => TLM.gut * tlDpr + (t - tv0) / (tv1 - tv0) * (tlW - TLM.gut * tlDpr), tT = x => tv0 + (x - TLM.gut * tlDpr) / (tlW - TLM.gut * tlDpr) * (tv1 - tv0);
function drawTlStatic(){
  const c = tlStatic.getContext('2d'), w = tlW, hh = tlH, k = tlDpr, g = TLM.gut * k, span = tv1 - tv0;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0d12'; c.fillRect(0, 0, w, hh); c.font = `${Math.round(9.5 * k)}px ui-monospace, Menlo, monospace`; c.textBaseline = 'middle';
  const y0 = {ruler: 0, wave: TLM.ruler * k}; y0.hits = y0.wave + TLM.wave * k; y0.shots = y0.hits + TLM.hits * k; y0.fx = y0.shots + TLM.shots * k + 3 * k;
  // lane labels
  c.fillStyle = '#0f1218'; c.fillRect(0, 0, g, hh); c.fillStyle = '#7d8794';
  [['ЗВУК', y0.wave + TLM.wave * k / 2], ['УДАРЫ', y0.hits + TLM.hits * k / 2], ['ШОТЫ', y0.shots + TLM.shots * k / 2], ['ЭФФЕКТЫ', y0.fx + 8 * k]].forEach(([n, y]) => c.fillText(n, 8 * k, y));
  c.save(); c.beginPath(); c.rect(g, 0, w - g, hh); c.clip();
  // ruler
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]; const st = steps.find(s => span / s < (w - g) / (70 * k)) || 300;
  c.strokeStyle = 'rgba(255,255,255,.09)'; c.fillStyle = '#7d8794'; c.lineWidth = 1;
  for (let t = Math.ceil(tv0 / st) * st; t <= tv1; t += st) { const x = Math.round(tX(t)) + 0.5; c.beginPath(); c.moveTo(x, TLM.ruler * k * 0.55); c.lineTo(x, hh); c.stroke(); c.fillText(`${Math.floor(t / 60)}:${(t % 60).toFixed(st < 1 ? 1 : 0).padStart(st < 1 ? 4 : 2, '0')}`, x + 4 * k, TLM.ruler * k * 0.3); }
  // waveform + beat grid
  if (AU) {
    const px = Math.floor(w - g), bin = span * AH / px; c.fillStyle = 'rgba(120,200,255,.55)'; const mid = y0.wave + TLM.wave * k / 2;
    for (let x = 0; x < px; x += 2) { const i0 = Math.floor((tv0 + x / px * span) * AH), i1 = Math.max(i0 + 1, Math.floor(i0 + bin * 2)); let m = 0; for (let i = i0; i < i1 && i < AU.F; i++) m = Math.max(m, AU.E[3][i]); const hgt = Math.min(1, m) * TLM.wave * k * 0.95; c.fillRect(g + x, mid - hgt / 2, 1.6 * k, Math.max(1, hgt)); }
    const bpx = (w - g) / span * AU.beatLen; if (bpx > 4) for (let n = Math.ceil((tv0 - AU.off) / AU.beatLen);; n++) { const t = AU.off + n * AU.beatLen; if (t > tv1) break; if (t < tv0) continue; const bar = (((n - AU.bar0) % 4) + 4) % 4 === 0; c.strokeStyle = bar ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.13)'; c.beginPath(); c.moveTo(tX(t), y0.wave); c.lineTo(tX(t), y0.shots); c.stroke();
      if (bar && bpx * 4 > 30 * k) { c.fillStyle = '#9aa6b4'; c.fillText(String(Math.floor((n - AU.bar0) / 4) + 1), tX(t) + 3 * k, y0.wave + 8 * k); } }
    c.fillStyle = '#ff7a59'; AU.kicks.forEach(t => { if (t >= tv0 && t <= tv1) c.fillRect(tX(t), y0.hits + 1, 1.6 * k, TLM.hits * k * 0.6); });
    c.fillStyle = '#ffe28a'; AU.hats.forEach(t => { if (t >= tv0 && t <= tv1) c.fillRect(tX(t), y0.hits + TLM.hits * k * 0.62, 1.2 * k, TLM.hits * k * 0.3); });
    for (let x = 0; x < px; x += 3) { const v = AU.vp[Math.min(AU.F - 1, Math.floor((tv0 + x / px * span) * AH))]; if (v > 0.35) { c.fillStyle = `rgba(190,150,255,${0.15 + 0.5 * v})`; c.fillRect(g + x, y0.hits + TLM.hits * k * 0.9, 3 * k, 2 * k); } }
  } else { c.fillStyle = '#586270'; c.fillText(hasVideo ? 'в видео нет звука: темп и биты недоступны' : 'открой видео', g + 10 * k, y0.wave + TLM.wave * k / 2); }
  // shots
  shots.forEach((s, i) => { if (s.t1 < tv0 || s.t0 > tv1) return; const xa = Math.max(g, tX(s.t0)), xb = Math.min(w, tX(s.t1)), fam = PRESETS[s.key] ? PRESETS[s.key].fam : 'o', hue = tlFamHue(fam), sel = i === selShot;
    c.fillStyle = `hsla(${hue},65%,${sel ? 55 : 42}%,${sel ? 0.95 : 0.7})`; c.fillRect(xa + 1, y0.shots, Math.max(1, xb - xa - 2), TLM.shots * k);
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 1.5 * k; c.strokeRect(xa + 1.5, y0.shots + 0.5, Math.max(1, xb - xa - 3), TLM.shots * k - 1); }
    c.fillStyle = '#fff'; c.font = `600 ${Math.round(10.5 * k)}px ui-sans-serif, system-ui, sans-serif`; c.save(); c.beginPath(); c.rect(xa + 1, y0.shots, xb - xa - 2, TLM.shots * k); c.clip(); c.fillText(`${i + 1}  ${PRESETS[s.key] ? PRESETS[s.key].name : 'Свой'}${s.edited ? ' •' : ''}`, xa + 6 * k, y0.shots + TLM.shots * k / 2); c.restore(); c.font = `${Math.round(9.5 * k)}px ui-monospace, Menlo, monospace`;
    // effect chips
    s.stack.slice(0, TLM.rows).forEach((it, r) => { const d = EFX[it.id]; if (!d) return; const y = y0.fx + r * (TLM.fxRow + 2) * k, hu = CATS[d.cat][1], selfx = sel && r === selFx;
      c.fillStyle = `hsla(${hu},60%,${selfx ? 60 : 38}%,${it.on === false ? 0.25 : selfx ? 1 : 0.78})`; c.fillRect(xa + 1, y, Math.max(1, xb - xa - 2), TLM.fxRow * k);
      if (selfx) { c.strokeStyle = '#fff'; c.lineWidth = 1.2 * k; c.strokeRect(xa + 1.5, y + 0.5, Math.max(1, xb - xa - 3), TLM.fxRow * k - 1); }
      c.fillStyle = it.on === false ? '#8a919c' : '#fff'; c.save(); c.beginPath(); c.rect(xa + 1, y, xb - xa - 2, TLM.fxRow * k); c.clip(); c.fillText(d.name, xa + 5 * k, y + TLM.fxRow * k / 2 + 0.5); c.restore(); });
    if (s.stack.length > TLM.rows) { c.fillStyle = '#9aa6b4'; c.fillText(`+${s.stack.length - TLM.rows}`, xa + 5 * k, y0.fx + TLM.rows * (TLM.fxRow + 2) * k + 4 * k); } });
  // markers
  markers.forEach((m, i) => { if (m < tv0 || m > tv1) return; const x = tX(m); c.fillStyle = '#ffd84a'; c.beginPath(); c.moveTo(x - 4 * k, 0); c.lineTo(x + 4 * k, 0); c.lineTo(x, 9 * k); c.fill(); c.strokeStyle = 'rgba(255,216,74,.35)'; c.beginPath(); c.moveTo(x, 9 * k); c.lineTo(x, hh); c.stroke(); });
  // export range
  const a = getStart(), b = a + getDur(); c.fillStyle = 'rgba(5,6,9,.62)'; if (a > tv0) c.fillRect(g, 0, Math.min(w - g, tX(a) - g), hh); if (b < tv1) c.fillRect(Math.max(g, tX(b)), 0, w, hh);
  c.fillStyle = 'rgba(255,255,255,.8)'; [[a, 1], [b, -1]].forEach(([t, d]) => { if (t < tv0 || t > tv1) return; const x = tX(t); c.fillRect(x - 0.5 * k, 0, 1.2 * k, hh); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 7 * k * d, 0); c.lineTo(x, 8 * k); c.fill(); });
  c.restore(); tlDirty = false;
}
function drawTimeline(){
  if (!tlW) sizeTimeline(); if (tlDirty) drawTlStatic();
  if (playing && hasVideo) { const t = video.currentTime; if (t < tv0 || t > tv1) { const span = tv1 - tv0; tv0 = clamp(t - span * 0.15, 0, Math.max(0, vdur - span)); tv1 = tv0 + span; tlDirty = true; } }
  tlx.setTransform(1, 0, 0, 1, 0, 0); tlx.drawImage(tlStatic, 0, 0);
  if (!hasVideo) return; const k = tlDpr, x = tX(video.currentTime);
  if (x >= TLM.gut * k && x <= tlW) { tlx.strokeStyle = '#ff4d5e'; tlx.lineWidth = 1.5 * k; tlx.beginPath(); tlx.moveTo(x, 0); tlx.lineTo(x, tlH); tlx.stroke(); tlx.fillStyle = '#ff4d5e'; tlx.beginPath(); tlx.moveTo(x - 5 * k, 0); tlx.lineTo(x + 5 * k, 0); tlx.lineTo(x, 9 * k); tlx.fill(); }
  if (tool === 'razor' && tlHover != null) { const hx = tX(tlHover); tlx.strokeStyle = 'rgba(255,255,255,.7)'; tlx.setLineDash([4 * k, 3 * k]); tlx.beginPath(); tlx.moveTo(hx, TLM.ruler * k); tlx.lineTo(hx, tlH); tlx.stroke(); tlx.setLineDash([]); }
}
// timeline pointer logic
let tlDrag = null;
const tlPos = e => { const r = tl.getBoundingClientRect(), px = (e.clientX - r.left) * (tlW / r.width), py = (e.clientY - r.top) * (tlH / r.height); return {px, py, t: tT(px), yy: py / tlDpr}; };
function nearCut(px){ for (let i = 1; i < shots.length; i++) if (Math.abs(tX(shots[i].t0) - px) < 7 * tlDpr) return i; return -1; }
tl.addEventListener('pointerdown', e => {
  if (!hasVideo) return; tl.setPointerCapture(e.pointerId); const {px, py, t, yy} = tlPos(e); if (px < TLM.gut * tlDpr) return;
  const yShots = TLM.ruler + TLM.wave + TLM.hits, yFx = yShots + TLM.shots + 3;
  if (yy < yShots) { tlDrag = {mode: 'seek'}; seekV(t); return; }
  if (tool === 'razor') { splitAt(t); return; }
  if (yy < yShots + TLM.shots) { const c = nearCut(px); if (c > 0) { pushUndo(); tlDrag = {mode: 'cut', i: c}; return; } selShot = shotIndexAt(t); selFx = -1; seekV(t); uiDirty(); tlDrag = {mode: 'seek'}; return; }
  const si = shotIndexAt(t), r = Math.floor((yy - yFx) / (TLM.fxRow + 2)); selShot = si; selFx = r >= 0 && r < shots[si].stack.length ? r : -1; seekV(t); uiDirty(); openTab('insp', 'shot');
});
tl.addEventListener('pointermove', e => { if (!hasVideo) return; const {px, t, yy} = tlPos(e); tlHover = t;
  if (tlDrag) { if (tlDrag.mode === 'seek') seekV(t); else if (tlDrag.mode === 'cut') { moveCut(tlDrag.i, snapT(t)); tlDirty = true; } return; }
  const yShots = TLM.ruler + TLM.wave + TLM.hits; tl.style.cursor = tool === 'razor' ? 'crosshair' : (yy >= yShots && yy < yShots + TLM.shots && nearCut(px) > 0 ? 'ew-resize' : 'default'); });
tl.addEventListener('pointerup', () => { if (tlDrag && tlDrag.mode === 'cut') uiDirty(); tlDrag = null; }); tl.addEventListener('pointerleave', () => { tlHover = null; });
tl.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.altKey) tlZoom(e.deltaY < 0 ? 1.25 : 0.8, tlPos(e).t); else { const span = tv1 - tv0, d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / 600 * span; tv0 = clamp(tv0 + d, 0, Math.max(0, vdur - span)); tv1 = tv0 + span; tlDirty = true; } }, {passive: false});
$('tlIn').onclick = () => tlZoom(1.4); $('tlOut').onclick = () => tlZoom(1 / 1.4); $('tlFit').onclick = tlFit;
addEventListener('resize', sizeTimeline);

// ---- preview loop
let uiTick = 0;
function frame(){
  if (!exporting && hasVideo) {
    const st = getStart(), D = getDur(), en = st + D, tn = video.currentTime;
    if (playing) { const sh = shots[shotIndexAt(tn)]; if (loopShot && sh && tn >= sh.t1 - 0.02) seekV(sh.t0); else if (tn >= en - 0.02) seekV(st); }
    tex.needsUpdate = true; updateCpu(); applyFrame(video.currentTime - st); renderGL(); composeFrame(vctx, view.width, view.height); drawHud(hctx, hud.width, hud.height);
    if (uiFlags.insp) { uiFlags.insp = false; renderShotPane(); }
    drawTimeline();
    if (++uiTick % 3 === 0) { $('tcode').textContent = `${fmtTC(video.currentTime)} / ${fmtTC(vdur)}`; $('shotNow').textContent = shotInfo.n ? `Шот ${shotInfo.i + 1}/${shotInfo.n} · ${shotInfo.name}` : ''; }
  } else if (!hasVideo) { if (tlDirty) drawTimeline(); }
  requestAnimationFrame(frame);
}
renderLib(); renderPalette(); renderShotPane(); uiTransport(); openTab('insp', 'shot');
window.__vf = {video, U, VU, LA, get edgeMax(){ return edgeMax; }, pickNodes: () => { analyseEdges(); return pickNodes().length; }, get G(){ return Object.fromEntries(['nDens','nThr','nMin','nMax','nStroke','nShape','geoColor','lMode'].map(k => [k, $(k).value])); }, get shots(){ return shots; }, get PAL(){ return PAL; }, get count(){ return count; }, get tracked(){ return tracked; }, EFX, PRESETS, setPlaying, stepFrames, splitAt, usePreset, addEffect, undo, redo, get tool(){ return tool; }};
layoutStage(); sizeTimeline(); requestAnimationFrame(frame);

})();
