/* ============================================================
   body.js
   本文エディタ（contenteditable）：インライン画像、本文テキストと DOM の
   相互変換、改行マーク、カーソル行ハイライト
   ============================================================ */
'use strict';

/* ============================================================
   インライン画像（contenteditable 内）
   ============================================================ */
let draggedImg = null;   /* 本文内でドラッグ移動中の画像要素 */

/* 端をドラッグして自由変更した際の「カスタム」表示ラベル。
   実際の px 幅を添えることで、プリセットと何が違うのか一目で分かるようにする */
function customSizeLabel(px) {
  return Number.isFinite(px) ? `カスタム（${px}px）` : 'カスタム';
}

function createInlineImg(imgId, align, size) {
  const img = state.images.find(x => x.id === imgId);
  const wrap = document.createElement('span');
  wrap.className = 'body-img';
  wrap.contentEditable = 'false';
  wrap.dataset.id = imgId;
  wrap.dataset.align = align || 'c';
  const sizeVal = size || 'fit';
  wrap.dataset.size = sizeVal;
  wrap.setAttribute('draggable', 'true');
  wrap.title = 'ダブルクリックで拡大／ドラッグで移動／端をドラッグでサイズ変更';
  if (img) {
    const isPreset = sizeVal === 's' || sizeVal === 'm' || sizeVal === 'l' || sizeVal === 'fit';
    const customPx = isPreset ? null : parseInt(sizeVal, 10);
    const widthStyle = Number.isFinite(customPx) ? ` style="width:${customPx}px"` : '';
    const customLabel = Number.isFinite(customPx) ? customSizeLabel(customPx) : customSizeLabel();
    wrap.innerHTML =
      `<img src="${urlOf(img)}" class="body-img__img" alt="${esc(img.name)}" draggable="false"${widthStyle}>` +
      `<span class="body-img__resize" title="ドラッグでサイズ変更"></span>` +
      `<span class="body-img__ctrl">` +
        `<button class="body-img__zoom" title="拡大表示"><i class="fa-solid fa-magnifying-glass-plus"></i></button>` +
        `<button class="body-img__copy" title="画像をコピー"><i class="fa-regular fa-copy"></i></button>` +
        `<span class="body-img__div"></span>` +
        `<button class="body-img__pos${align==='l'?' on':''}" data-a="l" title="左寄せ"><i class="fa-solid fa-align-left"></i></button>` +
        `<button class="body-img__pos${align==='c'?' on':''}" data-a="c" title="中央"><i class="fa-solid fa-align-center"></i></button>` +
        `<button class="body-img__pos${align==='r'?' on':''}" data-a="r" title="右寄せ"><i class="fa-solid fa-align-right"></i></button>` +
        `<select class="body-img__size" title="画像の表示幅を選択（端をドラッグすると自由なサイズにもできます）">` +
          `<option value="fit"${sizeVal==='fit'?' selected':''}>幅に合わせる（エリア幅に自動追従）</option>` +
          `<option value="s"${sizeVal==='s'?' selected':''}>小（120px）</option>` +
          `<option value="m"${sizeVal==='m'?' selected':''}>中（240px）</option>` +
          `<option value="l"${sizeVal==='l'?' selected':''}>大（最大幅）</option>` +
          `<option value="custom" hidden${!isPreset?' selected':''}>${esc(customLabel)}</option>` +
        `</select>` +
        `<button class="body-img__del" title="削除"><i class="fa-solid fa-xmark"></i></button>` +
      `</span>`;
  } else {
    wrap.innerHTML = `<span class="body-img--missing">[img:${imgId} — 画像未登録]</span>`;
  }
  return wrap;
}

/* 改行マークとカーソル行ハイライトは本文の中身ではなく表示専用の
   オーバーレイ。保存・末尾判定・書式適用の対象から外すために使う */
const OVERLAY_SELECTOR = '.line-mark, .current-line-hl';
const isOverlayEl = node => node.nodeType === Node.ELEMENT_NODE && !!node.classList &&
  (node.classList.contains('line-mark') || node.classList.contains('current-line-hl'));

function addTextWithBreaks(parent, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parent.appendChild(document.createElement('br'));
    if (lines[i]) parent.appendChild(document.createTextNode(lines[i]));
  }
}

