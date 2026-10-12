# UI/UX 評価ハーネス

`CLAUDE.md` の「UI / UX 改修の決定手順」で使う道具。実アプリに現実的なデータを入れ、
案ごとの CSS / JS を差し込んで画面をキャプチャし、表示面積などを計測する。

## 準備（初回のみ）

```sh
# 1. 確認用のサーバーを起動（リポジトリのルートを公開。既定のポートは 8934）
node tools/uiux/serve.cjs &

# 2. アイコン（Font Awesome）を手元に用意する。サンドボックスでは CDN が遮断されるため、
#    同じ版をローカルから配信してキャプチャにアイコンが写るようにする
mkdir -p tools/uiux/.cache/fontawesome && cd tools/uiux/.cache/fontawesome \
  && npm pack @fortawesome/fontawesome-free@6.5.1 && tar xzf fortawesome-fontawesome-free-6.5.1.tgz && cd -
```

`out/` と `.cache/` は `.gitignore` 済み。

## 使い方

```sh
# 案をキャプチャ・計測する（out/<項目>/<回>/ に 3 幅を並べた比較画像と metrics.json が出る）
node tools/uiux/run.mjs tools/uiux/items/A.mjs r1          # 1回目の7案すべて
node tools/uiux/run.mjs tools/uiux/items/A.mjs r2 A8 A9    # 2回目の組合せ案だけ

# 既存機能の通し確認（UI を変えたら必ず実行する）
node tools/uiux/regression.mjs
```

## ファイル

| ファイル | 役割 |
| --- | --- |
| `lib.mjs` | ブラウザ起動、アイコンの差し替え、評価用データの投入、案の差し込み、計測 |
| `run.mjs` | 項目ファイルの案を順にキャプチャし、比較画像と計測値を書き出す |
| `regression.mjs` | 初回起動・検索/絞り込み・書式・目印/タグ・画像/添付・管理・書き出し・ゴミ箱・複数選択・下書き・10 種の画面幅を通しで確認 |
| `serve.cjs` | 確認用の静的サーバー |
| `items/A.mjs`〜`G.mjs`・`H.mjs`・`S.mjs` | 2026-10 の見直し（A〜G）と v1.8.1 の不具合修正（H・S）で評価した各項目の案（その時点の画面に差し込む前提の試作。記録として残している） |

### 項目ファイルの書き方

```js
export default {
  key: 'X',                       // 出力フォルダ名
  shots: [{ w: 1440, h: 900, key: '1440' }, { w: 390, h: 844, key: '390' }],
  before: async (page, { shot }) => {},  // 案を差し込む前の状態づくり（任意。例：ゴミ箱に1件入れる）
  scene: async (page, { shot }) => {},   // 案を差し込んだ後、撮影前に全案共通で行う操作（任意）
  rounds: {
    r1: [{ id: 'X1', name: '案の名前', css: '...', js: '(() => { ... })()', scene: async page => {} }],
  },
};
```

## 計測値（`measure()`）

| 値 | 意味 |
| --- | --- |
| `bodyVisW × bodyVisH`・`bodyAreaPct` | 本文の実際に見えている大きさと、画面に占める割合 |
| `bodyTop` | 本文の始まる位置（小さいほど上の付帯情報が少ない） |
| `listTop`・`listItemsVisible` | 一覧の始まる位置と、画面内に収まる件数 |
| `controlsVisible`・`smallTargets` | 見えている操作対象の数と、そのうち 24px 未満の小さいもの |
| `hOverflow` | 横にはみ出して画面全体が横スクロールするか |

## 環境変数

| 変数 | 既定値 |
| --- | --- |
| `UX_BASE` | `http://127.0.0.1:8934/index.html` |
| `UX_PLAYWRIGHT` | `/opt/node-tools/node_modules/playwright-core/index.mjs` |
| `UX_CHROME` | `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`（無ければ Playwright の既定） |
| `UX_FA_DIR` | `tools/uiux/.cache/fontawesome/package` |
| `UX_FONT` | 比較画像の見出しに使う日本語フォント |
