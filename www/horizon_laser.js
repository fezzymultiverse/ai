/* HORIZON V1.76.0 · Laser pulse (Thought process bar + header pill).
   A thin hot line with bloom sweeps over the dotted segments while the AI thinks, and along the bottom edge of the pill while a reply runs.
   JavaScript moves the beam every frame (it sets --lx on the element), so Android's "Remove animations" / reduce-motion
   setting can not freeze it. The ::after of .th-bar and the .hzc-lz element in the pill draw the beam from --lx (see index.html and horizon_v2.css).
   The loop starts by itself when a live target exists and stops by itself when none is left.
   window.HzLaser.sweep(el, ms): one last fast pass (T4). Used when a thought bar finishes and when the pill goes idle. */
(function () {
  'use strict';
  var SWEEP = 0.85;   /* seconds the beam takes to cross while thinking */
  var GAP = 0.2;      /* short rest before the next sweep */
  var FROM = -0.55, TO = 1.55; /* --lx range: beam starts fully left of the element and ends fully right of it */
  var LIVE = '.th-bar:not(.done), .hzc-cap.busy';
  var raf = 0, watch = 0;

  function frame(ms) {
    raf = 0;
    var els = document.querySelectorAll(LIVE);
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
  function check() { if (!raf && document.querySelector(LIVE)) kick(); }

  /* T4: one fast pass left to right, then the beam is gone and the element keeps its settled look */
  function sweep(el, ms) {
    if (!el) return;
    ms = ms || 520;
    el.classList.add('lz-final');
    var t0 = 0;
    function step(now) {
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
    if (watch) return;
    watch = setInterval(check, 300);
    check();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
