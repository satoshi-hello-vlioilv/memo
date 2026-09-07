/* ============================================================
   images.js
   画像：IndexedDB への登録・表示・削除、画像パネル、ライトボックス
   ============================================================ */
'use strict';

/* ============================================================
   画像：登録・表示・サイズ変更（IndexedDB / Blob 管理）
   ============================================================ */
const urlMap = new Map();   /* image id -> objectURL */
function revokeUrls() {
  for (const u of urlMap.values()) URL.revokeObjectURL(u);
  urlMap.clear();
}
function urlOf(img) {
  if (!urlMap.has(img.id)) urlMap.set(img.id, URL.createObjectURL(img.blob));
  return urlMap.get(img.id);
}

async function loadImages() {
  revokeUrls();
  state.images = state.currentId === null
    ? []
    : (await Store.byIndex('images', 'memoId', state.currentId)).sort((a, b) => a.id - b.id);
  renderImages();
}
function renderImages() {
  refs.imgCount.textContent = state.images.length;
  refs.imgEmpty.hidden = state.images.length > 0;
  refs.thumbGrid.innerHTML = state.images.map((img, i) => `
    <figure class="thumb" data-id="${img.id}" data-index="${i}">
      <div class="thumb-frame" title="クリックで拡大表示">
        <img src="${urlOf(img)}" alt="${esc(img.name)}" loading="lazy">
        <div class="thumb-acts">
          <button class="t-act t-insert" title="本文に挿入"><i class="fa-solid fa-text-width"></i></button>
          <button class="t-act t-view" title="拡大表示"><i class="fa-solid fa-up-right-and-down-left-from-center"></i></button>
          <button class="t-act t-del" title="この画像を削除"><i class="fa-regular fa-trash-can"></i></button>
        </div>
      </div>
      <figcaption class="thumb-name" title="${esc(img.name)}">${esc(img.name)}</figcaption>
      <button class="t-insert" title="本文に挿入"><i class="fa-solid fa-text-width"></i> 本文に挿入</button>
    </figure>`).join('');
}
async function updateImageCount() {
  if (state.currentId === null) return;
  const old = await Store.get('memos', state.currentId);
  if (!old) return;
  await Store.put('memos', { ...old, imageCount: state.images.length, updatedAt: Date.now() });
  await refreshMemos();
  renderList(); renderStamps();
}
async function addImageFiles(fileList, sourceName = null) {
  const files = [...fileList].filter(f => f.type.startsWith('image/'));
  if (files.length === 0) { toast('画像ファイルのみ登録できます', 'error'); return; }
  /* 未保存の新規メモには先にレコードを作成して紐付ける */
  if (refs.sheet.hidden) newMemo();
  if (state.currentId === null) await saveCurrent(true);
  const now = Date.now();
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const name = f.name && f.name !== 'image.png'
      ? f.name
      : `${sourceName || 'clipboard'}_${fmtDate(now).replaceAll('/','')}_${fmtTime(now).replace(':','')}${files.length > 1 ? '_' + (i+1) : ''}.png`;
    await Store.add('images', { memoId: state.currentId, name, type: f.type, blob: f, createdAt: now });
  }
  await loadImages();
  await updateImageCount();
  toast(`画像を ${files.length} 件登録しました`, 'success');
}
async function removeImage(id) {
  const img = state.images.find(x => x.id === id);
  const ok = await confirmDialog({
    title: '画像の削除',
    message: `「${img?.name || '画像'}」を削除します。この操作は取り消せません。`,
    okLabel: '削除する',
  });
  if (!ok) return;
  await Store.del('images', id);
  await loadImages();
  await updateImageCount();
  toast('画像を削除しました', 'success');
}

function applyThumbSize() {
  refs.thumbGrid.style.setProperty('--thumb', state.thumbSize + 'px');
}

/* 画像パネルの幅はドラッグで自由に変更できる。ウィンドウ幅に対して
   サイドバー・本文編集領域が潰れないよう、適用のたびに範囲をクランプする。 */
