/* ============================================================
   list.js
   サイドバーのメモ一覧：タグマスタ、検索・絞り込み、検索サジェスト、
   一覧・タグバー・目印バーの描画
   ============================================================ */
'use strict';

/* ============================================================
   タグマスタ管理・サジェスト
   ============================================================ */
async function refreshTagsMaster() {
  const rows = await Store.getAll('tags');
  state.tagsMaster = rows.map(r => r.name).sort((a, b) => a.localeCompare(b, 'ja'));
  renderTagMasterList();
}
function renderTagMasterList() {
  const counts = countTags(activeMemos());
  refs.tmEmpty.hidden = state.tagsMaster.length > 0;
  refs.tmList.innerHTML = state.tagsMaster.map(t => `
    <li class="tag-mgmt-item">
      ${tagChip(t, 'chip')}
      <span class="tmi-spacer"></span>
      <span class="tmi-count mono">${counts.get(t) || 0} 件</span>
      <button class="icon-btn tm-rename" data-tag="${esc(t)}" title="名前を変更／他のタグへ統合"><i class="fa-solid fa-pen"></i></button>
      <button class="icon-btn btn-danger-ghost tm-del" data-tag="${esc(t)}" title="削除"><i class="fa-solid fa-trash-can"></i></button>
    </li>
  `).join('');
  refs.mgmtTagCount.textContent = state.tagsMaster.length;
}
function getTagSearchWord() {
  const parts = refs.tagsInput.value.split(/[,、]\s*/);
  return parts[parts.length - 1];
}
function updateTagSuggest() {
  const word = getTagSearchWord().trim().toLowerCase();
  if (!word) { refs.tagsSuggest.hidden = true; return; }
  const matches = state.tagsMaster.filter(t => t.toLowerCase().includes(word));
  if (matches.length === 0) { refs.tagsSuggest.hidden = true; return; }
  refs.tagsSuggest.innerHTML = matches.map(t => `<div class="sg-item" data-tag="${esc(t)}">${esc(t)}</div>`).join('');
  refs.tagsSuggest.hidden = true;
  requestAnimationFrame(() => { refs.tagsSuggest.hidden = false; });
}

/* タグの名前を変える。既にある名前にすると、そのタグへ統合される。
   メモの updatedAt は変えない（並び順が総入れ替えになるのを防ぐため） */
async function renameTagAsked(oldName) {
  const res = await dialog({
    title: 'タグの名前を変更',
    message: `「${oldName}」の名前を変更します。すべてのメモのタグが置き換わります。\n` +
      '既にあるタグと同じ名前にすると、そのタグへ統合されます。',
    fields: [{ name: 'name', label: '新しい名前', value: oldName, placeholder: '新しいタグ名' }],
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '変更する', value: 'ok', kind: 'primary' },
    ],
  });
  if (!res || res.value !== 'ok') return;
  const next = parseTags(res.fields.name)[0];
  if (!next || next === oldName) return;
  if (state.tagsMaster.includes(next)) {
    const ok = await confirmDialog({
      title: 'タグの統合',
      message: `「${next}」は既に存在します。「${oldName}」を「${next}」へ統合しますか？`,
      okLabel: '統合する',
      kind: 'primary',
    });
    if (!ok) return;
  }
  const targets = state.memos.filter(m => (m.tags || []).includes(oldName));
  try {
    for (const m of targets) {
      const tags = [...new Set(m.tags.map(t => (t === oldName ? next : t)))];
      await Store.put('memos', { ...m, tags });
    }
    /* フォーマットの自動付与タグも追従させる */
    for (const f of state.formats) {
      if (!(f.tags || []).includes(oldName)) continue;
      await Store.put('formats', { ...f, tags: [...new Set(f.tags.map(t => (t === oldName ? next : t)))] });
    }
    await Store.del('tags', oldName);
    await Store.put('tags', { name: next });
  } catch (err) {
    console.error(err);
    toast('タグを変更できませんでした', 'error');
    return;
  }
  if (state.tagFilter === oldName) state.tagFilter = next;
  await refreshMemos();
  await refreshTagsMaster();
  await refreshFormats();
  /* 編集中のメモにも反映する（未保存の変更がある場合はそのまま残す） */
  if (state.currentId !== null && !state.dirty) {
    const cur = state.memos.find(m => m.id === state.currentId);
    if (cur) { refs.tagsInput.value = (cur.tags || []).join(', '); renderTagsPreview(); }
  }
  renderList();
  toast(`タグを「${next}」に変更しました（${targets.length} 件のメモ）`, 'success');
}

