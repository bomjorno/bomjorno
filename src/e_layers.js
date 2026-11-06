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


