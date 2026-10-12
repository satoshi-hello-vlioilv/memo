/* 項目D：エディタ上部（タイトル・日時・目印・タグ） */
const ed = (w, h = 460) => ({ x: 312, y: 0, width: w - 312, height: h });

/* 共通部品：目印をひとつのボタンに、タグをチップ＋入力に、日付を短く */
const KIT = `(() => {
  const cur = state.memos.find(x => x.id === state.currentId) || {};
  const mk = markById(state.currentMark);
  window.__markBtn = (iconOnly = false) => {
    const b = document.createElement('button'); b.className = 'd-markbtn' + (mk ? ' on' : '');
    b.title = '目印を付ける／変える';
    b.innerHTML = mk ? '<i class="fa-solid ' + mk.icon + ' mk-' + mk.id + '"></i>' + (iconOnly ? '' : ' ' + esc(mk.label)) + (iconOnly ? '' : ' <i class="fa-solid fa-chevron-down d-cv"></i>')
                     : '<i class="fa-regular fa-bookmark"></i>' + (iconOnly ? '' : ' 目印 <i class="fa-solid fa-chevron-down d-cv"></i>');
    return b;
  };
  window.__tagEditor = () => {
    const w = document.createElement('div'); w.className = 'd-tags';
    const tags = parseTags(refs.tagsInput.value);
    w.innerHTML = tags.map(t => '<span class="chip ' + tagClass(t) + ' d-chip">' + esc(t) + '<i class="fa-solid fa-xmark"></i></span>').join('');
    const inp = refs.tagsInput; inp.value = ''; inp.placeholder = tags.length ? '＋タグ' : '＋タグを追加'; inp.classList.add('d-inp');
    w.append(inp);
    return w;
  };
  window.__dates = (withCreated = false) => {
    const s = document.createElement('span'); s.className = 'd-dates mono';
    s.title = '作成 ' + fmtDateTime(cur.createdAt) + ' ／ 更新 ' + fmtDateTime(cur.updatedAt);
    s.textContent = (withCreated ? '作成 ' + fmtListDate(cur.createdAt) + '・' : '') + '更新 ' + fmtListDate(cur.updatedAt);
    return s;
  };
  document.querySelector('.meta-row').style.display = 'none';
  document.querySelector('.tags-row').style.display = 'none';
})()`;
const KIT_CSS = `
  .d-markbtn{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;border:1px dashed var(--line-strong);color:var(--text-sub);font-size:12px;white-space:nowrap}
  .d-markbtn.on{border-style:solid;border-color:var(--line);background:var(--paper);color:var(--text)}
  .d-cv{font-size:8px;color:var(--text-sub)}
  .d-tags{display:flex;align-items:center;gap:6px;flex-wrap:wrap;min-width:0;flex:1}
  .d-chip{gap:6px;height:24px;padding:0 6px 0 10px;font-size:11.5px}
  .d-chip i{font-size:9px;opacity:.55}
  .d-inp{border:none;outline:none;background:none;font-size:12.5px;min-width:90px;flex:1;height:26px}
  .d-dates{font-size:11px;color:var(--text-sub);white-space:nowrap;flex-shrink:0}
  .d-row{display:flex;align-items:center;gap:10px;margin:2px 0 12px;min-width:0}
`;

const D0 = { id: 'D0', name: '現行（参考）', css: '' };

