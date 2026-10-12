/* 項目S：PC のサイドバー見出し行（不具合 5）。見出し行（50px）と開閉ボタンの重複をどうするか */
const clip = { x: 0, y: 0, width: 560, height: 900 };
const NOHEAD = `.sidebar-head{display:none !important}`;
const btn = (cls, html, title) => `(() => { const t = document.getElementById('btnTrash'); t.className = '${cls}'; t.innerHTML = '${html}'; t.title = '${title}'; return t; })()`;

const S0 = { id: 'S0', name: '現行（参考）', css: '' };
const S1 = { id: 'S1', name: '見出し行をなくし、ゴミ箱は一覧の「⋯」へ', css: NOHEAD, js: `(() => { const t = ${btn('lm-item', '<i class="fa-solid fa-trash-can"></i> ゴミ箱', 'ゴミ箱を開く')}; document.getElementById('listMore').append(t); })()` };
const S2 = { id: 'S2', name: '見出し行をなくし、ゴミ箱は検索行の右端', css: NOHEAD + `.search-row #btnTrash{width:38px;height:38px;flex-shrink:0;border:1px solid var(--ink-700);border-radius:7px;color:var(--inv-sub)}`, js: `(() => { const t = document.getElementById('btnTrash'); document.querySelector('.search-row').append(t); })()` };
const S3 = { id: 'S3', name: '見出し行をなくし、ゴミ箱は件数の行のアイコン', css: NOHEAD + `.list-meta #btnTrash{width:26px;height:26px;color:var(--inv-sub)}`, js: `(() => { const t = document.getElementById('btnTrash'); document.querySelector('.list-more-wrap').before(t); })()` };
const S4 = { id: 'S4', name: '見出し行を細く（32px）、« は削除', css: `.sidebar-head{padding:2px 8px 2px 16px}#btnSidebarClose{display:none}.sidebar-head .icon-btn{width:26px;height:26px}#sidebarTitle i{display:none}` };
const S5 = { id: 'S5', name: '見出し行をなくし、ゴミ箱は「絞り込み」パネルの中', css: NOHEAD, js: `(() => { const t = ${btn('fp-flag', '<i class="fa-solid fa-trash-can"></i> ゴミ箱を見る', 'ゴミ箱を開く')}; document.querySelector('.fp-flags').append(t); })()` };
/* ↓ 方向性の違う追加案 */
const S6 = { id: 'S6', name: '見出し行をなくし、ゴミ箱はヘッダー（全体の操作）へ', css: NOHEAD + `.topbar #btnTrash{color:var(--inv-text);width:30px;height:30px}`, js: `(() => { const t = document.getElementById('btnTrash'); document.getElementById('btnManage').before(t); })()` };
const S7 = { id: 'S7', name: '見出し行をなくし、ゴミ箱はサイドバーの最下部（フォルダのように）', css: NOHEAD + `.s7{display:flex;align-items:center;gap:8px;height:38px;padding:0 16px;border-top:1px solid var(--ink-line);color:var(--inv-sub);font-size:12px;flex-shrink:0}.s7 b{margin-left:auto;font-family:var(--font-mono);font-weight:500}`, js: `(() => { const t = document.getElementById('btnTrash'); t.className = 's7'; t.innerHTML = '<i class="fa-solid fa-trash-can"></i> ゴミ箱<b>' + trashedMemos().length + '</b>'; document.querySelector('.sidebar').append(t); })()` };

/* ===== 2回目 ===== */
const FOOT_CSS = NOHEAD + `.s7{display:flex;align-items:center;gap:8px;height:34px;padding:0 16px;border-top:1px solid var(--ink-line);color:var(--inv-sub);font-size:12px;flex-shrink:0}
  .s7:hover{background:var(--ink-850);color:var(--inv-text)}
  .s7 b{margin-left:auto;min-width:20px;height:18px;padding:0 6px;border-radius:9px;background:var(--ink-800);font-family:var(--font-mono);font-weight:500;font-size:10.5px;display:inline-flex;align-items:center;justify-content:center}`;
const FOOT_JS = (back) => `(() => { const t = document.getElementById('btnTrash'); t.className = 's7'; const n = trashedMemos().length;
  t.innerHTML = (${back} && state.trashView) ? '<i class="fa-solid fa-arrow-left"></i> メモ一覧に戻る' : '<i class="fa-solid fa-trash-can"></i> ゴミ箱' + (n ? '<b>' + n + '</b>' : '');
  document.querySelector('.sidebar').append(t); })()`;
const S8  = { id: 'S8',  name: '最下部のゴミ箱（細く・件数は1件以上のとき）', css: FOOT_CSS, js: FOOT_JS(false) };
const S9  = { id: 'S9',  name: 'S8＋ゴミ箱の表示中は「メモ一覧に戻る」になる', css: FOOT_CSS, js: FOOT_JS(true) };
const S10 = { id: 'S10', name: 'S8＋一覧の「⋯」にもゴミ箱', css: FOOT_CSS, js: FOOT_JS(false) + `;(() => { const b = document.createElement('button'); b.className = 'lm-item'; b.innerHTML = '<i class="fa-solid fa-trash-can"></i> ゴミ箱'; document.getElementById('listMore').append(b); })()` };
const S11 = { id: 'S11', name: 'ヘッダーにゴミ箱（件数バッジ付き）', css: S6.css + `.topbar #btnTrash{position:relative}.s11b{position:absolute;top:-2px;right:-4px;min-width:15px;height:15px;border-radius:8px;background:var(--rec);color:#fff;font-size:9px;display:flex;align-items:center;justify-content:center;padding:0 3px}`,
  js: S6.js + `;(() => { const n = trashedMemos().length; if (n) { const b = document.createElement('span'); b.className = 's11b'; b.textContent = n; document.getElementById('btnTrash').append(b); } })()` };
export default {
  key: 'S', compositeHeight: 520,
  shots: [
    { w: 1440, h: 900, key: '1440', clip },
    { w: 1440, h: 900, key: 'bottom', clip: { x: 0, y: 380, width: 560, height: 520 } },
    { w: 1024, h: 768, key: '1024', clip: { x: 0, y: 0, width: 560, height: 520 } },
    { w: 1440, h: 900, key: 'trash', clip },
  ],
  open: {},
  /* ゴミ箱に1件ある状態で撮る（件数の出方を比べるため）。trash はゴミ箱を表示中の状態 */
  before: async (p, { shot }) => {
    await p.evaluate(async () => { const m = state.memos.find(x => x.title === '英語フレーズ'); if (m && !m.deletedAt) await moveMemoToTrash(m.id); });
    if (shot.key === 'trash') await p.evaluate(() => toggleTrashView(true));
    await p.waitForTimeout(200);
  },
  rounds: { r1: [S0, S1, S2, S3, S4, S5, S6, S7], r2: [S7, S1, S3, S8, S9, S10, S11] },
};
