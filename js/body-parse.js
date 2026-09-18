/* ============================================================
   body-parse.js
   本文の保存形式（[b] [size=N] [img:1:c:fit] …）の解釈と組み立て
   ------------------------------------------------------------
   DOM を作る処理（body.js）と、文字列としての解釈をここで分ける。
   ここは DOM に触れない純粋関数なので tests/ からそのまま検証できる。
   ============================================================ */
'use strict';

/* 本文に書ける書式タグ。並び順は正規表現の選択順でもあるため、
   前方が一致する長い方（link を li より前、hl を h より前）を先に置く */
const BODY_FMT_TAGS = ['b', 'i', 'size', 'color', 'hl', 'font', 'link', 'task', 'li', 'h'];
const BODY_TOKEN_RE = /\[img:(?<imgId>\d+)(?::(?<imgAlign>[lcr]))?(?::(?<imgSize>[sml]|\d+|fit))?\]|\[(?<close>\/)?(?<tag>b|i|size|color|hl|font|link|task|li|h)(?:=(?<param>[^\]]*))?\]/g;

/* 保存形式の本文を、入れ子を保ったままの木構造へ分解する。
   戻り値の要素は次のいずれか。
     { type:'text', text }
     { type:'img',  id, align, size }
     { type:'fmt',  tag, param, children:[…] }

   【重要】走査位置は pos で明示的に管理する。以前は g フラグ正規表現の
   lastIndex を再帰をまたいで共有していたが、JS の仕様では exec が失敗すると
   lastIndex が 0 にリセットされるため、閉じタグの無い開始タグ（ユーザーが
   文字通り「[b]」と入力した場合など）で呼び出し元が先頭から再走査してしまい、
   無限ループでアプリ全体がフリーズする致命的な不具合があった。 */
function tokenizeBody(input) {
  const text = String(input ?? '');
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
  /* 連続する文字は1つの text ノードにまとめる */
  const pushText = (nodes, s) => {
    if (!s) return;
    const last = nodes[nodes.length - 1];
    if (last && last.type === 'text') last.text += s;
    else nodes.push({ type: 'text', text: s });
  };

  function parse(stopTag) {
    const nodes = [];
    while (pos < text.length) {
      BODY_TOKEN_RE.lastIndex = pos;
      const m = BODY_TOKEN_RE.exec(text);
      if (!m) break;
      if (m.index > pos) pushText(nodes, text.slice(pos, m.index));
      pos = m.index + m[0].length;
      const g = m.groups;
      if (g.imgId !== undefined) {
        nodes.push({ type: 'img', id: Number(g.imgId), align: g.imgAlign || 'c', size: g.imgSize || 'fit' });
        continue;
      }
      if (g.close) {
        if (g.tag === stopTag) return nodes;
        /* 対応する開始タグの無い閉じタグは、書式として解釈せず文字のまま残す */
        pushText(nodes, m[0]);
        continue;
      }
      /* 対応する閉じタグが後方に無い開始タグも文字のまま残す。ユーザーが
         文字通り「[b]」等と入力したケースで、以降全文が意図せず書式化されたり
         入力した文字が消えたりしないようにする */
      if (!hasCloseAhead(g.tag)) {
        pushText(nodes, m[0]);
        continue;
      }
      nodes.push({ type: 'fmt', tag: g.tag, param: g.param, children: parse(g.tag) });
    }
    if (pos < text.length) {
      pushText(nodes, text.slice(pos));
      pos = text.length;
    }
    return nodes;
  }
  return parse(null);
}

/* 木構造を保存形式の文字列へ戻す（往復の検証と、テキスト側での編集に使う） */
function tokensToText(nodes) {
  let out = '';
  for (const n of nodes || []) {
    if (n.type === 'text') out += n.text;
    else if (n.type === 'img') out += `[img:${n.id}:${n.align || 'c'}:${n.size || 'fit'}]`;
    else if (n.type === 'fmt') {
      const open = n.param === undefined || n.param === null ? `[${n.tag}]` : `[${n.tag}=${n.param}]`;
      out += open + tokensToText(n.children) + `[/${n.tag}]`;
    }
  }
  return out;
}

/* ============================================================
   段落（行単位の書式）
   ------------------------------------------------------------
   見出し・箇条書き・チェックリストは「1行まるごと」に効く書式として
   [h=2]…[/h] / [li]…[/li] / [task]…[/task] の形で保存する。
   ============================================================ */
