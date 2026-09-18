/* ============================================================
   body.js
   本文エディタ（contenteditable）：インライン画像、本文テキストと DOM の
   相互変換、改行マーク、カーソル行ハイライト
   ============================================================ */
'use strict';

/* ============================================================
   インライン画像（contenteditable 内）
   ============================================================ */
let draggedImg = null;   /* 本文内でドラッグ移動中の画像要素 */

/* 端をドラッグして自由変更した際の「カスタム」表示ラベル。
   実際の px 幅を添えることで、プリセットと何が違うのか一目で分かるようにする */
function customSizeLabel(px) {
  return Number.isFinite(px) ? `カスタム（${px}px）` : 'カスタム';
}

function createInlineImg(imgId, align, size) {
  const img = state.images.find(x => x.id === imgId);
  const wrap = document.createElement('span');
  wrap.className = 'body-img';
  wrap.contentEditable = 'false';
  wrap.dataset.id = imgId;
  wrap.dataset.align = align || 'c';
  const sizeVal = size || 'fit';
  wrap.dataset.size = sizeVal;
  wrap.setAttribute('draggable', 'true');
  wrap.title = 'ダブルクリックで拡大／ドラッグで移動／端をドラッグでサイズ変更';
  if (img) {
    const isPreset = sizeVal === 's' || sizeVal === 'm' || sizeVal === 'l' || sizeVal === 'fit';
    const customPx = isPreset ? null : parseInt(sizeVal, 10);
    const widthStyle = Number.isFinite(customPx) ? ` style="width:${customPx}px"` : '';
    const customLabel = Number.isFinite(customPx) ? customSizeLabel(customPx) : customSizeLabel();
    wrap.innerHTML =
      `<img src="${urlOf(img)}" class="body-img__img" alt="${esc(img.name)}" draggable="false"${widthStyle}>` +
      `<span class="body-img__resize" title="ドラッグでサイズ変更"></span>` +
      `<span class="body-img__ctrl">` +
        `<button class="body-img__zoom" title="拡大表示"><i class="fa-solid fa-magnifying-glass-plus"></i></button>` +
        `<button class="body-img__copy" title="画像をコピー"><i class="fa-regular fa-copy"></i></button>` +
        `<span class="body-img__div"></span>` +
        `<button class="body-img__pos${align==='l'?' on':''}" data-a="l" title="左寄せ"><i class="fa-solid fa-align-left"></i></button>` +
        `<button class="body-img__pos${align==='c'?' on':''}" data-a="c" title="中央"><i class="fa-solid fa-align-center"></i></button>` +
        `<button class="body-img__pos${align==='r'?' on':''}" data-a="r" title="右寄せ"><i class="fa-solid fa-align-right"></i></button>` +
        `<select class="body-img__size" title="画像の表示幅を選択（端をドラッグすると自由なサイズにもできます）">` +
          `<option value="fit"${sizeVal==='fit'?' selected':''}>幅に合わせる（エリア幅に自動追従）</option>` +
          `<option value="s"${sizeVal==='s'?' selected':''}>小（120px）</option>` +
          `<option value="m"${sizeVal==='m'?' selected':''}>中（240px）</option>` +
          `<option value="l"${sizeVal==='l'?' selected':''}>大（最大幅）</option>` +
          `<option value="custom" hidden${!isPreset?' selected':''}>${esc(customLabel)}</option>` +
        `</select>` +
        `<button class="body-img__del" title="削除"><i class="fa-solid fa-xmark"></i></button>` +
      `</span>`;
  } else {
    wrap.innerHTML = `<span class="body-img--missing">[img:${imgId} — 画像未登録]</span>`;
  }
  return wrap;
}

/* 改行マークとカーソル行ハイライトは本文の中身ではなく表示専用の
   オーバーレイ。保存・末尾判定・書式適用の対象から外すために使う */
const OVERLAY_SELECTOR = '.line-mark, .current-line-hl, .find-hit';
const OVERLAY_CLASSES = ['line-mark', 'current-line-hl', 'find-hit'];
const isOverlayEl = node => node.nodeType === Node.ELEMENT_NODE && !!node.classList &&
  OVERLAY_CLASSES.some(c => node.classList.contains(c));
/* チェックリストの □ のような、本文の一部ではない操作用の部品。
   保存にも書式適用にも含めない */
const isWidgetEl = node => node.nodeType === Node.ELEMENT_NODE && !!node.classList &&
  node.classList.contains('task-box');

function addTextWithBreaks(parent, text) {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) parent.appendChild(document.createElement('br'));
    if (lines[i]) parent.appendChild(document.createTextNode(lines[i]));
  }
}

/* リンクの URL を安全な形に整える。javascript: のような実行を伴うスキームは
   受け付けず、スキーム省略時は https:// を補う */
function safeLinkUrl(raw) {
  const url = String(raw ?? '').trim();
  if (!url) return null;
  if (/^(https?:|mailto:)/i.test(url)) return url;
  if (/^[\w.+-]+@[\w.-]+\.\w+$/.test(url)) return 'mailto:' + url;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return null;
  return 'https://' + url;
}

/* 本文で選べるフォント。保存データには id だけを書き出し、実際の
   font-family はこの表から引く。生の CSS を保存形式に入れないことで、
   壊れた・悪意のある指定がそのままスタイルに流れ込むのを防ぐ */
