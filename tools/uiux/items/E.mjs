/* 項目E：書式ツールバーと保存・操作（フッター） */
const edc = (w, h) => ({ x: 312, y: 0, width: w - 312, height: h });

/* 共通：コピー・削除を「…」メニューへ移す */
const MORE_ACTS = `(() => {
  const tm = document.getElementById('toolMore');
  const sep = document.createElement('div'); sep.className = 'tool-more-sep';
  const cp = document.getElementById('btnCopyText'), del = document.getElementById('btnDelete');
  cp.className = 'tool-more-item'; cp.innerHTML = '<i class="fa-regular fa-copy"></i> テキストをコピー';
  del.className = 'tool-more-item e-danger'; del.innerHTML = '<i class="fa-regular fa-trash-can"></i> このメモを削除';
  tm.append(sep, cp, del);
})()`;
const MORE_CSS = `.e-danger{color:var(--rec) !important}.e-danger i{color:var(--rec) !important}`;
const SAVE_SMALL = `(() => { const b = document.getElementById('btnSave'); b.classList.add('e-save'); b.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> 保存'; b.title = '保存（Ctrl+S）'; })()`;
const SAVE_CSS = `.e-save{height:30px;padding:0 12px;font-size:12.5px}`;

const E0 = { id: 'E0', name: '現行（参考）', css: '' };

const E1 = { id: 'E1', name: 'ツールバーの右端に保存状態と保存（フッターなし）', css: MORE_CSS + SAVE_CSS + `
  .sheet-foot{display:none !important}
  .toolbar-end{display:flex;align-items:center;gap:8px}
  .toolbar-end .save-state{font-size:11.5px;white-space:nowrap}
  .e-info{padding:6px 10px 2px;font-size:11px;color:var(--text-sub)}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const end = document.querySelector('.toolbar-end'); const wrap = document.querySelector('.tool-more-wrap');
  end.insertBefore(document.getElementById('saveState'), wrap); end.insertBefore(document.getElementById('btnSave'), wrap);
  const info = document.createElement('div'); info.className = 'e-info';
  info.textContent = document.getElementById('charCount').textContent + ' 文字・' + document.getElementById('footDates').textContent;
  document.getElementById('toolMore').append(info);
})()` };

const E2 = { id: 'E2', name: '保存と操作をタイトルの右上に（文書アプリ型）', css: MORE_CSS + SAVE_CSS + `
  .sheet-foot{display:none !important}
  .sheet-head{position:relative}
  .e-acts{position:absolute;top:16px;right:var(--col);display:flex;align-items:center;gap:8px}
  .e-acts .save-state{font-size:11.5px}
  .sheet-head .title-input{padding-right:220px}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const head = document.querySelector('.sheet-head'); const a = document.createElement('div'); a.className = 'e-acts';
  a.append(document.getElementById('saveState'), document.getElementById('btnSave'));
  head.append(a);
})()` };

const E3 = { id: 'E3', name: 'フッターを細いステータス行に、保存はツールバーの右端', css: MORE_CSS + SAVE_CSS + `
  .sheet-foot{padding-top:3px;padding-bottom:3px;min-height:26px}
  .sheet-foot .foot-right{display:none}
  .toolbar-end{display:flex;align-items:center;gap:8px}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const end = document.querySelector('.toolbar-end'); end.insertBefore(document.getElementById('btnSave'), document.querySelector('.tool-more-wrap'));
})()` };

const E4 = { id: 'E4', name: 'ツールバーを整理（区切り・「文字色」ボタン）＋フッターを細く', css: SAVE_CSS + `
  .toolbar{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface);gap:2px}
  .tool-group{gap:2px}
  .tool-div,.e-div{width:1px;height:20px;background:var(--line);margin:0 6px}
  .color-tool{border:1px solid var(--line);border-radius:6px;padding:0 6px;height:30px;display:inline-flex;align-items:center;gap:5px}
  .color-tool::after{content:'文字色';font-size:11.5px;color:var(--text-sub)}
  .sheet-foot{padding-top:6px;padding-bottom:6px}
  .sheet-foot .btn{height:30px;font-size:12.5px}
  #btnDelete{display:none}
  #btnCopyText{width:30px;padding:0;justify-content:center;font-size:0}#btnCopyText i{font-size:13px}
`, js: SAVE_SMALL + `;(() => {
  const g = document.querySelectorAll('.toolbar .tool-group')[1];
  const mk = () => { const d = document.createElement('span'); d.className = 'e-div'; return d; };
  g.insertBefore(mk(), document.getElementById('btnBold'));
  g.insertBefore(mk(), document.getElementById('fontSizeSelect'));
  g.insertBefore(mk(), document.getElementById('btnClearFormat'));
})()` };

