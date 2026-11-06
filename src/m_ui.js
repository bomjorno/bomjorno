// ---------------------------------------------------------------- interface: effect library, shot inspector, palette, transport, timeline, hotkeys
let uiFlags = {insp: true, tl: true};
function uiDirty(){ uiFlags.insp = true; tlDirty = true; }
const h = (tag, attrs, ...kids) => { const el = document.createElement(tag); if (attrs) for (const [k, v] of Object.entries(attrs)) { if (k === 'class') el.className = v; else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v); } kids.flat().forEach(c => c != null && el.append(c.nodeType ? c : document.createTextNode(c))); return el; };
const ICON = {
  play: '<path d="M8 5v14l11-7z"/>', pause: '<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>', back: '<path d="M6 5h2v14H6zM20 5v14L9 12z"/>', fwd: '<path d="M16 5h2v14h-2zM4 5v14l11-7z"/>', fb: '<path d="M15 6l-8 6 8 6z"/><path d="M6 6h2v12H6z"/>', ff: '<path d="M9 6l8 6-8 6z"/><path d="M16 6h2v12h-2z"/>',
  razor: '<circle cx="6" cy="7" r="2.6"/><circle cx="6" cy="17" r="2.6"/><path d="M8 8.5L20 18M8 15.5L20 6" fill="none" stroke="currentColor" stroke-width="2"/>', sel: '<path d="M5 3l13 8-6 1.5L9 19z"/>', snap: '<path d="M6 3v8a6 6 0 0 0 12 0V3h-4v8a2 2 0 0 1-4 0V3z"/>',
  loop: '<path d="M7 7h9l-2-2 1.4-1.4L20 8l-4.6 4.4L14 11l2-2H7a3 3 0 0 0-3 3v1H2v-1a5 5 0 0 1 5-5zm10 10H8l2 2-1.4 1.4L4 16l4.6-4.4L10 13l-2 2h9a3 3 0 0 0 3-3v-1h2v1a5 5 0 0 1-5 5z"/>',
  undo: '<path d="M12 5V2L6 7l6 5V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z"/>', redo: '<path d="M12 5V2l6 5-6 5V8a6 6 0 1 0 6 6h2a8 8 0 1 1-8-9z"/>', plus: '<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>', x: '<path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>',
  copy: '<path d="M8 3h11v13h-2V5H8zM5 7h11v14H5z"/>', eye: '<path d="M12 5C6 5 2 12 2 12s4 7 10 7 10-7 10-7-4-7-10-7zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"/>', flag: '<path d="M6 3h2v18H6zM9 4h10l-3 4 3 4H9z"/>', star: '<path d="M12 2l2.5 7.5H22l-6 4.5 2.3 7.5L12 17l-6.3 4.5L8 14 2 9.5h7.5z"/>', kbd: '<path d="M3 6h18v12H3zm3 3v2h2V9zm4 0v2h2V9zm4 0v2h2V9zm4 0v2h2V9zM6 13v2h12v-2z"/>', film: '<path d="M4 3h16v18H4zm2 2v2h2V5zm0 4v2h2V9zm0 4v2h2v-2zm0 4v2h2v-2zm10-12v2h2V5zm0 4v2h2V9zm0 4v2h2v-2zm0 4v2h2v-2zM10 5v14h4V5z"/>'};
const icon = (n, s = 18) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', s); el.setAttribute('height', s); el.setAttribute('fill', 'currentColor'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = ICON[n]; return el; };
document.querySelectorAll('[data-ic]').forEach(b => b.prepend(icon(b.dataset.ic, +b.dataset.sz || 18)));

// ---- tabs
document.querySelectorAll('.tabs').forEach(tb => tb.addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; tb.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
  const scope = tb.dataset.scope; document.querySelectorAll(`[data-pane-of="${scope}"]`).forEach(p => p.hidden = p.dataset.pane !== b.dataset.tab); }));
const openTab = (scope, tab) => document.querySelector(`.tabs[data-scope="${scope}"] button[data-tab="${tab}"]`).click();

