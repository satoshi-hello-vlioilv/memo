/* ============================================================
   editor.js
   メモの編集・保存・削除と、編集画面まわりの表示状態
   ============================================================ */
'use strict';

/* ============================================================
   メモ：編集・保存・削除
   ============================================================ */
function collectFields() {
  return {
    title: refs.titleInput.value.trim(),
    tags : parseTags(refs.tagsInput.value),
    body : serializeBody(),
    mark : state.currentMark,
  };
}
/* 編集中メモの目印ピッカー。同じ目印をもう一度押すと外れる（トグル） */
function renderMarkPicker() {
  const cur = state.currentMark;
  refs.markPicker.innerHTML =
    `<span class="mark-picker-label"><i class="fa-regular fa-note-sticky"></i> 目印</span>` +
    MEMO_MARKS.map(mk =>
      `<button class="mark-btn ${cur === mk.id ? 'active' : ''}" data-mark="${mk.id}"
         title="${esc(mk.label)}${cur === mk.id ? '（クリックで外す）' : 'の目印を付ける'}">
         <i class="fa-solid ${mk.icon} mk-${mk.id}"></i></button>`).join('') +
    (cur ? `<button class="mark-clear" title="目印を外す"><i class="fa-solid fa-xmark"></i></button>` : '');
}
function setCurrentMark(markId) {
  const next = state.currentMark === markId ? null : markId;
  if (next === state.currentMark) return;
  state.currentMark = next;
  renderMarkPicker();
  markDirty();
  const mk = markById(next);
  toast(mk ? `目印「${mk.label}」を付けました（保存で確定）` : '目印を外しました（保存で確定）', 'info');
}
function showSheet() {
  refs.welcome.hidden = true;
  refs.sheet.hidden = false;
}
function showWelcome() {
  refs.sheet.hidden = true;
  refs.welcome.hidden = false;
  state.currentId = null;
  state.currentMark = null;
  state.dirty = false;
  loadImages();
}
function markDirty() {
  if (!state.dirty) { state.dirty = true; renderSaveState(); }
}
function renderSaveState() {
  const el = refs.saveState;
  if (state.dirty) {
    el.className = 'save-state dirty';
    el.innerHTML = '<i class="fa-solid fa-circle"></i>未保存の変更があります';
  } else if (state.savedAt) {
    el.className = 'save-state saved';
    el.innerHTML = `<i class="fa-solid fa-circle-check"></i>保存済み ${fmtTime(state.savedAt)}`;
  } else {
    el.className = 'save-state fresh';
    el.innerHTML = '<i class="fa-regular fa-circle"></i>未保存（新規）';
  }
}
function renderStamps() {
  const m = state.memos.find(x => x.id === state.currentId);
  refs.stampCreated.textContent = m ? fmtDateTime(m.createdAt) : '—';
  refs.stampUpdated.textContent = m ? fmtDateTime(m.updatedAt) : '—';
}
function renderCharCount() {
  refs.charCount.textContent = bodyPlainText().length;
}
function renderTagsPreview() {
  refs.tagsPreview.innerHTML = parseTags(refs.tagsInput.value).map(t => tagChip(t)).join('');
}
/* 編集画面のヘッダまわり（日時・保存状態・タグ・目印）をまとめて描き直す */
function renderEditorMeta() {
  renderStamps(); renderSaveState(); renderTagsPreview(); renderMarkPicker();
}
/* 本文を書き換えたあとの共通後処理。以前は呼び出し側ごとにこの並びを手で
   書いていたため、例えばフォーマット適用では改行マークが更新されないなど、
   処理の抜けが場所によってまちまちだった。ここに集約して常に同じ状態へ
   揃える。いずれも現在の DOM を読み直して表示を作り直すだけなので、
   余分に呼んでも副作用は無い */
function afterBodyEdit() {
  markDirty();
  renderCharCount();
  rebuildLineMarksDebounced();
  updateCursorHighlight();
  updateFormatToolbarState();
}

async function openMemo(id) {
  const m = await Store.get('memos', id);
  if (!m) { toast('メモが見つかりません', 'error'); return; }
  state.currentId = id;
  state.dirty = false;
  state.savedAt = m.updatedAt;
  state.currentMark = markById(m.mark) ? m.mark : null;
  refs.titleInput.value = m.title || '';
  refs.tagsInput.value  = (m.tags || []).join(', ');
  showSheet();
  renderEditorMeta(); renderList();
  await loadImages();
  deserializeBody(m.body || '');
  renderCharCount();
  savePref('lastMemoId', id);
}
function newMemo() {
  state.currentId = null;
  state.dirty = false;
  state.savedAt = null;
  state.currentMark = null;
  refs.titleInput.value = '';
  refs.tagsInput.value = '';
  refs.bodyInput.innerHTML = '';
  rebuildLineMarks();
  showSheet();
  renderEditorMeta(); renderCharCount(); renderList();
  loadImages();
  refs.titleInput.focus();
}
/* 保存できたら true、失敗したら false を返す（例外は投げない）。
   呼び出し側は戻り値を見て「保存できていないのに画面を切り替える」ことを
   避けられる。
   serialized() で直列化しているのは、新規メモの保存が終わる前に 2 回目の
   保存が始まると、どちらも state.currentId === null を見て Store.add し、
   同じメモが二重に作られてしまうため（保存ボタンのダブルクリックや
   Ctrl+S のキーリピートで実際に起きる）。2 回目は 1 回目の完了を待つので、
   その時点では id が確定していて更新（put）になる。 */
