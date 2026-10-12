/* 項目A：アプリの骨格（グローバルヘッダーとペイン配分） */
const D = css => `@media (min-width:769px){${css}}`;

const A0 = { id: 'A0', name: '現行（参考）', css: '' };

const A1 = { id: 'A1', name: 'スリムヘッダー（44px・1行ロゴ）', css: D(`
  :root{--topbar-h:44px}
  .topbar{padding:0 12px 0 8px}
  .brand-sub{display:none}
  .brand-mark{width:26px;height:26px;font-size:11px;border-radius:7px}
  .brand-name{font-size:14px}
  .brand{gap:9px}
  .topbar .btn{height:30px;padding:0 12px;font-size:12.5px}
  .topbar .icon-btn-inv{width:30px;height:30px}
  .sidebar-head{padding:4px 8px 4px 16px}
`) };

const A2 = { id: 'A2', name: 'ヘッダー廃止・サイドバー頭へ集約', css: D(`
  #app.a2,#app.a2.panel-closed{grid-template-rows:1fr}
  #app.a2 .topbar{display:none}
  .a2 .sidebar-head{padding:10px 8px 10px 12px;gap:4px}
  .a2 .sidebar-head .brand{margin-right:auto;gap:9px}
  .a2 .brand-sub{display:none}
  .a2 .brand-mark{width:28px;height:28px;font-size:12px;border-radius:7px}
  .a2 .brand-name{font-size:14.5px}
  .a2 .sidebar-head .btn{height:30px;padding:0 11px;font-size:12.5px}
`), js: `(() => {
  const head = document.querySelector('.sidebar-head');
  document.getElementById('sidebarTitle').replaceWith(document.querySelector('.brand'));
  const more = document.createElement('button');
  more.className = 'icon-btn'; more.title = 'その他（取り込み・書き出し・管理）';
  more.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
  const nb = document.getElementById('btnNew');
  nb.innerHTML = '<i class="fa-solid fa-plus"></i> 新規';
  head.insertBefore(more, document.getElementById('btnTrash'));
  head.insertBefore(nb, document.getElementById('btnSidebarClose'));
  document.getElementById('app').classList.add('a2');
})()` };

const A3 = { id: 'A3', name: '右パネルの自動レール化（中身が無いメモは56px）', css: D(`
  #app.a3-rail,#app.a3-rail.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 56px}
  .a3-rail .imgpanel{display:flex !important}
  .a3-rail #btnPanelOpen{display:none !important}
  .a3-rail .imgpanel > :not(.a3-railbox){display:none !important}
  .a3-railbox{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 0}
  .a3-rb{display:flex;flex-direction:column;align-items:center;gap:3px;width:46px;padding:8px 0;border-radius:8px;color:var(--text-sub);font-size:10.5px}
  .a3-rb i{font-size:16px}
  .a3-rb b{font-family:var(--font-mono);font-size:10px;font-weight:600;background:var(--paper-deep);border-radius:8px;padding:0 6px}
`), js: `(() => {
  const empty = state.images.length === 0 && state.attachments.length === 0;
  if (!empty) return;
  document.getElementById('app').classList.add('a3-rail');
  const rail = document.createElement('div'); rail.className = 'a3-railbox';
  rail.innerHTML = '<button class="a3-rb" title="画像を追加"><i class="fa-regular fa-images"></i><span>画像</span><b>0</b></button>' +
    '<button class="a3-rb" title="ファイルを添付"><i class="fa-solid fa-paperclip"></i><span>添付</span><b>0</b></button>';
  document.getElementById('imgPanel').appendChild(rail);
})()` };

const A4 = { id: 'A4', name: 'エディタ全面シート（枠なし・左右パネル細身）', css: D(`
  :root{--imgpanel-w:300px;--sidebar-w:312px}
  .editor-sheet{margin:0;width:100%;border:none;border-radius:0;box-shadow:none}
  .sheet-head{border-top:none;padding:16px 32px 0}
  .toolbar{padding:6px 26px}
  .body-editable{padding:14px 32px 16px}
  .sheet-foot{padding:8px 32px}
`) };

