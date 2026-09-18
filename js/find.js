/* ============================================================
   find.js
   メモ内の検索・置換（Ctrl+F）
   ------------------------------------------------------------
   見つかった箇所は本文の DOM を書き換えずに、改行マークや現在行
   ハイライトと同じ「表示専用のオーバーレイ」として重ねて描く。
   本文の保存内容に検索用のタグが混ざらないようにするため。
   ============================================================ */
'use strict';

const find = { query: '', matches: [], index: 0 };

/* 本文の文字を、DOM 上の位置と対応づけながら1本の文字列として集める。
   画像や改行マークなど文字でない部分は飛ばす */
function collectBodyTextMap() {
  let text = '';
  const parts = [];
  const walker = document.createTreeWalker(refs.bodyInput, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: n => {
      if (n.nodeType === Node.ELEMENT_NODE) {
        if (isOverlayEl(n) || isWidgetEl(n) || (n.classList && n.classList.contains('body-img'))) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_SKIP;
      }
      return NodeFilter.FILTER_ACCEPT;
    },
  });
  let n;
  while ((n = walker.nextNode())) {
    parts.push({ node: n, start: text.length, len: n.textContent.length });
    text += n.textContent;
  }
  return { text, parts };
}
/* 文字位置の範囲から Range を作る */
function rangeFromTextMap(map, from, to) {
  const at = pos => {
    for (const p of map.parts) {
      if (pos <= p.start + p.len) return { node: p.node, offset: Math.max(0, pos - p.start) };
    }
    const last = map.parts[map.parts.length - 1];
    return last ? { node: last.node, offset: last.len } : null;
  };
  const a = at(from), b = at(to);
  if (!a || !b) return null;
  const range = document.createRange();
  try {
    range.setStart(a.node, a.offset);
    range.setEnd(b.node, b.offset);
  } catch { return null; }
  return range;
}

function clearFindHits() {
  $$('.find-hit', refs.bodyInput).forEach(el => el.remove());
}
/* 見つかった箇所を矩形で塗る（1件が複数行にまたがることもある） */
function paintFindHits() {
  clearFindHits();
  if (find.matches.length === 0) return;
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const scrollLeft = refs.bodyInput.scrollLeft;
  const frag = document.createDocumentFragment();
  find.matches.forEach((m, i) => {
    const range = m.range;
    if (!range) return;
    for (const rect of range.getClientRects()) {
      if (rect.width === 0 || rect.height === 0) continue;
      const el = document.createElement('span');
      el.className = 'find-hit' + (i === find.index ? ' current' : '');
      el.contentEditable = 'false';
      el.style.top    = Math.round(rect.top - containerRect.top + scrollTop) + 'px';
      el.style.left   = Math.round(rect.left - containerRect.left + scrollLeft) + 'px';
      el.style.width  = Math.round(rect.width) + 'px';
      el.style.height = Math.round(rect.height) + 'px';
      frag.appendChild(el);
    }
  });
  refs.bodyInput.appendChild(frag);
}

function runFind(keepIndex = false) {
  const q = refs.findInput.value;
  find.query = q;
  find.matches = [];
  if (!q) {
    find.index = 0;
    clearFindHits();
    refs.findCount.textContent = '0 / 0';
    refs.findCount.classList.remove('none');
    return;
  }
  const map = collectBodyTextMap();
  const hay = map.text.toLowerCase();
  const needle = q.toLowerCase();
  for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + needle.length)) {
    const range = rangeFromTextMap(map, i, i + needle.length);
    if (range) find.matches.push({ from: i, to: i + needle.length, range });
  }
  if (!keepIndex || find.index >= find.matches.length) find.index = 0;
  refs.findCount.textContent = `${find.matches.length ? find.index + 1 : 0} / ${find.matches.length}`;
  refs.findCount.classList.toggle('none', find.matches.length === 0);
  paintFindHits();
}
function gotoFindMatch(step) {
  if (find.matches.length === 0) return;
  find.index = (find.index + step + find.matches.length) % find.matches.length;
  refs.findCount.textContent = `${find.index + 1} / ${find.matches.length}`;
  paintFindHits();
  const m = find.matches[find.index];
  /* 見つかった箇所が画面外なら、その行までスクロールする */
  const rect = m.range.getBoundingClientRect();
  const view = refs.bodyInput.getBoundingClientRect();
  if (rect.top < view.top + 8 || rect.bottom > view.bottom - 8) {
    refs.bodyInput.scrollTop += rect.top - view.top - view.height / 3;
    paintFindHits();
  }
}
/* 検索欄を開いている間は、本文を編集しても結果を追従させる */
const refreshFindDebounced = debounce(() => { if (!refs.findBar.hidden) runFind(true); }, 200);

function openFindBar() {
  if (refs.sheet.hidden) return;
  refs.findBar.hidden = false;
  const sel = window.getSelection();
  const selText = sel && !sel.isCollapsed && refs.bodyInput.contains(sel.anchorNode) ? sel.toString() : '';
  if (selText && !selText.includes('\n')) refs.findInput.value = selText;
  refs.findInput.focus();
  refs.findInput.select();
  runFind();
}
function closeFindBar() {
  if (refs.findBar.hidden) return;
  refs.findBar.hidden = true;
  find.matches = [];
  find.query = '';
  clearFindHits();
}
function toggleFindBar() {
  if (refs.findBar.hidden) openFindBar();
  else closeFindBar();
}

/* いま選ばれている箇所を置換する */
function replaceCurrentMatch() {
  if (find.matches.length === 0) { toast('置換する箇所がありません', 'info'); return; }
  const to = refs.replaceInput.value;
  const m = find.matches[find.index];
  pushHistory();
  const range = m.range;
  range.deleteContents();
  if (to) {
    const node = document.createTextNode(to);
    range.insertNode(node);
  }
  afterBodyEdit();
  runFind(true);
  if (find.matches.length > 0) paintFindHits();
  toast('1 件を置換しました', 'success');
}
/* 見つかったすべてを置換する。後ろから順に置き換えることで、
   前の置換で文字位置がずれても残りの箇所を正しく指し続ける */
function replaceAllMatches() {
  if (find.matches.length === 0) { toast('置換する箇所がありません', 'info'); return; }
  const to = refs.replaceInput.value;
  const n = find.matches.length;
  pushHistory();
  for (let i = n - 1; i >= 0; i--) {
    const range = find.matches[i].range;
    if (!range) continue;
    try {
      range.deleteContents();
      if (to) range.insertNode(document.createTextNode(to));
    } catch (err) { console.error(err); }
  }
  afterBodyEdit();
  runFind();
  toast(`${n} 件を置換しました`, 'success');
}