/* ============================================================
   メモ：一覧・検索・タグフィルタ
   ============================================================ */
async function refreshMemos() {
  state.memos = await Store.getAll('memos');
}
/* ゴミ箱に入っていないメモ。件数の集計やタグバーはこちらを見る */
const activeMemos = () => state.memos.filter(m => !m.deletedAt);
const trashedMemos = () => state.memos.filter(m => !!m.deletedAt);

/* 検索条件の解釈結果は入力が変わるまで使い回す（1 キーストロークごとに
   全メモぶん解釈し直さない）。today などの相対指定があるため、日付が
   変わったら作り直す */
let parsedQuery = { key: null, value: null };
function currentQuery() {
  const key = `${fmtDate(Date.now())}\u0000${state.query}`;
  if (parsedQuery.key !== key) {
    parsedQuery = {
      key,
      value: parseSearchQuery(state.query, {
        markIds: MEMO_MARKS.map(m => m.id),
        markLabels: Object.fromEntries(MEMO_MARKS.map(m => [m.id, m.label])),
      }),
    };
  }
  return parsedQuery.value;
}
/* 検索語以外の絞り込み（タグバー・目印バー・画像/添付フィルタ）が効いているか */
const hasSideFilter = () => !!(state.tagFilter || state.markFilter || state.imageOnly || state.fileOnly);

function compareMemos(a, b) {
  const dir = state.sortDir === 'asc' ? 1 : -1;
  if (state.sortKey === 'title') {
    const at = String(a.title || '').trim();
    const bt = String(b.title || '').trim();
    /* 無題のメモは常に末尾へ寄せる（並び順の先頭が無題で埋まるのを防ぐ） */
    if (!at !== !bt) return at ? -1 : 1;
    const c = at.localeCompare(bt, 'ja');
    return c !== 0 ? c * dir : b.updatedAt - a.updatedAt;
  }
  const field = state.sortKey === 'createdAt' ? 'createdAt' : 'updatedAt';
  return (a[field] - b[field]) * dir;
}
/* 「ピン」の目印を付けたメモは並び順に関わらず先頭へ固定する
   （ゴミ箱の表示中は固定しない） */
const pinRank = m => (!state.trashView && m.mark === 'pin') ? 0 : 1;

function filteredMemos() {
  const q = currentQuery();
  const scope = state.searchScope;
  const empty = isEmptySearchQuery(q);
  return state.memos
    .filter(m => {
      if (state.trashView !== !!m.deletedAt) return false;
      if (state.imageOnly && !(m.imageCount > 0)) return false;
      if (state.fileOnly && !(m.fileCount > 0)) return false;
      if (state.markFilter && m.mark !== state.markFilter) return false;
      if (state.tagFilter && !(m.tags || []).includes(state.tagFilter)) return false;
      if (empty) return true;
      return matchMemoQuery(m, q, scope, memoSearchText(m));
    })
    .sort((a, b) => (pinRank(a) - pinRank(b)) || compareMemos(a, b));
}

/* 一覧の並び順で前後のメモへ移動する（Alt+↑ / Alt+↓） */
async function stepMemo(dir) {
  if (state.trashView || state.selectMode) return;
  const list = filteredMemos();
  if (list.length === 0) return;
  const at = list.findIndex(m => m.id === state.currentId);
  const nextAt = at === -1 ? (dir > 0 ? 0 : list.length - 1) : at + dir;
  if (nextAt < 0 || nextAt >= list.length) {
    toast(dir > 0 ? '一覧の最後です' : '一覧の先頭です', 'info');
    return;
  }
  const target = list[nextAt];
  if (target.id === state.currentId) return;
  if (await guardDirty()) openMemo(target.id);
}

