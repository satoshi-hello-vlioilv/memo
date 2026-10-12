/* 項目F：画像・添付パネル（帯の「パネルで見る」で開いたとき） */
const panelClip = (w, h) => ({ x: w - 520, y: 0, width: 520, height: h });
const OPEN = `(() => { togglePanel(true); })()`;

const F0 = { id: 'F0', name: '現行（参考）', css: '', js: OPEN };

const F1 = { id: 'F1', name: '見出しを1行に（画像数・追加・サイズ・閉じる）', css: `
  .imgpanel-head{padding:10px 10px 10px 16px;gap:6px}
  .imgpanel-tools{display:none}
  .f-tools{display:flex;align-items:center;gap:4px;margin-left:auto}
  .f-tools .icon-btn{width:28px;height:28px}
  .f-size{width:70px}
`, js: OPEN + `;(() => {
  const head = document.querySelector('.imgpanel-head'); const t = document.createElement('div'); t.className = 'f-tools';
  const add = document.createElement('button'); add.className = 'icon-btn'; add.title = '画像を追加'; add.innerHTML = '<i class="fa-solid fa-plus"></i>';
  const r = document.getElementById('thumbSize'); r.classList.add('f-size');
  t.append(add, r); head.insertBefore(t, document.getElementById('btnPanelToggle'));
})()` };

const F2 = { id: 'F2', name: 'タブ切替（画像｜添付）', css: `
  .f-tabs{display:flex;margin:0 14px 10px;border:1px solid var(--line);border-radius:8px;overflow:hidden}
  .f-tabs button{flex:1;height:32px;font-size:12.5px;color:var(--text-sub);background:var(--paper)}
  .f-tabs button.on{background:var(--surface);color:var(--text);font-weight:700;box-shadow:inset 0 -2px 0 var(--primary)}
  .f-tabs b{font-family:var(--font-mono);font-weight:600;margin-left:4px;font-size:11px}
  .imgpanel-head .panel-title{visibility:hidden}
  .attach-head,.attach-list,.attach-empty{display:none !important}
`, js: OPEN + `;(() => {
  const t = document.createElement('div'); t.className = 'f-tabs';
  t.innerHTML = '<button class="on">画像<b>' + state.images.length + '</b></button><button>添付<b>' + state.attachments.length + '</b></button>';
  document.querySelector('.imgpanel-head').after(t);
})()` };

const F3 = { id: 'F3', name: '1列の大きな画像（本文の横で見比べる）', css: `
  .thumb-grid{grid-template-columns:1fr !important;gap:14px}
  .thumb-frame{aspect-ratio:auto;max-height:none}
  .thumb-frame img{height:auto;object-fit:contain}
  .size-control{display:none}
  .imgpanel-tools{padding-bottom:10px}
`, js: OPEN };

const F4 = { id: 'F4', name: 'サムネイルを詰める（名前は重ねて表示・操作は常時アイコン）', css: `
  .thumb-grid{--thumb:120px !important;gap:8px;padding:10px}
  .thumb{position:relative}
  .thumb-name{position:absolute;left:1px;right:1px;bottom:1px;padding:14px 6px 4px;color:#fff;background:linear-gradient(transparent,rgba(0,0,0,.55));border-radius:0 0 8px 8px}
  .thumb > .t-insert{display:none !important}
  .thumb-acts{opacity:1;background:none;align-items:flex-start;justify-content:flex-end;padding:5px;gap:4px}
  .t-act{width:26px;height:26px;font-size:11px;box-shadow:0 1px 3px rgba(0,0,0,.2)}
  .imgpanel-tools{display:flex;align-items:center;gap:10px}
  .imgpanel-tools .btn-block{width:auto;flex-shrink:0;height:32px}
  .size-control{margin-top:0;flex:1}
`, js: OPEN };

const F5 = { id: 'F5', name: '添付を上・画像を下に（ファイルは一覧で短く）', css: `
  .imgpanel{display:flex;flex-direction:column}
  .attach-head{order:1;border-top:none}
  .attach-list{order:2;max-height:none}
  .attach-empty{order:3}
  .imgpanel-head{order:4;border-top:1px solid var(--line)}
  .imgpanel-tools{order:5}
  .thumb-grid{order:6}
  .img-empty{order:7}
`, js: OPEN };

