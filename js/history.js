/* ============================================================
   history.js
   本文の「元に戻す／やり直す」
   ------------------------------------------------------------
   このエディタは書式の適用・貼り付け・画像の挿入を Range 操作で直接
   行っている（ブラウザ既定の編集コマンドを使っていない）ため、
   ブラウザが持つ取り消し履歴とは噛み合わない。本文を保存形式の文字列
   として控え、キャレット位置と一緒に積んでおくことで、どの操作でも
   同じように戻せるようにする。
   ============================================================ */
'use strict';

const HISTORY_LIMIT     = 120;   /* 保持するスナップショット数 */
const HISTORY_COALESCE_MS = 700; /* 連続した文字入力はこの間隔でまとめる */

const bodyHistory = {
  stack: [],      /* [{ text, start, end }] 先頭が最も古い */
  index: -1,      /* いま表示している位置 */
  lastPush: 0,
  restoring: false,
};

/* いまの本文とキャレット位置を1件ぶんの記録として取り出す */
function historySnapshot() {
  const sel = window.getSelection();
  const r = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const inBody = r && refs.bodyInput.contains(r.startContainer);
  const { text, points } = serializeBodyInternal(inBody
    ? [{ node: r.startContainer, offset: r.startOffset }, { node: r.endContainer, offset: r.endOffset }]
    : []);
  const start = inBody && points[0] !== -1 ? points[0] : null;
  const end   = inBody && points[1] !== -1 ? points[1] : start;
  return { text, start, end };
}

/* メモを開き直したときなどに履歴を作り直す（いまの状態を起点にする） */
function resetHistory() {
  bodyHistory.stack = [historySnapshot()];
  bodyHistory.index = 0;
  bodyHistory.lastPush = 0;
  updateHistoryButtons();
}

/* 書式の適用や貼り付けのような「まとまった操作」の直前に呼ぶ。
   操作前の状態を確実に履歴へ残し、続けて記録される操作後の状態が
   打鍵のまとめ扱いで上書きされないようにする */
function pushHistory() {
  if (bodyHistory.restoring) return;
  if (bodyHistory.stack.length === 0) { resetHistory(); return; }
  const snap = historySnapshot();
  const current = bodyHistory.stack[bodyHistory.index];
  if (current && current.text === snap.text) {
    /* 内容が同じならキャレット位置だけ更新しておく（戻したときに
       カーソルが飛ばないように） */
    current.start = snap.start;
    current.end = snap.end;
  } else {
    bodyHistory.stack = bodyHistory.stack.slice(0, bodyHistory.index + 1);
    bodyHistory.stack.push(snap);
    if (bodyHistory.stack.length > HISTORY_LIMIT) bodyHistory.stack.shift();
    bodyHistory.index = bodyHistory.stack.length - 1;
  }
  bodyHistory.lastPush = 0;   /* 次の記録は必ず別の1件として積む */
  updateHistoryButtons();
}

/* 入力イベントからの呼び出し。変更後の状態しか取れないため、
   「直前の状態」は1つ前のスナップショットとして既に積まれている前提で、
   ここでは最新の状態を積み直す */
function recordHistoryAfterInput() {
  if (bodyHistory.restoring) return;
  const now = Date.now();
  const snap = historySnapshot();
  const current = bodyHistory.stack[bodyHistory.index];
  if (current && current.text === snap.text) {
    current.start = snap.start;
    current.end = snap.end;
    return;
  }
  /* 連続した打鍵は1件にまとめる（1文字ずつ戻すと使いものにならない） */
  if (now - bodyHistory.lastPush < HISTORY_COALESCE_MS && bodyHistory.index > 0) {
    bodyHistory.stack[bodyHistory.index] = snap;
    bodyHistory.lastPush = now;
    return;
  }
  bodyHistory.stack = bodyHistory.stack.slice(0, bodyHistory.index + 1);
  bodyHistory.stack.push(snap);
  if (bodyHistory.stack.length > HISTORY_LIMIT) bodyHistory.stack.shift();
  bodyHistory.index = bodyHistory.stack.length - 1;
  bodyHistory.lastPush = now;
  updateHistoryButtons();
}

function applyHistoryEntry(entry) {
  bodyHistory.restoring = true;
  try {
    deserializeBody(entry.text);
    refs.bodyInput.focus();
    if (entry.start !== null && entry.start !== undefined) {
      setBodyCaretOffset(entry.start, entry.end ?? entry.start);
    }
  } finally {
    bodyHistory.restoring = false;
  }
  markDirty();
  renderCharCount();
  rebuildLineMarksDebounced();
  updateCursorHighlight();
  updateFormatToolbarState();
  updateHistoryButtons();
}

function undoBody() {
  if (refs.sheet.hidden) return;
  /* まだ履歴に載っていない最新の変更があれば、まずそれを積んでから戻る */
  const snap = historySnapshot();
  const current = bodyHistory.stack[bodyHistory.index];
  if (current && current.text !== snap.text) {
    bodyHistory.stack = bodyHistory.stack.slice(0, bodyHistory.index + 1);
    bodyHistory.stack.push(snap);
    bodyHistory.index = bodyHistory.stack.length - 1;
  }
  if (bodyHistory.index <= 0) { toast('これ以上は戻せません', 'info'); return; }
  bodyHistory.index--;
  applyHistoryEntry(bodyHistory.stack[bodyHistory.index]);
}
function redoBody() {
  if (refs.sheet.hidden) return;
  if (bodyHistory.index >= bodyHistory.stack.length - 1) { toast('やり直せる操作はありません', 'info'); return; }
  bodyHistory.index++;
  applyHistoryEntry(bodyHistory.stack[bodyHistory.index]);
}
function updateHistoryButtons() {
  if (!refs.btnUndo) return;
  refs.btnUndo.disabled = bodyHistory.index <= 0;
  refs.btnRedo.disabled = bodyHistory.index >= bodyHistory.stack.length - 1;
}
