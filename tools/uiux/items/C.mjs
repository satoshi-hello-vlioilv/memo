/* 項目C：一覧のメモ項目の表示 */
const clip = h => ({ x: 0, y: 0, width: 560, height: h });

/* 共通の下ごしらえ：短い日付・件数アイコン・目印などを作る関数を window に置く */
const PRE = `(() => {
  window.__rel = ts => {
    const d = Date.now() - ts;
    if (d < 3600e3) return Math.max(1, Math.round(d / 60e3)) + '分前';
    if (isToday(ts)) return fmtTime(ts);
    if (fmtDate(Date.now() - 86400e3) === fmtDate(ts)) return '昨日';
    const dt = new Date(ts);
    return dt.getFullYear() === new Date().getFullYear() ? (dt.getMonth() + 1) + '/' + dt.getDate() : fmtDate(ts);
  };
  window.__parts = m => {
    const q = currentQuery();
    const terms = state.searchScope.body ? searchHighlightTerms(q) : [];
    const mark = markById(m.mark);
    const dts = m[memoDateField()] ?? m.updatedAt;
    return {
      active: m.id === state.currentId ? ' active' : '',
      title: esc(m.title) || '無題のメモ',
      dts, date: isToday(dts) ? fmtTime(dts) : fmtDate(dts), rel: __rel(dts),
      snippet: makeSnippet(memoPlainBody(m), terms),
      tags: m.tags || [],
      mark, markEl: mark ? '<i class="mi-mark fa-solid ' + mark.icon + ' mk-' + mark.id + '" title="' + esc(mark.label) + '"></i>' : '',
      counts: (m.fileCount > 0 ? '<span class="mi-imgs"><i class="fa-solid fa-paperclip"></i>' + m.fileCount + '</span>' : '') +
              (m.imageCount > 0 ? '<span class="mi-imgs"><i class="fa-regular fa-image"></i>' + m.imageCount + '</span>' : ''),
      attrs: 'data-id="' + m.id + '"' + (mark ? ' data-mark="' + mark.id + '"' : ''),
    };
  };
})()`;
const OVERRIDE = body => PRE + `; renderMemoItem = function (m, peek = false) { const p = __parts(m); ${body} }; renderList();`;

const C0 = { id: 'C0', name: '現行（参考）', css: '' };

const C1 = { id: 'C1', name: '2行コンパクト（タイトル＋抜粋、タグは省略）', css: `
  .memo-item.c1{padding:8px 12px 8px 16px}
  .c1 .mi-snippet{display:flex;gap:8px}.c1 .mi-snippet .s{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
`, js: OVERRIDE(`return '<li class="memo-item c1' + p.active + '" ' + p.attrs + '><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span><span class="mi-date mono">' + p.rel + '</span></div>' +
  '<div class="mi-snippet"><span class="s">' + p.snippet + '</span>' + p.counts + '</div></li>';`) };

const C2 = { id: 'C2', name: 'メタ情報を1行の文字に集約（色チップをやめる）', css: `
  .c2 .mi-meta{margin-top:5px;display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--inv-sub);white-space:nowrap;overflow:hidden}
  .c2.active .mi-meta{color:var(--text-sub)}
  .c2 .mi-meta .t{overflow:hidden;text-overflow:ellipsis}
  .c2 .mi-meta .sep{opacity:.5}
`, js: OVERRIDE(`const tags = p.tags.map(t => '#' + esc(t)).join(' ');
  return '<li class="memo-item c2' + p.active + '" ' + p.attrs + '><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span></div>' +
  (p.snippet ? '<div class="mi-snippet">' + p.snippet + '</div>' : '') +
  '<div class="mi-meta"><span class="mono">' + p.rel + '</span>' + (tags ? '<span class="sep">·</span><span class="t">' + tags + '</span>' : '') + '<span style="margin-left:auto;display:flex;gap:8px">' + p.counts + '</span></div></li>';`) };

