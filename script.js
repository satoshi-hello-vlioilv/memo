(() => {
'use strict';

/* ============================================================
   ユーティリティ
   ============================================================ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const fmtDate = ts => { const d = new Date(ts); return `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`; };
const fmtTime = ts => { const d = new Date(ts); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDateTime = ts => `${fmtDate(ts)} ${fmtTime(ts)}`;
const isToday = ts => fmtDate(ts) === fmtDate(Date.now());
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const tagClass = name => {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return 'c' + (h % 6);
};
const parseTags = raw => {
  const seen = new Set();
  return String(raw).split(/[,、\s]+/).map(t => t.trim()).filter(t => {
    if (!t || seen.has(t)) return false;
    seen.add(t); return true;
  });
};
/* 任意の input / textarea のキャレット位置へ文字列を挿入 */
function insertAtCaret(el, text, caretOffset = null) {
  const start = el.selectionStart ?? el.value.length;
  const end   = el.selectionEnd ?? start;
  el.setRangeText(text, start, end, 'end');
  if (caretOffset !== null) {
    const p = start + caretOffset;
    el.setSelectionRange(p, p);
  }
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/* ============================================================
   IndexedDB ラッパー
   ============================================================ */
const DB_NAME = 'memoStudioDB';
const DB_VER  = 2;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const rq = indexedDB.open(DB_NAME, DB_VER);
    rq.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('memos')) {
        const s = d.createObjectStore('memos', { keyPath: 'id', autoIncrement: true });
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('images')) {
        const s = d.createObjectStore('images', { keyPath: 'id', autoIncrement: true });
        s.createIndex('memoId', 'memoId');
      }
      if (!d.objectStoreNames.contains('formats')) {
        d.createObjectStore('formats', { keyPath: 'id', autoIncrement: true });
      }
      if (!d.objectStoreNames.contains('prefs')) {
        d.createObjectStore('prefs', { keyPath: 'key' });
      }
      if (!d.objectStoreNames.contains('tags')) {
        d.createObjectStore('tags', { keyPath: 'name' });
      }
    };
    rq.onsuccess = () => resolve(rq.result);
    rq.onerror   = () => reject(rq.error);
    rq.onblocked = () => reject(new Error('blocked'));
  });
}
const req = r => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror   = () => reject(r.error);
});
const Store = {
  getAll : name        => req(db.transaction(name).objectStore(name).getAll()),
  get    : (name, key) => req(db.transaction(name).objectStore(name).get(key)),
  add    : (name, val) => req(db.transaction(name, 'readwrite').objectStore(name).add(val)),
  put    : (name, val) => req(db.transaction(name, 'readwrite').objectStore(name).put(val)),
  del    : (name, key) => req(db.transaction(name, 'readwrite').objectStore(name).delete(key)),
  byIndex: (name, idx, key) => req(db.transaction(name).objectStore(name).index(idx).getAll(key)),
};

/* ============================================================
   状態
   ============================================================ */
const state = {
  memos: [], formats: [], images: [], tagsMaster: [],
  currentId: null,
  dirty: false, savedAt: null,
  query: '', tagFilter: null,
  thumbSize: 160, panelOpen: true, sidebarOpen: true,
  groupByDate: false, collapsedGroups: new Set(),
  previewMode: false,
};

/* ============================================================
   要素参照
   ============================================================ */
const refs = {};
function collectRefs() {
  const ids = [
    'app','btnToggleSidebar','btnSidebarClose','btnSidebarOpen','fileImport','btnImport','btnExport',
    'searchInput','searchClear','tagBar','listCount','btnGroupByDate','memoList','listEmpty','listEmptyMsg',
    'welcome','sheet','btnWelcomeNew','btnWelcomeFmt',
    'titleInput','stampCreated','stampUpdated','tagsInput','tagsSuggest','tagsPreview',
    'btnTags','tagModal','tmClose','tmInput','tmAdd','tmList',
    'formatSelect','btnApplyFormat','btnMic','recIndicator','recTime',
    'btnTabEdit','btnTabPreview','interimBar','interimText','bodyInput','bodyPreview','charCount','saveState',
    'fmTags',
    'btnCopyText','btnDelete','btnSave','btnNew','btnFormats',
    'imgPanel','imgCount','btnPanelToggle','btnPanelOpen','btnAddImage','fileInput',
    'thumbSize','thumbGrid','imgEmpty','dropOverlay','dropMainText','dropSubText','editorPane',
    'lightbox','lbName','lbIndex','lbZoom','lbZoomIn','lbZoomOut','lbFit','lbActual',
    'lbClose','lbStage','lbImg','lbPrev','lbNext',
    'formatModal','fmClose','fmNew','fmList','fmEmpty','fmName','fmContent','fmDelete','fmSave',
    'dialogRoot','dlgTitle','dlgMsg','dlgFoot','toastWrap','fatal','fatalMsg',
  ];
  for (const id of ids) refs[id] = document.getElementById(id);
}