const BODY_FONTS = [
  { id: 'gothic', label: 'ゴシック体', css: '"Yu Gothic UI","Hiragino Sans","Noto Sans JP","Meiryo",sans-serif' },
  { id: 'mincho', label: '明朝体',     css: '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP","MS Mincho",serif' },
  { id: 'maru',   label: '丸ゴシック', css: '"Hiragino Maru Gothic ProN","Rounded Mplus 1c","Meiryo",sans-serif' },
  { id: 'mono',   label: '等幅',       css: '"Cascadia Code","Consolas","Courier New",monospace' },
  { id: 'serif',  label: 'Serif',      css: 'Georgia,"Times New Roman",serif' },
  { id: 'sans',   label: 'Sans',       css: 'Arial,Helvetica,sans-serif' },
];
const fontById = id => BODY_FONTS.find(f => f.id === id) || null;
/* 外部からコピーした font-family 文字列を、いちばん近い選択肢へ寄せる */
function fontIdFromCss(css) {
  const s = String(css || '').toLowerCase();
  if (!s) return null;
  /* 「sans-serif」は文字列として serif を含むが明朝ではない。先に置き換えて
     おかないと、ごく普通のサイトから貼り付けた文字が明朝体になってしまう */
  const t = s.replace(/sans-serif/g, 'sans');
  if (/mincho|serif jp|times|georgia|serif/.test(t)) {
    return /times|georgia/.test(t) && !/mincho|jp/.test(t) ? 'serif' : 'mincho';
  }
  if (/mono|consolas|courier|cascadia/.test(t)) return 'mono';
  if (/maru|rounded/.test(t)) return 'maru';
  if (/gothic|hiragino|noto sans|meiryo/.test(t)) return 'gothic';
  if (/arial|helvetica|sans/.test(t)) return 'sans';
  return null;
}

/* 書式タグ([b] [i] [size=N] [color=#hex] [hl=#hex] [font=id] [link=URL])に
   対応する要素を生成する。size/color/hl/font はインライン style で表現し、
   シリアライズ時に判別できるよう data-fmt 属性を付ける */
function createFormatElement(tag, param) {
  if (tag === 'b') return document.createElement('b');
  if (tag === 'i') return document.createElement('i');
  /* 段落書式（見出し・箇条書き・チェックリスト）。インライン要素のままで
     CSS の display:block により1行として見せる。行構造（<br>）を壊さずに
     書式を付け外しできるようにするため、ブロック要素にはしない */
  if (tag === 'h') {
    const span = document.createElement('span');
    span.dataset.fmt = 'h';
    span.dataset.level = String(Math.min(6, Math.max(1, parseInt(param, 10) || 2)));
    return span;
  }
  if (tag === 'li') {
    const span = document.createElement('span');
    span.dataset.fmt = 'li';
    return span;
  }
  if (tag === 'task') {
    const span = document.createElement('span');
    span.dataset.fmt = 'task';
    span.dataset.done = param === '1' ? '1' : '0';
    const box = document.createElement('span');
    box.className = 'task-box';
    box.contentEditable = 'false';
    box.title = 'クリックで完了／未完了を切り替えます';
    span.appendChild(box);
    return span;
  }
  if (tag === 'link') {
    const url = safeLinkUrl(param);
    /* 安全でない URL は書式化せず、ただの span として中身だけ残す */
    if (!url) { const s = document.createElement('span'); return s; }
    const a = document.createElement('a');
    a.dataset.fmt = 'link';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.title = `${url}\nCtrl+クリック（Mac は ⌘+クリック）で開きます`;
    return a;
  }
  const span = document.createElement('span');
  span.dataset.fmt = tag;
  if (tag === 'size') {
    const px = Math.min(72, Math.max(8, parseInt(param, 10) || 15));
    span.style.fontSize = px + 'px';
  } else if (tag === 'color' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.color = param;
  } else if (tag === 'hl' && /^#[0-9a-fA-F]{6}$/.test(param || '')) {
    span.style.backgroundColor = param;
  } else if (tag === 'font') {
    const f = fontById(param);
    /* 未知のフォント id は書式として扱わず、中身だけ残す */
    if (!f) { const plain = document.createElement('span'); return plain; }
    span.dataset.font = f.id;
    span.style.fontFamily = f.css;
  }
  return span;
}

/* 画像マーカーと書式タグを含む本文テキストを DOM フラグメントへ変換する。
   文字列の解釈（入れ子・閉じタグの無いタグの扱い）は body-parse.js の
   tokenizeBody() が行い、ここではその結果を DOM へ組み立てるだけにする */
function textToFragment(text) {
  return tokensToFragment(tokenizeBody(text));
}
function tokensToFragment(nodes) {
  const frag = document.createDocumentFragment();
  for (const n of nodes) {
    if (n.type === 'text') {
      addTextWithBreaks(frag, n.text);
    } else if (n.type === 'img') {
      frag.appendChild(createInlineImg(n.id, n.align, n.size));
    } else {
      const el = createFormatElement(n.tag, n.param);
      el.appendChild(tokensToFragment(n.children));
      frag.appendChild(el);
    }
  }
  return frag;
}

/* ============================================================
   外部からの貼り付け（HTML の取り込み）
   ============================================================ */
