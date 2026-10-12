/* 項目G：スマホ・タブレット縦（幅 768px 以下）の構成 */
const M = css => `@media (max-width:768px){${css}}`;

/* 共通部品 */
const HEAD1 = { css: M(`
  .topbar{flex-wrap:nowrap !important;min-height:48px !important;padding:0 6px 0 2px !important}
  .topbar #btnImport,.topbar #btnExport,.topbar #btnManage{display:none !important}
  .g-more{display:inline-flex !important}
  .topbar #btnNew{height:34px;padding:0 12px}
`) + `.g-more{display:none}`, js: `(() => {
  const acts = document.querySelector('.topbar-actions'); const b = document.createElement('button');
  b.className = 'icon-btn-inv g-more'; b.title = '取り込み・書き出し・管理'; b.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>';
  acts.insertBefore(b, document.getElementById('btnNew'));
})()` };
const EDGE = M(`.editor-sheet{margin:0 !important;width:100% !important}`);
const NOSBHEAD = { css: M(`.sidebar-head{display:none !important} .search-row{margin-top:10px}`), js: `(() => {
  const lm = document.getElementById('listMore'); const t = document.getElementById('btnTrash');
  t.className = 'lm-item'; t.innerHTML = '<i class="fa-solid fa-trash-can"></i> ゴミ箱'; lm.append(t);
})()` };
const TBSCROLL = M(`
  .toolbar{flex-wrap:nowrap !important;overflow-x:auto;scrollbar-width:none;padding-right:0 !important}
  .toolbar::-webkit-scrollbar{display:none}
  .tool-group{flex-wrap:nowrap !important}
  .toolbar-end{position:sticky;right:0;background:var(--surface);padding:0 8px 0 10px;box-shadow:-10px 0 10px -4px var(--surface)}
`);
const TB2 = M(`
  .toolbar{display:grid !important;grid-template-columns:1fr auto;row-gap:6px;padding:8px 10px !important}
  .toolbar > .tool-group:first-child{display:none}
  .toolbar > .tool-group:nth-child(3){grid-column:1;flex-wrap:nowrap !important;overflow-x:auto}
  .toolbar-end{grid-column:2;grid-row:1}
  .toolbar .tool-div{display:none}
`);
const BOTTOM_TABS = M(`
  .mobile-tabs{order:99;border-top:1px solid var(--ink-line);border-bottom:none !important;padding-bottom:env(safe-area-inset-bottom)}
  .mtab{flex-direction:column !important;gap:3px !important;height:56px !important;font-size:10.5px !important}
  .mtab i{font-size:17px}
`);
const join = (...parts) => ({
  css: parts.map(p => typeof p === 'string' ? p : (p.css || '')).join('\n'),
  js: parts.filter(p => typeof p === 'object' && p.js).map(p => p.js).join(';\n'),
});

const G0 = { id: 'G0', name: '現行（参考）', css: '' };
const G1 = { id: 'G1', name: 'ヘッダー1段（取込・書出・管理は ⋮）＋紙を全幅＋一覧の見出し行を省く', ...join(HEAD1, EDGE, NOSBHEAD) };
const G2 = { id: 'G2', name: 'G1＋ツールバーを1行の横スクロールに（保存は右端に固定）', ...join(HEAD1, EDGE, NOSBHEAD, TBSCROLL) };
const G3 = { id: 'G3', name: 'G1＋タブを画面の下へ（親指で切り替え）', ...join(HEAD1, EDGE, NOSBHEAD, BOTTOM_TABS) };
const G4 = { id: 'G4', name: 'ヘッダーとタブを1段に統合（ロゴ｜一覧・編集・画像｜＋）', ...join(EDGE, NOSBHEAD, { css: M(`
  .topbar{flex-wrap:nowrap !important;min-height:52px !important;padding:0 6px !important;gap:6px}
  .topbar .brand-text,.topbar #btnToggleSidebar,.topbar #btnImport,.topbar #btnExport,.topbar #btnManage{display:none !important}
  .topbar .mobile-tabs{display:flex !important;flex:1;background:none;border:none}
  .topbar .mtab{height:40px;border-radius:8px;font-size:12px;border-bottom:none !important}
  .topbar .mtab.active{background:rgba(255,255,255,.1)}
  .topbar #btnNew{width:38px;height:38px;padding:0;justify-content:center;font-size:0}
  .topbar #btnNew i{font-size:15px}
  .g-more{display:inline-flex !important}
`) + `.g-more{display:none}`, js: `(() => {
  const tb = document.querySelector('.topbar'); const tabs = document.getElementById('mobileTabs');
  if (matchMedia('(max-width:768px)').matches) tb.insertBefore(tabs, document.querySelector('.topbar-actions'));
  const acts = document.querySelector('.topbar-actions'); const b = document.createElement('button');
  b.className = 'icon-btn-inv g-more'; b.innerHTML = '<i class="fa-solid fa-ellipsis-vertical"></i>'; acts.insertBefore(b, document.getElementById('btnNew'));
})()` }) };
const G5 = { id: 'G5', name: 'G1＋書式は「Aa」で開く（ふだんは取り消し・段落・保存だけ）', ...join(HEAD1, EDGE, NOSBHEAD, { css: M(`
  .toolbar{flex-wrap:nowrap !important}
  .toolbar #btnBold,.toolbar #btnItalic,.toolbar #btnLink,.toolbar #fontSizeSelect,.toolbar .color-tool,.toolbar #btnClearFormat,.toolbar .tool-sep{display:none !important}
  .g-aa{display:inline-flex !important;align-items:center;justify-content:center;width:34px;height:30px;border:1px solid var(--line);border-radius:6px;font-weight:700;font-size:13px}
`) + `.g-aa{display:none}`, js: `(() => {
  const b = document.createElement('button'); b.className = 'g-aa'; b.title = '文字の書式'; b.textContent = 'Aa';
  document.getElementById('blockSelect').after(b);
})()` }) };

