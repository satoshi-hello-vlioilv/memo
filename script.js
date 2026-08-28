(() => {
'use strict';

/* アプリのバージョン。更新時はここと CHANGELOG.md を合わせて更新する */
const APP_VERSION = '1.4.0';

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
const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];
const fmtWeekday = ts => DAY_NAMES[new Date(ts).getDay()];
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
/* メモに任意で付けられる目印（付箋）。id は保存データに残るため変更しないこと。
   色は style.css の .mk-<id> と対応させる */
const MEMO_MARKS = [
  { id: 'star',  icon: 'fa-star',                 label: '重要' },
  { id: 'flag',  icon: 'fa-flag',                 label: '要対応' },
  { id: 'check', icon: 'fa-circle-check',         label: '完了' },
  { id: 'hold',  icon: 'fa-clock',                label: '保留' },
  { id: 'pin',   icon: 'fa-thumbtack',            label: 'ピン' },
  { id: 'alert', icon: 'fa-triangle-exclamation', label: '注意' },
];
const markById = id => MEMO_MARKS.find(m => m.id === id) || null;

const state = {
  memos: [], formats: [], images: [], tagsMaster: [],
  currentId: null,
  currentMark: null,
  dirty: false, savedAt: null,
  query: '', tagFilter: null, imageOnly: false, markFilter: null,
  searchScope: { title: true, tags: true, body: true },
  searchHistory: [],
  thumbSize: 160, panelOpen: true, sidebarOpen: true,
  groupByDate: false, groupDateField: 'createdAt', expandedGroups: new Set(),
  sortDir: 'desc',
  showLineMarks: false,
  imgPanelWidth: 352,
};

/* ============================================================
   要素参照
   ============================================================ */
const refs = {};
function collectRefs() {
  const ids = [
    'app','brandVersion','btnToggleSidebar','btnSidebarClose','btnSidebarOpen','fileImport','btnImport','btnExport',
    'searchInput','searchClear','searchScope','searchSuggest','markBar','tagBar','listCount','btnImageFilter','btnGroupByDate','groupFieldSelect','btnSortOrder','ctxMenu','dropCaret','memoList','listEmpty','listEmptyMsg',
    'welcome','sheet','btnWelcomeNew','btnWelcomeFmt',
    'titleInput','stampCreated','stampUpdated','markPicker','tagsInput','tagsSuggest','tagsPreview',
    'tmInput','tmAdd','tmList','tmEmpty',
    'formatSelect','btnApplyFormat','btnMic','recIndicator','recTime','btnShowMarks',
    'btnBold','btnItalic','fontSizeSelect','textColorInput','highlightColorInput','btnClearFormat',
    'btnClearTextColor','btnClearHighlight',
    'interimBar','interimText','bodyInput','charCount','saveState',
    'fmTags',
    'btnCopyText','btnDelete','btnSave','btnNew','btnManage',
    'imgPanel','imgPanelResizer','imgCount','btnPanelToggle','btnPanelOpen','btnAddImage','fileInput',
    'thumbSize','thumbGrid','imgEmpty','dropOverlay','dropMainText','dropSubText','editorPane',
    'lightbox','lbName','lbIndex','lbZoom','lbZoomIn','lbZoomOut','lbFit','lbActual',
    'lbClose','lbStage','lbImg','lbPrev','lbNext',
    'manageModal','mgmtClose','mgmtNavFormats','mgmtNavTags','mgmtFormatCount','mgmtTagCount','mgmtSectionFormats','mgmtSectionTags',
    'fmNew','fmList','fmEmpty','fmName','fmContent','fmDelete','fmSave',
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
/* fields を渡すと入力欄付きのダイアログになる。決定時は
   { value: ボタンの値, fields: { name: 入力値 } } を返す */
function dialog({ title, message, buttons, fields }) {
  return new Promise(resolve => {
    dialogResolve = resolve;
    refs.dlgTitle.textContent = title;
    refs.dlgMsg.textContent = message;
    refs.dlgFoot.innerHTML = '';
    const inputs = {};
    const existing = refs.dlgMsg.parentElement.querySelector('.dlg-fields');
    if (existing) existing.remove();
    if (fields && fields.length) {
      const wrap = document.createElement('div');
      wrap.className = 'dlg-fields';
      for (const f of fields) {
        const row = document.createElement('label');
        row.className = 'dlg-field';
        const lab = document.createElement('span');
        lab.textContent = f.label;
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = f.value || '';
        inp.placeholder = f.placeholder || '';
        inp.autocomplete = 'off';
        inp.addEventListener('keydown', e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const primary = buttons.find(b => b.kind === 'primary') || buttons[buttons.length - 1];
            finish(primary.value);
          }
        });
        row.append(lab, inp);
        wrap.appendChild(row);
        inputs[f.name] = inp;
      }
      refs.dlgMsg.parentElement.appendChild(wrap);
    }
    const finish = value => {
      const collected = {};
      for (const k in inputs) collected[k] = inputs[k].value;
      closeDialog(fields && fields.length ? { value, fields: collected } : value);
    };
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = `btn ${b.kind === 'primary' ? 'btn-primary' : b.kind === 'danger' ? 'btn-danger' : 'btn-quiet'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      refs.dlgFoot.appendChild(btn);
    }
    refs.dialogRoot.hidden = false;
    const firstInput = Object.values(inputs)[0];
    if (firstInput) { firstInput.focus(); firstInput.select(); }
    else refs.dlgFoot.querySelector('.btn-primary, .btn-danger, .btn')?.focus();
  });
}
function closeDialog(value) {
  refs.dialogRoot.hidden = true;
  refs.dlgMsg.parentElement.querySelector('.dlg-fields')?.remove();
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
    if (map.groupDateField === 'createdAt' || map.groupDateField === 'updatedAt') state.groupDateField = map.groupDateField;
    if (map.sortDir === 'asc' || map.sortDir === 'desc') state.sortDir = map.sortDir;
    if (map.searchScope && typeof map.searchScope === 'object') {
      const s = map.searchScope;
      if (typeof s.title === 'boolean' && typeof s.tags === 'boolean' && typeof s.body === 'boolean'
          && (s.title || s.tags || s.body)) {
        state.searchScope = { title: s.title, tags: s.tags, body: s.body };
      }
    }
    if (Array.isArray(map.searchHistory)) {
      state.searchHistory = map.searchHistory.filter(h => typeof h === 'string' && h).slice(0, 8);
    }
    if (typeof map.imageOnly === 'boolean') state.imageOnly = map.imageOnly;
    if (typeof map.showLineMarks === 'boolean') state.showLineMarks = map.showLineMarks;
    if (typeof map.imgPanelWidth === 'number') state.imgPanelWidth = map.imgPanelWidth;
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
  const counts = new Map();
  for (const m of state.memos) for (const t of (m.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  refs.tmEmpty.hidden = state.tagsMaster.length > 0;
  refs.tmList.innerHTML = state.tagsMaster.map(t => `
    <li class="tag-mgmt-item">
      <span class="chip ${tagClass(t)}">${esc(t)}</span>
      <span class="tmi-spacer"></span>
      <span class="tmi-count mono">${counts.get(t) || 0} 件</span>
      <button class="icon-btn btn-danger-ghost tm-del" data-tag="${esc(t)}" title="削除"><i class="fa-solid fa-trash-can"></i></button>
    </li>
  `).join('');
  refs.mgmtTagCount.textContent = state.tagsMaster.length;
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
function sortField() {
  return state.groupByDate ? state.groupDateField : 'updatedAt';
}
const BODY_IMG_MARKER_RE = /\[img:\d+(?::[lcr])?(?::(?:[sml]|\d+|fit))?\]/g;
const BODY_FMT_TAG_RE = /\[\/?(?:b|i|size(?:=\d{1,3})?|color(?:=#[0-9a-fA-F]{6})?|hl(?:=#[0-9a-fA-F]{6})?|link(?:=[^\]]*)?)\]/g;
const stripMarkers = text => String(text ?? '')
  .replace(BODY_IMG_MARKER_RE, ' ')
  .replace(BODY_FMT_TAG_RE, '')
  .replace(/\s+/g, ' ').trim();
function filteredMemos() {
  const q = state.query.trim().toLowerCase();
  const field = sortField();
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const scope = state.searchScope;
  return state.memos
    .filter(m => {
      if (state.imageOnly && !(m.imageCount > 0)) return false;
      if (state.markFilter && m.mark !== state.markFilter) return false;
      if (state.tagFilter && !(m.tags || []).includes(state.tagFilter)) return false;
      if (!q) return true;
      const inTitle = scope.title && (m.title || '').toLowerCase().includes(q);
      const inTags  = scope.tags  && (m.tags || []).some(t => t.toLowerCase().includes(q));
      const inBody  = scope.body  && stripMarkers(m.body).toLowerCase().includes(q);
      return inTitle || inTags || inBody;
    })
    .sort((a, b) => (a[field] - b[field]) * dir);
}
/* 検索語がヒットした本文位置を中心に、前後を切り出してハイライトする（本文が検索対象外なら通常表示） */
function makeSnippet(body, query, searchBody) {
  const text = stripMarkers(body);
  if (!text) return '';
  const q = query.trim();
  if (!q || !searchBody) return esc(text.slice(0, 64));
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text.slice(0, 64));
  const CONTEXT = 26;
  const start = Math.max(0, idx - CONTEXT);
  const end   = Math.min(text.length, idx + q.length + CONTEXT);
  const before = esc(text.slice(start, idx));
  const match  = esc(text.slice(idx, idx + q.length));
  const after  = esc(text.slice(idx + q.length, end));
  return (start > 0 ? '…' : '') + before + `<mark>${match}</mark>` + after + (end < text.length ? '…' : '');
}

/* ============================================================
   検索サジェスト（履歴・メモタイトル・タグを横断提案）
   ============================================================ */
let suggestIndex = -1;
function highlightText(text, query) {
  const q = query.trim();
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) + `<mark>${esc(text.slice(idx, idx + q.length))}</mark>` + esc(text.slice(idx + q.length));
}
function addToHistory(text) {
  const q = text.trim();
  if (!q) return;
  state.searchHistory = [q, ...state.searchHistory.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  savePref('searchHistory', state.searchHistory);
}
function removeHistoryEntry(value) {
  state.searchHistory = state.searchHistory.filter(h => h !== value);
  savePref('searchHistory', state.searchHistory);
  renderSearchSuggest(refs.searchInput.value);
}
function computeSearchSuggestions(query) {
  const q = query.trim().toLowerCase();
  const history = state.searchHistory
    .filter(h => h.toLowerCase() !== q)
    .filter(h => !q || h.toLowerCase().includes(q))
    .slice(0, 6);

  let memos = [];
  let tags  = [];
  if (q) {
    memos = state.memos
      .filter(m => (m.title || '').toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);

    const tagCounts = new Map();
    for (const m of state.memos) for (const t of (m.tags || [])) {
      if (t.toLowerCase().includes(q)) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
    tags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  }
  return { history, memos, tags };
}
function renderSearchSuggest(query) {
  const { history, memos, tags } = computeSearchSuggestions(query);
  let html = '';
  if (history.length) {
    html += `<div class="search-suggest-head">履歴</div>` + history.map(h => `
      <div class="search-suggest-item" data-kind="history" data-value="${esc(h)}">
        <i class="fa-regular fa-clock"></i>
        <span class="ssi-label">${highlightText(h, query)}</span>
        <button class="ssi-del" data-del="${esc(h)}" title="履歴から削除"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }
  if (memos.length) {
    html += `<div class="search-suggest-head">メモ</div>` + memos.map(m => `
      <div class="search-suggest-item" data-kind="memo" data-id="${m.id}">
        <i class="fa-regular fa-file-lines"></i>
        <span class="ssi-label">${highlightText(m.title || '無題のメモ', query)}</span>
      </div>`).join('');
  }
  if (tags.length) {
    html += `<div class="search-suggest-head">タグ</div>` + tags.map(t => `
      <div class="search-suggest-item" data-kind="tag" data-tag="${esc(t)}">
        <i class="fa-solid fa-tag"></i>
        <span class="ssi-label">${highlightText(t, query)}</span>
      </div>`).join('');
  }
  suggestIndex = -1;
  refs.searchSuggest.innerHTML = html;
  refs.searchSuggest.hidden = html.length === 0;
}
function updateSuggestActive(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === suggestIndex));
  if (suggestIndex >= 0 && items[suggestIndex]) items[suggestIndex].scrollIntoView({ block: 'nearest' });
}
async function activateSearchSuggest(item) {
  const kind = item.dataset.kind;
  refs.searchSuggest.hidden = true;
  suggestIndex = -1;
  if (kind === 'history') {
    refs.searchInput.value = item.dataset.value;
    state.query = item.dataset.value;
    refs.searchClear.hidden = state.query.length === 0;
    addToHistory(item.dataset.value);
    renderList();
  } else if (kind === 'memo') {
    addToHistory(refs.searchInput.value);
    const id = Number(item.dataset.id);
    if (id !== state.currentId && await guardDirty()) openMemo(id);
  } else if (kind === 'tag') {
    addToHistory(refs.searchInput.value);
    state.tagFilter = item.dataset.tag;
    renderList();
  }
}