/* リンクの URL を安全な形に整える。javascript: のような実行を伴うスキームは
   受け付けず、スキーム省略時は https:// を補う */
function safeLinkUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(url)) return 'mailto:' + url;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return null;
  return 'https://' + url;
}

/* 書式タグ([b] [i] [size=N] [color=#hex] [hl=#hex] [link=URL])に対応する要素を
   生成する。size/color/hl はインライン style で表現し、シリアライズ時に
   判別できるよう data-fmt 属性を付ける */
function createFormatElement(tag, param) {
  if (tag === 'b') return document.createElement('b');
  if (tag === 'i') return document.createElement('i');
  if (tag === 'link') {
    const url = safeLinkUrl(param);
    /* 安全でない URL は書式化せず、ただの span として中身だけ残す */
    if (!url) { const s = document.createElement('span'); return s; }
    const a = document.createElement('a');
    a.dataset.fmt = 'link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = `${url}\nCtrl+クリック（Mac は ⌘+クリック）で開きます`;
    return a;
  }
  const span = document.createElement('span');
  span.dataset.fmt = tag;
  if (tag === 'size') {
    const px = Math.min(72, Math.max(8, parseInt(param, 10) || 15));
    span.style.fontSize = px + 'px';
  } else if (tag === 'color' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.color = param;
  } else if (tag === 'hl' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.backgroundColor = param;
  }
  return span;
}

/* 画像マーカーと書式タグ([b] [i] [size=N] [color=#hex] [hl=#hex])を含む本文
   テキストを DOM フラグメントへ再帰的に変換する。書式タグは入れ子にできる
   (例: [b][color=#ff0000]太字の赤文字[/color][/b])ため、単純な正規表現の
   一括置換ではなく再帰下降パーサーとして実装している。

   【重要】走査位置は pos 変数で明示的に管理する。以前は g フラグ正規表現の
   lastIndex を再帰をまたいで共有していたが、JS の仕様では exec が失敗すると
   lastIndex が 0 にリセットされるため、閉じタグの無い開始タグ(ユーザーが
   文字通り「[b]」と入力した場合など)で呼び出し元が先頭から再走査してしまい、
   無限ループでアプリ全体がフリーズする致命的な不具合があった。 */
const BODY_TOKEN_RE = /\[img:(?<imgId>\d+)(?::(?<imgAlign>[lcr]))?(?::(?<imgSize>[sml]|\d+|fit))?\]|\[(?<close>\/)?(?<tag>b|i|size|color|hl|link)(?:=(?<param>[^\]]*))?\]/g;
const BODY_FMT_TAGS = ['b', 'i', 'size', 'color', 'hl', 'link'];
function textToFragment(text) {
  let pos = 0;
  /* 各タグの閉じタグ位置を先に列挙しておく。開始タグごとに indexOf で後方を
     線形探索すると、対応の取れないタグが大量に並ぶ入力で二次時間になるため、
     単調に進む pos に合わせてポインタを進めるだけで判定できるようにする */
  const closeIdx = {};
  for (const t of BODY_FMT_TAGS) {
    const list = [];
    const needle = `[/${t}]`;
    for (let at = text.indexOf(needle); at !== -1; at = text.indexOf(needle, at + 1)) list.push(at);
    closeIdx[t] = { list, next: 0 };
  }
  const hasCloseAhead = tag => {
    const c = closeIdx[tag];
    while (c.next < c.list.length && c.list[c.next] < pos) c.next++;
    return c.next < c.list.length;
  };
  function parse(stopTag) {
    const frag = document.createDocumentFragment();
    while (pos < text.length) {
      BODY_TOKEN_RE.lastIndex = pos;
      const m = BODY_TOKEN_RE.exec(text);
      if (!m) break;
      if (m.index > pos) addTextWithBreaks(frag, text.slice(pos, m.index));
      pos = m.index + m[0].length;
      const g = m.groups;
      if (g.imgId !== undefined) {
        frag.appendChild(createInlineImg(Number(g.imgId), g.imgAlign || 'c', g.imgSize || 'fit'));
        continue;
      }
      if (g.close) {
        if (g.tag === stopTag) return frag;
        /* 対応する開始タグの無い閉じタグは、書式として解釈せず文字のまま表示する */
        addTextWithBreaks(frag, m[0]);
        continue;
      }
      /* 対応する閉じタグが後方に無い開始タグも文字のまま表示する。ユーザーが
         文字通り「[b]」等と入力したケースで、以降全文が意図せず書式化されたり
         入力した文字が消えたりしないようにする */
      if (!hasCloseAhead(g.tag)) {
        addTextWithBreaks(frag, m[0]);
        continue;
      }
      const el = createFormatElement(g.tag, g.param);
      el.appendChild(parse(g.tag));
      frag.appendChild(el);
    }
    if (pos < text.length) {
      addTextWithBreaks(frag, text.slice(pos));
      pos = text.length;
    }
    return frag;
  }
  return parse(null);
}

