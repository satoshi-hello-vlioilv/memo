/* 項目B：サイドバー上部（検索・絞り込み・一覧操作）の階層構造 */
const clip = h => ({ x: 0, y: 0, width: 560, height: h });

/* 共通：一覧操作の行を「件数・並び替え・⋯」に絞る */
const COMPACT_META = `(() => {
  const right = document.querySelector('.list-meta-right');
  const wrap = document.createElement('div'); wrap.className = 'bx-more-wrap';
  wrap.innerHTML = '<button class="icon-btn bx-more" title="表示の切り替え"><i class="fa-solid fa-ellipsis"></i></button><div class="bx-more-pop" hidden></div>';
  const pop = wrap.querySelector('.bx-more-pop');
  for (const id of ['btnSelectMode', 'btnGroupByDate', 'groupFieldSelect']) pop.appendChild(document.getElementById(id));
  right.appendChild(wrap);
})()`;
const BASE_CSS = `
  .bx-more-wrap{position:relative}
  .bx-pop,.bx-more-pop{position:absolute;z-index:90;background:var(--ink-850);border:1px solid var(--ink-700);border-radius:9px;box-shadow:var(--shadow-2);padding:10px}
  .bx-sec{font-size:10px;font-weight:700;letter-spacing:.06em;color:var(--inv-sub);margin:8px 2px 6px}
  .bx-sec:first-child{margin-top:0}
`;
/* 検索対象をドロップダウンにして検索欄へ収める */
const SCOPE_IN_SEARCH = `(() => {
  const box = document.querySelector('.search-box');
  const b = document.createElement('button'); b.className = 'bx-scopebtn'; b.title = '検索する対象（タイトル・タグ・本文）';
  b.innerHTML = '対象 <i class="fa-solid fa-chevron-down"></i>';
  box.insertBefore(b, document.getElementById('searchClear'));
  document.getElementById('searchScope').style.display = 'none';
})()`;
const SCOPE_CSS = `.bx-scopebtn{flex-shrink:0;height:26px;padding:0 8px;border-radius:5px;font-size:11px;color:var(--inv-sub);border:1px solid var(--ink-700);display:inline-flex;align-items:center;gap:5px}
  .bx-scopebtn i{font-size:8px !important}`;

const B0 = { id: 'B0', name: '現行（参考）', css: '' };

const B1 = { id: 'B1', name: 'アコーディオン（絞り込みを1行に畳む）', css: BASE_CSS + `
  .bx-acc-toggle{display:flex;align-items:center;gap:8px;margin:0 14px 10px;padding:0 10px;height:32px;border-radius:7px;background:var(--ink-850);border:1px solid var(--ink-700);color:var(--inv-text);font-size:12px;width:calc(100% - 28px)}
  .bx-acc-toggle .bx-sum{margin-left:auto;color:var(--inv-sub);font-size:11px}
  .bx-acc-toggle i{font-size:10px;color:var(--inv-sub)}
`, js: `(() => {
  const sb = document.querySelector('.sidebar');
  const acc = document.createElement('div'); acc.className = 'bx-acc'; acc.hidden = true;
  const t = document.createElement('button'); t.className = 'bx-acc-toggle';
  const marks = document.querySelectorAll('.mark-chip').length, tags = document.querySelectorAll('.tagbar .chip').length;
  t.innerHTML = '<i class="fa-solid fa-chevron-right"></i> 絞り込み<span class="bx-sum">目印 ' + marks + '・タグ ' + tags + '</span>';
  t.onclick = () => { acc.hidden = !acc.hidden; t.querySelector('i').className = 'fa-solid fa-chevron-' + (acc.hidden ? 'right' : 'down'); };
  const scope = document.getElementById('searchScope');
  sb.insertBefore(t, scope); sb.insertBefore(acc, scope);
  acc.append(scope, document.getElementById('markBar'), document.getElementById('tagBar'));
})()`, scene: async (p, { shot }) => { if (shot.key === 'open') await p.locator('.bx-acc-toggle').click(); } };

