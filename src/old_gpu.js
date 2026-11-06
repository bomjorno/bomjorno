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

