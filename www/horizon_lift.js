/* HORIZON V1.67.1 · message box rides on the keyboard.
   Normally Android shrinks the page above the keyboard (adjustResize) and nothing is needed. On phones where the keyboard instead
   covers the bottom of the page, this finds how much is covered and makes <body> only as tall as the visible area, so the message
   box sits right on top of the keyboard like in the Claude app.
   Sources for "how much is covered", smallest visible height wins:
     1. window.visualViewport (when the WebView only shrinks the visual viewport)
     2. window.hzKbCover(px)  (MainActivity measures the real keyboard against the WebView and calls it)
   When the page already shrank by itself, both say 0 and this file does nothing. */
(function () {
  'use strict';
  var de = document.documentElement, raf = 0, nativeCover = 0, fitted = false, lastVis = 0;
  var baseline = window.innerHeight, lastIH = window.innerHeight, settleTimer = 0;
  var input = document.getElementById('chatInput');
  var scroller = document.getElementById('chatScroll');
  var MIN = 60;   // less than this is not a keyboard

  function atBottom() { return !!scroller && scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90; }
  function toBottom() { if (scroller) scroller.scrollTop = scroller.scrollHeight; }
  function typing() { var a = document.activeElement; return !!a && (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && /^(text|password|search|email|url|number|tel)?$/i.test(a.type || ''))); }

  function measure() {
    raf = 0;
    var ih = window.innerHeight, vv = window.visualViewport, vis = ih;
    if (vv) vis = Math.min(vis, Math.round(vv.height + vv.offsetTop));
    // A resized layout already sits above the IME. Never subtract a stale native overlap twice.
    if (!typing() && !window.hzKbBusy && nativeCover === 0) baseline = ih;
    if (ih > baseline) baseline = ih;
    var layoutResized = baseline - ih > MIN;
    if (nativeCover > 0 && !layoutResized && (!vv || Math.abs(vv.height - ih) < 2)) vis = Math.min(vis, ih - nativeCover);
    lastIH = ih;
    var covered = ih - vis;
    var want = covered > MIN && (typing() || nativeCover > MIN);
    if (want) {
      if (Math.abs(vis - lastVis) > 1 || !fitted) {
        var stick = atBottom();
        de.style.setProperty('--hz-vis', vis + 'px');
        de.classList.add('hz-kb-fit');
        fitted = true; lastVis = vis;
        if (stick) { toBottom(); requestAnimationFrame(toBottom); }
      }
    } else if (fitted) {
      var stick2 = atBottom();
      de.classList.remove('hz-kb-fit');
      de.style.removeProperty('--hz-vis');
      fitted = false; lastVis = 0;
      if (stick2) requestAnimationFrame(toBottom);
    }
    /* a focused field must never scroll the page itself: the header would slide away */
    if (window.pageYOffset || (de.scrollTop > 0)) { window.scrollTo(0, 0); de.scrollTop = 0; if (document.body) document.body.scrollTop = 0; }
  }
  function kick() {
    if (window.hzKbBusy) {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () { if (!raf) raf = requestAnimationFrame(measure); }, 1250);
      return;
    }
    clearTimeout(settleTimer);
    if (!raf) raf = requestAnimationFrame(measure);
  }

  window.hzKbCover = function (px) { nativeCover = Math.max(0, +px || 0); kick(); };

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', kick, { passive: true });
    window.visualViewport.addEventListener('scroll', kick, { passive: true });
  }
  window.addEventListener('resize', kick, { passive: true });
  window.addEventListener('hz-kb-settled', kick);
  document.addEventListener('focusin', kick, { passive: true });
  document.addEventListener('focusout', function () { setTimeout(kick, 80); }, { passive: true });
  if (input) {
    /* if you were at the newest message when you tapped the box, stay on it once the keyboard is up */
    var wasBottom = true;
    input.addEventListener('pointerdown', function () { wasBottom = atBottom(); }, { passive: true });
    input.addEventListener('focus', function () { setTimeout(function () { if (wasBottom) toBottom(); }, 380); }, { passive: true });
  }
  kick();
})();