/* 検索語を <mark> で囲んだ HTML を作る（複数語・重なりに対応） */
function highlightTermsHtml(text, terms) {
  const src = String(text ?? '');
  const list = (terms || []).filter(Boolean);
  if (list.length === 0) return esc(src);
  const lower = src.toLowerCase();
  const spans = [];
  for (const t of list) {
    for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + t.length)) spans.push([i, i + t.length]);
  }
  if (spans.length === 0) return esc(src);
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1]) last[1] = Math.max(last[1], s[1]);
    else merged.push([s[0], s[1]]);
  }
  let out = '', pos = 0;
  for (const [s, e] of merged) {
    out += esc(src.slice(pos, s)) + `<mark>${esc(src.slice(s, e))}</mark>`;
    pos = e;
  }
  return out + esc(src.slice(pos));
}
/* 検索語がヒットした本文位置を中心に、前後を切り出してハイライトする */
function makeSnippet(plain, terms) {
  const text = String(plain ?? '');
  if (!text) return '';
  const list = (terms || []).filter(Boolean);
  const lower = text.toLowerCase();
  let idx = -1, len = 0;
  for (const t of list) {
    const i = lower.indexOf(t);
    if (i !== -1 && (idx === -1 || i < idx)) { idx = i; len = t.length; }
  }
  if (idx === -1) return highlightTermsHtml(text.slice(0, 64), list);
  const CONTEXT = 26;
  const start = Math.max(0, idx - CONTEXT);
  const end   = Math.min(text.length, idx + len + CONTEXT);
  return (start > 0 ? '…' : '') +
    highlightTermsHtml(text.slice(start, end), list) +
    (end < text.length ? '…' : '');
}

/* ============================================================
   検索サジェスト（履歴・メモタイトル・タグを横断提案）
   ============================================================ */
let suggestIndex = -1;
/* 検索欄は複数の語を並べられるため、サジェストは入力中の「最後の語」に対して
   出し、選ぶとその語だけを差し替える */
const lastQueryToken = text => (/([^\s　]*)$/.exec(String(text ?? '')) || ['', ''])[1];
const replaceLastToken = (text, replacement) =>
  String(text ?? '').replace(/([^\s　]*)$/, replacement);

