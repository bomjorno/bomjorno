(() => {
'use strict';
const $ = id => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MAX_DUR = 20, MAX_SIDE = 2560, TAU = Math.PI * 2, DEG = Math.PI / 180;
const stage = $('stage'), glc = $('gl'), hud = $('hud'), hctx = hud.getContext('2d');

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
  uTurb: {value: 0}, uTurbN: {value: 1}, uMag: {value: 0}, uMagPol: {value: 1}, uMagR: {value: 60}, uMagPos: {value: new THREE.Vector3()},
  uScan: {value: 0}, uScanW: {value: 1}, uScanN: {value: 1},
};

const vs = `
attribute vec4 seed;
uniform sampler2D uTex; uniform vec2 uCell; uniform vec3 uBg; uniform float uThr, uBgOn, uInvert;
uniform float uTime,uScatter,uDepth,uSize,uWidth,uHalfH,uPR,uWind,uFloat,uFloatN,uLoop,uPulse,uPulseN,uWave,uWaveL,uWaveN,uTurb,uTurbN,uMag,uMagPol,uMagR,uScan,uScanW,uScanN;
uniform int uMode,uWaveT; uniform vec3 uMagPos;
varying vec3 vColor; varying float vAlpha;
void main(){
  vec2 d = uCell*0.25;
  vec3 col = (texture2D(uTex, uv+d).rgb + texture2D(uTex, uv-d).rgb + texture2D(uTex, uv+vec2(d.x,-d.y)).rgb + texture2D(uTex, uv+vec2(-d.x,d.y)).rgb)*0.25;
  float lum = dot(col, vec3(0.299,0.587,0.114));
  bool kill = uBgOn > 0.5 ? distance(col, uBg) < uThr : lum < 0.03;
  if (kill) { gl_Position = vec4(2.0,2.0,2.0,1.0); gl_PointSize = 0.0; vColor = vec3(0.0); vAlpha = 0.0; return; }
  vec3 p = position;
  p.z = ((uInvert > 0.5 ? 1.0-lum : lum) - 0.5)*90.0*uDepth;
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
  else vColor = mix(vec3(0.35,0.02,0.0), vec3(1.0,0.75,0.6), lum);
  vAlpha = (1.0 - f*0.5)*(0.55 + 0.45*lum);
  vColor = mix(vColor, vec3(0.55,1.0,1.0), clamp(sb,0.0,1.0)*0.8);
  vAlpha *= 1.0 + sb*1.5;
}`;
const fs = `
varying vec3 vColor; varying float vAlpha;
void main(){ float d = length(gl_PointCoord-0.5); if (d>0.5) discard; float a = smoothstep(0.5,0.0,d)*vAlpha; gl_FragColor = vec4(vColor*a, a); }`;
const material = new THREE.ShaderMaterial({uniforms: U, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending});

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
  let px = homeX[i], py = homeY[i], pz = zOf(i) * U.uDepth.value;
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
bindRange('scatter', f2); bindRange('wind', f2, v => U.uWind.value = v);
bindRange('orbit', f2); bindRange('orbitN', String);
bindRange('float', f2, v => U.uFloat.value = v);
const FX = {fxPulse: 'uPulse', fxWave: 'uWave', fxMag: 'uMag', fxTurb: 'uTurb', fxScan: 'uScan'}, fxOn = {};
function applyFx(id){
  const on = !!fxOn[id], b = document.querySelector(`.sw[data-fx="${id}"]`);
  U[FX[id]].value = on ? +$(id).value : 0;
  b.setAttribute('aria-pressed', on); b.textContent = on ? 'вкл' : 'выкл'; b.closest('summary').classList.toggle('act', on);
}
document.querySelectorAll('.sw').forEach(b => b.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); const id = b.dataset.fx; fxOn[id] = !fxOn[id]; applyFx(id); }));
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
glc.addEventListener('pointerdown', e => { dragging = true; px0 = e.clientX; py0 = e.clientY; glc.setPointerCapture(e.pointerId); });
glc.addEventListener('pointermove', e => { if (!dragging) return; setView(tRotY + (e.clientX - px0) * 0.005, tRotX + (e.clientY - py0) * 0.004); px0 = e.clientX; py0 = e.clientY; });
glc.addEventListener('pointerup', () => dragging = false);
glc.addEventListener('dblclick', () => setView(0, 0));
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
function scatterAt(t, D){
  const u = t / D, m = +$('scatter').value;
  switch ($('scenario').value) {
    case 'in': return m * (1 - ease((u - 0.05) / 0.7));
    case 'out': return m * ease((u - 0.2) / 0.7);
    case 'outin': return m * (u < 0.5 ? ease((u - 0.08) / 0.36) : 1 - ease((u - 0.56) / 0.36));
    case 'inout': return m * (u < 0.5 ? 1 - ease((u - 0.04) / 0.38) : ease((u - 0.58) / 0.38));
  }
  return 0;
}
const getDur = () => +$('dur').value, getStart = () => +$('tStart').value;
function applyScene(t){
  const D = getDur(), stat = $('scenario').value === 'static', o = stat ? 0 : +$('orbit').value, ph = TAU * t / D;
  U.uTime.value = t; U.uLoop.value = TAU / D;
  const mv = +$('magN').value, a = mv >= 5 ? TAU * t / D * (mv - 4) : Math.PI * mv / 10 * (1 - Math.cos(TAU * t / D));
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
  camera.position.set(0, 0, baseZ / zoom); camera.updateProjectionMatrix();
}
function setRenderSize(pw, ph){ renderer.setPixelRatio(1); renderer.setSize(pw, ph, false); U.uPR.value = ph / 900; }
function layoutStage(){
  const [fw, fh] = fmtSize(), wrap = $('stageWrap').getBoundingClientRect();
  const s = Math.min(Math.max(50, wrap.width - 32) / fw, Math.max(50, wrap.height - 32) / fh);
  viewW = Math.round(fw * s); viewH = Math.round(fh * s);
  stage.style.width = viewW + 'px'; stage.style.height = viewH + 'px';
  const dpr = Math.min(2, devicePixelRatio || 1);
  setRenderSize(viewW * dpr, viewH * dpr); hud.width = viewW * dpr; hud.height = viewH * dpr; fitCamera();
}
addEventListener('resize', () => { if (!exporting) layoutStage(); });

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
      return [(v3.x * 0.5 + 0.5) * w, (-v3.y * 0.5 + 0.5) * h, homeX[i] / 150, homeY[i] / 150, zOf(i) * U.uDepth.value / 150, wx, wy, wz]; });
    const lm = $('tLinks').value, la = +$('lAlpha').value;
    const seg = (a, b, al) => { ctx.strokeStyle = `rgba(${col},${al})`; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); };
    ctx.lineWidth = 0.8 * k;
    if (lm === 'radius') { const RD = 0.35 * 2 * U.uWidth.value;
      for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) { const d = Math.hypot(pts[a][5] - pts[b][5], pts[a][6] - pts[b][6], pts[a][7] - pts[b][7]); if (d < RD) seg(pts[a], pts[b], (la * (1 - Math.pow(d / RD, 4))).toFixed(3)); } }
    else if (lm === 'hub') pts.forEach((p, n) => n && seg(pts[0], p, la));
    else if (lm === 'all') { for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) seg(pts[a], pts[b], la * 0.6); }
    else links.forEach(([a, b]) => seg(pts[a], pts[b], la));
    const s = +$('tSize').value * k, style = $('tStyle').value, lab = $('tLabel').value, pixc = $('tColor').value === 'pixel', lift = v => Math.round(255 * (0.3 + 0.7 * v));
    ctx.strokeStyle = ctx.fillStyle = `rgba(${col},.9)`; ctx.lineWidth = Math.max(1, 1.1 * k);
    ctx.font = `${Math.round(10.5 * k)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
    if (lm === 'hub' && pts[0]) { ctx.beginPath(); ctx.arc(pts[0][0], pts[0][1], s * 2.2, 0, TAU); ctx.stroke(); }
    pts.forEach((p, n) => {
      const [x, y] = p, i = tracked[n], q = i * 4;
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
        const tw = ctx.measureText(txt).width, flip = x + s + 5 * k + tw > w - 24 * k;
        ctx.fillText(txt, flip ? x - s - 5 * k - tw : x + s + 5 * k, y - s);
      }
    });
  }
  if ($('frameOn').checked) {
    const m = 22 * k, L = 22 * k; ctx.strokeStyle = 'rgba(160,220,235,.55)'; ctx.lineWidth = Math.max(1, k); ctx.beginPath();
    [[m, m, 1, 1], [w - m, m, -1, 1], [m, h - m, 1, -1], [w - m, h - m, -1, -1]].forEach(([x, y, a, b]) => { ctx.moveTo(x, y + L * b); ctx.lineTo(x, y); ctx.lineTo(x + L * a, y); });
    ctx.stroke(); ctx.fillStyle = 'rgba(160,220,235,.75)'; ctx.font = `${Math.round(10 * k)}px ui-monospace, Menlo, Consolas, monospace`; ctx.textBaseline = 'middle';
    ctx.fillText(`VIDEO·FIELD   ${count.toLocaleString('ru-RU')} PTS   T ${t.toFixed(2)}S`, m + 8 * k, h - m - 12 * k);
  }
}

// ---------------------------------------------------------------- video loading + playback
let playing = true, objUrl = null;
const fmtT = v => v.toFixed(1) + ' с';
bindRange('dur', fmtT); bindRange('tStart', fmtT);
function syncLimits(){
  const start = getStart(), maxD = Math.min(MAX_DUR, Math.max(0.5, vdur - start));
  $('dur').max = maxD.toFixed(1); if (getDur() > maxD) $('dur').value = maxD.toFixed(1);
  $('durO').textContent = fmtT(getDur());
}
$('tStart').addEventListener('input', () => { syncLimits(); video.currentTime = getStart(); });
$('dur').addEventListener('input', () => { if (video.currentTime > getStart() + getDur()) video.currentTime = getStart(); });
$('play').onclick = () => { playing = !playing; if (hasVideo) playing ? video.play().catch(() => {}) : video.pause();
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
    syncLimits(); $('tStartO').textContent = fmtT(0);
    const big = Math.max(video.videoWidth, video.videoHeight);
    $('vinfo').textContent = `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${vdur.toFixed(1)} с` +
      (vdur > MAX_DUR ? ` · берётся фрагмент до ${MAX_DUR} с, начало настраивается ползунком` : '') + (big > MAX_SIDE ? ' · больше 2K, в экспорте уменьшится' : '');
    if (tex) tex.dispose();
    await new Promise(r => { if (video.readyState >= 2) r(); else video.onloadeddata = r; });
    tex = new THREE.VideoTexture(video); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    U.uTex.value = tex; hasVideo = true; $('empty').hidden = true;
    buildGrid(); layoutStage(); $('render').disabled = false;
    video.currentTime = 0;
    if (playing) video.play().catch(() => {});
    status('Готово к просмотру. Настрой эффекты и жми «Скачать MP4».');
  };
  video.onerror = () => status('Браузер не смог открыть это видео. Попробуй MP4 (H.264) или WebM.');
  video.src = objUrl;
}
$('vidFile').onchange = e => loadVideo(e.target.files[0]);
let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop').hidden = true; loadVideo(e.dataTransfer.files[0]); });

// ---------------------------------------------------------------- preview loop
let needCpu = true;
function frame(){
  if (!exporting && hasVideo) {
    const st = getStart(), D = getDur();
    if (playing && video.currentTime >= st + D - 0.02) video.currentTime = st;
    const t = clamp(video.currentTime - st, 0, D);
    if (playing) $('time').value = (t / D).toFixed(3);
    updateCam(); applyScene(t);
    tex.needsUpdate = true;
    if (tracked.length || needCpu) updateCpu();
    renderer.render(scene, camera); drawHud(hctx, hud.width, hud.height);
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
  applyScene(t); tex.needsUpdate = true; updateCpu();
  renderer.render(scene, camera);
  cctx.setTransform(1, 0, 0, 1, 0, 0); cctx.fillStyle = '#000'; cctx.fillRect(0, 0, fw, fh); cctx.drawImage(glc, 0, 0, fw, fh);
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
  const bitrate = Math.round(clamp(fw * fh * fps * +$('quality').value, 6e6, 80e6));
  const pc = await pickCodec(fw, fh, fps, bitrate);
  if (!pc) { status(`Браузер не поддерживает кодирование ${fw}×${fh}. Выбери формат поменьше (1080p) или другой браузер.`); return; }
  exporting = true; $('render').disabled = true; progress(0); $('dlLink').hidden = true;
  const wasPlaying = playing; video.pause(); rotY = tRotY; rotX = tRotX; zoom = tZoom; needCpu = true;
  const comp = document.createElement('canvas'); comp.width = fw; comp.height = fh; const cctx = comp.getContext('2d');
  hudOff.width = fw; hudOff.height = fh;
  try {
    setRenderSize(fw, fh); fitCamera();
    const target = new Mp4Muxer.ArrayBufferTarget();
    const muxer = new Mp4Muxer.Muxer({target, video: {codec: pc.mux, width: fw, height: fh, frameRate: fps}, fastStart: 'in-memory'});
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
      if (i % 2 === 0) { progress(i / frames); status(`Рендер: кадр ${i + 1} из ${frames} (${fw}×${fh})`); await tick(); }
    }
    await enc.flush(); enc.close(); muxer.finalize();
    if (err) throw err;
    const blob = new Blob([target.buffer], {type: 'video/mp4'}), name = `video-field_${fw}x${fh}_${D}s.mp4`;
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    const link = $('dlLink'); link.href = url; link.download = name; link.textContent = `⬇ ${name} · ${(blob.size / 1048576).toFixed(1)} МБ`; link.hidden = false;
    progress(1); status('Готово. Если файл не скачался сам — нажми ссылку ниже.');
  } catch (e) {
    status('Не получилось: ' + (e && e.message || e));
  } finally {
    exporting = false; $('render').disabled = false; layoutStage(); await seekTo(st);
    if (wasPlaying) video.play().catch(() => {});
  }
}
$('render').onclick = runExport;

// debug hook for automated tests
window.__vf = {video, U, get count(){ return count; }, get tracked(){ return tracked; }};
layoutStage(); requestAnimationFrame(frame);
})();
