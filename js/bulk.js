/* ============================================================
   bulk.js
   一覧の選択モードと一括操作（タグ付与・目印・ゴミ箱へ移動・
   選択分のエクスポート／ゴミ箱では復元・完全削除）
   ============================================================ */
'use strict';

function clearSelection() {
  state.selected.clear();
}
function setSelectMode(on) {
  state.selectMode = on;
  if (!on) clearSelection();
  refs.btnSelectMode.classList.toggle('active', on);
  refs.btnSelectMode.title = on ? '選択モードを終了' : '複数のメモを選んでまとめて操作';
  renderList();
}
function toggleSelectMode() { setSelectMode(!state.selectMode); }
function toggleSelected(id) {
  if (state.selected.has(id)) state.selected.delete(id);
  else state.selected.add(id);
  renderList();
}
/* 選択されたメモのうち、いま一覧に出ているものだけを対象にする */
function selectedMemos() {
  return state.memos.filter(m => state.selected.has(m.id) && state.trashView === !!m.deletedAt);
}

function renderBulkBar(list) {
  refs.bulkBar.hidden = !state.selectMode;
  if (!state.selectMode) return;
  const n = selectedMemos().length;
  refs.bulkCount.textContent = `${n} 件を選択`;
  refs.bulkAllLabel.textContent = (n > 0 && n === list.length) ? '選択を解除' : 'すべて選択';
  for (const btn of $$('[data-need-sel]', refs.bulkBar)) btn.disabled = n === 0;
  refs.bulkMarkSelect.disabled = n === 0;
  refs.bulkMarkSelect.value = '';
  /* ゴミ箱の表示中は「戻す・完全に消す」だけを出す */
  refs.bulkNormalActs.hidden = state.trashView;
  refs.bulkTrashActs.hidden = !state.trashView;
}
function toggleSelectAll(list) {
  const visible = list.map(m => m.id);
  const allSelected = visible.length > 0 && visible.every(id => state.selected.has(id));
  if (allSelected) clearSelection();
  else for (const id of visible) state.selected.add(id);
  renderList();
}

/* 選択したメモを1件ずつ書き換える共通処理。更新後は一覧を作り直す */
async function updateSelectedMemos(mutate, doneMsg) {
  const targets = selectedMemos();
  if (targets.length === 0) return;
  const now = Date.now();
  let done = 0;
  for (const m of targets) {
    try {
      const fresh = await Store.get('memos', m.id);
      if (!fresh) continue;
      const next = mutate({ ...fresh }, now);
      if (!next) continue;
      await Store.put('memos', next);
      done++;
    } catch (err) { console.error(err); }
  }
  await refreshMemos();
  /* 編集中のメモが書き換わっていたら、画面側の表示も追従させる */
  if (state.currentId !== null && targets.some(m => m.id === state.currentId)) {
    const cur = state.memos.find(m => m.id === state.currentId);
    if (cur && !state.dirty) {
      refs.tagsInput.value = (cur.tags || []).join(', ');
      state.currentMark = markById(cur.mark) ? cur.mark : null;
      renderEditorMeta();
    }
  }
  renderList();
  toast(doneMsg(done), 'success');
}

async function bulkAddTags() {
  const res = await dialog({
    title: 'まとめてタグを付ける',
    message: `選択した ${selectedMemos().length} 件にタグを追加します（カンマ区切りで複数指定できます）。`,
    fields: [{ name: 'tags', label: 'タグ', placeholder: '例）現場, 要確認' }],
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '追加する', value: 'ok', kind: 'primary' },
    ],
  });
  if (!res || res.value !== 'ok') return;
  const tags = parseTags(res.fields.tags);
  if (tags.length === 0) { toast('タグを入力してください', 'info'); return; }
  for (const t of tags) {
    if (!state.tagsMaster.includes(t)) await Store.put('tags', { name: t });
  }
  await refreshTagsMaster();
  await updateSelectedMemos(
    (m, now) => {
      const merged = [...new Set([...(m.tags || []), ...tags])];
      if (merged.length === (m.tags || []).length) return null;
      return { ...m, tags: merged, updatedAt: now };
    },
    n => `${n} 件にタグを追加しました`);
}
async function bulkSetMark(markId) {
  const mk = markById(markId);
  await updateSelectedMemos(
    (m, now) => (m.mark || null) === (markId || null) ? null : { ...m, mark: markId || null, updatedAt: now },
    n => mk ? `${n} 件に目印「${mk.label}」を付けました` : `${n} 件の目印を外しました`);
}
async function bulkTrash() {
  const targets = selectedMemos();
  if (targets.length === 0) return;
  const ok = await confirmDialog({
    title: 'まとめて削除',
    message: `選択した ${targets.length} 件をゴミ箱へ移動します。\nゴミ箱からは ${TRASH_KEEP_DAYS} 日以内であれば元に戻せます。`,
    okLabel: 'ゴミ箱へ移動',
  });
  if (!ok) return;
  const ids = targets.map(m => m.id);
  for (const id of ids) await moveMemoToTrash(id);
  if (state.currentId !== null && ids.includes(state.currentId)) showWelcome();
  clearSelection();
  renderList();
  toast(`${ids.length} 件をゴミ箱へ移動しました`, 'success', {
    label: '元に戻す',
    onClick: async () => {
      for (const id of ids) {
        const m = await Store.get('memos', id);
        if (m) await Store.put('memos', { ...m, deletedAt: null });
      }
      await refreshMemos();
      renderList();
      toast(`${ids.length} 件を元に戻しました`, 'success');
    },
  });
}
async function bulkRestore() {
  const ids = selectedMemos().map(m => m.id);
  if (ids.length === 0) return;
  for (const id of ids) {
    const m = await Store.get('memos', id);
    if (m) await Store.put('memos', { ...m, deletedAt: null });
  }
  clearSelection();
  await refreshMemos();
  renderList();
  toast(`${ids.length} 件を元に戻しました`, 'success');
}
async function bulkPurge() {
  const ids = selectedMemos().map(m => m.id);
  if (ids.length === 0) return;
  const ok = await confirmDialog({
    title: 'まとめて完全削除',
    message: `選択した ${ids.length} 件を完全に削除します。\n画像・添付ファイルも一緒に削除され、この操作は取り消せません。`,
    okLabel: '完全に削除する',
  });
  if (!ok) return;
  for (const id of ids) {
    try { await purgeMemo(id); } catch (err) { console.error(err); }
  }
  clearSelection();
  if (state.currentId !== null && ids.includes(state.currentId)) showWelcome();
  await refreshMemos();
  renderList();
  toast(`${ids.length} 件を完全に削除しました`, 'success');
}
async function bulkExport() {
  const ids = selectedMemos().map(m => m.id);
  if (ids.length === 0) return;
  await exportData({ memoIds: ids });
}