const B2 = { id: 'B2', name: '検索欄のフィルターボタン＋ポップオーバー', css: BASE_CSS + `
  .bx-filterbtn{flex-shrink:0;width:28px;height:28px;border-radius:6px;color:var(--inv-sub)}
  .bx-filterbtn.on{background:var(--primary);color:#fff}
  .sidebar{position:relative}
  .bx-pop{left:14px;right:14px;top:98px}
  .bx-pop .scope-group{width:100%}
  .bx-pop .search-scope{padding:0 0 4px}.bx-pop .search-scope-label{display:none}
  .bx-pop .markbar,.bx-pop .tagbar{padding:0 0 4px}
  .bx-pop .bx-flags{display:flex;gap:6px}
  .bx-pop .bx-flags .icon-btn{width:auto;padding:0 10px;height:28px;border:1px solid var(--ink-700);border-radius:14px;color:var(--inv-sub);font-size:11px;gap:5px}
`, js: `(() => {
  const box = document.querySelector('.search-box');
  const btn = document.createElement('button'); btn.className = 'bx-filterbtn'; btn.title = '絞り込み（検索対象・目印・タグ・画像/添付）';
  btn.innerHTML = '<i class="fa-solid fa-sliders"></i>';
  box.appendChild(btn);
  const pop = document.createElement('div'); pop.className = 'bx-pop'; pop.hidden = true;
  const sec = t => { const d = document.createElement('div'); d.className = 'bx-sec'; d.textContent = t; return d; };
  const flags = document.createElement('div'); flags.className = 'bx-flags';
  const img = document.getElementById('btnImageFilter'), file = document.getElementById('btnFileFilter');
  img.innerHTML += ' 画像あり'; file.innerHTML += ' 添付あり'; flags.append(img, file);
  pop.append(sec('検索対象'), document.getElementById('searchScope'), sec('目印'), document.getElementById('markBar'), sec('タグ'), document.getElementById('tagBar'), sec('その他'), flags);
  document.querySelector('.sidebar').appendChild(pop);
  btn.onclick = () => { pop.hidden = !pop.hidden; btn.classList.toggle('on', !pop.hidden); };
})(); ${COMPACT_META}`, scene: async (p, { shot }) => { if (shot.key === 'open') await p.locator('.bx-filterbtn').click(); } };

const B3 = { id: 'B3', name: '目印とタグを1行の横スクロールに', css: BASE_CSS + SCOPE_CSS + `
  .bx-row{display:flex;gap:6px;overflow-x:auto;padding:0 14px 10px;scrollbar-width:none;mask-image:linear-gradient(90deg,#000 88%,transparent)}
  .bx-row .markbar,.bx-row .tagbar{display:flex;flex-wrap:nowrap;padding:0;max-height:none;overflow:visible}
  .bx-row .mark-chip,.bx-row .chip{flex-shrink:0;white-space:nowrap}
  .bx-row .bx-div{width:1px;flex-shrink:0;background:var(--ink-700);margin:2px 2px}
`, js: `(() => {
  const row = document.createElement('div'); row.className = 'bx-row';
  const mb = document.getElementById('markBar'), tb = document.getElementById('tagBar');
  mb.parentNode.insertBefore(row, mb);
  const d = document.createElement('span'); d.className = 'bx-div';
  row.append(mb, d, tb);
})(); ${SCOPE_IN_SEARCH}; ${COMPACT_META}` };

const B4 = { id: 'B4', name: '絞り込みをタブで切り替え（すべて／目印／タグ／条件）', css: BASE_CSS + SCOPE_CSS + `
  .bx-seg{display:flex;margin:0 14px 10px;border:1px solid var(--ink-700);border-radius:7px;overflow:hidden}
  .bx-seg button{flex:1;height:28px;font-size:11.5px;color:var(--inv-sub);background:var(--ink-850);border-right:1px solid var(--ink-700)}
  .bx-seg button:last-child{border-right:none}
  .bx-seg button.on{background:var(--ink-700);color:var(--inv-text);font-weight:700}
  .bx-panes > *{display:none !important}
  .bx-panes > .on{display:flex !important}
  .bx-flags{gap:6px;padding:0 14px 10px}
  .bx-flags .icon-btn{width:auto;padding:0 10px;height:28px;border:1px solid var(--ink-700);border-radius:14px;color:var(--inv-sub);font-size:11px;gap:5px}
`, js: `(() => {
  const sb = document.querySelector('.sidebar');
  const seg = document.createElement('div'); seg.className = 'bx-seg';
  seg.innerHTML = '<button class="on" data-p="">すべて</button><button data-p="markBar">目印</button><button data-p="tagBar">タグ</button><button data-p="bxFlags">条件</button>';
  const panes = document.createElement('div'); panes.className = 'bx-panes';
  const flags = document.createElement('div'); flags.className = 'bx-flags'; flags.id = 'bxFlags';
  const img = document.getElementById('btnImageFilter'), file = document.getElementById('btnFileFilter');
  img.innerHTML += ' 画像あり'; file.innerHTML += ' 添付あり'; flags.append(img, file);
  const mb = document.getElementById('markBar');
  sb.insertBefore(seg, mb); sb.insertBefore(panes, mb);
  panes.append(mb, document.getElementById('tagBar'), flags);
  seg.onclick = e => { const b = e.target.closest('button'); if (!b) return;
    seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    panes.querySelectorAll(':scope > *').forEach(x => x.classList.toggle('on', x.id === b.dataset.p)); };
})(); ${SCOPE_IN_SEARCH}; ${COMPACT_META}`, scene: async (p, { shot }) => { if (shot.key === 'open') await p.locator('.bx-seg button[data-p="tagBar"]').click(); } };

