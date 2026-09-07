/* ============================================================
   core.js
   基盤：ユーティリティ、IndexedDB ラッパー、アプリ状態、要素参照、
   トースト・ダイアログ、設定の永続化
   ============================================================ */
'use strict';

/* アプリのバージョン。更新時はここと CHANGELOG.md を合わせて更新する */
const APP_VERSION = '1.4.2';

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
/* タグチップの HTML。一覧・プレビュー・タグ管理で見た目を揃える */
const tagChip = (name, cls = 'chip chip-s') => `<span class="${cls} ${tagClass(name)}">${esc(name)}</span>`;
/* キーごとの件数を数える共通ヘルパー（タグバー・目印バー・サジェストで共用） */
function countBy(items, keysOf) {
  const counts = new Map();
  for (const item of items) for (const key of keysOf(item)) counts.set(key, (counts.get(key) || 0) + 1);
  return counts;
}
/* 非同期処理を直列化する。処理中にもう一度呼ばれても並行実行させず、
   先行分が終わってから改めて実行する。保存のように「1回目で作られた id を
   2回目が参照する」処理を並行させると、ボタンの連打やキーリピートで
   新規レコードが二重に作られてしまうため、その入口で使う */
function serialized(fn) {
  let last = null;
  return (...args) => {
    const prev = last;
    const run = (async () => {
      if (prev) await prev;
      return fn(...args);
    })();
    last = run.catch(() => {});   /* 失敗しても後続を止めない */
    return run;
  };
}
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
/* 一覧で使う集計。目印は保存データに残った未知の id を無視する */
const countTags  = memos => countBy(memos, m => m.tags || []);
const countMarks = memos => countBy(memos, m => (m.mark && markById(m.mark)) ? [m.mark] : []);

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

/* モーダルを開いたボタンをダブルクリックすると、2回目のクリックが直後に
   現れた背面（オーバーレイ）へ当たり、開いた瞬間に閉じてしまう。開いた直後の
   ごく短い間だけ背面クリックを無視して、これを防ぐ */
const MODAL_GRACE_MS = 400;
const modalOpenedAt = new WeakMap();
function markModalOpened(el) { modalOpenedAt.set(el, performance.now()); }
function backdropClickAllowed(el) { return performance.now() - (modalOpenedAt.get(el) || 0) > MODAL_GRACE_MS; }

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
    markModalOpened(refs.dialogRoot);
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
/* 「キャンセル / 実行」の二択ダイアログ。実行が選ばれたときだけ true を返す */
async function confirmDialog({ title, message, okLabel, kind = 'danger' }) {
  const v = await dialog({
    title, message,
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: okLabel, value: 'ok', kind },
    ],
  });
  return v === 'ok';
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