const A5 = { id: 'A5', name: 'ヘッダーに検索を集約（一覧の上を空ける）', css: D(`
  .a5 .sidebar-head{display:none}
  .a5 .topbar .a5-search{flex:0 1 560px;margin:0 24px}
  .a5 .search-scope{margin-top:12px}
  .a5 .topbar #btnTrash{color:var(--inv-text);width:34px;height:34px}
`), js: `(() => {
  const tb = document.querySelector('.topbar');
  const sb = document.querySelector('.search-box');
  sb.classList.add('a5-search');
  tb.insertBefore(sb, document.querySelector('.topbar-actions'));
  const acts = document.querySelector('.topbar-actions');
  acts.insertBefore(document.getElementById('btnTrash'), acts.children[1]);
  document.getElementById('app').classList.add('a5');
})()` };

/* ↓ 方向性の違う追加案 */
const A6 = { id: 'A6', name: '2ペイン化：画像・添付はエディタ内の帯へ', css: D(`
  #app.a6,#app.a6.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 0}
  .a6 .imgpanel,.a6 #btnPanelOpen{display:none !important}
  .a6-strip{display:flex;align-items:center;gap:8px;padding:8px 0 10px;overflow-x:auto;border-top:1px dashed var(--line)}
  .a6-strip img{height:44px;width:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line)}
  .a6-lbl{font-size:11.5px;color:var(--text-sub);white-space:nowrap;display:inline-flex;gap:5px;align-items:center}
  .a6-file{display:inline-flex;align-items:center;gap:6px;font-size:12px;padding:5px 9px;border:1px solid var(--line);border-radius:7px;white-space:nowrap;background:var(--paper)}
  .a6-add{width:30px;height:30px;flex-shrink:0;border:1px dashed var(--line-strong);border-radius:6px;color:var(--text-sub)}
  .a6-sep{width:1px;height:26px;background:var(--line);margin:0 4px;flex-shrink:0}
`), js: `(() => {
  document.getElementById('app').classList.add('a6');
  const strip = document.createElement('div'); strip.className = 'a6-strip';
  const imgs = [...document.querySelectorAll('#thumbGrid img')].slice(0, 6).map(i => '<img src="' + i.src + '">').join('');
  const files = state.attachments.map(f => '<span class="a6-file"><i class="fa-regular fa-file-lines"></i>' + esc(f.name) + '</span>').join('');
  strip.innerHTML = '<span class="a6-lbl"><i class="fa-regular fa-images"></i> 画像 ' + state.images.length + '</span>' + imgs +
    '<button class="a6-add" title="画像を追加"><i class="fa-solid fa-plus"></i></button><span class="a6-sep"></span>' +
    '<span class="a6-lbl"><i class="fa-solid fa-paperclip"></i> 添付 ' + state.attachments.length + '</span>' + files +
    '<button class="a6-add" title="ファイルを添付"><i class="fa-solid fa-plus"></i></button>';
  document.querySelector('.sheet-head').appendChild(strip);
})()` };

const A7 = { id: 'A7', name: '左アイコンレール（アプリ型ナビ）', css: D(`
  #app.a7{grid-template-columns:60px var(--sidebar-w) 1fr var(--imgpanel-w);grid-template-rows:0 1fr}
  #app.a7.panel-closed{grid-template-columns:60px var(--sidebar-w) 1fr 0}
  .a7 .topbar{display:none}
  .a7-rail{grid-column:1;grid-row:1/-1;background:var(--ink-950);display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 0;border-right:1px solid var(--ink-line)}
  .a7 .sidebar{grid-column:2;grid-row:2}
  .a7 .editor{grid-column:3;grid-row:2}
  .a7 .imgpanel{grid-column:4;grid-row:2}
  .a7-rail .brand-mark{margin-bottom:10px}
  .a7-btn{display:flex;flex-direction:column;align-items:center;gap:3px;width:48px;padding:7px 0;border-radius:9px;color:var(--inv-sub);font-size:10px}
  .a7-btn i{font-size:16px}
  .a7-primary{background:var(--primary);color:#fff}
`), js: `(() => {
  const app = document.getElementById('app'); app.classList.add('a7');
  const rail = document.createElement('nav'); rail.className = 'a7-rail';
  const mk = (id, icon, label, cls = '') => { const b = document.getElementById(id); b.className = 'a7-btn ' + cls; b.innerHTML = '<i class="' + icon + '"></i><span>' + label + '</span>'; return b; };
  rail.append(document.querySelector('.brand-mark'));
  rail.append(mk('btnNew', 'fa-solid fa-plus', '新規', 'a7-primary'));
  rail.append(mk('btnTrash', 'fa-solid fa-trash-can', 'ゴミ箱'));
  const sp = document.createElement('div'); sp.style.flex = '1'; rail.append(sp);
  rail.append(mk('btnImport', 'fa-solid fa-file-import', '取込'));
  rail.append(mk('btnExport', 'fa-solid fa-file-export', '書出'));
  rail.append(mk('btnManage', 'fa-solid fa-sliders', '管理'));
  app.prepend(rail);
})()` };

