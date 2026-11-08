/* V1.63.5: AUTO READ ALOUD. A speaker button next to the mic. When it is on, every new AI reply is read aloud on its own,
   one after the other. In a group chat, three replies play in the order they arrived. Uses the voice picked in Settings > Voice
   (and its fallbacks). Old messages are never read when you open a chat; only replies that just arrived. */
(function () {
    'use strict';
    var KEY = 'horizon_autoread';
    var box = document.getElementById('chatMessages');
    var mic = document.getElementById('micBtn');
    if (!box || !mic || !mic.parentNode) return;
    var T = function () { return window.HorizonTTS; };

    var on = false;
    try { on = localStorage.getItem(KEY) === '1'; } catch (_) { on = false; }
    var queue = [];            // [{ id, text, wrap }]
    var running = false;
    var epoch = 0;             // bumps on every switch-off so an old loop quits
    var seen = new WeakSet();
    var seq = 0;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'autoReadBtn';
    btn.className = 'in-btn autoread';
    btn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="#i-volume"/></svg><span class="ar-n" hidden></span>';
    mic.parentNode.insertBefore(btn, mic);
    var badge = btn.querySelector('.ar-n');

    function paint() {
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        var label = on ? 'Auto read aloud: on. Tap to turn off' : 'Auto read aloud: off. Tap to turn on';
        btn.setAttribute('aria-label', label);
        btn.title = label;
        var n = queue.length + (running ? 1 : 0);
        badge.textContent = String(n);
        badge.hidden = !(on && n > 1);
        // V1.63.8: waiting replies show Next 1, 2, 3 in the order they will play
        document.querySelectorAll('.message.hz-queued').forEach(function (w) { w.classList.remove('hz-queued'); var m0 = w.querySelector(':scope > .message-meta'); if (m0) m0.removeAttribute('data-hz-q'); });
        if (on) queue.forEach(function (job, i) {
            if (!job.wrap || !job.wrap.isConnected) return;
            job.wrap.classList.add('hz-queued');
            var m = job.wrap.querySelector(':scope > .message-meta');
            if (m) m.setAttribute('data-hz-q', String(i + 1));
        });
        // V1.64.0: the notification shows how many replies are still waiting
        if (T() && T().setQueued) T().setQueued(on ? queue.length : 0);
        btn.classList.toggle('speaking', speaking());
        btn.classList.toggle('paused', !!(running && T() && T().isPaused && T().isPaused()));
        kick();
    }

    // The button pulses from JavaScript every frame, because Android's "remove animations" setting switches CSS animations off.
    var raf = 0;
    function speaking() { var t = T(); return !!(on && running && t && t.status && (t.status().state === 'playing' || t.status().state === 'loading') && !(t.isPaused && t.isPaused())); }
    function frame(ms) {
        raf = 0;
        if (!speaking()) { btn.style.boxShadow = ''; return; }
        var p = (ms / 1000 % 1.2) / 1.2;
        btn.style.boxShadow = '0 0 0 ' + (p * 8).toFixed(2) + 'px rgba(34,197,94,' + (0.5 * (1 - p)).toFixed(3) + ')';
        raf = requestAnimationFrame(frame);
    }
    function kick() { if (!raf && speaking()) raf = requestAnimationFrame(frame); else if (!speaking()) btn.style.boxShadow = ''; }
    function mark(wrap, yes) { if (wrap && wrap.classList) wrap.classList.toggle('hz-reading', !!yes); }

    function idle() {
        return new Promise(function (res) {
            var tts = T();
            if (!tts || !tts.status || !tts.onState) { res(); return; }
            if (tts.status().state === 'idle') { res(); return; }
            var off = tts.onState(function (s) { if (s.state === 'idle') { off(); res(); } });
        });
    }

    async function run() {
        if (running) return;
        running = true;
        var my = epoch;
        paint();
        try {
            while (queue.length && on && my === epoch) {
                var job = queue.shift();
                paint();
                var tts = T();
                if (!tts) break;
                await idle();                       // never talk over a reply he started by hand
                if (!on || my !== epoch) break;
                mark(job.wrap, true); paint();
                try { await tts.speak(job.id, job.text, { slot: job.slot }); } catch (_) { /* a failed voice must not stop the queue */ }
                await idle();
                mark(job.wrap, false);
            }
        } finally {
            if (my === epoch) running = false;
            document.querySelectorAll('.message.hz-reading').forEach(function (w) { if (my === epoch) w.classList.remove('hz-reading'); });
            paint();
        }
    }

    function enqueue(wrap) {
        if (!on || seen.has(wrap)) return;
        seen.add(wrap);
        var m = wrap._msg;
        var text = m && m.text ? String(m.text) : (wrap.querySelector(':scope > .bubble') || {}).innerText || '';
        if (!text.trim()) return;
        var g = window.HorizonGroup;
        var slot = g && g.voiceSlot && m && m.prov ? g.voiceSlot(m.prov) : 0;     // V1.64.0: each AI in a group takes the next voice along
        queue.push({ id: 'auto' + (++seq), text: text, wrap: wrap, slot: slot });
        paint();
        run();
    }

    // A reply is ready to read once its own speaker button has been added (after it finished typing).
    function consider(wrap, bulk) {
        if (!wrap.classList || !wrap.classList.contains('ai') || seen.has(wrap)) return;
        var m = wrap._msg;
        var fresh = m && m.ts ? (Date.now() - m.ts < 90000) : !bulk;
        if (!fresh) { seen.add(wrap); return; }       // an old message drawn when a chat opens: never read it
        if (wrap.querySelector('.speak-btn')) { enqueue(wrap); return; }
        var w = new MutationObserver(function () {
            if (wrap.querySelector('.speak-btn')) { w.disconnect(); enqueue(wrap); }
        });
        w.observe(wrap, { childList: true, subtree: true });
        setTimeout(function () { w.disconnect(); }, 600000);
    }

    new MutationObserver(function (recs) {
        var added = [];
        recs.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1 && n.classList.contains('message')) added.push(n); }); });
        var bulk = added.length > 2;
        added.forEach(function (n) { consider(n, bulk); });
    }).observe(box, { childList: true });

    btn.addEventListener('click', function () {
        on = !on;
        try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (_) { /* private mode */ }
        if (!on) {
            epoch++; queue = []; running = false;
            document.querySelectorAll('.message.hz-reading').forEach(function (w) { w.classList.remove('hz-reading'); });
            var tts = T();
            if (tts && tts.stop) tts.stop();
        } else {
            var tts2 = T();
            if (tts2 && tts2.unlock) { try { tts2.unlock(); } catch (_) { /* needs a tap */ } }
        }
        paint();
    });
    // V1.64.0: NEXT (notification, lock screen, headset). Drops the reply being read; the loop carries on with the next one in the queue.
    window.addEventListener('horizon-tts-next', function () {
        var t = T();
        if (t && t.stop) t.stop();
    });
    // V1.64.0: STOP in the notification means stop everything, so the queue is cleared too (auto read itself stays on)
    window.addEventListener('horizon-tts-stop', function () {
        epoch++; queue = []; running = false;
        document.querySelectorAll('.message.hz-reading').forEach(function (w) { w.classList.remove('hz-reading'); });
        paint();
    });
    window.HorizonAutoRead = { next: function () { var t = T(); if (t && t.stop) t.stop(); }, waiting: function () { return queue.length; } };
    if (T() && T().onState) T().onState(function () { paint(); });
    else window.addEventListener('load', function () { if (T() && T().onState) T().onState(function () { paint(); }); });
    paint();
})();
