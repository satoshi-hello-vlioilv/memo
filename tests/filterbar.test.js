/* 条件チップ（絞り込みの一本化）で使う、検索欄の語を足し引きする関数のテスト。
   チップ操作と検索構文が同じ入口になったので、往復して壊れないことが要。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { filterbar, search } = require('./helpers');

const { tokenKey, serializeToken, queryHasToken, removeQueryToken, addQueryToken, renameQueryToken } = filterbar;
const { splitSearchTokens, parseSearchQuery } = search;

/* ------------------------------------------------------------
   語の出し入れ
   ------------------------------------------------------------ */
test('語を足す：空の検索欄と、既に語がある検索欄', () => {
  assert.strictEqual(addQueryToken('', 'tag:業務'), 'tag:業務');
  assert.strictEqual(addQueryToken('定例', 'tag:業務'), '定例 tag:業務');
  assert.strictEqual(addQueryToken('  定例  ', 'tag:業務'), '定例 tag:業務');
});

test('語を外す：指定した語だけが消え、他はそのまま残る', () => {
  assert.strictEqual(removeQueryToken('定例 tag:業務 is:image', 'tag:業務'), '定例 is:image');
  assert.strictEqual(removeQueryToken('tag:業務', 'tag:業務'), '');
  /* 無い語を外しても何も変わらない */
  assert.strictEqual(removeQueryToken('定例 tag:業務', 'tag:私用'), '定例 tag:業務');
});

test('語があるかの判定は大小文字と引用符の書き方に左右されない', () => {
  assert.ok(queryHasToken('tag:Work', 'tag:work'));
  assert.ok(queryHasToken('tag:"営業 部"', 'tag:"営業 部"'));
  assert.ok(!queryHasToken('tag:営業', 'tag:営業部'));
  /* 空の語では常に false（誤って全部消さないための歯止め） */
  assert.ok(!queryHasToken('tag:業務', ''));
});

/* ------------------------------------------------------------
   空白を含む値の引用符
   ------------------------------------------------------------ */
test('空白を含む値は、語全体ではなく値だけを引用符で囲む', () => {
  /* "tag:営業 部" と全体を囲むと tag: が語の一部になって絞り込めない */
  assert.strictEqual(serializeToken('tag:営業 部'), 'tag:"営業 部"');
  assert.strictEqual(serializeToken('-tag:営業 部'), '-tag:"営業 部"');
  assert.strictEqual(serializeToken('tag:業務'), 'tag:業務');
  assert.strictEqual(serializeToken('定例 会議'), '"定例 会議"');
});

test('空白を含むタグを足して外すと、元の検索欄に戻る', () => {
  const added = addQueryToken('定例', 'tag:営業 部');
  assert.strictEqual(added, '定例 tag:"営業 部"');
  /* 既に引用符が付いた語を渡しても二重に包まない */
  assert.strictEqual(addQueryToken('定例', 'tag:"営業 部"'), added);
  /* 足した語が検索としても正しく解釈される */
  const q = parseSearchQuery(added);
  assert.deepStrictEqual(q.tags.map(t => t.name), ['営業 部']);
  assert.deepStrictEqual(q.terms.map(t => t.text), ['定例']);
  /* 外すと元通り */
  assert.strictEqual(removeQueryToken(added, 'tag:"営業 部"'), '定例');
});

test('他の語を外しても、残った語の引用符は保たれる', () => {
  const text = 'tag:"営業 部" "定例 会議" is:image';
  assert.strictEqual(removeQueryToken(text, 'is:image'), 'tag:"営業 部" "定例 会議"');
});

/* ------------------------------------------------------------
   除外指定（-）と引用符の組み合わせ
   ------------------------------------------------------------ */
test('値だけを引用符で囲んだ語でも、先頭の - は除外として効く', () => {
  const q = parseSearchQuery('-tag:"営業 部"');
  assert.strictEqual(q.tags.length, 1);
  assert.strictEqual(q.tags[0].name, '営業 部');
  assert.strictEqual(q.tags[0].negate, true);
});

test('語全体を引用符で囲んだ場合は、先頭の - も文字どおり扱う', () => {
  const q = parseSearchQuery('"-定例"');
  assert.strictEqual(q.terms.length, 1);
  assert.strictEqual(q.terms[0].text, '-定例');
  assert.strictEqual(q.terms[0].negate, false);
});