// ---- effect library
let libMode = 'fx';
function renderLib(){
  const box = $('libList'), q = $('libSearch').value.trim().toLowerCase(); box.innerHTML = '';
  if (libMode === 'fx') Object.entries(CATS).forEach(([cat, [name, hue]]) => {
    const items = Object.values(EFX).filter(e => e.cat === cat && (!q || (e.name + ' ' + e.desc).toLowerCase().includes(q)));
    if (!items.length) return;
    box.append(h('div', {class: 'cat', style: `--h:${hue}`}, h('span', {class: 'catdot'}), name, h('em', null, items.length)));
    const grid = h('div', {class: 'cards'}); items.forEach(e => grid.append(h('button', {class: 'card', style: `--h:${hue}`, title: e.desc, onclick: ev => addEffect(e.id, $('allClip').checked || ev.altKey)}, h('b', null, e.name), h('small', null, e.desc))));
    box.append(grid);
  });
  else {
    const grid = h('div', {class: 'cards one'});
    Object.entries(PRESETS).filter(([k, p]) => !q || p.name.toLowerCase().includes(q)).forEach(([k, p]) => grid.append(h('button', {class: 'card', style: `--h:${CATS[EFX[p.stack[0][0]].cat][1]}`, title: 'Заменить стек выбранного шота', onclick: () => usePreset(selShot, k)},
      h('b', null, p.name), h('small', null, p.stack.map(([id]) => EFX[id].name).join(' · ')))));
    box.append(grid);
  }
}
$('libSearch').addEventListener('input', renderLib);
$('libTabs').addEventListener('click', e => { const b = e.target.closest('button[data-m]'); if (!b) return; libMode = b.dataset.m; $('libTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderLib(); });

// ---- shot inspector
function paramRow(it, P, s){
  if (P.opts) { const sel = h('select', {onchange: e => { it.p[P.k] = isNaN(+e.target.value) || e.target.value === '' ? e.target.value : +e.target.value; s.edited = true; }, onfocus: () => pushUndo()}, P.opts.map(([v, t]) => h('option', {value: v, selected: String(it.p[P.k]) === String(v)}, t)));
    return h('div', {class: 'prow'}, h('span', null, P.l), sel); }
  const out = h('output', null, '');
  const inp = h('input', {type: 'range', min: P.min, max: P.max, step: P.step, value: it.p[P.k], onpointerdown: () => pushUndo(), oninput: e => { it.p[P.k] = +e.target.value; out.textContent = fmtP(+e.target.value, P.step); s.edited = true; $('shotTag').hidden = false; tlDirty = true; }});
  out.textContent = fmtP(+it.p[P.k], P.step); return h('div', {class: 'prow'}, h('span', null, P.l), inp, out);
}
const fmtP = (v, st) => st >= 1 ? String(Math.round(v)) : st < 0.01 ? v.toFixed(3) : v.toFixed(2);
function renderShotPane(){
  const box = $('shotPane'); box.innerHTML = ''; const s = shots[selShot];
  if (!s) { box.append(h('div', {class: 'empty-state'}, h('b', null, 'Здесь появятся настройки шота'), h('p', null, 'Открой видео. Авто-режиссёр разрежет его на шоты по тактам и подберёт эффекты. Любой шот можно выбрать на таймлайне и править.'))); return; }
  box.append(h('div', {class: 'shothead'}, h('div', null, h('b', null, `Шот ${selShot + 1} из ${shots.length}`), h('span', {class: 'tc'}, `${fmtTC(s.t0)} – ${fmtTC(s.t1)} · ${(s.t1 - s.t0).toFixed(1)} с`)),
    h('span', {class: 'badge', id: 'shotTag', hidden: !s.edited}, 'правлен')));
  box.append(h('div', {class: 'frow'}, h('label', null, 'Образ', h('select', {id: 'shotPreset', onchange: e => usePreset(selShot, e.target.value)}, Object.entries(PRESETS).map(([k, p]) => h('option', {value: k, selected: k === s.key}, p.name)))),
    h('label', null, 'Переход в шот', h('select', {onchange: e => { pushUndo(); s.enter = +e.target.value; s.edited = true; }}, [[0, 'Резкий'], [1, 'Смаз'], [2, 'Зум-удар'], [3, 'Глитч'], [4, 'Вспышка']].map(([v, t]) => h('option', {value: v, selected: +s.enter === v}, t))))));
  const rr = h('output', null, (s.react ?? 1).toFixed(2));
  box.append(h('div', {class: 'prow wide'}, h('span', null, 'Реакция на звук'), h('input', {type: 'range', min: 0, max: 2, step: 0.05, value: s.react ?? 1, onpointerdown: () => pushUndo(), oninput: e => { s.react = +e.target.value; rr.textContent = (+e.target.value).toFixed(2); s.edited = true; }}), rr));
  box.append(h('div', {class: 'btnrow'}, h('button', {class: 'mini', onclick: () => splitAt(video.currentTime), title: 'Ctrl+K или C'}, icon('razor', 15), 'Разрезать'), h('button', {class: 'mini', onclick: () => mergePrev(selShot), title: 'Shift+Delete'}, 'Склеить с предыдущим'), h('button', {class: 'mini', onclick: () => usePreset(selShot, s.key)}, 'Сбросить')));
  box.append(h('div', {class: 'stackhead'}, 'Стек эффектов', h('small', null, s.stack.length ? 'порядок не важен, все складываются' : 'пусто')));
  if (!s.stack.length) box.append(h('p', {class: 'sub'}, 'Нажми любой эффект слева, чтобы добавить его в этот шот. Alt+клик или галочка «ко всему клипу» добавит его во все шоты.'));
  s.stack.forEach((it, k) => { const d = EFX[it.id]; if (!d) return;
    const head = h('div', {class: 'fxhead', onclick: () => { selFx = k; renderShotPane(); tlDirty = true; }}, h('i', {class: 'fxdot', style: `--h:${CATS[d.cat][1]}`}), h('b', null, d.name),
      h('span', {class: 'spacer'}), h('button', {class: 'ic' + (it.on === false ? '' : ' on'), title: 'Включить / выключить', onclick: e => { e.stopPropagation(); pushUndo(); it.on = it.on === false ? true : false; s.edited = true; renderShotPane(); }}, icon('eye', 15)),
      h('button', {class: 'ic', title: 'Дублировать (Ctrl+D)', onclick: e => { e.stopPropagation(); dupEffect(selShot, k); }}, icon('copy', 14)), h('button', {class: 'ic', title: 'Удалить (Delete)', onclick: e => { e.stopPropagation(); removeEffect(selShot, k); }}, icon('x', 14)));
    box.append(h('div', {class: 'fxitem' + (k === selFx ? ' sel' : '') + (it.on === false ? ' off' : ''), 'data-k': k}, head, d.params.map(P => paramRow(it, P, s)))); });
}
function renderPalette(){ setPalette({}); }
ROLES.forEach(([k]) => $('pal_' + k).addEventListener('input', e => { setPalette({[k]: unhex(e.target.value)}, true); status('Палитра изменена: все эффекты берут цвета из неё.'); }));
$('btnPalDetect').onclick = async () => { if (!hasVideo) return; status('Определяю палитру…'); const was = playing; await visualAnalyse(); if (was) setPlaying(true); status('Палитра определена заново.'); };

// ---- transport + hotkeys
function uiTransport(){
  const b = $('btnPlay'); b.innerHTML = ''; b.append(icon(playing ? 'pause' : 'play', 24)); b.setAttribute('aria-label', playing ? 'Пауза' : 'Играть'); b.classList.toggle('on', playing);
  $('btnLoop').classList.toggle('on', loopShot); $('btnSnap').classList.toggle('on', snapOn); $('toolSel').classList.toggle('on', tool === 'select'); $('toolRazor').classList.toggle('on', tool === 'razor');
  $('spd').textContent = rate === 1 ? '1×' : rate + '×'; $('tlWrap').dataset.tool = tool; $('tl').style.cursor = tool === 'razor' ? 'crosshair' : 'default';
}
$('btnPlay').onclick = () => setPlaying(!playing);
$('btnFB').onclick = () => stepFrames(-1); $('btnFF').onclick = () => stepFrames(1); $('btnPrev').onclick = () => gotoShot(-1); $('btnNext').onclick = () => gotoShot(1);
$('btnLoop').onclick = () => { loopShot = !loopShot; uiTransport(); }; $('btnSnap').onclick = () => { snapOn = !snapOn; uiTransport(); status(snapOn ? 'Привязка к битам включена.' : 'Привязка к битам выключена.'); };
$('toolSel').onclick = () => { tool = 'select'; uiTransport(); }; $('toolRazor').onclick = () => { tool = 'razor'; uiTransport(); };
$('btnUndo').onclick = undo; $('btnRedo').onclick = redo;
$('btnAuto').onclick = () => { if (!hasVideo) return; seed++; buildPlan(true); status('Авто-план перебрал шоты, которые ты не правил. Правленые остались на месте.'); };
$('btnHelp').onclick = () => $('help').hidden = !$('help').hidden; $('helpClose').onclick = () => $('help').hidden = true;
const SPEEDS = [0.25, 0.5, 1, 2, 4];
function speed(d){ const i = clamp(SPEEDS.indexOf(rate) + d, 0, SPEEDS.length - 1); rate = SPEEDS[i]; video.playbackRate = rate; uiTransport(); }
function addMarker(){ if (!hasVideo) return; pushUndo(); markers.push(+video.currentTime.toFixed(3)); markers.sort((a, b) => a - b); tlDirty = true; status(`Маркер на ${fmtTC(video.currentTime)}.`); }
addEventListener('keydown', e => {
  const t = e.target, typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'color'].includes(t.type)) || t.tagName === 'SELECT');
  if (typing) { if (e.key === 'Escape') t.blur(); return; }
  const k = e.key, ctrl = e.ctrlKey || e.metaKey, sh = e.shiftKey; let used = true;
  if (k === ' ') setPlaying(!playing);
  else if (k === 'k' || k === 'K') { if (ctrl) splitAt(video.currentTime); else setPlaying(false); }
  else if (k === 'l' || k === 'L') { if (!playing) { rate = 1; setPlaying(true); } else speed(1); }
  else if (k === 'j' || k === 'J') { if (playing) speed(-1); else stepFrames(-10); }
  else if (k === 'ArrowLeft') { if (sh) seekV(video.currentTime - 1); else stepFrames(-1); }
  else if (k === 'ArrowRight') { if (sh) seekV(video.currentTime + 1); else stepFrames(1); }
  else if (k === 'ArrowUp') gotoShot(-1); else if (k === 'ArrowDown') gotoShot(1);
  else if (k === 'Home') seekV(getStart()); else if (k === 'End') seekV(getStart() + getDur() - 0.04);
  else if (k === 'c' || k === 'C') { if (ctrl) used = false; else { tool = tool === 'razor' ? 'select' : 'razor'; uiTransport(); } }
  else if (k === 'v' || k === 'V') { tool = 'select'; uiTransport(); }
  else if (k === 's' || k === 'S') { if (ctrl) used = false; else { snapOn = !snapOn; uiTransport(); } }
  else if (k === 'm' || k === 'M') addMarker();
  else if (k === 'i' || k === 'I') { const v = clamp(video.currentTime, 0, vdur - 0.5); const end = getStart() + getDur(); $('tStart').value = v.toFixed(1); $('dur').value = clamp(end - v, 0.5, MAX_DUR).toFixed(1); syncLimits(); status(`Начало экспорта: ${fmtTC(v)}.`); }
  else if (k === 'o' || k === 'O') { const st = getStart(); $('dur').value = clamp(video.currentTime - st, 0.5, MAX_DUR).toFixed(1); syncLimits(); status(`Конец экспорта: ${fmtTC(video.currentTime)}.`); }
  else if (k === 'x' || k === 'X') { $('tStart').value = 0; $('dur').value = Math.min(MAX_DUR, vdur).toFixed(1); syncLimits(); status('Диапазон экспорта сброшен.'); }
  else if (k === 'z' || k === 'Z') { if (ctrl) { sh ? redo() : undo(); } else used = false; }
  else if (k === 'y' || k === 'Y') { if (ctrl) redo(); else used = false; }
  else if (k === 'd' || k === 'D') { if (ctrl) dupEffect(selShot, selFx); else used = false; }
  else if (k === 'Delete' || k === 'Backspace') { if (sh) mergePrev(selShot); else if (selFx >= 0) removeEffect(selShot, selFx); else used = false; }
  else if (k === '[') { const s = shots[selShot]; if (s) { selFx = Math.max(0, selFx - 1); renderShotPane(); tlDirty = true; } }
  else if (k === ']') { const s = shots[selShot]; if (s) { selFx = Math.min(s.stack.length - 1, selFx + 1); renderShotPane(); tlDirty = true; } }
  else if (k === '=' || k === '+') tlZoom(1.4); else if (k === '-' || k === '_') tlZoom(1 / 1.4); else if (k === '\\') tlFit();
  else if (k === '/') { $('libSearch').focus(); }
  else if (k === '?') $('help').hidden = !$('help').hidden;
  else if (k === 'Escape') { $('help').hidden = true; tool = 'select'; selFx = -1; uiTransport(); renderShotPane(); }
  else if (k === 'Enter' && ctrl) { if (!$('render').disabled) runExport(); }
  else used = false;
  if (used) { e.preventDefault(); if (t && t.blur && (t.type === 'range' || t.tagName === 'BUTTON')) t.blur(); }
});
document.addEventListener('pointerup', e => { const t = e.target; if (t && t.type === 'range' && t.closest('#insp, #shotPane')) { /* keep focus on slider for fine keyboard tweaks */ } });