function renderMemoItem(m, peek = false) {
  const active  = m.id === state.currentId ? ' active' : '';
  const title   = esc(m.title) || '無題のメモ';
  const dts     = state.groupByDate ? (m[state.groupDateField] ?? m.updatedAt) : m.updatedAt;
  const date    = isToday(dts) ? fmtTime(dts) : fmtDate(dts);
  const snippet = makeSnippet(m.body, state.query, state.searchScope.body);
  const tags    = (m.tags || []).slice(0, 3).map(t =>
    `<span class="chip chip-s ${tagClass(t)}">${esc(t)}</span>`).join('');
  const more    = (m.tags || []).length > 3 ? `<span class="chip chip-s c4">+${m.tags.length - 3}</span>` : '';
  const imgs    = m.imageCount > 0
    ? `<span class="mi-imgs"><i class="fa-regular fa-image"></i>${m.imageCount}</span>` : '';
  const mark    = markById(m.mark);
  const markEl  = mark
    ? `<i class="mi-mark fa-solid ${mark.icon} mk-${mark.id}" title="${esc(mark.label)}"></i>` : '';
  return `<li class="memo-item${active}${peek ? ' peek' : ''}" data-id="${m.id}"${mark ? ` data-mark="${mark.id}"` : ''}>
    <div class="mi-top">${markEl}<span class="mi-title">${title}</span><span class="mi-date mono">${date}</span></div>
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
  return `${y}年${mo}月${d}日（${DAY_NAMES[new Date(y, mo - 1, d).getDay()]}）`;
}
function renderList() {
  const list = filteredMemos();
  refs.listCount.textContent = `${list.length} 件`;

  let html;
  if (!state.groupByDate) {
    html = list.map(m => renderMemoItem(m)).join('');
  } else {
    const field = state.groupDateField;
    const keys = [];
    const groupMap = new Map();
    for (const m of list) {
      const key = fmtDate(m[field]);
      if (!groupMap.has(key)) { groupMap.set(key, []); keys.push(key); }
      groupMap.get(key).push(m);
    }
    /* 検索・タグ絞り込み中は、折りたたみ状態に関わらず該当グループを
       強制的に開く（「今日」等の未展開グループに隠れて検索結果が
       見えなくなるのを防ぐ）。設定自体は変更しないため、絞り込みを
       解除すれば元の開閉状態に戻る。 */
    const filtering = !!(state.query.trim() || state.tagFilter || state.imageOnly);
    html = keys.map(key => {
      const memos     = groupMap.get(key);
      const collapsed = !filtering && !state.expandedGroups.has(key);
      const chevron   = collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
      /* 折りたたむと編集中のメモや目印（付箋）を付けたメモまで隠れてしまい、
         今どれを編集中なのか・どこに目印を付けたのかを見失う。折りたたみ中でも
         この2つは「付箋が折り目からはみ出している」ように残して表示し、
         残りは「他 N 件を表示」から展開できるようにする */
      const activeInGroup = state.currentId !== null
        ? memos.find(m => m.id === state.currentId) : null;
      const peeked = collapsed
        ? memos.filter(m => m.id === state.currentId || markById(m.mark)) : [];
      let items;
      if (!collapsed) {
        items = memos.map(m => renderMemoItem(m)).join('');
      } else if (peeked.length > 0) {
        const rest = memos.length - peeked.length;
        items = peeked.map(m => renderMemoItem(m, true)).join('') +
          (rest > 0 ? `<li class="group-rest" data-date="${esc(key)}">他 ${rest} 件を表示</li>` : '');
      } else {
        items = '';
      }
      const imgTotal  = memos.reduce((sum, m) => sum + (m.imageCount || 0), 0);
      const imgBadge  = imgTotal > 0
        ? `<span class="date-group-imgs"><i class="fa-regular fa-image"></i>${imgTotal}</span>` : '';
      /* 画像バッジと同じように、そのグループに含まれる目印も見出しへ集約して
         表示する。折りたたんでいても、どの目印がその日に付いているかが分かる */
      const markCounts = new Map();
      for (const m of memos) {
        if (m.mark && markById(m.mark)) markCounts.set(m.mark, (markCounts.get(m.mark) || 0) + 1);
      }
      const markBadges = MEMO_MARKS.filter(mk => markCounts.has(mk.id)).map(mk => {
        const n = markCounts.get(mk.id);
        return `<span class="date-group-mark" title="${esc(mk.label)} ${n} 件">` +
          `<i class="fa-solid ${mk.icon} mk-${mk.id}"></i>` +
          (n > 1 ? `<span class="dgm-n">${n}</span>` : '') + `</span>`;
      }).join('');
      /* 折りたたみ中のグループに編集中のメモが含まれることを見出し側でも示し、
         スクロールしていても選択位置を追えるようにする */
      const hasActive = activeInGroup ? ' has-active' : '';
      return `<li class="date-group-header${collapsed ? ' collapsed' : ''}${hasActive}" data-date="${esc(key)}">` +
        `<i class="fa-solid ${chevron}"></i>` +
        `<span class="date-group-label">${getDateGroupLabel(key)}</span>` +
        (activeInGroup ? `<span class="date-group-active" title="このグループに編集中のメモがあります"></span>` : '') +
        markBadges +
        imgBadge +
        `<span class="date-group-count">${memos.length}</span></li>${items}`;
    }).join('');
  }
  refs.memoList.innerHTML = html;

  const empty = list.length === 0;
  refs.listEmpty.hidden = !empty;
  refs.listEmptyMsg.innerHTML = (state.query || state.tagFilter || state.imageOnly || state.markFilter)
    ? '条件に一致するメモがありません。<br>検索語・検索範囲・タグ・目印・画像フィルタを見直してください。'
    : 'メモはまだありません。<br>「新規メモ」から作成できます。';
  renderMarkBar();
  renderTagBar();
}
/* 実際に使われている目印だけを絞り込みチップとして並べる。1件も無ければ
   バー自体を空にして場所を取らない(.markbar:empty で非表示) */
function renderMarkBar() {
  const counts = new Map();
  for (const m of state.memos) {
    if (m.mark && markById(m.mark)) counts.set(m.mark, (counts.get(m.mark) || 0) + 1);
  }
  refs.markBar.innerHTML = MEMO_MARKS.filter(mk => counts.has(mk.id)).map(mk =>
    `<button class="mark-chip ${state.markFilter === mk.id ? 'active' : ''}" data-mark="${mk.id}"
       title="「${esc(mk.label)}」の目印が付いたメモだけを表示">
       <i class="fa-solid ${mk.icon} mk-${mk.id}"></i>${esc(mk.label)}
       <span class="cnt">${counts.get(mk.id)}</span></button>`).join('');
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
  refs.charCount.textContent = serializeBody().length;
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
  state.currentMark = markById(m.mark) ? m.mark : null;
  refs.titleInput.value = m.title || '';
  refs.tagsInput.value  = (m.tags || []).join(', ');
  showSheet();
  renderStamps(); renderSaveState(); renderTagsPreview(); renderMarkPicker(); renderList();
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
  renderStamps(); renderSaveState(); renderCharCount(); renderTagsPreview(); renderMarkPicker(); renderList();
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
   インライン画像（contenteditable 内）
   ============================================================ */
let draggedImg = null;   /* 本文内でドラッグ移動中の画像要素 */

/* 端をドラッグして自由変更した際の「カスタム」表示ラベル。
   実際の px 幅を添えることで、プリセットと何が違うのか一目で分かるようにする */
function customSizeLabel(px) {
  return Number.isFinite(px) ? `カスタム（${px}px）` : 'カスタム';
}

function createInlineImg(imgId, align, size) {
  const img = state.images.find(x => x.id === imgId);
  const wrap = document.createElement('span');
  wrap.className = 'body-img';
  wrap.contentEditable = 'false';
  wrap.dataset.id = imgId;
  wrap.dataset.align = align || 'c';
  const sizeVal = size || 'fit';
  wrap.dataset.size = sizeVal;
  wrap.setAttribute('draggable', 'true');
  wrap.title = 'ダブルクリックで拡大／ドラッグで移動／端をドラッグでサイズ変更';
  if (img) {
    const isPreset = sizeVal === 's' || sizeVal === 'm' || sizeVal === 'l' || sizeVal === 'fit';
    const customPx = isPreset ? null : parseInt(sizeVal, 10);
    const widthStyle = Number.isFinite(customPx) ? ` style="width:${customPx}px"` : '';
    const customLabel = Number.isFinite(customPx) ? customSizeLabel(customPx) : customSizeLabel();
    wrap.innerHTML =
      `<img src="${urlOf(img)}" class="body-img__img" alt="${esc(img.name)}" draggable="false"${widthStyle}>` +
      `<span class="body-img__resize" title="ドラッグでサイズ変更"></span>` +
      `<span class="body-img__ctrl">` +
        `<button class="body-img__zoom" title="拡大表示"><i class="fa-solid fa-magnifying-glass-plus"></i></button>` +
        `<button class="body-img__copy" title="画像をコピー"><i class="fa-regular fa-copy"></i></button>` +
        `<span class="body-img__div"></span>` +
        `<button class="body-img__pos${align==='l'?' on':''}" data-a="l" title="左寄せ"><i class="fa-solid fa-align-left"></i></button>` +
        `<button class="body-img__pos${align==='c'?' on':''}" data-a="c" title="中央"><i class="fa-solid fa-align-center"></i></button>` +
        `<button class="body-img__pos${align==='r'?' on':''}" data-a="r" title="右寄せ"><i class="fa-solid fa-align-right"></i></button>` +
        `<select class="body-img__size" title="画像の表示幅を選択（端をドラッグすると自由なサイズにもできます）">` +
          `<option value="fit"${sizeVal==='fit'?' selected':''}>幅に合わせる（エリア幅に自動追従）</option>` +
          `<option value="s"${sizeVal==='s'?' selected':''}>小（120px）</option>` +
          `<option value="m"${sizeVal==='m'?' selected':''}>中（240px）</option>` +
          `<option value="l"${sizeVal==='l'?' selected':''}>大（最大幅）</option>` +
          `<option value="custom" hidden${!isPreset?' selected':''}>${esc(customLabel)}</option>` +
        `</select>` +
        `<button class="body-img__del" title="削除"><i class="fa-solid fa-xmark"></i></button>` +
      `</span>`;
  } else {
    wrap.innerHTML = `<span class="body-img--missing">[img:${imgId} — 画像未登録]</span>`;
  }
  return wrap;
}

function addTextWithBreaks(parent, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parent.appendChild(document.createElement('br'));
    if (lines[i]) parent.appendChild(document.createTextNode(lines[i]));
  }
}

/* リンクの URL を安全な形に整える。javascript: のような実行を伴うスキームは
   受け付けず、スキーム省略時は https:// を補う */
function safeLinkUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(url)) return 'mailto:' + url;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return null;
  return 'https://' + url;
}

/* 書式タグ([b] [i] [size=N] [color=#hex] [hl=#hex] [link=URL])に対応する要素を
   生成する。size/color/hl はインライン style で表現し、シリアライズ時に
   判別できるよう data-fmt 属性を付ける */
function createFormatElement(tag, param) {
  if (tag === 'b') return document.createElement('b');
  if (tag === 'i') return document.createElement('i');
  if (tag === 'link') {
    const url = safeLinkUrl(param);
    /* 安全でない URL は書式化せず、ただの span として中身だけ残す */
    if (!url) { const s = document.createElement('span'); return s; }
    const a = document.createElement('a');
    a.dataset.fmt = 'link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = `${url}\nCtrl+クリック（Mac は ⌘+クリック）で開きます`;
    return a;
  }
  const span = document.createElement('span');
  span.dataset.fmt = tag;
  if (tag === 'size') {
    const px = Math.min(72, Math.max(8, parseInt(param, 10) || 15));
    span.style.fontSize = px + 'px';
  } else if (tag === 'color' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.color = param;
  } else if (tag === 'hl' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.backgroundColor = param;
  }
  return span;
}

/* 画像マーカーと書式タグ([b] [i] [size=N] [color=#hex] [hl=#hex])を含む本文
   テキストを DOM フラグメントへ再帰的に変換する。書式タグは入れ子にできる
   (例: [b][color=#ff0000]太字の赤文字[/color][/b])ため、単純な正規表現の
   一括置換ではなく再帰下降パーサーとして実装している。

   【重要】走査位置は pos 変数で明示的に管理する。以前は g フラグ正規表現の
   lastIndex を再帰をまたいで共有していたが、JS の仕様では exec が失敗すると
   lastIndex が 0 にリセットされるため、閉じタグの無い開始タグ(ユーザーが
   文字通り「[b]」と入力した場合など)で呼び出し元が先頭から再走査してしまい、
   無限ループでアプリ全体がフリーズする致命的な不具合があった。 */
const BODY_TOKEN_RE = /\[img:(?<imgId>\d+)(?::(?<imgAlign>[lcr]))?(?::(?<imgSize>[sml]|\d+|fit))?\]|\[(?<close>\/)?(?<tag>b|i|size|color|hl|link)(?:=(?<param>[^\]]*))?\]/g;
const BODY_FMT_TAGS = ['b', 'i', 'size', 'color', 'hl', 'link'];
function textToFragment(text) {
  let pos = 0;
  /* 各タグの閉じタグ位置を先に列挙しておく。開始タグごとに indexOf で後方を
     線形探索すると、対応の取れないタグが大量に並ぶ入力で二次時間になるため、
     単調に進む pos に合わせてポインタを進めるだけで判定できるようにする */
  const closeIdx = {};
  for (const t of BODY_FMT_TAGS) {
    const list = [];
    const needle = `[/${t}]`;
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) list.push(at);
    closeIdx[t] = { list, next: 0 };
  }
  const hasCloseAhead = tag => {
    const c = closeIdx[tag];
    while (c.next < c.list.length && c.list[c.next] < pos) c.next++;
    return c.next < c.list.length;
  };
  function parse(stopTag) {
    const frag = document.createDocumentFragment();
    while (pos < text.length) {
      BODY_TOKEN_RE.lastIndex = pos;
      const m = BODY_TOKEN_RE.exec(text);
      if (!m) break;
      if (m.index > pos) addTextWithBreaks(frag, text.slice(pos, m.index));
      pos = m.index + m[0].length;
      const g = m.groups;
      if (g.imgId !== undefined) {
        frag.appendChild(createInlineImg(Number(g.imgId), g.imgAlign || 'c', g.imgSize || 'fit'));
        continue;
      }
      if (g.close) {
        if (g.tag === stopTag) return frag;
        /* 対応する開始タグの無い閉じタグは、書式として解釈せず文字のまま表示する */
        addTextWithBreaks(frag, m[0]);
        continue;
      }
      /* 対応する閉じタグが後方に無い開始タグも文字のまま表示する。ユーザーが
         文字通り「[b]」等と入力したケースで、以降全文が意図せず書式化されたり
         入力した文字が消えたりしないようにする */
      if (!hasCloseAhead(g.tag)) {
        addTextWithBreaks(frag, m[0]);
        continue;
      }
      const el = createFormatElement(g.tag, g.param);
      el.appendChild(parse(g.tag));
      frag.appendChild(el);
    }
    if (pos < text.length) {
      addTextWithBreaks(frag, text.slice(pos));
      pos = text.length;
    }
    return frag;
  }
  return parse(null);
}

/* rgb(r, g, b) / rgba(r, g, b, a) 形式の computed style 値を #rrggbb に変換する。
   要素の style.color 等はブラウザ側で常に rgb() 表記に正規化されて返る */
function rgbToHex(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || '');
  if (!m) return null;
  const toHex = n => Number(n).toString(16).padStart(2, '0');
  return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
}

function serializeBody() {
  let result = '';
  function wrapTag(node, open, close) {
    result += open;
    for (const c of node.childNodes) walk(c);
    result += close;
  }
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const fmt = node.dataset && node.dataset.fmt;
      if (node.classList && (node.classList.contains('line-mark') || node.classList.contains('current-line-hl'))) {
        return; /* 表示専用のオーバーレイ要素(改行マーク・現在行ハイライト)は読み飛ばす */
      } else if (node.classList && node.classList.contains('body-img')) {
        result += `[img:${node.dataset.id}:${node.dataset.align || 'c'}:${node.dataset.size || 'fit'}]`;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (result.length > 0 && !result.endsWith('\n')) result += '\n';
        for (const c of node.childNodes) walk(c);
        if (!result.endsWith('\n')) result += '\n';
      } else if (node.tagName === 'B' || node.tagName === 'STRONG') {
        wrapTag(node, '[b]', '[/b]');
      } else if (node.tagName === 'I' || node.tagName === 'EM') {
        wrapTag(node, '[i]', '[/i]');
      } else if (fmt === 'size') {
        const px = parseInt(node.style.fontSize, 10) || 15;
        wrapTag(node, `[size=${px}]`, '[/size]');
      } else if (fmt === 'color') {
        const hex = rgbToHex(node.style.color);
        if (hex) wrapTag(node, `[color=${hex}]`, '[/color]');
        else for (const c of node.childNodes) walk(c);
      } else if (fmt === 'hl') {
        const hex = rgbToHex(node.style.backgroundColor);
        if (hex) wrapTag(node, `[hl=${hex}]`, '[/hl]');
        else for (const c of node.childNodes) walk(c);
      } else if (fmt === 'link') {
        /* URL に ] が含まれるとマーカーが壊れるため、その場合は
           リンクを諦めて文字だけ残す */
        const url = node.getAttribute('href') || '';
        if (url && !url.includes(']')) wrapTag(node, `[link=${url}]`, '[/link]');
        else for (const c of node.childNodes) walk(c);
      } else {
        for (const c of node.childNodes) walk(c);
      }
    }
  }
  for (const c of refs.bodyInput.childNodes) walk(c);
  return result.replace(/\n$/, '');
}

function deserializeBody(text) {
  refs.bodyInput.innerHTML = '';
  if (text) {
    let frag;
    try {
      frag = textToFragment(text);
    } catch (err) {
      /* 起動時の前回メモ復元でも呼ばれるため、パーサーがどんな入力
         (インポートされた異常データ等)で失敗してもアプリ全体が起動不能に
         ならないよう、プレーンテキスト表示にフォールバックする */
      console.error('本文の解釈に失敗したためプレーンテキストとして表示します', err);
      frag = document.createDocumentFragment();
      addTextWithBreaks(frag, text);
    }
    refs.bodyInput.appendChild(frag);
    ensureTrailingEditable();
  }
  rebuildLineMarks();
}

/* 末尾が（編集不可な）画像のままだと、その後ろにキャレットを
   置けず文字入力できなくなる。末尾画像の後ろに改行を補い、
   常に編集可能な行が残るようにする。 */
function ensureTrailingEditable() {
  /* 改行マーク・カーソルハイライトは表示専用オーバーレイのため、
     末尾判定の対象からは読み飛ばす */
  let last = refs.bodyInput.lastChild;
  while (last && last.nodeType === Node.ELEMENT_NODE && last.classList &&
         (last.classList.contains('line-mark') || last.classList.contains('current-line-hl'))) {
    last = last.previousSibling;
  }
  if (last && last.nodeType === Node.ELEMENT_NODE &&
      last.classList && last.classList.contains('body-img')) {
    refs.bodyInput.appendChild(document.createElement('br'));
  }
}

function placeCaretAfter(node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  }
  return null;
}

/* ドラッグ中の挿入位置を求め、縦線インジケータで可視化する */
function getCaretIndicator(x, y) {
  const range = caretRangeFromPoint(x, y);
  if (!range) return null;
  const r = range.getBoundingClientRect();
  if (r && r.height > 0) return { left: r.left, top: r.top, height: r.height };
  const cont = range.startContainer;
  /* テキストノード内：行矩形の左右端にキャレットを置く */
  if (cont.nodeType === Node.TEXT_NODE && cont.textContent.length) {
    const tr = document.createRange();
    tr.selectNodeContents(cont);
    const rects = tr.getClientRects();
    const rr = rects[rects.length - 1] || tr.getBoundingClientRect();
    if (rr && rr.height > 0) {
      const atEnd = range.startOffset >= cont.textContent.length;
      return { left: atEnd ? rr.right : rr.left, top: rr.top, height: rr.height };
    }
  }
  /* 要素境界（画像や改行の前後）：隣接要素の端に合わせる */
  if (cont.nodeType === Node.ELEMENT_NODE) {
    const after  = cont.childNodes[range.startOffset];
    const before = cont.childNodes[range.startOffset - 1];
    const ref = (after && after.nodeType === Node.ELEMENT_NODE) ? after
              : (before && before.nodeType === Node.ELEMENT_NODE) ? before : null;
    if (ref) {
      const rr = ref.getBoundingClientRect();
      if (rr.height > 0) return { left: after ? rr.left : rr.right, top: rr.top, height: rr.height };
    }
  }
  const er = refs.bodyInput.getBoundingClientRect();
  return { left: Math.min(Math.max(x, er.left + 2), er.right - 2), top: er.top + 6, height: 24 };
}
function showDropCaret(x, y) {
  const info = getCaretIndicator(x, y);
  if (!info) return;
  const el = refs.dropCaret;
  el.style.left   = Math.round(info.left) + 'px';
  el.style.top    = Math.round(info.top) + 'px';
  el.style.height = Math.round(info.height) + 'px';
  el.hidden = false;
}
function hideDropCaret() { if (refs.dropCaret && !refs.dropCaret.hidden) refs.dropCaret.hidden = true; }
function endImgDrag() {
  if (draggedImg) draggedImg.classList.remove('dragging');
  draggedImg = null;
  hideDropCaret();
}

function insertBodyText(text, caretAt = null) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    refs.bodyInput.appendChild(textToFragment(text));
    markDirty(); renderCharCount();
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = document.createDocumentFragment();
  if (caretAt !== null) {
    addTextWithBreaks(frag, text.slice(0, caretAt));
    const caretMarker = document.createTextNode('');
    frag.appendChild(caretMarker);
    addTextWithBreaks(frag, text.slice(caretAt));
    range.insertNode(frag);
    const nr = document.createRange();
    nr.setStartAfter(caretMarker);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  } else {
    addTextWithBreaks(frag, text);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      const nr = document.createRange();
      nr.setStartAfter(last);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  }
  markDirty(); renderCharCount();
}

function insertImageRef(imgId) {
  refs.bodyInput.focus();
  const imgEl = createInlineImg(imgId, 'c', 'fit');
  const sel = window.getSelection();
  let range;
  if (sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).startContainer)) {
    range = sel.getRangeAt(0);
    range.deleteContents();
  } else {
    range = document.createRange();
    range.selectNodeContents(refs.bodyInput);
    range.collapse(false);
  }
  range.insertNode(imgEl);
  ensureTrailingEditable();
  placeCaretAfter(imgEl);
  markDirty(); renderCharCount();
}

/* 本文内画像をライトボックスで拡大表示（パネルと同じビューワを共用） */
function openInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const index = state.images.findIndex(x => x.id === id);
  if (index >= 0) lbShow(index);
  else toast('この画像は登録されていません', 'error');
}

/* 本文内画像の右下角ドラッグによる自由なサイズ変更 */
function startImageResize(wrap, startEvent) {
  const imgEl = wrap.querySelector('.body-img__img');
  if (!imgEl) return;
  const startX = startEvent.clientX;
  const startWidth = imgEl.getBoundingClientRect().width;
  const minW = 48;
  const maxW = Math.max(minW, refs.bodyInput.getBoundingClientRect().width - 8);
  wrap.classList.add('resizing');
  const onMove = e => {
    const w = Math.round(Math.min(maxW, Math.max(minW, startWidth + (e.clientX - startX))));
    imgEl.style.width = w + 'px';
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    wrap.classList.remove('resizing');
    const finalPx = Math.round(imgEl.getBoundingClientRect().width);
    wrap.dataset.size = String(finalPx);
    const sel = wrap.querySelector('.body-img__size');
    if (sel) {
      const customOpt = sel.querySelector('option[value="custom"]');
      if (customOpt) customOpt.textContent = customSizeLabel(finalPx);
      sel.value = 'custom';
    }
    markDirty(); renderCharCount(); rebuildLineMarksDebounced();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* ホバーコントロールバーの位置を画像の実測位置から都度計算する。
   CSS の包含ブロックに頼らないため、配置・サイズ・スクロール状態に
   関わらず常に画像の直上（エディタ範囲内にクランプ）に表示される。 */
function positionImgCtrl(wrap) {
  const ctrl = wrap.querySelector('.body-img__ctrl');
  if (!ctrl) return;
  const wrapRect = wrap.getBoundingClientRect();
  const editorRect = refs.bodyInput.getBoundingClientRect();
  const ctrlH = ctrl.offsetHeight || 34;
  const ctrlW = ctrl.offsetWidth || 180;
  let top = wrapRect.top + 6;
  top = Math.max(editorRect.top + 4, Math.min(top, editorRect.bottom - ctrlH - 4));
  let left = wrapRect.left + wrapRect.width / 2;
  left = Math.max(editorRect.left + ctrlW / 2 + 4, Math.min(left, editorRect.right - ctrlW / 2 - 4));
  ctrl.style.top = Math.round(top) + 'px';
  ctrl.style.left = Math.round(left) + 'px';
}

/* 本文内画像をシステムのクリップボードにコピー（フォーマットの
   互換性を優先し、常に PNG として書き込む） */
async function blobToPngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}
async function copyInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const img = state.images.find(x => x.id === id);
  if (!img) { toast('この画像は登録されていません', 'error'); return; }
  try {
    const pngBlob = await blobToPngBlob(img.blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    toast('画像をクリップボードにコピーしました', 'success');
  } catch (err) {
    console.error(err);
    toast('画像のコピーに失敗しました', 'error');
  }
}

/* ============================================================
   改行マークの視覚化（表示専用・本文内容には含まれない） */
function applyShowLineMarksState() {
  refs.btnShowMarks.classList.toggle('active', state.showLineMarks);
  refs.btnShowMarks.title = state.showLineMarks ? '改行マークを非表示' : '改行マークを表示';
}
function rebuildLineMarks() {
  $$('.line-mark', refs.bodyInput).forEach(el => el.remove());
  if (!state.showLineMarks) return;
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const scrollLeft = refs.bodyInput.scrollLeft;
  const frag = document.createDocumentFragment();
  const addMark = rect => {
    if (!rect || rect.height === 0) return;   /* 非表示状態（display:none 等）は無視 */
    const mark = document.createElement('span');
    mark.className = 'line-mark';
    mark.contentEditable = 'false';
    mark.textContent = '↵';
    mark.style.top  = Math.round(rect.top  - containerRect.top  + scrollTop)  + 'px';
    mark.style.left = Math.round(rect.left - containerRect.left + scrollLeft + 2) + 'px';
    frag.appendChild(mark);
  };
  /* <br> による改行（音声入力・フォーマット適用などプログラム的な挿入） */
  for (const br of $$('br', refs.bodyInput)) addMark(br.getBoundingClientRect());
  /* <div>/<p> による改行（Enter キーを押した際のブラウザ既定の段落化）
     文字境界の collapsed Range は getClientRects() が空配列を返すことがあり
     getBoundingClientRect() が全て 0 になるため、要素自体の矩形を使う */
  for (const block of $$('div, p', refs.bodyInput)) addMark(block.getBoundingClientRect());
  /* white-space:pre-wrap の本文では、Shift+Enter による改行が <br> ではなく
     テキストノード内の "\n" 文字として挿入される場合がある。これを拾わないと
     Shift+Enter の改行だけマークが表示されない */
  const walker = document.createTreeWalker(refs.bodyInput, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest('.line-mark, .current-line-hl'))
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let tn;
  while ((tn = walker.nextNode())) {
    const s = tn.textContent;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\n') continue;
      const r = document.createRange();
      r.setStart(tn, i);
      r.setEnd(tn, i + 1);
      addMark(r.getClientRects()[0]);
    }
  }
  refs.bodyInput.appendChild(frag);
}
const rebuildLineMarksDebounced = debounce(rebuildLineMarks, 200);

/* ノードが実際に描画されている行の矩形を返す。テキストノードは Range 経由で
   なければ矩形が取れないため、種類に応じて取得方法を切り替える */
function rectOfNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const r = document.createRange();
    r.selectNodeContents(node);
    return r.getClientRects()[0] || null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const rect = node.getBoundingClientRect();
    return rect.height > 0 ? rect : null;
  }
  return null;
}

/* カーソルのある行を薄くハイライトし、キャレット位置を見失わないようにする。
   フォーカスが本文エディタに無い場合は非表示にする。 */
function updateCursorHighlight() {
  let hl = refs.bodyInput.querySelector('.current-line-hl');
  const sel = window.getSelection();
  const active = document.activeElement === refs.bodyInput &&
    sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.anchorNode);
  /* 本文が完全に空の場合はハイライトを出さない。ここで要素を追加すると
     :empty::before によるプレースホルダー表示が消えてしまうため */
  const hasRealContent = [...refs.bodyInput.childNodes].some(n => n !== hl);
  if (!active || !hasRealContent) {
    if (hl) hl.remove();
    return;
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if (!rect) {
    const node = range.startContainer;
    /* white-space:pre-wrap の本文で Shift+Enter 等により改行がテキストノード内の
       "\n" 文字として表現される場合、その文字境界の collapsed Range は
       getClientRects() が空になることがある。その場合でもテキストノード全体を
       選択した Range なら正しい行の矩形が取れるため、まずそちらを試す。
       (これを飛ばして要素の矩形にフォールバックすると、"\n" がbodyInput 直下の
       テキストノードの場合に親要素＝エディタ全体の矩形を拾ってしまい、
       ハイライトがエディタ全体を覆う不具合になる) */
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      rect = nodeRange.getClientRects()[0];
    }
    if (!rect || rect.height === 0) {
      /* それでも矩形が取れない場合(空要素など)は、キャレットを含む要素自体の
         矩形にフォールバックする */
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      /* ただしその要素がエディタ自身の場合(書式解除の直後など、選択が
         bodyInput 直下のオフセットを指している状態)、そのまま使うと
         ハイライトがエディタ全体を覆ってしまう。キャレット位置の子ノードから
         実際の行の矩形を求め、取れなければハイライトを出さない */
      if (el === refs.bodyInput) {
        const kids = [...el.childNodes].filter(n => n !== hl &&
          !(n.nodeType === Node.ELEMENT_NODE && n.classList && n.classList.contains('line-mark')));
        const at = kids[Math.min(range.startOffset, kids.length - 1)];
        rect = at && rectOfNode(at);
      } else {
        rect = el && el.getBoundingClientRect();
      }
    }
  }
  if (!rect || rect.height === 0) { if (hl) hl.remove(); return; }
  if (!hl) {
    hl = document.createElement('span');
    hl.className = 'current-line-hl';
    hl.contentEditable = 'false';
    /* 先頭に挿入すると、末尾を指す (bodyInput, offset) 形式の既存 Range/Selection の
       境界がこの新要素を含むようずれてしまう(挿入位置の index 分だけ offset が調整される
       DOM の仕様のため)。末尾へ追加すれば既存の選択範囲に影響しない。 */
    refs.bodyInput.appendChild(hl);
  }
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const top = rect.top - containerRect.top + scrollTop;
  hl.style.top = Math.round(top - 3) + 'px';
  hl.style.height = Math.round(rect.height + 6) + 'px';
}

/* ============================================================
   本文エディタの右クリックメニュー（執筆補助）
   ============================================================ */
let ctxRange = null;   /* メニューを開いた時点の選択範囲を保持 */

const toHalfWidth = s => s
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/　/g, ' ');
const toFullWidth = s => s
  .replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0))
  .replace(/ /g, '　');

/* 現在の選択範囲を置換し、結果を選択状態で残す */
function replaceSelection(newText) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(newText);
  range.insertNode(node);
  const nr = document.createRange();
  nr.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(nr);
  markDirty(); renderCharCount();
}

/* ============================================================
   本文の書式設定（太字・斜体・文字サイズ・文字色・ハイライト）
   ============================================================ */
/* ツールバーのボタン/セレクト/カラーピッカーをクリックすると本文の選択範囲
   (window.getSelection())が失われることがあるため、操作の直前に退避し、
   実際に書式を適用する瞬間に復元する */
let savedBodyRange = null;
function captureBodySelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (refs.bodyInput.contains(r.commonAncestorContainer) && !r.collapsed) {
      savedBodyRange = r.cloneRange();
      return true;
    }
  }
  /* 現時点で有効な選択が無ければ退避値も破棄する。古い値を残すと、選択を
     解除した後のツールバー操作で「以前の選択範囲」に書式が再適用されてしまう */
  savedBodyRange = null;
  return false;
}
function restoreBodySelection() {
  if (!savedBodyRange) return false;
  refs.bodyInput.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  try { sel.addRange(savedBodyRange); } catch { return false; }
  return true;
}

/* range と交差する、書式適用対象のテキストノードを出現順に列挙する。
   選択範囲がインライン画像や表示専用オーバーレイをまたぐ場合(全選択など)、
   intersectsNode はそれらの内部テキスト(画像コントロールの <option> ラベルや
   改行マークの「↵」)にも true を返すため、明示的に除外する。除外しないと
   <option> の中に <b> が挿入されるなどウィジェットのDOMが破壊される */
function getSelectedTextNodesInRange(range) {
  const root = range.commonAncestorContainer;
  const container = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      /* 長さ0のテキストノードは extractContents/insertNode の副産物として
         残ることがある。書式の対象にならないだけでなく、これを数えてしまうと
         「選択範囲がすべて書式済みか」の判定が常に偽になり、太字・斜体の
         解除（トグルOFF）が効かなくなるため除外する */
      if (node.textContent.length === 0) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && p.closest('.body-img, .line-mark, .current-line-hl')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}
function firstTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (const child of el.childNodes) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}
function lastTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (let i = el.childNodes.length - 1; i >= 0; i--) {
    const found = lastTextNode(el.childNodes[i]);
    if (found) return found;
  }
  return null;
}

/* 要素をアンラップする(自身を取り除き、子だけを親の位置に残す) */
function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}
const isAnyFormatEl = el => el.tagName === 'B' || el.tagName === 'STRONG' || el.tagName === 'I' || el.tagName === 'EM' || (el.dataset && el.dataset.fmt);
const isFmtType = type => el => !!(el.dataset && el.dataset.fmt === type);

/* 分割・解除の結果、中身が空になった書式要素を取り除く。残しておくと
   保存データに [color=#xxxxxx][/color] のような空タグとして書き出されてしまう。
   <br> や画像を含むものは行構造を保つため残す */
function pruneEmptyFormatEls() {
  for (const el of $$('[data-fmt], b, strong, i, em', refs.bodyInput)) {
    if (el.closest('.body-img')) continue;
    if (el.textContent.length === 0 && !el.querySelector('br, img, .body-img')) el.remove();
  }
}

/* 選択の境界でテキストノードを分割し、選択範囲がノードの境界にちょうど
   揃うようにする。こうしておくと「選択した文字だけ」を単位に扱える */
function isolateRangeText(range) {
  const sc = range.startContainer, so = range.startOffset;
  const ec = range.endContainer, eo = range.endOffset;
  if (ec.nodeType === Node.TEXT_NODE && eo > 0 && eo < ec.textContent.length) ec.splitText(eo);
  if (sc.nodeType === Node.TEXT_NODE && so > 0 && so < sc.textContent.length) {
    const mid = sc.splitText(so);
    range.setStart(mid, 0);
    if (sc === ec) range.setEnd(mid, mid.textContent.length);
  }
}

/* el を child の前後で分割し、el 自身には child だけが残るようにする。
   前後に内容があれば el と同じ書式のコピーを作ってそちらへ移すので、
   選択範囲外の文字には書式が残る */
function splitElementAroundChild(el, child) {
  const parent = el.parentNode;
  const before = [], after = [];
  let seen = false;
  for (const n of [...el.childNodes]) {
    if (n === child) { seen = true; continue; }
    (seen ? after : before).push(n);
  }
  if (before.length) {
    const b = el.cloneNode(false);
    before.forEach(n => b.appendChild(n));
    parent.insertBefore(b, el);
  }
  if (after.length) {
    const a = el.cloneNode(false);
    after.forEach(n => a.appendChild(n));
    parent.insertBefore(a, el.nextSibling);
  }
}

/* node を、predicate に一致する祖先の外へ取り出す。間にある一致しない要素
   (色を消すときの <b> など)は保ったまま、一致する要素だけを剥がす */
function liftNodeOutOfFormats(node, predicate) {
  for (;;) {
    let outermost = null;
    let el = node.parentNode;
    while (el && el !== refs.bodyInput) {
      if (el.nodeType === Node.ELEMENT_NODE && predicate(el)) outermost = el;
      el = el.parentNode;
    }
    if (!outermost) return;
    /* node から outermost までの経路を、node だけを含む状態に分割してから剥がす */
    let cur = node;
    while (cur.parentNode !== outermost) {
      splitElementAroundChild(cur.parentNode, cur);
      cur = cur.parentNode;
    }
    splitElementAroundChild(outermost, cur);
    unwrapElement(outermost);
  }
}

/* 選択範囲の「文字だけ」から、predicate に一致する書式を取り除く。
   従来は書式要素を丸ごとアンラップしていたため、要素の一部だけを選んで
   解除すると選択外の文字まで書式が外れ、逆に解除したいのに外れないという
   状態が起きていた。境界で分割してから祖先を剥がすことで、選択した範囲に
   だけ正確に効かせる。
   戻り値は処理した内容を指す Range（呼び出し側で選択を復元するため）。 */
function clearFormatInRange(range, predicate) {
  isolateRangeText(range);
  const nodes = getSelectedTextNodesInRange(range).filter(n => {
    const nr = document.createRange();
    nr.selectNodeContents(n);
    return range.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 &&
           range.compareBoundaryPoints(Range.END_TO_END, nr) >= 0;
  });
  if (nodes.length === 0) return null;
  for (const n of nodes) liftNodeOutOfFormats(n, predicate);
  pruneEmptyFormatEls();
  const last = nodes[nodes.length - 1];
  const r = document.createRange();
  r.setStart(nodes[0], 0);
  r.setEnd(last, last.textContent.length);
  return r;
}

/* 選択範囲に含まれる各テキストノードを個別に makeEl() の要素で包む。
   単一の要素で選択範囲全体を包もうとすると(Range.surroundContents)、
   複数行(複数の <div>)にまたがる選択で例外になるため、テキストノード単位で
   処理することで行構造を壊さずに書式を適用できるようにしている。

   fmtType を渡した場合(文字サイズ・文字色・ハイライトのような「値を持つ」
   書式)は、包む前に選択範囲から同じ種類の書式を取り除く。こうしないと
   適用のたびにラッパーが入れ子で積み重なり、見た目は新しい値で上書きされて
   いても外側の古いラッパー(例: 大きいフォントサイズ)が行の高さなどに影響し
   続け、値を戻しても元に戻らない状態になる */
function applyInlineFormat(makeEl, fmtType) {
  if (!restoreBodySelection()) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  const sel = window.getSelection();
  let range = sel.getRangeAt(0);
  if (getSelectedTextNodesInRange(range).length === 0) {
    toast('書式を適用するテキストを選択してください', 'info'); return;
  }
  /* 同種の書式を先に剥がしてから包み直す（入れ子の蓄積を防ぐ） */
  if (fmtType) {
    const cleared = clearFormatInRange(range, isFmtType(fmtType));
    if (cleared) {
      range = cleared;
      sel.removeAllRanges();
      sel.addRange(range);
    }
  }
  const textNodes = getSelectedTextNodesInRange(range);
  if (textNodes.length === 0) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  /* extractContents/insertNode で先に処理したノードが Range の境界を
     書き換えてしまう(DOM の仕様上の自動調整)前に、境界点を固定値として控えておく */
  const startContainer = range.startContainer, startOffset = range.startOffset;
  const endContainer = range.endContainer, endOffset = range.endOffset;
  const wrapped = [];
  for (const node of textNodes) {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    if (node === startContainer) nodeRange.setStart(node, startOffset);
    if (node === endContainer) nodeRange.setEnd(node, endOffset);
    if (nodeRange.collapsed) continue;
    const extracted = nodeRange.extractContents();
    const el = makeEl();
    el.appendChild(extracted);
    nodeRange.insertNode(el);
    wrapped.push(el);
  }
  if (wrapped.length === 0) return;
  /* 選択の境界は実テキストノード基準にする。setStartBefore/setEndAfter の
     ような要素基準の境界は、折りたたんだ Range の getClientRects() が
     空配列を返すことがあり(文字境界でない collapsed Range の既知の癖)、
     カーソルハイライト側のフォールバックが要素全体の矩形を拾って
     異常に大きな帯が表示される不具合につながる */
  const newRange = document.createRange();
  const startText = firstTextNode(wrapped[0]);
  const endText = lastTextNode(wrapped[wrapped.length - 1]);
  if (startText && endText) {
    newRange.setStart(startText, 0);
    newRange.setEnd(endText, endText.textContent.length);
  } else {
    newRange.setStartBefore(wrapped[0]);
    newRange.setEndAfter(wrapped[wrapped.length - 1]);
  }
  sel.removeAllRanges();
  sel.addRange(newRange);
  savedBodyRange = newRange.cloneRange();
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); updateFormatToolbarState();
}

/* 太字・斜体用のトグル。選択範囲が(部分的にでも)未適用のテキストを含んでいれば
   全体に適用し、選択範囲がすでに全て適用済みなら解除する。既に適用済みの部分は
   二重に包まない(入れ子の蓄積を防ぐ) */
function toggleTagFormat(matchTag, makeEl) {
  if (!restoreBodySelection()) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  const textNodes = getSelectedTextNodesInRange(range);
  if (textNodes.length === 0) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  const hasAncestor = node => {
    let el = node.parentElement;
    while (el && el !== refs.bodyInput) {
      if (matchTag(el)) return true;
      el = el.parentElement;
    }
    return false;
  };
  /* 選択範囲がすべて適用済みなら解除する。選択した文字だけに効かせるため、
     要素を丸ごとアンラップせず範囲単位で剥がす */
  if (textNodes.every(hasAncestor)) {
    const cleared = clearFormatInRange(range, matchTag);
    if (cleared) {
      sel.removeAllRanges();
      sel.addRange(cleared);
      savedBodyRange = cleared.cloneRange();
    }
    markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); updateFormatToolbarState();
    return;
  }
  const startContainer = range.startContainer, startOffset = range.startOffset;
  const endContainer = range.endContainer, endOffset = range.endOffset;
  const wrapped = [];
  for (const node of textNodes) {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    if (node === startContainer) nodeRange.setStart(node, startOffset);
    if (node === endContainer) nodeRange.setEnd(node, endOffset);
    if (nodeRange.collapsed) continue;
    if (hasAncestor(node)) { wrapped.push(node); continue; }
    const extracted = nodeRange.extractContents();
    const el = makeEl();
    el.appendChild(extracted);
    nodeRange.insertNode(el);
    wrapped.push(el);
  }
  if (wrapped.length === 0) return;
  const newRange = document.createRange();
  const startText = firstTextNode(wrapped[0]);
  const endText = lastTextNode(wrapped[wrapped.length - 1]);
  if (startText && endText) {
    newRange.setStart(startText, 0);
    newRange.setEnd(endText, endText.textContent.length);
  } else {
    newRange.setStartBefore(wrapped[0]);
    newRange.setEndAfter(wrapped[wrapped.length - 1]);
  }
  sel.removeAllRanges();
  sel.addRange(newRange);
  savedBodyRange = newRange.cloneRange();
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); updateFormatToolbarState();
}

/* 選択した文字だけから、predicate に一致する書式を解除する。
   選択範囲が書式要素の一部でも、その範囲だけを正確に解除する */
function clearFormatMatching(predicate, emptyMessage) {
  if (!restoreBodySelection()) { toast('書式を解除するテキストを選択してください', 'info'); return; }
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  const textNodes = getSelectedTextNodesInRange(range);
  const hasTarget = textNodes.some(node => {
    let el = node.parentElement;
    while (el && el !== refs.bodyInput) {
      if (predicate(el)) return true;
      el = el.parentElement;
    }
    return false;
  });
  if (!hasTarget) { toast(emptyMessage, 'info'); return; }
  const cleared = clearFormatInRange(range, predicate);
  if (cleared) {
    sel.removeAllRanges();
    sel.addRange(cleared);
    savedBodyRange = cleared.cloneRange();
  }
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); updateFormatToolbarState();
}
function clearFormatType(fmtType, emptyMessage) {
  clearFormatMatching(isFmtType(fmtType), emptyMessage);
}
/* 選択範囲を既定の書式（黒・標準サイズ・太さ普通）に戻す。
   本文エディタの地の書式がそのまま既定値なので、インライン書式を
   すべて取り除けば既定に戻る */
function resetFormatToDefault() {
  if (!restoreBodySelection()) { toast('標準に戻すテキストを選択してください', 'info'); return; }
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  if (getSelectedTextNodesInRange(range).length === 0) {
    toast('標準に戻すテキストを選択してください', 'info'); return;
  }
  const cleared = clearFormatInRange(range, isAnyFormatEl);
  if (cleared) {
    sel.removeAllRanges();
    sel.addRange(cleared);
    savedBodyRange = cleared.cloneRange();
  }
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); updateFormatToolbarState();
  toast('標準の書式（黒・標準サイズ・太さ普通）に戻しました', 'success');
}

/* ============================================================
   本文中のリンク（挿入・編集・解除）
   ============================================================ */
/* キャレット位置が既存のリンクの中にあればその <a> を返す */
function currentLinkEl() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const node = sel.getRangeAt(0).startContainer;
  let el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (el && el !== refs.bodyInput) {
    if (el.tagName === 'A' && el.dataset && el.dataset.fmt === 'link') return el;
    el = el.parentElement;
  }
  return null;
}

async function insertOrEditLink() {
  const existing = currentLinkEl();
  const sel = window.getSelection();
  /* ダイアログを開くとフォーカスが移り選択が失われるため、
     キャレット位置（折りたたんだ選択）も含めてここで控えておく */
  let savedRange = null;
  if (sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
  const selText = sel && !sel.isCollapsed ? sel.toString() : '';
  const res = await dialog({
    title: existing ? 'リンクを編集' : 'リンクを挿入',
    message: 'スキームを省略した場合は https:// を補います。メールアドレスは mailto: になります。',
    fields: [
      { name: 'url',  label: 'URL', value: existing ? existing.getAttribute('href') : '', placeholder: 'example.com/page' },
      { name: 'text', label: '表示する文字', value: existing ? existing.textContent : selText, placeholder: 'リンクの文字' },
    ],
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      ...(existing ? [{ label: 'リンクを解除', value: 'unlink', kind: 'danger' }] : []),
      { label: existing ? '更新' : '挿入', value: 'ok', kind: 'primary' },
    ],
  });
  const action = res && res.value;
  if (!action || action === 'cancel') return;

  if (action === 'unlink') {
    if (existing) {
      unwrapElement(existing);
      markDirty(); renderCharCount(); rebuildLineMarksDebounced();
      toast('リンクを解除しました', 'info');
    }
    return;
  }
  const url = safeLinkUrl(res.fields.url);
  if (!url) { toast('URL を確認してください（http / https / mailto のみ使えます）', 'error'); return; }
  const text = res.fields.text.trim() || url;

  const a = createFormatElement('link', url);
  a.textContent = text;
  if (existing) {
    existing.replaceWith(a);
  } else {
    refs.bodyInput.focus();
    let range = savedRange;
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(refs.bodyInput);
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(a);
  }
  placeCaretAfter(a);
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight();
  toast(existing ? 'リンクを更新しました' : 'リンクを挿入しました', 'success');
}

function openLinkAt(el) {
  const url = el && el.getAttribute('href');
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

/* 書式ツールバーの有効/無効・太字イタリックのアクティブ表示を、現在の
   選択状態に合わせて更新する */
function updateFormatToolbarState() {
  /* ボタンを disabled にして選択の有無でクリック可否を切り替える設計も検討したが、
     select/color ピッカーを開く操作中に selectionchange が挟まると、
     mousedown と click の間でボタンが disabled になり click 自体が
     発火しなくなる競合が起こり得るため採用しない。選択が無い状態での
     クリックは各アクション側で trap し、トーストで案内する */
  const sel = window.getSelection();
  const focused = document.activeElement === refs.bodyInput && sel && sel.rangeCount > 0 &&
    refs.bodyInput.contains(sel.getRangeAt(0).commonAncestorContainer);
  let inBold = false, inItalic = false;
  if (focused) {
    const node = sel.anchorNode;
    let el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
    while (el && el !== refs.bodyInput) {
      if (el.tagName === 'B' || el.tagName === 'STRONG') inBold = true;
      if (el.tagName === 'I' || el.tagName === 'EM') inItalic = true;
      el = el.parentElement;
    }
  }
  refs.btnBold.classList.toggle('active', inBold);
  refs.btnItalic.classList.toggle('active', inItalic);
}

/* 折りたたみセクションの開閉状態（メニューを開き直しても保つ） */
const ctxOpenSections = new Set();
function buildCtxMenu(ctx) {
  const now = Date.now();
  const { hasSel, onLink } = ctx;
  /* 文字色のパレット。「既定」は色指定そのものを外すので、本文の地の色
     （黒）に正確に戻る。#000000 を当てると地の色とわずかに違う色になる */
  const COLORS = [
    { act: 'colorReset',      label: '既定（黒）', swatch: '#243038', reset: true },
    { act: 'color:#C0392B',   label: '赤',        swatch: '#C0392B' },
    { act: 'color:#D35400',   label: '橙',        swatch: '#D35400' },
    { act: 'color:#1E8449',   label: '緑',        swatch: '#1E8449' },
    { act: 'color:#1F6FB2',   label: '青',        swatch: '#1F6FB2' },
    { act: 'color:#7D3C98',   label: '紫',        swatch: '#7D3C98' },
  ];
  const sections = [
    { items: [
      { act: 'clipCut',   icon: 'fa-scissors',      label: '切り取り', keys: 'Ctrl+X', need: true },
      { act: 'clipCopy',  icon: 'fa-copy',          label: 'コピー',   keys: 'Ctrl+C', need: true },
      { act: 'clipPaste', icon: 'fa-paste',         label: '貼り付け', keys: 'Ctrl+V' },
    ]},
    { head: '書式', items: [
      { act: 'fmtBold',   icon: 'fa-bold',   label: '太字',   keys: '切替', need: true },
      { act: 'fmtItalic', icon: 'fa-italic', label: '斜体',   keys: '切替', need: true },
    ], sizes: [
      { act: 'size12', label: '小' },
      { act: 'size15', label: '標準' },
      { act: 'size19', label: '大' },
      { act: 'size24', label: '特大' },
      { act: 'size32', label: '最大' },
    ], colors: COLORS, after: [
      { act: 'fmtReset', icon: 'fa-rotate-left', label: '標準に戻す', need: true,
        title: '黒・標準サイズ・太さ普通に戻します' },
    ]},
    { head: 'リンク・画像', items: [
      { act: 'linkEdit', icon: 'fa-link', label: onLink ? 'リンクを編集…' : 'リンクを挿入…' },
      ...(onLink ? [
        { act: 'linkOpen',  icon: 'fa-arrow-up-right-from-square', label: 'リンクを開く' },
        { act: 'linkUnset', icon: 'fa-link-slash',                 label: 'リンクを解除' },
      ] : []),
      { act: 'addImage', icon: 'fa-image', label: '画像を挿入…' },
    ]},
    { head: '挿入', collapsible: 'insert', items: [
      { act: 'insDate',     icon: 'fa-calendar-day',   label: '日付',   hint: fmtDate(now) },
      { act: 'insTime',     icon: 'fa-clock',          label: '時刻',   hint: fmtTime(now) },
      { act: 'insDateTime', icon: 'fa-calendar-check', label: '日時' },
      { act: 'insBullet',   icon: 'fa-list-ul',        label: '箇条書き「・」' },
      { act: 'insCheck',    icon: 'fa-square-check',   label: 'チェックボックス' },
      { act: 'insRule',     icon: 'fa-grip-lines',     label: '区切り線' },
    ]},
    { head: '文字の変換', collapsible: 'convert', items: [
      { act: 'wrapKagi',  icon: 'fa-quote-left', label: '「」で囲む' },
      { act: 'wrapParen', icon: 'fa-quote-left', label: '（）で囲む' },
      { act: 'toHalf',    icon: 'fa-down-left-and-up-right-to-center',   label: '全角 → 半角', need: true },
      { act: 'toFull',    icon: 'fa-up-right-and-down-left-from-center', label: '半角 → 全角', need: true },
      { act: 'count',     icon: 'fa-calculator', label: '文字数を数える', need: true },
    ]},
  ];

  const renderItems = list => list.map(it => {
    const dis = it.need && !hasSel ? ' disabled' : '';
    return `<button class="ctx-item" data-act="${it.act}"${dis}` +
      (it.title ? ` title="${esc(it.title)}"` : '') + `>` +
      `<i class="fa-solid ${it.icon}"></i><span class="ctx-label">${esc(it.label)}</span>` +
      (it.keys ? `<span class="ctx-keys">${esc(it.keys)}</span>` : '') +
      (it.hint ? `<span class="ctx-hint mono">${esc(it.hint)}</span>` : '') +
      `</button>`;
  }).join('');

  let html = '';
  sections.forEach((s, si) => {
    if (si > 0) html += '<div class="ctx-sep"></div>';
    /* 使用頻度の低いまとまりは折りたたんでおき、メニュー全体を短く保つ */
    if (s.collapsible) {
      const open = ctxOpenSections.has(s.collapsible);
      html += `<button class="ctx-fold${open ? ' open' : ''}" data-fold="${s.collapsible}">` +
        `<i class="fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>` +
        `<span>${s.head}</span></button>`;
      if (!open) return;
      html += `<div class="ctx-foldbody">${renderItems(s.items)}</div>`;
      return;
    }
    if (s.head) html += `<div class="ctx-head">${s.head}</div>`;
    if (s.items) html += renderItems(s.items);
    if (s.sizes) {
      const dis = hasSel ? '' : ' disabled';
      html += `<div class="ctx-row-label">文字サイズ</div><div class="ctx-row">` +
        s.sizes.map(it => `<button class="ctx-size" data-act="${it.act}"${dis}>${it.label}</button>`).join('') +
        `</div>`;
    }
    if (s.colors) {
      const dis = hasSel ? '' : ' disabled';
      html += `<div class="ctx-row-label">文字色</div><div class="ctx-row ctx-row--colors">` +
        s.colors.map(c =>
          `<button class="ctx-swatch${c.reset ? ' is-reset' : ''}" data-act="${c.act}"${dis}` +
          ` title="${esc(c.label)}" style="--sw:${c.swatch}"></button>`).join('') +
        `</div>`;
    }
    if (s.after) html += renderItems(s.after);
  });
  return html;
}

