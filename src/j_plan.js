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