/* 貼り付けられた HTML を、本文が扱える書式だけに変換する。

   これを通さずにブラウザ既定の貼り付けに任せると、<u> や <font>、
   外部サイトの style がそのまま本文へ入り込む。本文の保存形式はここで
   定義された書式しか表現できないため、画面では効いているように見えても
   保存すると消える（＝書式が不安定に見える）。取り込み時点で対応する
   書式へ寄せるか捨てるかを決め、見た目と保存内容を一致させる。 */
function htmlToBodyFragment(html) {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  /* スクリプト等は解析前に落とす（template の中身は実行されないが、
     以降の走査対象にもしない） */
  tpl.content.querySelectorAll('script, style, meta, link, title, noscript, iframe, object, embed')
    .forEach(el => el.remove());

  const BLOCK = new Set(['P', 'DIV', 'LI', 'TR', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'HEADER', 'FOOTER', 'UL', 'OL', 'TABLE']);

  const out = document.createDocumentFragment();
  /* 直前に改行を出したかを持ち回り、空行が延々と増えるのを防ぐ */
  let atLineStart = true;
  const pushText = (parent, text) => {
    if (!text) return;
    addTextWithBreaks(parent, text);
    atLineStart = /\n$/.test(text);
  };
  const pushBreak = parent => {
    if (atLineStart) return;
    parent.appendChild(document.createElement('br'));
    atLineStart = true;
  };

  /* 要素から、本文が扱える書式ラッパーを組み立てる（無ければ null） */
  const wrappersFor = el => {
    const tags = [];
    const st = el.style || {};
    const tag = el.tagName;
    /* 見出しと箇条書きは、本文の段落書式へ寄せる */
    if (/^H[1-6]$/.test(tag)) tags.push(['h', String(Math.min(3, Number(tag[1])))]);
    if (tag === 'LI') {
      const box = el.querySelector('input[type="checkbox"]');
      tags.push(box ? ['task', box.checked ? '1' : '0'] : ['li']);
    }
    if (tag === 'B' || tag === 'STRONG' || /^(bold|[6-9]00)$/.test(String(st.fontWeight || ''))) tags.push(['b']);
    if (tag === 'I' || tag === 'EM' || String(st.fontStyle || '') === 'italic') tags.push(['i']);
    if (tag === 'A') {
      const url = safeLinkUrl(el.getAttribute('href'));
      if (url && !url.includes(']')) tags.push(['link', url]);
    }
    const px = parseInt(st.fontSize, 10);
    if (Number.isFinite(px) && px >= 8 && px <= 72) tags.push(['size', String(px)]);
    const col = rgbToHex(st.color);
    if (col) tags.push(['color', col]);
    const bg = rgbToHex(st.backgroundColor);
    if (bg && bg !== '#ffffff') tags.push(['hl', bg]);
    const fid = fontIdFromCss(st.fontFamily || el.getAttribute('face'));
    if (fid) tags.push(['font', fid]);
    return tags;
  };

  const walk = (node, parent) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        /* HTML の空白畳み込みに合わせ、連続する空白は1つにまとめる */
        pushText(parent, child.textContent.replace(/[ \t\r\n]+/g, ' '));
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      if (child.tagName === 'BR') { pushBreak(parent); continue; }
      const isBlock = BLOCK.has(child.tagName);
      if (isBlock) pushBreak(parent);
      let target = parent;
      for (const [t, param] of wrappersFor(child)) {
        const el = createFormatElement(t, param);
        target.appendChild(el);
        target = el;
      }
      walk(child, target);
      if (isBlock) pushBreak(parent);
    }
  };
  walk(tpl.content, out);
  return out;
}

/* rgb(r, g, b) / rgba(r, g, b, a) 形式の computed style 値を #rrggbb に変換する。
   要素の style.color 等はブラウザ側で常に rgb() 表記に正規化されて返る */
function rgbToHex(rgbStr) {
  const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(rgbStr || '');
  if (!m) return null;
  const toHex = n => Number(n).toString(16).padStart(2, '0');
  return '#' + toHex(m[1]) + toHex(m[2]) + toHex(m[3]);
}

/* 本文 DOM を保存形式の文字列へ変換する。
   points に [{node, offset}] を渡すと、その位置が出来上がった文字列の
   何文字目に当たるかも返す（元に戻す／段落書式で、書き換えたあとに
   キャレットを戻すために使う）。spans には文字の出どころを記録し、
   逆向きの変換（文字位置 → DOM 位置）にも使えるようにしている */