/* ↓ 方向性の違う追加案 */
const F6 = { id: 'F6', name: 'パネルをやめ、帯から大きなギャラリー（重ね表示）を開く', css: `
  #app.panel-closed .imgpanel{display:none}
  .f6-overlay{position:fixed;inset:44px 0 0 312px;z-index:70;background:rgba(14,26,33,.55);display:flex;align-items:flex-start;justify-content:center;padding:24px}
  .f6-card{background:var(--surface);border-radius:12px;box-shadow:var(--shadow-2);width:min(900px,100%);max-height:100%;overflow:auto;padding:16px}
  .f6-head{display:flex;align-items:center;gap:10px;margin-bottom:12px;font-weight:700}
  .f6-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
  .f6-grid img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:8px;border:1px solid var(--line)}
  .f6-files{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
`, js: `(() => {
  const o = document.createElement('div'); o.className = 'f6-overlay';
  o.innerHTML = '<div class="f6-card"><div class="f6-head"><i class="fa-regular fa-images"></i> 画像と添付 <span style="margin-left:auto;font-weight:400;font-size:12px;color:var(--text-sub)">Esc で閉じる</span></div><div class="f6-grid">' +
    [...document.querySelectorAll('#thumbGrid img')].map(i => '<img src="' + i.src + '">').join('') + '</div><div class="f6-files">' +
    state.attachments.map(f => '<span class="ms-file"><i class="fa-regular fa-file-lines"></i>' + esc(f.name) + '</span>').join('') + '</div></div>';
  document.body.append(o);
})()` };

const F7 = { id: 'F7', name: '細いレール（縦にサムネイルを並べるだけ、押すと拡大）', css: `
  :root{--imgpanel-w:96px !important}
  .imgpanel-head .panel-title span:not(.count-badge),.imgpanel-head .panel-title{font-size:0}
  .imgpanel-head .panel-title i{font-size:14px}
  .imgpanel-head{padding:10px 8px;justify-content:center;gap:4px}
  .imgpanel-tools,.attach-head .panel-title,.attach-empty,.img-empty,.thumb-name,.thumb > .t-insert{display:none !important}
  .thumb-grid{--thumb:72px !important;grid-template-columns:1fr !important;padding:8px;gap:8px}
  .thumb-acts{display:none}
  .attach-head{justify-content:center;padding:8px}
  .attach-item{flex-direction:column;padding:6px 2px;gap:2px}
  .attach-main{display:none}
  .attach-act{display:none}
`, js: OPEN };

/* ===== 2回目 ===== */
/* 狭い画面（1150px 以下）ではパネルを本文の上に重ねる引き出しにして、本文の幅を潰さない */
const DRAWER = `
  @media (max-width:1150px){
    #app,#app.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 0 !important}
    #app:not(.panel-closed) .imgpanel{display:flex !important;position:fixed;right:0;top:var(--topbar-h);bottom:0;width:min(340px,90vw);z-index:60;box-shadow:-12px 0 32px rgba(12,22,28,.25)}
  }
`;
const HEAD1 = F1.css;
const ONECOL = `
  .thumb-grid{grid-template-columns:1fr !important;gap:14px}
  .thumb-frame{aspect-ratio:auto}
  .thumb-frame img{height:auto;object-fit:contain}
`;
const ATT = `.attach-list{max-height:30%}`;
const ICONS = `
  .thumb{position:relative}
  .thumb > .t-insert{display:none !important}
  .thumb-acts{opacity:1;background:none;align-items:flex-start;justify-content:flex-end;padding:6px;gap:4px}
  .t-act{width:28px;height:28px;font-size:11.5px;box-shadow:0 1px 3px rgba(0,0,0,.25)}
`;
const F8 = { id: 'F8', name: '1行見出し＋1列の大きな画像＋狭い画面は引き出し', css: HEAD1 + ONECOL + ATT + DRAWER + `.f-size{display:none}`, js: F1.js };
const F9 = { id: 'F9', name: 'F8＋画像の操作（挿入・拡大・削除）を常に小さく表示', css: HEAD1 + ONECOL + ATT + ICONS + DRAWER + `.f-size{display:none}`, js: F1.js };
const F10 = { id: 'F10', name: '広い画面はパネル（1列）、狭い画面は重ねたギャラリー', css: HEAD1 + ONECOL + ATT + F6.css + `
  @media (min-width:1151px){ .f6-overlay{display:none} }
  @media (max-width:1150px){ #app,#app.panel-closed{grid-template-columns:var(--sidebar-w) 1fr 0 !important} .imgpanel{display:none !important} }
  .f-size{display:none}
`, js: F1.js + ';' + F6.js };
const F11 = { id: 'F11', name: '1行見出し（サイズ調整つき）＋詰めたグリッド＋引き出し', css: HEAD1 + F4.css.replace(/\.imgpanel-tools[^}]*\}/, '').replace(/\.imgpanel-tools \.btn-block[^}]*\}/, '') + ATT + DRAWER, js: F1.js };

export default {
  key: 'F', compositeHeight: 700,
  shots: [
    { w: 1440, h: 900, key: '1440', clip: { x: 0, y: 0, width: 1440, height: 900 } },
    { w: 1440, h: 900, key: 'panel', clip: panelClip(1440, 900) },
    { w: 1024, h: 768, key: '1024' },
  ],
  rounds: { r1: [F0, F1, F2, F3, F4, F5, F6, F7], r2: [F6, F3, F1, F8, F9, F10, F11] },
  parts: { OPEN, F1, F2, F3, F4, F5, F6, F7 },
};
