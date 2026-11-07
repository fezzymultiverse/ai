/* HORIZON V1.58.2 · keyboard guard + lag detector.
   1. Keyboard guard: while the on-screen keyboard slides in or out, window.hzKbBusy is true and <html> carries .hz-kb-moving until the
      page has been still for 220 ms. Other code (dashboard fit, music wave, background sweep) waits instead of re-measuring the page
      mid-slide, then gets one 'hz-kb-settled' event.
   2. Lag detector: type /lag in the message box. It records slow keys (Event Timing) and long tasks in memory only, measures the real
      refresh rate while it is open, and copies a short plain-text report. Nothing is stored or sent anywhere. */
(function () {
  'use strict';
  var de = document.documentElement;
  var VERSION = 'V1.58.2';
  var LONG_MS = 50, KEY_MS = 40, KEEP = 60;
  var tasks = [], keys = [], kbMoves = 0;
  var kbTimer = 0, isOpen = false, panel = null, pre = null, btnCopy = null, uiTimer = 0, rafId = 0;
  var frames = [], hz = 0, hzPeak = 0;

  function vh() { return window.visualViewport ? window.visualViewport.height : window.innerHeight; }

  /* ---------------------------------------------------------------- keyboard guard */
  var settledH = vh();
  window.hzKbBusy = false;
  function kbSettle() {
    kbTimer = 0;
    settledH = vh();
    window.hzKbBusy = false;
    de.classList.remove('hz-kb-moving');
    try { window.dispatchEvent(new Event('hz-kb-settled')); } catch (e) { /* very old WebView */ }
  }
  function kbCheck() {
    var h = vh();
    if (!window.hzKbBusy) {
      if (Math.abs(h - settledH) < 80) return;   // only keyboard-sized changes count
      window.hzKbBusy = true; kbMoves++;
      de.classList.add('hz-kb-moving');
    }
    clearTimeout(kbTimer);
    kbTimer = setTimeout(kbSettle, 220);
  }
  window.hzKbCheck = kbCheck;
  window.addEventListener('resize', kbCheck, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', kbCheck, { passive: true });

  /* ---------------------------------------------------------------- slow keys and long tasks */
  function push(list, row) { list.push(row); if (list.length > KEEP) list.shift(); }
  var KEYNAMES = { keydown: 1, keyup: 1, keypress: 1, input: 1, beforeinput: 1, compositionstart: 1, compositionupdate: 1, compositionend: 1 };
  try {
    new PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (!KEYNAMES[e.name] || e.duration < KEY_MS) continue;
        push(keys, {
          name: e.name,
          dur: Math.round(e.duration),
          wait: Math.max(0, Math.round(e.processingStart - e.startTime)),          // page was busy before the key was even handled
          run: Math.max(0, Math.round(e.processingEnd - e.processingStart)),       // the key handlers themselves
          paint: Math.max(0, Math.round(e.startTime + e.duration - e.processingEnd)), // layout + drawing afterwards
          kb: !!window.hzKbBusy
        });
      }
    }).observe({ type: 'event', durationThreshold: KEY_MS, buffered: true });
  } catch (e) { /* Event Timing not available */ }
  try {
    new PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var i = 0; i < es.length; i++) {
        if (es[i].duration < LONG_MS) continue;
        push(tasks, { dur: Math.round(es[i].duration), typing: !!window.hzTyping, kb: !!window.hzKbBusy });
      }
    }).observe({ type: 'longtask', buffered: true });
  } catch (e) { /* Long Tasks not available */ }

  /* ---------------------------------------------------------------- refresh-rate meter (runs only while the panel is open) */
  function frame(t) {
    rafId = requestAnimationFrame(frame);
    frames.push(t);
    if (frames.length > 90) frames.shift();
    if (frames.length < 30) return;
    var gaps = [], i;
    for (i = 1; i < frames.length; i++) gaps.push(frames[i] - frames[i - 1]);
    gaps.sort(function (a, b) { return a - b; });
    var med = gaps[gaps.length >> 1];   // median gap, so one slow frame does not drag the number down
    hz = med > 0 ? Math.round(1000 / med) : 0;
    if (hz > hzPeak) hzPeak = hz;
  }

  /* ---------------------------------------------------------------- report */
  function worst(list) { var w = 0; list.forEach(function (r) { if (r.dur > w) w = r.dur; }); return w; }
  function count(list, fn) { var n = 0; list.forEach(function (r) { if (fn(r)) n++; }); return n; }
  function env() {
    var ua = navigator.userAgent || '';
    var a = /Android [\d.]+/.exec(ua), c = /Chrome\/[\d.]+/.exec(ua);   // version numbers only, nothing that identifies the phone
    return (a ? a[0] : 'Android ?') + ' \u00b7 WebView ' + (c ? c[0] : '?');
  }
  function diagnosis() {
    if (!keys.length) return tasks.length ? 'Slow tasks seen, but no slow keys yet.' : 'Nothing slow so far. Type a few sentences with this open.';
    var w = 0, r = 0, p = 0;
    keys.forEach(function (k) { w += k.wait; r += k.run; p += k.paint; });
    if (w >= r && w >= p) return 'Likely: the page was busy with something else when keys arrived (timers or background work).';
    if (r >= p) return 'Likely: the key handlers themselves are slow.';
    return 'Likely: drawing after each key is slow (layout or paint).';
  }
  function report() {
    var L = [];
    L.push('Horizon lag report ' + VERSION);
    L.push(env());
    L.push('Refresh measured: ' + (hz || 'n/a') + ' Hz (peak ' + (hzPeak || 'n/a') + ')');
    L.push('Keyboard moves: ' + kbMoves);
    L.push('Long tasks >= ' + LONG_MS + ' ms: ' + tasks.length + ' (worst ' + worst(tasks) + ' ms, ' +
      count(tasks, function (t) { return t.typing; }) + ' while typing, ' + count(tasks, function (t) { return t.kb; }) + ' during a keyboard move)');
    L.push('Slow keys >= ' + KEY_MS + ' ms: ' + keys.length + ' (worst ' + worst(keys) + ' ms)');
    L.push(diagnosis());
    keys.slice(-12).forEach(function (k) {
      L.push('  key ' + k.name + ' ' + k.dur + ' ms = wait ' + k.wait + ' + run ' + k.run + ' + paint ' + k.paint + (k.kb ? ' (keyboard moving)' : ''));
    });
    tasks.slice(-8).forEach(function (t) {
      L.push('  task ' + t.dur + ' ms' + (t.typing ? ' (typing)' : '') + (t.kb ? ' (keyboard moving)' : ''));
    });
    return L.join('\n');
  }

  /* ---------------------------------------------------------------- panel */
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function paint() { if (pre) pre.textContent = report(); }
  function fallbackCopy(txt, done) {
    var ta = document.createElement('textarea');
    ta.value = txt; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
    document.body.appendChild(ta); ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    done(ok);
  }
  function copy() {
    var txt = report();
    function done(ok) {
      btnCopy.textContent = ok ? 'Copied' : 'Copy failed';
      setTimeout(function () { if (btnCopy) btnCopy.textContent = 'Copy report'; }, 1500);
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { fallbackCopy(txt, done); });
        return;
      }
    } catch (e) { /* fall through */ }
    fallbackCopy(txt, done);
  }
  function build() {
    panel = el('div', 'hzp'); panel.id = 'hzPerf'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Lag detector');
    var head = el('div', 'hzp-head');
    head.appendChild(el('b', null, 'LAG DETECTOR'));
    var x = el('button', 'hzp-x', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Close lag detector');
    head.appendChild(x);
    pre = el('pre', 'hzp-out');
    var hint = el('p', 'hzp-hint', 'Keep this open and type a few sentences, then tap Copy report and paste it into your chat with Claude. Nothing is saved or sent anywhere.');
    var row = el('div', 'hzp-row');
    btnCopy = el('button', 'hzp-b', 'Copy report'); btnCopy.type = 'button';
    var clr = el('button', 'hzp-b ghost', 'Clear'); clr.type = 'button';
    row.appendChild(btnCopy); row.appendChild(clr);
    panel.appendChild(head); panel.appendChild(pre); panel.appendChild(hint); panel.appendChild(row);
    // taps on these buttons must not pull focus out of the message box, so the keyboard stays up while you test
    [x, btnCopy, clr].forEach(function (b) {
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    });
    x.addEventListener('click', closePanel);
    btnCopy.addEventListener('click', copy);
    clr.addEventListener('click', function () { tasks = []; keys = []; kbMoves = 0; hzPeak = 0; frames = []; paint(); });
    document.body.appendChild(panel);
  }
  function openPanel() {
    if (!panel) build();
    isOpen = true; panel.hidden = false;
    frames = [];
    if (!rafId) rafId = requestAnimationFrame(frame);
    clearInterval(uiTimer); uiTimer = setInterval(paint, 700);
    paint();
    return true;
  }
  function closePanel() {
    isOpen = false;
    if (panel) panel.hidden = true;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    clearInterval(uiTimer); uiTimer = 0;
  }

  window.HorizonPerf = { open: openPanel, close: closePanel, report: report, isOpen: function () { return isOpen; } };
})();