function serializeBodyInternal(points = []) {
  let result = '';
  const at = points.map(() => -1);
  const spans = [];
  const markContainer = (parent, index) => {
    for (let i = 0; i < points.length; i++) {
      if (at[i] === -1 && points[i].node === parent && points[i].offset === index) at[i] = result.length;
    }
  };
  function walkChildren(parent) {
    const kids = parent.childNodes;
    for (let i = 0; i < kids.length; i++) {
      markContainer(parent, i);
      walk(kids[i]);
    }
    markContainer(parent, kids.length);
  }
  function wrapTag(node, open, close) {
    result += open;
    walkChildren(node);
    result += close;
  }
  function walk(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const len = node.textContent.length;
      for (let i = 0; i < points.length; i++) {
        if (at[i] === -1 && points[i].node === node) at[i] = result.length + Math.min(points[i].offset, len);
      }
      spans.push({ node, start: result.length, len });
      result += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const fmt = node.dataset && node.dataset.fmt;
      if (isOverlayEl(node) || isWidgetEl(node)) {
        return; /* 表示専用の要素（改行マーク・現在行ハイライト・□）は読み飛ばす */
      } else if (node.classList && node.classList.contains('body-img')) {
        result += `[img:${node.dataset.id}:${node.dataset.align || 'c'}:${node.dataset.size || 'fit'}]`;
      } else if (node.tagName === 'BR') {
        result += '\n';
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (result.length > 0 && !result.endsWith('\n')) result += '\n';
        walkChildren(node);
        if (!result.endsWith('\n')) result += '\n';
      } else if (node.tagName === 'B' || node.tagName === 'STRONG') {
        wrapTag(node, '[b]', '[/b]');
      } else if (node.tagName === 'I' || node.tagName === 'EM') {
        wrapTag(node, '[i]', '[/i]');
      } else if (fmt === 'size') {
        const px = parseInt(node.style.fontSize, 10) || 15;
        wrapTag(node, `[size=${px}]`, '[/size]');
      } else if (fmt === 'color') {
        const hex = rgbToHex(node.style.color);
        if (hex) wrapTag(node, `[color=${hex}]`, '[/color]');
        else walkChildren(node);
      } else if (fmt === 'hl') {
        const hex = rgbToHex(node.style.backgroundColor);
        if (hex) wrapTag(node, `[hl=${hex}]`, '[/hl]');
        else walkChildren(node);
      } else if (fmt === 'font') {
        const id = node.dataset.font;
        if (fontById(id)) wrapTag(node, `[font=${id}]`, '[/font]');
        else walkChildren(node);
      } else if (fmt === 'h') {
        wrapTag(node, `[h=${node.dataset.level || 2}]`, '[/h]');
      } else if (fmt === 'li') {
        wrapTag(node, '[li]', '[/li]');
      } else if (fmt === 'task') {
        wrapTag(node, node.dataset.done === '1' ? '[task=1]' : '[task]', '[/task]');
      } else if (fmt === 'link') {
        /* URL に ] が含まれるとマーカーが壊れるため、その場合は
           リンクを諦めて文字だけ残す */
        const url = node.getAttribute('href') || '';
        if (url && !url.includes(']')) wrapTag(node, `[link=${url}]`, '[/link]');
        else walkChildren(node);
      } else {
        walkChildren(node);
      }
    }
  }
  walkChildren(refs.bodyInput);
  /* 末尾の改行1つは保存しない（従来の挙動）。位置も同じ長さへ丸める */
  const text = result.replace(/\n$/, '');
  return { text, points: at.map(v => v === -1 ? -1 : Math.min(v, text.length)), spans };
}
function serializeBody() { return serializeBodyInternal().text; }

/* 保存形式の文字位置（serializeBodyInternal の結果における offset）から、
   いまの DOM 上の位置を求める */
function bodyPositionAtOffset(offset) {
  const { spans } = serializeBodyInternal();
  if (spans.length === 0) return null;
  for (const s of spans) {
    if (offset <= s.start + s.len) return { node: s.node, offset: Math.max(0, offset - s.start) };
  }
  const last = spans[spans.length - 1];
  return { node: last.node, offset: last.len };
}
/* いまのキャレット位置を保存形式の文字位置で返す（選択の始点・終点） */
function bodyCaretOffsets() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!refs.bodyInput.contains(r.startContainer)) return null;
  const { points } = serializeBodyInternal([
    { node: r.startContainer, offset: r.startOffset },
    { node: r.endContainer,   offset: r.endOffset },
  ]);
  if (points[0] === -1) return null;
  return { start: points[0], end: points[1] === -1 ? points[0] : points[1] };
}
/* 文字位置へキャレットを戻す */
function setBodyCaretOffset(start, end = start) {
  const from = bodyPositionAtOffset(start);
  const to   = bodyPositionAtOffset(end);
  if (!from) { refs.bodyInput.focus(); return; }
  const range = document.createRange();
  try {
    range.setStart(from.node, from.offset);
    if (to) range.setEnd(to.node, to.offset);
    else range.collapse(true);
  } catch { return; }
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/* 画面に見えている文字だけの本文。serializeBody() が返すのは保存用の形式で、
   [b] や [img:1:c:fit] といったマーカーを含むため、そのまま数えると文字数が
   実際より多くなる（太字にしただけで 5 文字が 12 文字と表示されていた）。
   マーカーの正規表現は検索側（list.js）と共用する */
function bodyPlainText() {
  return serializeBody()
    .replace(BODY_IMG_MARKER_RE, '')
    .replace(BODY_FMT_TAG_RE, '');
}

/* ============================================================
   段落書式（見出し・箇条書き・チェックリスト）
   ------------------------------------------------------------
   行まるごとに効く書式なので、DOM を直接いじるのではなく
   「保存形式へ直列化 → 行単位で書き換え → 組み立て直す」で処理する。
   行の境界（<br> と <div> の混在）を自前で解釈せずに済み、
   結果が保存内容とずれない。
   ============================================================ */
const BLOCK_FMT_TYPES = ['h', 'li', 'task'];
const isBlockFmtEl = el => !!(el.dataset && BLOCK_FMT_TYPES.includes(el.dataset.fmt));
/* キャレットのある行の段落種別（'h1' 'li' 'task' など。無ければ null） */
function currentBlockKind() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const el = closestFormatEl(sel.anchorNode, isBlockFmtEl);
  if (!el) return null;
  return el.dataset.fmt === 'h' ? 'h' + (el.dataset.level || 2) : el.dataset.fmt;
}

