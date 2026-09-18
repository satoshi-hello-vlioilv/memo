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
function base64ToBlob(b64, type) {
  const binary = atob(String(b64 || ''));
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: type || 'application/octet-stream' });
}
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result);
      resolve(s.slice(s.indexOf(',') + 1));
    };
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
function dataURLtoBlob(dataURL) {
  const [header, b64] = dataURL.split(',');
  const mime = (header.match(/:(.*?);/) || ['', 'image/png'])[1];
  return base64ToBlob(b64, mime);
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
/* 同じメモを二重に取り込まないための見分け方。id は端末ごとの連番で
   当てにならないため、作成日時とタイトルの組で判断する */
const memoIdentity = m => `${m.createdAt}\u0000${String(m.title || '')}`;

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
  const memoId = await Store.add('memos', {
    ...memo, imageCount: 0, fileCount: 0, deletedAt: null, plainBody: buildPlainBody(memo.body),
  });
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

/* ============================================================
   エクスポート
   ------------------------------------------------------------
   画像と添付ファイルを含めた「完全バックアップ」を書き出せるようにする。
   これまではメモの文章だけを書き出していたため、別の端末へ移ると本文に
   貼った画像が失われていた。
   ============================================================ */
const EXPORT_SCHEMA = 2;

async function collectBinaries(store, memoIds) {
  const out = [];
  for (const memoId of memoIds) {
    for (const row of await Store.byIndex(store, 'memoId', memoId)) {
      if (!row.blob) continue;
      out.push({
        id: row.id, memoId, name: row.name, type: row.type || row.blob.type || '',
        size: row.size ?? row.blob.size, createdAt: row.createdAt || Date.now(),
        data: await blobToBase64(row.blob),
      });
    }
  }
  return out;
}

async function exportData({ memoIds = null } = {}) {
  const targets = memoIds
    ? state.memos.filter(m => memoIds.includes(m.id))
    : state.memos.filter(m => !m.deletedAt);
  if (targets.length === 0) { toast('書き出せるメモがありません', 'info'); return; }
  const imgTotal  = targets.reduce((n, m) => n + (m.imageCount || 0), 0);
  const fileTotal = targets.reduce((n, m) => n + (m.fileCount || 0), 0);
  const v = await dialog({
    title: 'データの書き出し',
    message: `メモ ${targets.length} 件を書き出します（画像 ${imgTotal} 件・添付 ${fileTotal} 件）。\n` +
      '「画像・添付も含める」を選ぶと、別の端末でもそのまま復元できます（ファイルは大きくなります）。',
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: 'メモだけ（軽量）', value: 'light' },
      { label: '画像・添付も含める', value: 'full', kind: 'primary' },
    ],
  });
  if (v !== 'light' && v !== 'full') return;
  const full = v === 'full';

  const data = {
    app: 'MemoStudio',
    schema: EXPORT_SCHEMA,
    appVersion: APP_VERSION,
    exportedAt: Date.now(),
    memos: targets,
    formats: state.formats,
    tags: state.tagsMaster,
  };
  try {
    if (full) {
      if (imgTotal + fileTotal > 30) toast('書き出しています…', 'info');
      const ids = targets.map(m => m.id);
      data.images = await collectBinaries('images', ids);
      data.files  = await collectBinaries('files', ids);
    }
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `MemoStudio_${full ? 'FullBackup' : 'Backup'}_${fmtDate(Date.now()).replaceAll('/', '')}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast(`${targets.length} 件を書き出しました（${formatBytes(blob.size)}）`, 'success');
  } catch (err) {
    console.error(err);
    toast('書き出しに失敗しました。対象を減らしてお試しください', 'error');
  }
}

/* ============================================================
   インポート
   ------------------------------------------------------------
   取り込むメモには必ず新しい id を振り直す。以前はファイル内の id の
   まま put していたため、別の端末のバックアップを取り込むと、同じ id を
   持つ手元のメモが黙って上書きされていた。本文の画像参照 [img:N] も
   新しい id へ振り替える。
   ============================================================ */
const groupByMemoId = rows => {
  const map = new Map();
  for (const r of rows || []) {
    if (!map.has(r.memoId)) map.set(r.memoId, []);
    map.get(r.memoId).push(r);
  }
  return map;
};

async function importMemoStudio(data, { skipDuplicates }) {
  const known = new Set(state.memos.map(memoIdentity));
  const result = { added: 0, skipped: 0, images: 0, files: 0, formats: 0, tags: 0 };

  for (const t of (data.tags || [])) {
    if (typeof t !== 'string' || state.tagsMaster.includes(t)) continue;
    await Store.put('tags', { name: t });
    result.tags++;
  }
  /* フォーマットは名前で見分ける（同名は既にあるものを残す） */
  const formatNames = new Set(state.formats.map(f => f.name));
  for (const f of (data.formats || [])) {
    if (!f || formatNames.has(f.name)) continue;
    const { id, ...rest } = f;
    await Store.add('formats', rest);
    formatNames.add(f.name);
    result.formats++;
  }

  const imagesByMemo = groupByMemoId(data.images);
  const filesByMemo  = groupByMemoId(data.files);
  for (const src of (data.memos || [])) {
    if (!src || typeof src !== 'object') continue;
    const identity = memoIdentity(src);
    if (skipDuplicates && known.has(identity)) { result.skipped++; continue; }
    const { id: oldId, ...rest } = src;
    const now = Date.now();
    const memoId = await Store.add('memos', {
      ...rest,
      title: String(rest.title || ''),
      tags: Array.isArray(rest.tags) ? rest.tags : [],
      body: String(rest.body || ''),
      createdAt: rest.createdAt || now,
      updatedAt: rest.updatedAt || rest.createdAt || now,
      mark: markById(rest.mark) ? rest.mark : null,
      deletedAt: rest.deletedAt || null,
      imageCount: 0, fileCount: 0,
      plainBody: buildPlainBody(rest.body),
    });
    /* 画像・添付を復元し、旧 id → 新 id の対応を作る */
    const imgMap = new Map();
    let images = 0, files = 0;
    for (const img of (imagesByMemo.get(oldId) || [])) {
      try {
        const blob = base64ToBlob(img.data, img.type);
        const newId = await Store.add('images', {
          memoId, name: img.name || 'image.png', type: img.type || blob.type, blob,
          createdAt: img.createdAt || now,
        });
        imgMap.set(Number(img.id), newId);
        images++;
      } catch (err) { console.error(err); }
    }
    for (const f of (filesByMemo.get(oldId) || [])) {
      try {
        const blob = base64ToBlob(f.data, f.type);
        await Store.add('files', {
          memoId, name: f.name || 'file', type: f.type || '', size: f.size ?? blob.size, blob,
          createdAt: f.createdAt || now,
        });
        files++;
      } catch (err) { console.error(err); }
    }
    const body = remapBodyImageIds(String(rest.body || ''), imgMap);
    const saved = await Store.get('memos', memoId);
    await Store.put('memos', {
      ...saved, body, plainBody: buildPlainBody(body), imageCount: images, fileCount: files,
    });
    known.add(identity);
    result.added++;
    result.images += images;
    result.files += files;
  }
  return result;
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

  try {
    if (fmt === 'minutespro-all' || fmt === 'minutespro-session') {
      const sessions = fmt === 'minutespro-all' ? (data.sessions || []) : [data];
      const ok = await confirmDialog({
        title: 'データのインポート',
        message: `Minutes Memo Pro のデータ（${sessions.length} 件の会議）を変換して取り込みます。\n` +
          '画像も含めて復元され、いまのデータには追加されます（上書きはしません）。',
        okLabel: 'インポート',
        kind: 'primary',
      });
      if (!ok) { refs.fileImport.value = ''; return; }
      const flagMasters = fmt === 'minutespro-all' ? (data.flagMasters || []) : [];
      for (const session of sessions) await importMppSession(session, flagMasters);
      await refreshTagsMaster();
      await refreshMemos();
      renderList();
      toast(`Minutes Memo Pro から ${sessions.length} 件の会議を取り込みました`, 'success');
    } else {
      const memos = (data.memos || []).length;
      const hasBinary = Array.isArray(data.images) || Array.isArray(data.files);
      const imgs = (data.images || []).length;
      const files = (data.files || []).length;
      const v = await dialog({
        title: 'データのインポート',
        message: `メモ ${memos} 件を取り込みます` +
          (hasBinary ? `（画像 ${imgs} 件・添付 ${files} 件を含みます）` : '（このファイルに画像は含まれていません）') + '。\n' +
          'いまあるメモは書き換えません。同じメモ（作成日時とタイトルが一致）が既にある場合の扱いを選んでください。',
        buttons: [
          { label: 'キャンセル', value: 'cancel' },
          { label: 'すべて追加', value: 'all' },
          { label: '重複はスキップ', value: 'skip', kind: 'primary' },
        ],
      });
      if (v !== 'all' && v !== 'skip') { refs.fileImport.value = ''; return; }
      const r = await importMemoStudio(data, { skipDuplicates: v === 'skip' });
      await refreshTagsMaster();
      await refreshFormats();
      await refreshMemos();
      renderList();
      const detail = [
        `メモ ${r.added} 件`,
        r.images ? `画像 ${r.images} 件` : '',
        r.files ? `添付 ${r.files} 件` : '',
        r.formats ? `フォーマット ${r.formats} 件` : '',
        r.skipped ? `重複 ${r.skipped} 件をスキップ` : '',
      ].filter(Boolean).join('・');
      toast(`取り込みました（${detail}）`, 'success');
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
  /* 保存形式のままでは [b] などのマーカーが混ざるため、画面で見えている
     形（箇条書きは「・」、チェックは □/☑）に直してから渡す */
  const body = bodyToDisplayText(serializeBody());
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
  /* 画像でも JSON でもないものは添付ファイルとして受け取る */
  addAttachmentFiles(files);
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

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = { detectImportFormat, convertMppSession, memoIdentity, groupByMemoId };
}
