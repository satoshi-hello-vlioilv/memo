/* テストから js/ の関数を読み込むための土台。
   アプリのスクリプトはビルドせずに <script> で読み込む素の JavaScript なので、
   各ファイル末尾の module.exports（ブラウザでは無視される）を使って取り込み、
   ファイルをまたいで参照しているものは globalThis へ載せてから次を読む。 */
'use strict';
const path = require('node:path');

const load = name => require(path.join(__dirname, '..', 'js', name));

const core = load('core.js');
Object.assign(globalThis, core);

const search = load('search.js');
Object.assign(globalThis, search);

const filterbar = load('filterbar.js');
Object.assign(globalThis, filterbar);

const bodyParse = load('body-parse.js');
Object.assign(globalThis, bodyParse);

const list = load('list.js');
const data = load('data.js');
const files = load('files.js');
const body = load('body.js');

module.exports = { core, search, filterbar, bodyParse, list, data, files, body };
