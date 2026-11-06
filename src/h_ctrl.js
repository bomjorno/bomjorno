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
