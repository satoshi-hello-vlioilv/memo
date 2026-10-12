/* UI/UX 評価用ハーネス：実アプリを開き、現実的なデータを入れて、
   案ごとの CSS/JS を差し込んでキャプチャと計測を行う */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/* 環境に合わせて変えられるよう、場所はすべて環境変数で上書きできる（使い方は README） */
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PW = process.env.UX_PLAYWRIGHT || '/opt/node-tools/node_modules/playwright-core/index.mjs';
const CHROME = process.env.UX_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export const BASE = process.env.UX_BASE || 'http://127.0.0.1:8934/index.html';
const FA_DIR = process.env.UX_FA_DIR || path.join(HERE, '.cache', 'fontawesome', 'package');

const { chromium } = await import(pathToFileURL(PW).href);
export async function launch() {
  return chromium.launch(fs.existsSync(CHROME) ? { executablePath: CHROME } : {});
}

/* CDN のアイコンをローカルの同版へ差し替える（サンドボックスでは CDN が遮断されるため） */
async function routeIcons(page) {
  await page.route('**/cdnjs.cloudflare.com/**', async route => {
    const url = route.request().url();
    const m = /font-awesome\/[\d.]+\/(css|webfonts)\/(.+)$/.exec(url);
    if (!m) return route.abort();
    const f = path.join(FA_DIR, m[1], m[2].split('?')[0]);
    if (!fs.existsSync(f)) return route.abort();
    const ct = f.endsWith('.css') ? 'text/css' : f.endsWith('.woff2') ? 'font/woff2' : 'font/ttf';
    route.fulfill({ status: 200, contentType: ct, body: fs.readFileSync(f) });
  });
}