// ---- timeline
const tl = $('tl'), tlx = tl.getContext('2d');
const TLM = {ruler: 22, wave: 58, hits: 16, shots: 34, fxRow: 16, rows: 6, gut: 66};
let tv0 = 0, tv1 = 10, tlW = 0, tlH = 0, tlDpr = 1, tlStatic = document.createElement('canvas'), tlHover = null;
const tlFamHue = fam => ({g: 36, w: 275, l: 190, v: 14, p: 150, k: 300, x: 350, o: 215}[fam] ?? 200);
function sizeTimeline(){ const r = tl.getBoundingClientRect(); tlDpr = Math.min(2, devicePixelRatio || 1); tlW = Math.max(100, Math.round(r.width * tlDpr)); tlH = Math.max(60, Math.round(r.height * tlDpr)); tl.width = tlStatic.width = tlW; tl.height = tlStatic.height = tlH; tlDirty = true; }
function tlFit(){ tv0 = 0; tv1 = Math.max(1, vdur || 10); tlDirty = true; }
function tlZoom(f, cx){ const c = cx ?? (video.currentTime || (tv0 + tv1) / 2), span = (tv1 - tv0) / f, a = (c - tv0) / (tv1 - tv0); tv0 = c - span * a; tv1 = tv0 + span; if (span > vdur) tlFit(); else { if (tv0 < 0) { tv1 -= tv0; tv0 = 0; } if (tv1 > vdur) { tv0 -= tv1 - vdur; tv1 = vdur; } tv0 = Math.max(0, tv0); } tlDirty = true; }
const tX = t => TLM.gut * tlDpr + (t - tv0) / (tv1 - tv0) * (tlW - TLM.gut * tlDpr), tT = x => tv0 + (x - TLM.gut * tlDpr) / (tlW - TLM.gut * tlDpr) * (tv1 - tv0);
function drawTlStatic(){
  const c = tlStatic.getContext('2d'), w = tlW, hh = tlH, k = tlDpr, g = TLM.gut * k, span = tv1 - tv0;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0b0d12'; c.fillRect(0, 0, w, hh); c.font = `${Math.round(9.5 * k)}px ui-monospace, Menlo, monospace`; c.textBaseline = 'middle';
  const y0 = {ruler: 0, wave: TLM.ruler * k}; y0.hits = y0.wave + TLM.wave * k; y0.shots = y0.hits + TLM.hits * k; y0.fx = y0.shots + TLM.shots * k + 3 * k;
  // lane labels
  c.fillStyle = '#0f1218'; c.fillRect(0, 0, g, hh); c.fillStyle = '#7d8794';
  [['ЗВУК', y0.wave + TLM.wave * k / 2], ['УДАРЫ', y0.hits + TLM.hits * k / 2], ['ШОТЫ', y0.shots + TLM.shots * k / 2], ['ЭФФЕКТЫ', y0.fx + 8 * k]].forEach(([n, y]) => c.fillText(n, 8 * k, y));
  c.save(); c.beginPath(); c.rect(g, 0, w - g, hh); c.clip();
  // ruler
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300]; const st = steps.find(s => span / s < (w - g) / (70 * k)) || 300;
  c.strokeStyle = 'rgba(255,255,255,.09)'; c.fillStyle = '#7d8794'; c.lineWidth = 1;
  for (let t = Math.ceil(tv0 / st) * st; t <= tv1; t += st) { const x = Math.round(tX(t)) + 0.5; c.beginPath(); c.moveTo(x, TLM.ruler * k * 0.55); c.lineTo(x, hh); c.stroke(); c.fillText(`${Math.floor(t / 60)}:${(t % 60).toFixed(st < 1 ? 1 : 0).padStart(st < 1 ? 4 : 2, '0')}`, x + 4 * k, TLM.ruler * k * 0.3); }
  // waveform + beat grid
  if (AU) {
    const px = Math.floor(w - g), bin = span * AH / px; c.fillStyle = 'rgba(120,200,255,.55)'; const mid = y0.wave + TLM.wave * k / 2;
    for (let x = 0; x < px; x += 2) { const i0 = Math.floor((tv0 + x / px * span) * AH), i1 = Math.max(i0 + 1, Math.floor(i0 + bin * 2)); let m = 0; for (let i = i0; i < i1 && i < AU.F; i++) m = Math.max(m, AU.E[3][i]); const hgt = Math.min(1, m) * TLM.wave * k * 0.95; c.fillRect(g + x, mid - hgt / 2, 1.6 * k, Math.max(1, hgt)); }
    const bpx = (w - g) / span * AU.beatLen; if (bpx > 4) for (let n = Math.ceil((tv0 - AU.off) / AU.beatLen);; n++) { const t = AU.off + n * AU.beatLen; if (t > tv1) break; if (t < tv0) continue; const bar = (((n - AU.bar0) % 4) + 4) % 4 === 0; c.strokeStyle = bar ? 'rgba(255,255,255,.4)' : 'rgba(255,255,255,.13)'; c.beginPath(); c.moveTo(tX(t), y0.wave); c.lineTo(tX(t), y0.shots); c.stroke();
      if (bar && bpx * 4 > 30 * k) { c.fillStyle = '#9aa6b4'; c.fillText(String(Math.floor((n - AU.bar0) / 4) + 1), tX(t) + 3 * k, y0.wave + 8 * k); } }
    c.fillStyle = '#ff7a59'; AU.kicks.forEach(t => { if (t >= tv0 && t <= tv1) c.fillRect(tX(t), y0.hits + 1, 1.6 * k, TLM.hits * k * 0.6); });
    c.fillStyle = '#ffe28a'; AU.hats.forEach(t => { if (t >= tv0 && t <= tv1) c.fillRect(tX(t), y0.hits + TLM.hits * k * 0.62, 1.2 * k, TLM.hits * k * 0.3); });
    for (let x = 0; x < px; x += 3) { const v = AU.vp[Math.min(AU.F - 1, Math.floor((tv0 + x / px * span) * AH))]; if (v > 0.35) { c.fillStyle = `rgba(190,150,255,${0.15 + 0.5 * v})`; c.fillRect(g + x, y0.hits + TLM.hits * k * 0.9, 3 * k, 2 * k); } }
  } else { c.fillStyle = '#586270'; c.fillText(hasVideo ? 'в видео нет звука: темп и биты недоступны' : 'открой видео', g + 10 * k, y0.wave + TLM.wave * k / 2); }
  // shots
  shots.forEach((s, i) => { if (s.t1 < tv0 || s.t0 > tv1) return; const xa = Math.max(g, tX(s.t0)), xb = Math.min(w, tX(s.t1)), fam = PRESETS[s.key] ? PRESETS[s.key].fam : 'o', hue = tlFamHue(fam), sel = i === selShot;
    c.fillStyle = `hsla(${hue},65%,${sel ? 55 : 42}%,${sel ? 0.95 : 0.7})`; c.fillRect(xa + 1, y0.shots, Math.max(1, xb - xa - 2), TLM.shots * k);
    if (sel) { c.strokeStyle = '#fff'; c.lineWidth = 1.5 * k; c.strokeRect(xa + 1.5, y0.shots + 0.5, Math.max(1, xb - xa - 3), TLM.shots * k - 1); }
    c.fillStyle = '#fff'; c.font = `600 ${Math.round(10.5 * k)}px ui-sans-serif, system-ui, sans-serif`; c.save(); c.beginPath(); c.rect(xa + 1, y0.shots, xb - xa - 2, TLM.shots * k); c.clip(); c.fillText(`${i + 1}  ${PRESETS[s.key] ? PRESETS[s.key].name : 'Свой'}${s.edited ? ' •' : ''}`, xa + 6 * k, y0.shots + TLM.shots * k / 2); c.restore(); c.font = `${Math.round(9.5 * k)}px ui-monospace, Menlo, monospace`;
    // effect chips
    s.stack.slice(0, TLM.rows).forEach((it, r) => { const d = EFX[it.id]; if (!d) return; const y = y0.fx + r * (TLM.fxRow + 2) * k, hu = CATS[d.cat][1], selfx = sel && r === selFx;
      c.fillStyle = `hsla(${hu},60%,${selfx ? 60 : 38}%,${it.on === false ? 0.25 : selfx ? 1 : 0.78})`; c.fillRect(xa + 1, y, Math.max(1, xb - xa - 2), TLM.fxRow * k);
      if (selfx) { c.strokeStyle = '#fff'; c.lineWidth = 1.2 * k; c.strokeRect(xa + 1.5, y + 0.5, Math.max(1, xb - xa - 3), TLM.fxRow * k - 1); }
      c.fillStyle = it.on === false ? '#8a919c' : '#fff'; c.save(); c.beginPath(); c.rect(xa + 1, y, xb - xa - 2, TLM.fxRow * k); c.clip(); c.fillText(d.name, xa + 5 * k, y + TLM.fxRow * k / 2 + 0.5); c.restore(); });
    if (s.stack.length > TLM.rows) { c.fillStyle = '#9aa6b4'; c.fillText(`+${s.stack.length - TLM.rows}`, xa + 5 * k, y0.fx + TLM.rows * (TLM.fxRow + 2) * k + 4 * k); } });
  // markers
  markers.forEach((m, i) => { if (m < tv0 || m > tv1) return; const x = tX(m); c.fillStyle = '#ffd84a'; c.beginPath(); c.moveTo(x - 4 * k, 0); c.lineTo(x + 4 * k, 0); c.lineTo(x, 9 * k); c.fill(); c.strokeStyle = 'rgba(255,216,74,.35)'; c.beginPath(); c.moveTo(x, 9 * k); c.lineTo(x, hh); c.stroke(); });
  // export range
  const a = getStart(), b = a + getDur(); c.fillStyle = 'rgba(5,6,9,.62)'; if (a > tv0) c.fillRect(g, 0, Math.min(w - g, tX(a) - g), hh); if (b < tv1) c.fillRect(Math.max(g, tX(b)), 0, w, hh);
  c.fillStyle = 'rgba(255,255,255,.8)'; [[a, 1], [b, -1]].forEach(([t, d]) => { if (t < tv0 || t > tv1) return; const x = tX(t); c.fillRect(x - 0.5 * k, 0, 1.2 * k, hh); c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 7 * k * d, 0); c.lineTo(x, 8 * k); c.fill(); });
  c.restore(); tlDirty = false;
}
function drawTimeline(){
  if (!tlW) sizeTimeline(); if (tlDirty) drawTlStatic();
  if (playing && hasVideo) { const t = video.currentTime; if (t < tv0 || t > tv1) { const span = tv1 - tv0; tv0 = clamp(t - span * 0.15, 0, Math.max(0, vdur - span)); tv1 = tv0 + span; tlDirty = true; } }
  tlx.setTransform(1, 0, 0, 1, 0, 0); tlx.drawImage(tlStatic, 0, 0);
  if (!hasVideo) return; const k = tlDpr, x = tX(video.currentTime);
  if (x >= TLM.gut * k && x <= tlW) { tlx.strokeStyle = '#ff4d5e'; tlx.lineWidth = 1.5 * k; tlx.beginPath(); tlx.moveTo(x, 0); tlx.lineTo(x, tlH); tlx.stroke(); tlx.fillStyle = '#ff4d5e'; tlx.beginPath(); tlx.moveTo(x - 5 * k, 0); tlx.lineTo(x + 5 * k, 0); tlx.lineTo(x, 9 * k); tlx.fill(); }
  if (tool === 'razor' && tlHover != null) { const hx = tX(tlHover); tlx.strokeStyle = 'rgba(255,255,255,.7)'; tlx.setLineDash([4 * k, 3 * k]); tlx.beginPath(); tlx.moveTo(hx, TLM.ruler * k); tlx.lineTo(hx, tlH); tlx.stroke(); tlx.setLineDash([]); }
}
// timeline pointer logic
let tlDrag = null;
const tlPos = e => { const r = tl.getBoundingClientRect(), px = (e.clientX - r.left) * (tlW / r.width), py = (e.clientY - r.top) * (tlH / r.height); return {px, py, t: tT(px), yy: py / tlDpr}; };
function nearCut(px){ for (let i = 1; i < shots.length; i++) if (Math.abs(tX(shots[i].t0) - px) < 7 * tlDpr) return i; return -1; }
tl.addEventListener('pointerdown', e => {
  if (!hasVideo) return; tl.setPointerCapture(e.pointerId); const {px, py, t, yy} = tlPos(e); if (px < TLM.gut * tlDpr) return;
  const yShots = TLM.ruler + TLM.wave + TLM.hits, yFx = yShots + TLM.shots + 3;
  if (yy < yShots) { tlDrag = {mode: 'seek'}; seekV(t); return; }
  if (tool === 'razor') { splitAt(t); return; }
  if (yy < yShots + TLM.shots) { const c = nearCut(px); if (c > 0) { pushUndo(); tlDrag = {mode: 'cut', i: c}; return; } selShot = shotIndexAt(t); selFx = -1; seekV(t); uiDirty(); tlDrag = {mode: 'seek'}; return; }
  const si = shotIndexAt(t), r = Math.floor((yy - yFx) / (TLM.fxRow + 2)); selShot = si; selFx = r >= 0 && r < shots[si].stack.length ? r : -1; seekV(t); uiDirty(); openTab('insp', 'shot');
});
tl.addEventListener('pointermove', e => { if (!hasVideo) return; const {px, t, yy} = tlPos(e); tlHover = t;
  if (tlDrag) { if (tlDrag.mode === 'seek') seekV(t); else if (tlDrag.mode === 'cut') { moveCut(tlDrag.i, snapT(t)); tlDirty = true; } return; }
  const yShots = TLM.ruler + TLM.wave + TLM.hits; tl.style.cursor = tool === 'razor' ? 'crosshair' : (yy >= yShots && yy < yShots + TLM.shots && nearCut(px) > 0 ? 'ew-resize' : 'default'); });
