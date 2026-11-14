/* Event-driven thought/header pulse. No idle polling. Respects reduced motion, editors and background state. */
(function () {
  'use strict';
  var SWEEP = 0.85;   /* seconds the beam takes to cross while thinking */
  var GAP = 0.2;      /* short rest before the next sweep */
  var FROM = -0.55, TO = 1.55; /* --lx range: beam starts fully left of the element and ends fully right of it */
  var LIVE = '.th-bar:not(.done), .hzc-cap.busy';
  var raf = 0, watching = false, targets = [];
  var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  function paused() { return document.hidden || window.hzEditorFocused || window.hzKbBusy || motion.matches; }

  function frame(ms) {
    raf = 0;
    if (paused()) return;
    var els = targets.filter(function (el) { return el.isConnected && el.matches(LIVE); });
    if (!els.length) return;
    var t = (ms / 1000) % (SWEEP + GAP);
    var p = Math.min(1, t / SWEEP);
    /* gentle ease in and out, so the line leaves and arrives softly */
    var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
    var v = (FROM + (TO - FROM) * (0.35 * p + 0.65 * e)).toFixed(3);
    for (var i = 0; i < els.length; i++) els[i].style.setProperty('--lx', v);
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function check() { if (paused()) return; targets = Array.from(document.querySelectorAll(LIVE)); if (!raf && targets.length) kick(); }

  /* T4: one fast pass left to right, then the beam is gone and the element keeps its settled look */
  function sweep(el, ms) {
    if (!el || paused()) return;
    ms = ms || 520;
    el.classList.add('lz-final');
    var t0 = 0;
    function step(now) {
      if (!el.isConnected || paused()) { el.classList.remove('lz-final'); el.style.removeProperty('--lx'); return; }
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / ms);
      var e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      el.style.setProperty('--lx', (FROM + (TO - FROM) * (0.25 * p + 0.75 * e)).toFixed(3));
      if (p < 1) requestAnimationFrame(step);
      else { el.classList.remove('lz-final'); el.style.removeProperty('--lx'); }
    }
    requestAnimationFrame(step);
  }
  window.HzLaser = { sweep: sweep };

  function start() {
    if (watching) return; watching = true;
    var messages = document.getElementById('chatMessages'), pill = document.querySelector('.hzc-cap');
    var observer = new MutationObserver(check);
    if (messages) observer.observe(messages, {childList:true, subtree:true, attributes:true, attributeFilter:['class']});
    if (pill) observer.observe(pill, {attributes:true, attributeFilter:['class']});
    document.addEventListener('visibilitychange', check);
    document.addEventListener('focusout', function () { queueMicrotask(check); });
    window.addEventListener('hz-kb-settled', check);
    if (motion.addEventListener) motion.addEventListener('change', check);
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
