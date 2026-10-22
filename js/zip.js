/* ============================================================
   zip.js
   ZIP ファイルの読み取り（取り込み用）
   ------------------------------------------------------------
   書き出した JSON を ZIP に圧縮して保存・受け渡しすると、これまでは
   取り込めなかった（JSON 以外は受け付けていなかった）。依存ライブラリを
   増やさない方針なので、ZIP の目録（セントラルディレクトリ）を自前で読み、
   圧縮の展開はブラウザ標準の DecompressionStream('deflate-raw') に任せる。
   対応：無圧縮（0）と Deflate（8）。暗号化 ZIP と ZIP64 は非対応。
   DOM に触れないので tests/ からそのまま検証できる。
   ============================================================ */
'use strict';

const ZIP_SIG_LOCAL = 0x04034b50;
const ZIP_SIG_CENTRAL = 0x02014b50;
const ZIP_SIG_END = 0x06054b50;

/* 先頭4バイトで ZIP かどうかを判定する（拡張子が付いていない場合もあるため） */
function isZipBytes(bytes) {
  return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/* ファイル名の文字コード。UTF-8 フラグ（bit 11）が無い ZIP は、Windows の
   「送る → 圧縮フォルダー」などで作られたもので日本語名が Shift_JIS になっている */
function decodeZipName(bytes, utf8) {
  if (utf8) return new TextDecoder('utf-8').decode(bytes);
  try { return new TextDecoder('shift_jis', { fatal: true }).decode(bytes); }
  catch { return new TextDecoder('utf-8').decode(bytes); }
}

/* 目録を読み、各ファイルの名前と取り出し方を返す（中身はまだ展開しない） */
function listZipEntries(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  /* 終端レコードは末尾にあり、後ろにコメント（最大 65535 バイト）が付くことがある */
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === ZIP_SIG_END) { end = i; break; }
  }
  if (end < 0) throw new Error('ZIP の目録が見つかりません（ファイルが壊れているか、ZIP ではありません）');
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  if (p === 0xffffffff || count === 0xffff) throw new Error('ZIP64 形式には対応していません');
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(p, true) !== ZIP_SIG_CENTRAL) throw new Error('ZIP の目録が壊れています');
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localOffset = view.getUint32(p + 42, true);
    const name = decodeZipName(bytes.subarray(p + 46, p + 46 + nameLen), (flags & 0x800) !== 0);
    entries.push({ name, method, compSize, size, localOffset, encrypted: (flags & 1) !== 0, dir: name.endsWith('/') });
    p += 46 + nameLen + extraLen + commentLen;
  }
  /* 中身の位置はローカルヘッダーの長さで決まる（目録側の extra とは長さが違うことがある） */
  for (const e of entries) {
    if (view.getUint32(e.localOffset, true) !== ZIP_SIG_LOCAL) throw new Error(`ZIP の「${e.name}」が壊れています`);
    const nl = view.getUint16(e.localOffset + 26, true);
    const el = view.getUint16(e.localOffset + 28, true);
    e.dataOffset = e.localOffset + 30 + nl + el;
  }
  return { bytes, entries };
}

/* 1つのファイルを展開してバイト列で返す */
async function readZipEntry(zip, entry) {
  if (entry.encrypted) throw new Error(`「${entry.name}」はパスワード付きのため展開できません`);
  const raw = zip.bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compSize);
  if (entry.method === 0) return raw.slice();
  if (entry.method !== 8) throw new Error(`「${entry.name}」の圧縮方式（${entry.method}）には対応していません`);
  if (typeof DecompressionStream !== 'function') throw new Error('このブラウザは ZIP の展開に対応していません');
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* macOS が付け足す管理用のファイル（__MACOSX/、._名前、.DS_Store）は中身として扱わない */
const isZipJunk = name => /(^|\/)__MACOSX\//.test(name) || /(^|\/)\._/.test(name) || /(^|\/)\.DS_Store$/.test(name);

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = { isZipBytes, listZipEntries, readZipEntry, isZipJunk, decodeZipName };
}
