/* 検索条件の解釈と照合のテスト */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('./helpers.js');

const SCOPE_ALL = { title: true, tags: true, body: true };
const OPTS = {
  markIds: MEMO_MARKS.map(m => m.id),
  markLabels: Object.fromEntries(MEMO_MARKS.map(m => [m.id, m.label])),
};
const memo = (over = {}) => ({
  id: 1, title: '定例会議', tags: ['業務', '議事録'], body: '出席者は3名。次回は来週。',
  mark: null, imageCount: 0, fileCount: 0,
  createdAt: new Date(2026, 8, 18, 10, 0).getTime(),
  updatedAt: new Date(2026, 8, 18, 12, 0).getTime(),
  ...over,
});
const match = (m, q) => matchMemoQuery(m, parseSearchQuery(q, OPTS), SCOPE_ALL, stripMarkers(m.body).toLowerCase());

test('本文のマーカーを取り除いて検索用のテキストを作る', () => {
  assert.equal(stripMarkers('[b]太字[/b]と[img:1:c:fit]画像'), '太字と 画像');
  assert.equal(stripMarkers('[h=2]見出し[/h]\n[li]項目[/li]'), '見出し 項目');
  assert.equal(buildPlainBody('[task=1]完了[/task]'), '完了');
});

test('引用符で囲むと空白を含む1語として扱う', () => {
  assert.deepEqual(splitSearchTokens('定例 "打ち合わせ 3月"').map(t => t.text),
    ['定例', '打ち合わせ 3月']);
  assert.deepEqual(splitSearchTokens('「議事 録」').map(t => t.text), ['議事 録']);
});

test('空白区切りの語はすべて含む（AND）', () => {
  assert.equal(match(memo(), '定例 出席者'), true);
  assert.equal(match(memo(), '定例 欠席者'), false);
});

test('先頭の - でその語を含まないメモに絞る', () => {
  assert.equal(match(memo(), '-欠席'), true);
  assert.equal(match(memo(), '-出席'), false);
});

test('引用符の中の - は除外ではなく文字として扱う', () => {
  const m = memo({ body: '-5度まで下がった' });
  assert.equal(match(m, '"-5度"'), true);
});

test('tag: でタグを絞り込める', () => {
  assert.equal(match(memo(), 'tag:業務'), true);
  assert.equal(match(memo(), 'tag:私用'), false);
  assert.equal(match(memo(), '-tag:業務'), false);
  assert.equal(match(memo(), 'タグ:議事録'), true);
});

test('mark: は id でも日本語のラベルでも指定できる', () => {
  const marked = memo({ mark: 'star' });
  assert.equal(match(marked, 'mark:star'), true);
  assert.equal(match(marked, 'mark:重要'), true);
  assert.equal(match(marked, 'mark:flag'), false);
  assert.equal(match(marked, 'mark:any'), true);
  assert.equal(match(memo(), 'mark:none'), true);
  assert.equal(match(marked, 'mark:none'), false);
});

test('is: で画像・添付・タグの有無を絞り込める', () => {
  assert.equal(match(memo({ imageCount: 2 }), 'is:image'), true);
  assert.equal(match(memo(), 'is:image'), false);
  assert.equal(match(memo({ fileCount: 1 }), 'is:file'), true);
  assert.equal(match(memo({ tags: [] }), 'is:untagged'), true);
  assert.equal(match(memo(), 'is:untagged'), false);
  assert.equal(match(memo({ mark: 'pin' }), 'is:pinned'), true);
});

test('date: は日・月・年のいずれの粒度でも指定できる', () => {
  assert.equal(match(memo(), 'date:2026-09-18'), true);
  assert.equal(match(memo(), 'date:2026-09'), true);
  assert.equal(match(memo(), 'date:2026'), true);
  assert.equal(match(memo(), 'date:2026-09-17'), false);
  assert.equal(match(memo(), 'date:2026/09/18'), true);
});

test('after: / before: は作成日の前後で絞り込む', () => {
  assert.equal(match(memo(), 'after:2026-09-01'), true);
  assert.equal(match(memo(), 'after:2026-10-01'), false);
  assert.equal(match(memo(), 'before:2026-09-30'), true);
  assert.equal(match(memo(), 'before:2026-09-01'), false);
});

test('updated: は更新日で絞り込む', () => {
  const m = memo({ createdAt: new Date(2026, 0, 1).getTime() });
  assert.equal(match(m, 'date:2026-01-01'), true);
  assert.equal(match(m, 'updated:2026-09-18'), true);
  assert.equal(match(m, 'updated:2026-01-01'), false);
});

test('title: / body: で対象を限定できる', () => {
  assert.equal(match(memo(), 'title:定例'), true);
  assert.equal(match(memo(), 'title:出席者'), false);
  assert.equal(match(memo(), 'body:出席者'), true);
  assert.equal(match(memo(), 'body:定例'), false);
});

test('未知の field はただの検索語として扱う', () => {
  const m = memo({ body: 'https://example.com/a を参照' });
  assert.equal(match(m, 'https://example.com/a'), true);
  assert.equal(match(memo(), 'foo:bar'), false);
});

test('検索対象の指定（タイトルのみ等）が効く', () => {
  const q = parseSearchQuery('出席者', OPTS);
  const m = memo();
  const body = stripMarkers(m.body).toLowerCase();
  assert.equal(matchMemoQuery(m, q, { title: true, tags: true, body: false }, body), false);
  assert.equal(matchMemoQuery(m, q, { title: false, tags: false, body: true }, body), true);
});

test('条件が空なら何も絞り込まない', () => {
  assert.equal(isEmptySearchQuery(parseSearchQuery('', OPTS)), true);
  assert.equal(isEmptySearchQuery(parseSearchQuery('   ', OPTS)), true);
  assert.equal(isEmptySearchQuery(parseSearchQuery('tag:業務', OPTS)), false);
});

test('ハイライトすべき語には除外語を含めない', () => {
  const q = parseSearchQuery('定例 -欠席 tag:業務', OPTS);
  assert.deepEqual(searchHighlightTerms(q), ['定例']);
});

test('相対日付は基準時刻から解決する', () => {
  const now = new Date(2026, 8, 18, 15, 0).getTime();
  const today = parseDateValue('今日', now);
  assert.equal(today.from, new Date(2026, 8, 18).getTime());
  assert.equal(today.to, new Date(2026, 8, 19).getTime());
  const yst = parseDateValue('yesterday', now);
  assert.equal(yst.from, new Date(2026, 8, 17).getTime());
  assert.equal(parseDateValue('あした', now), null);
});