const saveCurrent = serialized(async function saveCurrentMemo(silent = false) {
  const now = Date.now();
  const f = collectFields();
  try {
    if (state.currentId === null) {
      const id = await Store.add('memos', { ...f, createdAt: now, updatedAt: now, imageCount: 0 });
      state.currentId = id;
      savePref('lastMemoId', id);
    } else {
      const old = await Store.get('memos', state.currentId);
      await Store.put('memos', { ...old, ...f, updatedAt: now });
    }
  } catch (err) {
    console.error(err);
    toast('メモを保存できませんでした。保存領域の空き容量やブラウザの設定を確認してください', 'error');
    return false;
  }
  state.dirty = false;
  state.savedAt = now;
  await refreshMemos();
  renderList(); renderStamps(); renderSaveState();
  if (!silent) toast('メモを保存しました', 'success');
  return true;
});
async function deleteCurrent() {
  if (state.currentId === null) {
    const ok = await confirmDialog({
      title: 'メモの破棄',
      message: 'このメモはまだ保存されていません。入力内容を破棄しますか？',
      okLabel: '破棄する',
    });
    if (ok) showWelcome();
    return;
  }
  const m = state.memos.find(x => x.id === state.currentId);
  const imgNote = (m?.imageCount || 0) > 0 ? `\n登録済みの画像 ${m.imageCount} 件も同時に削除されます。` : '';
  const ok = await confirmDialog({
    title: 'メモの削除',
    message: `「${m?.title || '無題のメモ'}」を削除します。この操作は取り消せません。${imgNote}`,
    okLabel: '削除する',
  });
  if (!ok) return;
  const imgs = await Store.byIndex('images', 'memoId', state.currentId);
  for (const img of imgs) await Store.del('images', img.id);
  await Store.del('memos', state.currentId);
  await refreshMemos();
  showWelcome();
  renderList();
  toast('メモを削除しました', 'success');
}
/* 未保存変更ガード（エラー防止） */
async function guardDirty() {
  if (!state.dirty) return true;
  const v = await dialog({
    title: '未保存の変更',
    message: '編集中のメモに未保存の変更があります。どうしますか？',
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '破棄して続行', value: 'discard', kind: 'danger' },
      { label: '保存して続行', value: 'save', kind: 'primary' },
    ],
  });
  /* 保存に失敗したときは true を返さない。編集内容を残したまま
     画面を切り替えてしまうと、そのまま消えてしまうため */
  if (v === 'save')    return await saveCurrent(true);
  if (v === 'discard') { state.dirty = false; return true; }
  return false;
}

/* ============================================================
   画像パネルの開閉
   ============================================================ */
function applyPanelState() {
  refs.app.classList.toggle('panel-closed', !state.panelOpen);
  refs.btnPanelOpen.hidden = state.panelOpen;
}
function togglePanel(open) {
  state.panelOpen = open;
  applyPanelState();
  savePref('panelOpen', open);
}
function applySidebarState() {
  refs.app.classList.toggle('sidebar-closed', !state.sidebarOpen);
  refs.btnToggleSidebar.title = state.sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く';
  refs.btnSidebarOpen.hidden = state.sidebarOpen;
}
function applyGroupByDateState() {
  refs.btnGroupByDate.classList.toggle('active', state.groupByDate);
  refs.btnGroupByDate.title = state.groupByDate ? 'グループ化を解除' : '日付でグループ化';
  refs.groupFieldSelect.hidden = !state.groupByDate;
  refs.groupFieldSelect.value = state.groupDateField;
}
function applyImageFilterState() {
  refs.btnImageFilter.classList.toggle('active', state.imageOnly);
  refs.btnImageFilter.title = state.imageOnly ? '画像ありのメモのみ表示中（クリックで解除）' : '画像ありのメモのみ表示';
}
function applySortDirState() {
  const asc = state.sortDir === 'asc';
  refs.btnSortOrder.innerHTML = asc
    ? '<i class="fa-solid fa-arrow-up-wide-short"></i> 昇順'
    : '<i class="fa-solid fa-arrow-down-wide-short"></i> 降順';
  refs.btnSortOrder.title = asc
    ? '古い順に表示中（クリックで新しい順に切替）'
    : '新しい順に表示中（クリックで古い順に切替）';
}
function applySearchScopeState() {
  $$('.scope-chip', refs.searchScope).forEach(btn => {
    btn.classList.toggle('active', !!state.searchScope[btn.dataset.scope]);
  });
}
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  applySidebarState();
  savePref('sidebarOpen', state.sidebarOpen);
}
