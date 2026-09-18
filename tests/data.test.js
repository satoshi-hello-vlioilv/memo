/* 取り込み（形式の判別・Minutes Memo Pro の変換・重複判定）のテスト */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { data } = require('./helpers.js');
const { detectImportFormat, convertMppSession, memoIdentity, groupByMemoId } = data;

test('Memo Studio のバックアップを見分ける', () => {
  assert.equal(detectImportFormat({ memos: [], formats: [], tags: [] }), 'memostudio');
  assert.equal(detectImportFormat({ app: 'MemoStudio', schema: 2, memos: [{ id: 1 }] }), 'memostudio');
});

test('Minutes Memo Pro の全データ・単一会議を見分ける', () => {
  assert.equal(detectImportFormat({ sessions: [], masters: {} }), 'minutespro-all');
  assert.equal(detectImportFormat({ id: 'abc', date: '2026-09-18', memos: [] }), 'minutespro-session');
  assert.equal(detectImportFormat({ id: 'abc', date: '2026-09-18', memos: [], tags: [{ name: '定例' }] }),
    'minutespro-session');
});

test('対応していない形式は unknown', () => {
  assert.equal(detectImportFormat(null), 'unknown');
  assert.equal(detectImportFormat('文字列'), 'unknown');
  assert.equal(detectImportFormat({ foo: 1 }), 'unknown');
});

test('会議を1件のメモへ変換する（時系列・フラグ・画像）', () => {
  const session = {
    id: 's1', date: '2026-09-18',
    tags: [{ name: '定例' }, { name: '営業部' }],
    memos: [
      /* Minutes Memo Pro は新しい順に持っているため、変換で古い順へ直す */
      { datetime: '10:10', title: '二番目', items: [{ type: 'text', value: '本文2' }] },
      { datetime: '10:00', title: '一番目', flagId: 'f1',
        items: [{ type: 'text', value: '本文1' }, { type: 'image', value: 'data:image/png;base64,AAAA' }] },
    ],
  };
  const memo = convertMppSession(session, [{ id: 'f1', name: 'TODO' }]);
  assert.equal(memo.title, '定例 / 営業部');
  assert.deepEqual(memo.tags, ['定例', '営業部']);
  assert.equal(memo.createdAt, new Date('2026-09-18T00:00:00').getTime());
  assert.equal(memo.imageCount, 1);
  assert.equal(memo._imgs[0].dataURL, 'data:image/png;base64,AAAA');
  const lines = memo.body.split('\n');
  assert.equal(lines[0], '[10:00] 【TODO】 一番目');
  assert.equal(lines[1], '本文1');
  assert.equal(lines[2], '[画像 1]');
  assert.ok(memo.body.includes('[10:10] 二番目'));
});

test('タグが無い会議は日付をタイトルにする', () => {
  const memo = convertMppSession({ id: 's', date: '2026-01-05', memos: [] }, []);
  assert.equal(memo.title, '2026-01-05');
});

test('同じメモの見分けは作成日時とタイトルで行う（id は見ない）', () => {
  const a = { id: 1, createdAt: 1000, title: '打ち合わせ' };
  const b = { id: 99, createdAt: 1000, title: '打ち合わせ' };
  const c = { id: 1, createdAt: 1001, title: '打ち合わせ' };
  assert.equal(memoIdentity(a), memoIdentity(b));
  assert.notEqual(memoIdentity(a), memoIdentity(c));
});

test('画像・添付をメモごとにまとめる', () => {
  const map = groupByMemoId([{ memoId: 1, id: 'a' }, { memoId: 2, id: 'b' }, { memoId: 1, id: 'c' }]);
  assert.deepEqual(map.get(1).map(r => r.id), ['a', 'c']);
  assert.deepEqual(map.get(2).map(r => r.id), ['b']);
  assert.equal(map.get(3), undefined);
  assert.equal(groupByMemoId(undefined).size, 0);
});
