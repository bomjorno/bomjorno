// ---------------------------------------------------------------- HUD (markers, links, frame), drawn in target-frame pixels
const v3 = new THREE.Vector3(), sgn = n => (n >= 0 ? '+' : '−') + Math.abs(n).toFixed(2);
function drawHud(ctx, w, h){
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h);
  drawCam(ctx, w, h);
  if (!count) return;
  const k = Math.min(w, h) / 700, t = U.uTime.value, col = $('tColor').value === 'cyan' ? '63,227,242' : '235,248,252';
  if (false) {
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
    if (shotInfo.n) {   // shot slate
      const age = shotInfo.age, al = clamp(1.4 - age / 1.8, 0, 1) * 0.9; if (al > 0.02) { ctx.fillStyle = `rgba(235,248,252,${al})`; ctx.textAlign = 'right'; ctx.fillText(`SHOT ${String(shotInfo.i + 1).padStart(2, '0')}/${String(shotInfo.n).padStart(2, '0')}   ${shotInfo.name.toUpperCase()}`, w - m - 8 * k, m + 14 * k); ctx.textAlign = 'start'; }
    }
    if (AV.on) {   // scope: three band meters + four beat cells, bottom right
      const bx = w - m - 90 * k, by = h - m - 6 * k, bw = 14 * k;
      [AV.bass, AV.mid, AV.high].forEach((v, n) => { ctx.fillStyle = 'rgba(160,220,235,.25)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k, bw, 30 * k); ctx.fillStyle = 'rgba(160,220,235,.85)'; ctx.fillRect(bx + n * (bw + 4 * k), by - 30 * k * Math.min(1, v), bw, 30 * k * Math.min(1, v)); });
      for (let n = 0; n < 4; n++) { ctx.fillStyle = n === AV.beatInBar ? 'rgba(160,220,235,.95)' : 'rgba(160,220,235,.25)'; ctx.fillRect(bx + 3 * (bw + 4 * k) + 6 * k + n * 7 * k, by - 7 * k, 5 * k, 5 * k); }
      if (AV.vox > 0.4) { ctx.fillStyle = `rgba(160,220,235,${Math.min(1, AV.vox)})`; ctx.fillText('VOX', m + 8 * k, m + 14 * k); }
    }
  }
}