const E5 = { id: 'E5', name: '保存ボタンをやめ「自動保存」の表示に（Ctrl+S は残す）', css: MORE_CSS + `
  .sheet-foot .foot-right{display:none}
  .sheet-foot{padding-top:4px;padding-bottom:4px}
  .e-auto{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--primary);font-weight:600}
`, js: MORE_ACTS + `;(() => {
  const ss = document.getElementById('saveState'); ss.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> 自動で保存しています（最終 ' + (document.getElementById('stampUpdated').textContent) + '）';
})()` };

/* ↓ 方向性の違う追加案 */
const E6 = { id: 'E6', name: '書式は文字を選んだときだけ浮かぶバーで（常設は段落と取り消しだけ）', css: MORE_CSS + SAVE_CSS + `
  .e6-float{position:fixed;z-index:80;display:flex;align-items:center;gap:2px;padding:4px 6px;background:var(--ink-900);border-radius:9px;box-shadow:var(--shadow-2)}
  .e6-float .icon-btn{color:#E8EEF1}.e6-float .fmt-select{height:28px}
  .e6-float.off{display:none}
  .toolbar .e-hint{font-size:11.5px;color:var(--text-sub);margin-left:6px}
  .sheet-foot .foot-right{display:none}
  .toolbar-end{display:flex;align-items:center;gap:8px}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const f = document.createElement('div'); f.className = 'e6-float off';
  ['btnBold', 'btnItalic', 'btnLink', 'fontSizeSelect'].forEach(id => f.append(document.getElementById(id)));
  f.append(document.querySelector('.color-tool'), document.getElementById('btnClearFormat'));
  document.body.append(f);
  const h = document.createElement('span'); h.className = 'e-hint'; h.textContent = '文字を選ぶと書式のバーが出ます';
  document.querySelectorAll('.toolbar .tool-group')[1].append(h);
  const end = document.querySelector('.toolbar-end'); end.insertBefore(document.getElementById('btnSave'), document.querySelector('.tool-more-wrap'));
})()`, scene: async (p, { shot }) => {
  if (shot.key !== 'sel') return;
  await p.evaluate(() => { const f = document.querySelector('.e6-float'); const r = getSelection().getRangeAt(0).getBoundingClientRect();
    f.classList.remove('off'); f.style.left = Math.max(8, r.left) + 'px'; f.style.top = (r.top - 46) + 'px'; });
} };

const E7 = { id: 'E7', name: 'ツールバーと保存を本文の下にまとめる（親指の届く位置）', css: MORE_CSS + SAVE_CSS + `
  .sheet-foot{display:none !important}
  .toolbar{border-top:1px solid var(--line);border-bottom:none}
  .toolbar-end{display:flex;align-items:center;gap:8px}
  .toolbar-end .save-state{font-size:11.5px;white-space:nowrap}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const sheet = document.querySelector('.editor-sheet'); const tb = document.querySelector('.toolbar');
  sheet.insertBefore(tb, document.querySelector('.sheet-foot'));
  const end = document.querySelector('.toolbar-end'); const wrap = document.querySelector('.tool-more-wrap');
  end.insertBefore(document.getElementById('saveState'), wrap); end.insertBefore(document.getElementById('btnSave'), wrap);
})()` };