/* rgb(r, g, b) / rgba(r, g, b, a) 形式の computed style 値を #rrggbb に変換する。
   要素の style.color 等はブラウザ側で常に rgb() 表記に正規化されて返る */
function rgbToHex(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || '');
  if (!m) return null;
  const toHex = n => Number(n).toString(16).padStart(2, '0');
  return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
}

function serializeBody() {
  let result = '';
  function wrapTag(node, open, close) {
    result += open;
    for (const c of node.childNodes) walk(c);
    result += close;
  }
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const fmt = node.dataset && node.dataset.fmt;
      if (isOverlayEl(node)) {
        return; /* 表示専用のオーバーレイ要素(改行マーク・現在行ハイライト)は読み飛ばす */
      } else if (node.classList && node.classList.contains('body-img')) {
        result += `[img:${node.dataset.id}:${node.dataset.align || 'c'}:${node.dataset.size || 'fit'}]`;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (result.length > 0 && !result.endsWith('\n')) result += '\n';
        for (const c of node.childNodes) walk(c);
        if (!result.endsWith('\n')) result += '\n';
      } else if (node.tagName === 'B' || node.tagName === 'STRONG') {
        wrapTag(node, '[b]', '[/b]');
      } else if (node.tagName === 'I' || node.tagName === 'EM') {
        wrapTag(node, '[i]', '[/i]');
      } else if (fmt === 'size') {
        const px = parseInt(node.style.fontSize, 10) || 15;
        wrapTag(node, `[size=${px}]`, '[/size]');
      } else if (fmt === 'color') {
        const hex = rgbToHex(node.style.color);
        if (hex) wrapTag(node, `[color=${hex}]`, '[/color]');
        else for (const c of node.childNodes) walk(c);
      } else if (fmt === 'hl') {
        const hex = rgbToHex(node.style.backgroundColor);
        if (hex) wrapTag(node, `[hl=${hex}]`, '[/hl]');
        else for (const c of node.childNodes) walk(c);
      } else if (fmt === 'link') {
        /* URL に ] が含まれるとマーカーが壊れるため、その場合は
           リンクを諦めて文字だけ残す */
        const url = node.getAttribute('href') || '';
        if (url && !url.includes(']')) wrapTag(node, `[link=${url}]`, '[/link]');
        else for (const c of node.childNodes) walk(c);
      } else {
        for (const c of node.childNodes) walk(c);
      }
    }
  }
  for (const c of refs.bodyInput.childNodes) walk(c);
  return result.replace(/\n$/, '');
}

function deserializeBody(text) {
  refs.bodyInput.innerHTML = '';
  if (text) {
    let frag;
    try {
      frag = textToFragment(text);
    } catch (err) {
      /* 起動時の前回メモ復元でも呼ばれるため、パーサーがどんな入力
         (インポートされた異常データ等)で失敗してもアプリ全体が起動不能に
         ならないよう、プレーンテキスト表示にフォールバックする */
      console.error('本文の解釈に失敗したためプレーンテキストとして表示します', err);
      frag = document.createDocumentFragment();
      addTextWithBreaks(frag, text);
    }
    refs.bodyInput.appendChild(frag);
    ensureTrailingEditable();
  }
  rebuildLineMarks();
}

/* 末尾が（編集不可な）画像のままだと、その後ろにキャレットを
   置けず文字入力できなくなる。末尾画像の後ろに改行を補い、
   常に編集可能な行が残るようにする。 */
