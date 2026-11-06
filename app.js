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

// ---------------------------------------------------------------- GPU video pipeline: the clip itself is warped, re-coloured and re-printed in a shader
const VU = {uVid: {value: null}, uPrev: {value: null}, uFit: {value: new THREE.Vector2(1, 1)}, uOutAsp: {value: 1.78}, uRes: {value: new THREE.Vector2(1280, 720)}, uTime: {value: 0}, uPxS: {value: 1}, uVidA: {value: 1},
  uA: {value: new THREE.Vector4(1, 0, 0, 0)}, uB: {value: new THREE.Vector4()}, uC: {value: new THREE.Vector4()}, uD: {value: new THREE.Vector4()}, uE: {value: new THREE.Vector4()}, uF: {value: new THREE.Vector4()},
  uG: {value: new THREE.Vector4(0, 1, 0, 0)}, uH: {value: new THREE.Vector4(1, 1, 1, 0)}, uCam: {value: new THREE.Vector2()}, uC0: {value: new THREE.Vector3(0.02, 0.03, 0.08)}, uC1: {value: new THREE.Vector3(1, 0.95, 0.85)}, uC2: {value: new THREE.Vector3(0.25, 0.9, 0.95)}};
const VFS = `
varying vec2 vUv;
uniform sampler2D uVid, uPrev; uniform vec2 uFit, uRes, uCam; uniform float uOutAsp, uTime, uPxS, uVidA;
uniform vec4 uA, uB, uC, uD, uE, uF, uG, uH; uniform vec3 uC0, uC1, uC2;
float hash(float n){ return fract(sin(n*127.1)*43758.5453); }
float hash2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
vec3 tex(vec2 uv){ return texture2D(uVid, clamp(uv, vec2(0.001), vec2(0.999))).rgb; }
float lum(vec3 c){ return dot(c, vec3(0.299,0.587,0.114)); }
mat2 rot2(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec2 toVid(vec2 p){ vec2 q = vec2(p.x/uOutAsp, p.y) + 0.5; return (q - 0.5)/uFit + 0.5; }
float bayer4(vec2 q){ vec2 m = mod(q, 4.0); float x0 = mod(m.x, 2.0), x1 = floor(m.x/2.0), y0 = mod(m.y, 2.0), y1 = floor(m.y/2.0);
  return (abs(x0-y0)*8.0 + y0*4.0 + abs(x1-y1)*2.0 + y1)/16.0 + 0.03; }
void main(){
  float tr = uG.z; int tt = int(uG.w + 0.5);
  vec2 p = (vUv - 0.5)*vec2(uOutAsp, 1.0);
  p = rot2(uA.y)*p; p /= max(0.2, uA.x); p += uA.zw;                      // camera: push-in, roll, drift
  if (tt == 2) p *= 1.0 - 0.1*tr;
  int mm = int(uD.w + 0.5);                                                // mirror / kaleidoscope
  if (mm == 1) p.x = abs(p.x); else if (mm == 2) p = abs(p);
  else if (mm == 3) { float a = atan(p.y, p.x), r = length(p), seg = 1.0471976; a = abs(mod(a, seg) - seg*0.5); p = vec2(cos(a), sin(a))*r; }
  p *= 1.0 + uB.x*dot(p, p);                                               // lens
  p += vec2(sin(p.y*uB.z + uTime*uB.w), cos(p.x*uB.z*0.8 + uTime*uB.w*1.3))*uB.y;   // wave warp
  float sl = uC.y + (tt == 3 ? 0.12*tr : 0.0);                             // glitch slices
  if (sl > 0.001) { float tk = floor(uTime*10.0), band = floor(p.y*14.0 + 3.0*hash(tk)); float on = step(0.62, hash(band + tk*7.0)); p.x += (hash(band*3.1 + tk) - 0.5)*sl*2.0*on; }
  if (uC.z > 0.001) p = (floor(p/uC.z) + 0.5)*uC.z;                        // mosaic
  vec2 vuv = toVid(p);
  if (tt == 1) vuv.x += 0.22*tr*tr;
  if (uC.x > 0.0) { float e = 0.004; vec2 g = vec2(lum(tex(vuv + vec2(e,0.0))) - lum(tex(vuv - vec2(e,0.0))), lum(tex(vuv + vec2(0.0,e))) - lum(tex(vuv - vec2(0.0,e)))); vuv += g*uC.x*8.0; }   // the picture bends light by its own brightness
  if (uC.w > 0.0) { float d = lum(tex(vuv)); vuv += uCam*(d - 0.5)*uC.w; }   // brightness as depth: parallax
  vec2 dir = normalize(p + vec2(0.0001))*uD.x*(0.4 + length(p))*(tt == 3 ? 1.0 + 3.0*tr : 1.0);
  vec3 col;
  if (tt == 1 || tt == 2) { vec3 acc = vec3(0.0); for (int i = 0; i < 9; i++) { float k = float(i)/8.0 - 0.5; vec2 off = tt == 1 ? vec2(k*0.10*tr, 0.0) : (vuv - 0.5)*k*0.12*tr; acc += tex(vuv + off); } col = acc/9.0; }
  else col = vec3(tex(vuv + dir).r, tex(vuv).g, tex(vuv - dir).b);
  col *= step(0.0, vuv.x)*step(vuv.x, 1.0)*step(0.0, vuv.y)*step(vuv.y, 1.0);
  if (uD.z > 0.0) { float e = 0.0035; float a = lum(tex(vuv + vec2(-e,-e))), b = lum(tex(vuv + vec2(0.0,-e))), c = lum(tex(vuv + vec2(e,-e))), d = lum(tex(vuv + vec2(-e,0.0))), f = lum(tex(vuv + vec2(e,0.0))), g = lum(tex(vuv + vec2(-e,e))), h = lum(tex(vuv + vec2(0.0,e))), i = lum(tex(vuv + vec2(e,e)));
    float gx = (c + 2.0*f + i) - (a + 2.0*d + g), gy = (g + 2.0*h + i) - (a + 2.0*b + c); col += uC2*smoothstep(0.08, 0.7, length(vec2(gx, gy)))*uD.z; }   // contour light
  if (uD.y > 0.0) { vec3 bl = vec3(0.0); for (int i = 0; i < 8; i++) { float a = float(i)*0.785398; vec2 o = vec2(cos(a), sin(a))*0.012; bl += max(tex(vuv + o) - 0.55, 0.0) + 0.7*max(tex(vuv + o*2.4) - 0.55, 0.0); } col += bl/8.0*uD.y*1.3; }   // highlight bloom
  col *= uH.z; col = (col - 0.5)*uH.x + 0.5; float l = lum(col); col = mix(vec3(l), col, uH.y);        // exposure, contrast, saturation
  if (uE.x > 0.0) col = mix(col, mix(uC0, uC1, smoothstep(0.0, 1.0, lum(col))), uE.x);                 // duotone / split tone
  if (uE.y > 0.5) col = floor(col*uE.y + 0.5)/uE.y;                                                    // posterise
  if (uE.z > 0.5) { float cs = uE.z*uPxS; vec2 fc = gl_FragCoord.xy, cell = (floor(fc/cs) + 0.5)*cs, cp = (cell/uRes - 0.5)*vec2(uOutAsp, 1.0); vec3 cc = tex(toVid(cp));
    float rad = sqrt(clamp(1.0 - lum(cc)*1.08, 0.0, 1.0))*cs*0.74, m = smoothstep(rad + 0.9, rad - 0.9, length(fc - cell)); col = mix(uC1, mix(uC0, cc, 0.3), m); }   // halftone print
  if (uE.w > 0.5) { float cs = uE.w*uPxS; col = mix(uC0, uC1, step(bayer4(floor(gl_FragCoord.xy/cs)), lum(col))); }   // ordered dither
  if (uG.x > 0.0) { vec3 pv = texture2D(uPrev, (vUv - 0.5)/uG.y + 0.5).rgb; col = max(col, pv*uG.x); }   // echo: last frame, slightly zoomed
  col += (hash2(gl_FragCoord.xy + uTime*61.0) - 0.5)*uF.x*0.2;
  col *= 1.0 - uF.y*0.4*(0.5 - 0.5*sin(gl_FragCoord.y/uPxS*3.14159));
  col *= mix(1.0, smoothstep(1.15, 0.3, length((vUv - 0.5)*vec2(uOutAsp, 1.0))), uF.z);
  if (abs(vUv.y - 0.5) > 0.5 - uF.w) col = vec3(0.0);
  col += uH.w;
  gl_FragColor = vec4(max(col, 0.0)*uVidA, 1.0);
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
  if (ly('cloud') > 0.01) renderer.render(scene, camera);      // the point cloud is a light-only accent on top of the processed video
  const t = rtA; rtA = rtB; rtB = t;                           // rtB now holds the newest frame for the echo
}

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

// ---------------------------------------------------------------- controls
const bindRange = (id, fmt, fn) => { const el = $(id), o = el.parentElement.querySelector('output');
  const upd = () => { o.textContent = fmt(+el.value); fn && fn(+el.value); }; el.addEventListener('input', upd); upd(); };
const f2 = v => v.toFixed(2);
bindRange('density', v => v, null); $('density').addEventListener('change', buildGrid);
bindRange('bgThr', f2, applyBgUniforms); $('bgThr').addEventListener('change', pickTracked);
$('bgRemove').onchange = () => { applyBgUniforms(); pickTracked(); };
bindRange('depth', f2, v => U.uDepth.value = v);
bindRange('size', f2, v => U.uSize.value = v);
bindRange('depthY', f2, v => U.uDepthY.value = v);
bindRange('scatter', f2); bindRange('wind', f2, v => U.uWind.value = v);
bindRange('orbit', f2); bindRange('orbitN', String);
bindRange('float', f2, v => U.uFloat.value = v);
const FX = {fxPulse: 'uPulse', fxWave: 'uWave', fxMag: 'uMag', fxTurb: 'uTurb', fxScan: 'uScan'}, fxOn = {};
function applyFx(id){
  const on = !!fxOn[id], b = document.querySelector(`.sw[data-fx="${id}"]`);
  U[FX[id]].value = on ? +$(id).value : 0;
  if (b) { b.setAttribute('aria-pressed', on); b.textContent = on ? 'вкл' : 'выкл'; }
  tlDirty = true;
}
document.querySelectorAll('.sw[data-fx]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const id = b.dataset.fx; fxOn[id] = !fxOn[id]; applyFx(id); }));
Object.keys(FX).forEach(id => { fxOn[id] = 'init'; bindRange(id, f2, () => { if (fxOn[id] === 'init') return; fxOn[id] = true; applyFx(id); }); fxOn[id] = false; applyFx(id); });
[['fxPulseN', 'uPulseN'], ['fxWaveL', 'uWaveL'], ['fxWaveN', 'uWaveN'], ['fxScanW', 'uScanW'], ['fxScanN', 'uScanN'], ['fxTurbN', 'uTurbN']]
  .forEach(([id, u]) => bindRange(id, v => +$(id).step >= 1 ? String(v) : f2(v), v => U[u].value = v));
bindRange('magR', v => v + '%'); bindRange('magN', String);
$('fxWaveT').onchange = e => U.uWaveT.value = +e.target.value;
$('magPol').onchange = e => U.uMagPol.value = +e.target.value;
$('colorMode').onchange = e => U.uMode.value = +e.target.value;
bindRange('tCount', v => v, pickTracked); bindRange('tSize', v => v); bindRange('lAlpha', f2);
['tPick', 'tLinks'].forEach(id => $(id).onchange = pickTracked);
$('tPickColor').addEventListener('input', pickTracked);
$('reshuffle').onclick = () => { shuffleSeed++; pickTracked(); };
$('format').onchange = layoutStage;
document.querySelectorAll('.lbl').forEach(l => l.addEventListener('click', () => l.parentElement.classList.toggle('collapsed')));

// camera
let rotY = 0, rotX = 0, tRotY = 0, tRotX = 0, zoom = 1, tZoom = 1, baseZ = 600, dragging = false, px0 = 0, py0 = 0;
const MAXY = 90 * DEG, MAXX = 50 * DEG;
const setView = (y, x) => { tRotY = clamp(y, -MAXY, MAXY); tRotX = clamp(x, -MAXX, MAXX); };
document.querySelectorAll('.cams button').forEach(b => b.onclick = () => setView(+b.dataset.y * DEG, +b.dataset.x * DEG));
view.addEventListener('pointerdown', e => { dragging = true; px0 = e.clientX; py0 = e.clientY; view.setPointerCapture(e.pointerId); });
view.addEventListener('pointermove', e => { if (!dragging) return; setView(tRotY + (e.clientX - px0) * 0.005, tRotX + (e.clientY - py0) * 0.004); px0 = e.clientX; py0 = e.clientY; });
view.addEventListener('pointerup', () => dragging = false);
view.addEventListener('dblclick', () => setView(0, 0));
const joy = $('joy'), knob = $('knob'), JP = 11; let joyDrag = false;
const joyAt = e => { const r = joy.getBoundingClientRect();
  setView(-clamp((e.clientX - r.left - JP) / (r.width - 2 * JP) * 2 - 1, -1, 1) * MAXY, clamp((e.clientY - r.top - JP) / (r.height - 2 * JP) * 2 - 1, -1, 1) * MAXX); };
joy.addEventListener('pointerdown', e => { joyDrag = true; joy.setPointerCapture(e.pointerId); joyAt(e); });
joy.addEventListener('pointermove', e => joyDrag && joyAt(e));
joy.addEventListener('pointerup', () => joyDrag = false);
joy.addEventListener('dblclick', () => setView(0, 0));
joy.addEventListener('keydown', e => { const s = 5 * DEG, m = {ArrowLeft: [s, 0], ArrowRight: [-s, 0], ArrowUp: [0, -s], ArrowDown: [0, s]}[e.key]; if (m) { e.preventDefault(); setView(tRotY + m[0], tRotX + m[1]); } });
bindRange('zoom', v => f2(v) + '×', v => tZoom = v);
function updateCam(){
  rotY += (tRotY - rotY) * 0.12; rotX += (tRotX - rotX) * 0.12; zoom += (tZoom - zoom) * 0.12;
  const jw = joy.clientWidth - 2 * JP, jh = joy.clientHeight - 2 * JP;
  knob.style.left = (JP + (-tRotY / MAXY * 0.5 + 0.5) * jw) + 'px'; knob.style.top = (JP + (tRotX / MAXX * 0.5 + 0.5) * jh) + 'px';
  $('angles').textContent = `Y ${Math.round(tRotY / DEG)}° · X ${Math.round(-tRotX / DEG)}°`;
}

// ---------------------------------------------------------------- scene timeline (driven by the video clock)
const ease = v => { v = clamp(v, 0, 1); return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2; };
function scatterBase(kind, t, C){
  const u = t / C, m = +$('scatter').value;
  switch (kind) {
    case 'in': return m * (1 - ease((u - 0.05) / 0.7));
    case 'out': return m * ease((u - 0.2) / 0.7);
    case 'outin': return m * (u < 0.5 ? ease((u - 0.08) / 0.36) : 1 - ease((u - 0.56) / 0.36));
    case 'inout': return m * (u < 0.5 ? 1 - ease((u - 0.04) / 0.38) : ease((u - 0.58) / 0.38));
  }
  return 0;
}
// Short clip: the scenario spans the whole clip. Long clip: it plays in windows of one effect cycle
// (assemble at the start, scatter at the end, scatter-and-return in the middle), the rest stays assembled.
function scatterAt(t, D){
  const C = getCycle(), kind = $('scenario').value;
  if (C >= D - 1e-6) return scatterBase(kind, t, D);
  const endStart = D - C, midStart = (D - C) / 2;
  if (kind === 'in') return t < C ? scatterBase('in', t, C) : 0;
  if (kind === 'out') return t > endStart ? scatterBase('out', t - endStart, C) : 0;
  if (kind === 'inout') return t < C ? scatterBase('in', t, C) : t > endStart ? scatterBase('out', t - endStart, C) : 0;
  if (kind === 'outin') return t >= midStart && t <= midStart + C ? scatterBase('outin', t - midStart, C) : 0;
  return 0;
}
const getDur = () => +$('dur').value, getStart = () => +$('tStart').value, getCycle = () => Math.max(0.5, Math.min(+$('cyc').value, getDur()));
function applyScene(t){
  const D = getDur(), C = getCycle(), stat = $('scenario').value === 'static', o = stat ? 0 : +$('orbit').value, ph = TAU * t / C;
  U.uTime.value = t; U.uLoop.value = TAU / C;
  const mv = +$('magN').value, a = mv >= 5 ? TAU * t / C * (mv - 4) : Math.PI * mv / 10 * (1 - Math.cos(TAU * t / C));
  const hw = U.uWidth.value, hh = U.uHalfH.value, path = $('magPath').value, MP = U.uMagPos.value;
  if (path === 'circle') MP.set(Math.cos(a) * hw * 0.55, Math.sin(a) * hh * 0.55, 30);
  else if (path === 'eight') MP.set(Math.sin(a) * hw * 0.6, Math.sin(a * 2) * hh * 0.4, 30);
  else if (path === 'sweep') MP.set(-Math.cos(a) * hw * 0.85, Math.sin(a * 2) * hh * 0.1, 30);
  else MP.set(0, 0, 30);
  U.uMagR.value = +$('magR').value / 100 * hw * 2;
  U.uScatter.value = scatterAt(t, D);
  U.uFloat.value = stat ? 0 : +$('float').value;
  const po = ph * +$('orbitN').value;
  group.rotation.y = rotY + Math.sin(po) * 0.45 * o; group.rotation.x = rotX + Math.sin(po * 2) * 0.08 * o;
  group.updateMatrixWorld(); camera.position.z = baseZ / zoom;
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


// ---------------------------------------------------------------- graphic layers (contours, nodes, links, dither, curtain, plotter lines)
const lyOn = {nodes: false, links: false, dither: false, curtain: false, plot: false, glyph: false, glitch: false};
const LA = {video: 0, cloud: 1, nodes: 0, links: 0, dither: 0, curtain: 0, plot: 0, glyph: 0, glitch: 0};
let autoOn = false;
const ly = k => k === 'video' ? (autoOn ? (LA.video || 0) : num('underlay')) : autoOn ? (LA[k] || 0) : (k === 'cloud' ? ($('cloudOn').checked ? 1 : 0) : (lyOn[k] ? 1 : 0));
function toggleLayer(k){ if (autoOn) setAuto(false); if (k === 'cloud') $('cloudOn').checked = !$('cloudOn').checked; else lyOn[k] = !lyOn[k]; syncSwitches(); }
document.querySelectorAll('.sw[data-ly]').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); toggleLayer(b.dataset.ly); }));
function syncSwitches(){
  document.querySelectorAll('.sw[data-ly]').forEach(b => { const on = ly(b.dataset.ly) > 0.5; b.setAttribute('aria-pressed', on); b.textContent = on ? 'вкл' : 'выкл'; });
  tlDirty = true;
}
['underlay', 'gCols', 'gOp', 'xAmt', 'depthY', 'aGain', 'aBass', 'aMid', 'aHigh', 'aBeat', 'aScat', 'aFlash', 'nDens', 'nThr', 'nMin', 'nMax', 'nStroke', 'lDist', 'lConf', 'lOp', 'lW', 'dPitch', 'dThr', 'dCon', 'dOp', 'cDens', 'cLen', 'cOp', 'pLines', 'pCon', 'pDef', 'pW', 'pAnim', 'pVig']
  .forEach(id => bindRange(id, v => Number.isInteger(+$(id).step) && +$(id).step >= 1 ? String(v) : f2(v)));
const num = id => { const v = +$(id).value, f = AM[id]; return f ? f(v) : v; };
const PALETTES = {
  source: null, auto: [[63, 227, 242], [255, 77, 140]], cyan: [[63, 227, 242], [20, 120, 140]], solar: [[255, 190, 90], [255, 110, 40]], mono: [[240, 240, 240], [140, 140, 140]], violet: [[190, 150, 255], [110, 70, 220]],
};
const autoInks = () => { const a = PALETTES.auto[0], b = PALETTES.auto[1], h = c => '#' + c.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join(''); return [h(a.map(v => v * 0.45)), h(b.map(v => 215 + v * 0.14))]; };
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
const fxBase = id => fxOn[id] ? +$(id).value : 0;
function applyAudio(t){
  const a = $('audOn').checked && AU ? aAt(getStart() + t) : (AV.on = false, AV), g = AV.on ? num('aGain') : 0;
  const B = a.bass * num('aBass') * g, M = a.mid * num('aMid') * g, H = a.high * num('aHigh') * g, K = a.kick * num('aBeat') * g;
  AV.B = B; AV.M = M; AV.H = H; AV.K = K;
  U.uPulse.value = fxBase('fxPulse') + B * 0.5; U.uWave.value = fxBase('fxWave') + M * 0.35; U.uTurb.value = fxBase('fxTurb') + H * 0.4;
  U.uScan.value = fxBase('fxScan') + (K > 0.15 ? K * 0.8 : 0); U.uSize.value = +$('size').value + K * 0.8; U.uDepth.value = +$('depth').value * (1 + B * 0.6);
  if (g > 0) U.uScatter.value = Math.max(U.uScatter.value, K * num('aScat'));
  camera.position.z = baseZ / (zoom * (1 + K * 0.035));
  AM = {};
  if (g > 0) {
    AM.nDens = v => v * (1 + 0.7 * K); AM.nMax = v => v * (1 + 0.5 * K); AM.lOp = v => clamp(v + 0.4 * M, 0, 1); AM.cLen = v => v * (1 + 0.8 * B);
    AM.pCon = v => v * (1 + 0.5 * B); AM.pAnim = v => v + 3 * H; AM.dThr = v => clamp(v + 0.12 * (a.hat - 0.3), 0.2, 0.8); AM.gSize = v => v * (1 + 0.5 * K);
  }
}
// ---------------------------------------------------------------- HUD (markers, links, frame), drawn in target-frame pixels
const v3 = new THREE.Vector3(), sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
function drawHud(ctx, w, h){
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  if (!count) return;
  const k = Math.min(w, h) / 700, t = U.uTime.value, col = $('tColor').value === 'cyan' ? '63,227,242' : '235,248,252';
  if ($('magShow').checked && U.uMag.value > 0) {
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
    if (autoOn && shot.n) {   // shot slate
      const age = shot.t, al = clamp(1.4 - age / 1.8, 0, 1) * 0.9; if (al > 0.02) { ctx.fillStyle = `rgba(235,248,252,${al})`; ctx.textAlign = 'right'; ctx.fillText(`SHOT ${String(shot.i + 1).padStart(2, '0')}/${String(shot.n).padStart(2, '0')}   ${shot.name.toUpperCase()}`, w - m - 8 * k, m + 14 * k); ctx.textAlign = 'start'; }
    }
    if (AV.on) {   // scope: three band meters + four beat cells, bottom right
      const bx = w - m - 90 * k, by = h - m - 6 * k, bw = 14 * k;
      [AV.bass, AV.mid, AV.high].forEach((v, n) => { ctx.fillStyle = 'rgba(160,220,235,.25)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k, bw, 30 * k); ctx.fillStyle = 'rgba(160,220,235,.85)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k * Math.min(1, v), bw, 30 * k * Math.min(1, v)); });
      for (let n = 0; n < 4; n++) { ctx.fillStyle = n === AV.beatInBar ? 'rgba(160,220,235,.95)' : 'rgba(160,220,235,.25)'; ctx.fillRect(bx + 3 * (bw + 4 * k) + 6 * k + n * 7 * k, by - 7 * k, 5 * k, 5 * k); }
      if (AV.vox > 0.4) { ctx.fillStyle = `rgba(160,220,235,${Math.min(1, AV.vox)})`; ctx.fillText('VOX', m + 8 * k, m + 14 * k); }
    }
  }
}

// ---------------------------------------------------------------- video loading + playback
let playing = true, objUrl = null;
function playVideo(){ video.muted = !$('snd').checked; const r = video.play(); if (r && r.catch) r.catch(() => { video.muted = true; video.play().catch(() => {}); }); }
const fmtT = v => v.toFixed(1) + ' с';
bindRange('dur', fmtT); bindRange('tStart', fmtT); bindRange('cyc', fmtT);
function syncLimits(){
  const start = getStart(), maxD = Math.min(MAX_DUR, Math.max(0.5, vdur - start));
  $('dur').max = maxD.toFixed(1); if (getDur() > maxD) $('dur').value = maxD.toFixed(1);
  setOut('dur', fmtT(getDur()));
}
$('tStart').addEventListener('input', () => { syncLimits(); video.currentTime = getStart(); });
$('dur').addEventListener('input', () => { if (video.currentTime > getStart() + getDur()) video.currentTime = getStart(); });
$('play').onclick = () => { playing = !playing; if (hasVideo) playing ? playVideo() : video.pause();
  $('play').textContent = playing ? '❚❚ Пауза' : '▶ Играть'; $('play').classList.toggle('on', playing); };
$('time').addEventListener('input', e => { if (!hasVideo) return; video.currentTime = getStart() + +e.target.value * getDur() * 0.999; if (playing) $('play').click(); });

function loadVideo(file){
  if (!file || !file.type.startsWith('video/')) { status('Это не видеофайл.'); return; }
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(file); hasVideo = false; $('render').disabled = true;
  video.onloadedmetadata = async () => {
    vdur = video.duration;
    if (!isFinite(vdur) || !video.videoWidth) { status('Не удалось прочитать видео. Попробуй MP4 (H.264) или WebM.'); return; }
    $('tStart').max = Math.max(0, vdur - 0.5).toFixed(1); $('tStart').value = 0;
    $('dur').max = Math.min(MAX_DUR, vdur).toFixed(1); $('dur').value = Math.min(MAX_DUR, vdur).toFixed(1);
    syncLimits(); setOut('tStart', fmtT(0));
    $('cyc').value = Math.min(6, getDur()).toFixed(1); setOut('cyc', fmtT(+$('cyc').value));
    $('format').value = 'src'; layoutStage();          // output frame = reference frame (up to 2560 on the long side)
    const big = Math.max(video.videoWidth, video.videoHeight);
    $('vinfo').textContent = `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${vdur.toFixed(1)} с` +
      (vdur > MAX_DUR ? ` · длиннее 5 минут: берётся фрагмент 5 мин, начало настраивается ползунком` : ' · длина клипа = длина оригинала') + (big > MAX_SIDE ? ' · больше 2K, в экспорте уменьшится' : '');
    if (tex) tex.dispose();
    await new Promise(r => { if (video.readyState >= 2) r(); else video.onloadeddata = r; });
    tex = new THREE.VideoTexture(video); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    U.uTex.value = tex; hasVideo = true; $('empty').hidden = true;
    buildGrid(); layoutStage(); $('render').disabled = false;
    video.currentTime = 0;
    if (playing) playVideo();
    detectFps();
    status('Анализирую звук…');
    const hasAudio = await analyseAudio(file);
    $('audInfo').textContent = hasAudio ? `Звук найден: темп ${AU.bpm.toFixed(0)} BPM, ${AU.kicks.length} ударов, ${AU.sections.length} секций по громкости. Слова не распознаются: голос определяется по ритму слогов.` : 'В файле нет звука, который удалось прочитать. Реакция на ритм отключена.';
    $('audOn').checked = hasAudio; $('audOn').disabled = !hasAudio; $('expAud').disabled = !hasAudio; $('snd').disabled = !hasAudio;
    document.dispatchEvent(new CustomEvent('vf-ready'));
    status('Готово к просмотру. Настрой эффекты или оставь авто-режим и жми «Скачать MP4».');
  };
  video.onerror = () => status('Браузер не смог открыть это видео. Попробуй MP4 (H.264) или WebM.');
  video.src = objUrl;
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
    else {
      const d = ts.slice(1).map((v, i) => v - ts[i]).filter(x => x > 0.004 && x < 0.1).sort((a, b) => a - b);
      if (d.length < 5) return;
      const fps = 1 / d[d.length >> 2]; best = [24, 25, 30, 60].reduce((a, b) => Math.abs(b - fps) < Math.abs(a - fps) ? b : a);
    }
    $('fps').value = String(best); } };
  video.requestVideoFrameCallback(cb);
}
$('snd').onchange = () => { video.muted = !$('snd').checked; };
$('vidFile').onchange = e => loadVideo(e.target.files[0]);
let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop').hidden = true; loadVideo(e.dataTransfer.files[0]); });


// ---------------------------------------------------------------- auto director: reads picture + sound, cuts the clip into sections, gives each one a look
let VT = null, planSecs = [], curSec = -1, seed = 1;
const hsl2rgb = (h, sa, l) => { const a = sa * Math.min(l, 1 - l), f = n => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); }; return [f(0), f(8), f(4)]; };
async function visualAnalyse(){
  const st = getStart(), D = getDur(), N = 8, Wc = 64, Hc = Math.max(16, Math.round(64 / aspect));
  const c = document.createElement('canvas'); c.width = Wc; c.height = Hc; const x = c.getContext('2d', {willReadFrequently: true});
  const grab = () => { x.drawImage(video, 0, 0, Wc, Hc); return x.getImageData(0, 0, Wc, Hc).data; };
  const was = playing; video.pause();
  let lum = 0, con = 0, edge = 0, sat = 0, mot = 0; const hue = new Float32Array(36);
  for (let n = 0; n < N; n++) {
    const ts = st + (n + 0.5) / N * D;
    await seekTo(Math.min(ts, vdur - 0.25)); const a = grab();
    await seekTo(Math.min(ts + 0.15, vdur - 0.05)); const b = grab();
    const L = new Float32Array(Wc * Hc); let m = 0, m2 = 0, sa = 0, mo = 0;
    for (let i = 0; i < Wc * Hc; i++) {
      const r = a[i * 4] / 255, g = a[i * 4 + 1] / 255, bl = a[i * 4 + 2] / 255, mx = Math.max(r, g, bl), mn = Math.min(r, g, bl), l = 0.299 * r + 0.587 * g + 0.114 * bl;
      L[i] = l; m += l; m2 += l * l; const sv = mx > 0.001 ? (mx - mn) / mx : 0; sa += sv;
      if (sv > 0.2 && mx > 0.15) { const d = mx - mn; let hh = mx === r ? ((g - bl) / d) % 6 : mx === g ? (bl - r) / d + 2 : (r - g) / d + 4; hh = (hh * 60 + 360) % 360; hue[Math.floor(hh / 10) % 36] += sv * mx; }
      mo += Math.abs(l - (0.299 * b[i * 4] + 0.587 * b[i * 4 + 1] + 0.114 * b[i * 4 + 2]) / 255);
    }
    let e = 0; for (let y = 0; y < Hc - 1; y++) for (let xx = 0; xx < Wc - 1; xx++) { const i = y * Wc + xx; e += Math.abs(L[i + 1] - L[i]) + Math.abs(L[i + Wc] - L[i]); }
    const nn = Wc * Hc; lum += m / nn; con += Math.sqrt(Math.max(0, m2 / nn - (m / nn) ** 2)); edge += e / nn; sat += sa / nn; mot += mo / nn;
  }
  await seekTo(st); if (was) playVideo();
  const sm = Array.from(hue, (v, i) => v + 0.5 * (hue[(i + 35) % 36] + hue[(i + 1) % 36])); let h1 = 0; sm.forEach((v, i) => { if (v > sm[h1]) h1 = i; });
  let h2 = -1; sm.forEach((v, i) => { const d = Math.min((i - h1 + 36) % 36, (h1 - i + 36) % 36); if (d >= 6 && v > sm[h1] * 0.35 && (h2 < 0 || v > sm[h2])) h2 = i; });
  const colored = sm[h1] > 0.4 && sat / N > 0.12, H1 = colored ? h1 * 10 + 5 : 190, H2 = colored ? (h2 >= 0 ? h2 * 10 + 5 : (H1 + 150) % 360) : 330;
  const c0 = hsl2rgb(H1, 0.85, 0.55), c1 = hsl2rgb(H2, 0.8, 0.6);
  U.uP0.value.set(...c0); U.uP1.value.set(...c1); PALETTES.auto = [c0.map(v => Math.round(v * 255)), c1.map(v => Math.round(v * 255))];
  VT = {lum: lum / N, contrast: con / N, edge: edge / N, sat: sat / N, motion: mot / N, h1: H1, h2: H2, colored};
  return VT;
}
// ---- video-processing parameters (VP): one set per frame, from the director's look or from the manual sliders
const VPD = {zoom: 1, rot: 0, panx: 0, pany: 0, bulge: 0, warp: 0, warpF: 8, warpS: 1, self: 0, slice: 0, pix: 0, par: 0, ca: 0, glow: 0, edge: 0, mirror: 0, duo: 0, post: 0, half: 0, dith: 0, grain: 0, scan: 0, vig: 0, bars: 0,
  fb: 0, fbz: 1, trans: 0, ttype: 0, exposure: 1, contrast: 1, sat: 1, flash: 0, camx: 0, camy: 0};
const VMAP = {vZoom: 'zoom', vRot: 'rot', vBulge: 'bulge', vWarp: 'warp', vWarpF: 'warpF', vSelf: 'self', vSlice: 'slice', vPix: 'pix', vPar: 'par', vCa: 'ca', vGlow: 'glow', vEdge: 'edge', vMirror: 'mirror', vDuo: 'duo', vPost: 'post',
  vHalf: 'half', vDith: 'dith', vGrain: 'grain', vScan: 'scan', vVig: 'vig', vBars: 'bars', vFb: 'fb', vExp: 'exposure', vCon: 'contrast', vSat: 'sat'};
let VP = {...VPD}, VCOL = [[0.02, 0.03, 0.08], [1, 0.95, 0.85], [0.25, 0.9, 0.95]], curLook = null, shot = {i: 0, n: 0, p: 0, t: 0, tr: 0, tt: 0, name: ''};
const hx = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255], toHex = c => '#' + c.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
Object.keys(VMAP).filter(id => id !== 'vMirror').forEach(id => bindRange(id, v => { const st = +$(id).step; return st >= 1 ? String(v) : (st < 0.01 ? v.toFixed(3) : f2(v)); }));
function vpFromSliders(){
  const v = {...VPD}; Object.entries(VMAP).forEach(([id, k]) => v[k] = +$(id).value);
  v.camx = Math.sin(U.uTime.value * 0.6) * 0.9; v.camy = Math.cos(U.uTime.value * 0.45) * 0.55;
  if (AV.on) { v.zoom += AV.K * 0.04; if (v.ca > 0) v.ca += AV.K * 0.006; if (v.self > 0) v.self += AV.B * 0.02; if (v.glow > 0) v.glow += AV.M * 0.3; if (v.slice > 0) v.slice += AV.K * 0.05; }
  return v;
}
function sliderSyncFromVP(){ Object.entries(VMAP).forEach(([id, k]) => { const el = $(id); if (el.tagName === 'SELECT') { el.value = String(VP[k]); return; } const val = clamp(VP[k], +el.min, +el.max); el.value = val; el.dispatchEvent(new Event('input')); }); ['vC0', 'vC1', 'vC2'].forEach((id, i) => { $(id).value = toHex(VCOL[i]); }); }
function applyVideoFx(t){
  const man = !(autoOn && curLook);
  let v;
  if (!man) { const a = {b: AV.B, m: AV.M, h: AV.H, k: AV.K, p: shot.p, t: shot.t, ph: AV.beatPh}; v = {...VPD, ...LOOKS[curLook.key].anim(a, curLook.v)}; VCOL = curLook.col; }
  else { v = vpFromSliders(); VCOL = [hx($('vC0').value), hx($('vC1').value), hx($('vC2').value)]; }
  if (!man) { v.trans = shot.tr; v.ttype = shot.tt; if (shot.tt === 4) v.flash += 0.45 * shot.tr; }
  VP = v;
  VU.uTime.value = t; VU.uVidA.value = ly('video'); U.uCloudA.value = ly('cloud');
  VU.uA.value.set(v.zoom, v.rot, v.panx, v.pany); VU.uB.value.set(v.bulge, v.warp, v.warpF, v.warpS); VU.uC.value.set(v.self, v.slice, v.pix, v.par); VU.uD.value.set(v.ca, v.glow, v.edge, v.mirror);
  VU.uE.value.set(v.duo, v.post, v.half, v.dith); VU.uF.value.set(v.grain, v.scan, v.vig, v.bars); VU.uG.value.set(v.fb, v.fbz, v.trans, v.ttype); VU.uH.value.set(v.contrast, v.sat, v.exposure, v.flash);
  VU.uCam.value.set(v.camx, v.camy); VU.uC0.value.set(...VCOL[0]); VU.uC1.value.set(...VCOL[1]); VU.uC2.value.set(...VCOL[2]);
}
const DEFAULTS = {tCount: 0, tLabel: 'num', frameOn: true, nLabels: false, nDens: 100, nThr: 0.22, nMin: 6, nMax: 28, nStroke: 1.3, nShape: 'bracket', lMode: 'delaunay', lDist: 16, lConf: 0.15, lOp: 0.5, lW: 1,
  pLines: 120, pCon: 1.7, pDef: 55, pSingle: true, pW: 1.1, pAnim: 0.5, pVig: 0, pCol: '#ffffff', gCols: 110, gOp: 0.85, geoColor: 'auto', geoBlend: 'source-over', colorMode: 1, depthY: 0.3, depth: 1, size: 1.1, orbit: 0.3, float: 0.3, scenario: 'float',
  aGain: 0.75, aBass: 1, aMid: 1, aHigh: 1, aBeat: 1, aScat: 0, aFlash: 0};
const PAIRS = [['#1c36ff', '#efe9dc'], ['#0f4a2c', '#eef0dc'], ['#e0261d', '#f3ece2'], ['#101010', '#f2f2f2'], ['#6a1fff', '#ffe14a'], ['#0b8fa8', '#f4fbfb']];
const P01 = i => PALETTES.auto[i].map(v => v / 255), dark = (c, k) => c.map(v => v * k), light = (c, k) => c.map(v => v + (1 - v) * k);
// Each look is a short film-grammar idea: what the picture does to itself (anim), how the cut arrives (enter), colour (pal), plus rare 2D accents (layers / set).
// anim gets a = {b: bass, m: mid, h: high, k: kick, p: progress through the shot, t: seconds into the shot}
const LOOKS = {
  film:       {name: 'Кино',       hue: 38,  fam: 'g', enter: 4, layers: {video: 1}, fx: {}, vs: pk => ({drift: pk([0.05, 0.08]), dir: pk([-1, 1])}),
    pal: () => [[0.04, 0.2, 0.24], [1, 0.83, 0.64], [1, 1, 1]], set: () => ({frameOn: true, aFlash: 0.1}),
    anim: (a, v) => ({zoom: 1 + v.drift * a.p, panx: v.dir * 0.03 * (a.p - 0.5), exposure: 0.96, contrast: 1.12, sat: 0.92, duo: 0.22, glow: 0.12 + 0.25 * a.m, grain: 0.35, vig: 0.5, bars: 0.095, ca: 0.0012})},
  liquid:     {name: 'Жидкое стекло', hue: 190, fam: 'w', enter: 2, layers: {video: 1}, fx: {}, vs: pk => ({f: pk([6, 9, 12]), s: pk([0.8, 1.3])}),
    pal: () => [dark(P01(1), 0.2), light(P01(0), 0.55), P01(0)], set: () => ({frameOn: false, aFlash: 0.1}),
    anim: (a, v) => ({zoom: 1.03 + 0.03 * Math.sin(a.t * 0.5), rot: 0.012 * Math.sin(a.t * 0.4), self: 0.014 + 0.05 * a.b, warp: 0.003 + 0.007 * a.m, warpF: v.f, warpS: v.s, ca: 0.002 + 0.012 * a.k, glow: 0.3 + 0.5 * a.m, sat: 1.25, contrast: 1.1, duo: 0.1, vig: 0.3, grain: 0.1})},
  neon:       {name: 'Неон-контур', hue: 300, fam: 'e', enter: 4, layers: {video: 1}, fx: {}, vs: () => ({}),
    pal: () => [[0.01, 0.02, 0.08], light(P01(1), 0.5), light(P01(0), 0.15)], set: () => ({frameOn: false, aFlash: 0.2}),
    anim: (a) => ({exposure: 0.5, contrast: 1.3, sat: 0.7, duo: 0.35, edge: 0.9 + 1.3 * a.k, glow: 0.7 + 0.7 * a.h, ca: 0.002 + 0.007 * a.k, zoom: 1 + 0.05 * a.p, vig: 0.55, scan: 0.12, grain: 0.12})},
  halftone:   {name: 'Полутон',    hue: 48,  fam: 'p', enter: 3, layers: {video: 1}, fx: {}, vs: pk => ({cell: pk([8, 10, 14]), pair: pk(PAIRS)}),
    pal: (v) => [hx(v.pair[0]), hx(v.pair[1]), hx(v.pair[0])], set: () => ({frameOn: false, aFlash: 0}),
    anim: (a, v) => ({half: v.cell * (1 + 0.3 * a.k), contrast: 1.25, zoom: 1 + 0.04 * Math.sin(a.t * 0.5), grain: 0.15, vig: 0.2})},
  glitchtape: {name: 'Рваная лента', hue: 330, fam: 'x', enter: 3, layers: {video: 1}, fx: {}, vs: () => ({}),
    pal: () => [[0.05, 0, 0.12], [0.85, 1, 0.95], light(P01(1), 0.2)], set: () => ({frameOn: true, aFlash: 0.15}),
    anim: (a) => ({slice: 0.015 + 0.2 * a.k, ca: 0.005 + 0.022 * a.k, scan: 0.4, grain: 0.5, fb: 0.3, fbz: 1.003, sat: 0.85, duo: 0.12, contrast: 1.2, warp: 0.001 + 0.012 * a.k, warpF: 45, warpS: 6, vig: 0.35, flash: 0.12 * a.k})},
  parallax:   {name: 'Параллакс',  hue: 25,  fam: 'w', enter: 1, layers: {video: 1, cloud: 0.22}, fx: {}, vs: () => ({}),
    pal: () => [[0.05, 0.03, 0.04], [1, 0.9, 0.78], [1, 1, 1]], set: () => ({frameOn: true, colorMode: 0, depthY: 0.3, orbit: 0.3, size: 0.9, aFlash: 0.1}),
    anim: (a) => ({par: 0.11 + 0.07 * a.b, camx: Math.sin(a.t * 0.6) * 0.9, camy: Math.cos(a.t * 0.45) * 0.55, zoom: 1.12, contrast: 1.2, sat: 1.15, vig: 0.55, glow: 0.25 + 0.2 * a.m, grain: 0.14, duo: 0.15})},
  mirror:     {name: 'Зеркало',    hue: 270, fam: 'k', enter: 2, layers: {video: 1}, fx: {}, vs: pk => ({mode: pk([1, 2, 3]), spin: pk([0.06, 0.1])}),
    pal: () => [dark(P01(1), 0.2), light(P01(0), 0.6), P01(0)], set: () => ({frameOn: false, aFlash: 0.1}),
    anim: (a, v) => ({mirror: v.mode, rot: v.mode === 3 ? a.t * v.spin : 0.02 * Math.sin(a.t * 0.5), zoom: 1.12 + 0.1 * a.b, post: 6, duo: 0.3, sat: 1.4, contrast: 1.15, ca: 0.003 + 0.01 * a.k, vig: 0.35})},
  echo:       {name: 'Эхо',        hue: 170, fam: 'g', enter: 4, layers: {video: 1}, fx: {}, vs: () => ({}),
    pal: () => [dark(P01(1), 0.25), light(P01(0), 0.5), P01(0)], set: () => ({frameOn: false, aFlash: 0.1}),
    anim: (a) => ({fb: 0.88, fbz: 1.012 + 0.014 * a.b, rot: 0.008 * Math.sin(a.t * 0.7), glow: 0.75, sat: 1.4, ca: 0.004 + 0.008 * a.k, duo: 0.3, contrast: 1.15, vig: 0.45, grain: 0.15})},
  mosaic:     {name: 'Мозаика',    hue: 100, fam: 'p', enter: 3, layers: {video: 1}, fx: {}, vs: pk => ({c: pk([0.03, 0.04]), pair: pk(PAIRS)}),
    pal: (v) => [hx(v.pair[0]), hx(v.pair[1]), hx(v.pair[0])], set: () => ({frameOn: false, aFlash: 0}),
    anim: (a, v) => ({pix: v.c * (1 - 0.85 * a.k) + 0.006, post: 6, duo: 0.4, contrast: 1.2, zoom: 1 + 0.03 * a.p, ca: 0.002, vig: 0.3})},
  drop:       {name: 'Дроп',       hue: 345, fam: 'x', enter: 2, layers: {video: 1, cloud: 0.4}, fx: {}, vs: () => ({}),
    pal: () => [[0.03, 0.02, 0.06], [1, 1, 1], light(P01(0), 0.1)], set: () => ({frameOn: true, colorMode: 0, aFlash: 0.45, aScat: 0.2, orbit: 0.5, depthY: 0.3, tCount: 5, tLabel: 'num'}),
    anim: (a) => ({zoom: 1.03 + 0.1 * a.k + 0.04 * a.p, ca: 0.012 + 0.035 * a.k, slice: a.k > 0.35 ? 0.02 + 0.1 * a.k : 0, flash: 0.3 * a.k, glow: 0.6 + 0.7 * a.k, bulge: 0.05 + 0.12 * a.k, sat: 1.45, contrast: 1.3, fb: 0.25, grain: 0.2, vig: 0.5, duo: 0.12})},
  blueprint:  {name: 'Схема',      hue: 205, fam: 'e', enter: 4, layers: {video: 1, links: 1, nodes: 1}, fx: {}, vs: () => ({}),
    pal: () => [[0.01, 0.05, 0.18], [0.55, 0.85, 1], [0.4, 0.9, 1]], set: (pk, rg) => ({nDens: rg(90, 130), nThr: 0.2, nShape: pk(['circle', 'cross', 'diamond']), nLabels: true, lMode: pk(['delaunay', 'hybrid', 'proximity']), lDist: 18, lOp: 0.5, geoColor: 'cyan', tCount: 7, tLabel: 'xyz', aFlash: 0.1}),
    anim: () => ({exposure: 0.6, contrast: 1.3, sat: 0, duo: 0.85, edge: 0.8, grain: 0.1, vig: 0.4})},
  plotter:    {name: 'Линии',      hue: 150, fam: 'p', enter: 1, layers: {video: 0.3, plot: 1}, fx: {}, vs: () => ({}),
    pal: () => [[0.02, 0.03, 0.08], [1, 0.95, 0.85], [1, 1, 1]], set: (pk) => ({pLines: pk([110, 140, 170]), pCon: 1.8, pCol: pk(['#ffffff', '#3fe3f2', '#ff4d3a']), pW: 1.1, pAnim: 0.7, pVig: pk([0, 0.4]), frameOn: false}),
    anim: () => ({exposure: 0.85, contrast: 1.1})},
  glyph:      {name: 'Глифы',      hue: 120, fam: 'p', enter: 4, layers: {video: 0.3, glyph: 1}, fx: {}, vs: () => ({}),
    pal: () => [[0.02, 0.03, 0.08], [1, 0.95, 0.85], [1, 1, 1]], set: (pk) => ({gCols: pk([90, 120, 160]), geoColor: pk(['mono', 'solar', 'cyan']), gOp: 0.9, frameOn: false}),
    anim: () => ({exposure: 0.85})},
};
const WEIGHTS = [
  {film: 3, liquid: 2.5, parallax: 2.5, echo: 2, neon: 1.2, blueprint: 0.8, mirror: 0.8, glyph: 0.5, plotter: 0.5},
  {liquid: 2.5, neon: 2.5, parallax: 2, halftone: 2, mosaic: 1.5, echo: 1.5, mirror: 1.5, film: 1.2, glitchtape: 1.2, plotter: 1, glyph: 1, blueprint: 1},
  {drop: 3.5, glitchtape: 3, mosaic: 2.5, halftone: 2.5, mirror: 2.5, neon: 2, echo: 1.2, liquid: 1.2},
];
function makeLook(key, level, R){
  const T = LOOKS[key], pk = a => a[Math.floor(R() * a.length)], rg = (a, b) => Math.round(a + R() * (b - a)), v = T.vs(pk);
  return {key, name: T.name, hue: T.hue, level, layers: {...T.layers}, fx: {}, p: T.set(pk, rg), v, col: T.pal(v)};
}
function buildPlan(){
  if (!hasVideo) return;
  const R = rng(seed * 7919 + 13), D = getDur(), st = getStart(); let secs = [];
  if (AU) AU.sections.forEach(g => { const a = Math.max(g.t0, st) - st, b = Math.min(g.t1, st + D) - st; if (b - a > 0.3) secs.push({t0: a, t1: b, level: g.level}); });
  if (!secs.length) secs = [{t0: 0, t1: D, level: 1}];
  secs[0].t0 = 0; secs[secs.length - 1].t1 = D; for (let i = 1; i < secs.length; i++) secs[i].t0 = secs[i - 1].t1;
  // shots of about 8 beats, cut on the beat grid so every change lands on the music
  const shotLen = AU ? clamp(AU.beatLen * 8, 3, 6) : 4, split = [];
  secs.forEach(g => { const len = g.t1 - g.t0, n = Math.max(1, Math.round(len / shotLen)); for (let i = 0; i < n; i++) split.push({t0: g.t0 + len * i / n, t1: g.t0 + len * (i + 1) / n, level: g.level}); });
  const hist = [];
  planSecs = split.map(g => {
    const w = {...WEIGHTS[g.level]}, V = VT || {lum: 0.4, edge: 0.1, sat: 0.2, motion: 0.05}, mul = (k, f) => { if (w[k]) w[k] *= f; };
    if (V.lum > 0.55) { mul('halftone', 1.5); mul('plotter', 1.4); mul('neon', 0.8); mul('echo', 0.7); }
    if (V.lum < 0.25) { mul('neon', 1.4); mul('echo', 1.3); mul('parallax', 1.2); }
    if (V.edge > 0.12) { mul('blueprint', 1.5); mul('neon', 1.3); mul('liquid', 1.2); }
    if (V.sat > 0.3) { mul('mirror', 1.3); mul('echo', 1.2); mul('liquid', 1.2); }
    if (V.motion > 0.08) { mul('glitchtape', 1.3); mul('drop', 1.2); mul('echo', 0.7); }
    // maximise contrast between neighbours: never the same look within three shots, and avoid the same family back to back
    Object.keys(w).forEach(k => { if (hist.slice(-3).includes(k)) w[k] *= 0.04; else { if (hist.length && LOOKS[hist[hist.length - 1]].fam === LOOKS[k].fam) w[k] *= 0.35; if (hist.length > 1 && LOOKS[hist[hist.length - 2]].fam === LOOKS[k].fam) w[k] *= 0.75; } });
    const tot = Object.values(w).reduce((a, b) => a + b, 0); let r = R() * tot, key = Object.keys(w)[0];
    for (const [k2, v] of Object.entries(w)) { r -= v; if (r <= 0) { key = k2; break; } }
    hist.push(key); return {...g, look: makeLook(key, g.level, R)};
  });
  curSec = -1; tlDirty = true; renderSecList();
}
function setv(id, val){ const el = $(id); if (!el) return; if (el.type === 'checkbox') { el.checked = !!val; el.dispatchEvent(new Event('change')); } else { el.value = val; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); } }
function setFx(id, on, val){ fxOn[id] = on; if (val !== undefined) { $(id).value = val; $(id).parentElement.querySelector('output').textContent = f2(+val); } applyFx(id); }
function applyLook(sec){
  const L = sec.look; curLook = L;
  Object.entries(DEFAULTS).forEach(([k, v]) => setv(k, v)); Object.entries(L.p).forEach(([k, v]) => setv(k, v));
  Object.keys(FX).forEach(id => setFx(id, false));
}
function applyAuto(t){
  if (!autoOn || !planSecs.length) return;
  let si = planSecs.findIndex(g => t >= g.t0 && t < g.t1); if (si < 0) si = t < planSecs[0].t0 ? 0 : planSecs.length - 1;
  const sec = planSecs[si]; if (si !== curSec) { applyLook(sec); curSec = si; syncSwitches(); markSec(); }
  const prev = si > 0 ? planSecs[si - 1] : null, r = prev ? clamp((t - sec.t0) / 0.15, 0, 1) : 1, e = r * r * (3 - 2 * r);
  Object.keys(LA).forEach(k => { LA[k] = (sec.look.layers[k] || 0) * e + (prev ? (prev.look.layers[k] || 0) * (1 - e) : 0); });
  const age = t - sec.t0;
  shot = {i: si, n: planSecs.length, p: clamp(age / Math.max(0.1, sec.t1 - sec.t0), 0, 1), t: age, tr: prev && age < 0.9 ? Math.exp(-age / 0.17) : 0, tt: prev ? LOOKS[sec.look.key].enter : 0, name: sec.look.name};
}
function setAuto(on){
  if (on && !hasVideo) on = false;
  if (!on && autoOn) { Object.keys(lyOn).forEach(k => lyOn[k] = LA[k] > 0.5); $('cloudOn').checked = LA.cloud > 0.5; $('underlay').value = LA.video; $('underlay').dispatchEvent(new Event('input')); sliderSyncFromVP(); }
  autoOn = on; $('autoOn').checked = on; document.body.classList.toggle('auto', on); curSec = -1;
  if (on && !planSecs.length) buildPlan();
  syncSwitches(); tlDirty = true;
}
$('autoOn').addEventListener('change', e => setAuto(e.target.checked));
$('reroll').onclick = () => { seed++; $('seedO').textContent = '#' + seed; buildPlan(); if (!autoOn) setAuto(true); };
$('autoFreeze').onclick = () => setAuto(false);
let rebuildT = 0; ['tStart', 'dur'].forEach(id => $(id).addEventListener('change', () => { clearTimeout(rebuildT); rebuildT = setTimeout(() => { buildPlan(); }, 300); }));
document.addEventListener('vf-ready', async () => {
  planSecs = []; curSec = -1; VT = null; setAuto(false);
  status('Смотрю картинку: яркость, контуры, цвета, движение…'); await visualAnalyse();
  buildPlan(); setAuto(true);
  const tr = [`яркость ${(VT.lum * 100).toFixed(0)}%`, `контуры ${(VT.edge * 100).toFixed(0)}`, `цвет ${(VT.sat * 100).toFixed(0)}%`, `движение ${(VT.motion * 100).toFixed(0)}`];
  $('traits').innerHTML = tr.map(x => `<span class="chip">${x}</span>`).join('') + `<span class="chip sw-h" style="--c:hsl(${VT.h1} 80% 55%)">оттенок 1</span><span class="chip sw-h" style="--c:hsl(${VT.h2} 75% 60%)">оттенок 2</span>`;
  status('Авто-режим собрал оформление: ' + planSecs.length + ' секц. Можно менять любую или нажать «Свой режим».');
});
const LOOK_KEYS = Object.keys(LOOKS);
function renderSecList(){
  const box = $('secList'); if (!box) return; box.innerHTML = '';
  planSecs.forEach((g, i) => {
    const row = document.createElement('div'); row.className = 'sec'; row.dataset.i = i;
    const t = v => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`;
    row.innerHTML = `<button class="secgo" title="К началу секции">${t(g.t0)}–${t(g.t1)}</button><i class="lv l${g.level}" title="Громкость: ${['тихо', 'средне', 'громко'][g.level]}"></i><select aria-label="Оформление секции ${i + 1}">${LOOK_KEYS.map(k => `<option value="${k}"${k === g.look.key ? ' selected' : ''}>${LOOKS[k].name}</option>`).join('')}</select>`;
    row.querySelector('.secgo').onclick = () => { video.currentTime = getStart() + g.t0 + 0.01; };
    row.querySelector('select').onchange = e => { g.look = makeLook(e.target.value, g.level, rng(seed * 31 + i * 7 + e.target.value.length)); curSec = -1; tlDirty = true; if (!autoOn) setAuto(true); };
    box.appendChild(row);
  });
  markSec();
}
function markSec(){ document.querySelectorAll('#secList .sec').forEach((r, i) => r.classList.toggle('now', i === curSec)); }