const B5 = { id: 'B5', name: '見出し付きの折りたたみ行（目印はアイコンで1行・タグは1行＋すべて表示）', css: BASE_CSS + SCOPE_CSS + `
  .bx-line{display:flex;align-items:center;gap:6px;margin:0 14px 8px;min-width:0}
  .bx-line > .bx-h{flex-shrink:0;width:34px;font-size:10px;font-weight:700;color:var(--inv-sub);letter-spacing:.04em}
  .bx-line .markbar{padding:0;flex-wrap:nowrap;gap:4px}
  .bx-line .mark-chip{padding:3px 7px;gap:4px}
  .bx-line .mark-chip > :not(i):not(.cnt){display:none}
  .bx-line .mark-chip{font-size:0}.bx-line .mark-chip i{font-size:11px}.bx-line .mark-chip .cnt{font-size:10px}
  .bx-line .tagbar{padding:0;flex-wrap:nowrap;overflow:hidden;max-height:24px;flex:1;min-width:0;mask-image:linear-gradient(90deg,#000 80%,transparent)}
  .bx-line.open .tagbar{flex-wrap:wrap;max-height:none;mask-image:none}
  .bx-line .chip{flex-shrink:0}
  .bx-all{flex-shrink:0;font-size:10.5px;color:var(--inv-sub);padding:2px 6px;border-radius:5px}
  .bx-all:hover{background:var(--ink-800)}
`, js: `(() => {
  const mb = document.getElementById('markBar'), tb = document.getElementById('tagBar');
  const l1 = document.createElement('div'); l1.className = 'bx-line'; l1.innerHTML = '<span class="bx-h">目印</span>';
  const l2 = document.createElement('div'); l2.className = 'bx-line bx-tags'; l2.innerHTML = '<span class="bx-h">タグ</span>';
  mb.parentNode.insertBefore(l1, mb); mb.parentNode.insertBefore(l2, mb);
  l1.append(mb); l2.append(tb);
  const all = document.createElement('button'); all.className = 'bx-all'; all.textContent = 'すべて';
  all.onclick = () => { l2.classList.toggle('open'); all.textContent = l2.classList.contains('open') ? '閉じる' : 'すべて'; };
  l2.append(all);
})(); ${SCOPE_IN_SEARCH}; ${COMPACT_META}`, scene: async (p, { shot }) => { if (shot.key === 'open') await p.locator('.bx-all').click(); } };