/* ===== 2回目 ===== */
const AUTO = `(() => { const ss = document.getElementById('saveState'); ss.innerHTML = '<i class="fa-solid fa-circle-check"></i> 自動保存済み ' + document.getElementById('stampUpdated').textContent; ss.title = '入力は自動で保存されます（Ctrl+S ですぐ保存）'; })()`;
const SLIM_FOOT = `.sheet-foot{padding-top:4px;padding-bottom:4px;min-height:28px}`;
const HEAD_MORE = `(() => {
  const head = document.querySelector('.sheet-head'); const b = document.createElement('button'); b.className = 'icon-btn e-hmore'; b.title = 'このメモの操作（コピー・削除）'; b.innerHTML = '<i class="fa-solid fa-ellipsis"></i>';
  head.append(b);
})()`;
const HEAD_MORE_CSS = `.sheet-head{position:relative}.e-hmore{position:absolute;top:18px;right:calc(var(--col) - 6px)}.sheet-head .title-input{padding-right:40px}`;
const E8 = { id: 'E8', name: '自動保存＋細いステータス行＋操作はタイトル右上の「…」', css: SLIM_FOOT + HEAD_MORE_CSS + `.sheet-foot .foot-right{display:none}`, js: AUTO + ';' + HEAD_MORE };
const E9 = { id: 'E9', name: '保存はタイトル右上＋ツールバー整理＋細いステータス行', css: MORE_CSS + SAVE_CSS + E4.css.replace('#btnDelete{display:none}', '').replace(/#btnCopyText[^\n]*\n/, '') + SLIM_FOOT + `
  .sheet-foot .foot-right{display:none}
  .sheet-head{position:relative}
  .e-acts{position:absolute;top:16px;right:var(--col);display:flex;align-items:center;gap:6px}
  .sheet-head .title-input{padding-right:120px}
  @media (max-width:768px){ .e-acts{position:static;justify-content:flex-end;margin:-4px 0 6px} .sheet-head .title-input{padding-right:0} }
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const g = document.querySelectorAll('.toolbar .tool-group')[1];
  const mk = () => { const d = document.createElement('span'); d.className = 'e-div'; return d; };
  g.insertBefore(mk(), document.getElementById('btnBold')); g.insertBefore(mk(), document.getElementById('fontSizeSelect')); g.insertBefore(mk(), document.getElementById('btnClearFormat'));
  const head = document.querySelector('.sheet-head'); const a = document.createElement('div'); a.className = 'e-acts';
  a.append(document.getElementById('btnSave')); head.insertBefore(a, refs.titleInput.nextSibling);
})()` };
const E10 = { id: 'E10', name: '自動保存＋フッターなし（状態はツールバー右端、操作は「…」）', css: MORE_CSS + `
  .sheet-foot{display:none !important}
  .toolbar-end{display:flex;align-items:center;gap:8px}
  .toolbar-end .save-state{font-size:11.5px;white-space:nowrap}
`, js: MORE_ACTS + ';' + AUTO + `;(() => { const end = document.querySelector('.toolbar-end'); end.insertBefore(document.getElementById('saveState'), document.querySelector('.tool-more-wrap')); })()` };
const E11 = { id: 'E11', name: 'ツールバー整理＋細いステータス行の右端に小さな保存', css: MORE_CSS + SAVE_CSS + E4.css.replace('#btnDelete{display:none}', '').replace(/#btnCopyText[^\n]*\n/, '') + SLIM_FOOT + `
  #btnCopyText,#btnDelete{display:none}
  .sheet-foot .e-save{height:26px;font-size:12px}
`, js: MORE_ACTS + ';' + SAVE_SMALL + `;(() => {
  const g = document.querySelectorAll('.toolbar .tool-group')[1];
  const mk = () => { const d = document.createElement('span'); d.className = 'e-div'; return d; };
  g.insertBefore(mk(), document.getElementById('btnBold')); g.insertBefore(mk(), document.getElementById('fontSizeSelect')); g.insertBefore(mk(), document.getElementById('btnClearFormat'));
})()` };

/* ===== 3回目：状態つきの保存ボタン（保存済み=控えめ／未保存=強調）＋整理したツールバー ===== */
const GROUPS = `(() => {
  const g = document.querySelectorAll('.toolbar .tool-group')[1];
  const mk = () => { const d = document.createElement('span'); d.className = 'e-div'; return d; };
  g.insertBefore(mk(), document.getElementById('btnBold')); g.insertBefore(mk(), document.getElementById('fontSizeSelect')); g.insertBefore(mk(), document.getElementById('btnClearFormat'));
})()`;
const GROUPS_CSS = `
  .toolbar{border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface);gap:2px}
  .tool-group{gap:2px}
  .e-div{width:1px;height:20px;background:var(--line);margin:0 6px}
