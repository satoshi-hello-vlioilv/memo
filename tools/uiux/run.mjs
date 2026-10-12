/* 案のキャプチャと計測
   node tools/uiux/run.mjs tools/uiux/items/A.mjs r1 [id ...]
   出力: out/<key>/<round>/<id>.png（1440 / 1024 / 390 を横に並べた比較画像）と metrics.json */
import { launch, openApp, applyVariant, measure, shot } from './lib.mjs';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const [itemPath, round = 'r1', ...only] = process.argv.slice(2);
const item = (await import(pathToFileURL(path.resolve(itemPath)).href)).default;
const variants = item.rounds[round].filter(v => only.length === 0 || only.includes(v.id));
const shots = item.shots || (item.sizes || [[1440, 900], [1024, 768], [390, 844]]).map(([w, h]) => ({ w, h }));
const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'out', item.key, round);
fs.mkdirSync(dir, { recursive: true });
const FONT = process.env.UX_FONT || '/usr/share/fonts/opentype/ipafont-gothic/ipagp.ttf';

const b = await launch();
const metricsFile = path.join(dir, 'metrics.json');
const all = fs.existsSync(metricsFile) ? JSON.parse(fs.readFileSync(metricsFile, 'utf8')) : {};
for (const v of variants) {
  const files = [];
  all[v.id] = { name: v.name, sizes: {} };
  for (const sh of shots) {
    const { w, h } = sh;
    const key = sh.key || String(w);
    const page = await openApp(b, { width: w, height: h, ...(item.open || {}), ...(sh.open || {}) });
    if (item.before) await item.before(page, { width: w, height: h, shot: sh });   /* 案を差し込む前の状態づくり */
    await applyVariant(page, v);
    if (item.scene) await item.scene(page, { width: w, height: h, variant: v, shot: sh });
    if (v.scene) await v.scene(page, { width: w, height: h, shot: sh });
    await page.waitForTimeout(250);
    const m = await measure(page);
    m.errors = page._errs || [];
    all[v.id].sizes[key] = m;
    const f = path.join(dir, `${v.id}-${key}.png`);
    await shot(page, f, sh.clip ? { clip: sh.clip } : {});
    files.push(f);
    await page.context().close();
  }
  /* 3幅を高さ 640 に揃えて横に並べ、上に案の名前を入れる */
  const out = path.join(dir, `${v.id}.png`);
  execFileSync('convert', [
    ...files.flatMap(f => ['(', f, '-resize', `x${item.compositeHeight || 640}`, '-bordercolor', '#777', '-border', '3', ')']),
    '+append', '-background', '#222', '-fill', '#fff', '-font', FONT, '-pointsize', '26',
    '-gravity', 'northwest', '-splice', '0x44', '-annotate', '+12+8', `${v.id}  ${v.name}`, out,
  ]);
  const s = all[v.id].sizes;
  console.log(`${v.id} ${v.name}`);
  for (const sh of shots) {
    const m = s[sh.key || String(sh.w)];
    console.log(`   ${sh.key || sh.w}: body ${m.bodyVisW}x${m.bodyVisH} (${m.bodyAreaPct}%) top=${m.bodyTop} list=${m.listItemsVisible}件 top=${m.listTop} ctrls=${m.controlsVisible} small=${m.smallTargets}${m.hOverflow ? ' OVERFLOW' : ''}${m.errors.length ? ' ERR:' + m.errors.join('|').slice(0, 120) : ''}`);
  }
}
fs.writeFileSync(metricsFile, JSON.stringify(all, null, 1));
await b.close();