// ---------------------------------------------------------------- timeline: waveform, beat grid, hits, sections, one lane per module
const tl = $('tl'), tlx = tl.getContext('2d'), TL_GUT = 74, LANES = [['video', 'ВИДЕО', 55], ['cloud', 'ОБЛАКО', 190], ['nodes', 'УЗЛЫ', 215], ['links', 'СВЯЗИ', 230], ['dither', 'ПЕЧАТЬ', 40], ['curtain', 'ЗАВЕСА', 280], ['plot', 'ПЛОТТЕР', 150], ['glyph', 'ГЛИФЫ', 120], ['glitch', 'ГЛИТЧ', 345]];
let tlStatic = document.createElement('canvas'), tlW = 0, tlH = 0;
function sizeTimeline(){
  const r = tl.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1); tlW = Math.max(100, Math.round(r.width * dpr)); tlH = Math.max(60, Math.round(r.height * dpr));
  tl.width = tlStatic.width = tlW; tl.height = tlStatic.height = tlH; tlDirty = true;
}
function drawTlStatic(){
  const c = tlStatic.getContext('2d'), w = tlW, h = tlH, k = h / 230, g = TL_GUT * k, D = getDur(), st = getStart(), X = t => g + t / D * (w - g);
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#080c10'; c.fillRect(0, 0, w, h); c.font = `${Math.round(8.5 * k)}px ui-monospace, Menlo, monospace`; c.textBaseline = 'middle';
  // ruler
  const step = D > 120 ? 30 : D > 40 ? 10 : D > 12 ? 2 : 1; c.fillStyle = '#6e8790'; c.strokeStyle = 'rgba(160,220,235,.14)'; c.lineWidth = 1;
  for (let t = 0; t <= D + 1e-6; t += step) { const x = X(t); c.beginPath(); c.moveTo(x, 14 * k); c.lineTo(x, h); c.stroke(); c.fillText(`${Math.floor((st + t) / 60)}:${String(Math.floor((st + t) % 60)).padStart(2, '0')}`, x + 3 * k, 7 * k); }
  // waveform (loudness) + beat grid
  const wy0 = 16 * k, wh = 46 * k;
  if (AU) {
    c.fillStyle = 'rgba(63,227,242,.55)'; const px = Math.max(1, Math.floor((w - g) / 1));
    for (let x = 0; x < px; x += 2) { const t0 = st + x / px * D, t1 = st + (x + 2) / px * D, i0 = Math.floor(t0 * AH), i1 = Math.max(i0 + 1, Math.floor(t1 * AH)); let m = 0; for (let i = i0; i < i1 && i < AU.F; i++) m = Math.max(m, AU.E[3][i]); const hh = Math.min(1, m) * wh; c.fillRect(g + x, wy0 + (wh - hh) / 2, 1.6, Math.max(1, hh)); }
    for (let n = Math.ceil((st - AU.off) / AU.beatLen);; n++) { const t = AU.off + n * AU.beatLen - st; if (t > D) break; if (t < 0) continue; const bar = ((n - AU.bar0) % 4 + 4) % 4 === 0; c.strokeStyle = bar ? 'rgba(255,255,255,.38)' : 'rgba(255,255,255,.12)'; c.beginPath(); c.moveTo(X(t), wy0); c.lineTo(X(t), wy0 + wh); c.stroke(); }
    c.fillStyle = '#6e8790'; c.fillText('ЗВУК', 6 * k, wy0 + wh / 2);
    // hits + voice
    const hy = wy0 + wh + 4 * k; c.fillStyle = '#6e8790'; c.fillText('УДАРЫ', 6 * k, hy + 4 * k); c.fillText('ГОЛОС', 6 * k, hy + 14 * k);
    c.fillStyle = '#ff7a59'; AU.kicks.forEach(t => { t -= st; if (t >= 0 && t <= D) c.fillRect(X(t), hy, 1.5 * k, 8 * k); });
    c.fillStyle = '#ffe28a'; AU.hats.forEach(t => { t -= st; if (t >= 0 && t <= D) c.fillRect(X(t), hy + 5 * k, 1 * k, 3 * k); });
    for (let x = 0; x < w - g; x += 2) { const t = st + x / (w - g) * D, v = AU.vp[Math.min(AU.F - 1, Math.floor(t * AH))]; c.fillStyle = `rgba(180,140,255,${0.15 + 0.7 * v})`; c.fillRect(g + x, hy + 10 * k, 2, 8 * k); }
  } else { c.fillStyle = '#6e8790'; c.fillText('ЗВУКА НЕТ', 6 * k, wy0 + wh / 2); }
  // sections
  const sy = 16 * k + 46 * k + 4 * k + 22 * k, sh = 20 * k;
  c.fillStyle = '#6e8790'; c.fillText('СЕКЦИИ', 6 * k, sy + sh / 2);
  planSecs.forEach(gg => { const x0 = X(gg.t0), x1 = X(gg.t1); c.fillStyle = `hsla(${gg.look.hue},70%,50%,.55)`; c.fillRect(x0 + 1, sy, x1 - x0 - 2, sh); c.fillStyle = '#fff'; c.fillText(gg.look.name.toUpperCase(), x0 + 5 * k, sy + sh / 2); });
  // lanes
  const ly0 = sy + sh + 6 * k, lh = 10 * k;
  LANES.forEach(([key, name, hue], i) => {
    const y = ly0 + i * (lh + 1.5 * k); c.fillStyle = '#6e8790'; c.fillText(name, 6 * k, y + lh / 2);
    c.fillStyle = 'rgba(255,255,255,.04)'; c.fillRect(g, y, w - g, lh);
    if (autoOn && planSecs.length) planSecs.forEach(gg => { const wv = gg.look.layers[key] || 0; if (wv > 0.02) { c.fillStyle = `hsla(${hue},75%,55%,${0.25 + 0.65 * wv})`; c.fillRect(X(gg.t0) + 1, y, X(gg.t1) - X(gg.t0) - 2, lh); } });
    else if (ly(key) > 0.5) { c.fillStyle = `hsla(${hue},75%,55%,.7)`; c.fillRect(g, y, w - g, lh); }
  });
  tlDirty = false;
}
function drawTimeline(t){
  if (!tlW) sizeTimeline(); if (tlDirty) drawTlStatic();
  tlx.setTransform(1, 0, 0, 1, 0, 0); tlx.drawImage(tlStatic, 0, 0);
  const k = tlH / 230, g = TL_GUT * k, x = g + clamp(t / getDur(), 0, 1) * (tlW - g);
  tlx.strokeStyle = '#ff4d3a'; tlx.lineWidth = Math.max(1, 1.5 * k); tlx.beginPath(); tlx.moveTo(x, 0); tlx.lineTo(x, tlH); tlx.stroke();
  tlx.fillStyle = '#ff4d3a'; tlx.beginPath(); tlx.moveTo(x - 4 * k, 0); tlx.lineTo(x + 4 * k, 0); tlx.lineTo(x, 7 * k); tlx.fill();
}
let tlDrag = false;
const tlSeek = e => { if (!hasVideo) return; const r = tl.getBoundingClientRect(), gf = (TL_GUT * (tlH / 230)) / tlW, fx = (e.clientX - r.left) / r.width; video.currentTime = getStart() + clamp((fx - gf) / (1 - gf), 0, 0.999) * getDur(); };
tl.addEventListener('pointerdown', e => { tlDrag = true; tl.setPointerCapture(e.pointerId); tlSeek(e); }); tl.addEventListener('pointermove', e => { if (tlDrag) tlSeek(e); }); tl.addEventListener('pointerup', () => tlDrag = false);
addEventListener('resize', sizeTimeline);

