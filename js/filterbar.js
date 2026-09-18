/* ============================================================
   filterbar.js
   有効な絞り込み条件を1列にまとめて表示する「条件チップ」

   これまでタグ／目印のチップ操作と検索構文（tag: mark: is: …）が
   別系統で、`tag:業務` で検索してもタグバーのチップは選択表示にならず、
   いま何で絞り込まれているのかが2か所に散っていた。
   チップ操作を検索欄への書き込みに統一し、条件は常にこのバーへ集約する。
   ------------------------------------------------------------
   ・チップを押す → 検索欄に `tag:業務` が入る（構文を覚える手がかりになる）
   ・`tag:業務` と打つ → タグバーのチップも選択表示になる
   ・効いている条件は条件チップとして並び、× で1つずつ外せる
   ============================================================ */
'use strict';

/* トークンを検索欄へ書き戻す形にする。値に空白があるときは値だけを
   引用符で包む（`"tag:営業 部"` と全体を包むと tag: が語の一部になってしまう） */
function serializeToken(text, quoted = false) {
  const t = String(text ?? '');
  if (quoted) return `"${t}"`;                 /* 先頭から引用符だった語はそのまま */
  if (!/[\s　]/.test(t)) return t;
  const neg = t.startsWith('-') || t.startsWith('－') ? t[0] : '';
  const rest = neg ? t.slice(1) : t;
  const at = rest.indexOf(':');
  return at > 0 ? `${neg}${rest.slice(0, at)}:"${rest.slice(at + 1)}"` : `"${t}"`;
}

/* 呼び出し側が `tag:営業 部` と `tag:"営業 部"` のどちらを渡しても同じ形に揃える。
   既に引用符が付いた語を包み直して `tag:""営業 部""` にしないための入口 */
function normalizeToken(token) {
  const t = String(token ?? '').trim();
  const toks = splitSearchTokens(t);
  if (toks.length === 0) return '';
  if (toks.length === 1) return serializeToken(toks[0].text, toks[0].quoted);
  /* 引用符なしで空白を含む指定は、値に空白があるものとして包み直す */
  return serializeToken(t);
}

/* 検索欄の語と、チップが持つ語を突き合わせるための鍵。
   引用符の付け方や大小文字のゆれに引きずられないよう、
   引用符を外した形に揃えてから比べる */
const tokenKey = token => {
  const t = splitSearchTokens(normalizeToken(token))[0];
  return t ? t.text.toLowerCase() : '';
};

function queryHasToken(text, token) {
  const want = tokenKey(token);
  return !!want && splitSearchTokens(text).some(t => t.text.toLowerCase() === want);
}
function removeQueryToken(text, token) {
  const want = tokenKey(token);
  return splitSearchTokens(text)
    .filter(t => t.text.toLowerCase() !== want)
    .map(t => serializeToken(t.text, t.quoted))
    .join(' ');
}
function addQueryToken(text, token) {
  const base = String(text || '').trim();
  const add = normalizeToken(token);
  if (!add) return base;
  return base ? `${base} ${add}` : add;
}
/* タグ名を変えたとき、検索欄に残っている `tag:旧名` も追従させる */
function renameQueryToken(text, from, to) {
  const want = tokenKey(from);
  const next = normalizeToken(to);
  return splitSearchTokens(text)
    .map(t => (t.text.toLowerCase() === want ? next : serializeToken(t.text, t.quoted)))
    .join(' ');
}

/* 検索欄への反映は list.js の setSearchQuery（検索サジェストと共用）を使う */
function toggleQueryToken(token) {
  const cur = refs.searchInput.value;
  setSearchQuery(queryHasToken(cur, token) ? removeQueryToken(cur, token) : addQueryToken(cur, token));
}

/* 値に空白が含まれるときは引用符で包む（tag:"営業 部" のように） */
const tagToken  = name => normalizeToken(`tag:${name}`);
const markToken = id   => `mark:${id}`;

/* 検索欄の内容を解釈する。一覧側の currentQuery() は state.query を見るが、
   こちらは入力中の値も拾えるように検索欄そのものを見る */
const parseCurrentQuery = () => parseSearchQuery(refs.searchInput.value, {
  markIds: MEMO_MARKS.map(m => m.id),
  markLabels: Object.fromEntries(MEMO_MARKS.map(m => [m.id, m.label])),
});

/* is: に指定できる条件の日本語表示 */
const FLAG_LABELS = {
  image: '画像あり', file: '添付あり', marked: '目印あり',
  pinned: 'ピン付き', tagged: 'タグあり', untagged: 'タグなし',
};
const RANGE_LABELS = { created: '作成日', updated: '更新日', after: '以降', before: '以前' };

/* いま効いている条件を、表示用にすべて集める。
   検索構文由来のものと、ボタン由来（画像あり／添付あり）の両方を混ぜる */