test('除外指定の語も足して外せる', () => {
  const text = addQueryToken('定例', '-tag:業務');
  assert.strictEqual(text, '定例 -tag:業務');
  assert.strictEqual(removeQueryToken(text, '-tag:業務'), '定例');
  /* 除外と非除外は別の条件なので、取り違えて消さない */
  assert.strictEqual(removeQueryToken(text, 'tag:業務'), '定例 -tag:業務');
});

/* ------------------------------------------------------------
   タグ名の変更への追従
   ------------------------------------------------------------ */
test('タグ名を変えると検索欄の tag: も追従する', () => {
  assert.strictEqual(renameQueryToken('定例 tag:業務', 'tag:業務', 'tag:仕事'), '定例 tag:仕事');
  assert.strictEqual(renameQueryToken('-tag:業務', '-tag:業務', '-tag:仕事'), '-tag:仕事');
  /* 新しい名前に空白が入っても壊れない */
  assert.strictEqual(renameQueryToken('tag:業務', 'tag:業務', 'tag:営業 部'), 'tag:"営業 部"');
});

/* ------------------------------------------------------------
   条件チップが「その語だけ」を消せること（src）
   ------------------------------------------------------------ */
test('解釈した条件は、検索欄に書かれていた語そのもの（src）を持つ', () => {
  const q = parseSearchQuery('定例 tag:業務 -is:画像 date:2026-09 title:議事録', {
    markIds: ['star'], markLabels: { star: '重要' },
  });
  assert.strictEqual(q.tags[0].src, 'tag:業務');
  assert.strictEqual(q.flags[0].src, '-is:画像');
  assert.strictEqual(q.ranges[0].src, 'date:2026-09');
  assert.deepStrictEqual(q.terms.map(t => t.src), ['定例', 'title:議事録']);
});

test('別名で書かれた条件も、その語のまま外せる', () => {
  /* 「タグ:」「目印:重要」のような別名・ラベル指定でも、
     条件チップの × が効かなくならないこと */
  const text = 'タグ:業務 mark:重要';
  const q = parseSearchQuery(text, { markIds: ['star'], markLabels: { star: '重要' } });
  assert.strictEqual(q.tags[0].name, '業務');
  assert.strictEqual(q.marks[0].id, 'star');
  assert.strictEqual(removeQueryToken(text, q.tags[0].src), 'mark:重要');
  assert.strictEqual(removeQueryToken(text, q.marks[0].src), 'タグ:業務');
});

test('表示用に、大小文字を変えていない元の値も持つ', () => {
  const q = parseSearchQuery('tag:Work Meeting');
  assert.strictEqual(q.tags[0].name, 'work');   /* 照合は小文字 */
  assert.strictEqual(q.tags[0].raw, 'Work');    /* 表示は元のまま */
  assert.strictEqual(q.terms[0].raw, 'Meeting');
});

/* ------------------------------------------------------------
   往復（チップ→検索欄→解釈→チップ）
   ------------------------------------------------------------ */
test('条件を足す→解釈する→その語で外す、を繰り返しても崩れない', () => {
  const opts = { markIds: ['star', 'flag'], markLabels: { star: '重要', flag: '対応中' } };
  let text = '';
  for (const tok of ['tag:業務', 'mark:star', 'is:image', 'tag:"営業 部"', '-tag:私用']) {
    text = addQueryToken(text, tok);
  }
  const q = parseSearchQuery(text, opts);
  assert.strictEqual(q.tags.length, 3);
  assert.strictEqual(q.marks.length, 1);
  assert.strictEqual(q.flags.length, 1);
  /* すべての条件を1つずつ外すと空になる */
  const all = [...q.tags, ...q.marks, ...q.flags, ...q.terms, ...q.ranges];
  for (const c of all) text = removeQueryToken(text, c.src);
  assert.strictEqual(text, '');
});

test('語の分解は引用符の中の空白を保つ', () => {
  const toks = splitSearchTokens('tag:"営業 部" -is:image "定例 会議"');
  assert.deepStrictEqual(toks.map(t => t.text), ['tag:営業 部', '-is:image', '定例 会議']);
  assert.deepStrictEqual(toks.map(t => t.quoted), [false, false, true]);
  assert.strictEqual(tokenKey('tag:"営業 部"'), 'tag:営業 部');
});
