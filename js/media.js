/* ============================================================
   media.js
   本文の上に並べる「画像・添付の帯」
   ------------------------------------------------------------
   以前は右側に画像パネルを常に出していたため、画像の無いメモでも
   画面幅の 1/4 近くを「画像はありません」の案内が占めていた。
   画像・添付は本文のすぐ上に小さく並べ、大きく見たいときだけ
   右のパネルを開く（UI/UX 見直し 項目A「骨格」の決定案）。
   中身が無いメモでは帯を出さず、メタ情報の行に追加ボタンだけを置く。
   ============================================================ */
'use strict';

function renderMediaStrip() {
  if (!refs.mediaStrip) return;
  const imgs = state.images || [];
  const files = state.attachments || [];
  const has = imgs.length + files.length > 0;
  refs.mediaStrip.hidden = !has;
  refs.btnAddMedia.hidden = has;
  if (!has) { refs.mediaStrip.innerHTML = ''; return; }
  const mobile = isMobileLayout();
  const open = panelEffectivelyOpen() && !mobile;
  refs.mediaStrip.innerHTML =
    imgs.map((img, i) =>
      `<button class="ms-thumb" data-index="${i}" title="${esc(img.name)}（クリックで拡大）">
         <img src="${urlOf(img)}" alt="${esc(img.name)}" loading="lazy"></button>`).join('') +
    files.map(f =>
      `<button class="ms-file" data-id="${f.id}" title="${esc(f.name)}（${formatBytes(f.size)}・クリックでダウンロード）">
         <i class="fa-regular ${fileIconFor(f.name, f.type)}"></i><span class="ms-file-name">${esc(f.name)}</span></button>`).join('') +
    `<button class="ms-add" data-act="add" title="画像・ファイルを追加"><i class="fa-solid fa-plus"></i></button>` +
    /* 狭い画面ではパネルではなく「画像・添付」の画面へ移るので、言い方を変える */
    (mobile
      ? `<button class="ms-panel" data-act="panel" title="画像と添付を大きく表示"><i class="fa-regular fa-images"></i> 大きく見る</button>`
      : `<button class="ms-panel${open ? ' active' : ''}" data-act="panel" title="${open ? '右のパネルを閉じる' : '画像と添付を右のパネルで大きく表示'}">` +
        (open ? '<i class="fa-solid fa-xmark"></i> パネルを閉じる' : '<i class="fa-solid fa-table-columns"></i> パネルで見る') + `</button>`);
}

/* 画像と、それ以外のファイルを振り分けて登録する（帯の「＋」から） */
function addMediaFiles(fileList) {
  const files = [...fileList];
  const images = files.filter(f => f.type.startsWith('image/'));
  const others = files.filter(f => !f.type.startsWith('image/'));
  if (images.length > 0) addImageFiles(images);
  if (others.length > 0) addAttachmentFiles(others);
}

function bindMediaStrip() {
  refs.btnAddMedia.addEventListener('click', () => refs.mediaInput.click());
  refs.mediaInput.addEventListener('change', () => {
    if (refs.mediaInput.files.length > 0) addMediaFiles(refs.mediaInput.files);
    refs.mediaInput.value = '';
  });
  refs.mediaStrip.addEventListener('click', e => {
    const thumb = e.target.closest('.ms-thumb');
    if (thumb) { lbShow(Number(thumb.dataset.index)); return; }
    const file = e.target.closest('.ms-file');
    if (file) { downloadAttachment(Number(file.dataset.id)); return; }
    const act = e.target.closest('[data-act]');
    if (!act) return;
    if (act.dataset.act === 'add') refs.mediaInput.click();
    else if (act.dataset.act === 'panel') {
      /* 狭い画面ではパネルは「画像・添付」タブとして表示する */
      if (isMobileLayout()) setMobileTab('files');
      else togglePanel(!panelEffectivelyOpen());
    }
  });
}
