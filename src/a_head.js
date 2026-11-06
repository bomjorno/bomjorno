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