function addToHistory(text) {
  const q = text.trim();
  if (!q) return;
  state.searchHistory = [q, ...state.searchHistory.filter(h => h.toLowerCase() !== q.toLowerCase())].slice(0, 8);
  savePref('searchHistory', state.searchHistory);
}
function removeHistoryEntry(value) {
  state.searchHistory = state.searchHistory.filter(h => h !== value);
  savePref('searchHistory', state.searchHistory);
  renderSearchSuggest(refs.searchInput.value);
}
function computeSearchSuggestions(query) {
  const full = String(query ?? '').trim().toLowerCase();
  const token = lastQueryToken(query);
  /* tag: を書きかけならタグだけを、それ以外は語として提案する */
  const tagPrefix = /^(tag|タグ):(.*)$/i.exec(token);
  const word = (tagPrefix ? tagPrefix[2] : token).trim().toLowerCase();

  const history = state.searchHistory
    .filter(h => h.toLowerCase() !== full)
    .filter(h => !full || h.toLowerCase().includes(full))
    .slice(0, 6);

  let memos = [];
  let tags  = [];
  if (word) {
    const counts = countTags(activeMemos());
    tags = [...counts]
      .filter(([t]) => t.toLowerCase().includes(word))
      .sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
    if (!tagPrefix) {
      memos = activeMemos()
        .filter(m => (m.title || '').toLowerCase().includes(word))
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, 5);
    }
  }
  return { history, memos, tags, word };
}
function renderSearchSuggest(query) {
  const { history, memos, tags, word } = computeSearchSuggestions(query);
  let html = '';
  if (history.length) {
    html += `<div class="search-suggest-head">履歴</div>` + history.map(h => `
      <div class="search-suggest-item" data-kind="history" data-value="${esc(h)}">
        <i class="fa-regular fa-clock"></i>
        <span class="ssi-label">${highlightTermsHtml(h, [String(query ?? '').trim().toLowerCase()])}</span>
        <button class="ssi-del" data-del="${esc(h)}" title="履歴から削除"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }
  if (memos.length) {
    html += `<div class="search-suggest-head">メモ</div>` + memos.map(m => `
      <div class="search-suggest-item" data-kind="memo" data-id="${m.id}">
        <i class="fa-regular fa-file-lines"></i>
        <span class="ssi-label">${highlightTermsHtml(m.title || '無題のメモ', [word])}</span>
      </div>`).join('');
  }
  if (tags.length) {
    html += `<div class="search-suggest-head">タグで絞り込む</div>` + tags.map(t => `
      <div class="search-suggest-item" data-kind="tag" data-tag="${esc(t)}">
        <i class="fa-solid fa-tag"></i>
        <span class="ssi-label">${highlightTermsHtml(t, [word])}</span>
        <span class="ssi-keys mono">tag:</span>
      </div>`).join('');
  }
  suggestIndex = -1;
  refs.searchSuggest.innerHTML = html;
  refs.searchSuggest.hidden = html.length === 0;
}
function updateSuggestActive(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === suggestIndex));
  if (suggestIndex >= 0 && items[suggestIndex]) items[suggestIndex].scrollIntoView({ block: 'nearest' });
}
/* 検索欄の内容を差し替えて再検索する（サジェスト選択・タグクリックで共用） */
function setSearchQuery(text) {
  refs.searchInput.value = text;
  state.query = text;
  refs.searchClear.hidden = text.length === 0;
  renderList();
}
async function activateSearchSuggest(item) {
  const kind = item.dataset.kind;
  refs.searchSuggest.hidden = true;
  suggestIndex = -1;
  if (kind === 'history') {
    setSearchQuery(item.dataset.value);
    addToHistory(item.dataset.value);
  } else if (kind === 'memo') {
    addToHistory(refs.searchInput.value);
    const id = Number(item.dataset.id);
    if (id !== state.currentId && await guardDirty()) openMemo(id);
  } else if (kind === 'tag') {
    const tag = item.dataset.tag;
    /* 空白を含むタグは "..." で囲まないと 1 語として扱えない */
    const value = /[\s　]/.test(tag) ? `tag:"${tag}"` : `tag:${tag}`;
    setSearchQuery(replaceLastToken(refs.searchInput.value, value) + ' ');
    refs.searchInput.focus();
  }
}

/* ============================================================
   一覧の描画
   ============================================================ */
function memoDateField() {
  if (state.groupByDate) return state.groupDateField;
  return state.sortKey === 'createdAt' ? 'createdAt' : 'updatedAt';
}
function renderMemoItem(m, peek = false) {
  const q = currentQuery();
  const terms = state.searchScope.body ? searchHighlightTerms(q) : [];
  const active  = m.id === state.currentId ? ' active' : '';
  const title   = esc(m.title) || '無題のメモ';
  const dts     = m[memoDateField()] ?? m.updatedAt;
  const date    = state.trashView ? fmtDate(m.deletedAt)
    : (isToday(dts) ? fmtTime(dts) : fmtDate(dts));
  const snippet = makeSnippet(memoPlainBody(m), terms);
  const tags    = (m.tags || []).slice(0, 3).map(t => tagChip(t)).join('');
  const more    = (m.tags || []).length > 3 ? `<span class="chip chip-s c4">+${m.tags.length - 3}</span>` : '';
  const imgs    = m.imageCount > 0
    ? `<span class="mi-imgs"><i class="fa-regular fa-image"></i>${m.imageCount}</span>` : '';
  const files   = m.fileCount > 0
    ? `<span class="mi-files" title="添付ファイル ${m.fileCount} 件"><i class="fa-solid fa-paperclip"></i>${m.fileCount}</span>` : '';
  const mark    = markById(m.mark);
  const markEl  = mark
    ? `<i class="mi-mark fa-solid ${mark.icon} mk-${mark.id}" title="${esc(mark.label)}"></i>` : '';
  /* 自動保存された下書きが残っているメモには印を出す（開くと復元を尋ねる） */
  const draft   = hasDraftFor(m) ? `<i class="mi-draft fa-solid fa-circle" title="未保存の変更が残っています"></i>` : '';
  const check   = state.selectMode
    ? `<span class="mi-check${state.selected.has(m.id) ? ' on' : ''}"><i class="fa-solid fa-check"></i></span>` : '';
  const acts    = state.trashView
    ? `<div class="mi-acts">
         <button class="mi-act mi-restore" title="元の一覧に戻す"><i class="fa-solid fa-rotate-left"></i> 復元</button>
         <button class="mi-act mi-purge" title="完全に削除する（取り消せません）"><i class="fa-regular fa-trash-can"></i> 完全削除</button>
       </div>` : '';
  return `<li class="memo-item${active}${peek ? ' peek' : ''}${state.selectMode ? ' selectable' : ''}" data-id="${m.id}"${mark ? ` data-mark="${mark.id}"` : ''}>
    <div class="mi-top">${check}${markEl}${draft}<span class="mi-title">${title}</span><span class="mi-date mono">${date}</span></div>
    ${snippet ? `<div class="mi-snippet">${snippet}</div>` : ''}
    <div class="mi-foot"><div class="mi-tags">${tags}${more}</div>${files}${imgs}</div>
    ${acts}
  </li>`;
}
function getDateGroupLabel(dateStr) {
  const today     = fmtDate(Date.now());
  const yesterday = fmtDate(Date.now() - 86400000);
  if (dateStr === today)     return '今日';
  if (dateStr === yesterday) return '昨日';
  const [y, mo, d] = dateStr.split('/').map(Number);
  return `${y}年${mo}月${d}日（${DAY_NAMES[new Date(y, mo - 1, d).getDay()]}）`;
}
const dateKeyTs = key => {
  const [y, mo, d] = String(key).split('/').map(Number);
  return new Date(y, (mo || 1) - 1, d || 1).getTime();
};
/* 日付でまとめる。グループ自体は日付順、グループ内は一覧の並び順を保つ */
function groupMemosByDate(list) {
  const field = state.groupDateField;
  const map = new Map();
  for (const m of list) {
    const key = fmtDate(m[field]);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  const dir = state.sortDir === 'asc' ? 1 : -1;
  return [...map.keys()]
    .sort((a, b) => (dateKeyTs(a) - dateKeyTs(b)) * dir)
    .map(key => [key, map.get(key)]);
}

function renderList() {
  const list = filteredMemos();
  refs.listCount.textContent = `${list.length} 件`;
  applyTrashViewState();
  renderBulkBar(list);

  let html;
  if (!state.groupByDate) {
    html = list.map(m => renderMemoItem(m)).join('');
  } else {
    /* 検索・タグ絞り込み中は、折りたたみ状態に関わらず該当グループを
       強制的に開く（「今日」等の未展開グループに隠れて検索結果が
       見えなくなるのを防ぐ）。設定自体は変更しないため、絞り込みを
       解除すれば元の開閉状態に戻る。 */
    const filtering = !!(state.query.trim() || hasSideFilter());
    html = groupMemosByDate(list).map(([key, memos]) => {
      const collapsed = !filtering && !state.expandedGroups.has(key);
      const chevron   = collapsed ? 'fa-chevron-right' : 'fa-chevron-down';
      /* 折りたたむと編集中のメモや目印（付箋）を付けたメモまで隠れてしまい、
         今どれを編集中なのか・どこに目印を付けたのかを見失う。折りたたみ中でも
         この2つは「付箋が折り目からはみ出している」ように残して表示し、
         残りは「他 N 件を表示」から展開できるようにする */
      const activeInGroup = state.currentId !== null
        ? memos.find(m => m.id === state.currentId) : null;
      const peeked = collapsed
        ? memos.filter(m => m.id === state.currentId || markById(m.mark)) : [];
      let items;
      if (!collapsed) {
        items = memos.map(m => renderMemoItem(m)).join('');
      } else if (peeked.length > 0) {
        const rest = memos.length - peeked.length;
        items = peeked.map(m => renderMemoItem(m, true)).join('') +
          (rest > 0 ? `<li class="group-rest" data-date="${esc(key)}">他 ${rest} 件を表示</li>` : '');
      } else {
        items = '';
      }
      const imgTotal  = memos.reduce((sum, m) => sum + (m.imageCount || 0), 0);
      const imgBadge  = imgTotal > 0
        ? `<span class="date-group-imgs"><i class="fa-regular fa-image"></i>${imgTotal}</span>` : '';
      const fileTotal = memos.reduce((sum, m) => sum + (m.fileCount || 0), 0);
      const fileBadge = fileTotal > 0
        ? `<span class="date-group-imgs" title="添付ファイル ${fileTotal} 件"><i class="fa-solid fa-paperclip"></i>${fileTotal}</span>` : '';
      /* 画像バッジと同じように、そのグループに含まれる目印も見出しへ集約して
         表示する。折りたたんでいても、どの目印がその日に付いているかが分かる */
      const markCounts = countMarks(memos);
      const markBadges = MEMO_MARKS.filter(mk => markCounts.has(mk.id)).map(mk => {
        const n = markCounts.get(mk.id);
        return `<span class="date-group-mark" title="${esc(mk.label)} ${n} 件">` +
          `<i class="fa-solid ${mk.icon} mk-${mk.id}"></i>` +
          (n > 1 ? `<span class="dgm-n">${n}</span>` : '') + `</span>`;
      }).join('');
      /* 折りたたみ中のグループに編集中のメモが含まれることを見出し側でも示し、
         スクロールしていても選択位置を追えるようにする */
      const hasActive = activeInGroup ? ' has-active' : '';
      return `<li class="date-group-header${collapsed ? ' collapsed' : ''}${hasActive}" data-date="${esc(key)}">` +
        `<i class="fa-solid ${chevron}"></i>` +
        `<span class="date-group-label">${getDateGroupLabel(key)}</span>` +
        (activeInGroup ? `<span class="date-group-active" title="このグループに編集中のメモがあります"></span>` : '') +
        markBadges +
        fileBadge +
        imgBadge +
        `<span class="date-group-count">${memos.length}</span></li>${items}`;
    }).join('');
  }
  refs.memoList.innerHTML = html;

  const empty = list.length === 0;
  refs.listEmpty.hidden = !empty;
  refs.listEmptyMsg.innerHTML = state.trashView
    ? 'ゴミ箱は空です。<br>削除したメモは 30 日間ここに残ります。'
    : (state.query || hasSideFilter())
      ? '条件に一致するメモがありません。<br>検索語・検索範囲・タグ・目印・画像／添付フィルタを見直してください。'
      : 'メモはまだありません。<br>「新規メモ」から作成できます。';
  renderMarkBar();
  renderTagBar();
}
/* 実際に使われている目印だけを絞り込みチップとして並べる。1件も無ければ
   バー自体を空にして場所を取らない(.markbar:empty で非表示) */
function renderMarkBar() {
  const counts = countMarks(state.trashView ? trashedMemos() : activeMemos());
  refs.markBar.innerHTML = MEMO_MARKS.filter(mk => counts.has(mk.id)).map(mk =>
    `<button class="mark-chip ${state.markFilter === mk.id ? 'active' : ''}" data-mark="${mk.id}"
       title="「${esc(mk.label)}」の目印が付いたメモだけを表示">
       <i class="fa-solid ${mk.icon} mk-${mk.id}"></i>${esc(mk.label)}
       <span class="cnt">${counts.get(mk.id)}</span></button>`).join('');
}
function renderTagBar() {
  const tags = [...countTags(state.trashView ? trashedMemos() : activeMemos())]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  refs.tagBar.innerHTML = tags.map(([t, n]) =>
    `<button class="chip ${state.tagFilter === t ? 'active' : ''}" data-tag="${esc(t)}">
       ${esc(t)}<span class="cnt">${n}</span></button>`).join('');
}

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = { highlightTermsHtml, makeSnippet, lastQueryToken, replaceLastToken, dateKeyTs };
}
