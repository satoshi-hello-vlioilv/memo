/* 本文の保存形式（[b] や [img:1:c:fit]、段落書式）の解釈・組み立てのテスト。
   ここが壊れると保存した本文が化ける・消えるため、往復（text → 木 → text）を
   중心に確認する。 */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
require('./helpers.js');

const roundTrip = text => tokensToText(tokenizeBody(text));

test('書式のない本文はそのまま往復する', () => {
  assert.equal(roundTrip('ふつうの本文\n2行目'), 'ふつうの本文\n2行目');
});

test('入れ子の書式を保ったまま往復する', () => {
  const src = '[b][color=#ff0000]太字の赤文字[/color][/b]のつづき';
  assert.equal(roundTrip(src), src);
});

test('画像マーカーを位置・サイズごと解釈する', () => {
  const nodes = tokenizeBody('前[img:12:l:240]後');
  assert.deepEqual(nodes.map(n => n.type), ['text', 'img', 'text']);
  assert.deepEqual(
    { id: nodes[1].id, align: nodes[1].align, size: nodes[1].size },
    { id: 12, align: 'l', size: '240' });
  assert.equal(roundTrip('前[img:12:l:240]後'), '前[img:12:l:240]後');
});

test('位置・サイズを省略した画像マーカーは既定値で補う', () => {
  assert.equal(roundTrip('[img:3]'), '[img:3:c:fit]');
});

test('閉じタグの無い開始タグは書式にせず文字のまま残す', () => {
  /* 「[b]」と文字通り入力しただけで以降が全部太字になったり、
     パーサーが無限ループに陥ったりしないこと */
  const nodes = tokenizeBody('メモに[b]と書いた');
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].type, 'text');
  assert.equal(roundTrip('メモに[b]と書いた'), 'メモに[b]と書いた');
});

test('対応する開始タグの無い閉じタグも文字のまま残す', () => {
  assert.equal(roundTrip('おわり[/b]です'), 'おわり[/b]です');
});

test('閉じタグが無いタグが大量に並んでも終わる', () => {
  const src = '[b]'.repeat(500) + 'テキスト';
  assert.equal(roundTrip(src), src);
});

test('リンクは URL を保ったまま往復する', () => {
  const src = '[link=https://example.com/a]例[/link]';
  assert.equal(roundTrip(src), src);
});

test('段落書式の行を解釈できる', () => {
  assert.deepEqual(parseBlockLine('[h=2]見出し[/h]'), { kind: 'h2', inner: '見出し', done: false });
  assert.deepEqual(parseBlockLine('[li]項目[/li]'), { kind: 'li', inner: '項目', done: false });
  assert.deepEqual(parseBlockLine('[task]やること[/task]'), { kind: 'task', inner: 'やること', done: false });
  assert.deepEqual(parseBlockLine('[task=1]おわり[/task]'), { kind: 'task', inner: 'おわり', done: true });
  assert.deepEqual(parseBlockLine('ただの行'), { kind: null, inner: 'ただの行', done: false });
});

test('段落書式の行も往復する（中の書式を保つ）', () => {
  const src = '[task=1][b]完了[/b]した作業[/task]';
  assert.equal(roundTrip(src), src);
  assert.equal(parseBlockLine(src).inner, '[b]完了[/b]した作業');
});

test('選んだ行にだけ段落書式が付く', () => {
  const lines = ['一行目', '二行目', '三行目'];
  assert.deepEqual(applyBlockToLines(lines, 1, 2, 'li'),
    ['一行目', '[li]二行目[/li]', '[li]三行目[/li]']);
});

test('同じ段落書式をもう一度適用すると解除される', () => {
  const lines = ['[li]項目[/li]'];
  assert.deepEqual(applyBlockToLines(lines, 0, 0, 'li'), ['項目']);
});

test('別の段落書式へ切り替えられる（二重にはならない）', () => {
  assert.deepEqual(applyBlockToLines(['[li]項目[/li]'], 0, 0, 'h2'), ['[h=2]項目[/h]']);
});

test('「本文」を選ぶと段落書式が外れる', () => {
  assert.deepEqual(applyBlockToLines(['[h=1]見出し[/h]'], 0, 0, 'p'), ['見出し']);
});

test('空行は段落書式の対象にしない', () => {
  assert.deepEqual(applyBlockToLines(['項目', '', '項目2'], 0, 2, 'li'),
    ['[li]項目[/li]', '', '[li]項目2[/li]']);
});

test('チェックの状態は段落書式を切り替えても保たれる', () => {
  /* [task=1] の行をいったん解除して付け直しても完了状態が残ること */
  const off = applyBlockToLines(['[task=1]やった[/task]'], 0, 0, 'task');
  assert.deepEqual(off, ['やった']);
});

test('行の開始位置と行番号を求められる', () => {
  const lines = ['abc', 'de', 'f'];
  assert.deepEqual(lineStartOffsets(lines), [0, 4, 7]);
  assert.equal(offsetToLineIndex(lines, 0), 0);
  assert.equal(offsetToLineIndex(lines, 3), 0);
  assert.equal(offsetToLineIndex(lines, 4), 1);
  assert.equal(offsetToLineIndex(lines, 7), 2);
});

test('画像 ID を新しい ID へ振り替える（インポート用）', () => {
  const map = new Map([[1, 10], [2, 20]]);
  assert.equal(remapBodyImageIds('[img:1:c:fit]と[img:2:l:s]', map), '[img:10:c:fit]と[img:20:l:s]');
  /* 対応が無い画像はそのまま残す（勝手に他の画像へ差し替えない） */
  assert.equal(remapBodyImageIds('[img:9]', map), '[img:9]');
});

test('コピー用のテキストでは段落書式が記号になる', () => {
  const src = '[h=2]見出し[/h]\n[li]項目[/li]\n[task=1]済[/task]\n[task]未[/task]\n[b]太字[/b][img:1:c:fit]';
  assert.equal(bodyToDisplayText(src), '見出し\n・項目\n☑ 済\n☐ 未\n太字');
});