const C3 = { id: 'C3', name: '日付を左の列に（カレンダー風）', css: `
  .memo-item.c3{display:flex;gap:12px;padding:10px 12px 10px 14px}
  .c3-date{flex-shrink:0;width:34px;text-align:center;line-height:1.1;padding-top:2px}
  .c3-date b{display:block;font-size:17px;color:var(--inv-text);font-family:var(--font-mono)}
  .c3-date span{font-size:9.5px;color:var(--inv-sub)}
  .c3.active .c3-date b{color:var(--text)} .c3.active .c3-date span{color:var(--text-sub)}
  .c3-main{flex:1;min-width:0}
  .memo-item.c3::before{left:4px}
`, js: OVERRIDE(`const d = new Date(p.dts); const today = isToday(p.dts);
  const col = today ? '<b style="font-size:13px">' + fmtTime(p.dts) + '</b><span>今日</span>' : '<b>' + d.getDate() + '</b><span>' + (d.getMonth() + 1) + '月・' + '日月火水木金土'[d.getDay()] + '</span>';
  const tags = p.tags.slice(0, 3).map(t => tagChip(t)).join('');
  return '<li class="memo-item c3' + p.active + '" ' + p.attrs + '><div class="c3-date">' + col + '</div><div class="c3-main"><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span></div>' +
  (p.snippet ? '<div class="mi-snippet">' + p.snippet + '</div>' : '') + '<div class="mi-foot"><div class="mi-tags">' + tags + '</div>' + p.counts + '</div></div></li>';`) };

const C4 = { id: 'C4', name: '現行の整理（相対日付・控えめなタグ・件数は右上）', css: `
  .c4 .chip{background:transparent !important;border:1px solid var(--ink-700) !important;color:var(--inv-sub) !important;height:19px;font-weight:500}
  .c4.active .chip{border-color:var(--line) !important;color:var(--text-sub) !important}
  .c4 .mi-top .mi-imgs{font-size:10px}
`, js: OVERRIDE(`const tags = p.tags.slice(0, 3).map(t => tagChip(t)).join('');
  return '<li class="memo-item c4' + p.active + '" ' + p.attrs + '><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span>' + p.counts + '<span class="mi-date mono">' + p.rel + '</span></div>' +
  (p.snippet ? '<div class="mi-snippet">' + p.snippet + '</div>' : '') + (tags ? '<div class="mi-foot"><div class="mi-tags">' + tags + '</div></div>' : '') + '</li>';`) };

const C5 = { id: 'C5', name: '区切り線のリスト（選択は暗い地のまま左の帯で示す）', css: `
  .memo-list{padding:0 0 12px}
  .memo-item{border-radius:0;margin:0;border-bottom:1px solid var(--ink-line);padding:12px 14px 11px 18px}
  .memo-item::before{left:0;top:0;bottom:0;width:3px;border-radius:0}
  .memo-item.active{background:rgba(19,121,108,.2)}
  .memo-item.active .mi-title{color:#fff}.memo-item.active .mi-date,.memo-item.active .mi-snippet,.memo-item.active .mi-imgs{color:var(--inv-sub)}
  .memo-item.active .chip.c0{background:rgba(45,160,145,.16);color:#7FD0C3}
  .memo-item.active .chip.c1{background:rgba(220,170,70,.15);color:#E2BC6F}
  .memo-item.active .chip.c2{background:rgba(215,110,80,.15);color:#E59A82}
  .memo-item.active .chip.c3{background:rgba(170,120,200,.15);color:#C9A3DC}
  .memo-item.active .chip.c4{background:rgba(90,150,215,.15);color:#8FB9E4}
  .memo-item.active .chip.c5{background:rgba(140,170,80,.15);color:#B4CB7E}
` };

/* ↓ 方向性の違う追加案 */
const C6 = { id: 'C6', name: '画像のあるメモは右にサムネイル（見た目で思い出せる）', css: `
  .memo-item.c6{display:flex;gap:10px}
  .c6 .c6-main{flex:1;min-width:0}
  .c6-thumb{flex-shrink:0;width:48px;height:48px;border-radius:6px;object-fit:cover;align-self:center;border:1px solid var(--ink-700)}
`, js: `(async () => {
  window.__thumbs = {};
  for (const m of state.memos) if (m.imageCount > 0) {
    const imgs = await Store.byIndex('images', 'memoId', m.id);
    if (imgs[0]) __thumbs[m.id] = URL.createObjectURL(imgs[0].blob);
  }
  ${OVERRIDE(`const tags = p.tags.slice(0, 3).map(t => tagChip(t)).join('');
    const th = __thumbs[m.id] ? '<img class="c6-thumb" src="' + __thumbs[m.id] + '">' : '';
    return '<li class="memo-item c6' + p.active + '" ' + p.attrs + '><div class="c6-main"><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span><span class="mi-date mono">' + p.rel + '</span></div>' +
    (p.snippet ? '<div class="mi-snippet">' + p.snippet + '</div>' : '') + '<div class="mi-foot"><div class="mi-tags">' + tags + '</div>' + (th ? '' : p.counts) + '</div></div>' + th + '</li>';`)}
})()` };