/* 現実的なデータ：日付・タグ・目印・書式・画像・添付が揃った一覧 */
async function seed(page) {
  await page.evaluate(async () => {
    const day = 86400000, now = Date.now();
    const mkImg = async (w, h, c1, c2, label) => {
      const cv = new OffscreenCanvas(w, h); const g = cv.getContext('2d');
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c1); gr.addColorStop(1, c2);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(255,255,255,.85)'; g.font = 'bold 42px sans-serif'; g.fillText(label, 30, h - 40);
      g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 6; g.strokeRect(20, 20, w - 40, h - 40);
      return cv.convertToBlob({ type: 'image/png' });
    };
    const memos = [
      { t: '週次定例ミーティング 議事録', tags: ['業務', '会議'], mark: 'flag', at: now - 2 * 3600000,
        body: '[h=1]週次定例 10/12[/h]\n出席：佐藤・鈴木・高橋・田中\n[h=2]決定事項[/h]\n[li]新機能のリリースは[b]10/20[/b]に決定[/li]\n[li]QA期間を[color=#c24532]3日[/color]延長する[/li]\n[li]次回は会議室Bで実施[/li]\n[h=2]宿題[/h]\n[task=1]議事録を共有する[/task]\n[task]見積もりを再提出（佐藤）[/task]\n[task]デザインレビューの日程調整（高橋）[/task]\n\n現場写真：\n[img:IMG1:c:fit]\n補足：先方からは[hl=#fff59d]予算上限は据え置き[/hl]との回答。来週までに代替案を2つ用意する。\n詳細は共有フォルダの資料を参照。' },
      { t: '買い物リスト', tags: ['私用'], mark: null, at: now - 5 * 3600000,
        body: '[task=1]牛乳[/task]\n[task]たまねぎ 3個[/task]\n[task]にんじん[/task]\n[task]コーヒー豆（深煎り）[/task]' },
      { t: 'A社 見積もり打ち合わせ', tags: ['業務', '営業'], mark: 'star', at: now - day - 3600000,
        body: '先方：購買部 山田様\n予算感は前回比で 10% 減。\n[li]保守費を年額へ変更する案[/li]\n[li]初期費用の分割払い[/li]\n次回 10/16 14:00 オンライン' },
      { t: '読書メモ「デザインの法則」', tags: ['学習', '読書'], mark: null, at: now - day - 7 * 3600000,
        body: '[h=2]第3章 ヒックの法則[/h]\n選択肢が増えるほど、決定にかかる時間は対数的に増える。\n→ 画面の主要操作は絞り込み、残りは段階的に見せる。\n[h=2]第5章 フィッツの法則[/h]\nターゲットまでの時間は距離と大きさで決まる。' },
      { t: '旅行の持ち物', tags: ['私用', '旅行'], mark: 'hold', at: now - 3 * day,
        body: '[li]パスポート[/li]\n[li]充電器・変換プラグ[/li]\n[li]常備薬[/li]\n[img:IMG2:c:m]' },
      { t: 'アイデア：メモアプリの改善', tags: ['アイデア'], mark: 'pin', at: now - 4 * day,
        body: '検索条件をチップで見せる。\n本文の表示領域を広げる。\nスマホではタブで切り替える。' },
      { t: '月次報告 9月', tags: ['業務', '報告'], mark: 'check', at: now - 9 * day,
        body: '[h=1]9月の実績[/h]\n売上：前年同月比 +8%\n新規顧客：12社\n[h=2]課題[/h]\n[li]問い合わせ対応の遅延[/li]\n[li]在庫の偏り[/li]' },
      { t: '健康診断の結果', tags: ['私用'], mark: 'alert', at: now - 12 * day, body: '再検査：10/30 午前\n前日21時以降は絶食。' },
      { t: 'プレゼン構成案', tags: ['業務', '資料'], mark: null, at: now - 15 * day,
        body: '1. 背景\n2. 課題\n3. 解決策\n4. スケジュール\n5. 費用' },
      { t: '英語フレーズ', tags: ['学習'], mark: null, at: now - 20 * day, body: 'Let me circle back on this.\nCould you walk me through it?' },
      { t: 'レシピ：鶏むね肉の低温調理', tags: ['料理'], mark: null, at: now - 26 * day, body: '63℃ で 1時間。塩 1%、砂糖 1%。' },
      { t: '引っ越しの手続き', tags: ['私用', '手続き'], mark: 'flag', at: now - 40 * day, body: '[task=1]転出届[/task]\n[task]転入届[/task]\n[task]免許証の住所変更[/task]' },
    ];
    const imgs = [
      await mkImg(1200, 800, '#2f7d6d', '#a7d3c4', 'WHITEBOARD'),
      await mkImg(900, 1200, '#3c5a8a', '#d8b47a', 'LUGGAGE'),
      await mkImg(1200, 900, '#8a4b3c', '#e9c9a0', 'SLIDE 03'),
    ];
    for (const m of memos) {
      const id = await Store.add('memos', { title: m.t, tags: m.tags, body: '', createdAt: m.at, updatedAt: m.at,
        mark: m.mark, deletedAt: null, imageCount: 0, fileCount: 0, plainBody: '' });
      let body = m.body, imageCount = 0, fileCount = 0;
      if (body.includes('IMG1')) {
        const a = await Store.add('images', { memoId: id, name: 'whiteboard.png', type: 'image/png', blob: imgs[0], createdAt: m.at });
        const b = await Store.add('images', { memoId: id, name: 'slide03.png', type: 'image/png', blob: imgs[2], createdAt: m.at });
        body = body.replace('IMG1', a); imageCount = 2;
        await Store.add('files', { memoId: id, name: '議事録_1012.pdf', type: 'application/pdf', size: 248000, blob: new Blob(['x']), createdAt: m.at });
        await Store.add('files', { memoId: id, name: '見積もり_v3.xlsx', type: 'application/vnd.ms-excel', size: 61000, blob: new Blob(['x']), createdAt: m.at });
        fileCount = 2;
      }
      if (body.includes('IMG2')) {
        const a = await Store.add('images', { memoId: id, name: 'luggage.png', type: 'image/png', blob: imgs[1], createdAt: m.at });
        body = body.replace('IMG2', a); imageCount = 1;
      }
      await Store.put('memos', { id, title: m.t, tags: m.tags, body, createdAt: m.at, updatedAt: m.at, mark: m.mark,
        deletedAt: null, imageCount, fileCount, plainBody: buildPlainBody(body) });
    }
    for (const t of ['業務', '会議', '私用', '営業', '学習', '読書', '旅行', 'アイデア', '報告', '資料', '料理', '手続き']) {
      await Store.put('tags', { name: t });
    }
    await Store.add('formats', { name: '議事録', content: '[h=1]議事録[/h]\n日時：\n出席：\n[h=2]決定事項[/h]\n[li][/li]', tags: ['会議'], createdAt: now, updatedAt: now });
  });
}