/* ===== 2回目：エッセンスの組合せ ===== */
const join = (id, name, parts, extraCss = '', extraJs = '') => ({
  id, name,
  css: parts.map(p => p.css || '').join('\n') + D(extraCss),
  js: parts.filter(p => p.js).map(p => p.js).join(';\n') + (extraJs ? ';\n' + extraJs : ''),
});
const A8 = join('A8', '左レール＋2ペイン（画像・添付はエディタ内の帯）', [A7, A6], `
  #app.a7.a6,#app.a7.a6.panel-closed{grid-template-columns:60px var(--sidebar-w) 1fr 0}
`);
const A9 = join('A9', '左レール＋右パネル自動レール化', [A7, A3], `
  #app.a7.a3-rail,#app.a7.a3-rail.panel-closed{grid-template-columns:60px var(--sidebar-w) 1fr 56px}
`);
const A10 = join('A10', 'スリムヘッダー＋エディタ内の帯＋必要時だけ大きく見るパネル', [A1, A6], `
  .a10-big{margin-left:auto;flex-shrink:0;height:30px;padding:0 10px;border-radius:6px;border:1px solid var(--line);font-size:11.5px;color:var(--text-sub);display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
`, `(() => { const b = document.createElement('button'); b.className = 'a10-big'; b.title = '画像と添付を右側のパネルで大きく表示';
  b.innerHTML = '<i class="fa-solid fa-table-columns"></i> パネルで見る'; document.querySelector('.a6-strip').appendChild(b); })()`);
const A11 = join('A11', 'スリムヘッダー＋右パネル自動レール化＋枠なしシート', [A1, A4, A3]);

/* ===== 3回目：2回目のエッセンス（帯・必要時のパネル・適応表示・枠なし・読みやすい行長）の再構成 ===== */
const COL = D(`
  .editor-sheet{--col:max(28px, calc((100% - 860px) / 2))}
  .sheet-head{padding-left:var(--col);padding-right:var(--col)}
  .toolbar{padding-left:calc(var(--col) - 8px);padding-right:calc(var(--col) - 8px)}
  .body-editable{padding-left:var(--col);padding-right:var(--col)}
  .sheet-foot{padding-left:var(--col);padding-right:var(--col)}
`);
const STRIP_ADAPTIVE = `(() => {
  document.getElementById('app').classList.add('a6');
  const n = state.images.length + state.attachments.length;
  const meta = document.querySelector('.meta-row');
  if (n === 0) {
    const b = document.createElement('button'); b.className = 'a12-add'; b.title = '画像やファイルをこのメモに追加';
    b.innerHTML = '<i class="fa-solid fa-paperclip"></i> 画像・ファイルを追加';
    meta.insertBefore(b, document.getElementById('markPicker')); return;
  }
  const strip = document.createElement('div'); strip.className = 'a6-strip a12-strip';
  const imgs = [...document.querySelectorAll('#thumbGrid img')].slice(0, 8).map(i => '<img src="' + i.src + '">').join('');
  const files = state.attachments.map(f => '<span class="a6-file"><i class="fa-regular fa-file-lines"></i>' + esc(f.name) + '</span>').join('');
  strip.innerHTML = imgs + files + '<button class="a6-add" title="画像・ファイルを追加"><i class="fa-solid fa-plus"></i></button>' +
    '<button class="a10-big" title="右側のパネルで大きく表示"><i class="fa-solid fa-table-columns"></i> パネルで見る</button>';
  document.querySelector('.sheet-head').appendChild(strip);
})()`;
const STRIP_CSS = D(`
  #app.a6,#app.a6.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 0}
  .a6 .imgpanel,.a6 #btnPanelOpen{display:none !important}
  .a6-strip{display:flex;align-items:center;gap:8px;padding:6px 0 10px;overflow-x:auto}
  .a12-strip img{height:36px;width:50px;object-fit:cover;border-radius:5px;border:1px solid var(--line);flex-shrink:0}
  .a6-file{display:inline-flex;align-items:center;gap:6px;font-size:12px;height:36px;padding:0 10px;border:1px solid var(--line);border-radius:6px;white-space:nowrap;background:var(--paper);flex-shrink:0}
  .a6-add{width:36px;height:36px;flex-shrink:0;border:1px dashed var(--line-strong);border-radius:6px;color:var(--text-sub)}
  .a10-big{margin-left:auto;flex-shrink:0;height:30px;padding:0 10px;border-radius:6px;border:1px solid var(--line);font-size:11.5px;color:var(--text-sub);display:inline-flex;gap:6px;align-items:center;white-space:nowrap}
  .a12-add,.a13-chip{height:24px;padding:0 9px;border-radius:12px;border:1px dashed var(--line-strong);font-size:11px;color:var(--text-sub);display:inline-flex;gap:5px;align-items:center;white-space:nowrap}
  .a13-chip{border-style:solid;border-color:var(--line);background:var(--paper)}
  .a13-chip b{font-family:var(--font-mono);font-weight:600}
`);
const A12 = { id: 'A12', name: 'スリム＋枠なし＋読みやすい行長＋中身がある時だけの帯＋必要時パネル',
  css: A1.css + A4.css + COL + STRIP_CSS, js: STRIP_ADAPTIVE };
