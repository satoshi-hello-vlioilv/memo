/* v1.8.0 の通し確認：UI 見直し後も既存の機能がすべて動くか */
import { launch, openApp, measure, BASE } from './lib.mjs';
const b = await launch(); let pass = 0, fail = 0;
const ck = (n, c, x = '') => { c ? pass++ : fail++; console.log(`${c ? 'PASS' : 'FAIL'} — ${n}${x ? '  [' + x + ']' : ''}`); };
const sel = (p, needle, len) => p.evaluate(([needle, len]) => {
  const el = document.getElementById('bodyInput'); const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) if (n.textContent.includes(needle)) break;
  const i = n.textContent.indexOf(needle); const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + len);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); el.focus();
}, [needle, len]);

/* ---------- 0. まっさらな状態（データなし） ---------- */
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
  /* 外部への通信をすべて止めても、同梱のアイコンが読み込まれること（不具合6） */
  await p.route('**/*', r => /^(http:\/\/127\.0\.0\.1|data:|blob:)/.test(r.request().url()) ? r.continue() : r.abort());
  await p.goto(BASE); await p.waitForTimeout(700);
  ck('初回：ようこそ画面', await p.locator('#welcome').isVisible());
  ck('初回：一覧は空の案内', await p.locator('#listEmpty').isVisible());
  ck('初回：絞り込みバーは出ない', !(await p.locator('#filterBar').isVisible()));
  await p.locator('#btnWelcomeNew').click(); await p.waitForTimeout(400);
  ck('ようこそ→新規メモ', await p.locator('#sheet').isVisible());
  ck('新規：帯は出ず追加ボタン', await p.locator('#btnAddMedia').isVisible() && await p.locator('#mediaStrip').isHidden());
  ck('新規：保存ボタンは強調', await p.locator('#btnSave').evaluate(e => e.classList.contains('fresh')));
  await p.locator('#titleInput').fill('はじめてのメモ');
  await p.locator('#tagEntry').fill('テスト'); await p.keyboard.press('Enter');
  await p.locator('#bodyInput').click(); await p.keyboard.type('一行目');
  await p.keyboard.press('Control+s'); await p.waitForTimeout(600);
  ck('保存できる', (await p.locator('.memo-item').count()) === 1);
  ck('保存後は「保存済み」', (await p.locator('#btnSave').innerText()).includes('保存済み'));
  await p.reload(); await p.waitForTimeout(800);
  await p.locator('.memo-item').first().click(); await p.waitForTimeout(500);
  ck('再読込後も本文とタグ', (await p.locator('#bodyInput').innerText()).includes('一行目') && (await p.locator('#tagsInput').inputValue()) === 'テスト');
  ck('外部通信なしでもアイコンが読み込まれる', await p.evaluate(async () => { await document.fonts.ready;
    return ['900', '400'].every(w => [...document.fonts].some(f => f.family.includes('Font Awesome') && f.weight === w && f.status === 'loaded')); }));
  ck('外部通信なしでも JS エラーなし', errs.length === 0, errs.join('|'));
  await ctx.close();
}

/* ---------- 1. データのある状態（PC） ---------- */
const p = await openApp(b, { width: 1440, height: 900 });
const q = () => p.locator('#searchInput').inputValue();
const titles = () => p.locator('.mi-title').allTextContents();

// 検索・絞り込み（B-1 の連動も含む）
await p.locator('#searchInput').fill('会議'); await p.locator('#searchInput').blur(); await p.waitForTimeout(400);
ck('検索できる', (await titles()).some(t => t.includes('週次定例')), (await titles()).join('/'));
ck('検索語が条件チップに', (await p.locator('.cond-chip').count()) === 1);
await p.locator('#condClearAll').click(); await p.waitForTimeout(300);
await p.locator('#searchInput').fill('tag:業務'); await p.locator('#searchInput').blur(); await p.waitForTimeout(400);
await p.locator('#btnFilter').click(); await p.waitForTimeout(200);
ck('tag: と打つとパネルのタグが選択表示', await p.locator('#tagBar .chip', { hasText: '業務' }).first().evaluate(e => e.classList.contains('active')));
await p.locator('#tagBar .chip', { hasText: '業務' }).first().click(); await p.waitForTimeout(300);
ck('もう一度押すと外れる', (await q()) === '', await q());
await p.locator('#markBar .mark-chip').first().click(); await p.waitForTimeout(300);
ck('目印チップ→mark:', (await q()).startsWith('mark:'), await q());
await p.keyboard.press('Escape'); await p.locator('#condClearAll').click(); await p.waitForTimeout(300);
ck('除外・引用符', await p.evaluate(() => parseSearchQuery('-tag:"営業 部"').tags[0].negate === true));

