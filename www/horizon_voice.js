/* Horizon V1.28.0: voice notes.
   Tap the microphone in the message pill, talk, tap stop. The note lands in the tray as a card,
   is turned into text (Groq Whisper first, Gemini as the fallback) and goes out with Send.
   Every provider can read it because the AI receives the transcript. */
(function () {
  'use strict';
  const MAX_SECS = 180, MIN_SECS = 0.7, BARS = 22, TICK = 90;
  let host = {}, pill = null, micBtn = null, cancelBtn = null, timeEl = null, levelEl = null, barEls = [];
  let rec = null, starting = false;
  const levels = new Array(BARS).fill(0.08);

  const fmt = s => { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const notice = (t, k) => host.notice && host.notice(t, k);
  const setIcon = (btn, id) => { const u = btn && btn.querySelector('use'); if (u) u.setAttribute('href', '#' + id); };

  function pickMime() {
    if (typeof MediaRecorder === 'undefined') return null;
    const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* try the next one */ } }
    return '';
  }

  // ---- UI ----
  function paintRec(on) {
    if (!pill) return;
    pill.classList.toggle('is-rec', on);
    if (micBtn) {
      micBtn.classList.toggle('rec', on);
      micBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      micBtn.setAttribute('aria-label', on ? 'Stop recording and keep the voice note' : 'Record a voice note');
      micBtn.title = on ? 'Stop recording' : 'Record a voice note';
      setIcon(micBtn, on ? 'i-stop' : 'i-mic');
    }
    const bar = document.getElementById('recBar');
    if (bar) bar.hidden = !on;
    if (!on) { levels.fill(0.08); paintLevels(); if (timeEl) timeEl.textContent = '0:00'; }
  }
  function paintLevels() {
    for (let i = 0; i < barEls.length; i++) barEls[i].style.transform = 'scaleY(' + levels[i].toFixed(3) + ')';
  }

  // ---- recording ----
  async function start() {
    if (rec || starting) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || typeof MediaRecorder === 'undefined') {
      notice('This device cannot record audio here.', 'error'); return;
    }
    if (window.HorizonAttach && HorizonAttach.full()) { notice('Up to 6 files per message. Remove one first.', 'error'); return; }
    starting = true;
    try {
      if (host.micAllowed && !(await host.micAllowed())) return;
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
      catch (e) {
        notice(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
          ? 'Microphone permission was denied. Allow it for Horizon in your phone settings.'
          : 'Could not open the microphone: ' + (e && e.message ? e.message : 'unknown error'), 'error');
        return;
      }
      const mime = pickMime();
      let mr;
      try { mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
      catch (e) { stream.getTracks().forEach(t => t.stop()); notice('Could not start the recorder: ' + (e && e.message ? e.message : 'unknown error'), 'error'); return; }
      const r = { stream, mr, chunks: [], t0: Date.now(), mime: (mr.mimeType || mime || 'audio/webm'), discard: false, resolve: null, done: false, timer: 0, ctx: null, an: null, buf: null };
      mr.ondataavailable = e => { if (e.data && e.data.size) r.chunks.push(e.data); };
      mr.onstop = () => onStopped(r);
      mr.onerror = () => { notice('Recording stopped unexpectedly.', 'error'); if (rec === r) stopRec(false); };
      stream.getAudioTracks().forEach(t => t.addEventListener('ended', () => { if (rec === r) stopRec(false); }));
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        r.ctx = new AC();
        const src = r.ctx.createMediaStreamSource(stream);
        r.an = r.ctx.createAnalyser(); r.an.fftSize = 512; src.connect(r.an);
        r.buf = new Uint8Array(r.an.fftSize);
      } catch (e) { r.an = null; }
      mr.start(250);
      rec = r;
      paintRec(true);
      r.timer = setInterval(() => tick(r), TICK);
    } finally { starting = false; }
  }

  function tick(r) {
    if (rec !== r) return;
    const secs = (Date.now() - r.t0) / 1000;
    if (timeEl) timeEl.textContent = fmt(secs);
    let lv = 0.12;
    if (r.an) {
      r.an.getByteTimeDomainData(r.buf);
      let sum = 0;
      for (let i = 0; i < r.buf.length; i++) { const v = (r.buf[i] - 128) / 128; sum += v * v; }
      lv = Math.min(1, 0.1 + Math.sqrt(sum / r.buf.length) * 5.5);
    } else lv = 0.15 + Math.random() * 0.5;
    levels.shift(); levels.push(lv); paintLevels();
    if (secs >= MAX_SECS) { notice('3 minute limit reached. Keeping what you recorded.'); stopRec(false); }
  }

  function stopRec(discard) {
    const r = rec;
    if (!r) return Promise.resolve(false);
    r.discard = !!discard;
    return new Promise(res => {
      const prev = r.resolve; r.resolve = ok => { res(ok); if (prev) prev(ok); };
      try { if (r.mr.state !== 'inactive') r.mr.stop(); else onStopped(r); } catch (e) { onStopped(r); }
    });
  }

  async function onStopped(r) {
    if (r.done) return;
    r.done = true;
    clearInterval(r.timer);
    try { r.stream.getTracks().forEach(t => t.stop()); } catch (e) { /* already stopped */ }
    try { if (r.ctx) r.ctx.close(); } catch (e) { /* already closed */ }
    if (rec === r) rec = null;
    paintRec(false);
    let ok = false;
    if (!r.discard) {
      const secs = (Date.now() - r.t0) / 1000;
      if (secs < MIN_SECS || !r.chunks.length) notice('That was too short. Tap the microphone, talk, then tap stop.');
      else {
        const blob = new Blob(r.chunks, { type: String(r.mime).split(';')[0] || 'audio/webm' });
        ok = await HorizonAttach.addVoice(blob, secs);
      }
    }
    if (r.resolve) r.resolve(ok);
  }

  // ---- speech to text ----
  const b64 = blob => new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1] || ''); f.onerror = () => no(new Error('Could not read the recording.')); f.readAsDataURL(blob); });
  const wstr = (dv, o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };

  // 16 kHz mono 16-bit WAV: small, and every speech API accepts it
  async function toWav(blob) {
    const AC = window.AudioContext || window.webkitAudioContext, OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const ctx = new AC();
    try {
      const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
      const rate = 16000, len = Math.max(1, Math.ceil(audio.duration * rate));
      const off = new OAC(1, len, rate);
      const src = off.createBufferSource(); src.buffer = audio; src.connect(off.destination); src.start();
      const pcm = (await off.startRendering()).getChannelData(0);
      const buf = new ArrayBuffer(44 + pcm.length * 2), dv = new DataView(buf);
      wstr(dv, 0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); wstr(dv, 8, 'WAVE'); wstr(dv, 12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, rate, true);
      dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); wstr(dv, 36, 'data'); dv.setUint32(40, pcm.length * 2, true);
      for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); dv.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
      return new Blob([buf], { type: 'audio/wav' });
    } finally { try { ctx.close(); } catch (e) { /* already closed */ } }
  }

  async function failText(res) {
    try { const j = await res.json(); const e = j && j.error; return (typeof e === 'string' ? e : e && e.message) || ('HTTP ' + res.status); }
    catch (e) { return 'HTTP ' + res.status; }
  }
  function withTimeout(fn, ms) {
    const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const t = setTimeout(() => { if (ac) ac.abort(); }, ms);
    return fn(ac ? ac.signal : undefined).finally(() => clearTimeout(t));
  }

  async function viaGroq(file, name, key) {
    const f = window.CapacitorWebFetch || window.fetch.bind(window);   // plain WebView fetch, so the multipart upload stays intact
    const fd = new FormData();
    fd.append('file', file, name);
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('response_format', 'json');
    fd.append('temperature', '0');
    const res = await withTimeout(signal => f('https://api.groq.com/openai/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd, signal }), 60000);
    if (!res.ok) throw new Error('Groq: ' + await failText(res));
    const j = await res.json();
    return String(j.text || '').trim();
  }
  async function viaGemini(file, mime, key) {
    const data = await b64(file);
    const body = JSON.stringify({
      contents: [{ role: 'user', parts: [
        { text: 'Transcribe this voice note word for word in the language spoken. Return only the transcript, no commentary. If there is no speech, return exactly: [no speech]' },
        { inlineData: { mimeType: mime, data } }
      ] }],
      generationConfig: { temperature: 0 }
    });
    const res = await withTimeout(signal => fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body, signal }), 90000);
    if (!res.ok) throw new Error('Gemini: ' + await failText(res));
    const j = await res.json();
    const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
    return parts.map(p => p.text || '').join('').trim();
  }

  async function transcribe(blob) {
    const keysOf = id => (host.keys ? host.keys(id) : []).filter(Boolean);
    const groq = keysOf('groq'), gem = keysOf('gemini');
    if (!groq.length && !gem.length) throw new Error('Add a Groq or Gemini key in API PROVIDERS PLUS KEYS to send voice notes.');
    let file = blob, name = 'voice.' + (/mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm'), mime = blob.type || 'audio/webm';
    try { file = await toWav(blob); name = 'voice.wav'; mime = 'audio/wav'; } catch (e) { /* send the original recording */ }
    let last = null;
    const attempts = [];
    groq.slice(0, 2).forEach(k => attempts.push(() => viaGroq(file, name, k)));
    if (mime === 'audio/wav' || /ogg|mp4|mpeg|aac/.test(mime)) gem.slice(0, 2).forEach(k => attempts.push(() => viaGemini(file, mime, k)));
    if (!attempts.length) throw new Error('This recording needs a Groq key to be read.');
    for (const run of attempts) {
      try {
        const text = await run();
        if (!text || /^\[?\s*no speech\s*\]?\.?$/i.test(text)) throw new Error('No speech heard in that recording.');
        return text;
      } catch (e) {
        if (e && /No speech heard/.test(e.message)) throw e;
        last = e;
      }
    }
    throw new Error(last && last.message ? last.message : 'Could not transcribe the voice note.');
  }

  // ---- wiring ----
  function init(h) {
    host = h || {};
    pill = document.querySelector('.chat-input-area');
    micBtn = document.getElementById('micBtn');
    cancelBtn = document.getElementById('recCancel');
    timeEl = document.getElementById('recTime');
    levelEl = document.getElementById('recLevel');
    if (levelEl) {
      levelEl.replaceChildren();
      barEls = [];
      for (let i = 0; i < BARS; i++) { const b = document.createElement('i'); levelEl.appendChild(b); barEls.push(b); }
      paintLevels();
    }
    if (micBtn) micBtn.addEventListener('click', e => { e.preventDefault(); if (rec) stopRec(false); else start(); });
    if (cancelBtn) cancelBtn.addEventListener('click', e => { e.preventDefault(); stopRec(true); });
    window.addEventListener('pagehide', () => { if (rec) stopRec(true); });
    paintRec(false);
  }

  window.HorizonVoice = { init, transcribe, recording: () => !!rec, finish: () => stopRec(false), cancel: () => stopRec(true), toggle: () => (rec ? stopRec(false) : start()) };
})();