let ctxLinkEl = null;   /* メニューを開いた時点のリンク要素 */
function openCtxMenu(x, y) {
  const sel = window.getSelection();
  const inEditor = sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).startContainer);
  ctxRange = inEditor ? sel.getRangeAt(0).cloneRange() : null;
  ctxLinkEl = inEditor ? currentLinkEl() : null;
  const hasSel = !!(inEditor && !sel.isCollapsed && sel.toString().length > 0);
  renderCtxMenu({ hasSel, onLink: !!ctxLinkEl });
  refs.ctxMenu.hidden = false;
  positionCtxMenu(x, y);
}
/* 折りたたみの開閉でメニューの高さが変わるため、描画と位置決めを分けておく */
let ctxState = { hasSel: false, onLink: false };
function renderCtxMenu(state) {
  if (state) ctxState = state;
  refs.ctxMenu.innerHTML = buildCtxMenu(ctxState);
}
function positionCtxMenu(x, y) {
  const mw = refs.ctxMenu.offsetWidth, mh = refs.ctxMenu.offsetHeight;
  const px = Math.min(x, window.innerWidth - mw - 8);
  const py = Math.min(y, window.innerHeight - mh - 8);
  refs.ctxMenu.style.left = Math.max(8, px) + 'px';
  refs.ctxMenu.style.top  = Math.max(8, py) + 'px';
}
function hideCtxMenu() { if (!refs.ctxMenu.hidden) refs.ctxMenu.hidden = true; }