/* ↓ 方向性の違う追加案 */
const B6 = { id: 'B6', name: 'よく使う絞り込みを「ビュー」に（タグは検索候補から）', css: BASE_CSS + SCOPE_CSS + `
  .bx-views{display:flex;gap:6px;overflow-x:auto;padding:0 14px 10px;scrollbar-width:none}
  .bx-view{flex-shrink:0;display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 11px;border-radius:14px;background:var(--ink-850);border:1px solid var(--ink-700);color:var(--inv-sub);font-size:11.5px;white-space:nowrap}
  .bx-view.on{background:var(--primary);border-color:var(--primary);color:#fff}
  .bx-view b{font-family:var(--font-mono);font-weight:600;font-size:10.5px;opacity:.8}
  #markBar,#tagBar{display:none !important}
`, js: `(() => {
  const v = document.createElement('div'); v.className = 'bx-views';
  const n = f => state.memos.filter(m => !m.deletedAt && f(m)).length;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const items = [['fa-regular fa-note-sticky', 'すべて', n(() => true), true], ['fa-solid fa-thumbtack', 'ピン', n(m => m.mark === 'pin')],
    ['fa-solid fa-flag', '要対応', n(m => m.mark === 'flag')], ['fa-regular fa-calendar', '今日', n(m => m.updatedAt >= today.getTime())],
    ['fa-regular fa-image', '画像', n(m => m.imageCount > 0)], ['fa-solid fa-paperclip', '添付', n(m => m.fileCount > 0)]];
  v.innerHTML = items.map(([i, l, c, on]) => '<button class="bx-view' + (on ? ' on' : '') + '"><i class="' + i + '"></i>' + l + ' <b>' + c + '</b></button>').join('');
  const mb = document.getElementById('markBar'); mb.parentNode.insertBefore(v, mb);
})(); ${SCOPE_IN_SEARCH}; ${COMPACT_META}`, scene: async (p, { shot }) => { if (shot.key === 'open') { await p.locator('#searchInput').click(); await p.waitForTimeout(300); } } };

const B7 = { id: 'B7', name: '絞り込みを一覧と一緒にスクロール（検索欄だけ固定）', css: BASE_CSS + `
  .sidebar{overflow-y:auto !important}
  .sidebar .memo-list{overflow:visible;flex:none}
  .sidebar-head{position:sticky;top:0;z-index:5;background:var(--ink-900)}
  .search-box{position:sticky;top:38px;z-index:5;margin-top:0;box-shadow:0 8px 10px var(--ink-900)}
`, js: COMPACT_META, scene: async (p, { shot }) => { if (shot.key === 'open') await p.evaluate(() => { document.querySelector('.sidebar').scrollTop = 330; }); } };