const C7 = { id: 'C7', name: 'タイトル1行の高密度リスト（抜粋はマウスを乗せたとき）', css: `
  .memo-item.c7{display:flex;align-items:center;gap:8px;padding:7px 12px 7px 16px;margin:0}
  .c7 .mi-title{font-weight:600;font-size:13px}
  .c7 .mi-imgs{font-size:10px}
`, js: OVERRIDE(`return '<li class="memo-item c7' + p.active + '" ' + p.attrs + ' title="' + esc(memoPlainBody(m).slice(0, 120)) + '">' + p.markEl + '<span class="mi-title">' + p.title + '</span>' + p.counts + '<span class="mi-date mono">' + p.rel + '</span></li>';`) };

/* ===== 2回目：2行（C1）＋文字のタグ（C2）＋密度（C7）＋サムネイル（C6）＋区切り線（C5） ===== */
const L2CSS = `
  .memo-item.l2{padding:9px 12px 9px 16px}
  .l2 .mi-line2{margin-top:3px;display:flex;align-items:center;gap:8px;min-width:0;font-size:11.5px;color:var(--inv-sub)}
  .l2.active .mi-line2{color:var(--text-sub)}
  .l2 .mi-line2 .s{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .l2 .tg{font-size:11px;font-weight:600;margin-right:6px}
  .l2 .tg.c0{color:#7FD0C3}.l2 .tg.c1{color:#E2BC6F}.l2 .tg.c2{color:#E59A82}.l2 .tg.c3{color:#C9A3DC}.l2 .tg.c4{color:#8FB9E4}.l2 .tg.c5{color:#B4CB7E}
  .l2.active .tg.c0{color:#0E5B51}.l2.active .tg.c1{color:#7A5A14}.l2.active .tg.c2{color:#93402C}.l2.active .tg.c3{color:#6B3E7E}.l2.active .tg.c4{color:#2D5A87}.l2.active .tg.c5{color:#4E661F}
`;
const L2 = (extra = '') => `const tg = p.tags.slice(0, 3).map(t => '<span class="tg ' + tagClass(t) + '">#' + esc(t) + '</span>').join('');
  ${extra}
  return '<li class="memo-item l2' + p.active + '" ' + p.attrs + '>' + (typeof th !== 'undefined' ? th : '') + '<div class="mi-main"><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span><span class="mi-date mono">' + p.rel + '</span></div>' +
    '<div class="mi-line2"><span class="s">' + tg + p.snippet + '</span>' + p.counts + '</div></div></li>';`;
const C8 = { id: 'C8', name: '2行：タイトル＋日付／#タグ（文字）＋抜粋＋件数', css: L2CSS, js: OVERRIDE(L2()) };
const C9 = { id: 'C9', name: '3行を詰める：タイトル＋日付／抜粋／#タグ＋件数（小さく）', css: `
  .memo-item.c9{padding:8px 12px 8px 16px}
  .c9 .mi-snippet{margin-top:2px}
  .c9 .mi-meta{margin-top:2px;display:flex;align-items:center;gap:8px;font-size:10.5px;white-space:nowrap;overflow:hidden}
  .c9 .mi-meta .t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis}
` + L2CSS.replace(/\.l2 \.tg/g, '.c9 .tg').replace(/\.l2\.active \.tg/g, '.c9.active .tg'), js: OVERRIDE(`const tg = p.tags.slice(0, 4).map(t => '<span class="tg ' + tagClass(t) + '">#' + esc(t) + '</span>').join('');
  return '<li class="memo-item c9' + p.active + '" ' + p.attrs + '><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span><span class="mi-date mono">' + p.rel + '</span></div>' +
    (p.snippet ? '<div class="mi-snippet">' + p.snippet + '</div>' : '') + ((tg || p.counts) ? '<div class="mi-meta"><span class="t">' + tg + '</span>' + p.counts + '</div>' : '') + '</li>';`) };
