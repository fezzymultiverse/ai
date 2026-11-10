/* HORIZON V1.76.0 · scroll-to-bottom button (F11).
   Appears when you scroll up in a chat. Shows how many new AI replies arrived while you were up there.
   Tap = jump to the bottom. Long-press = jump to the previous AI reply (press again to keep going up). */
(function () {
  'use strict';
  var scroll = document.getElementById('chatScroll'), msgs = document.getElementById('chatMessages');
  if (!scroll || !msgs) return;
  var SHOW_AFTER = 260;   /* px above the bottom before the button shows */
  var unread = 0, lp = 0, fired = false, ticking = false;

  var btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'hz-fab'; btn.hidden = true;
  btn.setAttribute('aria-label', 'Scroll to the latest message. Press and hold for the previous AI reply');
  btn.title = 'Tap: latest message. Hold: previous AI reply';
  btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg><b class="hz-fab-n" hidden></b>';
  document.body.appendChild(btn);
  var badge = btn.querySelector('.hz-fab-n');

  function away() { return scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight; }
  function place() {
    var c = document.querySelector('.composer');
    var top = c ? c.getBoundingClientRect().top : window.innerHeight - 120;
    btn.style.bottom = Math.max(70, Math.round(window.innerHeight - top + 12)) + 'px';
  }
  function paint() {
    ticking = false;
    var far = away() > SHOW_AFTER;
    if (!far && unread) unread = 0;
    if (btn.hidden === far) btn.hidden = !far;
    badge.hidden = !(far && unread > 0);
    if (!badge.hidden) badge.textContent = unread > 9 ? '9+' : String(unread);
    if (far) place();
  }
  function schedule() { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }

  function toBottom() {
    unread = 0;
    try { scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' }); } catch (e) { scroll.scrollTop = scroll.scrollHeight; }
    schedule();
  }
  function prevReply() {
    var list = msgs.querySelectorAll('.message.ai:not(#loadingBubble)');
    var edge = scroll.getBoundingClientRect().top;
    for (var i = list.length - 1; i >= 0; i--) {
      var r = list[i].getBoundingClientRect();
      if (r.top < edge - 12) {
        var y = scroll.scrollTop + (r.top - edge) - 8;
        try { scroll.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { scroll.scrollTop = Math.max(0, y); }
        return;
      }
    }
    try { scroll.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { scroll.scrollTop = 0; }
  }

  btn.addEventListener('pointerdown', function () {
    fired = false;
    clearTimeout(lp);
    lp = setTimeout(function () { fired = true; try { if (navigator.vibrate) navigator.vibrate(18); } catch (e) { /* no haptics */ } prevReply(); }, 450);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, function () { clearTimeout(lp); }); });
  btn.addEventListener('click', function (e) { e.preventDefault(); if (fired) { fired = false; return; } toBottom(); });
  btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  scroll.addEventListener('scroll', schedule, { passive: true });
  // V1.93.1: no scroll/layout reads while the keyboard slides; one repaint when it settles
  function onResize() { if (!window.hzKbBusy) schedule(); }
  window.addEventListener('resize', onResize, { passive: true });
  if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('hz-kb-settled', schedule);

  /* count AI replies that land while you are scrolled up. A chat being loaded (many nodes at once) does not count. */
  try {
    new MutationObserver(function (list) {
      var added = 0;
      list.forEach(function (m) {
        m.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains('message') && n.classList.contains('ai') && n.id !== 'loadingBubble') added++; });
      });
      if (added > 2) unread = 0;
      else if (added && away() > SHOW_AFTER) unread += added;
      schedule();
    }).observe(msgs, { childList: true });
  } catch (e) { /* no observer */ }
  schedule();
})();