function activeConditions() {
  const out = [];
  const q = parseCurrentQuery();
  const neg = c => (c.negate ? '除外 ' : '');

  for (const t of q.tags) {
    out.push({ label: `${neg(t)}タグ: ${t.raw}`, icon: 'fa-tag', token: t.src });
  }
  for (const m of q.marks) {
    const mk = MEMO_MARKS.find(x => x.id === m.id);
    const name = m.id === 'any' ? 'あり' : m.id === 'none' ? 'なし' : (mk ? mk.label : m.id);
    out.push({ label: `${neg(m)}目印: ${name}`, icon: mk ? mk.icon : 'fa-note-sticky', token: m.src });
  }
  for (const f of q.flags) {
    out.push({ label: `${neg(f)}${FLAG_LABELS[f.name] || f.name}`, icon: 'fa-filter', token: f.src });
  }
  for (const r of q.ranges) {
    out.push({ label: `${neg(r)}${RANGE_LABELS[r.key] || '日付'}: ${r.raw}`, icon: 'fa-calendar-day', token: r.src });
  }
  for (const t of q.terms) {
    const scope = t.field === 'title' ? 'タイトル: ' : t.field === 'body' ? '本文: ' : '';
    out.push({ label: `${neg(t)}${scope}${t.raw}`, icon: 'fa-magnifying-glass', token: t.src });
  }

  /* ボタンで切り替える絞り込みも同じ列に並べ、解除の導線を1か所にまとめる */
  if (state.imageOnly) {
    out.push({ label: '画像あり', icon: 'fa-image', clear: () => setImageOnly(false) });
  }
  if (state.fileOnly) {
    out.push({ label: '添付あり', icon: 'fa-paperclip', clear: () => setFileOnly(false) });
  }
  return out;
}

/* 画像／添付フィルタの切り替え。ボタンからも条件チップの × からも通る */
function setImageOnly(on) {
  state.imageOnly = on;
  applyImageFilterState();
  savePref('imageOnly', on);
  renderList();
}
function setFileOnly(on) {
  state.fileOnly = on;
  applyImageFilterState();
  savePref('fileOnly', on);
  renderList();
}

/* チップの選択表示は検索構文と一致させる。`tag:業務` と打った場合も
   タグバーの「業務」が選択状態になる（従来は別系統で連動しなかった）。
   別名（タグ:／目印:／mark:重要 のようなラベル指定）も解釈した結果で
   突き合わせるので、書き方が違っても同じ条件なら選択表示になる */
function tagChipActive(name) {
  const want = String(name).toLowerCase();
  return parseCurrentQuery().tags.some(t => !t.negate && t.name === want);
}
function markChipActive(id) {
  return parseCurrentQuery().marks.some(m => !m.negate && m.id === id);
}
/* チップを押したときは検索欄へ書き込む。操作と構文を同じ入口にまとめる */
function toggleTagChip(name) {
  if (!tagChipActive(name)) { toggleQueryToken(tagToken(name)); return; }
  /* 既に効いている条件は、書き方が違っても消えるように src で外す */
  const hit = parseCurrentQuery().tags.filter(t => !t.negate && t.name === String(name).toLowerCase());
  let text = refs.searchInput.value;
  for (const t of hit) text = removeQueryToken(text, t.src);
  setSearchQuery(text);
}
function toggleMarkChip(id) {
  if (!markChipActive(id)) { toggleQueryToken(markToken(id)); return; }
  const hit = parseCurrentQuery().marks.filter(m => !m.negate && m.id === id);
  let text = refs.searchInput.value;
  for (const m of hit) text = removeQueryToken(text, m.src);
  setSearchQuery(text);
}

function renderFilterBar() {
  const conds = activeConditions();
  refs.filterBar.innerHTML = conds.length === 0 ? '' :
    `<span class="cond-lead"><i class="fa-solid fa-filter"></i>絞り込み</span>` +
    conds.map((c, i) =>
      `<button class="cond-chip" data-i="${i}" title="この条件を外す：${esc(c.label)}">
         <i class="fa-solid ${c.icon}"></i><span class="cond-t">${esc(c.label)}</span>
         <span class="cond-x"><i class="fa-solid fa-xmark"></i></span>
       </button>`).join('') +
    `<button class="cond-clear" id="condClearAll" title="絞り込みをすべて解除">すべて解除</button>`;
}

function bindFilterBar() {
  refs.filterBar.addEventListener('click', e => {
    if (e.target.closest('#condClearAll')) {
      state.imageOnly = false;
      state.fileOnly = false;
      applyImageFilterState();
      savePref('imageOnly', false);
      savePref('fileOnly', false);
      setSearchQuery('');
      return;
    }
    const chip = e.target.closest('.cond-chip');
    if (!chip) return;
    const cond = activeConditions()[Number(chip.dataset.i)];
    if (!cond) return;
    if (cond.clear) cond.clear();
    else setSearchQuery(removeQueryToken(refs.searchInput.value, cond.token));
  });
}

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = {
    tokenKey, serializeToken, normalizeToken,
    queryHasToken, removeQueryToken, addQueryToken, renameQueryToken,
  };
}
