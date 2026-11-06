// ---------------------------------------------------------------- export: frame-by-frame seek -> WebGL -> WebCodecs H.264 -> MP4
const status = m => $('status').textContent = m;
const progress = v => $('bar').firstElementChild.style.width = (v * 100).toFixed(1) + '%';
const tick = () => new Promise(r => setTimeout(r, 0));
const hudOff = document.createElement('canvas'), hudCtx = hudOff.getContext('2d');
function seekTo(t){
  return new Promise(res => {
    if (Math.abs(video.currentTime - t) < 1e-3 && !video.seeking) return res();
    const f = () => { video.removeEventListener('seeked', f); res(); };
    video.addEventListener('seeked', f); video.currentTime = t;
  });
}
function renderAt(t, fw, fh, comp, cctx){
  tex.needsUpdate = true; updateCpu(); applyFrame(t); renderGL();
  composeFrame(cctx, fw, fh);
  drawHud(hudCtx, fw, fh); cctx.drawImage(hudOff, 0, 0);
}
async function pickCodec(fw, fh, fps, bitrate){
  const list = [['avc1.640034', 'avc'], ['avc1.4d0034', 'avc'], ['avc1.640033', 'avc'], ['avc1.640028', 'avc'], ['vp09.00.51.08', 'vp9']];
  for (const [codec, mux] of list) {
    const config = {codec, width: fw, height: fh, bitrate, framerate: fps, ...(mux === 'avc' ? {avc: {format: 'avc'}} : {})};
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return {config, mux}; } catch (e) {}
  }
  return null;
}
async function runExport(){
  if (exporting || !hasVideo) return;
  if (!window.VideoEncoder) { status('Этот браузер не умеет кодировать видео. Открой страницу в Chrome, Edge или Safari 16.4+ на компьютере.'); return; }
  const [fw, fh] = fmtSize(), fps = +$('fps').value, D = getDur(), st = getStart(), frames = Math.round(D * fps);
  const bitrate = Math.round(clamp(Math.min(fw * fh * fps * +$('quality').value, 80e6, 300 * 8e6 / D), 3e6, 80e6));   // file stays under ~300 MB: it is built in memory
  const pc = await pickCodec(fw, fh, fps, bitrate);
  if (!pc) { status(`Браузер не поддерживает кодирование ${fw}×${fh}. Выбери формат поменьше (1080p) или другой браузер.`); return; }
  exporting = true; $('render').disabled = true; progress(0); $('dlLink').hidden = true;
  const wasPlaying = playing, t0 = performance.now(); video.pause();
  const comp = document.createElement('canvas'); comp.width = fw; comp.height = fh; const cctx = comp.getContext('2d');
  hudOff.width = fw; hudOff.height = fh;
  try {
    setRenderSize(fw, fh); fitCamera();
    const target = new Mp4Muxer.ArrayBufferTarget();
    let audioCfg = null, audioMux = 'aac';
    if ($('expAud').checked && audioBuf && window.AudioEncoder) {
      for (const [codec, mux] of [['mp4a.40.2', 'aac'], ['opus', 'opus']]) {       // AAC plays everywhere; Opus-in-MP4 only if the browser cannot encode AAC
        const c = {codec, sampleRate: audioBuf.sampleRate, numberOfChannels: Math.min(2, audioBuf.numberOfChannels), bitrate: 192000};
        try { if ((await AudioEncoder.isConfigSupported(c)).supported) { audioCfg = c; audioMux = mux; break; } } catch (e) {}
      }
    }
    const mopts = {target, video: {codec: pc.mux, width: fw, height: fh, frameRate: fps}, fastStart: 'in-memory'};
    if (audioCfg) mopts.audio = {codec: audioMux, numberOfChannels: audioCfg.numberOfChannels, sampleRate: audioCfg.sampleRate};
    const muxer = new Mp4Muxer.Muxer(mopts);
    let err = null;
    const enc = new VideoEncoder({output: (c, m) => muxer.addVideoChunk(c, m), error: e => err = e});
    enc.configure(pc.config);
    for (let i = 0; i < frames; i++) {
      if (err) throw err;
      await seekTo(Math.min(st + i / fps, vdur - 0.001));
      renderAt(i / fps, fw, fh, comp, cctx);
      const vf = new VideoFrame(comp, {timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps)});
      enc.encode(vf, {keyFrame: i % (fps * 2) === 0}); vf.close();
      while (enc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 4));
      if (i % 2 === 0) { progress(i / frames); const el = (performance.now() - t0) / 1000, eta = i > 20 ? Math.round(el / i * (frames - i)) : null;
        status(`Рендер: кадр ${i + 1} из ${frames} (${fw}×${fh})` + (eta !== null ? ` · осталось ~${eta >= 90 ? Math.round(eta / 60) + ' мин' : eta + ' с'}. Не закрывай и не сворачивай вкладку.` : '')); await tick(); }
    }
    await enc.flush(); enc.close();
    if (audioCfg) {
      status('Кодирую звук…');
      let aerr = null; const aenc = new AudioEncoder({output: (c, m) => muxer.addAudioChunk(c, m), error: e => aerr = e}); aenc.configure(audioCfg);
      const sr = audioBuf.sampleRate, ch = audioCfg.numberOfChannels, a0 = Math.round(st * sr), a1 = Math.min(audioBuf.length, Math.round((st + D) * sr)), CH = 4096;
      for (let o = a0; o < a1; o += CH) {
        if (aerr) throw aerr;
        const n = Math.min(CH, a1 - o), data = new Float32Array(n * ch);
        for (let c = 0; c < ch; c++) data.set(audioBuf.getChannelData(c).subarray(o, o + n), c * n);
        aenc.encode(new AudioData({format: 'f32-planar', sampleRate: sr, numberOfFrames: n, numberOfChannels: ch, timestamp: Math.round((o - a0) / sr * 1e6), data}));
        while (aenc.encodeQueueSize > 24) await new Promise(r => setTimeout(r, 4));
      }
      await aenc.flush(); aenc.close(); if (aerr) throw aerr;
    }
    muxer.finalize();
    if (err) throw err;
    lastBlob = new Blob([target.buffer], {type: 'video/mp4'}); lastName = `video-field_${fw}x${fh}_${D}s.mp4`;
    const link = $('dlLink'); link.textContent = `⬇ Сохранить ${lastName} · ${(lastBlob.size / 1048576).toFixed(1)} МБ`; link.hidden = false;
    progress(1); status('Готово' + (audioCfg ? (audioMux === 'aac' ? ' (со звуком)' : ' (со звуком Opus: браузер не умеет AAC)') : '') + '. Нажми кнопку «Сохранить» рядом.');
  } catch (e) {
    status('Не получилось: ' + (e && e.message || e));
  } finally {
    exporting = false; $('render').disabled = false; layoutStage(); await seekTo(st);
    if (wasPlaying) playVideo();
  }
}
$('render').onclick = runExport;
let lastBlob = null, lastName = '';
$('dlLink').onclick = async () => {
  if (!lastBlob) return;
  let d = null; try { d = window.claude && await window.claude.use('downloads'); } catch (e) {}
  if (d) {
    try { await d.save({filename: lastName, data: lastBlob}); status('Файл сохранён.'); }
    catch (e) { status(e && e.code === 'declined' ? 'Сохранение отменено.' : 'Не удалось сохранить: ' + (e && (e.message || e.code))); }
    return;
  }
  const url = URL.createObjectURL(lastBlob), a = document.createElement('a'); a.href = url; a.download = lastName; document.body.appendChild(a); a.click(); a.remove();
};

