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
