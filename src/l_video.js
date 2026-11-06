// ---------------------------------------------------------------- video loading, playback, frame stepping
let playing = false, objUrl = null, rate = 1, loopShot = false, tool = 'select';
function playVideo(){ video.muted = !$('snd').checked; video.playbackRate = rate; const r = video.play(); if (r && r.catch) r.catch(() => { video.muted = true; video.play().catch(() => {}); }); }
function setPlaying(on){
  if (!hasVideo) on = false;
  playing = on;
  if (on) { const st = getStart(), en = st + getDur(); if (video.currentTime >= en - 0.05 || video.currentTime < st - 0.05) video.currentTime = st; playVideo(); } else video.pause();
  uiTransport();
}
const seekV = tv => { if (hasVideo) video.currentTime = clamp(tv, 0, Math.max(0, vdur - 0.001)); };
function stepFrames(n){ if (!hasVideo) return; setPlaying(false); const f = Math.round(video.currentTime * srcFps) + n; seekV(f / srcFps + 0.0005); }
function gotoShot(dir){
  if (!shots.length) return; const tv = video.currentTime, i = shotIndexAt(tv);
  let j = dir > 0 ? Math.min(shots.length - 1, i + 1) : (tv - shots[i].t0 > 0.3 ? i : Math.max(0, i - 1));
  selShot = j; selFx = -1; seekV(shots[j].t0 + 0.001); uiDirty();
}
const MS = {snd: null};
function loadVideo(file){
  if (!file || !file.type.startsWith('video/')) { status('Это не видеофайл.'); return; }
  if (objUrl) URL.revokeObjectURL(objUrl);
  objUrl = URL.createObjectURL(file); hasVideo = false; $('render').disabled = true; playing = false; shots = []; hist.length = 0; redoStack.length = 0; markers = [];
  video.onloadedmetadata = async () => {
    vdur = video.duration;
    if (!isFinite(vdur) || !video.videoWidth) { status('Не удалось прочитать видео. Попробуй MP4 (H.264) или WebM.'); return; }
    $('tStart').max = Math.max(0, vdur - 0.5).toFixed(1); $('tStart').value = 0;
    $('dur').max = Math.min(MAX_DUR, vdur).toFixed(1); $('dur').value = Math.min(MAX_DUR, vdur).toFixed(1);
    syncLimits(); $('cyc').value = Math.min(6, getDur()).toFixed(1); setOut('cyc', fmtT(+$('cyc').value));
    $('format').value = 'src'; layoutStage();
    const big = Math.max(video.videoWidth, video.videoHeight);
    $('vinfo').textContent = `${file.name} · ${video.videoWidth}×${video.videoHeight} · ${vdur.toFixed(1)} с` + (vdur > MAX_DUR ? ' · в экспорт войдёт до 5 минут' : '') + (big > MAX_SIDE ? ' · больше 2K, в экспорте уменьшится' : '');
    if (tex) tex.dispose();
    await new Promise(r => { if (video.readyState >= 2) r(); else video.onloadeddata = r; });
    tex = new THREE.VideoTexture(video); tex.minFilter = tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false;
    U.uTex.value = tex; hasVideo = true; $('empty').hidden = true;
    buildGrid(); layoutStage(); video.currentTime = 0; detectFps();
    status('Анализирую звук…');
    const hasAudio = await analyseAudio(file);
    $('audInfo').textContent = hasAudio ? `Звук найден: темп ${AU.bpm.toFixed(0)} BPM, ${AU.kicks.length} ударов, ${AU.sections.length} секций по громкости. Слова не распознаются: голос определяется по ритму слогов.` : 'В файле нет звука, который удалось прочитать. Реакция на ритм отключена.';
    $('audOn').checked = hasAudio; $('audOn').disabled = !hasAudio; $('expAud').disabled = !hasAudio; $('snd').disabled = !hasAudio;
    status('Смотрю картинку: яркость, контуры, цвета, движение…'); await visualAnalyse();
    buildPlan(false); hist.length = 0; selShot = 0; $('render').disabled = false; tlFit(); uiDirty();
    status(`Готово: ${shots.length} шотов. Пробел запускает видео, клавиша «?» показывает все хоткеи.`);
    setPlaying(true);
  };
  video.onerror = () => status('Браузер не смог открыть это видео. Попробуй MP4 (H.264) или WebM.');
  video.src = objUrl;
}
function syncLimits(){
  const start = getStart(), maxD = Math.min(MAX_DUR, Math.max(0.5, vdur - start));
  $('dur').max = maxD.toFixed(1); if (getDur() > maxD) $('dur').value = maxD.toFixed(1);
  setOut('dur', fmtT(getDur())); setOut('tStart', fmtT(getStart())); tlDirty = true;
}
function detectFps(){
  if (!video.requestVideoFrameCallback) return;
  const ts = []; let n = 0;
  const cb = (now, md) => { ts.push(md.mediaTime); if (++n < 14) video.requestVideoFrameCallback(cb); else {
    // frame times of a constant-fps clip sit on a k/fps grid even when a slow machine skips frames: take the lowest fps whose grid fits all of them
    const grids = [[24000 / 1001, 24], [24, 24], [25, 25], [30000 / 1001, 30], [30, 30], [60000 / 1001, 60], [60, 60]];
    const fit = grids.find(([f]) => ts.every(t => Math.abs(t * f - Math.round(t * f)) < 0.04));
    let best;
    if (fit) best = fit[1];
    else { const d = ts.slice(1).map((v, i) => v - ts[i]).filter(x => x > 0.004 && x < 0.1).sort((a, b) => a - b); if (d.length < 5) return;
      const fps = 1 / d[d.length >> 2]; best = [24, 25, 30, 60].reduce((a, b) => Math.abs(b - fps) < Math.abs(a - fps) ? b : a); }
    srcFps = best; $('fps').value = String(best); } };
  video.requestVideoFrameCallback(cb);
}
$('tStart').addEventListener('input', () => { syncLimits(); seekV(getStart()); });
$('dur').addEventListener('input', () => { syncLimits(); });
$('snd').onchange = () => { video.muted = !$('snd').checked; };
$('vidFile').onchange = e => loadVideo(e.target.files[0]);
let dragDepth = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragDepth++; $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--dragDepth <= 0) $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragDepth = 0; $('drop').hidden = true; loadVideo(e.dataTransfer.files[0]); });
