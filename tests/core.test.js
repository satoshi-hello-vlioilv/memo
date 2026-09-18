/* 共通処理（タグの解釈・エスケープ・直列化）と、本文まわりの小さな純粋関数のテスト */
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { core, files, body } = require('./helpers.js');

test('タグはカンマ・読点・空白で区切り、重複を取り除く', () => {
  assert.deepEqual(core.parseTags('業務, 議事録 定例'), ['業務', '議事録', '定例']);
  assert.deepEqual(core.parseTags('業務、業務'), ['業務']);
  assert.deepEqual(core.parseTags('   '), []);
});

test('HTML として危険な文字をエスケープする', () => {
  assert.equal(core.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(core.esc(null), '');
});

test('同じタグには常に同じ色クラスが割り当たる', () => {
  assert.equal(core.tagClass('業務'), core.tagClass('業務'));
  assert.match(core.tagClass('業務'), /^c[0-5]$/);
});

test('直列化した関数は前の実行が終わるまで次を始めない', async () => {
  /* 保存ボタンの連打で新規メモが二重に作られた不具合の再発防止 */
  const order = [];
  let running = 0;
  const fn = core.serialized(async tag => {
    assert.equal(running, 0, '同時に実行されていない');
    running++;
    await new Promise(r => setTimeout(r, 10));
    order.push(tag);
    running--;
  });
  await Promise.all([fn('a'), fn('b'), fn('c')]);
  assert.deepEqual(order, ['a', 'b', 'c']);
});

test('ファイルサイズを読みやすい単位にする', () => {
  assert.equal(files.formatBytes(512), '512 B');
  assert.equal(files.formatBytes(2048), '2.0 KB');
  assert.equal(files.formatBytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(files.formatBytes(undefined), '0 B');
});

test('拡張子と種別からアイコンを選ぶ', () => {
  assert.equal(files.fileIconFor('報告.pdf', ''), 'fa-file-pdf');
  assert.equal(files.fileIconFor('表.xlsx', ''), 'fa-file-excel');
  assert.equal(files.fileIconFor('写真.png', 'image/png'), 'fa-file-image');
  assert.equal(files.fileIconFor('なぞ.qqq', ''), 'fa-file');
});

test('リンクの URL は安全な形に整える', () => {
  assert.equal(body.safeLinkUrl('example.com/a'), 'https://example.com/a');
  assert.equal(body.safeLinkUrl('https://example.com'), 'https://example.com');
  assert.equal(body.safeLinkUrl('user@example.com'), 'mailto:user@example.com');
  /* スクリプトを実行するスキームは受け付けない */
  assert.equal(body.safeLinkUrl('javascript:alert(1)'), null);
  assert.equal(body.safeLinkUrl('data:text/html,<script>'), null);
  assert.equal(body.safeLinkUrl('  '), null);
});

test('rgb() 表記を #rrggbb へ直す', () => {
  assert.equal(body.rgbToHex('rgb(255, 0, 0)'), '#ff0000');
  assert.equal(body.rgbToHex('rgba(0, 16, 255, 0.5)'), '#0010ff');
  assert.equal(body.rgbToHex(''), null);
});

test('貼り付けたフォント指定を、選べるフォントへ寄せる', () => {
  assert.equal(body.fontIdFromCss('"Yu Mincho", serif'), 'mincho');
  assert.equal(body.fontIdFromCss('Consolas, monospace'), 'mono');
  assert.equal(body.fontIdFromCss('Georgia, "Times New Roman"'), 'serif');
  assert.equal(body.fontIdFromCss('Arial, Helvetica, sans-serif'), 'sans');
  assert.equal(body.fontIdFromCss(''), null);
});

test('保存データに書き出すのはフォントの識別子だけ', () => {
  /* 生の CSS を保存形式へ入れないこと（環境差で表示が崩れないように） */
  for (const f of body.BODY_FONTS) {
    assert.match(f.id, /^[a-z]+$/);
    assert.equal(body.fontById(f.id).css, f.css);
  }
  assert.equal(body.fontById('不明'), null);
});