function applyBlockFormat(kind) {
  refs.bodyInput.focus();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !refs.bodyInput.contains(sel.getRangeAt(0).startContainer)) {
    toast('段落書式を適用する行にカーソルを置いてください', 'info');
    return;
  }
  const r = sel.getRangeAt(0);
  const { text, points } = serializeBodyInternal([
    { node: r.startContainer, offset: r.startOffset },
    { node: r.endContainer,   offset: r.endOffset },
  ]);
  const caret = points[0] === -1 ? text.length : points[0];
  const caretEnd = points[1] === -1 ? caret : points[1];
  const lines = text.split('\n');
  const startLine = offsetToLineIndex(lines, caret);
  const endLine   = offsetToLineIndex(lines, caretEnd);
  const next = applyBlockToLines(lines, startLine, endLine, kind);
  const nextText = next.join('\n');
  if (nextText === text) return;

  /* キャレットは「同じ行の同じ文字数目」へ戻す（タグの増減分をずらす） */
  const oldStarts = lineStartOffsets(lines);
  const newStarts = lineStartOffsets(next);
  const oldInfo = parseBlockLine(lines[startLine]);
  const newInfo = parseBlockLine(next[startLine]);
  const oldOpen = blockAffixes(oldInfo.kind, oldInfo.done).open.length;
  const newOpen = blockAffixes(newInfo.kind, newInfo.done).open.length;
  const col = Math.max(0, Math.min(caret - oldStarts[startLine] - oldOpen, oldInfo.inner.length));
  const caretAfter = newStarts[startLine] + newOpen + col;

  pushHistory();
  deserializeBody(nextText);
  setBodyCaretOffset(caretAfter);
  afterBodyEdit();
}

/* チェックリストの □ を押したときの切り替え */
function toggleTaskBox(box) {
  const el = box.closest('[data-fmt="task"]');
  if (!el) return;
  pushHistory();
  el.dataset.done = el.dataset.done === '1' ? '0' : '1';
  afterBodyEdit();
}

/* 箇条書き・チェックリストの行で Enter を押したときに、次の行も同じ
   書式で始める（空の行で押したときは書式を解除して通常の行に戻す）。
   処理したときだけ true を返し、呼び出し側が既定の改行を止める */
function handleBlockEnter() {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!refs.bodyInput.contains(range.startContainer)) return false;
  const block = closestFormatEl(range.startContainer, isBlockFmtEl);
  if (!block) return false;
  const kind = block.dataset.fmt;
  const inner = [...block.childNodes].filter(n => !isWidgetEl(n))
    .map(n => n.textContent).join('');
  pushHistory();
  if (!inner.trim()) {
    /* 空の項目で Enter → 段落書式を解除して普通の行にする */
    const br = document.createElement('br');
    block.replaceWith(br);
    ensureTrailingEditable();
    placeCaretAfter(br);
    afterBodyEdit();
    return true;
  }
  /* キャレットより後ろを次の行へ送る */
  const tail = document.createRange();
  tail.setStart(range.endContainer, range.endOffset);
  tail.setEnd(block, block.childNodes.length);
  const rest = tail.extractContents();
  const br = document.createElement('br');
  let holder;
  if (kind === 'h') {
    /* 見出しの次の行まで見出しにはしない（本文が続くのが普通） */
    holder = document.createDocumentFragment();
    holder.appendChild(rest);
  } else {
    holder = createFormatElement(kind, kind === 'task' ? '0' : undefined);
    holder.appendChild(rest);
  }
  /* 空の行にもキャレットを置けるよう、文字が無ければ空のテキストノードを置く */
  let caretNode = firstTextNode(holder);
  if (!caretNode) {
    caretNode = document.createTextNode('');
    holder.appendChild(caretNode);
  }
  block.after(br, holder);
  ensureTrailingEditable();
  const nr = document.createRange();
  nr.setStart(caretNode, 0);
  nr.collapse(true);
  sel.removeAllRanges();
  sel.addRange(nr);
  afterBodyEdit();
  return true;
}

function deserializeBody(text) {
  refs.bodyInput.innerHTML = '';
  if (text) {
    let frag;
    try {
      frag = textToFragment(text);
    } catch (err) {
      /* 起動時の前回メモ復元でも呼ばれるため、パーサーがどんな入力
         (インポートされた異常データ等)で失敗してもアプリ全体が起動不能に
         ならないよう、プレーンテキスト表示にフォールバックする */
      console.error('本文の解釈に失敗したためプレーンテキストとして表示します', err);
      frag = document.createDocumentFragment();
      addTextWithBreaks(frag, text);
    }
    refs.bodyInput.appendChild(frag);
    ensureTrailingEditable();
  }
  rebuildLineMarks();
}

/* 末尾が（編集不可な）画像のままだと、その後ろにキャレットを
   置けず文字入力できなくなる。末尾画像の後ろに改行を補い、
   常に編集可能な行が残るようにする。 */
function ensureTrailingEditable() {
  /* 改行マーク・カーソルハイライトは表示専用オーバーレイのため、
     末尾判定の対象からは読み飛ばす */
  let last = refs.bodyInput.lastChild;
  while (last && isOverlayEl(last)) last = last.previousSibling;
  if (last && last.nodeType === Node.ELEMENT_NODE &&
      last.classList && last.classList.contains('body-img')) {
    refs.bodyInput.appendChild(document.createElement('br'));
  }
}