// ---------------------------------------------------------------- module list (left) + inspector panes (right)
const MODS = [
  ['ИСТОЧНИК', [['source', 'Видео', 'p-source', () => hasVideo, null, () => hasVideo ? fmtT(getDur()) : '—'], ['audio', 'Звук и ритм', 'p-audio', () => AV.on, () => $('audOn').click(), () => AU ? AU.bpm.toFixed(0) + ' BPM' : 'нет звука']]],
  ['РЕЖИССЁР', [['auto', 'Авто-режиссёр', 'p-auto', () => autoOn, () => setAuto(!autoOn), () => autoOn ? `секция ${Math.max(1, curSec + 1)}/${planSecs.length}` : 'ручной']]],
  ['ОБРАБОТКА ВИДЕО', [['vgeo', 'Геометрия кадра', 'p-vgeo', () => autoOn ? 1 : (VP.zoom !== 1 || VP.rot || VP.bulge || VP.warp || VP.mirror || VP.pix || VP.par ? 1 : 0.15), null, () => VP.mirror ? 'зеркало' : VP.par ? 'параллакс' : VP.pix ? 'мозаика' : VP.warp ? 'волна' : '—'],
    ['vcont', 'По содержанию', 'p-vcont', () => autoOn ? 1 : (VP.self || VP.slice || VP.ca || VP.edge || VP.glow || VP.fb ? 1 : 0.15), null, () => VP.self ? 'самопреломление' : VP.edge ? 'контуры' : VP.fb ? 'эхо' : VP.ca ? 'RGB-сдвиг' : '—'],
    ['vcol', 'Цвет и печать', 'p-vcol', () => autoOn ? 1 : (VP.duo || VP.post || VP.half || VP.dith || VP.sat !== 1 || VP.contrast !== 1 ? 1 : 0.15), null, () => VP.half ? 'полутон' : VP.dith ? 'дизеринг' : VP.duo ? 'две краски' : '—'],
    ['vfilm', 'Плёнка', 'p-vfilm', () => autoOn ? 1 : (VP.grain || VP.scan || VP.vig || VP.bars ? 1 : 0.15), null, () => VP.bars ? 'полосы' : VP.grain ? 'зерно' : '—']]],
  ['ОБЛАКО ТОЧЕК', [['cloud', 'Облако и глубина', 'p-cloud', () => ly('cloud'), () => toggleLayer('cloud'), () => $('colorMode').selectedOptions[0].textContent], ['scene', 'Сцена', 'p-scene', () => 1, null, () => $('scenario').selectedOptions[0].textContent.split(' (')[0]]]],
  ['ЭФФЕКТЫ ОБЛАКА', [['fxPulse', 'Пульсация', 'p-fxPulse'], ['fxWave', 'Волны', 'p-fxWave'], ['fxMag', 'Магнит', 'p-fxMag'], ['fxTurb', 'Турбулентность', 'p-fxTurb'], ['fxScan', 'Скан-линия', 'p-fxScan']].map(([id, n, pane]) => [id, n, pane, () => fxOn[id] ? 1 : 0, () => { if (autoOn) setAuto(false); fxOn[id] = !fxOn[id]; applyFx(id); }, () => fxOn[id] ? f2(+$(id).value) : 'выкл'])],
  ['ГРАФИКА', [['gfx', 'Цвет и наложение', 'p-gfx', () => 1, null, () => $('geoColor').selectedOptions[0].textContent],
    ['nodes', 'Узлы и фигуры', 'p-nodes', () => ly('nodes'), () => toggleLayer('nodes'), () => $('nShape').selectedOptions[0].textContent],
    ['links', 'Связи', 'p-links', () => ly('links'), () => toggleLayer('links'), () => $('lMode').selectedOptions[0].textContent.split(' (')[0]],
    ['dither', 'Дизеринг-печать', 'p-dither', () => ly('dither'), () => toggleLayer('dither'), () => $('dAlgo').selectedOptions[0].textContent.split(' (')[0]],
    ['curtain', 'Спектральная завеса', 'p-curtain', () => ly('curtain'), () => toggleLayer('curtain'), () => $('cDir').selectedOptions[0].textContent],
    ['plot', 'Плоттер-линии', 'p-plot', () => ly('plot'), () => toggleLayer('plot'), () => num('pLines') + ' линий'],
    ['glyph', 'Глифы (ASCII)', 'p-glyph', () => ly('glyph'), () => toggleLayer('glyph'), () => num('gCols') + ' кол.'],
    ['glitch', 'Глитч', 'p-glitch', () => ly('glitch'), () => toggleLayer('glitch'), () => AV.on ? 'по ударам' : 'по таймеру']]],
  ['КАМЕРА И МЕТКИ', [['camera', 'Камера', 'p-camera', () => 1, null, () => $('angles').textContent.split(' · ')[0]], ['track', 'Трек-точки', 'p-track', () => +$('tCount').value > 0 ? 1 : 0, null, () => $('tCount').value + ' шт.']]],
  ['ВЫВОД', [['export', 'Экспорт MP4', 'p-export', () => 1, null, () => $('format').selectedOptions[0].textContent.split(' · ')[0]]]],
];
const modEls = {};
(function buildNav(){
  const nav = $('mods');
  MODS.forEach(([g, items]) => {
    const h = document.createElement('div'); h.className = 'mg'; h.textContent = g; nav.appendChild(h);
    items.forEach(([id, label, pane, on, tog, sum]) => {
      const b = document.createElement('div'); b.className = 'mod'; b.dataset.pane = pane; b.tabIndex = 0; b.setAttribute('role', 'button');
      b.innerHTML = `<i class="led${tog ? ' tg' : ''}" ${tog ? 'title="Включить / выключить"' : ''}></i><span class="mn">${label}</span><em></em>`;
      b.addEventListener('click', e => { if (e.target.classList.contains('led') && tog) { e.stopPropagation(); tog(); } showPane(pane); });
      b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); showPane(pane); } });
      nav.appendChild(b); modEls[id] = {el: b, led: b.querySelector('.led'), em: b.querySelector('em'), on, sum};
    });
  });
})();
function showPane(id){
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.id !== id);
  document.querySelectorAll('.mod').forEach(m => m.classList.toggle('sel', m.dataset.pane === id));
  const sel = document.querySelector('.mod.sel'); if (sel && sel.scrollIntoView) sel.scrollIntoView({block: 'nearest', inline: 'nearest'});
}
let navTick = 0;
function refreshNav(){
  if (++navTick % 6) return;
  Object.values(modEls).forEach(m => { const v = m.on ? +m.on() : 1; m.led.style.setProperty('--a', v.toFixed(2)); m.led.classList.toggle('lit', v > 0.5); m.el.classList.toggle('off', v < 0.05); const sm = m.sum ? m.sum() : ''; if (m.em.textContent !== sm) m.em.textContent = sm; });
  document.querySelectorAll('.sw[data-ly]').forEach(b => { const on = ly(b.dataset.ly) > 0.5; if ((b.getAttribute('aria-pressed') === 'true') !== on) { b.setAttribute('aria-pressed', on); b.textContent = on ? 'вкл' : 'выкл'; } });
  const cur = hasVideo ? clamp(video.currentTime - getStart(), 0, getDur()) : 0, tc = v => `${Math.floor(v / 60)}:${(v % 60).toFixed(1).padStart(4, '0')}`; $('tcode').textContent = `${tc(cur)} / ${tc(getDur())}`;
}
showPane('p-auto');
// ---------------------------------------------------------------- preview loop
let needCpu = true;
function frame(){
  if (!exporting && hasVideo) {
    const st = getStart(), D = getDur();
    if (playing && video.currentTime >= st + D - 0.02) video.currentTime = st;
    const t = clamp(video.currentTime - st, 0, D);
    if (playing) $('time').value = (t / D).toFixed(3);
    updateCam(); applyScene(t); applyAuto(t); applyAudio(t);
    tex.needsUpdate = true;
    if (tracked.length || needCpu) updateCpu();
    applyVideoFx(t); renderGL();
    composeFrame(vctx, view.width, view.height); drawHud(hctx, hud.width, hud.height);
    drawTimeline(t); refreshNav();
  }
  requestAnimationFrame(frame);
}

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
  applyScene(t); applyAuto(t); applyAudio(t); tex.needsUpdate = true; updateCpu();
  applyVideoFx(t); renderGL();
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
  const wasPlaying = playing, t0 = performance.now(); video.pause(); rotY = tRotY; rotX = tRotX; zoom = tZoom; needCpu = true;
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

// debug hook for automated tests
window.__vf = {video, U, get count(){ return count; }, get tracked(){ return tracked; }};
layoutStage(); sizeTimeline(); navTick = 5; refreshNav(); requestAnimationFrame(frame);
})();
