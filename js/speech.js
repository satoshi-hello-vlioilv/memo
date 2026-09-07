/* ============================================================
   speech.js
   音声入力（Web Speech API／非対応時はグレースフル・デグラデーション）
   ============================================================ */
'use strict';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
const speech = { rec: null, active: false, startAt: 0, timer: null };
function setupSpeech() {
  if (!SR) {
    refs.btnMic.disabled = true;
    refs.btnMic.title = 'このブラウザは音声入力に対応していません（Chrome / Edge を推奨）';
    refs.btnMic.innerHTML = '<i class="fa-solid fa-microphone-slash"></i> 音声入力 非対応';
    return;
  }
  refs.btnMic.addEventListener('click', () => speech.active ? stopSpeech() : startSpeech());
}
function startSpeech() {
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = true;
  rec.onresult = e => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) insertBodyText(r[0].transcript);
      else interim += r[0].transcript;
    }
    refs.interimText.textContent = interim;
    refs.interimBar.classList.toggle('show', interim.length > 0);
  };
  rec.onerror = e => {
    if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
      stopSpeech();
      toast('マイクの使用が許可されていません。ブラウザの設定を確認してください', 'error');
    } else if (e.error === 'network') {
      stopSpeech();
      toast('音声認識サービスに接続できません（ネットワーク接続が必要です）', 'error');
    }
  };
  /* 無音などで自動停止した場合、録音中なら再開する */
  rec.onend = () => {
    if (speech.active) { try { rec.start(); } catch { /* 連続再開の競合は無視 */ } }
  };
  try { rec.start(); } catch { toast('音声入力を開始できませんでした', 'error'); return; }
  speech.rec = rec;
  speech.active = true;
  speech.startAt = Date.now();
  refs.btnMic.classList.add('recording');
  refs.btnMic.innerHTML = '<i class="fa-solid fa-stop"></i> 停止';
  refs.recIndicator.hidden = false;
  speech.timer = setInterval(() => {
    const s = Math.floor((Date.now() - speech.startAt) / 1000);
    refs.recTime.textContent = `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }, 500);
  refs.bodyInput.focus();
  toast('音声入力を開始しました。本文へ直接入力されます', 'info');
}
function stopSpeech() {
  speech.active = false;
  if (speech.rec) { try { speech.rec.stop(); } catch {} speech.rec = null; }
  clearInterval(speech.timer);
  refs.btnMic.classList.remove('recording');
  refs.btnMic.innerHTML = '<i class="fa-solid fa-microphone"></i> 音声入力';
  refs.recIndicator.hidden = true;
  refs.recTime.textContent = '0:00';
  refs.interimBar.classList.remove('show');
}