function placeCaretAfter(node) {
  const sel = window.getSelection();
  if (!sel) return;
  const range = document.createRange();
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

function caretRangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  if (document.caretPositionFromPoint) {
    const p = document.caretPositionFromPoint(x, y);
    if (p) { const r = document.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  }
  return null;
}

/* ドラッグ中の挿入位置を求め、縦線インジケータで可視化する */
function getCaretIndicator(x, y) {
  const range = caretRangeFromPoint(x, y);
  if (!range) return null;
  const r = range.getBoundingClientRect();
  if (r && r.height > 0) return { left: r.left, top: r.top, height: r.height };
  const cont = range.startContainer;
  /* テキストノード内：行矩形の左右端にキャレットを置く */
  if (cont.nodeType === Node.TEXT_NODE && cont.textContent.length) {
    const tr = document.createRange();
    tr.selectNodeContents(cont);
    const rects = tr.getClientRects();
    const rr = rects[rects.length - 1] || tr.getBoundingClientRect();
    if (rr && rr.height > 0) {
      const atEnd = range.startOffset >= cont.textContent.length;
      return { left: atEnd ? rr.right : rr.left, top: rr.top, height: rr.height };
    }
  }
  /* 要素境界（画像や改行の前後）：隣接要素の端に合わせる */
  if (cont.nodeType === Node.ELEMENT_NODE) {
    const after  = cont.childNodes[range.startOffset];
    const before = cont.childNodes[range.startOffset - 1];
    const ref = (after && after.nodeType === Node.ELEMENT_NODE) ? after
              : (before && before.nodeType === Node.ELEMENT_NODE) ? before : null;
    if (ref) {
      const rr = ref.getBoundingClientRect();
      if (rr.height > 0) return { left: after ? rr.left : rr.right, top: rr.top, height: rr.height };
    }
  }
  const er = refs.bodyInput.getBoundingClientRect();
  return { left: Math.min(Math.max(x, er.left + 2), er.right - 2), top: er.top + 6, height: 24 };
}
function showDropCaret(x, y) {
  const info = getCaretIndicator(x, y);
  if (!info) return;
  const el = refs.dropCaret;
  el.style.left   = Math.round(info.left) + 'px';
  el.style.top    = Math.round(info.top) + 'px';
  el.style.height = Math.round(info.height) + 'px';
  el.hidden = false;
}
function hideDropCaret() { if (refs.dropCaret && !refs.dropCaret.hidden) refs.dropCaret.hidden = true; }
function endImgDrag() {
  if (draggedImg) draggedImg.classList.remove('dragging');
  draggedImg = null;
  hideDropCaret();
}

function insertBodyText(text, caretAt = null) {
  pushHistory();
  const sel = window.getSelection();
  /* 【重要】挿入位置の判定は focus() より先に行う。選択がタイトル欄など本文の
     外に残っている状態で focus() を呼ぶと、キャレットが本文の「先頭」へ移り、
     そのまま先頭へ挿入されてしまう（音声入力中に他の欄を触ったあとの確定文字
     が、書きかけの文章の頭に割り込んでいた）。本文内にキャレットが無いときは
     末尾へ挿入する */
  const current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const target = current && refs.bodyInput.contains(current.commonAncestorContainer)
    ? current.cloneRange() : null;
  refs.bodyInput.focus();
  if (!sel) {
    refs.bodyInput.appendChild(textToFragment(text));
    afterBodyEdit();
    return;
  }
  let range = target;
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(refs.bodyInput);
    range.collapse(false);
  }
  range.deleteContents();
  const frag = document.createDocumentFragment();
  if (caretAt !== null) {
    addTextWithBreaks(frag, text.slice(0, caretAt));
    const caretMarker = document.createTextNode('');
    frag.appendChild(caretMarker);
    addTextWithBreaks(frag, text.slice(caretAt));
    range.insertNode(frag);
    const nr = document.createRange();
    nr.setStartAfter(caretMarker);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  } else {
    addTextWithBreaks(frag, text);
    const last = frag.lastChild;
    range.insertNode(frag);
    if (last) {
      const nr = document.createRange();
      nr.setStartAfter(last);
      nr.collapse(true);
      sel.removeAllRanges();
      sel.addRange(nr);
    }
  }
  afterBodyEdit();
}

/* すでに組み立て済みのフラグメント（貼り付けの変換結果など）を
   キャレット位置へ挿入する。挿入位置の決め方は insertBodyText と同じ */
function insertBodyFragment(frag) {
  if (!frag || !frag.firstChild) return;
  pushHistory();
  const sel = window.getSelection();
  const current = sel && sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  const target = current && refs.bodyInput.contains(current.commonAncestorContainer)
    ? current.cloneRange() : null;
  refs.bodyInput.focus();
  let range = target;
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(refs.bodyInput);
    range.collapse(false);
  }
  range.deleteContents();
  const last = frag.lastChild;
  range.insertNode(frag);
  if (last && sel) {
    const nr = document.createRange();
    nr.setStartAfter(last);
    nr.collapse(true);
    sel.removeAllRanges();
    sel.addRange(nr);
  }
  afterBodyEdit();
}