// 並び替え・日付でまとめる
await p.locator('#sortKeySelect').selectOption('title'); await p.waitForTimeout(300);
const tt = (await titles()).filter(t => t !== '無題のメモ');
const pinned = await p.evaluate(() => state.memos.filter(m => m.mark === 'pin' && !m.deletedAt).length);
const rest = tt.slice(pinned);
ck('タイトル順（ピン留めの後ろが50音順）', rest.join() === [...rest].sort((a, b) => a.localeCompare(b, 'ja')).join() || rest.join() === [...rest].sort((a, b) => b.localeCompare(a, 'ja')).join(), rest.slice(0, 3).join('/'));
await p.locator('#sortKeySelect').selectOption('updatedAt'); await p.waitForTimeout(200);
await p.locator('#btnListMore').click(); await p.locator('#btnGroupByDate').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ck('日付でまとめる', (await p.locator('.date-group-header').count()) > 3);
ck('折りたたみ中も選択中のメモが見える', (await p.locator('.memo-item.active').count()) === 1);
await p.locator('#btnListMore').click(); await p.locator('#btnGroupByDate').click(); await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// 書式（可逆性）
await sel(p, '出席', 2);
await p.locator('#btnBold').click(); await p.waitForTimeout(200);
ck('太字', await p.evaluate(() => [...document.querySelectorAll('#bodyInput b')].some(b => b.textContent.includes('出席'))));
await sel(p, '出席', 2); await p.locator('#btnBold').click(); await p.waitForTimeout(200);
ck('太字を戻せる', !(await p.evaluate(() => [...document.querySelectorAll('#bodyInput b')].some(b => b.textContent.includes('出席')))));
await sel(p, '出席', 2); await p.locator('#fontSizeSelect').selectOption('24'); await p.waitForTimeout(200);
await sel(p, '出席', 2); await p.locator('#btnClearFormat').click(); await p.waitForTimeout(200);
ck('既定に戻す', !(await p.evaluate(() => !!document.querySelector('#bodyInput [style*="font-size"]'))));
ck('保存ボタンが強調に変わる', await p.locator('#btnSave').evaluate(e => e.classList.contains('dirty')));
await sel(p, '出席', 2); await p.locator('#btnBold').click(); await p.waitForTimeout(200);
const hasB = () => p.evaluate(() => [...document.querySelectorAll('#bodyInput b')].some(b => b.textContent.includes('出席')));
const b1 = await hasB();
await p.locator('#bodyInput').focus(); await p.keyboard.press('Control+z'); await p.waitForTimeout(300);
ck('元に戻す（Ctrl+Z）で太字が取り消される', b1 && !(await hasB()), `${b1} → ${await hasB()}`);
await p.locator('#btnSave').click(); await p.waitForTimeout(500);

// 段落書式
await p.locator('#bodyInput').click({ position: { x: 40, y: 20 } });
await p.locator('#blockSelect').selectOption('h2'); await p.waitForTimeout(200);
ck('段落書式を変えられる', await p.evaluate(() => !!document.querySelector('#bodyInput [data-fmt="h"][data-level="2"]')), await p.evaluate(() => serializeBody().slice(0, 40)));

// 右クリックメニュー
await sel(p, '出席', 2);
await p.locator('#bodyInput').click({ button: 'right', position: { x: 60, y: 60 } }); await p.waitForTimeout(300);
ck('右クリックメニュー', await p.locator('#ctxMenu').isVisible());
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

// メモ内検索
await p.locator('#bodyInput').click(); await p.keyboard.press('Control+f'); await p.waitForTimeout(300);
ck('Ctrl+F でメモ内検索', await p.locator('#findBar').isVisible());
await p.locator('#findInput').fill('延長'); await p.waitForTimeout(300);
ck('件数が出る', (await p.locator('#findCount').innerText()).includes('1'), await p.locator('#findCount').innerText());
await p.keyboard.press('Escape'); await p.waitForTimeout(200);

// ツールバーの「…」
await p.locator('#btnToolMore').click(); await p.waitForTimeout(200);
ck('「…」にフォント・ハイライト・フォーマット', await p.locator('#fontFamilySelect').isVisible() && await p.locator('#formatSelect').isVisible());
await p.locator('#btnShowMarks').click(); await p.waitForTimeout(200);
ck('改行マークの切替でメニューが閉じる', await p.locator('#toolMore').isHidden());

// 目印・タグ
await p.locator('.mark-main').click(); await p.locator('.mark-opt[data-mark="check"]').click(); await p.waitForTimeout(200);
await p.locator('#tagEntry').fill('追加'); await p.keyboard.press('Enter');
await p.keyboard.press('Control+s'); await p.waitForTimeout(500);
const cur = await p.evaluate(() => state.memos.find(m => m.id === state.currentId));
ck('目印とタグが保存される', cur.mark === 'check' && cur.tags.includes('追加'), `${cur.mark} ${cur.tags}`);
ck('一覧に反映', (await p.locator('.memo-item.active .mi-tg-more, .memo-item.active .mi-tg').count()) >= 2);