const A13 = { id: 'A13', name: 'スリム＋枠なし＋行長＋件数チップ（押すとパネル）', css: A1.css + A4.css + COL + STRIP_CSS,
  js: `(() => {
    document.getElementById('app').classList.add('a6');
    const meta = document.querySelector('.meta-row'); const pick = document.getElementById('markPicker');
    const n = state.images.length + state.attachments.length;
    const add = (html, cls) => { const b = document.createElement('button'); b.className = cls; b.innerHTML = html; meta.insertBefore(b, pick); };
    if (n === 0) { add('<i class="fa-solid fa-paperclip"></i> 画像・ファイルを追加', 'a12-add'); return; }
    if (state.images.length) add('<i class="fa-regular fa-images"></i> 画像 <b>' + state.images.length + '</b>', 'a13-chip');
    if (state.attachments.length) add('<i class="fa-solid fa-paperclip"></i> 添付 <b>' + state.attachments.length + '</b>', 'a13-chip');
  })()` };
const A14 = { id: 'A14', name: '左レール＋枠なし＋行長＋適応帯＋必要時パネル', css: A7.css + A4.css + COL + STRIP_CSS + D(`
  #app.a7.a6,#app.a7.a6.panel-closed{grid-template-columns:60px var(--sidebar-w) 1fr 0}`), js: A7.js + ';' + STRIP_ADAPTIVE };
const A15 = { id: 'A15', name: 'スリム＋枠なし＋行長＋右パネルは中身がある時だけ', css: A1.css + A4.css + COL + STRIP_CSS.replace(/#app\.a6[^}]*\}/, '').replace(/\.a6 \.imgpanel[^}]*\}/, '') + D(`
  #app.a15-empty,#app.a15-empty.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 0}
  .a15-empty .imgpanel,.a15-empty #btnPanelOpen{display:none !important}`),
  js: `(() => {
    const n = state.images.length + state.attachments.length;
    if (n > 0) return;
    document.getElementById('app').classList.add('a15-empty');
    const b = document.createElement('button'); b.className = 'a12-add'; b.innerHTML = '<i class="fa-solid fa-paperclip"></i> 画像・ファイルを追加';
    document.querySelector('.meta-row').insertBefore(b, document.getElementById('markPicker'));
  })()` };

export default {
  key: 'A',
  shots: [
    { w: 1440, h: 900, key: '1440img' },
    { w: 1440, h: 900, key: '1440none', open: { title: 'アイデア：メモアプリの改善' } },
    { w: 1024, h: 768, key: '1024' },
  ],
  rounds: { r1: [A0, A1, A2, A3, A4, A5, A6, A7], r2: [A6, A3, A7, A8, A9, A10, A11], r3: [A10, A8, A11, A12, A13, A14, A15] },
  parts: { A1, A2, A3, A4, A5, A6, A7 },
};
