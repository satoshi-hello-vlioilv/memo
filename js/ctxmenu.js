/* ============================================================
   ctxmenu.js
   本文エディタの右クリックメニューとクリップボード操作
   ============================================================ */
'use strict';

/* ============================================================
   本文エディタの右クリックメニュー（執筆補助）
   ============================================================ */
let ctxRange = null;   /* メニューを開いた時点の選択範囲を保持 */

const toHalfWidth = s => s
  .replace(/[Ａ-Ｚａ-ｚ０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
  .replace(/　/g, ' ');
const toFullWidth = s => s
  .replace(/[A-Za-z0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0))
  .replace(/ /g, '　');

/* 現在の選択範囲を置換し、結果を選択状態で残す */
function replaceSelection(newText) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const node = document.createTextNode(newText);
  range.insertNode(node);
  const nr = document.createRange();
  nr.selectNodeContents(node);
  sel.removeAllRanges();
  sel.addRange(nr);
  afterBodyEdit();
}

/* 折りたたみセクションの開閉状態（メニューを開き直しても保つ） */
const ctxOpenSections = new Set();
function buildCtxMenu(ctx) {
  const now = Date.now();
  const { hasSel, onLink } = ctx;
  /* 文字色のパレット。「既定」は色指定そのものを外すので、本文の地の色
     （黒）に正確に戻る。#000000 を当てると地の色とわずかに違う色になる */
  const COLORS = [
    { act: 'colorReset',      label: '既定（黒）', swatch: '#243038', reset: true },
    { act: 'color:#C0392B',   label: '赤',        swatch: '#C0392B' },
    { act: 'color:#D35400',   label: '橙',        swatch: '#D35400' },
    { act: 'color:#1E8449',   label: '緑',        swatch: '#1E8449' },
    { act: 'color:#1F6FB2',   label: '青',        swatch: '#1F6FB2' },
    { act: 'color:#7D3C98',   label: '紫',        swatch: '#7D3C98' },
  ];
  const sections = [
    { items: [
      { act: 'clipCut',   icon: 'fa-scissors',      label: '切り取り', keys: 'Ctrl+X', need: true },
      { act: 'clipCopy',  icon: 'fa-copy',          label: 'コピー',   keys: 'Ctrl+C', need: true },
      { act: 'clipPaste', icon: 'fa-paste',         label: '貼り付け', keys: 'Ctrl+V' },
    ]},
    { head: '書式', items: [
      { act: 'fmtBold',   icon: 'fa-bold',   label: '太字',   keys: '切替', need: true },
      { act: 'fmtItalic', icon: 'fa-italic', label: '斜体',   keys: '切替', need: true },
    ], sizes: [
      { act: 'size12', label: '小' },
      { act: 'size15', label: '標準' },
      { act: 'size19', label: '大' },
      { act: 'size24', label: '特大' },
      { act: 'size32', label: '最大' },
    ], colors: COLORS, after: [
      { act: 'fmtReset', icon: 'fa-rotate-left', label: '標準に戻す', need: true,
        title: '黒・標準サイズ・太さ普通に戻します' },
    ]},
    { head: 'リンク・画像', items: [
      { act: 'linkEdit', icon: 'fa-link', label: onLink ? 'リンクを編集…' : 'リンクを挿入…' },
      ...(onLink ? [
        { act: 'linkOpen',  icon: 'fa-arrow-up-right-from-square', label: 'リンクを開く' },
        { act: 'linkUnset', icon: 'fa-link-slash',                 label: 'リンクを解除' },
      ] : []),
      { act: 'addImage', icon: 'fa-image', label: '画像を挿入…' },
    ]},
    { head: '挿入', collapsible: 'insert', items: [
      { act: 'insDate',     icon: 'fa-calendar-day',   label: '日付',   hint: fmtDate(now) },
      { act: 'insTime',     icon: 'fa-clock',          label: '時刻',   hint: fmtTime(now) },
      { act: 'insDateTime', icon: 'fa-calendar-check', label: '日時' },
      { act: 'insBullet',   icon: 'fa-list-ul',        label: '箇条書き「・」' },
      { act: 'insCheck',    icon: 'fa-square-check',   label: 'チェックボックス' },
      { act: 'insRule',     icon: 'fa-grip-lines',     label: '区切り線' },
    ]},
    { head: '文字の変換', collapsible: 'convert', items: [
      { act: 'wrapKagi',  icon: 'fa-quote-left', label: '「」で囲む' },
      { act: 'wrapParen', icon: 'fa-quote-left', label: '（）で囲む' },
      { act: 'toHalf',    icon: 'fa-down-left-and-up-right-to-center',   label: '全角 → 半角', need: true },
      { act: 'toFull',    icon: 'fa-up-right-and-down-left-from-center', label: '半角 → 全角', need: true },
      { act: 'count',     icon: 'fa-calculator', label: '文字数を数える', need: true },
    ]},
  ];

  const renderItems = list => list.map(it => {
    const dis = it.need && !hasSel ? ' disabled' : '';
    return `<button class="ctx-item" data-act="${it.act}"${dis}` +
      (it.title ? ` title="${esc(it.title)}"` : '') + `>` +
      `<i class="fa-solid ${it.icon}"></i><span class="ctx-label">${esc(it.label)}</span>` +
      (it.keys ? `<span class="ctx-keys">${esc(it.keys)}</span>` : '') +
      (it.hint ? `<span class="ctx-hint mono">${esc(it.hint)}</span>` : '') +
      `</button>`;
  }).join('');

  let html = '';
  sections.forEach((s, si) => {
    if (si > 0) html += '<div class="ctx-sep"></div>';
    /* 使用頻度の低いまとまりは折りたたんでおき、メニュー全体を短く保つ */
    if (s.collapsible) {
      const open = ctxOpenSections.has(s.collapsible);
      html += `<button class="ctx-fold${open ? ' open' : ''}" data-fold="${s.collapsible}">` +
        `<i class="fa-solid ${open ? 'fa-chevron-down' : 'fa-chevron-right'}"></i>` +
        `<span>${s.head}</span></button>`;
      if (!open) return;
      html += `<div class="ctx-foldbody">${renderItems(s.items)}</div>`;
      return;
    }
    if (s.head) html += `<div class="ctx-head">${s.head}</div>`;
    if (s.items) html += renderItems(s.items);
    if (s.sizes) {
      const dis = hasSel ? '' : ' disabled';
      html += `<div class="ctx-row-label">文字サイズ</div><div class="ctx-row">` +
        s.sizes.map(it => `<button class="ctx-size" data-act="${it.act}"${dis}>${it.label}</button>`).join('') +
        `</div>`;
    }
    if (s.colors) {
      const dis = hasSel ? '' : ' disabled';
      html += `<div class="ctx-row-label">文字色</div><div class="ctx-row ctx-row--colors">` +
        s.colors.map(c =>
          `<button class="ctx-swatch${c.reset ? ' is-reset' : ''}" data-act="${c.act}"${dis}` +
          ` title="${esc(c.label)}" style="--sw:${c.swatch}"></button>`).join('') +
        `</div>`;
    }
    if (s.after) html += renderItems(s.after);
  });
  return html;
}

let ctxLinkEl = null;   /* メニューを開いた時点のリンク要素 */
function openCtxMenu(x, y) {
  const sel = window.getSelection();
  const inEditor = sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).startContainer);
  ctxRange = inEditor ? sel.getRangeAt(0).cloneRange() : null;
  ctxLinkEl = inEditor ? currentLinkEl() : null;
  const hasSel = !!(inEditor && !sel.isCollapsed && sel.toString().length > 0);
  renderCtxMenu({ hasSel, onLink: !!ctxLinkEl });
  refs.ctxMenu.hidden = false;
  positionCtxMenu(x, y);
}
/* 折りたたみの開閉でメニューの高さが変わるため、描画と位置決めを分けておく。
   引数を省略すると直前の状態のまま描き直す（折りたたみのトグル用） */
