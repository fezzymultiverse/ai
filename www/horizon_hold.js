/* HORIZON V1.93.4 · HOLD TO READ.
   Group chats stream replies from several AIs one after another. Every reply used to drag the chat to the bottom, even while a finger
   was on the screen, so reading, selecting text or scrolling back was impossible until the round ended.
   This file decides when the chat may follow new text:
     - finger down on the chat (touch or mouse)            -> paused
     - a moment after the finger lifts (fling still moving) -> paused
     - text is selected inside the chat (long-press select) -> paused
     - you scrolled up, away from the newest message        -> paused until you come back near the bottom or tap the arrow
   Sending a message, opening a chat or tapping the scroll-to-bottom arrow always jumps down and follows again.
   index.html asks HorizonHold.blocked() before every automatic scroll. Public API: window.HorizonHold = { blocked, pending, stick, suppressed, state }. */
(function () {
  'use strict';
  var sc = document.getElementById('chatScroll');
  if (!sc || window.HorizonHold) return;

  var NEAR = 80;        // px from the bottom that still counts as "at the newest message"
  var GRACE = 900;      // ms after the finger lifts: momentum scrolling keeps moving
  var WATCHDOG = 60000; // a missed touchend can never freeze auto-follow for longer than this
  var touching = false, touchAt = 0, graceUntil = 0, wheelUntil = 0;
  var selecting = false, stuck = true, held = false, lastTop = sc.scrollTop;

  function now() { return Date.now(); }
  function away() { return sc.scrollHeight - sc.scrollTop - sc.clientHeight; }
  function userDriven() { return touching || now() < graceUntil || now() < wheelUntil; }
  function inside(t) { return !!t && (t === sc || sc.contains(t)); }

  function down(e) {
    if (!inside(e.target)) return;
    touching = true; touchAt = now();
  }
  function up() {
    if (!touching) return;
    touching = false; graceUntil = now() + GRACE;
    // finger lifted close to the bottom: follow again. Lifted while new text had piled up below: stay put, the arrow offers "catch up".
    if (away() < NEAR) { stuck = true; held = false; }
    else if (held) stuck = false;
  }
  function onScroll() {
    var top = sc.scrollTop;
    if (userDriven() && top < lastTop - 1) stuck = false;   // the reader moved up: stay where they are
    if (away() < NEAR) { stuck = true; if (!touching && !selecting) held = false; }
    if (userDriven()) graceUntil = Math.max(graceUntil, now() + (touching ? 0 : GRACE));
    lastTop = top;
  }
  function onSelect() {
    var s = null, was = selecting;
    try { s = window.getSelection(); } catch (e) { s = null; }
    selecting = !!(s && !s.isCollapsed && s.rangeCount && inside(s.anchorNode && (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentNode)));
    if (was && !selecting) { if (away() < NEAR) { stuck = true; held = false; } else if (held) stuck = false; }
  }

  sc.addEventListener('touchstart', down, { passive: true });
  sc.addEventListener('touchend', up, { passive: true });
  sc.addEventListener('touchcancel', up, { passive: true });
  sc.addEventListener('mousedown', down, { passive: true });
  window.addEventListener('mouseup', up, { passive: true });
  sc.addEventListener('wheel', function () { wheelUntil = now() + 700; }, { passive: true });
  sc.addEventListener('scroll', onScroll, { passive: true });
  document.addEventListener('selectionchange', onSelect);
  document.addEventListener('visibilitychange', function () { if (document.hidden) { touching = false; graceUntil = 0; } });
  window.addEventListener('blur', function () { touching = false; });

  function blocked() {
    if (touching && now() - touchAt > WATCHDOG) touching = false;
    return touching || selecting || now() < graceUntil || !stuck;
  }
  window.HorizonHold = {
    /* true = an automatic scroll must not move the chat right now */
    blocked: blocked,
    /* true = at least one automatic scroll was skipped since the reader paused (the arrow shows it) */
    pending: function () { return held; },
    /* an automatic scroll was skipped */
    suppressed: function () { held = true; },
    /* jump-and-follow: sending, opening a chat, the arrow */
    stick: function () { stuck = true; held = false; graceUntil = 0; },
    state: function () { return { touching: touching, selecting: selecting, stuck: stuck, held: held, grace: now() < graceUntil, away: Math.round(away()) }; }
  };
})();
