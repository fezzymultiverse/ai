/* Horizon V1.46.0: floating AI box for the terminal.
 * AI button in the terminal bar opens a half-screen box. The AI answers with commands; every command line gets
 * COPY and a ->PROMPT button (puts it in the terminal prompt, you press Enter yourself). The AI never runs anything.
 * Tap the PINNED / MOVE sign: MOVE lets you drag the box by its top bar, PINNED locks it in place. */
(function () {
    'use strict';
    var SIZES = [0.34, 0.5, 0.72], KEY = 'hzTermAi';
    var RULES = 'You are the terminal helper inside Horizon for Fezzy. The terminal is Android sh: no root, no python, git, curl, pkg, and no stdin. '
        + 'Real Termux is separate; if a command needs real Termux, use a fenced block labelled termux. Otherwise label blocks sh. '
        + 'Every command goes in a fenced block, one command per line, runnable as-is, no placeholders. Keep it short, no lectures. '
        + 'If you need to see output, tell him to tap OUT and send.';
    var st = { want: false, pinned: true, size: 1, pos: null, hist: [], busy: false, attach: false };
    var el = {}, built = false, drag = null;

    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { st.pos = s.pos || null; st.size = s.size >= 0 && s.size < SIZES.length ? s.size : 1; } } catch (e) { /* ignore */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify({ pos: st.pos, size: st.size })); } catch (e) { /* ignore */ } }
    function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
    function btn(cls, txt, label, fn) { var b = mk('button', cls, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.addEventListener('click', fn); return b; }
    function vv() { var v = window.visualViewport; return v ? { w: v.width, h: v.height, t: v.offsetTop, l: v.offsetLeft } : { w: innerWidth, h: innerHeight, t: 0, l: 0 }; }
    function term() { return document.getElementById('hzTerm'); }

    function copy(t) {
        return (async function () {
            try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* fall through */ }
            try {
                var ta = mk('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0';
                document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
                var ok = document.execCommand('copy'); ta.remove(); return !!ok;
            } catch (e) { return false; }
        })();
    }
    function flash(b, ok, was) { b.textContent = ok ? '\u2713' : '\u2717'; b.classList.toggle('on', ok); setTimeout(function () { b.textContent = was; b.classList.remove('on'); }, 1200); }
    function toPrompt(t) {
        var inp = document.querySelector('#hzTerm .hzt-input'); if (!inp) return false;
        inp.value = t; inp.dispatchEvent(new Event('input', { bubbles: true })); return true;
    }

    /* ---- layout ---- */
    function layout() {
        if (!built) return;
        var V = vv(), m = 6, h = Math.round(V.h * SIZES[st.size]); h = Math.max(200, Math.min(h, V.h - m * 2));
        var w = Math.min(V.w - m * 2, 440), x, y;
        if (st.pos) { x = st.pos.x; y = st.pos.y; }
        else {
            var bar = document.querySelector('#hzTerm .hzt-bar'); x = (V.w - w) / 2;
            y = bar ? bar.getBoundingClientRect().bottom + 4 : m;
        }
        x = Math.max(m, Math.min(x, V.w - w - m)); y = Math.max(m, Math.min(y, V.h - h - m));
        el.o.style.width = w + 'px'; el.o.style.height = h + 'px'; el.o.style.left = (V.l + x) + 'px'; el.o.style.top = (V.t + y) + 'px';
    }
    function setPinned(p) {
        st.pinned = p; el.o.classList.toggle('hza-move', !p);
        el.pin.textContent = p ? '\uD83D\uDCCC PINNED' : '\u2725 MOVE'; el.pin.setAttribute('aria-pressed', String(!p));
        el.sub.textContent = p ? 'locked' : 'drag the bar';
    }
    function sync() {
        if (!built) return;
        var t = term(), show = st.want && t && !t.hidden; el.o.hidden = !show;
        if (el.tb) el.tb.classList.toggle('on', !!st.want);
        if (show) layout();
    }

    /* ---- render replies: text + command cards ---- */
    function card(lang, code) {
        var lines = code.replace(/\s+$/, '').split('\n'), c = mk('div', 'hza-code'), h = mk('div', 'hza-ch');
        h.appendChild(mk('span', null, lang || 'sh'));
        var real = lines.filter(function (l) { return l.trim() && l.trim().charAt(0) !== '#'; });
        if (real.length > 1) { var ca = btn('hza-k', 'COPY ALL', 'Copy all commands', function () { var b = this; copy(lines.join('\n')).then(function (ok) { flash(b, ok, 'COPY ALL'); }); }); h.appendChild(ca); }
        c.appendChild(h);
        lines.forEach(function (l) {
            if (!l.trim()) return;
            var r = mk('div', 'hza-ln'), isC = l.trim().charAt(0) === '#'; if (isC) r.classList.add('hza-c');
            r.appendChild(mk('code', null, l));
            if (!isC) {
                r.appendChild(btn('hza-k', 'COPY', 'Copy command', function () { var b = this; copy(l).then(function (ok) { flash(b, ok, 'COPY'); }); }));
                r.appendChild(btn('hza-k', '\u2192 $', 'Put in terminal prompt', function () { var b = this; flash(b, toPrompt(l), '\u2192 $'); }));
            }
            c.appendChild(r);
        });
        return c;
    }
    function render(text, into) {
        var re = /```([\w+-]*)[ \t]*\n([\s\S]*?)(```|$)/g, last = 0, m;
        while ((m = re.exec(text))) {
            if (m.index > last) { var t = text.slice(last, m.index).trim(); if (t) into.appendChild(mk('div', 'hza-m', t)); }
            if (m[2].trim()) into.appendChild(card(m[1], m[2]));
            last = m.index + m[0].length; if (m[3] === '') break;
        }
        if (last < text.length) { var r = text.slice(last).trim(); if (r) into.appendChild(mk('div', 'hza-m', r)); }
    }
    function say(text, cls) { var d = mk('div', 'hza-m ' + cls, text); el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight; return d; }

    /* ---- ask ---- */
    function snapshot() {
        var o = document.querySelector('#hzTerm .hzt-out'); if (!o) return '';
        var rows = [].map.call(o.querySelectorAll('.hzt-l:not(.hzt-welcome)'), function (n) { return n.textContent; });
        return rows.slice(-40).join('\n').slice(-3500);
    }
    function send() {
        var v = el.ta.value.trim(); if (!v || st.busy) return;
        if (typeof window.HorizonAskAI !== 'function') { say('The AI link is missing in this build.', 'hza-err'); return; }
        var body = v;
        if (st.attach) { var s = snapshot(); if (s) body += '\n\nTerminal output (last lines):\n```\n' + s + '\n```'; st.attach = false; el.out.classList.remove('on'); }
        el.ta.value = ''; el.ta.style.height = 'auto'; say(v, 'hza-u');
        st.hist.push({ role: 'user', text: body }); st.hist = st.hist.slice(-12);
        var msgs = st.hist.map(function (m, i) { return i === 0 && m.role === 'user' ? { role: 'user', text: RULES + '\n\n' + m.text } : m; });
        if (msgs[0].role !== 'user') msgs.shift();
        st.busy = true; el.go.disabled = true; var wait = say('thinking\u2026', 'hza-dim');
        window.HorizonAskAI(msgs).then(function (r) {
            wait.remove(); var reply = String(r || '').trim() || '(empty reply)';
            st.hist.push({ role: 'assistant', text: reply }); render(reply, el.log);
        }, function (e) { wait.remove(); st.hist.pop(); say(String((e && e.message) || e || 'Failed'), 'hza-err'); })
            .then(function () { st.busy = false; el.go.disabled = false; el.log.scrollTop = el.log.scrollHeight; });
    }

    /* ---- build ---- */
    function build() {
        if (built) return;
        var o = mk('div', 'hza hza-pinned'); o.hidden = true; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Terminal AI');
        var head = mk('div', 'hza-head'), ti = mk('div', 'hza-title'); ti.innerHTML = '<i>\u25C6</i> Terminal AI <small class="hza-dim"></small>';
        el.sub = ti.querySelector('small');
        el.pin = btn('hza-b hza-pin', '', 'Pin or move the AI box', function () { setPinned(!st.pinned); });
        var sz = btn('hza-b', '\u2922', 'Change height', function () { st.size = (st.size + 1) % SIZES.length; save(); layout(); });
        var clr = btn('hza-b', '\u232B', 'Clear chat', function () { st.hist = []; el.log.textContent = ''; hello(); });
        var hide = btn('hza-b', '\u2304', 'Hide AI box', function () { st.want = false; sync(); });
        [ti, el.pin, sz, clr, hide].forEach(function (n) { head.appendChild(n); });
        el.log = mk('div', 'hza-log'); el.log.setAttribute('role', 'log');
        var inw = mk('div', 'hza-in');
        el.out = btn('hza-b hza-out', 'OUT', 'Send the last terminal output with my message', function () { st.attach = !st.attach; el.out.classList.toggle('on', st.attach); });
        el.ta = mk('textarea', 'hza-ta'); el.ta.rows = 1; el.ta.placeholder = 'Ask for a command\u2026'; el.ta.setAttribute('autocapitalize', 'off'); el.ta.setAttribute('autocorrect', 'off'); el.ta.spellcheck = false;
        el.go = btn('hza-b hza-go', 'SEND', 'Send', send);
        el.ta.addEventListener('input', function () { el.ta.style.height = 'auto'; el.ta.style.height = Math.min(96, el.ta.scrollHeight) + 'px'; });
        el.ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        [el.out, el.ta, el.go].forEach(function (n) { inw.appendChild(n); });
        o.appendChild(head); o.appendChild(el.log); o.appendChild(inw); document.body.appendChild(o); el.o = o;
        head.addEventListener('pointerdown', function (e) {
            if (st.pinned || (e.target.closest && e.target.closest('button'))) return;
            var r = o.getBoundingClientRect(), V = vv(); drag = { dx: e.clientX - r.left, dy: e.clientY - r.top, V: V };
            try { head.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
        });
        head.addEventListener('pointermove', function (e) {
            if (!drag) return; var V = vv();
            st.pos = { x: e.clientX - drag.dx - V.l, y: e.clientY - drag.dy - V.t }; layout();
        });
        function end() { if (drag) { drag = null; save(); } }
        head.addEventListener('pointerup', end); head.addEventListener('pointercancel', end);
        if (window.visualViewport) { window.visualViewport.addEventListener('resize', layout); window.visualViewport.addEventListener('scroll', layout); }
        window.addEventListener('resize', layout);
        built = true; setPinned(true); hello();
    }
    function hello() { say('Ask me what to run. Every command gets COPY and \u2192 $ (puts it in your prompt, you press Enter). Tap OUT to show me the last output.', 'hza-dim'); }

    /* ---- terminal bar button ---- */
    function addBtn() {
        var t = term(); if (!t || t.querySelector('.hzt-ai')) return;
        var bar = t.querySelector('.hzt-bar'), mn = t.querySelector('.hzt-min'); if (!bar || !mn) return;
        var b = btn('hzt-btn hzt-ai', 'AI', 'Open the terminal AI box', function () { build(); st.want = !st.want; sync(); if (st.want) setTimeout(function () { try { el.ta.focus(); } catch (e) { /* ignore */ } }, 80); });
        bar.insertBefore(b, mn); el.tb = b;
        new MutationObserver(sync).observe(t, { attributes: true, attributeFilter: ['hidden'] });
    }
    new MutationObserver(addBtn).observe(document.body, { childList: true });
    addBtn();
    window.HorizonTermAI = { open: function () { build(); st.want = true; sync(); }, hide: function () { st.want = false; sync(); } };
})();
