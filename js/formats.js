/* ============================================================
   formats.js
   カスタムフォーマット（定型メモのテンプレート）の管理と適用
   ============================================================ */
'use strict';

const fm = { editingId: null };
async function refreshFormats() {
  state.formats = (await Store.getAll('formats')).sort((a, b) => a.name.localeCompare(b.name, 'ja'));
  renderFormatSelect();
  renderFormatList();
}
function renderFormatSelect() {
  const cur = refs.formatSelect.value;
  refs.formatSelect.innerHTML = '<option value="">フォーマットを選択</option>' +
    state.formats.map(f => `<option value="${f.id}">${esc(f.name)}</option>`).join('');
  if ([...refs.formatSelect.options].some(o => o.value === cur)) refs.formatSelect.value = cur;
}
function renderFormatList() {
  refs.fmEmpty.hidden = state.formats.length > 0;
  refs.fmList.innerHTML = state.formats.map(f =>
    `<li class="fm-item ${f.id === fm.editingId ? 'active' : ''}" data-id="${f.id}">
       <i class="fa-solid fa-file-lines"></i><span>${esc(f.name)}</span></li>`).join('');
  refs.mgmtFormatCount.textContent = state.formats.length;
}
function fmLoad(id) {
  const f = state.formats.find(x => x.id === id);
  fm.editingId = f ? f.id : null;
  refs.fmName.value = f ? f.name : '';
  refs.fmTags.value = f && f.tags ? f.tags.join(', ') : '';
  refs.fmContent.value = f ? f.content : '';
  refs.fmDelete.disabled = !f;
  renderFormatList();
}
/* メモの保存（editor.js）と同じ理由で直列化する。保存ボタンを連打すると、
   1 回目が id を確定させる前に 2 回目が fm.editingId === null を見てしまい、
   同じフォーマットが二重に登録される */
const fmSave = serialized(async function fmSaveFormat() {
  const name = refs.fmName.value.trim();
  if (!name) { toast('フォーマット名を入力してください', 'error'); refs.fmName.focus(); return; }
  const now  = Date.now();
  const tags = parseTags(refs.fmTags.value);
  try {
    if (fm.editingId === null) {
      const id = await Store.add('formats', { name, tags, content: refs.fmContent.value, createdAt: now, updatedAt: now });
      fm.editingId = id;
    } else {
      const old = await Store.get('formats', fm.editingId);
      await Store.put('formats', { ...old, name, tags, content: refs.fmContent.value, updatedAt: now });
    }
  } catch (err) {
    console.error(err);
    toast('フォーマットを保存できませんでした', 'error');
    return;
  }
  await refreshFormats();
  fmLoad(fm.editingId);
  toast('フォーマットを保存しました', 'success');
});
async function fmDelete() {
  if (fm.editingId === null) return;
  const f = state.formats.find(x => x.id === fm.editingId);
  const ok = await confirmDialog({
    title: 'フォーマットの削除',
    message: `「${f?.name}」を削除します。この操作は取り消せません。`,
    okLabel: '削除する',
  });
  if (!ok) return;
  await Store.del('formats', fm.editingId);
  await refreshFormats();
  fmLoad(null);
  toast('フォーマットを削除しました', 'success');
}
function switchMgmtSection(section) {
  const isFormats = section === 'formats';
  refs.mgmtNavFormats.classList.toggle('active', isFormats);
  refs.mgmtNavTags.classList.toggle('active', !isFormats);
  refs.mgmtSectionFormats.hidden = !isFormats;
  refs.mgmtSectionTags.hidden = isFormats;
}
function openManageModal(section) {
  markModalOpened(refs.manageModal);
  refs.manageModal.hidden = false;
  switchMgmtSection(section);
  if (section === 'formats') {
    fmLoad(state.formats[0]?.id ?? null);
    refs.fmName.focus();
  } else {
    refs.tmInput.focus();
  }
}
/* フォーマット本文内の {{key}} を適用時点の値に解決する（{{cursor}} は除く） */
function resolveFormatTokens(now) {
  const d = new Date(now);
  return {
    date: fmtDate(now),
    time: fmtTime(now),
    datetime: fmtDateTime(now),
    weekday: fmtWeekday(now),
    year: String(d.getFullYear()),
    month: String(d.getMonth() + 1),
    day: String(d.getDate()),
    yesterday: fmtDate(now - 86400000),
    tomorrow: fmtDate(now + 86400000),
    title: refs.titleInput.value.trim(),
    tags: parseTags(refs.tagsInput.value).join(', '),
  };
}
function applyFormat() {
  const id = Number(refs.formatSelect.value);
  if (!id) { toast('適用するフォーマットを選択してください', 'info'); return; }
  const f = state.formats.find(x => x.id === id);
  if (!f) return;

  /* タイトルが未入力ならフォーマット名を自動入力 */
  if (!refs.titleInput.value.trim() && f.name) {
    refs.titleInput.value = f.name;
    markDirty();
  }

  /* フォーマットのタグをメモのタグへマージ（重複排除） */
  if (f.tags && f.tags.length > 0) {
    const merged = [...new Set([...parseTags(refs.tagsInput.value), ...f.tags])];
    refs.tagsInput.value = merged.join(', ');
    markDirty();
    renderTagsPreview();
  }

  const now = Date.now();
  const values = resolveFormatTokens(now);
  let text = f.content;
  for (const key in values) text = text.replaceAll(`{{${key}}}`, values[key]);
  let caret = null;
  const ci = text.indexOf('{{cursor}}');
  if (ci >= 0) { text = text.replace('{{cursor}}', ''); caret = ci; }
  insertBodyText(text, caret);
  refs.bodyInput.focus();
  toast(`フォーマット「${f.name}」を適用しました`, 'success');
}