// 画像・添付
await p.locator('.ms-thumb').first().click(); await p.waitForTimeout(300);
ck('帯のサムネイルで拡大', await p.locator('#lightbox').isVisible());
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150);
ck('ライトボックスで次へ', (await p.locator('#lbIndex').innerText()).includes('2'), await p.locator('#lbIndex').innerText());
await p.keyboard.press('Escape'); await p.waitForTimeout(200);
await p.locator('.ms-panel').click(); await p.waitForTimeout(300);
ck('パネルを開く', await p.locator('#imgPanel').isVisible());
ck('パネル表示中は帯を隠す（同じ画像を2か所に出さない）', await p.locator('#mediaStrip').isHidden() && await p.locator('#btnPanelChip').isVisible());
await p.locator('#btnPanelChip').click(); await p.waitForTimeout(300);
ck('「表示中 ✕」で閉じると帯が戻る', !(await p.locator('#imgPanel').isVisible()) && await p.locator('#mediaStrip').isVisible());

// 管理画面
await p.locator('#btnManage').click(); await p.waitForTimeout(300);
ck('管理画面', await p.locator('#manageModal').isVisible());
await p.locator('#mgmtNavTags').click(); await p.waitForTimeout(200);
ck('タグ管理', (await p.locator('.tag-mgmt-item').count()) > 5);
await p.keyboard.press('Escape'); await p.waitForTimeout(300);

// 書き出し
const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('#btnExport').click()]);
let exported = !!dl;
if (!dl && await p.locator('#dialogRoot').isVisible()) {
  const [dl2] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.locator('#dlgFoot .btn').last().click()]);
  exported = !!dl2;
}
ck('書き出し（JSON）', exported);

// ゴミ箱
const n0 = await p.locator('.memo-item').count();
await p.locator('#btnToolMore').click(); await p.locator('#btnDelete').click(); await p.waitForTimeout(400);
if (await p.locator('#dialogRoot').isVisible()) { await p.locator('#dlgFoot .btn-danger, #dlgFoot .btn-primary').first().click(); await p.waitForTimeout(500); }
ck('削除→一覧から消える', (await p.locator('.memo-item').count()) === n0 - 1);
await p.locator('#btnTrash').click(); await p.waitForTimeout(300);
ck('ゴミ箱に入っている', (await p.locator('.memo-item').count()) === 1);
await p.locator('.mi-restore').first().click(); await p.waitForTimeout(400);
await p.locator('#btnExitTrash').click(); await p.waitForTimeout(300);
ck('復元できる', (await p.locator('.memo-item').count()) === n0);

// 複数選択
await p.locator('#btnListMore').click(); await p.locator('#btnSelectMode').click(); await p.waitForTimeout(300);
await p.locator('.memo-item').nth(0).click(); await p.locator('.memo-item').nth(1).click(); await p.waitForTimeout(200);
ck('複数選択', (await p.locator('#bulkCount').innerText()).includes('2'), await p.locator('#bulkCount').innerText());
await p.locator('#btnListMore').click(); await p.locator('#btnSelectMode').click(); await p.waitForTimeout(200);

// 下書きの復元
await p.locator('.memo-item').nth(2).click(); await p.waitForTimeout(400);
await p.locator('#bodyInput').click(); await p.keyboard.type('下書きテスト'); await p.waitForTimeout(300);
await p.evaluate(() => saveDraftNow()); await p.waitForTimeout(300);
ck('下書きが残る', await p.evaluate(async () => (await Store.getAll('drafts')).length > 0));

ck('PC 通しで JS エラーなし', !(p._errs || []).length, (p._errs || []).join('|').slice(0, 300));

/* ---------- 2. 幅ごとのはみ出し・保存ボタンの位置 ---------- */
for (const [w, h] of [[1600, 1000], [1280, 800], [1150, 800], [1024, 768], [900, 700], [800, 1000], [768, 1024], [600, 900], [390, 844], [360, 640]]) {
  const x = await openApp(b, { width: w, height: h });
  const m = await measure(x);
  const save = await x.evaluate(() => { const r = document.getElementById('btnSave').getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && r.right <= innerWidth; });
  ck(`${w}×${h}：横はみ出しなし・保存ボタンが画面内・本文 ${m.bodyVisW}×${m.bodyVisH}`, !m.hOverflow && save && m.bodyVisH > 150 && m.bodyVisW > 300);
  ck(`${w}×${h}：JS エラーなし`, !(x._errs || []).length, (x._errs || []).join('|'));
  await x.context().close();
}

console.log(`\n== ${pass} / ${pass + fail} ==`);
await b.close();
process.exit(fail ? 1 : 0);