/* ↓ 方向性の違う追加案 */
const G6 = { id: 'G6', name: 'タブをやめ「一覧 → メモ → ‹ 戻る」の画面遷移に', ...join(EDGE, NOSBHEAD, HEAD1, TBSCROLL, { css: M(`
  .mobile-tabs{display:none !important}
  .g-back{display:inline-flex !important;align-items:center;gap:4px;height:34px;padding:0 10px 0 6px;color:var(--inv-text);font-size:13px}
  #app[data-mtab="editor"] .brand{display:none}
  #app[data-mtab="list"] .g-back{display:none !important}
`) + `.g-back{display:none}`, js: `(() => {
  const b = document.createElement('button'); b.className = 'g-back'; b.innerHTML = '<i class="fa-solid fa-chevron-left"></i> 一覧';
  document.querySelector('.brand-group').append(b);
  document.getElementById('btnToggleSidebar').style.display = matchMedia('(max-width:768px)').matches && document.getElementById('app').dataset.mtab === 'editor' ? 'none' : '';
})()` }) };
const G7 = { id: 'G7', name: '書式バーを画面の下に固定（親指の届く位置・キーボードの上）', ...join(HEAD1, EDGE, NOSBHEAD, { css: M(`
  .toolbar{position:fixed;left:0;right:0;bottom:0;z-index:40;flex-wrap:nowrap !important;overflow-x:auto;box-shadow:0 -4px 12px rgba(0,0,0,.08);padding:8px 10px !important}
  .tool-group{flex-wrap:nowrap !important}
  .body-wrap{padding-bottom:52px}
`) }) };

/* ===== 2回目 ===== */
/* 画面遷移型の共通部分：一覧では「ロゴ・⋮・新規」、編集では「‹ 一覧・⋮・新規」 */
const STACK = { css: M(`
  .mobile-tabs{display:none !important}
  #app:not([data-mtab="list"]) .brand-group{display:none}
  .g-back{display:none}
  #app:not([data-mtab="list"]) .g-back{display:inline-flex !important;align-items:center;gap:6px;height:36px;padding:0 10px 0 4px;color:var(--inv-text);font-size:14px;margin-right:auto}
  .topbar{justify-content:flex-start !important}
  .topbar-actions{margin-left:auto}
`) + `.g-back{display:none}`, js: `(() => {
  const b = document.createElement('button'); b.className = 'g-back'; b.innerHTML = '<i class="fa-solid fa-chevron-left"></i> 一覧';
  document.querySelector('.topbar').insertBefore(b, document.querySelector('.topbar-actions'));
  b.onclick = () => setMobileTab('list');
})()` };
const AA = { css: G5.css, js: G5.js };
const G8 = { id: 'G8', name: '画面遷移（‹ 一覧）＋ヘッダー1段＋書式は「Aa」', ...join(HEAD1, EDGE, NOSBHEAD, STACK, AA) };
const G9 = { id: 'G9', name: '画面遷移（‹ 一覧）＋ヘッダー1段＋ツールバー1行の横スクロール', ...join(HEAD1, EDGE, NOSBHEAD, STACK, TBSCROLL) };
const G10 = { id: 'G10', name: 'G8＋「Aa」を押すと書式の行が下に開く（開いた状態で撮影）', ...join(HEAD1, EDGE, NOSBHEAD, STACK, { css: M(`
  .toolbar{flex-wrap:wrap !important}
  .g-aa{display:inline-flex !important;align-items:center;justify-content:center;width:34px;height:30px;border:1px solid var(--primary-line);background:var(--primary-soft);color:var(--primary-deep);border-radius:6px;font-weight:700;font-size:13px}
  .toolbar .tool-group:nth-child(3){order:5;flex-basis:100%;flex-wrap:nowrap !important;overflow-x:auto;padding-top:6px;border-top:1px solid var(--line);margin-top:2px}
  .toolbar .tool-group:nth-child(3) #blockSelect{display:none}
  .toolbar .tool-group:nth-child(3) .tool-sep:first-of-type{display:none}
`) + `.g-aa{display:none}`, js: `(() => {
  const b = document.createElement('button'); b.className = 'g-aa'; b.textContent = 'Aa';
  const blk = document.getElementById('blockSelect'); const first = document.querySelector('.toolbar .tool-group');
  first.append(blk, b);
})()` }) };
const G11 = { id: 'G11', name: 'タブは残す（G1）＋書式は「Aa」＋保存は右端', ...join(HEAD1, EDGE, NOSBHEAD, AA) };

export default {
  key: 'G', compositeHeight: 760,
  shots: [
    { w: 390, h: 844, key: 'editor' },
    { w: 390, h: 844, key: 'list' },
    { w: 768, h: 1024, key: '768' },
  ],
  scene: async (p, { shot }) => {
    if (shot.key === 'list') {
      const t = p.locator('.mtab[data-tab="list"]');
      if (await t.isVisible()) await t.click();
      else await p.evaluate(() => setMobileTab('list'));
      await p.waitForTimeout(300);
    }
  },
  rounds: { r1: [G0, G1, G2, G3, G4, G5, G6, G7], r2: [G6, G5, G2, G8, G9, G10, G11] },
  parts: { M, HEAD1, EDGE, NOSBHEAD, TBSCROLL, TB2, BOTTOM_TABS, join, G1, G2, G3, G4, G5, G6, G7 },
};