function ensureTrailingEditable() {
  /* 改行マーク・カーソルハイライトは表示専用オーバーレイのため、
     末尾判定の対象からは読み飛ばす */
  let last = refs.bodyInput.lastChild;
  while (last && isOverlayEl(last)) last = last.previousSibling;
  if (last && last.nodeType === Node.ELEMENT_NODE &&
      last.classList && last.classList.contains('body-img')) {
    refs.bodyInput.appendChild(document.createElement('br'));
  }
}

function placeCaretAfter(node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  }
  return null;
}

/* ドラッグ中の挿入位置を求め、縦線インジケータで可視化する */
function getCaretIndicator(x, y) {
  const range = caretRangeFromPoint(x, y);
  if (!range) return null;
  const r = range.getBoundingClientRect();
  if (r && r.height > 0) return { left: r.left, top: r.top, height: r.height };
  const cont = range.startContainer;
  /* テキストノード内：行矩形の左右端にキャレットを置く */
  if (cont.nodeType === Node.TEXT_NODE && cont.textContent.length) {
    const tr = document.createRange();
    tr.selectNodeContents(cont);
    const rects = tr.getClientRects();
    const rr = rects[rects.length - 1] || tr.getBoundingClientRect();
    if (rr && rr.height > 0) {
      const atEnd = range.startOffset >= cont.textContent.length;
      return { left: atEnd ? rr.right : rr.left, top: rr.top, height: rr.height };
    }
  }
  /* 要素境界（画像や改行の前後）：隣接要素の端に合わせる */
  if (cont.nodeType === Node.ELEMENT_NODE) {
    const after  = cont.childNodes[range.startOffset];
    const before = cont.childNodes[range.startOffset - 1];
    const ref = (after && after.nodeType === Node.ELEMENT_NODE) ? after
              : (before && before.nodeType === Node.ELEMENT_NODE) ? before : null;
    if (ref) {
      const rr = ref.getBoundingClientRect();
      if (rr.height > 0) return { left: after ? rr.left : rr.right, top: rr.top, height: rr.height };
    }
  }
  const er = refs.bodyInput.getBoundingClientRect();
  return { left: Math.min(Math.max(x, er.left + 2), er.right - 2), top: er.top + 6, height: 24 };
}
function showDropCaret(x, y) {
  const info = getCaretIndicator(x, y);
  if (!info) return;
  const el = refs.dropCaret;
  el.style.left   = Math.round(info.left) + 'px';
  el.style.top    = Math.round(info.top) + 'px';
  el.style.height = Math.round(info.height) + 'px';
  el.hidden = false;
}
function hideDropCaret() { if (refs.dropCaret && !refs.dropCaret.hidden) refs.dropCaret.hidden = true; }
function endImgDrag() {
  if (draggedImg) draggedImg.classList.remove('dragging');
  draggedImg = null;
  hideDropCaret();
}

function insertBodyText(text, caretAt = null) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    refs.bodyInput.appendChild(textToFragment(text));
    afterBodyEdit();
    return;
  }
  const range = sel.getRangeAt(0);
  range.deleteContents();
  const frag = document.createDocumentFragment();
  if (caretAt !== null) {
    addTextWithBreaks(frag, text.slice(0, caretAt));
    const caretMarker = document.createTextNode('');
    frag.appendChild(caretMarker);
    addTextWithBreaks(frag, text.slice(caretAt));
    range.insertNode(frag);
    const nr = document.createRange();
    nr.setStartAfter(caretMarker);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  } else {
    addTextWithBreaks(frag, text);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      const nr = document.createRange();
      nr.setStartAfter(last);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  }
  afterBodyEdit();
}

function insertImageRef(imgId) {
  refs.bodyInput.focus();
  const imgEl = createInlineImg(imgId, 'c', 'fit');
  const sel = window.getSelection();
  let range;
  if (sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).startContainer)) {
    range = sel.getRangeAt(0);
    range.deleteContents();
  } else {
    range = document.createRange();
    range.selectNodeContents(refs.bodyInput);
    range.collapse(false);
  }
  range.insertNode(imgEl);
  ensureTrailingEditable();
  placeCaretAfter(imgEl);
  afterBodyEdit();
}

/* 本文内画像をライトボックスで拡大表示（パネルと同じビューワを共用） */
function openInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const index = state.images.findIndex(x => x.id === id);
  if (index >= 0) lbShow(index);
  else toast('この画像は登録されていません', 'error');
}