function runCtxAction(act) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (ctxRange) { try { sel.removeAllRanges(); sel.addRange(ctxRange); } catch {} }
  const selText = sel ? sel.toString() : '';
  const now = Date.now();
  switch (act) {
    case 'insDate':     insertBodyText(fmtDate(now)); break;
    case 'insTime':     insertBodyText(fmtTime(now)); break;
    case 'insDateTime': insertBodyText(fmtDateTime(now)); break;
    case 'insBullet':   insertBodyText('・'); break;
    case 'insCheck':    insertBodyText('☐ '); break;
    case 'insRule':     insertBodyText('\n──────────────\n'); break;
    case 'wrapKagi':    selText ? replaceSelection('「' + selText + '」') : insertBodyText('「」', 1); break;
    case 'wrapParen':   selText ? replaceSelection('（' + selText + '）') : insertBodyText('（）', 1); break;
    case 'toHalf':      if (selText) replaceSelection(toHalfWidth(selText)); break;
    case 'toFull':      if (selText) replaceSelection(toFullWidth(selText)); break;
    case 'count':       toast(`選択中の文字数：${selText.length} 文字`, 'info'); break;
    case 'addImage':    refs.fileInput.click(); break;
    case 'fmtBold':     runCtxFormat(() => toggleTagFormat(
                          el => el.tagName === 'B' || el.tagName === 'STRONG',
                          () => document.createElement('b'))); break;
    case 'fmtItalic':   runCtxFormat(() => toggleTagFormat(
                          el => el.tagName === 'I' || el.tagName === 'EM',
                          () => document.createElement('i'))); break;
    case 'sizeReset':   runCtxFormat(() => clearFormatType('size', '選択範囲に文字サイズは設定されていません')); break;
    case 'fmtReset':    runCtxFormat(resetFormatToDefault); break;
    case 'colorReset':  runCtxFormat(() => clearFormatType('color', '選択範囲に文字色は設定されていません')); break;
    case 'clipCut':     clipboardCut(selText); break;
    case 'clipCopy':    clipboardCopy(selText); break;
    case 'clipPaste':   clipboardPaste(); break;
    case 'linkEdit':    insertOrEditLink(); break;
    case 'linkOpen':    openLinkAt(ctxLinkEl); break;
    case 'linkUnset':
      if (ctxLinkEl) {
        unwrapElement(ctxLinkEl);
        markDirty(); renderCharCount(); rebuildLineMarksDebounced();
        toast('リンクを解除しました', 'info');
      }
      break;
    default:
      if (/^size\d+$/.test(act)) {
        const px = act.slice(4);
        runCtxFormat(() => applyInlineFormat(() => createFormatElement('size', px), 'size'));
      } else if (act.startsWith('color:')) {
        const hex = act.slice(6);
        runCtxFormat(() => applyInlineFormat(() => createFormatElement('color', hex), 'color'));
      }
  }
  hideCtxMenu();
}