const BLOCK_KINDS = ['h1', 'h2', 'h3', 'li', 'task'];
const isBlockKind = kind => BLOCK_KINDS.includes(kind);

/* 1行を「段落の種類」と「中身」に分ける（段落書式が無ければ kind は null） */
function parseBlockLine(line) {
  const s = String(line ?? '');
  let m;
  if ((m = /^\[h=([1-6])\]([\s\S]*)\[\/h\]$/.exec(s)))            return { kind: 'h' + m[1], inner: m[2], done: false };
  if ((m = /^\[li\]([\s\S]*)\[\/li\]$/.exec(s)))                  return { kind: 'li', inner: m[1], done: false };
  if ((m = /^\[task(?:=([01]))?\]([\s\S]*)\[\/task\]$/.exec(s)))  return { kind: 'task', inner: m[2], done: m[1] === '1' };
  return { kind: null, inner: s, done: false };
}
/* 段落書式の開始・終了タグ。キャレット位置の付け替えでも使う */
function blockAffixes(kind, done = false) {
  if (!kind || kind === 'p') return { open: '', close: '' };
  if (kind === 'task') return { open: done ? '[task=1]' : '[task]', close: '[/task]' };
  if (kind === 'li')   return { open: '[li]', close: '[/li]' };
  const level = Math.min(6, Math.max(1, Number(String(kind).slice(1)) || 2));
  return { open: `[h=${level}]`, close: '[/h]' };
}
function makeBlockLine(kind, inner, done = false) {
  const { open, close } = blockAffixes(kind, done);
  return open + String(inner ?? '') + close;
}
/* 各行の先頭が文字列全体の何文字目から始まるか */
function lineStartOffsets(lines) {
  const starts = [];
  let at = 0;
  for (const line of lines) { starts.push(at); at += line.length + 1; }
  return starts;
}
function offsetToLineIndex(lines, offset) {
  const starts = lineStartOffsets(lines);
  let i = starts.length - 1;
  while (i > 0 && starts[i] > offset) i--;
  return Math.max(0, i);
}
/* 指定した行範囲へ段落書式を適用する。すでに全行が同じ書式なら解除する
   （同じボタンをもう一度押したら戻る）。空行は対象にしない */
function applyBlockToLines(lines, start, end, kind) {
  const out = [...lines];
  if (out.length === 0) return out;
  const s = Math.max(0, Math.min(start, out.length - 1));
  const e = Math.max(s, Math.min(end, out.length - 1));
  const targets = [];
  for (let i = s; i <= e; i++) {
    if (parseBlockLine(out[i]).inner.trim() !== '') targets.push(i);
  }
  if (targets.length === 0) return out;
  const allSame = targets.every(i => parseBlockLine(out[i]).kind === kind);
  const next = (allSame || kind === 'p') ? null : kind;
  for (const i of targets) {
    const cur = parseBlockLine(out[i]);
    out[i] = makeBlockLine(next, cur.inner, cur.done);
  }
  return out;
}

/* 保存形式の本文を、画面で見えているとおりの文字へ直す（コピー・書き出し用）。
   段落書式は記号に置き換え、そのほかのマーカーは取り除く */
function bodyToDisplayText(body) {
  return String(body ?? '').split('\n').map(line => {
    const p = parseBlockLine(line);
    const inner = String(p.inner).replace(BODY_IMG_MARKER_RE, '').replace(BODY_FMT_TAG_RE, '');
    if (p.kind === 'li')   return '・' + inner;
    if (p.kind === 'task') return (p.done ? '☑ ' : '☐ ') + inner;
    return inner;
  }).join('\n');
}

/* 本文中の画像参照 [img:旧ID…] を新しい ID へ振り替える（インポートで使う） */
function remapBodyImageIds(body, idMap) {
  return String(body ?? '').replace(/\[img:(\d+)((?::[lcr])?(?::(?:[sml]|\d+|fit))?)\]/g,
    (whole, id, rest) => {
      const next = idMap instanceof Map ? idMap.get(Number(id)) : idMap[id];
      return next === undefined || next === null ? whole : `[img:${next}${rest}]`;
    });
}

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = {
    BODY_FMT_TAGS, tokenizeBody, tokensToText,
    BLOCK_KINDS, isBlockKind, parseBlockLine, makeBlockLine, blockAffixes,
    applyBlockToLines, lineStartOffsets, offsetToLineIndex,
    bodyToDisplayText, remapBodyImageIds,
  };
}
