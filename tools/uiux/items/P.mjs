/* 項目P：画像パネルを開いたときの本文上の帯（不具合7：同じ画像が2か所に並ぶ） */
const ed = (w, h) => ({ x: 312, y: 0, width: w - 312, height: h });
const OPEN = '#app:not(.panel-closed)';

const P0 = { id: 'P0', name: '現行（参考）', css: '' };
const P1 = { id: 'P1', name: 'パネルを開いている間は帯を隠す（閉じるのはパネルの »）', css: `@media (min-width:769px){${OPEN} #mediaStrip{display:none !important}}` };
const P2 = { id: 'P2', name: '帯を1行の要約に（画像2・添付2 を右に表示中 ＋ 閉じる）', css: `@media (min-width:769px){
  ${OPEN} #mediaStrip > .ms-thumb, ${OPEN} #mediaStrip > .ms-file{display:none}
  ${OPEN} #mediaStrip::before{content:attr(data-sum);font-size:12px;color:var(--text-sub);display:inline-flex;align-items:center}
  ${OPEN} #mediaStrip{padding-bottom:10px}}`,
  js: `(() => { refs.mediaStrip.dataset.sum = '画像 ' + state.images.length + '・添付 ' + state.attachments.length + ' を右のパネルに表示中'; })()` };
const P3 = { id: 'P3', name: '画像だけ隠し、添付ファイルは帯に残す', css: `@media (min-width:769px){${OPEN} #mediaStrip > .ms-thumb{display:none}}` };
const P4 = { id: 'P4', name: '帯は残し、パネルとの対応を枠で示す', css: `@media (min-width:769px){${OPEN} .ms-thumb{border-color:var(--primary);box-shadow:0 0 0 2px var(--primary-soft)}}` };
const P5 = { id: 'P5', name: '帯を隠し、メタ情報の行に「📎 追加」だけ出す（画像なしと同じ見た目）', css: `@media (min-width:769px){${OPEN} #mediaStrip{display:none !important}${OPEN} #btnAddMedia{display:inline-flex !important}}` };
/* ↓ 方向性の違う追加案 */
const P6 = { id: 'P6', name: '役割を分ける：パネルは画像だけ、添付ファイルは帯だけ', css: `@media (min-width:769px){
  ${OPEN} #mediaStrip > .ms-thumb{display:none}
  .attach-head,#attachList,#attachEmpty{display:none !important}}` };
const P7 = { id: 'P7', name: '帯をパネルの目次に（押すとパネルの画像へ移動、細く1列）', css: `@media (min-width:769px){
  ${OPEN} #mediaStrip .ms-thumb{width:32px;height:24px;opacity:.75}
  ${OPEN} #mediaStrip .ms-file{height:24px;font-size:11px}
  ${OPEN} #mediaStrip .ms-add{width:24px;height:24px}
  ${OPEN} #mediaStrip{padding-bottom:8px}}` };

/* ===== 2回目 ===== */
const CHIP = (label) => ({
  css: `@media (min-width:769px){${OPEN} #mediaStrip{display:none !important}}
  .p8{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;margin-top:2px;border-radius:14px;flex-shrink:0;
      border:1px solid var(--primary-line);background:var(--primary-soft);color:var(--primary-deep);font-size:11.5px;white-space:nowrap}
  .p8 b{font-family:var(--font-mono);font-weight:600}`,
  js: `(() => { const b = document.createElement('button'); b.className = 'p8'; b.title = '右のパネルを閉じる';
    b.innerHTML = ${label}; document.querySelector('.meta-row').append(b); })()` });
const P8  = { id: 'P8',  name: '帯を隠し、メタ情報の行に「画像2・添付2 表示中 ✕」', ...CHIP(`'<i class="fa-solid fa-table-columns"></i>画像 <b>' + state.images.length + '</b>・添付 <b>' + state.attachments.length + '</b> を表示中<i class="fa-solid fa-xmark"></i>'`) };
const P9  = { id: 'P9',  name: 'P2 の要約を細く（1行全体が押せる「閉じる」）', css: P2.css + `@media (min-width:769px){${OPEN} #mediaStrip > .ms-add{display:none}${OPEN} #mediaStrip{padding:0 0 8px}${OPEN} #mediaStrip .ms-panel{height:26px}}`, js: P2.js };
const P10 = { id: 'P10', name: '帯を隠し、メタ情報の行に「パネルを閉じる」', ...CHIP(`'<i class="fa-solid fa-xmark"></i>パネルを閉じる'`) };
const P11 = { id: 'P11', name: 'P2 から「＋」を外す（追加はパネルの＋に一本化）', css: P2.css + `@media (min-width:769px){${OPEN} #mediaStrip > .ms-add{display:none}}`, js: P2.js };
export default {
  key: 'P', compositeHeight: 520,
  before: async (p, { shot }) => { if (shot.key !== 'closed') { await p.evaluate(() => togglePanel(true)); await p.waitForTimeout(300); } },
  shots: [
    { w: 1440, h: 900, key: 'open', clip: ed(1440, 520) },
    { w: 1440, h: 900, key: 'closed', clip: ed(1440, 520) },
    { w: 1024, h: 768, key: '1024', clip: ed(1024, 520) },
  ],
  rounds: { r1: [P0, P1, P2, P3, P4, P5, P6, P7], r2: [P2, P1, P5, P8, P9, P10, P11] },
};