let ctxState = { hasSel: false, onLink: false };
function renderCtxMenu(next) {
  if (next) ctxState = next;
  refs.ctxMenu.innerHTML = buildCtxMenu(ctxState);
}
function positionCtxMenu(x, y) {
  const mw = refs.ctxMenu.offsetWidth, mh = refs.ctxMenu.offsetHeight;
  const px = Math.min(x, window.innerWidth - mw - 8);
  const py = Math.min(y, window.innerHeight - mh - 8);
  refs.ctxMenu.style.left = Math.max(8, px) + 'px';
  refs.ctxMenu.style.top  = Math.max(8, py) + 'px';
}
function hideCtxMenu() { if (!refs.ctxMenu.hidden) refs.ctxMenu.hidden = true; }

function runCtxAction(act) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (ctxRange) { try { sel.removeAllRanges(); sel.addRange(ctxRange); } catch {} }
  const selText = sel ? sel.toString() : '';
  const now = Date.now();
  switch (act) {
    case 'insDate':     insertBodyText(fmtDate(now)); break;
    case 'insTime':     insertBodyText(fmtTime(now)); break;
    case 'insDateTime': insertBodyText(fmtDateTime(now)); break;
    case 'insBullet':   insertBodyText('・'); break;
    case 'insCheck':    insertBodyText('☐ '); break;
    case 'insRule':     insertBodyText('\n──────────────\n'); break;
    case 'wrapKagi':    selText ? replaceSelection('「' + selText + '」') : insertBodyText('「」', 1); break;
    case 'wrapParen':   selText ? replaceSelection('（' + selText + '）') : insertBodyText('（）', 1); break;
    case 'toHalf':      if (selText) replaceSelection(toHalfWidth(selText)); break;
    case 'toFull':      if (selText) replaceSelection(toFullWidth(selText)); break;
    case 'count':       toast(`選択中の文字数：${selText.length} 文字`, 'info'); break;
    case 'addImage':    refs.fileInput.click(); break;
    case 'fmtBold':     runCtxFormat(toggleBold); break;
    case 'fmtItalic':   runCtxFormat(toggleItalic); break;
    case 'fmtReset':    runCtxFormat(resetFormatToDefault); break;
    case 'colorReset':  runCtxFormat(() => clearFormatType('color', '選択範囲に文字色は設定されていません')); break;
    case 'clipCut':     clipboardCut(selText); break;
    case 'clipCopy':    clipboardCopy(selText); break;
    case 'clipPaste':   clipboardPaste(); break;
    case 'linkEdit':    insertOrEditLink(); break;
    case 'linkOpen':    openLinkAt(ctxLinkEl); break;
    case 'linkUnset':
      if (ctxLinkEl) {
        unwrapElement(ctxLinkEl);
        afterBodyEdit();
        toast('リンクを解除しました', 'info');
      }
      break;
    default:
      if (/^size\d+$/.test(act)) {
        const px = act.slice(4);
        runCtxFormat(() => applyInlineFormat(() => createFormatElement('size', px), 'size'));
      } else if (act.startsWith('color:')) {
        const hex = act.slice(6);
        runCtxFormat(() => applyInlineFormat(() => createFormatElement('color', hex), 'color'));
      }
  }
  hideCtxMenu();
}

