// ---------------------------------------------------------------- sizing
function fmtSize(){
  const v = $('format').value;
  if (v === 'src') {
    if (!hasVideo) return [1920, 1080];
    const s = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight));
    return [Math.round(video.videoWidth * s / 2) * 2, Math.round(video.videoHeight * s / 2) * 2];
  }
  return v.split('x').map(Number);
}
let viewW = 1, viewH = 1, exporting = false;
function fitCamera(){
  const [fw, fh] = fmtSize(), asp = fw / fh; camera.aspect = asp;
  const tanH = Math.tan(17.5 * DEG), objW = W * 1.15 * Math.min(1, Math.max(aspect, 0.5)), objH = W * 1.15 / Math.max(aspect, 1);
  baseZ = Math.max(objW / (2 * tanH * asp), objH / (2 * tanH), 300) + 60;
  camera.position.set(0, 0, baseZ / zoom); camera.updateProjectionMatrix(); updateFit();
}
function setRenderSize(pw, ph){ renderer.setPixelRatio(1); renderer.setSize(pw, ph, false); U.uPR.value = ph / 900; makeRTs(pw, ph); VU.uRes.value.set(pw, ph); VU.uOutAsp.value = pw / ph; VU.uPxS.value = ph / 1080; updateFit(); }
function updateFit(){ const oa = VU.uOutAsp.value; VU.uFit.value.set(aspect > oa ? 1 : aspect / oa, aspect > oa ? oa / aspect : 1); }
function layoutStage(){
  const [fw, fh] = fmtSize(), wrap = $('stageWrap').getBoundingClientRect();
  const s = Math.min(Math.max(50, wrap.width - 32) / fw, Math.max(50, wrap.height - 32) / fh);
  viewW = Math.round(fw * s); viewH = Math.round(fh * s);
  stage.style.width = viewW + 'px'; stage.style.height = viewH + 'px';
  const dpr = Math.min(2, devicePixelRatio || 1);
  setRenderSize(viewW * dpr, viewH * dpr); hud.width = view.width = viewW * dpr; hud.height = view.height = viewH * dpr; fitCamera();
}
addEventListener('resize', () => { if (!exporting) layoutStage(); });


