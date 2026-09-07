/* ============================================================
   text-format.js
   本文の書式設定（太字・斜体・文字サイズ・文字色・ハイライト）とリンク
   ============================================================ */
'use strict';

/* ============================================================
   本文の書式設定（太字・斜体・文字サイズ・文字色・ハイライト）
   ============================================================ */
/* ツールバーのボタン/セレクト/カラーピッカーをクリックすると本文の選択範囲
   (window.getSelection())が失われることがあるため、操作の直前に退避し、
   実際に書式を適用する瞬間に復元する */
let savedBodyRange = null;
function captureBodySelection() {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    const r = sel.getRangeAt(0);
    if (refs.bodyInput.contains(r.commonAncestorContainer) && !r.collapsed) {
      savedBodyRange = r.cloneRange();
      return true;
    }
  }
  /* 現時点で有効な選択が無ければ退避値も破棄する。古い値を残すと、選択を
     解除した後のツールバー操作で「以前の選択範囲」に書式が再適用されてしまう */
  savedBodyRange = null;
  return false;
}
function restoreBodySelection() {
  if (!savedBodyRange) return false;
  refs.bodyInput.focus();
  const sel = window.getSelection();
  sel.removeAllRanges();
  try { sel.addRange(savedBodyRange); } catch { return false; }
  return true;
}
/* 選択範囲を差し替える */
function selectRange(range) {
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}
/* 選択範囲を差し替え、続けてツールバーを操作しても同じ範囲に効くよう
   退避値も更新する（書式適用の締めくくりで使う） */
function setBodySelection(range) {
  selectRange(range);
  savedBodyRange = range.cloneRange();
}
/* 書式アクションの共通前処理。退避した選択範囲を復元したうえで、書式を
   当てられるテキストが実際に含まれているかまで確かめ、駄目なら案内を出して
   null を返す */
function requireBodySelection(message) {
  if (!restoreBodySelection()) { toast(message, 'info'); return null; }
  const range = window.getSelection().getRangeAt(0);
  if (getSelectedTextNodesInRange(range).length === 0) { toast(message, 'info'); return null; }
  return range;
}
/* node から本文エディタまでの祖先を辿り、predicate に一致する最も近い要素を返す */
function closestFormatEl(node, predicate) {
  let el = node && (node.nodeType === Node.TEXT_NODE ? node.parentElement : node);
  while (el && el !== refs.bodyInput) {
    if (predicate(el)) return el;
    el = el.parentElement;
  }
  return null;
}

/* range と交差する、書式適用対象のテキストノードを出現順に列挙する。
   選択範囲がインライン画像や表示専用オーバーレイをまたぐ場合(全選択など)、
   intersectsNode はそれらの内部テキスト(画像コントロールの <option> ラベルや
   改行マークの「↵」)にも true を返すため、明示的に除外する。除外しないと
   <option> の中に <b> が挿入されるなどウィジェットのDOMが破壊される */
function getSelectedTextNodesInRange(range) {
  const root = range.commonAncestorContainer;
  const container = root.nodeType === Node.TEXT_NODE ? root.parentNode : root;
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
    acceptNode: node => {
      if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
      /* 長さ0のテキストノードは extractContents/insertNode の副産物として
         残ることがある。書式の対象にならないだけでなく、これを数えてしまうと
         「選択範囲がすべて書式済みか」の判定が常に偽になり、太字・斜体の
         解除（トグルOFF）が効かなくなるため除外する */
      if (node.textContent.length === 0) return NodeFilter.FILTER_REJECT;
      const p = node.parentElement;
      if (p && p.closest(`.body-img, ${OVERLAY_SELECTOR}`)) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);
  return nodes;
}
function firstTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (const child of el.childNodes) {
    const found = firstTextNode(child);
    if (found) return found;
  }
  return null;
}
function lastTextNode(el) {
  if (el.nodeType === Node.TEXT_NODE) return el;
  for (let i = el.childNodes.length - 1; i >= 0; i--) {
    const found = lastTextNode(el.childNodes[i]);
    if (found) return found;
  }
  return null;
}

/* 要素をアンラップする(自身を取り除き、子だけを親の位置に残す) */
function unwrapElement(el) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}
/* 書式要素の判定。ブラウザは contenteditable の操作で <b>/<strong>、
   <i>/<em> のどちらを作ることもあるため、両方を同じ書式として扱う */
const isBoldEl      = el => el.tagName === 'B' || el.tagName === 'STRONG';
const isItalicEl    = el => el.tagName === 'I' || el.tagName === 'EM';
const isLinkEl      = el => el.tagName === 'A' && !!(el.dataset && el.dataset.fmt === 'link');
const isAnyFormatEl = el => isBoldEl(el) || isItalicEl(el) || !!(el.dataset && el.dataset.fmt);
const isFmtType = type => el => !!(el.dataset && el.dataset.fmt === type);