/* ページを開き、データを入れて、最初のメモを開いた状態にする */
export async function openApp(browser, { width = 1440, height = 900, open = true, prefs = null, title = '週次定例ミーティング 議事録' } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => (page._errs ||= []).push(String(e)));
  await routeIcons(page);
  await page.goto(BASE);
  await page.waitForTimeout(500);
  await seed(page);
  if (prefs) await page.evaluate(async p => { for (const [k, v] of Object.entries(p)) await Store.put('prefs', { key: k, value: v }); }, prefs);
  await page.reload();
  await page.waitForTimeout(700);
  if (open) {
    /* 狭い画面では一覧タブから開く（開くと編集画面へ移る） */
    await page.evaluate(t => {
      const el = [...document.querySelectorAll('.memo-item')].find(e => e.textContent.includes(t)) || document.querySelector('.memo-item');
      el && el.click();
    }, title);
    await page.waitForTimeout(700);
  }
  return page;
}

/* 案の差し込み：css は <style>、js は評価して DOM を組み替える */
export async function applyVariant(page, v) {
  if (!v) return;
  if (v.css) await page.addStyleTag({ content: v.css });
  if (v.js) await page.evaluate(v.js);
  await page.waitForTimeout(250);
}

/* 計測：主たる表示領域・付帯 UI の量・タップ領域・はみ出し */
export async function measure(page) {
  return page.evaluate(() => {
    const vis = el => { if (!el) return false; const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth; };
    const rect = el => el ? el.getBoundingClientRect() : null;
    const body = document.getElementById('bodyInput');
    const wrap = document.querySelector('.body-wrap') || body;
    const br = rect(wrap);
    const bodyVisH = br ? Math.max(0, Math.min(br.bottom, innerHeight) - Math.max(br.top, 0)) : 0;
    const bodyVisW = br ? Math.max(0, Math.min(br.right, innerWidth) - Math.max(br.left, 0)) : 0;
    const list = document.getElementById('memoList');
    const lr = rect(list);
    const items = [...document.querySelectorAll('.memo-item')].filter(vis);
    const ctrls = [...document.querySelectorAll('button, select, input, [role=button]')].filter(vis)
      .filter(el => !body || !body.contains(el));
    const small = ctrls.filter(el => { const r = el.getBoundingClientRect(); return Math.min(r.width, r.height) < 24; });
    return {
      vw: innerWidth, vh: innerHeight,
      bodyTop: br ? Math.round(br.top) : null,
      bodyAreaPct: Math.round(bodyVisH * bodyVisW / (innerWidth * innerHeight) * 100),
      bodyVisH: Math.round(bodyVisH), bodyVisW: Math.round(bodyVisW),
      listTop: lr ? Math.round(lr.top) : null,
      listItemsVisible: items.filter(el => el.getBoundingClientRect().bottom <= innerHeight).length,
      controlsVisible: ctrls.length,
      smallTargets: small.length,
      hOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  });
}

export async function shot(page, file, opts = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, ...opts });
}
