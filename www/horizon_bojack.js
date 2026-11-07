/* HORIZON V1.36.0 · Bojack Security add-ons.
   1. Live now-playing waveform (strip, mini player, player card).
   2. Waveform for voice notes while they play.
   3. Coloured real SVG icons in the plus (Tools) menu.
   4. AI typing speed buttons in PERSONALISATION.
   5. Terminal HUD + faint code rain. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var lsGet = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full */ } };

  /* ---------------------------------------------------------------- 1. now-playing waveform */
  function ensureCardWave() {
    var card = document.getElementById('mpCard'), mini = document.getElementById('mpMini');
    [card, mini].forEach(function (host) {
      if (!host || host.querySelector('.hz-wavebar')) return;
      var w = document.createElement('div'); w.className = 'hz-wavebar'; w.setAttribute('aria-hidden', 'true');
      for (var i = 0; i < 28; i++) w.appendChild(document.createElement('i'));
      var art = host.querySelector('.mp-card-art') || host.querySelector('.mp-mini-top');
      if (art && art.parentNode === host) host.insertBefore(w, art.nextSibling); else host.appendChild(w);
    });
  }
  var wasOn = null;
  function waveTick() {
    ensureCardWave();
    var on = !!$('#mpNow.playing, #mpMini.playing');
    var bars = $$('.mp-wave i, .hz-wavebar i');
    $$('.hz-wavebar').forEach(function (w) { w.classList.toggle('live', on); });
    if (!on && wasOn === false && !bars.some(function (b) { return !b.dataset.rest; })) return;
    var t = Date.now() / 1000;
    var beat = 0.62 + 0.38 * Math.abs(Math.sin(t * 2.1));
    bars.forEach(function (b, idx) {
      var i = idx % 28;
      if (!on) { b.style.height = '14%'; b.dataset.rest = '1'; return; }
      delete b.dataset.rest;
      var v = 0.5 + 0.5 * Math.sin(t * (3 + (i % 5) * 0.9) + i * 1.7);
      var v2 = 0.5 + 0.5 * Math.sin(t * 1.3 + i * 0.6);
      b.style.height = (14 + 86 * v * (0.35 + 0.65 * v2) * beat).toFixed(1) + '%';
    });
    wasOn = on;
  }
  var waveSkip = 0;   // V1.38.0: while typing, the wave runs at a fifth of its speed so the keyboard stays smooth
  var idleSkip = 0;   // V1.47.0: with nothing playing the wave only looks again every 4th beat (about 4 DOM searches per 70 ms before)
  setInterval(function () {
    if (document.hidden) return;
    if (window.hzTyping && (++waveSkip % 5)) return;
    if (wasOn === false && (++idleSkip % 4)) return;
    waveTick();
  }, 70);

  /* ---------------------------------------------------------------- 2. voice note waveform */
  var N = 56;
  function pseudo(seed) {
    var out = [], s = seed || 7;
    for (var i = 0; i < N; i++) { s = (s * 9301 + 49297) % 233280; out.push(0.25 + 0.75 * (s / 233280) * (0.6 + 0.4 * Math.sin(i / 4))); }
    return out;
  }
  function decodePeaks(src) {
    return fetch(src).then(function (r) { return r.arrayBuffer(); }).then(function (ab) {
      var AC = window.AudioContext || window.webkitAudioContext; var ctx = new AC();
      return new Promise(function (res, rej) {
        var p = ctx.decodeAudioData(ab, res, rej); if (p && p.catch) p.catch(rej);
      }).then(function (buf) {
        try { ctx.close(); } catch (e) { /* ignore */ }
        var d = buf.getChannelData(0), seg = Math.floor(d.length / N) || 1, peaks = [], mx = 0.0001;
        for (var i = 0; i < N; i++) {
          var sum = 0, from = i * seg, to = Math.min(d.length, from + seg), step = Math.max(1, Math.floor((to - from) / 400)), n = 0;
          for (var j = from; j < to; j += step) { sum += d[j] * d[j]; n++; }
          var rms = Math.sqrt(sum / (n || 1)); peaks.push(rms); if (rms > mx) mx = rms;
        }
        return peaks.map(function (p) { return Math.max(0.12, Math.min(1, p / mx)); });
      });
    });
  }
  function decorateVoice(au) {
    if (au.dataset.hzw) return; au.dataset.hzw = '1';
    var wrap = document.createElement('div'); wrap.className = 'hz-vwave'; wrap.setAttribute('role', 'slider'); wrap.setAttribute('aria-label', 'Voice note waveform, tap to seek');
    var bars = [];
    for (var i = 0; i < N; i++) { var b = document.createElement('i'); wrap.appendChild(b); bars.push(b); }
    au.parentNode.insertBefore(wrap, au);
    var peaks = pseudo(au.src ? au.src.length : 3), raf = 0;
    function paint(live) {
      var dur = au.duration && isFinite(au.duration) ? au.duration : 0;
      var pos = dur ? au.currentTime / dur : 0, head = Math.floor(pos * N), t = Date.now() / 1000;
      wrap.classList.toggle('live', !!live);
      for (var k = 0; k < N; k++) {
        var h = peaks[k] * 100, sc = 1;
        if (live && Math.abs(k - head) < 4) sc = 1 + 0.35 * Math.sin(t * 14 + k) * (1 - Math.abs(k - head) / 4);
        bars[k].style.height = Math.max(8, h) + '%';
        bars[k].style.transform = 'scaleY(' + sc.toFixed(2) + ')';
        bars[k].className = (k <= head && (pos > 0 || live) ? 'on' : '') + (k === head && live ? ' head' : '');
      }
    }
    function loop() { paint(!au.paused && !au.ended); raf = (!au.paused && !au.ended && document.body.contains(wrap)) ? requestAnimationFrame(loop) : 0; }
    ['play', 'playing'].forEach(function (e) { au.addEventListener(e, function () { if (!raf) loop(); }); });
    ['pause', 'ended', 'seeked', 'timeupdate', 'loadedmetadata'].forEach(function (e) { au.addEventListener(e, function () { if (!raf) paint(!au.paused && !au.ended); }); });
    wrap.addEventListener('click', function (ev) {
      var r = wrap.getBoundingClientRect(), f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
      if (au.duration && isFinite(au.duration)) { au.currentTime = f * au.duration; if (au.paused) { var p = au.play(); if (p && p.catch) p.catch(function () { /* needs a tap */ }); } }
    });
    paint(false);
    if (au.src) decodePeaks(au.src).then(function (p) { peaks = p; paint(!au.paused); }).catch(function () { /* keep the generated shape */ });
  }
  new MutationObserver(function () { $$('.att-pv-body audio').forEach(decorateVoice); }).observe(document.body, { childList: true, subtree: true });

  /* ---------------------------------------------------------------- 3. coloured tool icons */
  var ICONS = {
    'tm-web': '<svg viewBox="0 0 24 24"><defs><linearGradient id="bjw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><circle cx="12" cy="12" r="9.5" fill="url(#bjw)"/><g fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"><ellipse cx="12" cy="12" rx="4" ry="9.5"/><path d="M2.5 12h19M4 7.5h16M4 16.5h16"/></g></svg>',
    'tm-yt': '<svg viewBox="0 0 24 24"><rect x="1.5" y="4.5" width="21" height="15" rx="4.5" fill="#ff0000"/><path d="M10 8.7v6.6l5.7-3.3z" fill="#fff"/></svg>',
    'tm-gh': '<svg viewBox="0 0 24 24"><path fill="#c4b5fd" d="M12 .8a11.2 11.2 0 0 0-3.54 21.83c.56.1.77-.24.77-.54v-1.9c-3.12.68-3.78-1.5-3.78-1.5-.5-1.3-1.25-1.64-1.25-1.64-1-.7.08-.68.08-.68 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.4-1.22.72-1.5-2.5-.28-5.1-1.25-5.1-5.55 0-1.23.44-2.23 1.16-3.02-.12-.28-.5-1.43.1-2.98 0 0 .95-.3 3.1 1.15a10.7 10.7 0 0 1 5.64 0c2.15-1.45 3.1-1.15 3.1-1.15.6 1.55.22 2.7.1 2.98.72.8 1.16 1.8 1.16 3.02 0 4.32-2.62 5.27-5.12 5.54.4.35.77 1.04.77 2.1v3.1c0 .3.2.65.78.54A11.2 11.2 0 0 0 12 .8z"/></svg>',
    'tm-music': '<svg viewBox="0 0 24 24"><defs><linearGradient id="bjm" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f472b6"/><stop offset="1" stop-color="#a855f7"/></linearGradient></defs><circle cx="12" cy="12" r="10" fill="url(#bjm)"/><path d="M15.8 6.4v8.2a2.6 2.6 0 1 1-1.5-2.35V8.4l-4.3 1v6.2a2.6 2.6 0 1 1-1.5-2.35V7.9z" fill="#fff"/></svg>',
    'tm-img': '<svg viewBox="0 0 24 24"><rect x="2" y="3.5" width="20" height="17" rx="4" fill="#1a2e05" stroke="#a3e635" stroke-width="1.5"/><circle cx="8.2" cy="9" r="2" fill="#facc15"/><path d="M3.5 18.5l5.2-5.2 3.6 3.6 3.2-3.2 5 4.8" fill="none" stroke="#a3e635" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    'tm-vault': '<svg viewBox="0 0 24 24"><path d="M7.5 10.5V8a4.5 4.5 0 0 1 9 0v2.5" fill="none" stroke="#fdba74" stroke-width="2" stroke-linecap="round"/><rect x="4.5" y="10.5" width="15" height="10.5" rx="3" fill="#f97316"/><circle cx="12" cy="15.2" r="1.7" fill="#1c0a00"/><path d="M12 16.4v2.3" stroke="#1c0a00" stroke-width="1.7" stroke-linecap="round"/></svg>',
    'tm-screen': '<svg viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="13" rx="3" fill="#083344" stroke="#22d3ee" stroke-width="1.6"/><path d="M8 21h8M12 17v4" stroke="#22d3ee" stroke-width="1.8" stroke-linecap="round"/><path d="M6 11.5l2.2-2.6 2.6 3 2-2 3.2 3.6" fill="none" stroke="#67e8f9" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  function paintToolIcons() {
    Object.keys(ICONS).forEach(function (id) {
      var ic = $('#' + id + ' .tm-ic'); if (!ic || ic.dataset.bj) return;
      ic.dataset.bj = '1'; ic.innerHTML = ICONS[id];
    });
  }

  /* ---------------------------------------------------------------- 4. AI typing speed */
  function paintType() {
    var cur = lsGet('horizon_type_speed') || 'fast';
    $$('#typeMenu [data-type-opt]').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.typeOpt === cur)); });
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-type-opt]');
    if (!b) return;
    lsSet('horizon_type_speed', b.dataset.typeOpt); paintType();
    var s = $('#typeStatus'); if (s) s.textContent = 'Typing speed: ' + b.dataset.typeOpt;
  });

  /* ---------------------------------------------------------------- 5. terminal HUD + rain */
  var rainRaf = 0, rainCtx = null, drops = [];
  function startRain(term) {
    var out = $('.hzt-out', term); if (!out || $('.hzt-rain', term)) return;
    var cv = document.createElement('canvas'); cv.className = 'hzt-rain'; term.insertBefore(cv, out);
    rainCtx = cv.getContext('2d');
    var glyphs = '01<>/\\{}$#@&%*+=\u25C6\u26A1'.split(''), size = 13, last = 0;
    function resize() { cv.width = term.clientWidth; cv.height = term.clientHeight; drops = new Array(Math.ceil(cv.width / size)).fill(0).map(function () { return Math.random() * -40; }); }
    resize(); window.addEventListener('resize', resize);
    var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* default */ }
    (function frame(ts) {
      rainRaf = requestAnimationFrame(frame);
      if (term.hidden || document.hidden || reduce || ts - last < 70) return;
      last = ts;
      rainCtx.fillStyle = 'rgba(7,4,15,.14)'; rainCtx.fillRect(0, 0, cv.width, cv.height);
      rainCtx.font = size + 'px monospace';
      for (var i = 0; i < drops.length; i++) {
        rainCtx.fillStyle = Math.random() > .93 ? '#ff2bd6' : (i % 3 ? '#8b5cf6' : '#00f0ff');
        rainCtx.fillText(glyphs[(Math.random() * glyphs.length) | 0], i * size, drops[i] * size);
        if (drops[i] * size > cv.height && Math.random() > .975) drops[i] = 0; drops[i] += 1;
      }
    })(0);
  }
  function startHud(term) {
    if ($('.hzt-hud', term)) return;
    var hud = document.createElement('div'); hud.className = 'hzt-hud';
    var bar = $('.hzt-bar', term); bar.parentNode.insertBefore(hud, bar.nextSibling);
    var t0 = Date.now(), batt = null;
    var mk = function (cls) { var s = document.createElement('span'); s.className = 'hzt-chip ' + cls; hud.appendChild(s); return s; };
    var cClock = mk('pk'), cUp = mk('pu'), cNet = mk('gr'), cBat = mk('gr'), cSec = mk('');
    cSec.textContent = '\u26A1 NO ROOT \u00B7 SANDBOXED';
    if (navigator.getBattery) navigator.getBattery().then(function (b) { batt = b; }).catch(function () { /* no battery api */ });
    function pad(n) { return String(n).padStart(2, '0'); }
    function tick() {
      if (term.hidden) return;
      var d = new Date(), up = Math.floor((Date.now() - t0) / 1000);
      cClock.textContent = '\u25C6 ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
      cUp.textContent = 'UP ' + pad(Math.floor(up / 60)) + ':' + pad(up % 60);
      var c = navigator.connection;
      cNet.textContent = (navigator.onLine ? 'NET ' + ((c && (c.effectiveType || '').toUpperCase()) || 'ON') : 'NET OFF');
      cBat.textContent = batt ? 'BAT ' + Math.round(batt.level * 100) + '%' + (batt.charging ? '\u26A1' : '') : 'BAT --';
    }
    tick(); setInterval(tick, 1000);
  }
  function watchTerminal() {
    var term = document.getElementById('hzTerm');
    if (term) { startHud(term); startRain(term); return true; }
    return false;
  }

  /* ---------------------------------------------------------------- boot + light polling for lazily built UI */
  function sweep() { paintToolIcons(); paintType(); $$('.att-pv-body audio').forEach(decorateVoice); watchTerminal(); }
  document.addEventListener('DOMContentLoaded', sweep);
  window.addEventListener('load', sweep);
  setInterval(function () { if (!window.hzTyping && !document.hidden) sweep(); }, 1500);   // V1.47.0: also not while the app is hidden   // V1.38.0: no sweep while typing
  sweep();
})();