/* 分割・解除の結果、中身が空になった書式要素を取り除く。残しておくと
   保存データに [color=#xxxxxx][/color] のような空タグとして書き出されてしまう。
   <br> や画像を含むものは行構造を保つため残す */
function pruneEmptyFormatEls() {
  for (const el of $$('[data-fmt], b, strong, i, em', refs.bodyInput)) {
    if (el.closest('.body-img')) continue;
    if (el.textContent.length === 0 && !el.querySelector('br, img, .body-img')) el.remove();
  }
}

/* 選択の境界でテキストノードを分割し、選択範囲がノードの境界にちょうど
   揃うようにする。こうしておくと「選択した文字だけ」を単位に扱える */
function isolateRangeText(range) {
  const sc = range.startContainer, so = range.startOffset;
  const ec = range.endContainer, eo = range.endOffset;
  if (ec.nodeType === Node.TEXT_NODE && eo > 0 && eo < ec.textContent.length) ec.splitText(eo);
  if (sc.nodeType === Node.TEXT_NODE && so > 0 && so < sc.textContent.length) {
    const mid = sc.splitText(so);
    range.setStart(mid, 0);
    if (sc === ec) range.setEnd(mid, mid.textContent.length);
  }
}

/* el を child の前後で分割し、el 自身には child だけが残るようにする。
   前後に内容があれば el と同じ書式のコピーを作ってそちらへ移すので、
   選択範囲外の文字には書式が残る */
function splitElementAroundChild(el, child) {
  const parent = el.parentNode;
  const before = [], after = [];
  let seen = false;
  for (const n of [...el.childNodes]) {
    if (n === child) { seen = true; continue; }
    (seen ? after : before).push(n);
  }
  if (before.length) {
    const b = el.cloneNode(false);
    before.forEach(n => b.appendChild(n));
    parent.insertBefore(b, el);
  }
  if (after.length) {
    const a = el.cloneNode(false);
    after.forEach(n => a.appendChild(n));
    parent.insertBefore(a, el.nextSibling);
  }
}

/* node を、predicate に一致する祖先の外へ取り出す。間にある一致しない要素
   (色を消すときの <b> など)は保ったまま、一致する要素だけを剥がす */
function liftNodeOutOfFormats(node, predicate) {
  for (;;) {
    let outermost = null;
    let el = node.parentNode;
    while (el && el !== refs.bodyInput) {
      if (el.nodeType === Node.ELEMENT_NODE && predicate(el)) outermost = el;
      el = el.parentNode;
    }
    if (!outermost) return;
    /* node から outermost までの経路を、node だけを含む状態に分割してから剥がす */
    let cur = node;
    while (cur.parentNode !== outermost) {
      splitElementAroundChild(cur.parentNode, cur);
      cur = cur.parentNode;
    }
    splitElementAroundChild(outermost, cur);
    unwrapElement(outermost);
  }
}

/* 選択範囲の「文字だけ」から、predicate に一致する書式を取り除く。
   従来は書式要素を丸ごとアンラップしていたため、要素の一部だけを選んで
   解除すると選択外の文字まで書式が外れ、逆に解除したいのに外れないという
   状態が起きていた。境界で分割してから祖先を剥がすことで、選択した範囲に
   だけ正確に効かせる。
   戻り値は処理した内容を指す Range（呼び出し側で選択を復元するため）。 */
function clearFormatInRange(range, predicate) {
  isolateRangeText(range);
  const nodes = getSelectedTextNodesInRange(range).filter(n => {
    const nr = document.createRange();
    nr.selectNodeContents(n);
    return range.compareBoundaryPoints(Range.START_TO_START, nr) <= 0 &&
           range.compareBoundaryPoints(Range.END_TO_END, nr) >= 0;
  });
  if (nodes.length === 0) return null;
  for (const n of nodes) liftNodeOutOfFormats(n, predicate);
  pruneEmptyFormatEls();
  const last = nodes[nodes.length - 1];
  const r = document.createRange();
  r.setStart(nodes[0], 0);
  r.setEnd(last, last.textContent.length);
  return r;
}

/* 選択範囲に含まれる各テキストノードを個別に makeEl() の要素で包み、包んだ
   全体を指す Range を返す（包む対象が無ければ null）。
   単一の要素で選択範囲全体を包もうとすると(Range.surroundContents)、
   複数行(複数の <div>)にまたがる選択で例外になるため、テキストノード単位で
   処理することで行構造を壊さずに書式を適用できるようにしている。
   skip() が true を返したノードは（すでに同じ書式が効いているので）包まずに
   そのまま結果の範囲へ含める＝入れ子の二重適用を防ぐ */