/* 本文内画像の右下角ドラッグによる自由なサイズ変更 */
function startImageResize(wrap, startEvent) {
  const imgEl = wrap.querySelector('.body-img__img');
  if (!imgEl) return;
  const startX = startEvent.clientX;
  const startWidth = imgEl.getBoundingClientRect().width;
  const minW = 48;
  const maxW = Math.max(minW, refs.bodyInput.getBoundingClientRect().width - 8);
  wrap.classList.add('resizing');
  const onMove = e => {
    const w = Math.round(Math.min(maxW, Math.max(minW, startWidth + (e.clientX - startX))));
    imgEl.style.width = w + 'px';
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    wrap.classList.remove('resizing');
    const finalPx = Math.round(imgEl.getBoundingClientRect().width);
    wrap.dataset.size = String(finalPx);
    const sel = wrap.querySelector('.body-img__size');
    if (sel) {
      const customOpt = sel.querySelector('option[value="custom"]');
      if (customOpt) customOpt.textContent = customSizeLabel(finalPx);
      sel.value = 'custom';
    }
    afterBodyEdit();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* ホバーコントロールバーの位置を画像の実測位置から都度計算する。
   CSS の包含ブロックに頼らないため、配置・サイズ・スクロール状態に
   関わらず常に画像の直上（エディタ範囲内にクランプ）に表示される。 */
function positionImgCtrl(wrap) {
  const ctrl = wrap.querySelector('.body-img__ctrl');
  if (!ctrl) return;
  const wrapRect = wrap.getBoundingClientRect();
  const editorRect = refs.bodyInput.getBoundingClientRect();
  const ctrlH = ctrl.offsetHeight || 34;
  const ctrlW = ctrl.offsetWidth || 180;
  let top = wrapRect.top + 6;
  top = Math.max(editorRect.top + 4, Math.min(top, editorRect.bottom - ctrlH - 4));
  let left = wrapRect.left + wrapRect.width / 2;
  left = Math.max(editorRect.left + ctrlW / 2 + 4, Math.min(left, editorRect.right - ctrlW / 2 - 4));
  ctrl.style.top = Math.round(top) + 'px';
  ctrl.style.left = Math.round(left) + 'px';
}

/* 本文内画像をシステムのクリップボードにコピー（フォーマットの
   互換性を優先し、常に PNG として書き込む） */
async function blobToPngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}
async function copyInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const img = state.images.find(x => x.id === id);
  if (!img) { toast('この画像は登録されていません', 'error'); return; }
  try {
    const pngBlob = await blobToPngBlob(img.blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    toast('画像をクリップボードにコピーしました', 'success');
  } catch (err) {
    console.error(err);
    toast('画像のコピーに失敗しました', 'error');
  }
}

/* ============================================================
   改行マークの視覚化（表示専用・本文内容には含まれない）
   ============================================================ */
function applyShowLineMarksState() {
  refs.btnShowMarks.classList.toggle('active', state.showLineMarks);
  refs.btnShowMarks.title = state.showLineMarks ? '改行マークを非表示' : '改行マークを表示';
}
function rebuildLineMarks() {
  $$('.line-mark', refs.bodyInput).forEach(el => el.remove());
  if (!state.showLineMarks) return;
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const scrollLeft = refs.bodyInput.scrollLeft;
  const frag = document.createDocumentFragment();
  const addMark = rect => {
    if (!rect || rect.height === 0) return;   /* 非表示状態（display:none 等）は無視 */
    const mark = document.createElement('span');
    mark.className = 'line-mark';
    mark.contentEditable = 'false';
    mark.textContent = '↵';
    mark.style.top  = Math.round(rect.top  - containerRect.top  + scrollTop)  + 'px';
    mark.style.left = Math.round(rect.left - containerRect.left + scrollLeft + 2) + 'px';
    frag.appendChild(mark);
  };
  /* <br> による改行（音声入力・フォーマット適用などプログラム的な挿入） */
  for (const br of $$('br', refs.bodyInput)) addMark(br.getBoundingClientRect());
  /* <div>/<p> による改行（Enter キーを押した際のブラウザ既定の段落化）
     文字境界の collapsed Range は getClientRects() が空配列を返すことがあり
     getBoundingClientRect() が全て 0 になるため、要素自体の矩形を使う */
  for (const block of $$('div, p', refs.bodyInput)) addMark(block.getBoundingClientRect());
  /* white-space:pre-wrap の本文では、Shift+Enter による改行が <br> ではなく
     テキストノード内の "\n" 文字として挿入される場合がある。これを拾わないと
     Shift+Enter の改行だけマークが表示されない */
  const walker = document.createTreeWalker(refs.bodyInput, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest(OVERLAY_SELECTOR))
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let tn;
  while ((tn = walker.nextNode())) {
    const s = tn.textContent;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\n') continue;
      const r = document.createRange();
      r.setStart(tn, i);
      r.setEnd(tn, i + 1);
      addMark(r.getClientRects()[0]);
    }
  }
  refs.bodyInput.appendChild(frag);
}
const rebuildLineMarksDebounced = debounce(rebuildLineMarks, 200);

