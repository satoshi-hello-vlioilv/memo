/* ============================================================
   editor.js
   メモの編集・保存・削除と、編集画面まわりの表示状態
   ============================================================ */
'use strict';

/* ============================================================
   メモ：編集・保存・削除
   ============================================================ */
function collectFields() {
  const body = serializeBody();
  return {
    title: refs.titleInput.value.trim(),
    tags : parseTags(refs.tagsInput.value),
    body,
    /* 検索用のテキストを保存時に作っておく。検索のたびに全メモの本文から
       マーカーを取り除き直さずに済む（list.js の絞り込みが使う） */
    plainBody: buildPlainBody(body),
    mark : state.currentMark,
  };
}
/* 編集中メモの目印ピッカー。同じ目印をもう一度押すと外れる（トグル） */
function renderMarkPicker() {
  const cur = state.currentMark;
  refs.markPicker.innerHTML =
    `<span class="mark-picker-label"><i class="fa-regular fa-note-sticky"></i> 目印</span>` +
    MEMO_MARKS.map(mk =>
      `<button class="mark-btn ${cur === mk.id ? 'active' : ''}" data-mark="${mk.id}"
         title="${esc(mk.label)}${cur === mk.id ? '（クリックで外す）' : 'の目印を付ける'}">
         <i class="fa-solid ${mk.icon} mk-${mk.id}"></i></button>`).join('') +
    (cur ? `<button class="mark-clear" title="目印を外す"><i class="fa-solid fa-xmark"></i></button>` : '');
}
function setCurrentMark(markId) {
  const next = state.currentMark === markId ? null : markId;
  if (next === state.currentMark) return;
  state.currentMark = next;
  renderMarkPicker();
  markDirty();
  const mk = markById(next);
  toast(mk ? `目印「${mk.label}」を付けました（保存で確定）` : '目印を外しました（保存で確定）', 'info');
}
function showSheet() {
  refs.welcome.hidden = true;
  refs.sheet.hidden = false;
  focusEditorTab();   /* 狭い画面では編集タブへ移る */
}
function showWelcome() {
  refs.sheet.hidden = true;
  refs.welcome.hidden = false;
  state.currentId = null;
  state.currentMark = null;
  state.dirty = false;
  loadImages();
  loadAttachments();
}
function markDirty() {
  if (!state.dirty) { state.dirty = true; renderSaveState(); }
  /* 保存を押す前にタブが閉じても書きかけが残るよう、下書きを退避する */
  scheduleDraftSave();
}
function renderSaveState() {
  const el = refs.saveState;
  if (state.dirty) {
    el.className = 'save-state dirty';
    el.innerHTML = '<i class="fa-solid fa-circle"></i>未保存の変更があります';
  } else if (state.savedAt) {
    el.className = 'save-state saved';
    el.innerHTML = `<i class="fa-solid fa-circle-check"></i>保存済み ${fmtTime(state.savedAt)}`;
  } else {
    el.className = 'save-state fresh';
    el.innerHTML = '<i class="fa-regular fa-circle"></i>未保存（新規）';
  }
}
function renderStamps() {
  const m = state.memos.find(x => x.id === state.currentId);
  refs.stampCreated.textContent = m ? fmtDateTime(m.createdAt) : '—';
  refs.stampUpdated.textContent = m ? fmtDateTime(m.updatedAt) : '—';
}
function renderCharCount() {
  refs.charCount.textContent = bodyPlainText().length;
}
function renderTagsPreview() {
  refs.tagsPreview.innerHTML = parseTags(refs.tagsInput.value).map(t => tagChip(t)).join('');
}
/* 編集画面のヘッダまわり（日時・保存状態・タグ・目印）をまとめて描き直す */
function renderEditorMeta() {
  renderStamps(); renderSaveState(); renderTagsPreview(); renderMarkPicker();
}
/* 本文を書き換えたあとの共通後処理。以前は呼び出し側ごとにこの並びを手で
   書いていたため、例えばフォーマット適用では改行マークが更新されないなど、
   処理の抜けが場所によってまちまちだった。ここに集約して常に同じ状態へ
   揃える。いずれも現在の DOM を読み直して表示を作り直すだけなので、
   余分に呼んでも副作用は無い */
function afterBodyEdit() {
  markDirty();
  recordHistoryAfterInput();
  renderCharCount();
  rebuildLineMarksDebounced();
  updateCursorHighlight();
  updateFormatToolbarState();
}