const D1 = { id: 'D1', name: 'メタ情報を1行に（目印ボタン・タグのチップ入力・短い更新日時）', css: KIT_CSS, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  row.append(__markBtn(), __tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})()` };

const D2 = { id: 'D2', name: '目印をタイトルの左に（しおり）＋2行目にタグと日時', css: KIT_CSS + `
  .d-titlerow{display:flex;align-items:center;gap:10px}
  .d-titlerow .d-markbtn{width:34px;height:34px;padding:0;justify-content:center;border-radius:8px;font-size:15px}
  .d-titlerow .title-input{flex:1;min-width:0}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const tr = document.createElement('div'); tr.className = 'd-titlerow';
  head.insertBefore(tr, refs.titleInput); tr.append(__markBtn(true), refs.titleInput);
  const row = document.createElement('div'); row.className = 'd-row';
  row.append(__tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})()` };

const D3 = { id: 'D3', name: 'プロパティ表（見出し｜値 の行）', css: KIT_CSS + `
  .d-props{display:grid;grid-template-columns:64px 1fr;gap:6px 12px;align-items:center;margin:4px 0 12px;font-size:12px}
  .d-props > .k{color:var(--text-sub);font-size:11.5px;display:flex;align-items:center;gap:6px}
  .d-props > .k i{width:12px;color:var(--line-strong)}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const g = document.createElement('div'); g.className = 'd-props';
  const k = (i, t) => { const e = document.createElement('span'); e.className = 'k'; e.innerHTML = '<i class="' + i + '"></i>' + t; return e; };
  const v = (...els) => { const e = document.createElement('span'); e.style.display = 'flex'; e.style.gap = '8px'; e.style.alignItems = 'center'; e.style.minWidth = '0'; e.append(...els); return e; };
  g.append(k('fa-regular fa-bookmark', '目印'), v(__markBtn()), k('fa-solid fa-tags', 'タグ'), v(__tagEditor()), k('fa-regular fa-clock', '日時'), v(__dates(true)));
  head.insertBefore(g, refs.mediaStrip);
  if (!refs.btnAddMedia.hidden) g.append(k('fa-solid fa-paperclip', '添付'), v(refs.btnAddMedia));
})()` };

const D4 = { id: 'D4', name: '日時はフッターへ、上部はタイトル＋目印・タグの1行', css: KIT_CSS, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  row.append(__markBtn(), __tagEditor(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
  const fl = document.querySelector('.foot-left'); const d = document.createElement('span'); d.className = 'divider'; fl.append(d, __dates(true));
})()` };

const D5 = { id: 'D5', name: '詳細（日時・目印）は「i」ボタンの中、上部はタイトル＋タグ', css: KIT_CSS + `
  .d-titlerow{display:flex;align-items:center;gap:8px}
  .d-titlerow .title-input{flex:1;min-width:0}
  .d-info{flex-shrink:0;width:30px;height:30px;border-radius:15px;border:1px solid var(--line);color:var(--text-sub)}
  .d-miniMark{font-size:14px}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const tr = document.createElement('div'); tr.className = 'd-titlerow';
  head.insertBefore(tr, refs.titleInput); tr.append(refs.titleInput);
  const mk = markById(state.currentMark);
  if (mk) { const i = document.createElement('i'); i.className = 'd-miniMark fa-solid ' + mk.icon + ' mk-' + mk.id; i.title = mk.label; tr.append(i); }
  const info = document.createElement('button'); info.className = 'd-info'; info.title = '詳細（作成・更新日時、目印）'; info.innerHTML = '<i class="fa-solid fa-info"></i>'; tr.append(info);
  const row = document.createElement('div'); row.className = 'd-row';
  row.append(__tagEditor(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})()` };

/* ↓ 方向性の違う追加案 */
const D6 = { id: 'D6', name: 'タグをタイトルの行の右端に（見出しと分類を一体に）', css: KIT_CSS + `
  .d-titlerow{display:flex;align-items:center;gap:10px}
  .d-titlerow .title-input{flex:1;min-width:120px}
  .d-titlerow .d-tags{flex:0 1 auto;justify-content:flex-end;max-width:45%}
  .d-titlerow .d-inp{min-width:70px;flex:0 0 80px}
  .d-sub{display:flex;align-items:center;gap:12px;margin:0 0 12px}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const tr = document.createElement('div'); tr.className = 'd-titlerow';
  head.insertBefore(tr, refs.titleInput); tr.append(refs.titleInput, __tagEditor());
  const sub = document.createElement('div'); sub.className = 'd-sub';
  sub.append(__markBtn(), __dates(true), refs.btnAddMedia);
  head.insertBefore(sub, refs.mediaStrip);
})()` };

const D7 = { id: 'D7', name: '目印を紙の右上の「付箋」で表す（押して選ぶ）', css: KIT_CSS + `
  .editor-sheet{position:relative}
  .d-note{position:absolute;top:0;right:calc(var(--col) - 4px);z-index:3;width:46px;padding:10px 0 12px;display:flex;flex-direction:column;align-items:center;gap:3px;
    border-radius:0 0 6px 6px;font-size:10px;font-weight:700;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.12)}
  .d-note i{font-size:15px;color:#fff !important}
  .d-note.none{background:transparent;border:1px dashed var(--line-strong);border-top:none;color:var(--text-sub);box-shadow:none}
  .d-note.none i{color:var(--text-sub) !important}
  .sheet-head .title-input{padding-right:60px}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const mk = markById(state.currentMark);
  const colors = { star: '#E0A32E', flag: '#D7614F', check: '#2DA091', hold: '#5A96D7', pin: '#AA78C8', alert: '#C9573F' };
  const n = document.createElement('button'); n.className = 'd-note' + (mk ? '' : ' none'); n.title = '目印を付ける／変える';
  if (mk) n.style.background = colors[mk.id];
  n.innerHTML = mk ? '<i class="fa-solid ' + mk.icon + '"></i>' + esc(mk.label) : '<i class="fa-regular fa-bookmark"></i>目印';
  document.querySelector('.editor-sheet').append(n);
  const row = document.createElement('div'); row.className = 'd-row';
  row.append(__tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})()` };

