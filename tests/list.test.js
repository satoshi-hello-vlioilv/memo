/* 一覧の表示（抜粋・ハイライト・検索欄の語の差し替え）のテスト */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { list } = require('./helpers.js');
const { highlightTermsHtml, makeSnippet, lastQueryToken, replaceLastToken, dateKeyTs } = list;

test('検索語をハイライトしつつ HTML はエスケープする', () => {
  assert.equal(highlightTermsHtml('会議のメモ', ['会議']), '<mark>会議</mark>のメモ');
  assert.equal(highlightTermsHtml('<script>', []), '&lt;script&gt;');
  assert.equal(highlightTermsHtml('a<b>c', ['<b>']), 'a<mark>&lt;b&gt;</mark>c');
});

test('複数の語を同時にハイライトする', () => {
  assert.equal(highlightTermsHtml('赤と青', ['赤', '青']), '<mark>赤</mark>と<mark>青</mark>');
});

test('重なった語は1つにまとめてハイライトする', () => {
  assert.equal(highlightTermsHtml('abcd', ['abc', 'bcd']), '<mark>abcd</mark>');
});

test('大文字小文字を区別せずにハイライトする', () => {
  assert.equal(highlightTermsHtml('Memo Studio', ['memo']), '<mark>Memo</mark> Studio');
});

test('抜粋はヒット位置の前後を切り出す', () => {
  const text = 'あ'.repeat(60) + 'キーワード' + 'い'.repeat(60);
  const out = makeSnippet(text, ['キーワード']);
  assert.ok(out.startsWith('…'), '前が省略されている');
  assert.ok(out.endsWith('…'), '後ろが省略されている');
  assert.ok(out.includes('<mark>キーワード</mark>'));
});

test('ヒットが無ければ先頭から切り出す', () => {
  const out = makeSnippet('先頭から始まる本文', ['見つからない語']);
  assert.equal(out, '先頭から始まる本文');
});

test('本文が空なら抜粋も空', () => {
  assert.equal(makeSnippet('', ['語']), '');
});

test('検索欄の最後の語だけを差し替える', () => {
  assert.equal(lastQueryToken('定例 tag:業'), 'tag:業');
  assert.equal(lastQueryToken('定例 '), '');
  assert.equal(replaceLastToken('定例 tag:業', 'tag:業務'), '定例 tag:業務');
  assert.equal(replaceLastToken('', 'tag:業務'), 'tag:業務');
});

test('日付グループの見出しから並び順用の時刻を求める', () => {
  assert.equal(dateKeyTs('2026/09/18'), new Date(2026, 8, 18).getTime());
  assert.ok(dateKeyTs('2026/09/18') > dateKeyTs('2026/09/17'));
});