function insertImageRef(imgId) {
  pushHistory();
  refs.bodyInput.focus();
  const imgEl = createInlineImg(imgId, 'c', 'fit');
  const sel = window.getSelection();
  let range;
  if (sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.getRangeAt(0).startContainer)) {
    range = sel.getRangeAt(0);
    range.deleteContents();
  } else {
    range = document.createRange();
    range.selectNodeContents(refs.bodyInput);
    range.collapse(false);
  }
  range.insertNode(imgEl);
  ensureTrailingEditable();
  placeCaretAfter(imgEl);
  afterBodyEdit();
}

/* 本文内画像をライトボックスで拡大表示（パネルと同じビューワを共用） */
function openInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const index = state.images.findIndex(x => x.id === id);
  if (index >= 0) lbShow(index);
  else toast('この画像は登録されていません', 'error');
}

/* 本文内画像の右下角ドラッグによる自由なサイズ変更 */
function startImageResize(wrap, startEvent) {
  const imgEl = wrap.querySelector('.body-img__img');
  if (!imgEl) return;
  pushHistory();
  const startX = startEvent.clientX;
  const startWidth = imgEl.getBoundingClientRect().width;
  const minW = 48;
  const maxW = Math.max(minW, refs.bodyInput.getBoundingClientRect().width - 8);
  wrap.classList.add('resizing');
  const onMove = e => {
    const w = Math.round(Math.min(maxW, Math.max(minW, startWidth + (e.clientX - startX))));
    imgEl.style.width = w + 'px';
  };
  const onUp = () => {
    window.removeEventListener('mousemove', onMove);
    window.removeEventListener('mouseup', onUp);
    wrap.classList.remove('resizing');
    const finalPx = Math.round(imgEl.getBoundingClientRect().width);
    wrap.dataset.size = String(finalPx);
    const sel = wrap.querySelector('.body-img__size');
    if (sel) {
      const customOpt = sel.querySelector('option[value="custom"]');
      if (customOpt) customOpt.textContent = customSizeLabel(finalPx);
      sel.value = 'custom';
    }
    afterBodyEdit();
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
}

/* ホバーコントロールバーの位置を画像の実測位置から都度計算する。
   CSS の包含ブロックに頼らないため、配置・サイズ・スクロール状態に
   関わらず常に画像の直上（エディタ範囲内にクランプ）に表示される。 */
function positionImgCtrl(wrap) {
  const ctrl = wrap.querySelector('.body-img__ctrl');
  if (!ctrl) return;
  const wrapRect = wrap.getBoundingClientRect();
  const editorRect = refs.bodyInput.getBoundingClientRect();
  const ctrlH = ctrl.offsetHeight || 34;
  const ctrlW = ctrl.offsetWidth || 180;
  let top = wrapRect.top + 6;
  top = Math.max(editorRect.top + 4, Math.min(top, editorRect.bottom - ctrlH - 4));
  let left = wrapRect.left + wrapRect.width / 2;
  left = Math.max(editorRect.left + ctrlW / 2 + 4, Math.min(left, editorRect.right - ctrlW / 2 - 4));
  ctrl.style.top = Math.round(top) + 'px';
  ctrl.style.left = Math.round(left) + 'px';
}

/* 本文内画像をシステムのクリップボードにコピー（フォーマットの
   互換性を優先し、常に PNG として書き込む） */
async function blobToPngBlob(blob) {
  if (blob.type === 'image/png') return blob;
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/png');
  });
}
async function copyInlineImage(wrap) {
  const id = Number(wrap.dataset.id);
  const img = state.images.find(x => x.id === id);
  if (!img) { toast('この画像は登録されていません', 'error'); return; }
  try {
    const pngBlob = await blobToPngBlob(img.blob);
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })]);
    toast('画像をクリップボードにコピーしました', 'success');
  } catch (err) {
    console.error(err);
    toast('画像のコピーに失敗しました', 'error');
  }
}

/* ============================================================
   改行マークの視覚化（表示専用・本文内容には含まれない）
   ============================================================ */