/* ============================================================
   クリップボード（右クリックメニューの 切り取り／コピー／貼り付け）
   ============================================================ */
async function clipboardCopy(selText) {
  if (!selText) { toast('コピーする範囲を選択してください', 'info'); return; }
  try {
    await navigator.clipboard.writeText(selText);
    toast('コピーしました', 'success');
  } catch {
    /* 権限が無い環境では execCommand にフォールバックする */
    if (document.execCommand('copy')) toast('コピーしました', 'success');
    else toast('コピーできませんでした。Ctrl+C をお使いください', 'error');
  }
}
async function clipboardCut(selText) {
  if (!selText) { toast('切り取る範囲を選択してください', 'info'); return; }
  try {
    await navigator.clipboard.writeText(selText);
  } catch {
    if (!document.execCommand('cut')) {
      toast('切り取れませんでした。Ctrl+X をお使いください', 'error');
      return;
    }
    markDirty(); renderCharCount(); rebuildLineMarksDebounced();
    toast('切り取りました', 'success');
    return;
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) sel.getRangeAt(0).deleteContents();
  markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight();
  toast('切り取りました', 'success');
}
async function clipboardPaste() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    /* 読み取りはブラウザの許可が必要。拒否された場合はショートカットを案内する */
    toast('貼り付けは Ctrl+V をお使いください（ブラウザの制限のため）', 'info');
    return;
  }
  if (!text) { toast('クリップボードに文字がありません', 'info'); return; }
  insertBodyText(text);
  rebuildLineMarksDebounced(); updateCursorHighlight();
}

