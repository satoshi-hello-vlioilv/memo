/* 項目M：本文の左右の余白（ユーザー指摘：両サイドの余白が気になる）
   現行は文字の列を最大 860px に収め、残りを左右の余白にしている（1440 幅で左右 134px） */
const R = css => `.editor-sheet{${css}}`;

const M0 = { id: 'M0', name: '現行（参考）：行長 860px・余白は最小 28px', css: '' };
const M1 = { id: 'M1', name: '行長を 1040px に広げる', css: R('--col:max(28px, calc((100% - 1040px) / 2))') };
const M2 = { id: 'M2', name: '余白を幅の 4%（最小 20px・最大 56px）、行長の上限なし', css: R('--col:clamp(20px, 4%, 56px)') };
const M3 = { id: 'M3', name: '余白を固定 40px、行長の上限なし', css: R('--col:40px') };
const M4 = { id: 'M4', name: '行長 960px＋余白は最小 32px', css: R('--col:max(32px, calc((100% - 960px) / 2))') };
const M5 = { id: 'M5', name: '本文は広く（余白 40px）、見出し部だけ行長 860px で中央', css: `
  .editor-sheet{--col:40px}
  .sheet-head{padding-left:max(40px, calc((100% - 860px) / 2));padding-right:max(40px, calc((100% - 860px) / 2))}` };
/* ↓ 方向性の違う追加案 */
const M6 = { id: 'M6', name: '左寄せの紙（行長 1040px、右側の余りに余白を集める）', css: R('--col:32px') + `
  .sheet-head,.toolbar,.body-editable{padding-right:max(32px, calc(100% - 1040px - 32px))}` };
const M7 = { id: 'M7', name: '文字の大きさで行長を決める（1行 約 64 文字＝ 64em）', css: R('--col:max(28px, calc((100% - 64em) / 2))') + `.editor-sheet{font-size:15px}` };

/* ===== 2回目：比例の余白（M2）＋大画面だけの行長の上限（M1） ===== */
const COMBO = (pad, cap) => R(`--col:max(${pad}, calc((100% - ${cap}) / 2))`);
const M8  = { id: 'M8',  name: '余白 幅の3%（20〜48px）＋行長の上限 1120px', css: COMBO('clamp(20px, 3%, 48px)', '1120px') };
const M9  = { id: 'M9',  name: '余白 幅の3%（20〜48px）＋行長の上限 1240px', css: COMBO('clamp(20px, 3%, 48px)', '1240px') };
const M10 = { id: 'M10', name: '余白 幅の4%（20〜56px）＋行長の上限 1240px', css: COMBO('clamp(20px, 4%, 56px)', '1240px') };
const M11 = { id: 'M11', name: '余白 幅の3%（20〜48px）・上限なし、広い画面は文字を 16px に', css: R('--col:clamp(20px, 3%, 48px)') + `@media (min-width:1600px){.body-editable{font-size:16px}}` };
export default {
  key: 'M', compositeHeight: 560,
  shots: [
    { w: 1440, h: 900, key: '1440' },
    { w: 1920, h: 1080, key: '1920' },
    { w: 1440, h: 900, key: 'panel' },
    { w: 1024, h: 768, key: '1024' },
  ],
  before: async (p, { shot }) => { if (shot.key === 'panel') { await p.evaluate(() => togglePanel(true)); await p.waitForTimeout(300); } },
  rounds: { r1: [M0, M1, M2, M3, M4, M5, M6, M7], r2: [M2, M1, M3, M8, M9, M10, M11] },
};