tl.addEventListener('pointerup', () => { if (tlDrag && tlDrag.mode === 'cut') uiDirty(); tlDrag = null; }); tl.addEventListener('pointerleave', () => { tlHover = null; });
tl.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey || e.altKey) tlZoom(e.deltaY < 0 ? 1.25 : 0.8, tlPos(e).t); else { const span = tv1 - tv0, d = (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY) / 600 * span; tv0 = clamp(tv0 + d, 0, Math.max(0, vdur - span)); tv1 = tv0 + span; tlDirty = true; } }, {passive: false});
$('tlIn').onclick = () => tlZoom(1.4); $('tlOut').onclick = () => tlZoom(1 / 1.4); $('tlFit').onclick = tlFit;
addEventListener('resize', sizeTimeline);

// ---- preview loop
let uiTick = 0;
function frame(){
  if (!exporting && hasVideo) {
    const st = getStart(), D = getDur(), en = st + D, tn = video.currentTime;
    if (playing) { const sh = shots[shotIndexAt(tn)]; if (loopShot && sh && tn >= sh.t1 - 0.02) seekV(sh.t0); else if (tn >= en - 0.02) seekV(st); }
    tex.needsUpdate = true; updateCpu(); applyFrame(video.currentTime - st); renderGL(); composeFrame(vctx, view.width, view.height); drawHud(hctx, hud.width, hud.height);
    if (uiFlags.insp) { uiFlags.insp = false; renderShotPane(); }
    drawTimeline();
    if (++uiTick % 3 === 0) { $('tcode').textContent = `${fmtTC(video.currentTime)} / ${fmtTC(vdur)}`; $('shotNow').textContent = shotInfo.n ? `Шот ${shotInfo.i + 1}/${shotInfo.n} · ${shotInfo.name}` : ''; }
  } else if (!hasVideo) { if (tlDirty) drawTimeline(); }
  requestAnimationFrame(frame);
}
renderLib(); renderPalette(); renderShotPane(); uiTransport(); openTab('insp', 'shot');
window.__vf = {video, U, VU, LA, get edgeMax(){ return edgeMax; }, pickNodes: () => { analyseEdges(); return pickNodes().length; }, get G(){ return Object.fromEntries(['nDens','nThr','nMin','nMax','nStroke','nShape','geoColor','lMode'].map(k => [k, $(k).value])); }, get shots(){ return shots; }, get PAL(){ return PAL; }, get count(){ return count; }, get tracked(){ return tracked; }, EFX, PRESETS, setPlaying, stepFrames, splitAt, usePreset, addEffect, undo, redo, get tool(){ return tool; }};
layoutStage(); sizeTimeline(); requestAnimationFrame(frame);