/* 書式系のアクションは savedBodyRange を参照するため、メニューを開いた時点の
   選択範囲(runCtxAction 冒頭で復元済み)をここで退避してから実行する */
function runCtxFormat(fn) {
  if (!captureBodySelection()) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  fn();
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
      if (r.isFinal) insertBodyText(r[0].transcript);
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
function switchMgmtSection(section) {
  const isFormats = section === 'formats';
  refs.mgmtNavFormats.classList.toggle('active', isFormats);
  refs.mgmtNavTags.classList.toggle('active', !isFormats);
  refs.mgmtSectionFormats.hidden = !isFormats;
  refs.mgmtSectionTags.hidden = isFormats;
}
function openManageModal(section) {
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
  const body = serializeBody();
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
  refs.searchInput.addEventListener('input', () => {
    onSearch();
    renderSearchSuggest(refs.searchInput.value);
  });
  refs.searchInput.addEventListener('focus', () => renderSearchSuggest(refs.searchInput.value));
  refs.searchInput.addEventListener('blur', () => addToHistory(refs.searchInput.value));
  refs.searchInput.addEventListener('keydown', e => {
    if (refs.searchSuggest.hidden) {
      if (e.key === 'Enter') addToHistory(refs.searchInput.value);
      return;
    }
    const items = $$('.search-suggest-item', refs.searchSuggest);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
      updateSuggestActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = Math.max(suggestIndex - 1, -1);
      updateSuggestActive(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestIndex >= 0 && items[suggestIndex]) {
        activateSearchSuggest(items[suggestIndex]);
      } else {
        addToHistory(refs.searchInput.value);
        refs.searchSuggest.hidden = true;
      }
    } else if (e.key === 'Escape') {
      refs.searchSuggest.hidden = true;
      suggestIndex = -1;
    }
  });
  refs.searchSuggest.addEventListener('mousedown', e => e.preventDefault());
  refs.searchSuggest.addEventListener('click', e => {
    const delBtn = e.target.closest('.ssi-del');
    if (delBtn) { e.stopPropagation(); removeHistoryEntry(delBtn.dataset.del); return; }
    const item = e.target.closest('.search-suggest-item');
    if (item) { activateSearchSuggest(item); return; }
    refs.searchSuggest.hidden = true;   /* 見出し等の余白クリックでも閉じる（下の要素を覆ったままにしない） */
  });
  refs.searchClear.addEventListener('click', () => {
    refs.searchInput.value = '';
    state.query = '';
    refs.searchClear.hidden = true;
    renderList();
    refs.searchInput.focus();
  });
  refs.searchScope.addEventListener('click', e => {
    const btn = e.target.closest('.scope-chip');
    if (!btn) return;
    const key = btn.dataset.scope;
    const next = { ...state.searchScope, [key]: !state.searchScope[key] };
    if (!next.title && !next.tags && !next.body) {
      toast('検索対象は1つ以上選択してください', 'info');
      return;
    }
    state.searchScope = next;
    state.query = refs.searchInput.value;   /* デバウンス待ちで未反映の入力値も取り込んでから再検索する */
    refs.searchClear.hidden = state.query.length === 0;
    applySearchScopeState();
    savePref('searchScope', state.searchScope);
    renderList();
  });
  refs.tagBar.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    state.tagFilter = state.tagFilter === tag ? null : tag;
    renderList();
  });

  /* --- 目印（付箋）：一覧の絞り込み／編集中メモへの付け外し --- */
  refs.markBar.addEventListener('click', e => {
    const chip = e.target.closest('.mark-chip');
    if (!chip) return;
    const mk = chip.dataset.mark;
    state.markFilter = state.markFilter === mk ? null : mk;
    renderList();
  });
  refs.markPicker.addEventListener('click', e => {
    if (e.target.closest('.mark-clear')) { setCurrentMark(null); return; }
    const btn = e.target.closest('.mark-btn');
    if (btn) setCurrentMark(btn.dataset.mark);
  });

  /* --- 一覧 → グループ折りたたみ／メモを開く --- */
  refs.memoList.addEventListener('click', async e => {
    /* 「他 N 件を表示」は折りたたみ中にのみ出るため、見出しと同じトグルで
       そのまま展開になる */
    const toggle = e.target.closest('.date-group-header, .group-rest');
    if (toggle) {
      const date = toggle.dataset.date;
      if (state.expandedGroups.has(date)) state.expandedGroups.delete(date);
      else state.expandedGroups.add(date);
      renderList();
      return;
    }
    const item = e.target.closest('.memo-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    if (id === state.currentId) return;
    if (await guardDirty()) openMemo(id);
  });

  /* --- 新規・管理画面（フォーマット／タグ） --- */
  refs.btnNew.addEventListener('click', async () => { if (await guardDirty()) newMemo(); });
  refs.btnWelcomeNew.addEventListener('click', () => newMemo());
  refs.btnManage.addEventListener('click', () => openManageModal('formats'));
  refs.btnWelcomeFmt.addEventListener('click', () => openManageModal('formats'));
  refs.mgmtNavFormats.addEventListener('click', () => switchMgmtSection('formats'));
  refs.mgmtNavTags.addEventListener('click', () => switchMgmtSection('tags'));
  refs.mgmtClose.addEventListener('click', () => { refs.manageModal.hidden = true; });
  refs.manageModal.addEventListener('click', e => { if (e.target === refs.manageModal) refs.manageModal.hidden = true; });

  /* --- タグ管理 --- */
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
  const searchBoxEl = refs.searchInput.closest('.search-box');
  document.addEventListener('click', e => {
    if (!refs.tagsSuggest.contains(e.target) && e.target !== refs.tagsInput) {
      refs.tagsSuggest.hidden = true;
    }
    /* searchClear など .search-box 内のクリックでは閉じない
       （clear ボタンの focus() 呼び出しで再表示された直後に、
       同じクリックのバブリングで閉じてしまうのを防ぐ） */
    if (!searchBoxEl.contains(e.target)) {
      refs.searchSuggest.hidden = true;
      suggestIndex = -1;
    }
  });

  refs.bodyInput.addEventListener('input', () => { markDirty(); renderCharCount(); rebuildLineMarksDebounced(); updateCursorHighlight(); });
  refs.bodyInput.addEventListener('keydown', e => {
    /* Enter などブラウザ既定の編集操作は、キャレット直後にある要素を
       「続きの内容」とみなして分割構造に巻き込むことがある。カーソル行
       ハイライトは表示専用のオーバーレイなので、キー処理の前に一旦取り除いて
       おく（input/selectionchange のタイミングで直後に作り直される）。 */
    refs.bodyInput.querySelector('.current-line-hl')?.remove();
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      insertBodyText('\t');
    }
  });
  /* ホバー中の画像のコントロールバー位置を実測して追従させる */
  refs.bodyInput.addEventListener('mouseover', e => {
    const wrap = e.target.closest('.body-img');
    if (wrap) positionImgCtrl(wrap);
  });
  refs.bodyInput.addEventListener('scroll', () => {
    const hovered = refs.bodyInput.querySelector('.body-img:hover');
    if (hovered) positionImgCtrl(hovered);
    updateCursorHighlight();
  }, { passive: true });
  /* カーソル位置ハイライト: フォーカス中は選択範囲の変化を全て追従させる */
  refs.bodyInput.addEventListener('focus', () => { updateCursorHighlight(); updateFormatToolbarState(); });
  refs.bodyInput.addEventListener('blur', () => {
    const hl = refs.bodyInput.querySelector('.current-line-hl');
    if (hl) hl.remove();
  });
  document.addEventListener('selectionchange', () => { updateCursorHighlight(); updateFormatToolbarState(); });
  /* 画像コントロールのクリックでキャレットが動かないよう防止／サイズ変更の開始
     ただし <select> は mousedown の既定動作(ドロップダウンを開く)を止めてしまうと
     クリックしても選択肢が開かなくなるため、ここでは対象から除外する */
  refs.bodyInput.addEventListener('mousedown', e => {
    const resizeHandle = e.target.closest('.body-img__resize');
    if (resizeHandle) {
      e.preventDefault();
      const wrap = resizeHandle.closest('.body-img');
      if (wrap) startImageResize(wrap, e);
      return;
    }
    if (e.target.closest('.body-img__ctrl') && !e.target.closest('.body-img__size')) e.preventDefault();
  });
  refs.bodyInput.addEventListener('dblclick', e => {
    const wrap = e.target.closest('.body-img');
    if (!wrap || e.target.closest('.body-img__ctrl') || e.target.closest('.body-img__resize')) return;
    e.preventDefault();
    openInlineImage(wrap);
  });
  refs.bodyInput.addEventListener('click', e => {
    /* 編集領域内のリンクは、通常クリックではキャレット移動を優先し、
       Ctrl(⌘)+クリックで開く */
    const link = e.target.closest('a[data-fmt="link"]');
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openLinkAt(link);
      return;
    }
    const zoomBtn = e.target.closest('.body-img__zoom');
    if (zoomBtn) {
      const wrap = zoomBtn.closest('.body-img');
      if (wrap) openInlineImage(wrap);
      return;
    }
    const copyBtn = e.target.closest('.body-img__copy');
    if (copyBtn) {
      const wrap = copyBtn.closest('.body-img');
      if (wrap) copyInlineImage(wrap);
      return;
    }
    const posBtn = e.target.closest('.body-img__pos');
    if (posBtn) {
      const wrap = posBtn.closest('.body-img');
      if (!wrap) return;
      wrap.dataset.align = posBtn.dataset.a;
      $$('.body-img__pos', wrap).forEach(b => b.classList.toggle('on', b.dataset.a === posBtn.dataset.a));
      markDirty();
      return;
    }
    const delBtn = e.target.closest('.body-img__del');
    if (delBtn) {
      const wrap = delBtn.closest('.body-img');
      if (wrap) { wrap.remove(); markDirty(); renderCharCount(); rebuildLineMarksDebounced(); }
    }
  });
  refs.bodyInput.addEventListener('change', e => {
    const sel = e.target.closest('.body-img__size');
    if (sel) {
      const wrap = sel.closest('.body-img');
      if (wrap) {
        wrap.dataset.size = sel.value;
        const imgEl = wrap.querySelector('.body-img__img');
        if (imgEl) imgEl.style.width = '';   /* プリセット選択時はカスタム幅を解除 */
        markDirty(); renderCharCount(); rebuildLineMarksDebounced();
      }
    }
  });
  /* --- 本文内画像のドラッグ移動（挿入位置をゴーストで可視化） --- */
  refs.bodyInput.addEventListener('dragstart', e => {
    const wrap = e.target.closest('.body-img');
    if (!wrap) return;                                  /* 画像以外は通常動作 */
    if (e.target.closest('.body-img__ctrl') || e.target.closest('.body-img__resize')) { e.preventDefault(); return; }
    draggedImg = wrap;
    e.dataTransfer.effectAllowed = 'move';
    /* ファイルとして扱われないよう内部用データのみ設定 */
    try { e.dataTransfer.setData('application/x-bodyimg', String(wrap.dataset.id)); } catch {}
    /* ドラッグ画像の確定後に元要素を半透明化（スナップショットには影響させない） */
    setTimeout(() => { if (draggedImg) draggedImg.classList.add('dragging'); }, 0);
  });
  refs.bodyInput.addEventListener('dragover', e => {
    if (!draggedImg) return;                            /* 本文内画像の移動時のみ許可 */
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    showDropCaret(e.clientX, e.clientY);                /* 挿入予定位置を可視化 */
  });
  refs.bodyInput.addEventListener('dragleave', e => {
    if (!draggedImg) return;
    if (!refs.bodyInput.contains(e.relatedTarget)) hideDropCaret();
  });
  refs.bodyInput.addEventListener('drop', e => {
    if (!draggedImg) return;
    e.preventDefault();
    const range = caretRangeFromPoint(e.clientX, e.clientY);
    if (range && !draggedImg.contains(range.startContainer)) {
      range.insertNode(draggedImg);
    } else {
      refs.bodyInput.appendChild(draggedImg);
    }
    ensureTrailingEditable();
    placeCaretAfter(draggedImg);
    endImgDrag();
    markDirty(); renderCharCount(); rebuildLineMarksDebounced();
  });
  document.addEventListener('dragend', endImgDrag);

  /* --- 本文エディタの右クリックメニュー（執筆補助） --- */
  refs.bodyInput.addEventListener('contextmenu', e => {
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY);
  });
  refs.ctxMenu.addEventListener('mousedown', e => e.preventDefault());   /* 選択・フォーカス維持 */
  refs.ctxMenu.addEventListener('click', e => {
    /* 折りたたみの見出しはメニューを閉じずに開閉だけ切り替える */
    const fold = e.target.closest('.ctx-fold');
    if (fold) {
      const key = fold.dataset.fold;
      if (ctxOpenSections.has(key)) ctxOpenSections.delete(key);
      else ctxOpenSections.add(key);
      const rect = refs.ctxMenu.getBoundingClientRect();
      renderCtxMenu();
      positionCtxMenu(rect.left, rect.top);
      return;
    }
    const btn = e.target.closest('.ctx-item, .ctx-size, .ctx-swatch');
    if (!btn || btn.disabled) return;
    runCtxAction(btn.dataset.act);
  });
  window.addEventListener('mousedown', e => {
    if (!refs.ctxMenu.hidden && !refs.ctxMenu.contains(e.target)) hideCtxMenu();
  });
  window.addEventListener('resize', hideCtxMenu);
  refs.bodyInput.addEventListener('scroll', hideCtxMenu);

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

  /* --- 改行マークの表示切替 --- */
  refs.btnShowMarks.addEventListener('click', () => {
    state.showLineMarks = !state.showLineMarks;
    applyShowLineMarksState();
    savePref('showLineMarks', state.showLineMarks);
    rebuildLineMarks();
  });

  /* --- 書式設定(太字・斜体・文字サイズ・文字色・ハイライト) ---
     select/color 系コントロールはクリックした瞬間に本文のフォーカス・選択が
     失われるため、開く前(mousedown)に選択範囲を退避しておく */
  refs.btnBold.addEventListener('mousedown', captureBodySelection);
  refs.btnBold.addEventListener('click', () => toggleTagFormat(
    el => el.tagName === 'B' || el.tagName === 'STRONG', () => document.createElement('b')));
  refs.btnItalic.addEventListener('mousedown', captureBodySelection);
  refs.btnItalic.addEventListener('click', () => toggleTagFormat(
    el => el.tagName === 'I' || el.tagName === 'EM', () => document.createElement('i')));
  refs.fontSizeSelect.addEventListener('mousedown', captureBodySelection);
  refs.fontSizeSelect.addEventListener('change', () => {
    const val = refs.fontSizeSelect.value;
    refs.fontSizeSelect.value = '';
    if (!val) return;
    if (val === 'reset') { clearFormatType('size', '選択範囲に文字サイズは設定されていません'); return; }
    applyInlineFormat(() => createFormatElement('size', val), 'size');
  });
  refs.textColorInput.addEventListener('mousedown', captureBodySelection);
  refs.textColorInput.addEventListener('change', () => {
    applyInlineFormat(() => createFormatElement('color', refs.textColorInput.value), 'color');
  });
  refs.btnClearTextColor.addEventListener('mousedown', captureBodySelection);
  refs.btnClearTextColor.addEventListener('click', () => clearFormatType('color', '選択範囲に文字色は設定されていません'));
  refs.highlightColorInput.addEventListener('mousedown', captureBodySelection);
  refs.highlightColorInput.addEventListener('change', () => {
    applyInlineFormat(() => createFormatElement('hl', refs.highlightColorInput.value), 'hl');
  });
  refs.btnClearHighlight.addEventListener('mousedown', captureBodySelection);
  refs.btnClearHighlight.addEventListener('click', () => clearFormatType('hl', '選択範囲にハイライトは設定されていません'));
  refs.btnClearFormat.addEventListener('mousedown', captureBodySelection);
  refs.btnClearFormat.addEventListener('click', resetFormatToDefault);

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
  /* --- 画像パネルの幅をドラッグで調整 --- */
  refs.imgPanelResizer.addEventListener('mousedown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = refs.imgPanel.getBoundingClientRect().width;
    document.body.classList.add('resizing-imgpanel');
    const onMove = ev => {
      state.imgPanelWidth = Math.round(startWidth - (ev.clientX - startX));
      applyImgPanelWidth();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-imgpanel');
      savePref('imgPanelWidth', state.imgPanelWidth);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  window.addEventListener('resize', applyImgPanelWidth);
  refs.btnPanelToggle.addEventListener('click', () => togglePanel(false));
  refs.btnPanelOpen.addEventListener('click', () => togglePanel(true));
  refs.btnSidebarClose.addEventListener('click', toggleSidebar);
  refs.btnSidebarOpen.addEventListener('click', toggleSidebar);

  refs.btnGroupByDate.addEventListener('click', () => {
    state.groupByDate = !state.groupByDate;
    state.expandedGroups.clear();
    applyGroupByDateState();
    savePref('groupByDate', state.groupByDate);
    renderList();
  });
  refs.btnImageFilter.addEventListener('click', () => {
    state.imageOnly = !state.imageOnly;
    applyImageFilterState();
    savePref('imageOnly', state.imageOnly);
    renderList();
  });
  refs.groupFieldSelect.addEventListener('change', () => {
    state.groupDateField = refs.groupFieldSelect.value;
    state.expandedGroups.clear();
    savePref('groupDateField', state.groupDateField);
    renderList();
  });
  refs.btnSortOrder.addEventListener('click', () => {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    applySortDirState();
    savePref('sortDir', state.sortDir);
    renderList();
  });

  /* --- フォーマット管理 --- */
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
      if (!refs.ctxMenu.hidden) { hideCtxMenu(); return; }
      if (!refs.dialogRoot.hidden) { closeDialog('cancel'); return; }
      if (lb.open) { lbClose(); return; }
      if (!refs.manageModal.hidden) { refs.manageModal.hidden = true; return; }
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
  refs.brandVersion.textContent = 'v' + APP_VERSION;
  refs.brandVersion.title = `バージョン ${APP_VERSION}`;
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
  applyImgPanelWidth();
  applyPanelState();
  applySidebarState();
  applyGroupByDateState();
  applySortDirState();
  applySearchScopeState();
  applyImageFilterState();
  applyShowLineMarksState();

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