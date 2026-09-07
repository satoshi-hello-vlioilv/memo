/* ============================================================
   main.js
   イベント結線とアプリの初期化。読み込み順の都合で最後に置く
   ============================================================ */
'use strict';

/* ============================================================
   イベント結線
   ============================================================ */
function bindEvents() {
  /* --- トップバー アクション --- */
  refs.btnToggleSidebar.addEventListener('click', toggleSidebar);
  refs.btnExport.addEventListener('click', exportData);
  refs.btnImport.addEventListener('click', () => refs.fileImport.click());
  refs.fileImport.addEventListener('change', (e) => importData(e.target.files[0]));

  /* --- 検索・フィルタ --- */
  const onSearch = debounce(() => {
    state.query = refs.searchInput.value;
    refs.searchClear.hidden = state.query.length === 0;
    renderList();
  }, 140);
  refs.searchInput.addEventListener('input', () => {
    onSearch();
    renderSearchSuggest(refs.searchInput.value);
  });
  refs.searchInput.addEventListener('focus', () => renderSearchSuggest(refs.searchInput.value));
  refs.searchInput.addEventListener('blur', () => addToHistory(refs.searchInput.value));
  refs.searchInput.addEventListener('keydown', e => {
    if (refs.searchSuggest.hidden) {
      if (e.key === 'Enter') addToHistory(refs.searchInput.value);
      return;
    }
    const items = $$('.search-suggest-item', refs.searchSuggest);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      suggestIndex = Math.min(suggestIndex + 1, items.length - 1);
      updateSuggestActive(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      suggestIndex = Math.max(suggestIndex - 1, -1);
      updateSuggestActive(items);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (suggestIndex >= 0 && items[suggestIndex]) {
        activateSearchSuggest(items[suggestIndex]);
      } else {
        addToHistory(refs.searchInput.value);
        refs.searchSuggest.hidden = true;
      }
    } else if (e.key === 'Escape') {
      refs.searchSuggest.hidden = true;
      suggestIndex = -1;
    }
  });
  refs.searchSuggest.addEventListener('mousedown', e => e.preventDefault());
  refs.searchSuggest.addEventListener('click', e => {
    const delBtn = e.target.closest('.ssi-del');
    if (delBtn) { e.stopPropagation(); removeHistoryEntry(delBtn.dataset.del); return; }
    const item = e.target.closest('.search-suggest-item');
    if (item) { activateSearchSuggest(item); return; }
    refs.searchSuggest.hidden = true;   /* 見出し等の余白クリックでも閉じる（下の要素を覆ったままにしない） */
  });
  refs.searchClear.addEventListener('click', () => {
    refs.searchInput.value = '';
    state.query = '';
    refs.searchClear.hidden = true;
    renderList();
    refs.searchInput.focus();
  });
  refs.searchScope.addEventListener('click', e => {
    const btn = e.target.closest('.scope-chip');
    if (!btn) return;
    const key = btn.dataset.scope;
    const next = { ...state.searchScope, [key]: !state.searchScope[key] };
    if (!next.title && !next.tags && !next.body) {
      toast('検索対象は1つ以上選択してください', 'info');
      return;
    }
    state.searchScope = next;
    state.query = refs.searchInput.value;   /* デバウンス待ちで未反映の入力値も取り込んでから再検索する */
    refs.searchClear.hidden = state.query.length === 0;
    applySearchScopeState();
    savePref('searchScope', state.searchScope);
    renderList();
  });
  refs.tagBar.addEventListener('click', e => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    const tag = chip.dataset.tag;
    state.tagFilter = state.tagFilter === tag ? null : tag;
    renderList();
  });

  /* --- 目印（付箋）：一覧の絞り込み／編集中メモへの付け外し --- */
  refs.markBar.addEventListener('click', e => {
    const chip = e.target.closest('.mark-chip');
    if (!chip) return;
    const mk = chip.dataset.mark;
    state.markFilter = state.markFilter === mk ? null : mk;
    renderList();
  });
  refs.markPicker.addEventListener('click', e => {
    if (e.target.closest('.mark-clear')) { setCurrentMark(null); return; }
    const btn = e.target.closest('.mark-btn');
    if (btn) setCurrentMark(btn.dataset.mark);
  });

  /* --- 一覧 → グループ折りたたみ／メモを開く --- */
  refs.memoList.addEventListener('click', async e => {
    /* 「他 N 件を表示」は折りたたみ中にのみ出るため、見出しと同じトグルで
       そのまま展開になる */
    const toggle = e.target.closest('.date-group-header, .group-rest');
    if (toggle) {
      const date = toggle.dataset.date;
      if (state.expandedGroups.has(date)) state.expandedGroups.delete(date);
      else state.expandedGroups.add(date);
      renderList();
      return;
    }
    const item = e.target.closest('.memo-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    if (id === state.currentId) return;
    if (await guardDirty()) openMemo(id);
  });

  /* --- 新規・管理画面（フォーマット／タグ） --- */
  refs.btnNew.addEventListener('click', async () => { if (await guardDirty()) newMemo(); });
  refs.btnWelcomeNew.addEventListener('click', () => newMemo());
  refs.btnManage.addEventListener('click', () => openManageModal('formats'));
  refs.btnWelcomeFmt.addEventListener('click', () => openManageModal('formats'));
  refs.mgmtNavFormats.addEventListener('click', () => switchMgmtSection('formats'));
  refs.mgmtNavTags.addEventListener('click', () => switchMgmtSection('tags'));
  refs.mgmtClose.addEventListener('click', () => { refs.manageModal.hidden = true; });
  refs.manageModal.addEventListener('click', e => {
    if (e.target === refs.manageModal && backdropClickAllowed(refs.manageModal)) refs.manageModal.hidden = true;
  });

  /* --- タグ管理 --- */
  refs.tmAdd.addEventListener('click', async () => {
    const name = refs.tmInput.value.trim();
    if (!name) return;
    if (!state.tagsMaster.includes(name)) {
      await Store.put('tags', { name });
      await refreshTagsMaster();
      toast('タグを登録しました', 'success');
    }
    refs.tmInput.value = ''; refs.tmInput.focus();
  });
  refs.tmInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); refs.tmAdd.click(); }
  });
  refs.tmList.addEventListener('click', async e => {
    const btn = e.target.closest('.tm-del');
    if (!btn) return;
    const ok = await confirmDialog({
      title: 'タグの削除',
      message: `マスタから「${btn.dataset.tag}」を削除しますか？\n※既存のメモからは削除されません。`,
      okLabel: '削除',
    });
    if (!ok) return;
    await Store.del('tags', btn.dataset.tag);
    await refreshTagsMaster();
    toast('タグを削除しました', 'success');
  });

  /* --- 編集（変更検知）・タグサジェスト --- */
  refs.titleInput.addEventListener('input', markDirty);
  refs.tagsInput.addEventListener('input', () => { markDirty(); renderTagsPreview(); updateTagSuggest(); });
  refs.tagsInput.addEventListener('keydown', e => { if (e.key === 'Escape') refs.tagsSuggest.hidden = true; });
  refs.tagsSuggest.addEventListener('click', e => {
    const item = e.target.closest('.sg-item');
    if (!item) return;
    const parts = refs.tagsInput.value.split(/[,、]\s*/);
    parts.pop();
    parts.push(item.dataset.tag);
    refs.tagsInput.value = parts.join(', ') + (parts.length > 0 ? ', ' : '');
    refs.tagsSuggest.hidden = true;
    markDirty(); renderTagsPreview(); refs.tagsInput.focus();
  });
  const searchBoxEl = refs.searchInput.closest('.search-box');
  document.addEventListener('click', e => {
    if (!refs.tagsSuggest.contains(e.target) && e.target !== refs.tagsInput) {
      refs.tagsSuggest.hidden = true;
    }
    /* searchClear など .search-box 内のクリックでは閉じない
       （clear ボタンの focus() 呼び出しで再表示された直後に、
       同じクリックのバブリングで閉じてしまうのを防ぐ） */
    if (!searchBoxEl.contains(e.target)) {
      refs.searchSuggest.hidden = true;
      suggestIndex = -1;
    }
  });

  refs.bodyInput.addEventListener('input', afterBodyEdit);
  refs.bodyInput.addEventListener('keydown', e => {
    /* Enter などブラウザ既定の編集操作は、キャレット直後にある要素を
       「続きの内容」とみなして分割構造に巻き込むことがある。カーソル行
       ハイライトは表示専用のオーバーレイなので、キー処理の前に一旦取り除いて
       おく（input/selectionchange のタイミングで直後に作り直される）。 */
    refs.bodyInput.querySelector('.current-line-hl')?.remove();
    if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey) {
      e.preventDefault();
      insertBodyText('\t');
    }
  });
  /* ホバー中の画像のコントロールバー位置を実測して追従させる */
  refs.bodyInput.addEventListener('mouseover', e => {
    const wrap = e.target.closest('.body-img');
    if (wrap) positionImgCtrl(wrap);
  });
  refs.bodyInput.addEventListener('scroll', () => {
    const hovered = refs.bodyInput.querySelector('.body-img:hover');
    if (hovered) positionImgCtrl(hovered);
    updateCursorHighlight();
  }, { passive: true });
  /* カーソル位置ハイライト: フォーカス中は選択範囲の変化を全て追従させる */
  refs.bodyInput.addEventListener('focus', () => { updateCursorHighlight(); updateFormatToolbarState(); });
  refs.bodyInput.addEventListener('blur', () => {
    const hl = refs.bodyInput.querySelector('.current-line-hl');
    if (hl) hl.remove();
  });
  document.addEventListener('selectionchange', () => { updateCursorHighlight(); updateFormatToolbarState(); });
  /* 画像コントロールのクリックでキャレットが動かないよう防止／サイズ変更の開始
     ただし <select> は mousedown の既定動作(ドロップダウンを開く)を止めてしまうと
     クリックしても選択肢が開かなくなるため、ここでは対象から除外する */
  refs.bodyInput.addEventListener('mousedown', e => {
    const resizeHandle = e.target.closest('.body-img__resize');
    if (resizeHandle) {
      e.preventDefault();
      const wrap = resizeHandle.closest('.body-img');
      if (wrap) startImageResize(wrap, e);
      return;
    }
    if (e.target.closest('.body-img__ctrl') && !e.target.closest('.body-img__size')) e.preventDefault();
  });
  refs.bodyInput.addEventListener('dblclick', e => {
    const wrap = e.target.closest('.body-img');
    if (!wrap || e.target.closest('.body-img__ctrl') || e.target.closest('.body-img__resize')) return;
    e.preventDefault();
    openInlineImage(wrap);
  });
  refs.bodyInput.addEventListener('click', e => {
    /* 編集領域内のリンクは、通常クリックではキャレット移動を優先し、
       Ctrl(⌘)+クリックで開く */
    const link = e.target.closest('a[data-fmt="link"]');
    if (link && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      openLinkAt(link);
      return;
    }
    const zoomBtn = e.target.closest('.body-img__zoom');
    if (zoomBtn) {
      const wrap = zoomBtn.closest('.body-img');
      if (wrap) openInlineImage(wrap);
      return;
    }
    const copyBtn = e.target.closest('.body-img__copy');
    if (copyBtn) {
      const wrap = copyBtn.closest('.body-img');
      if (wrap) copyInlineImage(wrap);
      return;
    }
    const posBtn = e.target.closest('.body-img__pos');
    if (posBtn) {
      const wrap = posBtn.closest('.body-img');
      if (!wrap) return;
      wrap.dataset.align = posBtn.dataset.a;
      $$('.body-img__pos', wrap).forEach(b => b.classList.toggle('on', b.dataset.a === posBtn.dataset.a));
      markDirty();
      return;
    }
    const delBtn = e.target.closest('.body-img__del');
    if (delBtn) {
      const wrap = delBtn.closest('.body-img');
      if (wrap) { wrap.remove(); afterBodyEdit(); }
    }
  });
  refs.bodyInput.addEventListener('change', e => {
    const sel = e.target.closest('.body-img__size');
    if (sel) {
      const wrap = sel.closest('.body-img');
      if (wrap) {
        wrap.dataset.size = sel.value;
        const imgEl = wrap.querySelector('.body-img__img');
        if (imgEl) imgEl.style.width = '';   /* プリセット選択時はカスタム幅を解除 */
        afterBodyEdit();
      }
    }
  });
  /* --- 本文内画像のドラッグ移動（挿入位置をゴーストで可視化） --- */
  refs.bodyInput.addEventListener('dragstart', e => {
    const wrap = e.target.closest('.body-img');
    if (!wrap) return;                                  /* 画像以外は通常動作 */
    if (e.target.closest('.body-img__ctrl') || e.target.closest('.body-img__resize')) { e.preventDefault(); return; }
    draggedImg = wrap;
    e.dataTransfer.effectAllowed = 'move';
    /* ファイルとして扱われないよう内部用データのみ設定 */
    try { e.dataTransfer.setData('application/x-bodyimg', String(wrap.dataset.id)); } catch {}
    /* ドラッグ画像の確定後に元要素を半透明化（スナップショットには影響させない） */
    setTimeout(() => { if (draggedImg) draggedImg.classList.add('dragging'); }, 0);
  });
  refs.bodyInput.addEventListener('dragover', e => {
    if (!draggedImg) return;                            /* 本文内画像の移動時のみ許可 */
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    showDropCaret(e.clientX, e.clientY);                /* 挿入予定位置を可視化 */
  });
  refs.bodyInput.addEventListener('dragleave', e => {
    if (!draggedImg) return;
    if (!refs.bodyInput.contains(e.relatedTarget)) hideDropCaret();
  });
  refs.bodyInput.addEventListener('drop', e => {
    if (!draggedImg) return;
    e.preventDefault();
    const range = caretRangeFromPoint(e.clientX, e.clientY);
    if (range && !draggedImg.contains(range.startContainer)) {
      range.insertNode(draggedImg);
    } else {
      refs.bodyInput.appendChild(draggedImg);
    }
    ensureTrailingEditable();
    placeCaretAfter(draggedImg);
    endImgDrag();
    afterBodyEdit();
  });
  document.addEventListener('dragend', endImgDrag);

  /* --- 本文エディタの右クリックメニュー（執筆補助） --- */
  refs.bodyInput.addEventListener('contextmenu', e => {
    e.preventDefault();
    openCtxMenu(e.clientX, e.clientY);
  });
  refs.ctxMenu.addEventListener('mousedown', e => e.preventDefault());   /* 選択・フォーカス維持 */
  refs.ctxMenu.addEventListener('click', e => {
    /* 折りたたみの見出しはメニューを閉じずに開閉だけ切り替える */
    const fold = e.target.closest('.ctx-fold');
    if (fold) {
      const key = fold.dataset.fold;
      if (ctxOpenSections.has(key)) ctxOpenSections.delete(key);
      else ctxOpenSections.add(key);
      const rect = refs.ctxMenu.getBoundingClientRect();
      renderCtxMenu();
      positionCtxMenu(rect.left, rect.top);
      return;
    }
    const btn = e.target.closest('.ctx-item, .ctx-size, .ctx-swatch');
    if (!btn || btn.disabled) return;
    runCtxAction(btn.dataset.act);
  });
  window.addEventListener('mousedown', e => {
    if (!refs.ctxMenu.hidden && !refs.ctxMenu.contains(e.target)) hideCtxMenu();
  });
  window.addEventListener('resize', hideCtxMenu);
  refs.bodyInput.addEventListener('scroll', hideCtxMenu);

  /* クリップボード画像の貼り付け（bodyInput フォーカス外でも動作） */
  window.addEventListener('paste', e => {
    if (refs.sheet.hidden) return;
    const items = [...(e.clipboardData?.items || [])];
    const imageFiles = items
      .filter(it => it.kind === 'file' && it.type.startsWith('image/'))
      .map(it => it.getAsFile()).filter(Boolean);
    if (imageFiles.length > 0) {
      e.preventDefault();
      addImageFiles(imageFiles, 'clipboard');
    }
  });

  /* --- 保存・削除・コピー --- */
  refs.btnSave.addEventListener('click', () => saveCurrent());
  refs.btnDelete.addEventListener('click', deleteCurrent);
  refs.btnCopyText.addEventListener('click', copyMemoText);

  /* --- フォーマット適用 --- */
  refs.btnApplyFormat.addEventListener('click', applyFormat);

  /* --- 改行マークの表示切替 --- */
  refs.btnShowMarks.addEventListener('click', () => {
    state.showLineMarks = !state.showLineMarks;
    applyShowLineMarksState();
    savePref('showLineMarks', state.showLineMarks);
    rebuildLineMarks();
  });

  /* --- 書式設定(太字・斜体・文字サイズ・文字色・ハイライト) ---
     select/color 系コントロールはクリックした瞬間に本文のフォーカス・選択が
     失われるため、開く前(mousedown)に選択範囲を退避しておく */
  refs.btnBold.addEventListener('mousedown', captureBodySelection);
  refs.btnBold.addEventListener('click', toggleBold);
  refs.btnItalic.addEventListener('mousedown', captureBodySelection);
  refs.btnItalic.addEventListener('click', toggleItalic);
  refs.fontSizeSelect.addEventListener('mousedown', captureBodySelection);
  refs.fontSizeSelect.addEventListener('change', () => {
    const val = refs.fontSizeSelect.value;
    refs.fontSizeSelect.value = '';
    if (!val) return;
    if (val === 'reset') { clearFormatType('size', '選択範囲に文字サイズは設定されていません'); return; }
    applyInlineFormat(() => createFormatElement('size', val), 'size');
  });
  refs.textColorInput.addEventListener('mousedown', captureBodySelection);
  refs.textColorInput.addEventListener('change', () => {
    applyInlineFormat(() => createFormatElement('color', refs.textColorInput.value), 'color');
  });
  refs.btnClearTextColor.addEventListener('mousedown', captureBodySelection);
  refs.btnClearTextColor.addEventListener('click', () => clearFormatType('color', '選択範囲に文字色は設定されていません'));
  refs.highlightColorInput.addEventListener('mousedown', captureBodySelection);
  refs.highlightColorInput.addEventListener('change', () => {
    applyInlineFormat(() => createFormatElement('hl', refs.highlightColorInput.value), 'hl');
  });
  refs.btnClearHighlight.addEventListener('mousedown', captureBodySelection);
  refs.btnClearHighlight.addEventListener('click', () => clearFormatType('hl', '選択範囲にハイライトは設定されていません'));
  refs.btnClearFormat.addEventListener('mousedown', captureBodySelection);
  refs.btnClearFormat.addEventListener('click', resetFormatToDefault);

  /* --- 画像 --- */
  refs.btnAddImage.addEventListener('click', () => refs.fileInput.click());
  refs.fileInput.addEventListener('change', () => {
    if (refs.fileInput.files.length > 0) addImageFiles(refs.fileInput.files);
    refs.fileInput.value = '';
  });
  refs.thumbGrid.addEventListener('click', e => {
    const fig = e.target.closest('.thumb');
    if (!fig) return;
    const id = Number(fig.dataset.id);
    if (e.target.closest('.t-del'))    { removeImage(id); return; }
    if (e.target.closest('.t-insert')) { insertImageRef(id); return; }
    lbShow(Number(fig.dataset.index));
  });
  refs.thumbSize.addEventListener('input', () => {
    state.thumbSize = Number(refs.thumbSize.value);
    applyThumbSize();
    savePrefDebounced('thumbSize', state.thumbSize);
  });
  /* --- 画像パネルの幅をドラッグで調整 --- */
  refs.imgPanelResizer.addEventListener('mousedown', e => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = refs.imgPanel.getBoundingClientRect().width;
    document.body.classList.add('resizing-imgpanel');
    const onMove = ev => {
      /* 上下限でクランプしてから state へ入れる。生の値のままだと、限界を
         越えて動かしたときに範囲外の幅（負の値など）がそのまま state へ入り、
         ドラッグ終了時にその値が設定として保存されてしまう */
      state.imgPanelWidth = clampImgPanelWidth(Math.round(startWidth - (ev.clientX - startX)));
      applyImgPanelWidth();
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.classList.remove('resizing-imgpanel');
      savePref('imgPanelWidth', state.imgPanelWidth);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  });
  window.addEventListener('resize', applyImgPanelWidth);
  refs.btnPanelToggle.addEventListener('click', () => togglePanel(false));
  refs.btnPanelOpen.addEventListener('click', () => togglePanel(true));
  refs.btnSidebarClose.addEventListener('click', toggleSidebar);
  refs.btnSidebarOpen.addEventListener('click', toggleSidebar);

  refs.btnGroupByDate.addEventListener('click', () => {
    state.groupByDate = !state.groupByDate;
    state.expandedGroups.clear();
    applyGroupByDateState();
    savePref('groupByDate', state.groupByDate);
    renderList();
  });
  refs.btnImageFilter.addEventListener('click', () => {
    state.imageOnly = !state.imageOnly;
    applyImageFilterState();
    savePref('imageOnly', state.imageOnly);
    renderList();
  });
  refs.groupFieldSelect.addEventListener('change', () => {
    state.groupDateField = refs.groupFieldSelect.value;
    state.expandedGroups.clear();
    savePref('groupDateField', state.groupDateField);
    renderList();
  });
  refs.btnSortOrder.addEventListener('click', () => {
    state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
    applySortDirState();
    savePref('sortDir', state.sortDir);
    renderList();
  });

  /* --- フォーマット管理 --- */
  refs.fmNew.addEventListener('click', () => { fmLoad(null); refs.fmName.focus(); });
  refs.fmList.addEventListener('click', e => {
    const item = e.target.closest('.fm-item');
    if (item) fmLoad(Number(item.dataset.id));
  });
  refs.fmSave.addEventListener('click', fmSave);
  refs.fmDelete.addEventListener('click', fmDelete);
  $$('.token').forEach(btn => btn.addEventListener('click', () => {
    insertAtCaret(refs.fmContent, btn.dataset.token);
    refs.fmContent.focus();
  }));

  /* --- ダイアログ背面クリック --- */
  refs.dialogRoot.addEventListener('click', e => {
    if (e.target === refs.dialogRoot && backdropClickAllowed(refs.dialogRoot)) closeDialog('cancel');
  });

  /* --- キーボードショートカット --- */
  window.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!refs.ctxMenu.hidden) { hideCtxMenu(); return; }
      if (!refs.dialogRoot.hidden) { closeDialog('cancel'); return; }
      if (lb.open) { lbClose(); return; }
      if (!refs.manageModal.hidden) { refs.manageModal.hidden = true; return; }
      return;
    }
    if (lb.open) {
      if (e.key === 'ArrowLeft')  { lbShow(lb.index - 1); return; }
      if (e.key === 'ArrowRight') { lbShow(lb.index + 1); return; }
      if (e.key === '+' || e.key === '=') { lbZoomTo(lb.scale * 1.25); return; }
      if (e.key === '-') { lbZoomTo(lb.scale / 1.25); return; }
      if (e.key === '0') { lbFit(); return; }
      if (e.key === '1') { lb.scale = 1; lb.tx = 0; lb.ty = 0; lbApply(); return; }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      if (e.repeat) return;   /* 押しっぱなしのキーリピートで保存を繰り返さない */
      if (!refs.sheet.hidden) saveCurrent();
    }
  });

  /* --- ページ離脱時の未保存ガード --- */
  window.addEventListener('beforeunload', e => {
    if (state.dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

/* ============================================================
   初期化
   ============================================================ */
async function init() {
  collectRefs();
  refs.brandVersion.textContent = 'v' + APP_VERSION;
  refs.brandVersion.title = `バージョン ${APP_VERSION}`;
  if (!window.indexedDB) { refs.fatal.hidden = false; return; }
  try {
    db = await openDB();
  } catch {
    refs.fatal.hidden = false;
    refs.fatalMsg.innerHTML = 'データベースを開けませんでした。<br>シークレットモードや保存領域の制限が原因の場合があります。<br>通常モードのブラウザで再度お試しください。';
    return;
  }
  const prefs = await loadPrefs();
  refs.thumbSize.value = state.thumbSize;
  applyThumbSize();
  applyImgPanelWidth();
  applyPanelState();
  applySidebarState();
  applyGroupByDateState();
  applySortDirState();
  applySearchScopeState();
  applyImageFilterState();
  applyShowLineMarksState();

  await refreshMemos();
  await refreshFormats();
  await refreshTagsMaster();
  bindEvents();
  setupLightboxEvents();
  setupSpeech();
  setupDragDrop();
  renderList();

  /* 前回開いていたメモを復元 */
  const last = prefs.lastMemoId;
  if (typeof last === 'number' && state.memos.some(m => m.id === last)) {
    await openMemo(last);
  }
}
document.addEventListener('DOMContentLoaded', init);
