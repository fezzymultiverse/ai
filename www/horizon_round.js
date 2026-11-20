/* Horizon V1.93.5: ROUND TABLE.
   1. Round-table header: one avatar per AI in the group with a status ring. Tap an avatar to @tag it in the message box.
   2. Live strip under it while a round runs: one dot per AI (queued, thinking, done, failed, skipped) with seconds.
   3. Slow AI: after 30 s the strip says "loading" for that AI and shows a Skip button. Skipping moves on to the next AI and the
      skipped one is offered again through the normal Retry bar.
   Public API: window.HzRound = { init, start, set, end }. All chat state stays in index.html; this file only paints. */
(function () {
    'use strict';
    var cfg = null, wrap = null, head = null, strip = null, run = null, clock = 0, lastSig = '';
    var SLOW_MS = 30000;
    var STATE_TXT = { queued: 'waiting', think: 'thinking', done: 'done', fail: 'failed', skip: 'skipped', stop: 'stopped' };

    function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function safe(fn, d) { try { return fn(); } catch (e) { return d; } }
    function ico(id) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
    }
    function chat() { return safe(function () { return cfg.current(); }, null); }
    function provOf(id) { var ps = safe(function () { return cfg.providers(); }, []); for (var i = 0; i < ps.length; i++) if (ps[i].id === id) return ps[i]; return null; }
    function members() { var c = chat(); return c && c.group && c.group.members && c.group.members.length ? c.group.members : []; }
    function roleLabel(role) { var r = window.HorizonGroup && HorizonGroup.roles && HorizonGroup.roles[role]; return r ? r.label : ''; }
    function secs(ms) { return Math.max(0, Math.round(ms / 1000)) + 's'; }

    function liveFor(id) {
        var c = chat();
        if (!run || !c || run.chatId !== c.id) return null;
        return run.st[id] || null;
    }

    // ---------- round-table header ----------
    function paintHead() {
        if (!head) return;
        var ms = members();
        var cmEl = document.getElementById('chatMessages'); if (cmEl && cmEl.classList) cmEl.classList.toggle('hz-grp', ms.length > 1);   // colour rail only in group chats
        var sig = 'h|' + (chat() && chat().id) + '|' + ms.map(function (m) {
            var l = liveFor(m.id); return m.id + ':' + (m.role || '') + ':' + (m.mute ? 'm' : '') + ':' + (l ? l.s : '');
        }).join(',');
        if (sig === lastSig) return;
        lastSig = sig;
        head.replaceChildren();
        head.hidden = !ms.length;
        wrap.classList.toggle('on', !!ms.length || !!(run && !run.over));
        ms.forEach(function (m) {
            var p = provOf(m.id); if (!p) return;
            var l = liveFor(m.id);
            var b = el('button', 'hzr-av' + (m.mute ? ' mute' : '')); b.type = 'button';
            b.dataset.state = l ? l.s : 'idle';
            b.setAttribute('aria-label', 'Tag ' + p.name + (m.role ? ' (' + roleLabel(m.role) + ')' : '') + (l ? ', ' + STATE_TXT[l.s] : ''));
            var ring = el('span', 'hzr-ring'); ring.appendChild(ico(p.icon)); b.appendChild(ring);
            b.appendChild(el('span', 'hzr-nm', p.name));
            if (m.role && roleLabel(m.role)) b.appendChild(el('span', 'hzr-role', roleLabel(m.role)));
            b.addEventListener('click', function () { tag(p.id); });
            head.appendChild(b);
        });
    }
    function tag(id) {
        var inp = cfg && cfg.input; if (!inp) return;
        var v = inp.value, add = '@' + id + ' ';
        if (new RegExp('(^|\\s)@' + id + '(\\s|$)', 'i').test(v)) { inp.focus(); return; }   // already tagged: do not add it twice
        inp.value = v && !/\s$/.test(v) ? v + ' ' + add : v + add;
        try { inp.dispatchEvent(new Event('input', { bubbles: true })); inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { }
    }

    // ---------- live strip ----------
    function paintStrip() {
        if (!strip) return;
        var c = chat(), show = !!(run && c && run.chatId === c.id);
        strip.hidden = !show;
        if (!show) return;
        var now = Date.now(), thinkId = '';   // V1.93.29: Skip shows for whichever AI is thinking, from the first second
        strip.replaceChildren();
        run.order.forEach(function (id) {
            var s = run.st[id]; if (!s) return;
            var p = provOf(id), nm = p ? p.name : id;
            var slow = s.s === 'think' && now - s.t0 >= SLOW_MS;
            if (s.s === 'think') thinkId = id;
            var it = el('span', 'hzr-it ' + s.s + (slow ? ' slow' : ''));
            it.appendChild(el('i', 'hzr-dot'));
            it.appendChild(el('span', 'hzr-t', nm));
            var t = '';
            if (s.s === 'think') t = secs(now - s.t0);
            else if (s.t1) t = secs(s.t1 - s.t0);
            var tx = slow ? 'loading ' + t : (t ? t : STATE_TXT[s.s]);
            it.appendChild(el('span', 'hzr-s', tx));
            strip.appendChild(it);
        });
        if (thinkId) {
            var sk = el('button', 'hzr-skip', 'Skip'); sk.type = 'button';
            sk.setAttribute('aria-label', 'Skip ' + (provOf(thinkId) ? provOf(thinkId).name : 'this AI') + ' and carry on');
            sk.addEventListener('click', function () { safe(cfg.skip); });
            strip.appendChild(sk);
        }
    }

    function tick() {
        if (!run) { clearInterval(clock); clock = 0; return; }
        var now = Date.now();
        run.order.forEach(function (id) {
            var s = run.st[id];
            if (s && s.s === 'think' && !s.slowed && now - s.t0 >= SLOW_MS) {
                s.slowed = true;
                var p = provOf(id);
                safe(function () { cfg.onSlow(id, p ? p.name : id); });
            }
        });
        if (!window.hzTyping) paintStrip();   // V1.93.7: no strip repaint while keys are landing, the next tick catches up
    }

    // ---------- API ----------
    function start(c, targets) {
        if (!cfg || !c) return 0;
        var order = [], st = {};
        (targets || []).forEach(function (t) { if (t && t.id && !st[t.id]) { order.push(t.id); st[t.id] = { s: 'queued', t0: 0, t1: 0 }; } });
        var tok = (run ? run.token : 0) + 1;
        run = { token: tok, chatId: c.id, order: order, st: st, over: false };
        if (!clock) clock = setInterval(tick, 1000);
        lastSig = ''; paintHead(); paintStrip();
        return tok;
    }
    function set(id, s) {
        if (!run || !run.st[id]) return;
        var x = run.st[id], now = Date.now();
        if (s === 'think') { x.s = 'think'; x.t0 = now; x.t1 = 0; x.slowed = false; }
        else if (x.s === 'think' || x.s === 'queued') { x.s = s; if (!x.t0) x.t0 = now; x.t1 = now; }
        else if (s === 'done' && x.s !== 'done') { x.s = 'done'; x.t1 = x.t1 || now; }
        lastSig = ''; paintHead(); paintStrip();
    }
    function end(tok) {
        if (!run || run.token !== tok) return;   // a newer round took over: leave it alone
        var mine = run;
        mine.over = true;
        mine.order.forEach(function (id) { var x = mine.st[id]; if (x && (x.s === 'queued' || x.s === 'think')) { x.s = 'stop'; x.t1 = x.t1 || Date.now(); } });
        lastSig = ''; paintHead(); paintStrip();
        setTimeout(function () {   // the strip stays a few seconds so the last result can be read, then goes
            if (run !== mine) return;
            run = null; clearInterval(clock); clock = 0;
            lastSig = ''; paintHead(); paintStrip();
        }, 6000);
    }

    function init(c) {
        cfg = c;
        var anchor = document.querySelector('.chat-interface .chat-scroll');
        if (!anchor || !anchor.parentNode) return;
        wrap = el('div', 'hzr-wrap'); wrap.id = 'hzRound';
        head = el('div', 'hzr-head'); head.setAttribute('role', 'group'); head.setAttribute('aria-label', 'AIs in this group'); head.hidden = true;
        strip = el('div', 'hzr-strip'); strip.setAttribute('role', 'status'); strip.setAttribute('aria-live', 'polite'); strip.hidden = true;
        wrap.appendChild(head); wrap.appendChild(strip);
        anchor.parentNode.insertBefore(wrap, anchor);
        var cm = document.getElementById('chatMessages'), pend = 0;
        var refresh = function () { if (pend) return; pend = requestAnimationFrame(function () { pend = 0; paintHead(); paintStrip(); }); };
        if (cm && window.MutationObserver) new MutationObserver(refresh).observe(cm, { childList: true });
        document.addEventListener('hz:pick', refresh);
        document.addEventListener('visibilitychange', refresh);
        paintHead();
    }

    window.HzRound = { init: init, start: start, set: set, end: end, repaint: function () { lastSig = ''; paintHead(); paintStrip(); } };
})();