async function openMemo(id) {
  const m = await Store.get('memos', id);
  if (!m) { toast('メモが見つかりません', 'error'); return; }
  closeFindBar();
  state.currentId = id;
  state.dirty = false;
  state.savedAt = m.updatedAt;
  state.currentMark = markById(m.mark) ? m.mark : null;
  refs.titleInput.value = m.title || '';
  refs.tagsInput.value  = (m.tags || []).join(', ');
  showSheet();
  renderEditorMeta(); renderList();
  await loadImages();
  await loadAttachments();
  deserializeBody(m.body || '');
  renderCharCount();
  resetHistory();
  savePref('lastMemoId', id);
  /* 前回の編集が保存されないまま残っていれば、ここで復元を尋ねる */
  await maybeRestoreDraft(id);
}
function newMemo() {
  closeFindBar();
  state.currentId = null;
  state.dirty = false;
  state.savedAt = null;
  state.currentMark = null;
  refs.titleInput.value = '';
  refs.tagsInput.value = '';
  refs.bodyInput.innerHTML = '';
  rebuildLineMarks();
  showSheet();
  renderEditorMeta(); renderCharCount(); renderList();
  loadImages();
  loadAttachments();
  resetHistory();
  refs.titleInput.focus();
}
/* 保存できたら true、失敗したら false を返す（例外は投げない）。
   呼び出し側は戻り値を見て「保存できていないのに画面を切り替える」ことを
   避けられる。
   serialized() で直列化しているのは、新規メモの保存が終わる前に 2 回目の
   保存が始まると、どちらも state.currentId === null を見て Store.add し、
   同じメモが二重に作られてしまうため（保存ボタンのダブルクリックや
   Ctrl+S のキーリピートで実際に起きる）。2 回目は 1 回目の完了を待つので、
   その時点では id が確定していて更新（put）になる。 */
const saveCurrent = serialized(async function saveCurrentMemo(silent = false) {
  const now = Date.now();
  const f = collectFields();
  const wasNew = state.currentId === null;
  try {
    if (state.currentId === null) {
      const id = await Store.add('memos', { ...f, createdAt: now, updatedAt: now, imageCount: 0, fileCount: 0, deletedAt: null });
      state.currentId = id;
      savePref('lastMemoId', id);
    } else {
      const old = await Store.get('memos', state.currentId);
      await Store.put('memos', { ...old, ...f, updatedAt: now });
    }
  } catch (err) {
    console.error(err);
    toast('メモを保存できませんでした。保存領域の空き容量やブラウザの設定を確認してください', 'error');
    return false;
  }
  state.dirty = false;
  state.savedAt = now;
  /* 保存できたので、退避しておいた下書きは用済み */
  await clearDraft('new');
  if (!wasNew) await clearDraftFor(state.currentId);
  await refreshMemos();
  renderList(); renderStamps(); renderSaveState();
  if (!silent) toast('メモを保存しました', 'success');
  return true;
});
/* 削除は「ゴミ箱へ移動」にして、取り消せるようにする。完全削除は
   ゴミ箱の中から行う（trash.js） */
async function deleteCurrent() {
  if (state.currentId === null) {
    const ok = await confirmDialog({
      title: 'メモの破棄',
      message: 'このメモはまだ保存されていません。入力内容を破棄しますか？',
      okLabel: '破棄する',
    });
    if (ok) { await clearDraft('new'); showWelcome(); renderList(); }
    return;
  }
  const m = state.memos.find(x => x.id === state.currentId);
  const ok = await confirmDialog({
    title: 'メモの削除',
    message: `「${m?.title || '無題のメモ'}」をゴミ箱へ移動します。\n` +
      `ゴミ箱からは ${TRASH_KEEP_DAYS} 日以内であれば元に戻せます（画像・添付も一緒に残ります）。`,
    okLabel: 'ゴミ箱へ移動',
  });
  if (!ok) return;
  const id = state.currentId;
  if (!(await moveMemoToTrash(id))) return;
  showWelcome();
  renderList();
  toast('メモをゴミ箱へ移動しました', 'success', { label: '元に戻す', onClick: () => restoreMemo(id) });
}
/* 未保存変更ガード（エラー防止） */
async function guardDirty() {
  if (!state.dirty) return true;
  const v = await dialog({
    title: '未保存の変更',
    message: '編集中のメモに未保存の変更があります。どうしますか？',
    buttons: [
      { label: 'キャンセル', value: 'cancel' },
      { label: '破棄して続行', value: 'discard', kind: 'danger' },
      { label: '保存して続行', value: 'save', kind: 'primary' },
    ],
  });
  /* 保存に失敗したときは true を返さない。編集内容を残したまま
     画面を切り替えてしまうと、そのまま消えてしまうため */
  if (v === 'save')    return await saveCurrent(true);
  if (v === 'discard') {
    state.dirty = false;
    /* 破棄を選んだのだから、退避してあった下書きも残さない */
    await clearDraftFor(state.currentId);
    if (state.currentId === null) await clearDraft('new');
    return true;
  }
  return false;
}

/* ============================================================
   画像パネルの開閉
   ============================================================ */
/* 画面が狭いときは画像パネルを自動的に畳む。
   3カラムのまま列幅だけが縮むと編集列が 250px 前後まで潰れ、フッターが
   はみ出して保存ボタンに届かなくなるため。利用者が選んだ開閉状態
   (state.panelOpen) は書き換えず、広い画面に戻したときに復帰させる */
/* しきい値はサイドバー(336px)＋画像パネル(352px)を引いた残りが編集に
   使える幅になることから決めている。1150px を下回ると編集列が 460px を
   切り、ツールバーとフッターが何段にも折り返し始める */
