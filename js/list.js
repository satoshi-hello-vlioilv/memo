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
  const counts = countTags(state.memos);
  refs.tmEmpty.hidden = state.tagsMaster.length > 0;
  refs.tmList.innerHTML = state.tagsMaster.map(t => `
    <li class="tag-mgmt-item">
      ${tagChip(t, 'chip')}
      <span class="tmi-spacer"></span>
      <span class="tmi-count mono">${counts.get(t) || 0} 件</span>
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

/* ============================================================
   メモ：一覧・検索・タグフィルタ
   ============================================================ */
async function refreshMemos() {
  state.memos = await Store.getAll('memos');
}
function sortField() {
  return state.groupByDate ? state.groupDateField : 'updatedAt';
}
const BODY_IMG_MARKER_RE = /\[img:\d+(?::[lcr])?(?::(?:[sml]|\d+|fit))?\]/g;
const BODY_FMT_TAG_RE = /\[\/?(?:b|i|size(?:=\d{1,3})?|color(?:=#[0-9a-fA-F]{6})?|hl(?:=#[0-9a-fA-F]{6})?|link(?:=[^\]]*)?)\]/g;
const stripMarkers = text => String(text ?? '')
  .replace(BODY_IMG_MARKER_RE, ' ')
  .replace(BODY_FMT_TAG_RE, '')
  .replace(/\s+/g, ' ').trim();
function filteredMemos() {
  const q = state.query.trim().toLowerCase();
  const field = sortField();
  const dir = state.sortDir === 'asc' ? 1 : -1;
  const scope = state.searchScope;
  return state.memos
    .filter(m => {
      if (state.imageOnly && !(m.imageCount > 0)) return false;
      if (state.markFilter && m.mark !== state.markFilter) return false;
      if (state.tagFilter && !(m.tags || []).includes(state.tagFilter)) return false;
      if (!q) return true;
      const inTitle = scope.title && (m.title || '').toLowerCase().includes(q);
      const inTags  = scope.tags  && (m.tags || []).some(t => t.toLowerCase().includes(q));
      const inBody  = scope.body  && stripMarkers(m.body).toLowerCase().includes(q);
      return inTitle || inTags || inBody;
    })
    .sort((a, b) => (a[field] - b[field]) * dir);
}
/* 検索語がヒットした本文位置を中心に、前後を切り出してハイライトする（本文が検索対象外なら通常表示） */
function makeSnippet(body, query, searchBody) {
  const text = stripMarkers(body);
  if (!text) return '';
  const q = query.trim();
  if (!q || !searchBody) return esc(text.slice(0, 64));
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text.slice(0, 64));
  const CONTEXT = 26;
  const start = Math.max(0, idx - CONTEXT);
  const end   = Math.min(text.length, idx + q.length + CONTEXT);
  const before = esc(text.slice(start, idx));
  const match  = esc(text.slice(idx, idx + q.length));
  const after  = esc(text.slice(idx + q.length, end));
  return (start > 0 ? '…' : '') + before + `<mark>${match}</mark>` + after + (end < text.length ? '…' : '');
}

/* ============================================================
   検索サジェスト（履歴・メモタイトル・タグを横断提案）
   ============================================================ */
let suggestIndex = -1;
function highlightText(text, query) {
  const q = query.trim();
  if (!q) return esc(text);
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return esc(text);
  return esc(text.slice(0, idx)) + `<mark>${esc(text.slice(idx, idx + q.length))}</mark>` + esc(text.slice(idx + q.length));
}
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
  const q = query.trim().toLowerCase();
  const history = state.searchHistory
    .filter(h => h.toLowerCase() !== q)
    .filter(h => !q || h.toLowerCase().includes(q))
    .slice(0, 6);

  let memos = [];
  let tags  = [];
  if (q) {
    memos = state.memos
      .filter(m => (m.title || '').toLowerCase().includes(q))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 5);

    tags = [...countTags(state.memos)]
      .filter(([t]) => t.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1]).map(([t]) => t).slice(0, 5);
  }
  return { history, memos, tags };
}
function renderSearchSuggest(query) {
  const { history, memos, tags } = computeSearchSuggestions(query);
  let html = '';
  if (history.length) {
    html += `<div class="search-suggest-head">履歴</div>` + history.map(h => `
      <div class="search-suggest-item" data-kind="history" data-value="${esc(h)}">
        <i class="fa-regular fa-clock"></i>
        <span class="ssi-label">${highlightText(h, query)}</span>
        <button class="ssi-del" data-del="${esc(h)}" title="履歴から削除"><i class="fa-solid fa-xmark"></i></button>
      </div>`).join('');
  }
  if (memos.length) {
    html += `<div class="search-suggest-head">メモ</div>` + memos.map(m => `
      <div class="search-suggest-item" data-kind="memo" data-id="${m.id}">
        <i class="fa-regular fa-file-lines"></i>
        <span class="ssi-label">${highlightText(m.title || '無題のメモ', query)}</span>
      </div>`).join('');
  }
  if (tags.length) {
    html += `<div class="search-suggest-head">タグ</div>` + tags.map(t => `
      <div class="search-suggest-item" data-kind="tag" data-tag="${esc(t)}">
        <i class="fa-solid fa-tag"></i>
        <span class="ssi-label">${highlightText(t, query)}</span>
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
async function activateSearchSuggest(item) {
  const kind = item.dataset.kind;
  refs.searchSuggest.hidden = true;
  suggestIndex = -1;
  if (kind === 'history') {
    refs.searchInput.value = item.dataset.value;
    state.query = item.dataset.value;
    refs.searchClear.hidden = state.query.length === 0;
    addToHistory(item.dataset.value);
    renderList();
  } else if (kind === 'memo') {
    addToHistory(refs.searchInput.value);
    const id = Number(item.dataset.id);
    if (id !== state.currentId && await guardDirty()) openMemo(id);
  } else if (kind === 'tag') {
    addToHistory(refs.searchInput.value);
    state.tagFilter = item.dataset.tag;
    renderList();
  }
}

function renderMemoItem(m, peek = false) {
  const active  = m.id === state.currentId ? ' active' : '';
  const title   = esc(m.title) || '無題のメモ';
  const dts     = state.groupByDate ? (m[state.groupDateField] ?? m.updatedAt) : m.updatedAt;
  const date    = isToday(dts) ? fmtTime(dts) : fmtDate(dts);
  const snippet = makeSnippet(m.body, state.query, state.searchScope.body);
  const tags    = (m.tags || []).slice(0, 3).map(t => tagChip(t)).join('');
  const more    = (m.tags || []).length > 3 ? `<span class="chip chip-s c4">+${m.tags.length - 3}</span>` : '';
  const imgs    = m.imageCount > 0
    ? `<span class="mi-imgs"><i class="fa-regular fa-image"></i>${m.imageCount}</span>` : '';
  const mark    = markById(m.mark);
  const markEl  = mark
    ? `<i class="mi-mark fa-solid ${mark.icon} mk-${mark.id}" title="${esc(mark.label)}"></i>` : '';
  return `<li class="memo-item${active}${peek ? ' peek' : ''}" data-id="${m.id}"${mark ? ` data-mark="${mark.id}"` : ''}>
    <div class="mi-top">${markEl}<span class="mi-title">${title}</span><span class="mi-date mono">${date}</span></div>
    ${snippet ? `<div class="mi-snippet">${snippet}</div>` : ''}
    <div class="mi-foot"><div class="mi-tags">${tags}${more}</div>${imgs}</div>
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
function renderList() {
  const list = filteredMemos();
  refs.listCount.textContent = `${list.length} 件`;

  let html;
  if (!state.groupByDate) {
    html = list.map(m => renderMemoItem(m)).join('');
  } else {
    const field = state.groupDateField;
    const keys = [];
    const groupMap = new Map();
    for (const m of list) {
      const key = fmtDate(m[field]);
      if (!groupMap.has(key)) { groupMap.set(key, []); keys.push(key); }
      groupMap.get(key).push(m);
    }
    /* 検索・タグ絞り込み中は、折りたたみ状態に関わらず該当グループを
       強制的に開く（「今日」等の未展開グループに隠れて検索結果が
       見えなくなるのを防ぐ）。設定自体は変更しないため、絞り込みを
       解除すれば元の開閉状態に戻る。 */
    const filtering = !!(state.query.trim() || state.tagFilter || state.imageOnly);
    html = keys.map(key => {
      const memos     = groupMap.get(key);
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
        imgBadge +
        `<span class="date-group-count">${memos.length}</span></li>${items}`;
    }).join('');
  }
  refs.memoList.innerHTML = html;

  const empty = list.length === 0;
  refs.listEmpty.hidden = !empty;
  refs.listEmptyMsg.innerHTML = (state.query || state.tagFilter || state.imageOnly || state.markFilter)
    ? '条件に一致するメモがありません。<br>検索語・検索範囲・タグ・目印・画像フィルタを見直してください。'
    : 'メモはまだありません。<br>「新規メモ」から作成できます。';
  renderMarkBar();
  renderTagBar();
}
/* 実際に使われている目印だけを絞り込みチップとして並べる。1件も無ければ
   バー自体を空にして場所を取らない(.markbar:empty で非表示) */
function renderMarkBar() {
  const counts = countMarks(state.memos);
  refs.markBar.innerHTML = MEMO_MARKS.filter(mk => counts.has(mk.id)).map(mk =>
    `<button class="mark-chip ${state.markFilter === mk.id ? 'active' : ''}" data-mark="${mk.id}"
       title="「${esc(mk.label)}」の目印が付いたメモだけを表示">
       <i class="fa-solid ${mk.icon} mk-${mk.id}"></i>${esc(mk.label)}
       <span class="cnt">${counts.get(mk.id)}</span></button>`).join('');
}
function renderTagBar() {
  const tags = [...countTags(state.memos)].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'));
  refs.tagBar.innerHTML = tags.map(([t, n]) =>
    `<button class="chip ${state.tagFilter === t ? 'active' : ''}" data-tag="${esc(t)}">
       ${esc(t)}<span class="cnt">${n}</span></button>`).join('');
}