function wrapTextNodes(range, textNodes, makeEl, skip = null) {
  /* extractContents/insertNode で先に処理したノードが Range の境界を
     書き換えてしまう(DOM の仕様上の自動調整)前に、境界点を固定値として控えておく */
  const startContainer = range.startContainer, startOffset = range.startOffset;
  const endContainer = range.endContainer, endOffset = range.endOffset;
  const wrapped = [];
  for (const node of textNodes) {
    const nodeRange = document.createRange();
    nodeRange.selectNodeContents(node);
    if (node === startContainer) nodeRange.setStart(node, startOffset);
    if (node === endContainer) nodeRange.setEnd(node, endOffset);
    if (nodeRange.collapsed) continue;
    if (skip && skip(node)) { wrapped.push(node); continue; }
    const el = makeEl();
    el.appendChild(nodeRange.extractContents());
    nodeRange.insertNode(el);
    wrapped.push(el);
  }
  if (wrapped.length === 0) return null;
  /* 選択の境界は実テキストノード基準にする。setStartBefore/setEndAfter の
     ような要素基準の境界は、折りたたんだ Range の getClientRects() が
     空配列を返すことがあり(文字境界でない collapsed Range の既知の癖)、
     カーソルハイライト側のフォールバックが要素全体の矩形を拾って
     異常に大きな帯が表示される不具合につながる */
  const newRange = document.createRange();
  const startText = firstTextNode(wrapped[0]);
  const endText = lastTextNode(wrapped[wrapped.length - 1]);
  if (startText && endText) {
    newRange.setStart(startText, 0);
    newRange.setEnd(endText, endText.textContent.length);
  } else {
    newRange.setStartBefore(wrapped[0]);
    newRange.setEndAfter(wrapped[wrapped.length - 1]);
  }
  return newRange;
}

/* fmtType を渡した場合(文字サイズ・文字色・ハイライトのような「値を持つ」
   書式)は、包む前に選択範囲から同じ種類の書式を取り除く。こうしないと
   適用のたびにラッパーが入れ子で積み重なり、見た目は新しい値で上書きされて
   いても外側の古いラッパー(例: 大きいフォントサイズ)が行の高さなどに影響し
   続け、値を戻しても元に戻らない状態になる */
function applyInlineFormat(makeEl, fmtType) {
  let range = requireBodySelection('書式を適用するテキストを選択してください');
  if (!range) return;
  /* 同種の書式を先に剥がしてから包み直す（入れ子の蓄積を防ぐ） */
  if (fmtType) {
    const cleared = clearFormatInRange(range, isFmtType(fmtType));
    if (cleared) { range = cleared; selectRange(range); }
  }
  const textNodes = getSelectedTextNodesInRange(range);
  if (textNodes.length === 0) { toast('書式を適用するテキストを選択してください', 'info'); return; }
  const newRange = wrapTextNodes(range, textNodes, makeEl);
  if (!newRange) return;
  setBodySelection(newRange);
  afterBodyEdit();
}

/* 太字・斜体用のトグル。選択範囲が(部分的にでも)未適用のテキストを含んでいれば
   全体に適用し、選択範囲がすでに全て適用済みなら解除する。既に適用済みの部分は
   二重に包まない(入れ子の蓄積を防ぐ) */
function toggleTagFormat(matchTag, makeEl) {
  const range = requireBodySelection('書式を適用するテキストを選択してください');
  if (!range) return;
  const textNodes = getSelectedTextNodesInRange(range);
  const hasAncestor = node => !!closestFormatEl(node, matchTag);
  /* 選択範囲がすべて適用済みなら解除する。選択した文字だけに効かせるため、
     要素を丸ごとアンラップせず範囲単位で剥がす */
  if (textNodes.every(hasAncestor)) {
    const cleared = clearFormatInRange(range, matchTag);
    if (cleared) setBodySelection(cleared);
    afterBodyEdit();
    return;
  }
  const newRange = wrapTextNodes(range, textNodes, makeEl, hasAncestor);
  if (!newRange) return;
  setBodySelection(newRange);
  afterBodyEdit();
}

/* 選択した文字だけから、predicate に一致する書式を解除する。
   選択範囲が書式要素の一部でも、その範囲だけを正確に解除する */