function imgPanelWidthBounds() {
  const min = 260;
  const max = Math.max(min, Math.min(720, window.innerWidth - 650));
  return { min, max };
}
function applyImgPanelWidth() {
  const { min, max } = imgPanelWidthBounds();
  const w = Math.min(Math.max(state.imgPanelWidth, min), max);
  document.documentElement.style.setProperty('--imgpanel-w', w + 'px');
}

/* ============================================================
   ライトボックス（拡大・縮小・パン・切替）
   ============================================================ */
const lb = { open: false, index: 0, scale: 1, tx: 0, ty: 0 };
function lbApply() {
  refs.lbImg.style.transform = `translate(${lb.tx}px, ${lb.ty}px) scale(${lb.scale})`;
  refs.lbZoom.textContent = Math.round(lb.scale * 100) + '%';
}
function lbFitScale() {
  const sw = refs.lbStage.clientWidth - 32;
  const sh = refs.lbStage.clientHeight - 32;
  const nw = refs.lbImg.naturalWidth || 1;
  const nh = refs.lbImg.naturalHeight || 1;
  return Math.min(sw / nw, sh / nh);
}
function lbFit() { lb.scale = lbFitScale(); lb.tx = 0; lb.ty = 0; lbApply(); }
function lbZoomTo(s, px = 0, py = 0) {
  const ns = Math.min(8, Math.max(0.05, s));
  const k = ns / lb.scale;
  lb.tx = px - (px - lb.tx) * k;
  lb.ty = py - (py - lb.ty) * k;
  lb.scale = ns;
  lbApply();
}
function lbShow(index) {
  if (state.images.length === 0) return;
  lb.index = (index + state.images.length) % state.images.length;
  const img = state.images[lb.index];
  refs.lbName.textContent = img.name;
  refs.lbIndex.textContent = `${lb.index + 1} / ${state.images.length}`;
  refs.lbImg.onload = () => lbFit();
  refs.lbImg.src = urlOf(img);
  const multi = state.images.length > 1;
  refs.lbPrev.hidden = !multi;
  refs.lbNext.hidden = !multi;
  if (refs.lightbox.hidden) { refs.lightbox.hidden = false; lb.open = true; }
}
function lbClose() {
  refs.lightbox.hidden = true;
  lb.open = false;
  refs.lbImg.src = '';
}
function setupLightboxEvents() {
  refs.lbClose.addEventListener('click', lbClose);
  refs.lbPrev.addEventListener('click', () => lbShow(lb.index - 1));
  refs.lbNext.addEventListener('click', () => lbShow(lb.index + 1));
  refs.lbZoomIn.addEventListener('click', () => lbZoomTo(lb.scale * 1.25));
  refs.lbZoomOut.addEventListener('click', () => lbZoomTo(lb.scale / 1.25));
  refs.lbFit.addEventListener('click', lbFit);
  refs.lbActual.addEventListener('click', () => { lb.scale = 1; lb.tx = 0; lb.ty = 0; lbApply(); });
  refs.lbStage.addEventListener('wheel', e => {
    e.preventDefault();
    const rect = refs.lbStage.getBoundingClientRect();
    const px = e.clientX - rect.left - rect.width / 2;
    const py = e.clientY - rect.top - rect.height / 2;
    lbZoomTo(lb.scale * Math.pow(1.0016, -e.deltaY), px, py);
  }, { passive: false });
  /* ドラッグでパン */
  let panning = false, sx = 0, sy = 0, ox = 0, oy = 0;
  refs.lbImg.addEventListener('pointerdown', e => {
    panning = true; sx = e.clientX; sy = e.clientY; ox = lb.tx; oy = lb.ty;
    refs.lbImg.classList.add('panning');
    refs.lbImg.setPointerCapture(e.pointerId);
  });
  refs.lbImg.addEventListener('pointermove', e => {
    if (!panning) return;
    lb.tx = ox + (e.clientX - sx);
    lb.ty = oy + (e.clientY - sy);
    lbApply();
  });
  const endPan = () => { panning = false; refs.lbImg.classList.remove('panning'); };
  refs.lbImg.addEventListener('pointerup', endPan);
  refs.lbImg.addEventListener('pointercancel', endPan);
  refs.lbStage.addEventListener('dblclick', lbFit);
  refs.lightbox.addEventListener('click', e => {
    if (e.target === refs.lbStage) lbClose();
  });
}
