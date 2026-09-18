/* ============================================================
   search.js
   検索：本文マーカーの除去、検索用テキストの生成、検索条件の解釈と照合
   ------------------------------------------------------------
   ここに置く関数は DOM に触れない純粋関数にしておく（tests/ から
   そのまま読み込んで検証できるようにするため）。
   ============================================================ */
'use strict';

/* ============================================================
   本文マーカーの除去
   ============================================================ */
/* 本文の保存形式に含まれるマーカー。画面には見えない文字列なので、
   検索・抜粋・文字数からは取り除く。書式タグを増やしたらここにも足すこと */
const BODY_IMG_MARKER_RE = /\[img:\d+(?::[lcr])?(?::(?:[sml]|\d+|fit))?\]/g;
const BODY_FMT_TAG_RE = /\[\/?(?:b|i|size(?:=\d{1,3})?|color(?:=#[0-9a-fA-F]{6})?|hl(?:=#[0-9a-fA-F]{6})?|font(?:=[a-z]+)?|link(?:=[^\]]*)?|h(?:=[1-6])?|li|task(?:=[01])?)\]/g;

/* 保存形式の本文から、画面に見えている文字だけを取り出す（改行や連続空白は
   1つの空白にまとめる）。検索と抜粋で共用する */
const stripMarkers = text => String(text ?? '')
  .replace(BODY_IMG_MARKER_RE, ' ')
  .replace(BODY_FMT_TAG_RE, '')
  .replace(/\s+/g, ' ').trim();

/* メモレコードに持たせる検索用テキスト。保存時に作って memos へ書き込み、
   検索のたびに全メモへ正規表現をかけ直さなくて済むようにする */
const buildPlainBody = body => stripMarkers(body);

/* ============================================================
   検索条件の解釈
   ------------------------------------------------------------
   例） 定例 -欠席 tag:業務 mark:重要 is:image date:2026-09
   ・空白区切りの語はすべて含む（AND）
   ・"..." と 「...」 は空白を含む1語として扱う
   ・先頭の - は除外
   ・field:value 形式で対象を絞る（未知の field はただの語として扱う）
   ============================================================ */
const SEARCH_FIELD_ALIASES = {
  tag: 'tag', タグ: 'tag',
  mark: 'mark', 目印: 'mark',
  is: 'is', has: 'is',
  title: 'title', タイトル: 'title',
  body: 'body', 本文: 'body',
  date: 'created', 日付: 'created', created: 'created', 作成: 'created',
  updated: 'updated', 更新: 'updated',
  after: 'after', since: 'after', 以降: 'after',
  before: 'before', until: 'before', 以前: 'before',
};

/* 空白で区切りつつ、引用符で囲まれた部分はひとまとまりに保つ */
function splitSearchTokens(input) {
  const s = String(input ?? '');
  const isSpace = ch => ch === ' ' || ch === '　' || ch === '\t' || ch === '\n';
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    if (isSpace(s[i])) { i++; continue; }
    let text = '';
    let quoted = false;
    while (i < s.length && !isSpace(s[i])) {
      const c = s[i];
      if (c === '"' || c === '「') {           /* " または 「 */
        const close = c === '"' ? '"' : '」';  /* " または 」 */
        const end = s.indexOf(close, i + 1);
        /* 引用符で始まる語だけを「文字どおりの1語」とみなす。
           tag:"営業 部" のように途中から囲む書き方は、値に空白を含めたい
           だけなので、先頭の - による除外指定を殺さないようにする */
        if (text === '') quoted = true;
        if (end === -1) { text += s.slice(i + 1); i = s.length; break; }
        text += s.slice(i + 1, end);
        i = end + 1;
        continue;
      }
      text += c;
      i++;
    }
    if (text) tokens.push({ text, quoted });
  }
  return tokens;
}

/* 日付の指定を「その日/その月/その年」の範囲（ミリ秒）へ変換する。
   解釈できない指定は null を返し、呼び出し側でただの語として扱う */
function parseDateValue(value, now = Date.now()) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  const dayOf = ts => {
    const d = new Date(ts);
    const from = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    return { from, to: from + 86400000 };
  };
  if (v === 'today' || v === '今日') return dayOf(now);
  if (v === 'yesterday' || v === '昨日') return dayOf(now - 86400000);
  const m = /^(\d{4})(?:[-/.](\d{1,2})(?:[-/.](\d{1,2}))?)?$/.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  if (m[3] !== undefined) {
    const from = new Date(y, Number(m[2]) - 1, Number(m[3])).getTime();
    return { from, to: from + 86400000 };
  }
  if (m[2] !== undefined) {
    const mo = Number(m[2]) - 1;
    return { from: new Date(y, mo, 1).getTime(), to: new Date(y, mo + 1, 1).getTime() };
  }
  return { from: new Date(y, 0, 1).getTime(), to: new Date(y + 1, 0, 1).getTime() };
}

/* is: に指定できる条件。表記ゆれと日本語も受ける */
const SEARCH_IS_ALIASES = {
  image: 'image', images: 'image', 画像: 'image', img: 'image',
  file: 'file', files: 'file', 添付: 'file', attach: 'file',
  mark: 'marked', marked: 'marked', 目印: 'marked',
  tagged: 'tagged', タグあり: 'tagged',
  untagged: 'untagged', notag: 'untagged', タグなし: 'untagged',
  pin: 'pinned', pinned: 'pinned', ピン: 'pinned',
};

function parseSearchQuery(input, options = {}) {
  const now = options.now ?? Date.now();
  /* 目印は id でも日本語のラベルでも指定できるようにする */
  const markIds = options.markIds || [];
  const markLabels = options.markLabels || {};
  const resolveMark = raw => {
    const v = String(raw || '').toLowerCase();
    if (v === 'any' || v === 'あり') return 'any';
    if (v === 'none' || v === 'なし') return 'none';
    if (markIds.includes(v)) return v;
    for (const id of markIds) if (String(markLabels[id] || '').toLowerCase() === v) return id;
    return null;
  };

  const q = { terms: [], tags: [], marks: [], flags: [], ranges: [], text: String(input ?? '') };
  for (const tok of splitSearchTokens(input)) {
    let raw = tok.text;
    /* src は「検索欄に書かれていた語そのもの」。条件チップが、表記ゆれを
       気にせずその語だけを消せるように持たせておく（照合には使わない） */
    const src = tok.text;
    let negate = false;
    if (!tok.quoted && (raw.startsWith('-') || raw.startsWith('－')) && raw.length > 1) {
      negate = true;
      raw = raw.slice(1);
    }
    const addTerm = (text, field = null) => {
      if (text) q.terms.push({ text: text.toLowerCase(), negate, field, src, raw: text });
    };
    const sep = raw.indexOf(':');
    const sepFull = raw.indexOf('：');   /* 全角コロン */
    const at = sep === -1 ? sepFull : (sepFull === -1 ? sep : Math.min(sep, sepFull));
    if (at <= 0) { addTerm(raw); continue; }
    const field = SEARCH_FIELD_ALIASES[raw.slice(0, at).toLowerCase()];
    const value = raw.slice(at + 1);
    if (!field || !value) { addTerm(raw); continue; }

    if (field === 'tag') { q.tags.push({ name: value.toLowerCase(), negate, src, raw: value }); continue; }
    if (field === 'mark') {
      const id = resolveMark(value);
      if (id) q.marks.push({ id, negate, src, raw: value });
      else addTerm(raw);
      continue;
    }
    if (field === 'is') {
      const flag = SEARCH_IS_ALIASES[value.toLowerCase()];
      if (flag) q.flags.push({ name: flag, negate, src, raw: value });
      else addTerm(raw);
      continue;
    }
    if (field === 'title' || field === 'body') { addTerm(value, field); continue; }
    /* 日付系 */
    const range = parseDateValue(value, now);
    if (!range) { addTerm(raw); continue; }
    const on = field === 'updated' ? 'updatedAt' : 'createdAt';
    /* raw/key は条件チップの表示に使う（照合には使わない） */
    const meta = { raw: value, key: field, src };
    if (field === 'after')       q.ranges.push({ field: 'createdAt', from: range.from, to: Infinity, negate, ...meta });
    else if (field === 'before') q.ranges.push({ field: 'createdAt', from: -Infinity, to: range.to, negate, ...meta });
    else                         q.ranges.push({ field: on, from: range.from, to: range.to, negate, ...meta });
  }
  return q;
}

/* 条件が1つも無い（＝絞り込まない）か */
const isEmptySearchQuery = q =>
  !q || (q.terms.length === 0 && q.tags.length === 0 && q.marks.length === 0 &&
         q.flags.length === 0 && q.ranges.length === 0);

/* 解釈した条件でメモ1件を判定する。
   bodyText には小文字化済みの本文（マーカー除去後）を渡す */
function matchMemoQuery(memo, q, scope, bodyText) {
  if (isEmptySearchQuery(q)) return true;
  const title = String(memo.title || '').toLowerCase();
  const tags  = (memo.tags || []).map(t => String(t).toLowerCase());
  const body  = String(bodyText || '');

  for (const t of q.terms) {
    let hit;
    if (t.field === 'title')      hit = title.includes(t.text);
    else if (t.field === 'body')  hit = body.includes(t.text);
    else {
      hit = (scope.title && title.includes(t.text)) ||
            (scope.tags  && tags.some(x => x.includes(t.text))) ||
            (scope.body  && body.includes(t.text));
    }
    if (hit === t.negate) return false;
  }
  for (const f of q.tags) {
    const hit = tags.some(x => x === f.name || x.includes(f.name));
    if (hit === f.negate) return false;
  }
  for (const f of q.marks) {
    const hit = f.id === 'any' ? !!memo.mark : f.id === 'none' ? !memo.mark : memo.mark === f.id;
    if (hit === f.negate) return false;
  }
  for (const f of q.flags) {
    let hit = false;
    if (f.name === 'image')         hit = (memo.imageCount || 0) > 0;
    else if (f.name === 'file')     hit = (memo.fileCount || 0) > 0;
    else if (f.name === 'marked')   hit = !!memo.mark;
    else if (f.name === 'pinned')   hit = memo.mark === 'pin';
    else if (f.name === 'tagged')   hit = (memo.tags || []).length > 0;
    else if (f.name === 'untagged') hit = (memo.tags || []).length === 0;
    if (hit === f.negate) return false;
  }
  for (const r of q.ranges) {
    const ts = memo[r.field];
    const hit = typeof ts === 'number' && ts >= r.from && ts < r.to;
    if (hit === r.negate) return false;
  }
  return true;
}

/* 抜粋（スニペット）でハイライトすべき語。除外語と条件指定は対象外 */
const searchHighlightTerms = q =>
  !q ? [] : q.terms.filter(t => !t.negate && t.field !== 'title').map(t => t.text);

/* ============================================================
   検索用テキストのキャッシュ
   ------------------------------------------------------------
   memos には plainBody（マーカー除去済み・元の大小文字）を保存してあるが、
   照合には小文字が要る。更新のたびに作り直すのは無駄なので、
   updatedAt を目印にメモリ側でキャッシュする
   ============================================================ */
const plainLowerCache = new Map();
/* 保存済みの plainBody を使う。旧バージョンで保存されたメモ（plainBody を
   持たない）は、その場で作って動作を止めない */
const memoPlainBody = memo =>
  typeof memo.plainBody === 'string' ? memo.plainBody : stripMarkers(memo.body);
function memoSearchText(memo) {
  const hit = plainLowerCache.get(memo.id);
  if (hit && hit.stamp === memo.updatedAt) return hit.lower;
  const lower = memoPlainBody(memo).toLowerCase();
  plainLowerCache.set(memo.id, { stamp: memo.updatedAt, lower });
  return lower;
}

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = {
    BODY_IMG_MARKER_RE, BODY_FMT_TAG_RE, stripMarkers, buildPlainBody,
    splitSearchTokens, parseDateValue, parseSearchQuery, isEmptySearchQuery,
    matchMemoQuery, searchHighlightTerms,
  };
}