function clearFormatMatching(predicate, emptyMessage) {
  if (!restoreBodySelection()) { toast('書式を解除するテキストを選択してください', 'info'); return; }
  const range = window.getSelection().getRangeAt(0);
  const textNodes = getSelectedTextNodesInRange(range);
  if (!textNodes.some(node => closestFormatEl(node, predicate))) { toast(emptyMessage, 'info'); return; }
  const cleared = clearFormatInRange(range, predicate);
  if (cleared) setBodySelection(cleared);
  afterBodyEdit();
}
function clearFormatType(fmtType, emptyMessage) {
  clearFormatMatching(isFmtType(fmtType), emptyMessage);
}
const toggleBold   = () => toggleTagFormat(isBoldEl,   () => document.createElement('b'));
const toggleItalic = () => toggleTagFormat(isItalicEl, () => document.createElement('i'));
/* 選択範囲を既定の書式（黒・標準サイズ・太さ普通）に戻す。
   本文エディタの地の書式がそのまま既定値なので、インライン書式を
   すべて取り除けば既定に戻る */
function resetFormatToDefault() {
  const range = requireBodySelection('標準に戻すテキストを選択してください');
  if (!range) return;
  const cleared = clearFormatInRange(range, isAnyFormatEl);
  if (cleared) setBodySelection(cleared);
  afterBodyEdit();
  toast('標準の書式（黒・標準サイズ・太さ普通）に戻しました', 'success');
}

/* ============================================================
   本文中のリンク（挿入・編集・解除）
   ============================================================ */
/* キャレット位置が既存のリンクの中にあればその <a> を返す */
function currentLinkEl() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  return closestFormatEl(sel.getRangeAt(0).startContainer, isLinkEl);
}

async function insertOrEditLink() {
  const existing = currentLinkEl();
  const sel = window.getSelection();
  /* ダイアログを開くとフォーカスが移り選択が失われるため、
     キャレット位置（折りたたんだ選択）も含めてここで控えておく */
  let savedRange = null;
  if (sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).commonAncestorContainer)) {
    savedRange = sel.getRangeAt(0).cloneRange();
  }
  const selText = sel && !sel.isCollapsed ? sel.toString() : '';
  const res = await dialog({
    title: existing ? 'リンクを編集' : 'リンクを挿入',
    message: 'スキームを省略した場合は https:// を補います。メールアドレスは mailto: になります。',
    fields: [
      { name: 'url',  label: 'URL', value: existing ? existing.getAttribute('href') : '', placeholder: 'example.com/page' },
      { name: 'text', label: '表示する文字', value: existing ? existing.textContent : selText, placeholder: 'リンクの文字' },
    ],
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      ...(existing ? [{ label: 'リンクを解除', value: 'unlink', kind: 'danger' }] : []),
      { label: existing ? '更新' : '挿入', value: 'ok', kind: 'primary' },
    ],
  });
  const action = res && res.value;
  if (!action || action === 'cancel') return;

  if (action === 'unlink') {
    if (existing) {
      unwrapElement(existing);
      afterBodyEdit();
      toast('リンクを解除しました', 'info');
    }
    return;
  }
  const url = safeLinkUrl(res.fields.url);
  if (!url) { toast('URL を確認してください（http / https / mailto のみ使えます）', 'error'); return; }
  const text = res.fields.text.trim() || url;

  const a = createFormatElement('link', url);
  a.textContent = text;
  if (existing) {
    existing.replaceWith(a);
  } else {
    refs.bodyInput.focus();
    let range = savedRange;
    if (!range) {
      range = document.createRange();
      range.selectNodeContents(refs.bodyInput);
      range.collapse(false);
    }
    range.deleteContents();
    range.insertNode(a);
  }
  placeCaretAfter(a);
  afterBodyEdit();
  toast(existing ? 'リンクを更新しました' : 'リンクを挿入しました', 'success');
}

function openLinkAt(el) {
  const url = el && el.getAttribute('href');
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
}

/* 書式ツールバーの有効/無効・太字イタリックのアクティブ表示を、現在の
   選択状態に合わせて更新する */
function updateFormatToolbarState() {
  /* ボタンを disabled にして選択の有無でクリック可否を切り替える設計も検討したが、
     select/color ピッカーを開く操作中に selectionchange が挟まると、
     mousedown と click の間でボタンが disabled になり click 自体が
     発火しなくなる競合が起こり得るため採用しない。選択が無い状態での
     クリックは各アクション側で trap し、トーストで案内する */
  const sel = window.getSelection();
  const focused = document.activeElement === refs.bodyInput && sel && sel.rangeCount > 0 &&
    refs.bodyInput.contains(sel.getRangeAt(0).commonAncestorContainer);
  refs.btnBold.classList.toggle('active', focused && !!closestFormatEl(sel.anchorNode, isBoldEl));
  refs.btnItalic.classList.toggle('active', focused && !!closestFormatEl(sel.anchorNode, isItalicEl));
}
