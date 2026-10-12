/* 項目H：メタ情報の行（目印・タグ・画像の追加）の折り返し（不具合 2・3） */
const D = (w) => ({ x: w > 768 ? 312 : 0, y: 0, width: w > 768 ? w - 312 : w, height: 260 });
const MANY = '私用, 買い物, 週末, 食料品, スーパー, 日用品, 予算, 家計, 定期購入, まとめ買い, 生鮮';
const ALIGN = `.meta-row{align-items:flex-start}.mark-wrap,.meta-sep,#btnAddMedia{margin-top:2px}.meta-sep{margin-top:5px}#tagEntry{min-width:64px;flex:1 1 64px}`;

const H0 = { id: 'H0', name: '現行（参考）', css: '' };
const H1 = { id: 'H1', name: '上端そろえ＋入力欄を細く', css: ALIGN };
const H2 = { id: 'H2', name: 'H1＋狭い画面は追加ボタンをアイコンだけに', css: ALIGN + `@media (max-width:768px){#btnAddMedia{font-size:0;width:28px;padding:0;justify-content:center}#btnAddMedia i{font-size:12px}}` };
const H3 = { id: 'H3', name: 'タグを独立した2行目に（1行目は目印と追加）', css: `.meta-row{flex-wrap:wrap}.meta-sep{display:none}.tag-editor{order:5;flex-basis:100%}#btnAddMedia{margin-left:auto}` };
const H4 = { id: 'H4', name: 'タグは1行に収め、あふれた分は「+N」', css: ALIGN + `.tag-editor{flex-wrap:nowrap;overflow:hidden}.tag-chip{flex-shrink:0}`, js: `(() => {
  const ed = refs.tagEditor; const chips = [...ed.querySelectorAll('.tag-chip')]; let n = 0;
  while (ed.scrollWidth > ed.clientWidth + 1 && chips.length) { chips.pop().remove(); n++; }
  if (n) { const m = document.createElement('button'); m.className = 'chip c4 tag-chip'; m.textContent = '+' + n; refs.tagEntry.before(m);
    while (ed.scrollWidth > ed.clientWidth + 1 && chips.length) { chips.pop().remove(); n++; m.textContent = '+' + n; } }
})()` };
const H5 = { id: 'H5', name: 'タグを1行の横スクロールに', css: ALIGN + `.tag-editor{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.tag-chip{flex-shrink:0}` };
/* ↓ 方向性の違う追加案 */
const H6 = { id: 'H6', name: 'タグは「タグ N」ボタン1つ、押すと編集パネル', css: `.tag-chips,#tagEntry{display:none}.h6{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border:1px solid var(--line);border-radius:6px;font-size:12px;color:var(--text)}`, js: `(() => {
  const n = parseTags(refs.tagsInput.value); const b = document.createElement('button'); b.className = 'h6';
  b.innerHTML = '<i class="fa-solid fa-tags"></i>' + (n.length ? n.slice(0,2).map(esc).join('・') + (n.length > 2 ? ' ほか' + (n.length - 2) : '') : 'タグを追加');
  refs.tagEditor.append(b); })()` };
const H7 = { id: 'H7', name: 'H1＋画像の追加をツールバーのクリップへ移す', css: ALIGN + `#btnAddMedia{display:none !important}.h7{width:30px;height:30px}`, js: `(() => {
  const b = document.createElement('button'); b.className = 'icon-btn h7'; b.title = '画像・ファイルを追加'; b.innerHTML = '<i class="fa-solid fa-paperclip"></i>';
  document.getElementById('btnLink').after(b); })()` };

/* ===== 2回目 ===== */
const SHORT = (mq) => `@media ${mq}{#btnAddMedia{font-size:0;gap:0;padding:0 9px}#btnAddMedia i{font-size:11px}#btnAddMedia::after{content:'追加';font-size:11px;margin-left:5px}}`;
const H8  = { id: 'H8',  name: 'H1＋狭い画面は追加ボタンを「📎 追加」に短縮', css: ALIGN + SHORT('(max-width:768px)') };
const H9  = { id: 'H9',  name: 'PC は H1、狭い画面はタグを独立した2行目に', css: ALIGN + `@media (max-width:768px){.meta-row{flex-wrap:wrap}.meta-sep{display:none}.tag-editor{order:5;flex-basis:100%}#btnAddMedia{margin-left:auto}}` };
const H10 = { id: 'H10', name: 'H1＋追加ボタンはどの幅でも「📎 追加」', css: ALIGN + SHORT('all') };
const H11 = { id: 'H11', name: 'H9＋狭い画面の追加ボタンは「📎 追加」', css: H9.css + SHORT('(max-width:768px)') };
export default {
  key: 'H', compositeHeight: 260,
  shots: [
    { w: 390, h: 844, key: '390-1tag', clip: D(390), open: { title: '買い物リスト' } },
    { w: 390, h: 844, key: '390-img', clip: D(390) },
    { w: 1440, h: 900, key: '1440-many', clip: D(1440), open: { title: '買い物リスト' } },
    { w: 1024, h: 768, key: '1024', clip: D(1024) },
  ],
  scene: async (p, { shot, variant }) => {
    if (shot.key === '1440-many') {
      await p.evaluate(m => { refs.tagsInput.value = m; renderTagsPreview(); }, MANY);
      if (variant.js) await p.evaluate(variant.js);
    }
  },
  rounds: { r1: [H0, H1, H2, H3, H4, H5, H6, H7], r2: [H2, H3, H7, H8, H9, H10, H11] },
};