`;
const COMBO = dirty => `(() => {
  const b = document.getElementById('btnSave'); b.className = 'e-combo' + (${dirty} ? ' dirty' : '');
  b.innerHTML = ${dirty} ? '<i class="fa-solid fa-circle"></i> 保存' : '<i class="fa-solid fa-check"></i> 保存済み';
  b.title = ${dirty} ? '保存する（Ctrl+S）' : '保存済み（' + document.getElementById('stampUpdated').textContent + '）';
})()`;
const COMBO_CSS = `
  .e-combo{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:7px;font-size:12.5px;font-weight:600;white-space:nowrap;
    color:var(--primary);background:var(--primary-soft);border:1px solid var(--primary-line)}
  .e-combo i{font-size:10px}
  .e-combo.dirty{background:var(--primary);color:#fff;border-color:var(--primary);box-shadow:var(--shadow-1)}
  .e-combo.dirty i{font-size:7px;color:#FFD27A}
  .toolbar-end{display:flex;align-items:center;gap:6px}
`;
const INFO = `(() => { const info = document.createElement('div'); info.className = 'e-info';
  info.textContent = document.getElementById('charCount').textContent + ' 文字・' + document.getElementById('footDates').textContent;
  document.getElementById('toolMore').append(info); })()`;
const INFO_CSS = `.e-info{padding:6px 10px 2px;font-size:11px;color:var(--text-sub);border-top:1px solid var(--line);margin-top:4px}`;
const TO_END = `(() => { const end = document.querySelector('.toolbar-end'); end.insertBefore(document.getElementById('btnSave'), document.querySelector('.tool-more-wrap')); })()`;
const mkE = (id, name, css, js, dirty) => ({ id, name, css, js, scene: async (p, { shot }) => {
  if (!dirty) return;
  await p.evaluate(() => { markDirty(); });
} });
const E12 = { id: 'E12', name: '状態つき保存ボタン（ツールバー右端）＋フッターなし＋情報は「…」', css: MORE_CSS + GROUPS_CSS + COMBO_CSS + INFO_CSS + `.sheet-foot{display:none !important}`,
  js: MORE_ACTS + ';' + GROUPS + ';' + TO_END + ';' + COMBO(false) + ';' + INFO };
const E13 = { id: 'E13', name: 'E12＋文字数と日時は細いステータス行に残す', css: MORE_CSS + GROUPS_CSS + COMBO_CSS + SLIM_FOOT + `.sheet-foot .foot-right,#saveState,#saveState + .divider{display:none !important}`,
  js: MORE_ACTS + ';' + GROUPS + ';' + TO_END + ';' + COMBO(false) };
const E14 = { id: 'E14', name: 'E12 の未保存のとき（強調表示の確認用）', css: E12.css, js: E12.js.replace(COMBO(false), COMBO(true)) };
const E15 = { id: 'E15', name: '状態つき保存ボタンを紙の右下に浮かせる＋フッターなし', css: MORE_CSS + GROUPS_CSS + COMBO_CSS + INFO_CSS + `
  .sheet-foot{display:none !important}
  .editor-sheet{position:relative}
  .e-fab{position:absolute;right:calc(var(--col) - 8px);bottom:16px;z-index:5;box-shadow:var(--shadow-2)}
`, js: MORE_ACTS + ';' + GROUPS + ';' + COMBO(false) + `;(() => { const b = document.getElementById('btnSave'); b.classList.add('e-fab'); document.querySelector('.editor-sheet').append(b); })();` + INFO };

export default {
  key: 'E',
  shots: [
    { w: 1440, h: 900, key: '1440', clip: edc(1440, 900) },
    { w: 1440, h: 900, key: 'sel', clip: edc(1440, 900) },
    { w: 1024, h: 768, key: '1024', clip: edc(1024, 768) },
    { w: 390, h: 844, key: '390' },
  ],
  scene: async (p, { shot }) => {
    if (shot.key === 'sel') {
      await p.evaluate(() => {
        const el = document.getElementById('bodyInput'); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n; while ((n = w.nextNode())) if (n.textContent.includes('出席')) break;
        const r = document.createRange(); r.setStart(n, 0); r.setEnd(n, Math.min(8, n.textContent.length));
        const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.focus();
      });
      await p.waitForTimeout(150);
    }
  },
  rounds: { r1: [E0, E1, E2, E3, E4, E5, E6, E7], r2: [E5, E2, E3, E8, E9, E10, E11], r3: [E10, E11, E5, E12, E13, E14, E15] },
  parts: { MORE_ACTS, MORE_CSS, SAVE_SMALL, SAVE_CSS, E1, E2, E3, E4, E5, E6, E7 },
};
