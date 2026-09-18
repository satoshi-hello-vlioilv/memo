/* ============================================================
   files.js
   添付ファイル：メモへの登録・一覧表示・ダウンロード・削除
   ============================================================ */
'use strict';

/* 1件あたりの上限。IndexedDB 自体に明確な上限は無いが、巨大な Blob は
   保存・読み出しともに不安定になりやすいので、入口で線を引いておく */
const ATTACH_MAX_BYTES = 50 * 1024 * 1024;

function formatBytes(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/* 拡張子からアイコンを選ぶ。判別できないものは汎用のファイルアイコン */
function fileIconFor(name, type) {
  const ext = String(name || '').split('.').pop().toLowerCase();
  const t = String(type || '');
  if (t.startsWith('image/')) return 'fa-file-image';
  if (t.startsWith('video/')) return 'fa-file-video';
  if (t.startsWith('audio/')) return 'fa-file-audio';
  if (ext === 'pdf') return 'fa-file-pdf';
  if (['doc', 'docx', 'rtf', 'odt'].includes(ext)) return 'fa-file-word';
  if (['xls', 'xlsx', 'csv', 'tsv', 'ods'].includes(ext)) return 'fa-file-excel';
  if (['ppt', 'pptx', 'odp'].includes(ext)) return 'fa-file-powerpoint';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'fa-file-zipper';
  if (['txt', 'md', 'log'].includes(ext)) return 'fa-file-lines';
  if (['js', 'ts', 'json', 'html', 'css', 'py', 'java', 'c', 'cpp', 'sh'].includes(ext)) return 'fa-file-code';
  return 'fa-file';
}

async function loadAttachments() {
  state.attachments = state.currentId === null
    ? []
    : (await Store.byIndex('files', 'memoId', state.currentId)).sort((a, b) => a.id - b.id);
  renderAttachments();
}

function renderAttachments() {
  const list = state.attachments || [];
  refs.attachCount.textContent = list.length;
  refs.attachEmpty.hidden = list.length > 0;
  refs.attachList.innerHTML = list.map(f => `
    <li class="attach-item" data-id="${f.id}">
      <i class="attach-icon fa-regular ${fileIconFor(f.name, f.type)}"></i>
      <span class="attach-main">
        <span class="attach-name" title="${esc(f.name)}">${esc(f.name)}</span>
        <span class="attach-meta mono">${formatBytes(f.size)}</span>
      </span>
      <button class="attach-act attach-dl" title="ダウンロード"><i class="fa-solid fa-download"></i></button>
      <button class="attach-act attach-del" title="削除"><i class="fa-regular fa-trash-can"></i></button>
    </li>`).join('');
}

async function addAttachmentFiles(fileList, sourceName = null) {
  const files = [...fileList];
  if (files.length === 0) return;
  const tooBig = files.filter(f => f.size > ATTACH_MAX_BYTES);
  if (tooBig.length > 0) {
    toast(`1件あたり ${formatBytes(ATTACH_MAX_BYTES)} までです（${esc(tooBig[0].name)}）`, 'error');
    return;
  }
  /* 未保存の新規メモには先にレコードを作成して紐付ける。
     保存できないと添付の紐付け先が無いので、そのまま中断する */
  if (refs.sheet.hidden) newMemo();
  if (state.currentId === null && !(await saveCurrent(true))) return;
  const now = Date.now();
  try {
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const name = f.name || `${sourceName || 'clipboard'}_${fmtDate(now).replaceAll('/', '')}_${i + 1}`;
      await Store.add('files', {
        memoId: state.currentId, name, type: f.type || '', size: f.size, blob: f, createdAt: now,
      });
    }
  } catch (err) {
    console.error(err);
    await loadAttachments();
    toast('ファイルを添付できませんでした。保存領域の空き容量を確認してください', 'error');
    return;
  }
  await loadAttachments();
  await updateAttachCount();
  toast(`ファイルを ${files.length} 件添付しました`, 'success');
}

/* 添付をブラウザのダウンロードとして書き出す。objectURL は使い終わり次第
   解放する（保持し続けると Blob がメモリに残る） */
function downloadAttachment(id) {
  const f = (state.attachments || []).find(x => x.id === id);
  if (!f) return;
  const url = URL.createObjectURL(f.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = f.name || 'download';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

async function removeAttachment(id) {
  const f = (state.attachments || []).find(x => x.id === id);
  const ok = await confirmDialog({
    title: '添付ファイルの削除',
    message: `「${f ? f.name : ''}」を削除しますか？\nこの操作は取り消せません。`,
    okLabel: '削除',
  });
  if (!ok) return;
  try {
    await Store.del('files', id);
  } catch (err) {
    console.error(err);
    toast('添付ファイルを削除できませんでした', 'error');
    return;
  }
  await loadAttachments();
  await updateAttachCount();
  toast('添付ファイルを削除しました', 'success');
}

/* メモ側にも件数を持たせ、一覧のバッジ表示に使う */
async function updateAttachCount() {
  if (state.currentId === null) return;
  const old = await Store.get('memos', state.currentId);
  if (!old) return;
  const count = (state.attachments || []).length;
  if (old.fileCount === count) return;
  try {
    await Store.put('memos', { ...old, fileCount: count });
    await refreshMemos();
    renderList();
  } catch (err) {
    console.error(err);
  }
}

/* メモを削除するとき、その添付も一緒に消す */
async function deleteAttachmentsOfMemo(memoId) {
  const rows = await Store.byIndex('files', 'memoId', memoId);
  for (const r of rows) await Store.del('files', r.id);
}
