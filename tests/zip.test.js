/* ZIP に圧縮したデータの取り込み（zip.js）のテスト。
   fixtures の ZIP は Python の zipfile で作ったもの（Deflate・無圧縮・Shift_JIS の名前・macOS の管理ファイル入り） */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { zip } = require('./helpers.js');

const fx = name => new Uint8Array(fs.readFileSync(path.join(__dirname, 'fixtures', name)));
const jsonEntries = z => z.entries.filter(e => !e.dir && !zip.isZipJunk(e.name) && /\.json$/i.test(e.name));

test('先頭のバイトで ZIP を見分ける', () => {
  assert.ok(zip.isZipBytes(fx('backup-deflate.zip')));
  assert.ok(!zip.isZipBytes(new TextEncoder().encode('{"memos":[]}')));
});

test('Deflate で圧縮された JSON を取り出せる（フォルダと macOS の管理ファイルは除く）', async () => {
  const z = zip.listZipEntries(fx('backup-deflate.zip'));
  const js = jsonEntries(z);
  assert.strictEqual(js.length, 1);
  assert.strictEqual(js[0].name, 'MemoStudio_Backup_20261022/MemoStudio_Backup_20261022.json');
  const data = JSON.parse(new TextDecoder().decode(await zip.readZipEntry(z, js[0])));
  assert.strictEqual(data.memos[0].title, 'ZIPのメモ');
});

test('無圧縮の ZIP からも取り出せる', async () => {
  const z = zip.listZipEntries(fx('backup-stored.zip'));
  const text = new TextDecoder().decode(await zip.readZipEntry(z, jsonEntries(z)[0]));
  assert.strictEqual(JSON.parse(text.replace(/^﻿/, '')).memos.length, 1);
});

test('Windows で作った ZIP の日本語のファイル名（Shift_JIS）を読める', async () => {
  const z = zip.listZipEntries(fx('backup-sjis.zip'));
  assert.strictEqual(z.entries[0].name, 'バックアップ.json');
  const data = JSON.parse(new TextDecoder().decode(await zip.readZipEntry(z, z.entries[0])));
  assert.strictEqual(data.tags[0], '業務');
});

test('JSON の入っていない ZIP は中身を一覧できる（呼び出し側で案内を出す）', () => {
  const z = zip.listZipEntries(fx('no-json.zip'));
  assert.deepStrictEqual(z.entries.map(e => e.name).sort(), ['photo.png', 'readme.txt']);
  assert.strictEqual(jsonEntries(z).length, 0);
});

test('壊れたデータは分かる言葉でエラーにする', () => {
  assert.throws(() => zip.listZipEntries(new Uint8Array([0x50, 0x4b, 3, 4, 1, 2, 3])), /目録が見つかりません/);
});