/* ノードが実際に描画されている行の矩形を返す。テキストノードは Range 経由で
   なければ矩形が取れないため、種類に応じて取得方法を切り替える */
function rectOfNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const r = document.createRange();
    r.selectNodeContents(node);
    return r.getClientRects()[0] || null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const rect = node.getBoundingClientRect();
    return rect.height > 0 ? rect : null;
  }
  return null;
}

/* カーソルのある行を薄くハイライトし、キャレット位置を見失わないようにする。
   フォーカスが本文エディタに無い場合は非表示にする。 */
function updateCursorHighlight() {
  let hl = refs.bodyInput.querySelector('.current-line-hl');
  const sel = window.getSelection();
  const active = document.activeElement === refs.bodyInput &&
    sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.anchorNode);
  /* 本文が完全に空の場合はハイライトを出さない。ここで要素を追加すると
     :empty::before によるプレースホルダー表示が消えてしまうため */
  const hasRealContent = [...refs.bodyInput.childNodes].some(n => n !== hl);
  if (!active || !hasRealContent) {
    if (hl) hl.remove();
    return;
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if (!rect) {
    const node = range.startContainer;
    /* white-space:pre-wrap の本文で Shift+Enter 等により改行がテキストノード内の
       "\n" 文字として表現される場合、その文字境界の collapsed Range は
       getClientRects() が空になることがある。その場合でもテキストノード全体を
       選択した Range なら正しい行の矩形が取れるため、まずそちらを試す。
       (これを飛ばして要素の矩形にフォールバックすると、"\n" がbodyInput 直下の
       テキストノードの場合に親要素＝エディタ全体の矩形を拾ってしまい、
       ハイライトがエディタ全体を覆う不具合になる) */
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      rect = nodeRange.getClientRects()[0];
    }
    if (!rect || rect.height === 0) {
      /* それでも矩形が取れない場合(空要素など)は、キャレットを含む要素自体の
         矩形にフォールバックする */
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      /* ただしその要素がエディタ自身の場合(書式解除の直後など、選択が
         bodyInput 直下のオフセットを指している状態)、そのまま使うと
         ハイライトがエディタ全体を覆ってしまう。キャレット位置の子ノードから
         実際の行の矩形を求め、取れなければハイライトを出さない */
      if (el === refs.bodyInput) {
        const kids = [...el.childNodes].filter(n => n !== hl &&
          !(n.nodeType === Node.ELEMENT_NODE && n.classList && n.classList.contains('line-mark')));
        const at = kids[Math.min(range.startOffset, kids.length - 1)];
        rect = at && rectOfNode(at);
      } else {
        rect = el && el.getBoundingClientRect();
      }
    }
  }
  if (!rect || rect.height === 0) { if (hl) hl.remove(); return; }
  if (!hl) {
    hl = document.createElement('span');
    hl.className = 'current-line-hl';
    hl.contentEditable = 'false';
    /* 先頭に挿入すると、末尾を指す (bodyInput, offset) 形式の既存 Range/Selection の
       境界がこの新要素を含むようずれてしまう(挿入位置の index 分だけ offset が調整される
       DOM の仕様のため)。末尾へ追加すれば既存の選択範囲に影響しない。 */
    refs.bodyInput.appendChild(hl);
  }
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const top = rect.top - containerRect.top + scrollTop;
  hl.style.top = Math.round(top - 3) + 'px';
  hl.style.height = Math.round(rect.height + 6) + 'px';
}
