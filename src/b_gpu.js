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
