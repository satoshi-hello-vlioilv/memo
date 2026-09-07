/* ============================================================
   data.js
   データの入出力：エクスポート／インポート（Minutes Memo Pro 形式の
   変換を含む）、ドラッグ&ドロップ
   ============================================================ */
'use strict';

/* ============================================================
   インポート・エクスポート・コピー
   （Minutes Memo Pro 形式からの変換を含む）
   ============================================================ */
function dataURLtoBlob(dataURL) {
  const [header, b64] = dataURL.split(',');
  const mime = (header.match(/:(.*?);/) || ['', 'image/png'])[1];
  const binary = atob(b64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function detectImportFormat(data) {
  if (!data || typeof data !== 'object') return 'unknown';
  if (Array.isArray(data.sessions)) return 'minutespro-all';
  if (data.id && data.date !== undefined && Array.isArray(data.memos)) {
    const noTags = !data.tags;
    const objectTags = Array.isArray(data.tags) && (data.tags.length === 0 || typeof data.tags[0] === 'object');
    if (noTags || objectTags) return 'minutespro-session';
  }
  if (Array.isArray(data.memos) || Array.isArray(data.formats) || Array.isArray(data.tags)) return 'memostudio';
  return 'unknown';
}

function convertMppSession(session, flagMasters) {
  const tagNames = (session.tags || []).map(t => t.name);
  const title = tagNames.length > 0 ? tagNames.join(' / ') : (session.date || '名称未設定');
  const lines = [];
  const imgItems = [];
  const sorted = [...(session.memos || [])].reverse();
  sorted.forEach(memo => {
    const flag = memo.flagId ? (flagMasters || []).find(f => f.id === memo.flagId) : null;
    const flagStr = flag ? `【${flag.name}】 ` : '';
    const memoTitle = memo.title && memo.title !== 'タイトルなし' ? memo.title : '';
    lines.push(`[${memo.datetime || ''}] ${flagStr}${memoTitle}`.trimEnd());
    (memo.items || []).forEach(it => {
      if (it.type === 'text' && it.value) lines.push(it.value);
      else if (it.type === 'image' && it.value) {
        lines.push(`[画像 ${imgItems.length + 1}]`);
        imgItems.push({ dataURL: it.value, name: `img_${imgItems.length + 1}.png` });
      }
    });
    lines.push('');
  });
  const dateTs = session.date ? new Date(session.date + 'T00:00:00').getTime() : Date.now();
  return {
    title,
    tags: tagNames,
    body: lines.join('\n').trim(),
    createdAt: dateTs,
    updatedAt: dateTs,
    imageCount: imgItems.length,
    _imgs: imgItems,
  };
}

async function importMppSession(session, flagMasters) {
  const memo = convertMppSession(session, flagMasters);
  const imgs = memo._imgs;
  delete memo._imgs;
  const memoId = await Store.add('memos', { ...memo, imageCount: 0 });
  let saved = 0;
  for (const img of imgs) {
    try {
      const blob = dataURLtoBlob(img.dataURL);
      await Store.add('images', { memoId, name: img.name, type: blob.type, blob, createdAt: Date.now() });
      saved++;
    } catch {}
  }
  if (saved > 0) {
    const m = await Store.get('memos', memoId);
    await Store.put('memos', { ...m, imageCount: saved });
  }
  for (const tag of memo.tags) {
    if (!state.tagsMaster.includes(tag)) await Store.put('tags', { name: tag });
  }
}

function exportData() {
  const data = {
    memos: state.memos,
    formats: state.formats,
    tags: state.tagsMaster
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `MemoStudio_Backup_${fmtDate(Date.now()).replaceAll('/','')}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('データをエクスポートしました', 'success');
}

async function importData(file) {
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    toast('ファイルの読み込みに失敗しました', 'error');
    refs.fileImport.value = '';
    return;
  }

  const fmt = detectImportFormat(data);
  if (fmt === 'unknown') {
    toast('対応していないファイル形式です（Memo Studio または Minutes Memo Pro のデータが必要です）', 'error');
    refs.fileImport.value = '';
    return;
  }

  const isMpp = fmt !== 'memostudio';
  const sessionCount = fmt === 'minutespro-all' ? (data.sessions || []).length : 1;
  const msg = isMpp
    ? `Minutes Memo Pro のデータ（${sessionCount} 件の会議）を変換してインポートします。\n画像も含めて復元されます。現在のデータに追加されます。`
    : '現在のデータに統合（上書きおよび追加）されます。\nよろしいですか？（画像は復元されません）';

  const ok = await confirmDialog({
    title: 'データのインポート',
    message: msg,
    okLabel: 'インポート',
    kind: isMpp ? 'primary' : 'danger',
  });
  if (!ok) { refs.fileImport.value = ''; return; }

  try {
    if (fmt === 'minutespro-all') {
      const flagMasters = data.flagMasters || [];
      for (const session of (data.sessions || [])) await importMppSession(session, flagMasters);
      await refreshTagsMaster();
      await refreshMemos();
      renderList();
      toast(`Minutes Memo Pro から ${sessionCount} 件の会議をインポートしました`, 'success');
    } else if (fmt === 'minutespro-session') {
      await importMppSession(data, []);
      await refreshTagsMaster();
      await refreshMemos();
      renderList();
      toast('Minutes Memo Pro の会議をインポートしました', 'success');
    } else {
      if (data.tags) for (const t of data.tags) await Store.put('tags', { name: t });
      if (data.formats) for (const f of data.formats) await Store.put('formats', f);
      if (data.memos) for (const m of data.memos) await Store.put('memos', m);
      await refreshTagsMaster();
      await refreshFormats();
      await refreshMemos();
      renderList();
      toast('データをインポートしました', 'success');
    }
  } catch (err) {
    console.error(err);
    toast('インポート中にエラーが発生しました', 'error');
  }
  refs.fileImport.value = '';
}

async function copyMemoText() {
  const title = refs.titleInput.value.trim() || '無題のメモ';
  const tags = refs.tagsInput.value.trim() ? `[${refs.tagsInput.value}]` : '';
  const body = serializeBody();
  const text = `■ ${title} ${tags}\n\n${body}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('テキストをコピーしました', 'success');
  } catch {
    toast('コピーに失敗しました', 'error');
  }
}

/* ============================================================
   ドラッグ&ドロップ
   ============================================================ */
const isJsonFile = f => /\.json$/i.test(f.name || '') || f.type === 'application/json' || f.type === 'text/json';

/* ドラッグ中のファイル種別を推定し、オーバーレイの案内文を切り替える */
function updateDropOverlay(e) {
  const items = e.dataTransfer ? e.dataTransfer.items : null;
  let hasJson = false, hasImage = false, hasOther = false;
  if (items) {
    for (const it of items) {
      if (it.kind !== 'file') continue;
      const t = (it.type || '').toLowerCase();
      if (t === 'application/json' || t === 'text/json') hasJson = true;
      else if (t.startsWith('image/')) hasImage = true;
      else hasOther = true;   /* 拡張子 .json でも type が空になる環境があるため汎用扱い */
    }
  }
  let main, sub;
  if (hasJson && !hasImage) {
    main = 'JSON データを取り込む';
    sub  = 'Memo Studio / Minutes Memo Pro のデータに対応';
  } else if (hasImage && !hasJson && !hasOther) {
    main = '画像をメモに添付';
    sub  = 'ドロップして画像を登録します';
  } else {
    main = 'ファイルをドロップして取り込み';
    sub  = '画像はメモに添付／JSON はデータを取り込み';
  }
  refs.dropMainText.textContent = main;
  refs.dropSubText.textContent = sub;
}

/* ドロップされたファイルを種別で振り分ける（JSON=データ取込 / 画像=添付） */
function handleDroppedFiles(fileList) {
  const files = [...fileList];
  if (files.length === 0) return;
  const jsonFiles  = files.filter(isJsonFile);
  const imageFiles = files.filter(f => f.type.startsWith('image/'));

  if (jsonFiles.length > 0) {
    if (jsonFiles.length > 1 || imageFiles.length > 0) {
      toast('JSON データを取り込みます（他のファイルは無視されます）', 'info');
    }
    importData(jsonFiles[0]);
    return;
  }
  if (imageFiles.length > 0) {
    addImageFiles(imageFiles);
    return;
  }
  toast('対応していないファイルです（画像 または JSON データをドロップしてください）', 'error');
}

function setupDragDrop() {
  let depth = 0;
  const hasFiles = e => e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files');
  window.addEventListener('dragenter', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth++;
    updateDropOverlay(e);
    refs.dropOverlay.hidden = false;
  });
  window.addEventListener('dragover', e => { if (hasFiles(e)) e.preventDefault(); });
  window.addEventListener('dragleave', e => {
    if (!hasFiles(e)) return;
    depth = Math.max(0, depth - 1);
    if (depth === 0) refs.dropOverlay.hidden = true;
  });
  window.addEventListener('drop', e => {
    if (!hasFiles(e)) return;
    e.preventDefault();
    depth = 0;
    refs.dropOverlay.hidden = true;
    handleDroppedFiles(e.dataTransfer.files);
  });
}
