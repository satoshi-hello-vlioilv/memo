/* ============================================================
   trash.js
   ゴミ箱：メモの削除を「取り消せる削除」にする
   ------------------------------------------------------------
   削除はまず deletedAt を立てるだけ（論理削除）にして一覧から外し、
   一定期間が過ぎたものだけを画像・添付ごと完全に消す。
   ============================================================ */
'use strict';

const TRASH_KEEP_DAYS = 30;

function applyTrashViewState() {
  refs.btnTrash.classList.toggle('active', state.trashView);
  refs.btnTrash.title = state.trashView ? 'メモ一覧に戻る' : `ゴミ箱を開く（${trashedMemos().length} 件）`;
  refs.app.classList.toggle('trash-view', state.trashView);
  refs.trashBar.hidden = !state.trashView;
  if (state.trashView) {
    refs.trashCount.textContent = `${trashedMemos().length} 件`;
  }
  refs.sidebarTitle.innerHTML = state.trashView
    ? '<i class="fa-solid fa-trash-can"></i> ゴミ箱'
    : '<i class="fa-solid fa-clock-rotate-left"></i> メモ一覧';
}
function toggleTrashView(on = !state.trashView) {
  state.trashView = on;
  /* 表示が切り替わると対象の母集団が変わるため、選択と絞り込みは持ち越さない */
  clearSelection();
  state.markFilter = null;
  state.tagFilter = null;
  renderList();
}

/* メモをゴミ箱へ入れる（取り消し可能）。戻り値は成功可否 */
async function moveMemoToTrash(id) {
  const m = await Store.get('memos', id);
  if (!m) return false;
  try {
    await Store.put('memos', { ...m, deletedAt: Date.now() });
  } catch (err) {
    console.error(err);
    toast('メモを削除できませんでした', 'error');
    return false;
  }
  await clearDraftFor(id);
  await refreshMemos();
  return true;
}
async function restoreMemo(id) {
  const m = await Store.get('memos', id);
  if (!m) return;
  await Store.put('memos', { ...m, deletedAt: null });
  await refreshMemos();
  renderList();
  toast(`「${m.title || '無題のメモ'}」を元に戻しました`, 'success');
}
/* 完全削除。画像・添付・下書きも一緒に消す */
async function purgeMemo(id) {
  await deleteImagesOfMemo(id);
  await deleteAttachmentsOfMemo(id);
  await clearDraftFor(id);
  await Store.del('memos', id);
}
async function purgeMemoAsked(id) {
  const m = state.memos.find(x => x.id === id);
  const ok = await confirmDialog({
    title: 'メモの完全削除',
    message: `「${m?.title || '無題のメモ'}」を完全に削除します。この操作は取り消せません。` +
      ((m?.imageCount || 0) > 0 ? `\n画像 ${m.imageCount} 件も削除されます。` : '') +
      ((m?.fileCount || 0) > 0 ? `\n添付ファイル ${m.fileCount} 件も削除されます。` : ''),
    okLabel: '完全に削除する',
  });
  if (!ok) return;
  try {
    await purgeMemo(id);
  } catch (err) {
    console.error(err);
    toast('削除できませんでした', 'error');
    return;
  }
  if (state.currentId === id) showWelcome();
  await refreshMemos();
  renderList();
  toast('メモを完全に削除しました', 'success');
}
async function emptyTrash() {
  const targets = trashedMemos();
  if (targets.length === 0) { toast('ゴミ箱は空です', 'info'); return; }
  const ok = await confirmDialog({
    title: 'ゴミ箱を空にする',
    message: `ゴミ箱の ${targets.length} 件を完全に削除します。\n画像・添付ファイルも一緒に削除され、この操作は取り消せません。`,
    okLabel: '完全に削除する',
  });
  if (!ok) return;
  for (const m of targets) {
    try { await purgeMemo(m.id); } catch (err) { console.error(err); }
  }
  if (state.currentId !== null && !state.memos.some(m => m.id === state.currentId)) showWelcome();
  await refreshMemos();
  renderList();
  toast(`${targets.length} 件を完全に削除しました`, 'success');
}
/* 起動時：保持期間を過ぎたものを自動で完全削除する */
async function purgeExpiredTrash() {
  const limit = Date.now() - TRASH_KEEP_DAYS * 86400000;
  const expired = state.memos.filter(m => m.deletedAt && m.deletedAt < limit);
  if (expired.length === 0) return;
  for (const m of expired) {
    try { await purgeMemo(m.id); } catch (err) { console.error(err); }
  }
  await refreshMemos();
}