const C10 = { id: 'C10', name: 'C8＋画像のあるメモは左に小さなサムネイル', css: L2CSS + `
  .memo-item.l2{display:flex;gap:10px;align-items:center}
  .l2 .mi-main{flex:1;min-width:0}
  .l2 .c10-th{flex-shrink:0;width:36px;height:36px;border-radius:6px;object-fit:cover;border:1px solid var(--ink-700)}
`, js: `(async () => {
  window.__thumbs = {};
  for (const m of state.memos) if (m.imageCount > 0) {
    const imgs = await Store.byIndex('images', 'memoId', m.id);
    if (imgs[0]) __thumbs[m.id] = URL.createObjectURL(imgs[0].blob);
  }
  ${OVERRIDE(L2(`const th = __thumbs[m.id] ? '<img class="c10-th" src="' + __thumbs[m.id] + '">' : '';`))}
})()` };
const C11 = { id: 'C11', name: 'C8＋区切り線のリスト（選択は暗い地＋左の帯）', css: L2CSS + C5.css + `
  .memo-item.l2{padding:10px 14px 10px 18px}
  .l2.active .mi-line2{color:var(--inv-sub)}
  .l2.active .tg.c0{color:#7FD0C3}.l2.active .tg.c1{color:#E2BC6F}.l2.active .tg.c2{color:#E59A82}.l2.active .tg.c3{color:#C9A3DC}.l2.active .tg.c4{color:#8FB9E4}.l2.active .tg.c5{color:#B4CB7E}
`, js: OVERRIDE(L2()) };

/* ===== 3回目 ===== */
const C12 = { id: 'C12', name: '2行：タイトル＋日付／抜粋（先）＋右寄せのタグ2つ＋件数', css: L2CSS + `
  .l2 .tgs{flex-shrink:0;display:flex;gap:6px;max-width:45%;overflow:hidden}
  .l2 .tgs .tg{margin:0;white-space:nowrap}
  .l2 .tgs .more{font-size:10.5px;opacity:.7}
`, js: OVERRIDE(`const tags = p.tags.slice(0, 2).map(t => '<span class="tg ' + tagClass(t) + '">#' + esc(t) + '</span>').join('') + (p.tags.length > 2 ? '<span class="more">+' + (p.tags.length - 2) + '</span>' : '');
  return '<li class="memo-item l2' + p.active + '" ' + p.attrs + '><div class="mi-main"><div class="mi-top">' + p.markEl + '<span class="mi-title">' + p.title + '</span><span class="mi-date mono">' + p.rel + '</span></div>' +
    '<div class="mi-line2"><span class="s">' + (p.snippet || '<span style="opacity:.6">（本文なし）</span>') + '</span>' + (tags ? '<span class="tgs">' + tags + '</span>' : '') + p.counts + '</div></div></li>';`) };
const C13 = { id: 'C13', name: 'C8＋開いているメモだけ3行に広げる', css: L2CSS + `
  .l2.active .mi-line2 .s{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
`, js: OVERRIDE(L2()) };
const C14 = { id: 'C14', name: 'C8＋区切り線（選択は明るいカードのまま）', css: L2CSS + `
  .memo-list{padding:0 8px 12px}
  .memo-item.l2{margin:0;border-radius:8px}
  .memo-item.l2:not(.active) + .memo-item.l2:not(.active)::after,.memo-item.l2:first-child:not(.active)::after{content:"";position:absolute;left:16px;right:12px;top:0;border-top:1px solid var(--ink-line)}
  .memo-item.l2:first-child:not(.active)::after{display:none}
` , js: OVERRIDE(L2()) };
const C15 = { id: 'C15', name: '3行を最小の余白で：タイトル＋日付／抜粋／#タグ＋件数＋区切り線', css: C9.css + `
  .memo-item.c9{padding:7px 12px 7px 16px;margin:0}
  .c9 .mi-snippet{margin-top:1px}.c9 .mi-meta{margin-top:1px}
  .memo-item.c9:not(.active) + .memo-item.c9:not(.active)::after{content:"";position:absolute;left:16px;right:12px;top:0;border-top:1px solid var(--ink-line)}
`, js: C9.js };

export default {
  key: 'C', compositeHeight: 900,
  shots: [
    { w: 1440, h: 900, key: 'default', clip: clip(900) },
    { w: 1440, h: 900, key: 'search', clip: clip(900) },
    { w: 1024, h: 768, key: '1024', clip: clip(768) },
  ],
  scene: async (p, { shot }) => {
    if (shot.key === 'search') { await p.locator('#searchInput').fill('会議'); await p.locator('#searchInput').blur(); await p.waitForTimeout(400); }
  },
  rounds: { r1: [C0, C1, C2, C3, C4, C5, C6, C7], r2: [C1, C2, C7, C8, C9, C10, C11], r3: [C8, C9, C11, C12, C13, C14, C15] },
  parts: { PRE, OVERRIDE, C1, C2, C3, C4, C5, C6, C7 },
};
