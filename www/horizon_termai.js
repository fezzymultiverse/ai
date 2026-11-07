/* Horizon V1.58.0: terminal AI, docked inside the terminal (no more floating box).
 * A slim panel sits between the output and the prompt. EYE = whether the AI sees the last terminal output (on = sent with every
 * message, red and slashed = hidden from the AI). The drop-down arrow minimizes the panel to its title bar so the copy cards never
 * crowd the terminal. Nothing moves, nothing is dragged. The AI never runs anything: every command has COPY and ->$ (puts it in the prompt). */
(function () {
    'use strict';
    var KEY = 'hzTermAi2';
    var RULES = 'You are the terminal helper inside Horizon for Fezzy. The terminal is Android sh: no root, no python, git, curl, pkg, and no stdin. '
        + 'Real Termux is separate; if a command needs real Termux, use a fenced block labelled termux. Otherwise label blocks sh. '
        + 'Every command goes in a fenced block, one command per line, runnable as-is, no placeholders. Keep it short, no lectures. '
        + 'When terminal output is attached, read it first and answer from it.';
    var st = { want: false, min: false, eye: true, hist: [], busy: false };
    var el = {}, built = false;

    try { var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) { st.want = !!s.want; st.min = !!s.min; st.eye = s.eye !== false; } } catch (e) { /* ignore */ }
    function save() { try { localStorage.setItem(KEY, JSON.stringify({ want: st.want, min: st.min, eye: st.eye })); } catch (e) { /* ignore */ } }
    function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
    function btn(cls, txt, label, fn) { var b = mk('button', cls, txt); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.addEventListener('click', fn); return b; }
    function term() { return document.getElementById('hzTerm'); }

    var SVG_EYE = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1.5 12S5.5 5 12 5s10.5 7 10.5 7-4 7-10.5 7S1.5 12 1.5 12z"/><circle cx="12" cy="12" r="3"/><path class="hza-slash" d="M3 3l18 18"/></svg>';
    var SVG_CHEV = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

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

    function paint() {
        if (!built) return;
        el.o.hidden = !st.want;
        el.o.classList.toggle('hza-min', st.min);
        el.mn.setAttribute('aria-expanded', String(!st.min));
        var ml = st.min ? 'Expand the AI panel' : 'Minimize the AI panel'; el.mn.title = ml; el.mn.setAttribute('aria-label', ml);
        el.eye.classList.toggle('off', !st.eye);
        el.eye.setAttribute('aria-pressed', String(st.eye));
        var lab = st.eye ? 'AI can see the terminal output. Tap to hide it from the AI.' : 'Terminal hidden from the AI. Tap to show it.';
        el.eye.setAttribute('aria-label', lab); el.eye.title = lab;
        el.sub.textContent = st.eye ? 'sees last output' : 'terminal hidden';
        if (el.tb) el.tb.classList.toggle('on', !!st.want);
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
        var body = v, seen = false;
        if (st.eye) { var s = snapshot(); if (s) { body += '\n\nTerminal output (last lines):\n```\n' + s + '\n```'; seen = true; } }
        el.ta.value = ''; el.ta.style.height = 'auto'; var u = say(v, 'hza-u'); if (seen) u.appendChild(mk('span', 'hza-seen', ' \u00B7 output sent'));
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

    /* ---- build: docked between the output and the prompt ---- */
    function build() {
        if (built) return true;
        var t = term(); if (!t) return false;
        var before = t.querySelector('.hzt-in'); if (!before) return false;
        var o = mk('section', 'hza-dock'); o.hidden = true; o.setAttribute('aria-label', 'Terminal AI');
        var head = mk('div', 'hza-head'), ti = mk('div', 'hza-title'); ti.innerHTML = '<i>\u25C6</i> Terminal AI <small class="hza-dim"></small>';
        el.sub = ti.querySelector('small');
        ti.addEventListener('click', function () { st.min = !st.min; save(); paint(); });
        el.eye = btn('hza-b hza-eye', '', 'Show or hide the terminal from the AI', function () { st.eye = !st.eye; save(); paint(); });
        el.eye.innerHTML = SVG_EYE;
        var clr = btn('hza-b hza-clr', '\u232B', 'Clear the AI chat', function () { st.hist = []; el.log.textContent = ''; hello(); });
        el.mn = btn('hza-b hza-mn', '', 'Minimize the AI panel', function () { st.min = !st.min; save(); paint(); });
        el.mn.innerHTML = SVG_CHEV;
        [ti, el.eye, clr, el.mn].forEach(function (n) { head.appendChild(n); });
        var body = mk('div', 'hza-body');
        el.log = mk('div', 'hza-log'); el.log.setAttribute('role', 'log');
        var inw = mk('div', 'hza-in');
        el.ta = mk('textarea', 'hza-ta'); el.ta.rows = 1; el.ta.placeholder = 'Ask for a command\u2026'; el.ta.setAttribute('autocapitalize', 'off'); el.ta.setAttribute('autocorrect', 'off'); el.ta.spellcheck = false;
        el.go = btn('hza-b hza-go', 'SEND', 'Send', send);
        el.ta.addEventListener('input', function () { el.ta.style.height = 'auto'; el.ta.style.height = Math.min(84, el.ta.scrollHeight) + 'px'; });
        el.ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
        inw.appendChild(el.ta); inw.appendChild(el.go);
        body.appendChild(el.log); body.appendChild(inw);
        o.appendChild(head); o.appendChild(body);
        t.insertBefore(o, before); el.o = o;
        built = true; hello(); paint();
        return true;
    }
    function hello() { say('Ask me what to run. Every command gets COPY and \u2192 $ (puts it in your prompt, you press Enter). The eye sends me the last output.', 'hza-dim'); }

    /* ---- terminal bar button ---- */
    function addBtn() {
        var t = term(); if (!t || t.querySelector('.hzt-ai')) return;
        var bar = t.querySelector('.hzt-bar'), mn = t.querySelector('.hzt-min'); if (!bar || !mn) return;
        var b = btn('hzt-btn hzt-ai', 'AI', 'Show or hide the terminal AI panel', function () {
            if (!build()) return; st.want = !st.want; if (st.want) st.min = false; save(); paint();
            if (st.want) setTimeout(function () { try { el.ta.focus(); } catch (e) { /* ignore */ } }, 80);
        });
        bar.insertBefore(b, mn); el.tb = b;
        if (st.want) { build(); paint(); }
        el.tb.classList.toggle('on', !!st.want);
    }
    new MutationObserver(addBtn).observe(document.body, { childList: true });
    addBtn();
    window.HorizonTermAI = { open: function () { if (build()) { st.want = true; st.min = false; save(); paint(); } }, hide: function () { st.want = false; save(); paint(); } };
})();