/* ============================================================
   トースト・ダイアログ（フィードバック／エラー防止）
   ============================================================ */
function toast(msg, type = 'info') {
  const icons = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="fa-solid ${icons[type]}"></i><span>${esc(msg)}</span>`;
  refs.toastWrap.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 260);
  }, 2800);
}

let dialogResolve = null;
function dialog({ title, message, buttons }) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    refs.dlgTitle.textContent = title;
    refs.dlgMsg.textContent = message;
    refs.dlgFoot.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : 'btn-quiet'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => closeDialog(b.value));
      refs.dlgFoot.appendChild(btn);
    }
    refs.dialogRoot.hidden = false;
    refs.dlgFoot.querySelector('.btn-primary, .btn-danger, .btn')?.focus();
  });
}
function closeDialog(value) {
  refs.dialogRoot.hidden = true;
  if (dialogResolve) { dialogResolve(value); dialogResolve = null; }
}

/* ============================================================
   設定の永続化（IndexedDB prefs ストア）
   ============================================================ */
async function loadPrefs() {
  try {
    const rows = await Store.getAll('prefs');
    const map = Object.fromEntries(rows.map(r => [r.key, r.value]));
    if (typeof map.thumbSize === 'number') state.thumbSize = map.thumbSize;
    if (typeof map.panelOpen === 'boolean') state.panelOpen = map.panelOpen;
    if (typeof map.sidebarOpen === 'boolean') state.sidebarOpen = map.sidebarOpen;
    if (typeof map.groupByDate === 'boolean') state.groupByDate = map.groupByDate;
    return map;
  } catch { return {}; }
}
function savePref(key, value) {
  Store.put('prefs', { key, value }).catch(() => {});
}
const savePrefDebounced = debounce(savePref, 350);

/* ============================================================
   タグマスタ管理・サジェスト
   ============================================================ */
async function refreshTagsMaster() {
  const rows = await Store.getAll('tags');
  state.tagsMaster = rows.map(r => r.name).sort((a, b) => a.localeCompare(b, 'ja'));
  renderTagMasterList();
}
function renderTagMasterList() {
  refs.tmList.innerHTML = state.tagsMaster.map(t => `
    <li class="tm-list-item">
      <span>${esc(t)}</span>
      <button class="icon-btn btn-danger-ghost tm-del" data-tag="${esc(t)}" title="削除"><i class="fa-solid fa-trash-can"></i></button>
    </li>
  `).join('');
}
function getTagSearchWord() {
  const parts = refs.tagsInput.value.split(/[,、]\s*/);
  return parts[parts.length - 1];
}
function updateTagSuggest() {
  const word = getTagSearchWord().trim().toLowerCase();
  if (!word) { refs.tagsSuggest.hidden = true; return; }
  const matches = state.tagsMaster.filter(t => t.toLowerCase().includes(word));
  if (matches.length === 0) { refs.tagsSuggest.hidden = true; return; }
  refs.tagsSuggest.innerHTML = matches.map(t => `<div class="sg-item" data-tag="${esc(t)}">${esc(t)}</div>`).join('');
  refs.tagsSuggest.hidden = true;
  requestAnimationFrame(() => { refs.tagsSuggest.hidden = false; });
}

/* ============================================================
   メモ：一覧・検索・タグフィルタ
   ============================================================ */
async function refreshMemos() {
  state.memos = await Store.getAll('memos');
}
function filteredMemos() {
  const q = state.query.trim().toLowerCase();
  return state.memos
    .filter(m => {
      if (state.tagFilter && !(m.tags || []).includes(state.tagFilter)) return false;
      if (!q) return true;
      const inTitle = (m.title || '').toLowerCase().includes(q);
      const inTags  = (m.tags || []).some(t => t.toLowerCase().includes(q));
      return inTitle || inTags;
    })
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
function renderMemoItem(m) {
  const active  = m.id === state.currentId ? ' active' : '';
  const title   = esc(m.title) || '無題のメモ';
  const date    = isToday(m.updatedAt) ? fmtTime(m.updatedAt) : fmtDate(m.updatedAt);
  const snippet = esc((m.body || '').replace(/\s+/g, ' ').slice(0, 64));
  const tags    = (m.tags || []).slice(0, 3).map(t =>
    `<span class="chip chip-s ${tagClass(t)}">${esc(t)}</span>`).join('');
  const more    = (m.tags || []).length > 3 ? `<span class="chip chip-s c4">+${m.tags.length - 3}</span>` : '';
  const imgs    = m.imageCount > 0
    ? `<span class="mi-imgs"><i class="fa-regular fa-image"></i>${m.imageCount}</span>` : '';
  return `<li class="memo-item${active}" data-id="${m.id}">
    <div class="mi-top"><span class="mi-title">${title}</span><span class="mi-date mono">${date}</span></div>
    ${snippet ? `<div class="mi-snippet">${snippet}</div>` : ''}
    <div class="mi-foot"><div class="mi-tags">${tags}${more}</div>${imgs}</div>
  </li>`;
}
function getDateGroupLabel(dateStr) {
  const today     = fmtDate(Date.now());
  const yesterday = fmtDate(Date.now() - 86400000);
  if (dateStr === today)     return '今日';
  if (dateStr === yesterday) return '昨日';
  const [y, mo, d] = dateStr.split('/').map(Number);
  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
  return `${y}年${mo}月${d}日（${dayNames[new Date(y, mo - 1, d).getDay()]}）`;
}
function renderList() {
  const list = filteredMemos();
  refs.listCount.textContent = `${list.length} 件`;

  let html;
  if (!state.groupByDate) {
    html = list.map(m => renderMemoItem(m)).join('');
  } else {
    const keys = [];
    const groupMap = new Map();
    for (const m of list) {
      const key = fmtDate(m.updatedAt);
      if (!groupMap.has(key)) { groupMap.set(key, []); keys.push(key); }
      groupMap.get(key).push(m);
    }
    html = keys.map(key => {
      const memos     = groupMap.get(key);
      const collapsed = state.collapsedGroups.has(key);
      const chevron   = collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
      const items     = collapsed ? '' : memos.map(m => renderMemoItem(m)).join('');
      return `<li class="date-group-header${collapsed ? ' collapsed' : ''}" data-date="${esc(key)}">` +
        `<i class="fa-solid ${chevron}"></i>` +
        `<span class="date-group-label">${getDateGroupLabel(key)}</span>` +
        `<span class="date-group-count">${memos.length}</span></li>${items}`;
    }).join('');
  }
  refs.memoList.innerHTML = html;

  const empty = list.length === 0;
  refs.listEmpty.hidden = !empty;
  refs.listEmptyMsg.innerHTML = (state.query || state.tagFilter)
    ? '条件に一致するメモがありません。<br>検索語やタグを見直してください。'
    : 'メモはまだありません。<br>「新規メモ」から作成できます。';
  renderTagBar();
}
function renderTagBar() {
  const counts = new Map();
  for (const m of state.memos) for (const t of (m.tags || [])) {
    counts.set(t, (counts.get(t) || 0) + 1);
  }
  const tags = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  refs.tagBar.innerHTML = tags.map(([t, n]) =>
    `<button class="chip ${state.tagFilter === t ? 'active' : ''}" data-tag="${esc(t)}">
       ${esc(t)}<span class="cnt">${n}</span></button>`).join('');
}

/* ============================================================
   メモ：編集・保存・削除
   ============================================================ */
function collectFields() {
  return {
    title: refs.titleInput.value.trim(),
    tags : parseTags(refs.tagsInput.value),
    body : refs.bodyInput.value,
  };
}
function showSheet() {
  refs.welcome.hidden = true;
  refs.sheet.hidden = false;
}
function showWelcome() {
  refs.sheet.hidden = true;
  refs.welcome.hidden = false;
  state.currentId = null;
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
  refs.charCount.textContent = refs.bodyInput.value.length;
}
function renderTagsPreview() {
  refs.tagsPreview.innerHTML = parseTags(refs.tagsInput.value)
    .map(t => `<span class="chip chip-s ${tagClass(t)}">${esc(t)}</span>`).join('');
}

async function openMemo(id) {
  const m = await Store.get('memos', id);
  if (!m) { toast('メモが見つかりません', 'error'); return; }
  state.currentId = id;
  state.dirty = false;
  state.savedAt = m.updatedAt;
  refs.titleInput.value = m.title || '';
  refs.tagsInput.value  = (m.tags || []).join(', ');
  refs.bodyInput.value  = m.body || '';
  if (state.previewMode) togglePreviewMode(false);
  showSheet();
  renderStamps(); renderSaveState(); renderCharCount(); renderTagsPreview(); renderList();
  await loadImages();
  savePref('lastMemoId', id);
}
function newMemo() {
  state.currentId = null;
  state.dirty = false;
  state.savedAt = null;
  refs.titleInput.value = '';
  refs.tagsInput.value = '';
  refs.bodyInput.value = '';
  if (state.previewMode) togglePreviewMode(false);
  showSheet();
  renderStamps(); renderSaveState(); renderCharCount(); renderTagsPreview(); renderList();
  loadImages();
  refs.titleInput.focus();
}
async function saveCurrent(silent = false) {
  const now = Date.now();
  const f = collectFields();
  if (state.currentId === null) {
    const id = await Store.add('memos', { ...f, createdAt: now, updatedAt: now, imageCount: 0 });
    state.currentId = id;
    savePref('lastMemoId', id);
  } else {
    const old = await Store.get('memos', state.currentId);
    await Store.put('memos', { ...old, ...f, updatedAt: now });
  }
  state.dirty = false;
  state.savedAt = now;
  await refreshMemos();
  renderList(); renderStamps(); renderSaveState();
  if (!silent) toast('メモを保存しました', 'success');
}
async function deleteCurrent() {
  if (state.currentId === null) {
    const v = await dialog({
      title: 'メモの破棄',
      message: 'このメモはまだ保存されていません。入力内容を破棄しますか？',
      buttons: [
        { label: 'キャンセル', value: 'cancel' },
        { label: '破棄する', value: 'ok', kind: 'danger' },
      ],
    });
    if (v === 'ok') showWelcome();
    return;
  }
  const m = state.memos.find(x => x.id === state.currentId);
  const imgNote = (m?.imageCount || 0) > 0 ? `\n登録済みの画像 ${m.imageCount} 件も同時に削除されます。` : '';
  const v = await dialog({
    title: 'メモの削除',
    message: `「${m?.title || '無題のメモ'}」を削除します。この操作は取り消せません。${imgNote}`,
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '削除する', value: 'ok', kind: 'danger' },
    ],
  });
  if (v !== 'ok') return;
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
  if (v === 'save')    { await saveCurrent(true); return true; }
  if (v === 'discard') { state.dirty = false; return true; }
  return false;
}

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
/* ============================================================
   インライン画像（本文内マーカー）
   ============================================================ */
const IMG_MARKER_RE = /\[img:(\d+)(?::([lcr]))?(?::([sml]))?\]/g;

function insertImageRef(imgId) {
  if (state.previewMode) togglePreviewMode(false);
  insertAtCaret(refs.bodyInput, `[img:${imgId}:c:m]`);
  refs.bodyInput.focus();
  markDirty();
}

function renderBodyPreview() {
  const text = refs.bodyInput.value;
  let html = '<div class="preview-body">';
  let last = 0;
  IMG_MARKER_RE.lastIndex = 0;
  let m;
  while ((m = IMG_MARKER_RE.exec(text)) !== null) {
    const chunk = text.slice(last, m.index);
    if (chunk) html += esc(chunk).replace(/\n/g, '<br>\n');
    const id    = Number(m[1]);
    const align = m[2] || 'c';
    const size  = m[3] || 'm';
    const img   = state.images.find(x => x.id === id);
    const rawMarker = m[0];
    if (img) {
      const alignLabel = { l: '左', c: '中央', r: '右' }[align] || '中央';
      html += `<span class="bimg" data-marker="${esc(rawMarker)}" data-id="${id}" data-align="${align}" data-size="${size}">` +
        `<img src="${urlOf(img)}" class="bimg__img" alt="${esc(img.name)}" title="${esc(img.name)}">` +
        `<span class="bimg__ctrl">` +
        `<button class="bimg__pos${align==='l'?' on':''}" data-a="l" title="左寄せ"><i class="fa-solid fa-align-left"></i></button>` +
        `<button class="bimg__pos${align==='c'?' on':''}" data-a="c" title="中央"><i class="fa-solid fa-align-center"></i></button>` +
        `<button class="bimg__pos${align==='r'?' on':''}" data-a="r" title="右寄せ"><i class="fa-solid fa-align-right"></i></button>` +
        `<select class="bimg__size" title="サイズ">` +
        `<option value="s"${size==='s'?' selected':''}>小(120px)</option>` +
        `<option value="m"${size==='m'?' selected':''}>中(240px)</option>` +
        `<option value="l"${size==='l'?' selected':''}>大(全幅)</option>` +
        `</select></span></span>`;
    } else {
      html += `<span class="bimg--missing">[img:${id} — 画像未登録]</span>`;
    }
    last = m.index + m[0].length;
  }
  const rest = text.slice(last);
  if (rest) html += esc(rest).replace(/\n/g, '<br>\n');
  html += '</div>';
  refs.bodyPreview.innerHTML = html;
}

function updateImgMarker(wrap, newAlign, newSize) {
  const oldMarker = wrap.dataset.marker;
  const id = wrap.dataset.id;
  const newMarker = `[img:${id}:${newAlign}:${newSize}]`;
  refs.bodyInput.value = refs.bodyInput.value.replace(oldMarker, newMarker);
  markDirty();
  renderBodyPreview();
}

function togglePreviewMode(preview) {
  state.previewMode = preview;
  refs.bodyInput.hidden = preview;
  refs.bodyPreview.hidden = !preview;
  refs.btnTabEdit.classList.toggle('active', !preview);
  refs.btnTabPreview.classList.toggle('active', preview);
  if (preview) renderBodyPreview();
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
  const v = await dialog({
    title: '画像の削除',
    message: `「${img?.name || '画像'}」を削除します。この操作は取り消せません。`,
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '削除する', value: 'ok', kind: 'danger' },
    ],
  });
  if (v !== 'ok') return;
  await Store.del('images', id);
  await loadImages();
  await updateImageCount();
  toast('画像を削除しました', 'success');
}
function applyThumbSize() {
  refs.thumbGrid.style.setProperty('--thumb', state.thumbSize + 'px');
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

/* ============================================================
   音声入力（Web Speech API ／ 非対応時はグレースフル・デグラデーション）
   ============================================================ */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speech = { rec: null, active: false, startAt: 0, timer: null };
function setupSpeech() {
  if (!SR) {
    refs.btnMic.disabled = true;
    refs.btnMic.title = 'このブラウザは音声入力に対応していません（Chrome / Edge を推奨）';
    refs.btnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> 音声入力 非対応';
    return;
  }
  refs.btnMic.addEventListener('click', () => speech.active ? stopSpeech() : startSpeech());
}
function startSpeech() {
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) insertAtCaret(refs.bodyInput, r[0].transcript);
      else interim += r[0].transcript;
    }
    refs.interimText.textContent = interim;
    refs.interimBar.classList.toggle('show', interim.length > 0);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopSpeech();
      toast('マイクの使用が許可されていません。ブラウザの設定を確認してください', 'error');
    } else if (e.error === 'network') {
      stopSpeech();
      toast('音声認識サービスに接続できません（ネットワーク接続が必要です）', 'error');
    }
  };
  /* 無音などで自動停止した場合、録音中なら再開する */
  rec.onend = () => {
    if (speech.active) { try { rec.start(); } catch { /* 連続再開の競合は無視 */ } }
  };
  try { rec.start(); } catch { toast('音声入力を開始できませんでした', 'error'); return; }
  speech.rec = rec;
  speech.active = true;
  speech.startAt = Date.now();
  refs.btnMic.classList.add('recording');
  refs.btnMic.innerHTML = '<i class="fa-solid fa-stop"></i> 停止';
  refs.recIndicator.hidden = false;
  speech.timer = setInterval(() => {
    const s = Math.floor((Date.now() - speech.startAt) / 1000);
    refs.recTime.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }, 500);
  refs.bodyInput.focus();
  toast('音声入力を開始しました。本文へ直接入力されます', 'info');
}
function stopSpeech() {
  speech.active = false;
  if (speech.rec) { try { speech.rec.stop(); } catch {} speech.rec = null; }
  clearInterval(speech.timer);
  refs.btnMic.classList.remove('recording');
  refs.btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i> 音声入力';
  refs.recIndicator.hidden = true;
  refs.recTime.textContent = '0:00';
  refs.interimBar.classList.remove('show');
}

/* ============================================================
   カスタムフォーマット（マスタ登録・適用）
   ============================================================ */
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
async function fmSave() {
  const name = refs.fmName.value.trim();
  if (!name) { toast('フォーマット名を入力してください', 'error'); refs.fmName.focus(); return; }
  const now  = Date.now();
  const tags = parseTags(refs.fmTags.value);
  if (fm.editingId === null) {
    const id = await Store.add('formats', { name, tags, content: refs.fmContent.value, createdAt: now, updatedAt: now });
    fm.editingId = id;
  } else {
    const old = await Store.get('formats', fm.editingId);
    await Store.put('formats', { ...old, name, tags, content: refs.fmContent.value, updatedAt: now });
  }
  await refreshFormats();
  fmLoad(fm.editingId);
  toast('フォーマットを保存しました', 'success');
}
async function fmDelete() {
  if (fm.editingId === null) return;
  const f = state.formats.find(x => x.id === fm.editingId);
  const v = await dialog({
    title: 'フォーマットの削除',
    message: `「${f?.name}」を削除します。この操作は取り消せません。`,
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '削除する', value: 'ok', kind: 'danger' },
    ],
  });
  if (v !== 'ok') return;
  await Store.del('formats', fm.editingId);
  await refreshFormats();
  fmLoad(null);
  toast('フォーマットを削除しました', 'success');
}
function openFormatModal() {
  refs.formatModal.hidden = false;
  fmLoad(state.formats[0]?.id ?? null);
  refs.fmName.focus();
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
  let text = f.content
    .replaceAll('{{date}}', fmtDate(now))
    .replaceAll('{{time}}', fmtTime(now))
    .replaceAll('{{datetime}}', fmtDateTime(now));
  let caret = null;
  const ci = text.indexOf('{{cursor}}');
  if (ci >= 0) { text = text.replace('{{cursor}}', ''); caret = ci; }
  insertAtCaret(refs.bodyInput, text, caret);
  refs.bodyInput.focus();
  toast(`フォーマット「${f.name}」を適用しました`, 'success');
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
}
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  applySidebarState();
  savePref('sidebarOpen', state.sidebarOpen);
}

/* ============================================================
   インポート・エクスポート・コピー
   ============================================================ */
/* ============================================================
   Minutes Memo Pro フォーマット変換
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

async function exportData() {
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

  const v = await dialog({
    title: 'データのインポート',
    message: msg,
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: 'インポート', value: 'ok', kind: isMpp ? 'primary' : 'danger' }
    ]
  });
  if (v !== 'ok') { refs.fileImport.value = ''; return; }

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
  const body = refs.bodyInput.value;
  const text = `■ ${title} ${tags}\n\n${body}`;
  try {
    await navigator.clipboard.writeText(text);
    toast('テキストをコピーしました', 'success');
  } catch (err) {
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

/* ============================================================
   イベント結線
   ============================================================ */
function bindEvents() {
  /* --- トップバー アクション --- */
  refs.btnToggleSidebar.addEventListener('click', toggleSidebar);
  refs.btnExport.addEventListener('click', exportData);
  refs.btnImport.addEventListener('click', () => refs.fileImport.click());
  refs.fileImport.addEventListener('change', (e) => importData(e.target.files[0]));

  /* --- 検索・フィルタ --- */
  const onSearch = debounce(() => {
    state.query = refs.searchInput.value;
    refs.searchClear.hidden = state.query.length === 0;
    renderList();
  }, 140);
  refs.searchInput.addEventListener('input', onSearch);
  refs.searchClear.addEventListener('click', () => {
    refs.searchInput.value = '';
    state.query = '';
    refs.searchClear.hidden = true;
    renderList();
    refs.searchInput.focus();
  });
  refs.tagBar.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    state.tagFilter = state.tagFilter === tag ? null : tag;
    renderList();
  });

  /* --- 一覧 → グループ折りたたみ／メモを開く --- */
  refs.memoList.addEventListener('click', async e => {
    const header = e.target.closest('.date-group-header');
    if (header) {
      const date = header.dataset.date;
      if (state.collapsedGroups.has(date)) state.collapsedGroups.delete(date);
      else state.collapsedGroups.add(date);
      renderList();
      return;
    }
    const item = e.target.closest('.memo-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    if (id === state.currentId) return;
    if (await guardDirty()) openMemo(id);
  });

  /* --- 新規・フォーマット管理 --- */
  refs.btnNew.addEventListener('click', async () => { if (await guardDirty()) newMemo(); });
  refs.btnWelcomeNew.addEventListener('click', () => newMemo());
  refs.btnFormats.addEventListener('click', openFormatModal);
  refs.btnWelcomeFmt.addEventListener('click', openFormatModal);

  /* --- タグマスタ管理モーダル --- */
  refs.btnTags.addEventListener('click', () => { refs.tagModal.hidden = false; refs.tmInput.focus(); });
  refs.tmClose.addEventListener('click', () => { refs.tagModal.hidden = true; });
  refs.tagModal.addEventListener('click', e => { if (e.target === refs.tagModal) refs.tagModal.hidden = true; });
  refs.tmAdd.addEventListener('click', async () => {
    const name = refs.tmInput.value.trim();
    if (!name) return;
    if (!state.tagsMaster.includes(name)) {
      await Store.put('tags', { name });
      await refreshTagsMaster();
      toast('タグを登録しました', 'success');
    }
    refs.tmInput.value = ''; refs.tmInput.focus();
  });
  refs.tmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); refs.tmAdd.click(); }
  });
  refs.tmList.addEventListener('click', async e => {
    const btn = e.target.closest('.tm-del');
    if (!btn) return;
    if (await dialog({ title: 'タグの削除', message: `マスタから「${btn.dataset.tag}」を削除しますか？\n※既存のメモからは削除されません。`, buttons: [{ label: 'キャンセル', value: 'cancel' }, { label: '削除', value: 'ok', kind: 'danger' }] }) !== 'ok') return;
    await Store.del('tags', btn.dataset.tag);
    await refreshTagsMaster();
    toast('タグを削除しました', 'success');
  });

  /* --- 編集（変更検知）・タグサジェスト --- */
  refs.titleInput.addEventListener('input', markDirty);
  refs.tagsInput.addEventListener('input', () => { markDirty(); renderTagsPreview(); updateTagSuggest(); });
  refs.tagsInput.addEventListener('keydown', e => { if (e.key === 'Escape') refs.tagsSuggest.hidden = true; });
  refs.tagsSuggest.addEventListener('click', e => {
    const item = e.target.closest('.sg-item');
    if (!item) return;
    const parts = refs.tagsInput.value.split(/[,、]\s*/);
    parts.pop();
    parts.push(item.dataset.tag);
    refs.tagsInput.value = parts.join(', ') + (parts.length > 0 ? ', ' : '');
    refs.tagsSuggest.hidden = true;
    markDirty(); renderTagsPreview(); refs.tagsInput.focus();
  });
  document.addEventListener('click', e => {
    if (!refs.tagsSuggest.contains(e.target) && e.target !== refs.tagsInput) {
      refs.tagsSuggest.hidden = true;
    }
  });

  refs.bodyInput.addEventListener('input', () => { markDirty(); renderCharCount(); });
  /* Tab キーでタブ文字を挿入（フォーマットの段組維持） */
  refs.bodyInput.addEventListener('keydown', e => {
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      insertAtCaret(refs.bodyInput, '\t');
    }
  });
  /* クリップボード画像の貼り付け（bodyInput フォーカス外でも動作） */
  window.addEventListener('paste', e => {
    if (refs.sheet.hidden) return;
    const items = [...(e.clipboardData?.items || [])];
    const imageFiles = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile()).filter(Boolean);
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles, 'clipboard');
    }
  });

  /* --- 保存・削除・コピー --- */
  refs.btnSave.addEventListener('click', () => saveCurrent());
  refs.btnDelete.addEventListener('click', deleteCurrent);
  refs.btnCopyText.addEventListener('click', copyMemoText);

  /* --- フォーマット適用 --- */
  refs.btnApplyFormat.addEventListener('click', applyFormat);

  /* --- 画像 --- */
  refs.btnAddImage.addEventListener('click', () => refs.fileInput.click());
  refs.fileInput.addEventListener('change', () => {
    if (refs.fileInput.files.length > 0) addImageFiles(refs.fileInput.files);
    refs.fileInput.value = '';
  });
  refs.thumbGrid.addEventListener('click', e => {
    const fig = e.target.closest('.thumb');
    if (!fig) return;
    const id = Number(fig.dataset.id);
    if (e.target.closest('.t-del'))    { removeImage(id); return; }
    if (e.target.closest('.t-insert')) { insertImageRef(id); return; }
    lbShow(Number(fig.dataset.index));
  });
  refs.thumbSize.addEventListener('input', () => {
    state.thumbSize = Number(refs.thumbSize.value);
    applyThumbSize();
    savePrefDebounced('thumbSize', state.thumbSize);
  });
  refs.btnPanelToggle.addEventListener('click', () => togglePanel(false));
  refs.btnPanelOpen.addEventListener('click', () => togglePanel(true));
  refs.btnSidebarClose.addEventListener('click', toggleSidebar);
  refs.btnSidebarOpen.addEventListener('click', toggleSidebar);

  /* --- 編集 / プレビュー タブ --- */
  refs.btnTabEdit.addEventListener('click', () => togglePreviewMode(false));
  refs.btnTabPreview.addEventListener('click', () => togglePreviewMode(true));

  /* --- プレビュー内の画像位置・サイズ変更 --- */
  refs.bodyPreview.addEventListener('click', e => {
    const posBtn = e.target.closest('.bimg__pos');
    if (posBtn) {
      const wrap = posBtn.closest('.bimg');
      updateImgMarker(wrap, posBtn.dataset.a, wrap.dataset.size);
    }
  });
  refs.bodyPreview.addEventListener('change', e => {
    const sel = e.target.closest('.bimg__size');
    if (sel) {
      const wrap = sel.closest('.bimg');
      updateImgMarker(wrap, wrap.dataset.align, sel.value);
    }
  });
  refs.btnGroupByDate.addEventListener('click', () => {
    state.groupByDate = !state.groupByDate;
    state.collapsedGroups.clear();
    applyGroupByDateState();
    savePref('groupByDate', state.groupByDate);
    renderList();
  });

  /* --- フォーマット管理モーダル --- */
  refs.fmClose.addEventListener('click', () => { refs.formatModal.hidden = true; });
  refs.formatModal.addEventListener('click', e => {
    if (e.target === refs.formatModal) refs.formatModal.hidden = true;
  });
  refs.fmNew.addEventListener('click', () => { fmLoad(null); refs.fmName.focus(); });
  refs.fmList.addEventListener('click', e => {
    const item = e.target.closest('.fm-item');
    if (item) fmLoad(Number(item.dataset.id));
  });
  refs.fmSave.addEventListener('click', fmSave);
  refs.fmDelete.addEventListener('click', fmDelete);
  $$('.token').forEach(btn => btn.addEventListener('click', () => {
    insertAtCaret(refs.fmContent, btn.dataset.token);
    refs.fmContent.focus();
  }));

  /* --- ダイアログ背面クリック --- */
  refs.dialogRoot.addEventListener('click', e => {
    if (e.target === refs.dialogRoot) closeDialog('cancel');
  });

  /* --- キーボードショートカット --- */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!refs.dialogRoot.hidden) { closeDialog('cancel'); return; }
      if (lb.open) { lbClose(); return; }
      if (!refs.formatModal.hidden) { refs.formatModal.hidden = true; return; }
      return;
    }
    if (lb.open) {
      if (e.key === 'ArrowLeft')  { lbShow(lb.index - 1); return; }
      if (e.key === 'ArrowRight') { lbShow(lb.index + 1); return; }
      if (e.key === '+' || e.key === '=') { lbZoomTo(lb.scale * 1.25); return; }
      if (e.key === '-') { lbZoomTo(lb.scale / 1.25); return; }
      if (e.key === '0') { lbFit(); return; }
      if (e.key === '1') { lb.scale = 1; lb.tx = 0; lb.ty = 0; lbApply(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (!refs.sheet.hidden) saveCurrent();
    }
  });

  /* --- ページ離脱時の未保存ガード --- */
  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ============================================================
   初期化
   ============================================================ */
async function init() {
  collectRefs();
  if (!window.indexedDB) { refs.fatal.hidden = false; return; }
  try {
    db = await openDB();
  } catch {
    refs.fatal.hidden = false;
    refs.fatalMsg.innerHTML = 'データベースを開けませんでした。<br>シークレットモードや保存領域の制限が原因の場合があります。<br>通常モードのブラウザで再度お試しください。';
    return;
  }
  const prefs = await loadPrefs();
  refs.thumbSize.value = state.thumbSize;
  applyThumbSize();
  applyPanelState();
  applySidebarState();
  applyGroupByDateState();

  await refreshMemos();
  await refreshFormats();
  await refreshTagsMaster();
  bindEvents();
  setupLightboxEvents();
  setupSpeech();
  setupDragDrop();
  renderList();

  /* 前回開いていたメモを復元 */
  const last = prefs.lastMemoId;
  if (typeof last === 'number' && state.memos.some(m => m.id === last)) {
    await openMemo(last);
  }
}
document.addEventListener('DOMContentLoaded', init);
})();