/* ===== 2回目：ポップオーバー（B2）＋ラベル付きの入口（B1）＋常に見える目印（B5） ===== */
/* 絞り込みパネルを組み立てる。where: 'meta'（一覧操作の行）/'side'（検索欄の右）、mode: 'pop' | 'inline' */
const POP = (where, mode, withMarks) => `(() => {
  const sb = document.querySelector('.sidebar'); sb.style.position = 'relative';
  const pop = document.createElement('div'); pop.className = 'bx-pop2 ' + '${mode}'; pop.hidden = true;
  const sec = t => { const d = document.createElement('div'); d.className = 'bx-sec'; d.textContent = t; return d; };
  const flags = document.createElement('div'); flags.className = 'bx-flags';
  const img = document.getElementById('btnImageFilter'), file = document.getElementById('btnFileFilter');
  img.innerHTML += ' 画像あり'; file.innerHTML += ' 添付あり'; flags.append(img, file);
  const mb = document.getElementById('markBar');
  if (${withMarks}) {
    const line = document.createElement('div'); line.className = 'bx-line bx-marks';
    line.innerHTML = '<span class="bx-h">目印</span>'; line.append(mb);
    document.getElementById('searchScope').after(line);
    pop.append(sec('検索対象'), document.getElementById('searchScope'), sec('タグ'), document.getElementById('tagBar'), sec('その他'), flags);
  } else {
    pop.append(sec('検索対象'), document.getElementById('searchScope'), sec('目印'), mb, sec('タグ'), document.getElementById('tagBar'), sec('その他'), flags);
  }
  const btn = document.createElement('button'); btn.className = 'bx-fbtn';
  btn.innerHTML = '<i class="fa-solid fa-sliders"></i> 絞り込み <i class="fa-solid fa-chevron-down bx-cv"></i>';
  if ('${where}' === 'meta') {
    const meta = document.querySelector('.list-meta'); meta.insertBefore(btn, meta.children[1]);
    if ('${mode}' === 'inline') meta.after(pop); else sb.appendChild(pop);
  } else {
    const box = document.querySelector('.search-box'); const row = document.createElement('div'); row.className = 'bx-srow';
    box.parentNode.insertBefore(row, box); row.append(box, btn);
    if ('${mode}' === 'inline') row.after(pop); else sb.appendChild(pop);
  }
  btn.onclick = () => { pop.hidden = !pop.hidden; btn.classList.toggle('on', !pop.hidden);
    if ('${mode}' === 'pop') { const r = btn.getBoundingClientRect(), s = sb.getBoundingClientRect(); pop.style.top = (r.bottom - s.top + 6) + 'px'; } };
})()`;
const POP_CSS = BASE_CSS + `
  .bx-fbtn{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 9px;border-radius:6px;border:1px solid var(--ink-700);color:var(--inv-text);font-size:11.5px;background:var(--ink-850);white-space:nowrap}
  .bx-fbtn .bx-cv{font-size:8px;color:var(--inv-sub)}
  .bx-fbtn.on{border-color:var(--primary);background:rgba(19,121,108,.25)}
  .list-meta{gap:8px}.list-meta > #listCount{margin-right:auto;order:-1}
  .list-meta .bx-fbtn{order:0}.list-meta .list-meta-right{order:1}
  .bx-pop2.pop{position:absolute;left:12px;right:12px;z-index:90;background:var(--ink-850);border:1px solid var(--ink-700);border-radius:10px;box-shadow:var(--shadow-2);padding:12px}
  .bx-pop2.inline{margin:0 12px 10px;padding:10px 12px;border:1px solid var(--ink-700);border-radius:9px;background:var(--ink-850)}
  .bx-pop2 .search-scope{padding:0 0 4px}.bx-pop2 .search-scope-label{display:none}
  .bx-pop2 .markbar,.bx-pop2 .tagbar{padding:0 0 4px}
  .bx-flags{display:flex;gap:6px}
  .bx-flags .icon-btn{width:auto;padding:0 10px;height:28px;border:1px solid var(--ink-700);border-radius:14px;color:var(--inv-sub);font-size:11px;gap:5px}
  .bx-srow{display:flex;align-items:center;gap:6px;margin:12px 14px 10px}
  .bx-srow .search-box{margin:0;flex:1;min-width:0}
  .bx-srow .bx-fbtn{height:38px;padding:0 10px}
  .bx-line{display:flex;align-items:center;gap:6px;margin:0 14px 10px;min-width:0}
  .bx-line > .bx-h{flex-shrink:0;font-size:10px;font-weight:700;color:var(--inv-sub);letter-spacing:.04em}
  .bx-line .markbar{padding:0;flex-wrap:nowrap;gap:4px;overflow:hidden}
  .bx-line .mark-chip{padding:3px 7px;gap:4px;font-size:0}
  .bx-line .mark-chip i{font-size:11px}.bx-line .mark-chip .cnt{font-size:10px}
`;
const openB = async (p, { shot }) => { if (shot.key === 'open') await p.locator('.bx-fbtn').click(); };
const B8  = { id: 'B8',  name: '一覧操作の行に「絞り込み」ボタン＋ポップオーバー', css: POP_CSS, js: COMPACT_META + ';' + POP('meta', 'pop', false), scene: openB };
const B9  = { id: 'B9',  name: 'B8＋目印だけはアイコン1行で常時表示', css: POP_CSS, js: COMPACT_META + ';' + POP('meta', 'pop', true), scene: openB };
const B10 = { id: 'B10', name: '一覧操作の行に「絞り込み」ボタン＋その場で展開', css: POP_CSS, js: COMPACT_META + ';' + POP('meta', 'inline', false), scene: openB };
const B11 = { id: 'B11', name: '検索欄の右に「絞り込み」ボタン＋ポップオーバー', css: POP_CSS, js: COMPACT_META + ';' + POP('side', 'pop', false), scene: openB };

export default {
  key: 'B',
  compositeHeight: 900,
  shots: [
    { w: 1440, h: 900, key: 'default', clip: clip(900) },
    { w: 1440, h: 900, key: 'open', clip: clip(900) },
    { w: 1440, h: 900, key: 'active', clip: clip(900) },
    { w: 1024, h: 768, key: '1024', clip: clip(768) },
  ],
  scene: async (p, { shot }) => {
    if (shot.key === 'active') {
      await p.locator('#searchInput').fill('tag:業務 mark:flag');
      await p.locator('#searchInput').blur(); await p.waitForTimeout(400);
    }
  },
  rounds: { r1: [B0, B1, B2, B3, B4, B5, B6, B7], r2: [B2, B1, B5, B8, B9, B10, B11] },
  parts: { COMPACT_META, BASE_CSS, SCOPE_IN_SEARCH, SCOPE_CSS, B1, B2, B3, B4, B5, B6, B7 },
};
