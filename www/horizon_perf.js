/* HORIZON V1.58.3 · keyboard guard + lag detector V2.
   1. Keyboard guard: while the on-screen keyboard slides in or out, window.hzKbBusy is true and <html> carries .hz-kb-moving until the
      page has been still for 220 ms. While the message box has focus, <html> carries .hz-kb-open. CSS pauses decorative animations
      under either class. Other code (dashboard fit, music wave, background sweep) waits for 'hz-kb-settled'.
   2. Lag detector: type /lag in the message box. It records slow frames (which file and function ran, how long scripts and
      style+layout took), slow keys and long tasks in memory only, measures the real refresh rate while open, offers test switches,
      and copies a short plain-text report. Nothing is stored or sent anywhere. */
(function () {
  'use strict';
  var de = document.documentElement;
  var VERSION = 'V1.63.3';
  var LONG_MS = 50, KEY_MS = 40, KEEP = 60;
  var tasks = [], keys = [], slow = [], worst = [], kbMoves = 0, loafOk = false;
  var kbTimer = 0, isOpen = false, panel = null, pre = null, btnCopy = null, uiTimer = 0, rafId = 0;
  var frames = [], hz = 0, hzPeak = 0;
  var chips = {}, swOn = {};

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
  var nativeUntil = 0;   // while Android says the keyboard is sliding, resize events must not shorten the wait
  function kbCheck() {
    if (Date.now() < nativeUntil) return;
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

  /* V1.63.0: Android tells us the exact start and end of the keyboard slide (MainActivity.watchKeyboard).
     moving=true  -> busy now; a 1.2 s watchdog guarantees the page can never stay stuck if the end signal is lost.
     moving=false -> settle right away (one re-fit), and if the keyboard is now hidden while the message box still has focus,
                     drop that focus so the next tap on the box lifts the keyboard again instead of doing nothing. */
  window.hzKbNative = function (moving, visible) {
    clearTimeout(kbTimer);
    if (moving) {
      nativeUntil = Date.now() + 1200;
      if (!window.hzKbBusy) { window.hzKbBusy = true; kbMoves++; de.classList.add('hz-kb-moving'); }
      kbTimer = setTimeout(function () { nativeUntil = 0; kbSettle(); }, 1200);
      return;
    }
    nativeUntil = 0;
    kbTimer = setTimeout(function () {
      kbSettle();
      var a = document.activeElement;
      // Keep editor focus: a late hidden-IME event must not cancel a new focus/composition.
      // Android Back owns dismissal, not a delayed JavaScript blur.
    }, 40);
  };
  window.addEventListener('resize', kbCheck, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', kbCheck, { passive: true });

  var chat = document.getElementById('chatInput');
  if (chat) {
    chat.addEventListener('focus', function () { de.classList.add('hz-kb-open'); }, { passive: true });
    chat.addEventListener('blur', function () { de.classList.remove('hz-kb-open'); }, { passive: true });
    if (document.activeElement === chat) de.classList.add('hz-kb-open');
  }

  /* ---------------------------------------------------------------- recording */
  function push(list, row) { list.push(row); if (list.length > KEEP) list.shift(); }
  function baseName(u) { return String(u || '').replace(/[?#].*$/, '').split('/').pop() || 'inline'; }
  function shortInvoker(s) { return String(s || '').replace(/https?:\/\/[^\/\s]+\//g, '').slice(0, 48); }
  function label(s) {
    return baseName(s.sourceURL) + (s.sourceFunctionName ? ' ' + s.sourceFunctionName : '') + (s.invoker ? ' <' + shortInvoker(s.invoker) + '>' : '');
  }
  function noteWorst(row) {
    worst.push(row);
    worst.sort(function (a, b) { return b.dur - a.dur; });
    if (worst.length > 5) worst.length = 5;
  }
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
          wait: Math.max(0, Math.round(e.processingStart - e.startTime)),               // page was busy before the key was handled
          run: Math.max(0, Math.round(e.processingEnd - e.processingStart)),            // the key handlers themselves
          paint: Math.max(0, Math.round(e.startTime + e.duration - e.processingEnd)),   // layout + drawing afterwards
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
  try {
    new PerformanceObserver(function (list) {
      var es = list.getEntries();
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (e.duration < LONG_MS) continue;
        var sc = e.scripts || [], sum = 0, forced = 0, top = null, j;
        for (j = 0; j < sc.length; j++) {
          sum += sc[j].duration || 0;
          forced += sc[j].forcedStyleAndLayoutDuration || 0;
          if (!top || sc[j].duration > top.duration) top = sc[j];
        }
        var end = e.startTime + e.duration;
        var sl = e.styleAndLayoutStart > 0 ? Math.max(0, end - e.styleAndLayoutStart) : 0;
        var row = { dur: Math.round(e.duration), script: Math.round(sum), sl: Math.round(sl), forced: Math.round(forced),
          top: top ? label(top) : '', typing: !!window.hzTyping, kb: !!window.hzKbBusy };
        push(slow, row);
        noteWorst(row);
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
    loafOk = true;
  } catch (e) { loafOk = false; }

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

  /* ---------------------------------------------------------------- test switches */
  var SW = [
    { id: 'noglow', label: 'Header glow off' },
    { id: 'noanim', label: 'All animations off' },
    { id: 'noshadow', label: 'Shadows + filters off' },
    { id: 'nomsgs', label: 'Hide messages' },
    { id: 'nospell', label: 'Spellcheck off' }
  ];
  function resetStats() { tasks = []; keys = []; slow = []; worst = []; kbMoves = 0; hzPeak = 0; frames = []; }
  function setSwitch(id, on) {
    swOn[id] = !!on;
    if (id === 'nospell') {
      if (chat) chat.setAttribute('spellcheck', on ? 'false' : 'true');
    } else {
      de.classList.toggle('hzp-' + id, !!on);
    }
    if (chips[id]) { chips[id].classList.toggle('on', !!on); chips[id].setAttribute('aria-pressed', on ? 'true' : 'false'); }
  }
  function switchesOn() {
    var a = SW.filter(function (s) { return swOn[s.id]; }).map(function (s) { return s.label; });
    return a.length ? a.join(', ') : 'none';
  }

  /* ---------------------------------------------------------------- report */
  function maxDur(list) { var w = 0; list.forEach(function (r) { if (r.dur > w) w = r.dur; }); return w; }
  function count(list, fn) { var n = 0; list.forEach(function (r) { if (fn(r)) n++; }); return n; }
  function sum(list, k) { var s = 0; list.forEach(function (r) { s += r[k] || 0; }); return s; }
  function env() {
    var ua = navigator.userAgent || '';
    var a = /Android [\d.]+/.exec(ua), c = /Chrome\/[\d.]+/.exec(ua);   // version numbers only, nothing that identifies the phone
    return (a ? a[0] : 'Android ?') + ' \u00b7 WebView ' + (c ? c[0] : '?');
  }
  function diagnosis() {
    if (!keys.length) return slow.length || tasks.length ? 'Slow frames seen, but no slow keys yet.' : 'Nothing slow so far. Type a few sentences with this open.';
    var w = 0, r = 0, p = 0;
    keys.forEach(function (k) { w += k.wait; r += k.run; p += k.paint; });
    if (w >= r && w >= p) return 'Likely: the page was busy with something else when keys arrived (timers or background work).';
    if (r >= p) return 'Likely: the key handlers themselves are slow.';
    return 'Likely: drawing after each key is slow (layout or paint).';
  }
  function culprits() {
    var map = {}, out = [];
    slow.forEach(function (f) {
      if (!f.top) return;
      var m = map[f.top] || (map[f.top] = { name: f.top, n: 0, ms: 0 });
      m.n++; m.ms += f.script;
    });
    Object.keys(map).forEach(function (k) { out.push(map[k]); });
    out.sort(function (a, b) { return b.ms - a.ms; });
    return out.slice(0, 5);
  }
  function report() {
    var L = [], d, s, l, o;
    L.push('Horizon lag report ' + VERSION);
    L.push(env());
    L.push('Switches on: ' + switchesOn());
    L.push('Refresh measured: ' + (hz || 'n/a') + ' Hz (peak ' + (hzPeak || 'n/a') + ')');
    L.push('Keyboard moves: ' + kbMoves);
    if (loafOk) {
      d = sum(slow, 'dur'); s = sum(slow, 'script'); l = sum(slow, 'sl');
      o = Math.max(0, d - s - l);
      L.push('Slow frames >= ' + LONG_MS + ' ms: ' + slow.length + ' (worst ' + maxDur(slow) + ' ms, ' +
        count(slow, function (f) { return f.typing; }) + ' while typing, ' + count(slow, function (f) { return f.kb; }) + ' during a keyboard move)');
      if (d > 0) L.push('  time split: scripts ' + Math.round(100 * s / d) + '% · style+layout ' + Math.round(100 * l / d) + '% · other ' + Math.round(100 * o / d) + '%' +
        (sum(slow, 'forced') ? ' (forced layout ' + sum(slow, 'forced') + ' ms)' : ''));
      culprits().forEach(function (c) { L.push('  script ' + c.n + 'x ' + c.ms + ' ms  ' + c.name); });
      worst.slice(0, 3).forEach(function (f) {
        L.push('  worst frame ' + f.dur + ' ms: scripts ' + f.script + ', style+layout ' + f.sl + (f.top ? ' · ' + f.top : ''));
      });
    } else {
      L.push('Frame attribution: not supported by this WebView');
    }
    L.push('Long tasks >= ' + LONG_MS + ' ms: ' + tasks.length + ' (worst ' + maxDur(tasks) + ' ms)');
    L.push('Slow keys >= ' + KEY_MS + ' ms: ' + keys.length + ' (worst ' + maxDur(keys) + ' ms)');
    L.push(diagnosis());
    keys.slice(-8).forEach(function (k) {
      L.push('  key ' + k.name + ' ' + k.dur + ' ms = wait ' + k.wait + ' + run ' + k.run + ' + paint ' + k.paint + (k.kb ? ' (keyboard moving)' : ''));
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
  function keepFocus(b) {
    // taps on panel buttons must not pull focus out of the message box, so the keyboard stays up while you test
    b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
  }
  function build() {
    panel = el('div', 'hzp'); panel.id = 'hzPerf'; panel.hidden = true;
    panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Lag detector');
    var head = el('div', 'hzp-head');
    head.appendChild(el('b', null, 'LAG DETECTOR'));
    var x = el('button', 'hzp-x', '\u00d7'); x.type = 'button'; x.setAttribute('aria-label', 'Close lag detector');
    head.appendChild(x);
    var sw = el('div', 'hzp-sw');
    SW.forEach(function (s) {
      var c = el('button', 'hzp-chip', s.label); c.type = 'button'; c.setAttribute('aria-pressed', 'false');
      c.addEventListener('click', function () { setSwitch(s.id, !swOn[s.id]); resetStats(); paint(); });
      keepFocus(c); chips[s.id] = c; sw.appendChild(c);
    });
    pre = el('pre', 'hzp-out');
    var hint = el('p', 'hzp-hint', 'Type a few sentences, then Copy report and paste it into your chat with Claude. Flipping a switch starts a fresh measurement. Switches reset when you close this. Nothing is saved or sent.');
    var row = el('div', 'hzp-row');
    btnCopy = el('button', 'hzp-b', 'Copy report'); btnCopy.type = 'button';
    var clr = el('button', 'hzp-b ghost', 'Clear'); clr.type = 'button';
    row.appendChild(btnCopy); row.appendChild(clr);
    panel.appendChild(head); panel.appendChild(sw); panel.appendChild(pre); panel.appendChild(hint); panel.appendChild(row);
    [x, btnCopy, clr].forEach(keepFocus);
    x.addEventListener('click', closePanel);
    btnCopy.addEventListener('click', copy);
    clr.addEventListener('click', function () { resetStats(); paint(); });
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
    SW.forEach(function (s) { if (swOn[s.id]) setSwitch(s.id, false); });   // test switches never linger after the panel is closed
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    clearInterval(uiTimer); uiTimer = 0;
  }

  window.HorizonPerf = { open: openPanel, close: closePanel, report: report, isOpen: function () { return isOpen; } };
})();
