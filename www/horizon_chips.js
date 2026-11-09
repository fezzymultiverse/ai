/* HORIZON V1.72.0 · quick reply chips. Four buttons above the message box: Shorter, Simpler, Show code, Continue.
   They show after an AI has answered (and not while one is working) and send a ready-made follow-up in one tap.
   In a group chat the follow-up goes only to the AI that spoke last, so five AIs do not all answer a "Shorter". */
(function () {
    'use strict';
    var CHIPS = [
        { k: 'short', t: 'Shorter', q: 'Make that shorter. Keep only the key points.' },
        { k: 'simple', t: 'Simpler', q: 'Explain that more simply, like I am new to it.' },
        { k: 'code', t: 'Show code', q: 'Show the code for that, complete and ready to paste.' },
        { k: 'more', t: 'Continue', q: 'Continue.' }
    ];
    var host = null, bar = null;

    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

    function paint() {
        if (!bar || !host) return;
        var last = null; try { last = host.last(); } catch (e) { last = null; }
        var show = !!last && !last.img && !host.busy();
        bar.hidden = !show;
    }

    function send(c) {
        if (host.busy()) return;
        var last = host.last(); if (!last) return;
        var who = last.group && last.name ? '@' + last.name.toLowerCase() + ' ' : '';
        host.send(who + c.q);
        bar.hidden = true;
    }

    function init(h) {
        if (bar || !h || !h.anchor || !h.anchor.parentNode) return;
        host = h;
        bar = el('div', 'hz-chips'); bar.hidden = true; bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Quick replies');
        CHIPS.forEach(function (c) {
            var b = el('button', 'hz-chip', c.t); b.type = 'button'; b.dataset.k = c.k;
            b.addEventListener('click', function (e) { e.preventDefault(); send(c); });
            bar.appendChild(b);
        });
        h.anchor.parentNode.insertBefore(bar, h.anchor);
        var cm = document.getElementById('chatMessages');
        if (cm && window.MutationObserver) new MutationObserver(paint).observe(cm, { childList: true });
        var busyWatch = setInterval(paint, 700);   // the working state changes without touching the message list
        document.addEventListener('visibilitychange', paint);
        window.addEventListener('beforeunload', function () { clearInterval(busyWatch); });
        paint();
    }

    window.HorizonChips = { init: init, refresh: paint };
})();
