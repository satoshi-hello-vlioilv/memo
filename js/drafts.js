/* ============================================================
   drafts.js
   自動保存（下書き）：編集中の内容を一定間隔で退避し、次回起動時や
   メモを開き直したときに復元できるようにする
   ------------------------------------------------------------
   保存ボタン／Ctrl+S を押すまでの間にタブがクラッシュしたり、ブラウザが
   終了したりすると書きかけが消えてしまう。drafts ストアへ別に書き出して
   おき、保存が済んだ時点で消す。
   ============================================================ */
'use strict';

const DRAFT_SAVE_MS   = 2500;   /* 最後の入力からこれだけ経ったら退避する */
const DRAFT_KEEP_DAYS = 30;     /* 放置された下書きの保持期間 */

/* 保存済みメモは 'memo:<id>'、未保存の新規メモは 'new' で区別する */
const draftKeyFor = id => (id === null || id === undefined) ? 'new' : `memo:${id}`;
/* 一覧に「未保存の変更が残っています」の印を出すか。編集中のメモは
   エディタ側に保存状態が出ているため対象外にする */
const hasDraftFor = memo => memo.id !== state.currentId && state.drafts.has(draftKeyFor(memo.id));

async function refreshDrafts() {
  try {
    const rows = await Store.getAll('drafts');
    state.drafts = new Map(rows.map(r => [r.key, r]));
  } catch { state.drafts = new Map(); }
}

/* 編集中の内容を下書きとして書き出す。保存（Store.put）はメモ本体とは
   別ストアなので、メモの updatedAt は動かない */
async function saveDraftNow() {
  if (refs.sheet.hidden || !state.dirty) return;
  const key = draftKeyFor(state.currentId);
  const draft = {
    key,
    memoId: state.currentId,
    title: refs.titleInput.value,
    tags : refs.tagsInput.value,
    body : serializeBody(),
    mark : state.currentMark,
    savedAt: Date.now(),
  };
  try {
    await Store.put('drafts', draft);
    state.drafts.set(key, draft);
  } catch (err) {
    console.error(err);   /* 退避に失敗しても編集は続けられるよう黙って諦める */
  }
}
const saveDraftDebounced = debounce(saveDraftNow, DRAFT_SAVE_MS);
/* 入力のたびに呼ばれる入口（markDirty から） */
function scheduleDraftSave() { saveDraftDebounced(); }

async function clearDraft(key) {
  if (!state.drafts.has(key)) return;
  state.drafts.delete(key);
  try { await Store.del('drafts', key); } catch { /* 消せなくても致命的ではない */ }
}
/* 保存・破棄・削除で「もう下書きは要らない」となったときに呼ぶ */
async function clearDraftFor(id) { await clearDraft(draftKeyFor(id)); }

/* 下書きの内容を編集画面へ流し込む（未保存の状態として復元する） */
function applyDraft(draft) {
  refs.titleInput.value = draft.title || '';
  refs.tagsInput.value  = draft.tags || '';
  state.currentMark = markById(draft.mark) ? draft.mark : null;
  deserializeBody(draft.body || '');
  renderEditorMeta(); renderCharCount();
  state.dirty = true;
  renderSaveState();
  resetHistory();
}

/* メモを開いたときに下書きが残っていれば復元を尋ねる */
async function maybeRestoreDraft(memoId) {
  const key = draftKeyFor(memoId);
  const draft = state.drafts.get(key);
  if (!draft) return;
  const v = await dialog({
    title: '未保存の変更が残っています',
    message: `このメモには保存されていない変更が残っています（自動保存 ${fmtDateTime(draft.savedAt)}）。\n復元すると、保存済みの内容の代わりにその内容を編集できます。`,
    buttons: [
      { label: '破棄する', value: 'discard', kind: 'danger' },
      { label: '復元する', value: 'restore', kind: 'primary' },
    ],
  });
  if (v === 'restore') {
    applyDraft(draft);
    toast('未保存の変更を復元しました（保存で確定します）', 'success');
  } else {
    await clearDraft(key);
    renderList();
  }
}

/* 起動時：未保存のまま終了した新規メモがあれば復元を尋ねる */
async function maybeRestoreNewDraft() {
  const draft = state.drafts.get('new');
  if (!draft) return false;
  const preview = (draft.title || stripMarkers(draft.body) || '（内容なし）').slice(0, 40);
  const v = await dialog({
    title: '作成中のメモが残っています',
    message: `保存されていない新規メモが残っています（自動保存 ${fmtDateTime(draft.savedAt)}）。\n「${preview}」\n復元しますか？`,
    buttons: [
      { label: 'あとで', value: 'later' },
      { label: '破棄する', value: 'discard', kind: 'danger' },
      { label: '復元する', value: 'restore', kind: 'primary' },
    ],
  });
  if (v === 'restore') {
    newMemo();
    applyDraft(draft);
    toast('作成中のメモを復元しました（保存で確定します）', 'success');
    return true;
  }
  if (v === 'discard') { await clearDraft('new'); renderList(); }
  return false;
}

/* 起動時の掃除：消えたメモの下書きと、長く放置された下書きを取り除く */
async function purgeStaleDrafts() {
  const limit = Date.now() - DRAFT_KEEP_DAYS * 86400000;
  const ids = new Set(state.memos.map(m => m.id));
  for (const [key, draft] of [...state.drafts]) {
    const orphan = key !== 'new' && !ids.has(draft.memoId);
    if (orphan || draft.savedAt < limit) await clearDraft(key);
  }
}