/* ============================================================
   クリップボード（右クリックメニューの 切り取り／コピー／貼り付け）
   ============================================================ */
async function clipboardCopy(selText) {
  if (!selText) { toast('コピーする範囲を選択してください', 'info'); return; }
  try {
    await navigator.clipboard.writeText(selText);
    toast('コピーしました', 'success');
  } catch {
    /* 権限が無い環境では execCommand にフォールバックする */
    if (document.execCommand('copy')) toast('コピーしました', 'success');
    else toast('コピーできませんでした。Ctrl+C をお使いください', 'error');
  }
}
async function clipboardCut(selText) {
  if (!selText) { toast('切り取る範囲を選択してください', 'info'); return; }
  try {
    await navigator.clipboard.writeText(selText);
  } catch {
    if (!document.execCommand('cut')) {
      toast('切り取れませんでした。Ctrl+X をお使いください', 'error');
      return;
    }
    afterBodyEdit();
    toast('切り取りました', 'success');
    return;
  }
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) sel.getRangeAt(0).deleteContents();
  afterBodyEdit();
  toast('切り取りました', 'success');
}
async function clipboardPaste() {
  let text = '';
  try {
    text = await navigator.clipboard.readText();
  } catch {
    /* 読み取りはブラウザの許可が必要。拒否された場合はショートカットを案内する */
    toast('貼り付けは Ctrl+V をお使いください（ブラウザの制限のため）', 'info');
    return;
  }
  if (!text) { toast('クリップボードに文字がありません', 'info'); return; }
  insertBodyText(text);   /* 表示の更新は insertBodyText 内の afterBodyEdit がまとめて行う */
}

/* 書式系のアクションは savedBodyRange を参照するため、メニューを開いた時点の
   選択範囲(runCtxAction 冒頭で復元済み)をここで退避してから実行する */
function runCtxFormat(fn) {
  if (!captureBodySelection()) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  fn();
}
