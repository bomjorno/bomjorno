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
