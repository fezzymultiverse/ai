/* HORIZON V1.93.7 · chat visuals.
   1. PAW TRAIL: while an AI is thinking, Bojack's paw prints walk across the thinking bubble (pink, purple, cyan, green).
   2. DAY MARKS + LANDING GLOW: a thin paw divider names the day between messages from different days (Today, Yesterday,
      Mon 9 Nov) and a reply that just arrived glows once in the brand colours.
   It only watches the chat. It never changes message text, saved chats or the message code, and it backs off while you type. */
(function () {
  'use strict';
  var feed = document.getElementById('chatMessages');
  if (!feed) return;

  var PAW = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><ellipse cx="12" cy="16.2" rx="5.2" ry="4.2"/><ellipse cx="5.6" cy="10.6" rx="2.2" ry="2.9" transform="rotate(-18 5.6 10.6)"/><ellipse cx="9.8" cy="6.4" rx="2.1" ry="3" transform="rotate(-6 9.8 6.4)"/><ellipse cx="14.4" cy="6.4" rx="2.1" ry="3" transform="rotate(6 14.4 6.4)"/><ellipse cx="18.5" cy="10.6" rx="2.2" ry="2.9" transform="rotate(18 18.5 10.6)"/></svg>';

  /* ------------------------------------------------------------ 1. paw trail */
  function addPaws() {
    var lb = document.getElementById('loadingBubble');
    if (!lb || lb.querySelector('.hz-paws')) return;
    var top = lb.querySelector('.th-top');
    if (!top) return;
    var trail = document.createElement('span');
    trail.className = 'hz-paws';
    trail.setAttribute('aria-hidden', 'true');
    for (var i = 0; i < 4; i++) {
      var p = document.createElement('i');
      p.className = 'hz-paw hz-paw' + i;
      p.innerHTML = PAW;
      trail.appendChild(p);
    }
    var dots = top.querySelector('.typing-indicator');
    if (dots) dots.insertAdjacentElement('afterend', trail); else top.insertBefore(trail, top.firstChild);
    lb.classList.add('hz-pawed');
  }

  /* ------------------------------------------------------------ 2. day marks */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function dayKey(d) { return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); }
  function dayLabel(ts) {
    var d = new Date(ts), now = new Date(), y = new Date(now.getTime() - 86400000);
    if (dayKey(d) === dayKey(now)) return 'Today';
    if (dayKey(d) === dayKey(y)) return 'Yesterday';
    var base = DOW[d.getDay()] + ' ' + d.getDate() + ' ' + MON[d.getMonth()];
    return d.getFullYear() === now.getFullYear() ? base : base + ' ' + d.getFullYear();
  }
  var painting = false, timer = 0;
  function paintDays() {
    timer = 0;
    if (window.hzTyping) { timer = setTimeout(paintDays, 700); return; }
    painting = true;
    try {
      var msgs = feed.querySelectorAll(':scope > .message');
      var want = [], last = 0, i, m, ts, k;
      for (i = 0; i < msgs.length; i++) {
        m = msgs[i];
        if (m.id === 'loadingBubble') continue;
        ts = m._msg && m._msg.ts;
        if (!ts || isNaN(+new Date(ts))) continue;
        k = dayKey(new Date(ts));
        if (k !== last) { want.push({ before: m, ts: ts, k: k }); last = k; }
      }
      var have = feed.querySelectorAll(':scope > .hz-day');
      var same = have.length === want.length;
      for (i = 0; same && i < want.length; i++) {
        if (have[i].nextElementSibling !== want[i].before || have[i].getAttribute('data-k') !== String(want[i].k)) same = false;
      }
      if (!same) {
        for (i = 0; i < have.length; i++) have[i].remove();
        for (i = 0; i < want.length; i++) {
          var d = document.createElement('div');
          d.className = 'hz-day';
          d.setAttribute('data-k', String(want[i].k));
          d.setAttribute('role', 'separator');
          d.innerHTML = '<span class="hz-day-line"></span><span class="hz-day-chip"><span class="hz-day-paw">' + PAW + '</span><span class="hz-day-txt"></span></span><span class="hz-day-line"></span>';
          d.querySelector('.hz-day-txt').textContent = dayLabel(want[i].ts);
          feed.insertBefore(d, want[i].before);
        }
      }
    } catch (e) { /* never let a visual break the chat */ }
    painting = false;
  }
  function schedule() { if (!timer) timer = setTimeout(paintDays, 160); }

  /* ------------------------------------------------------------ landing glow */
  var GLOW = ['#FF005F', '#AF5FFF', '#00E5FF', '#5FFF00'];
  var gi = 0;
  function land(node) {
    if (!node || node.nodeType !== 1 || !node.classList.contains('message') || !node.classList.contains('ai') || node.id === 'loadingBubble') return;
    var b = node.querySelector('.bubble');
    if (!b) return;
    b.style.setProperty('--hz-glow', GLOW[gi++ % GLOW.length]);
    b.classList.add('hz-land');
    setTimeout(function () { b.classList.remove('hz-land'); }, 1700);
  }

  var mo = new MutationObserver(function (list) {
    if (painting) return;
    var added = 0, i, j, n;
    for (i = 0; i < list.length; i++) added += list[i].addedNodes.length;
    addPaws();
    for (i = 0; i < list.length; i++) {
      for (j = 0; j < list[i].addedNodes.length; j++) {
        n = list[i].addedNodes[j];
        // a whole saved chat being drawn adds many nodes at once: no glow for that, only for a reply that just landed
        if (added <= 3 && document.visibilityState === 'visible') land(n);
      }
    }
    schedule();
  });
  mo.observe(feed, { childList: true });
  schedule();
})();