/* ===== 2回目 ===== */
/* 目印ボタンをタグと見分けられる形に：角丸を小さく、目印の色で左に帯 */
const MARK2_CSS = `
  .d-markbtn{border-radius:6px;height:28px}
  .d-markbtn.on{border-left:3px solid var(--mk, var(--line-strong));padding-left:8px;background:var(--surface)}
  .d-sep{width:1px;height:18px;background:var(--line);flex-shrink:0}
`;
const MARK2_JS = `(() => { const b = document.querySelector('.d-markbtn.on'); const mk = markById(state.currentMark);
  const colors = { star: '#E0A32E', flag: '#D7614F', check: '#2DA091', hold: '#5A96D7', pin: '#AA78C8', alert: '#C9573F' };
  if (b && mk) b.style.setProperty('--mk', colors[mk.id]); })()`;
const D8 = { id: 'D8', name: 'D1＋目印ボタンをタグと見分ける形に（色の帯・区切り線）', css: KIT_CSS + MARK2_CSS, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  const sep = document.createElement('span'); sep.className = 'd-sep';
  row.append(__markBtn(), sep, __tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})();` + MARK2_JS };
const D9 = { id: 'D9', name: '広い画面は右上の付箋、狭い画面は1行の目印ボタン', css: KIT_CSS + MARK2_CSS + D7.css + `
  @media (max-width:1100px){ .d-note{display:none} }
  @media (min-width:1101px){ .d-row .d-markbtn,.d-row .d-sep{display:none} }
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  const sep = document.createElement('span'); sep.className = 'd-sep';
  row.append(__markBtn(), sep, __tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
  const mk = markById(state.currentMark);
  const colors = { star: '#E0A32E', flag: '#D7614F', check: '#2DA091', hold: '#5A96D7', pin: '#AA78C8', alert: '#C9573F' };
  const n = document.createElement('button'); n.className = 'd-note' + (mk ? '' : ' none');
  if (mk) n.style.background = colors[mk.id];
  n.innerHTML = mk ? '<i class="fa-solid ' + mk.icon + '"></i>' + esc(mk.label) : '<i class="fa-regular fa-bookmark"></i>目印';
  document.querySelector('.editor-sheet').append(n);
})();` + MARK2_JS };
const D10 = { id: 'D10', name: 'D1＋小さな見出し（目印／タグ）を添えて1行', css: KIT_CSS + MARK2_CSS + `
  .d-lbl{font-size:10.5px;color:var(--text-sub);flex-shrink:0;letter-spacing:.04em}
`, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  const l = t => { const e = document.createElement('span'); e.className = 'd-lbl'; e.textContent = t; return e; };
  const sep = document.createElement('span'); sep.className = 'd-sep';
  row.append(l('目印'), __markBtn(), sep, l('タグ'), __tagEditor(), __dates(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
})();` + MARK2_JS };
const D11 = { id: 'D11', name: 'D8＋日時はフッターへ（上部は目印とタグだけ）', css: KIT_CSS + MARK2_CSS, js: KIT + `;(() => {
  const head = document.querySelector('.sheet-head');
  const row = document.createElement('div'); row.className = 'd-row';
  const sep = document.createElement('span'); sep.className = 'd-sep';
  row.append(__markBtn(), sep, __tagEditor(), refs.btnAddMedia);
  head.insertBefore(row, refs.mediaStrip);
  const fl = document.querySelector('.foot-left'); const d = document.createElement('span'); d.className = 'divider'; fl.append(d, __dates(true));
})();` + MARK2_JS };

export default {
  key: 'D', compositeHeight: 460,
  shots: [
    { w: 1440, h: 900, key: '1440img', clip: ed(1440) },
    { w: 1440, h: 900, key: '1440none', clip: ed(1440), open: { title: 'アイデア：メモアプリの改善' } },
    { w: 1024, h: 768, key: '1024', clip: ed(1024) },
    { w: 390, h: 844, key: '390', clip: { x: 0, y: 0, width: 390, height: 700 } },
  ],
  rounds: { r1: [D0, D1, D2, D3, D4, D5, D6, D7], r2: [D1, D4, D7, D8, D9, D10, D11] },
  parts: { KIT, KIT_CSS, D1, D2, D3, D4, D5, D6, D7 },
};