const NARROW_PANEL_MQ = typeof matchMedia === 'function'
  ? matchMedia('(max-width: 1150px)') : null;
let panelAutoClosed = false;

function panelEffectivelyOpen() {
  return state.panelOpen && !panelAutoClosed;
}
function applyPanelState() {
  const open = panelEffectivelyOpen();
  refs.app.classList.toggle('panel-closed', !open);
  refs.btnPanelOpen.hidden = open;
}
function togglePanel(open) {
  state.panelOpen = open;
  /* 手動操作は自動折りたたみより優先する（狭い画面でも開けるように） */
  panelAutoClosed = false;
  applyPanelState();
  savePref('panelOpen', open);
}
/* 幅の変化に追従する。狭くなった時点で自動的に畳み、広がったら戻す */
function syncPanelToWidth() {
  if (!NARROW_PANEL_MQ) return;
  const narrow = NARROW_PANEL_MQ.matches;
  if (narrow && !panelAutoClosed) {
    panelAutoClosed = true;
    applyPanelState();
  } else if (!narrow && panelAutoClosed) {
    panelAutoClosed = false;
    applyPanelState();
  }
}
/* ============================================================
   画面が狭いときのタブ切替（一覧／編集／画像・添付）
   ============================================================ */
const MOBILE_MQ = typeof matchMedia === 'function' ? matchMedia('(max-width: 768px)') : null;
const isMobileLayout = () => !!(MOBILE_MQ && MOBILE_MQ.matches);

function applyMobileTab() {
  refs.app.dataset.mtab = state.mobileTab;
  for (const b of $$('.mtab', refs.mobileTabs)) {
    b.classList.toggle('active', b.dataset.tab === state.mobileTab);
  }
}
function setMobileTab(tab) {
  state.mobileTab = tab;
  applyMobileTab();
}
/* メモを開いたら編集タブへ移る。狭い画面では、開いた直後に本文が見えないと
   何が起きたのか分からないため */
function focusEditorTab() {
  if (isMobileLayout()) setMobileTab('editor');
}
function setupMobileTabs() {
  applyMobileTab();
  refs.mobileTabs.addEventListener('click', e => {
    const btn = e.target.closest('.mtab');
    if (btn) setMobileTab(btn.dataset.tab);
  });
}

function setupResponsivePanel() {
  if (!NARROW_PANEL_MQ) return;
  syncPanelToWidth();
  const onChange = () => {
    /* 幅の帯をまたいだときは、自動制御の状態を作り直す */
    panelAutoClosed = false;
    syncPanelToWidth();
  };
  if (NARROW_PANEL_MQ.addEventListener) NARROW_PANEL_MQ.addEventListener('change', onChange);
  else NARROW_PANEL_MQ.addListener(onChange);
}
function applySidebarState() {
  refs.app.classList.toggle('sidebar-closed', !state.sidebarOpen);
  refs.btnToggleSidebar.title = state.sidebarOpen ? 'サイドバーを閉じる' : 'サイドバーを開く';
  refs.btnSidebarOpen.hidden = state.sidebarOpen;
}
function applyGroupByDateState() {
  refs.btnGroupByDate.classList.toggle('active', state.groupByDate);
  refs.btnGroupByDate.title = state.groupByDate ? 'グループ化を解除' : '日付でグループ化';
  refs.groupFieldSelect.hidden = !state.groupByDate;
  refs.groupFieldSelect.value = state.groupDateField;
}
function applyImageFilterState() {
  refs.btnImageFilter.classList.toggle('active', state.imageOnly);
  refs.btnImageFilter.title = state.imageOnly ? '画像ありのメモのみ表示中（クリックで解除）' : '画像ありのメモのみ表示';
  refs.btnFileFilter.classList.toggle('active', state.fileOnly);
  refs.btnFileFilter.title = state.fileOnly ? '添付ありのメモのみ表示中（クリックで解除）' : '添付ファイルありのメモのみ表示';
}
function applySortState() {
  const asc = state.sortDir === 'asc';
  refs.sortKeySelect.value = state.sortKey;
  refs.btnSortOrder.innerHTML = asc
    ? '<i class="fa-solid fa-arrow-up-wide-short"></i> 昇順'
    : '<i class="fa-solid fa-arrow-down-wide-short"></i> 降順';
  const byTitle = state.sortKey === 'title';
  refs.btnSortOrder.title = byTitle
    ? (asc ? 'タイトルの昇順（クリックで降順に切替）' : 'タイトルの降順（クリックで昇順に切替）')
    : (asc ? '古い順に表示中（クリックで新しい順に切替）' : '新しい順に表示中（クリックで古い順に切替）');
}
function applySearchScopeState() {
  $$('.scope-chip', refs.searchScope).forEach(btn => {
    btn.classList.toggle('active', !!state.searchScope[btn.dataset.scope]);
  });
}
function toggleSidebar() {
  state.sidebarOpen = !state.sidebarOpen;
  applySidebarState();
  savePref('sidebarOpen', state.sidebarOpen);
}