function applyShowLineMarksState() {
  refs.btnShowMarks.classList.toggle('active', state.showLineMarks);
  refs.btnShowMarks.title = state.showLineMarks ? '改行マークを非表示' : '改行マークを表示';
}
function rebuildLineMarks() {
  $$('.line-mark', refs.bodyInput).forEach(el => el.remove());
  if (!state.showLineMarks) return;
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const scrollLeft = refs.bodyInput.scrollLeft;
  const frag = document.createDocumentFragment();
  const addMark = rect => {
    if (!rect || rect.height === 0) return;   /* 非表示状態（display:none 等）は無視 */
    const mark = document.createElement('span');
    mark.className = 'line-mark';
    mark.contentEditable = 'false';
    mark.textContent = '↵';
    mark.style.top  = Math.round(rect.top  - containerRect.top  + scrollTop)  + 'px';
    mark.style.left = Math.round(rect.left - containerRect.left + scrollLeft + 2) + 'px';
    frag.appendChild(mark);
  };
  /* <br> による改行（音声入力・フォーマット適用などプログラム的な挿入） */
  for (const br of $$('br', refs.bodyInput)) addMark(br.getBoundingClientRect());
  /* <div>/<p> による改行（Enter キーを押した際のブラウザ既定の段落化）
     文字境界の collapsed Range は getClientRects() が空配列を返すことがあり
     getBoundingClientRect() が全て 0 になるため、要素自体の矩形を使う */
  for (const block of $$('div, p', refs.bodyInput)) addMark(block.getBoundingClientRect());
  /* white-space:pre-wrap の本文では、Shift+Enter による改行が <br> ではなく
     テキストノード内の "\n" 文字として挿入される場合がある。これを拾わないと
     Shift+Enter の改行だけマークが表示されない */
  const walker = document.createTreeWalker(refs.bodyInput, NodeFilter.SHOW_TEXT, {
    acceptNode: n => (n.parentElement && n.parentElement.closest(OVERLAY_SELECTOR))
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let tn;
  while ((tn = walker.nextNode())) {
    const s = tn.textContent;
    for (let i = 0; i < s.length; i++) {
      if (s[i] !== '\n') continue;
      const r = document.createRange();
      r.setStart(tn, i);
      r.setEnd(tn, i + 1);
      addMark(r.getClientRects()[0]);
    }
  }
  refs.bodyInput.appendChild(frag);
}
const rebuildLineMarksDebounced = debounce(rebuildLineMarks, 200);

/* ノードが実際に描画されている行の矩形を返す。テキストノードは Range 経由で
   なければ矩形が取れないため、種類に応じて取得方法を切り替える */
function rectOfNode(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    const r = document.createRange();
    r.selectNodeContents(node);
    return r.getClientRects()[0] || null;
  }
  if (node.nodeType === Node.ELEMENT_NODE) {
    const rect = node.getBoundingClientRect();
    return rect.height > 0 ? rect : null;
  }
  return null;
}

/* カーソルのある行を薄くハイライトし、キャレット位置を見失わないようにする。
   フォーカスが本文エディタに無い場合は非表示にする。 */
function updateCursorHighlight() {
  let hl = refs.bodyInput.querySelector('.current-line-hl');
  const sel = window.getSelection();
  const active = document.activeElement === refs.bodyInput &&
    sel && sel.rangeCount > 0 && refs.bodyInput.contains(sel.anchorNode);
  /* 本文が完全に空の場合はハイライトを出さない。ここで要素を追加すると
     :empty::before によるプレースホルダー表示が消えてしまうため */
  const hasRealContent = [...refs.bodyInput.childNodes].some(n => n !== hl);
  if (!active || !hasRealContent) {
    if (hl) hl.remove();
    return;
  }
  const range = sel.getRangeAt(0).cloneRange();
  range.collapse(true);
  let rect = range.getClientRects()[0];
  if (!rect) {
    const node = range.startContainer;
    /* white-space:pre-wrap の本文で Shift+Enter 等により改行がテキストノード内の
       "\n" 文字として表現される場合、その文字境界の collapsed Range は
       getClientRects() が空になることがある。その場合でもテキストノード全体を
       選択した Range なら正しい行の矩形が取れるため、まずそちらを試す。
       (これを飛ばして要素の矩形にフォールバックすると、"\n" がbodyInput 直下の
       テキストノードの場合に親要素＝エディタ全体の矩形を拾ってしまい、
       ハイライトがエディタ全体を覆う不具合になる) */
    if (node.nodeType === Node.TEXT_NODE) {
      const nodeRange = document.createRange();
      nodeRange.selectNodeContents(node);
      rect = nodeRange.getClientRects()[0];
    }
    if (!rect || rect.height === 0) {
      /* それでも矩形が取れない場合(空要素など)は、キャレットを含む要素自体の
         矩形にフォールバックする */
      const el = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
      /* ただしその要素がエディタ自身の場合(書式解除の直後など、選択が
         bodyInput 直下のオフセットを指している状態)、そのまま使うと
         ハイライトがエディタ全体を覆ってしまう。キャレット位置の子ノードから
         実際の行の矩形を求め、取れなければハイライトを出さない */
      if (el === refs.bodyInput) {
        const kids = [...el.childNodes].filter(n => n !== hl &&
          !(n.nodeType === Node.ELEMENT_NODE && n.classList && n.classList.contains('line-mark')));
        const at = kids[Math.min(range.startOffset, kids.length - 1)];
        rect = at && rectOfNode(at);
      } else {
        rect = el && el.getBoundingClientRect();
      }
    }
  }
  if (!rect || rect.height === 0) { if (hl) hl.remove(); return; }
  if (!hl) {
    hl = document.createElement('span');
    hl.className = 'current-line-hl';
    hl.contentEditable = 'false';
    /* 先頭に挿入すると、末尾を指す (bodyInput, offset) 形式の既存 Range/Selection の
       境界がこの新要素を含むようずれてしまう(挿入位置の index 分だけ offset が調整される
       DOM の仕様のため)。末尾へ追加すれば既存の選択範囲に影響しない。 */
    refs.bodyInput.appendChild(hl);
  }
  const containerRect = refs.bodyInput.getBoundingClientRect();
  const scrollTop = refs.bodyInput.scrollTop;
  const top = rect.top - containerRect.top + scrollTop;
  hl.style.top = Math.round(top - 3) + 'px';
  hl.style.height = Math.round(rect.height + 6) + 'px';
}

/* テストから読み込むための書き出し（ブラウザでは module が無いので何もしない） */
if (typeof module === 'object' && module.exports) {
  module.exports = { safeLinkUrl, rgbToHex, fontIdFromCss, fontById, BODY_FONTS };
}
