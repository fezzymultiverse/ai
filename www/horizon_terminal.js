/* Horizon V1.34.0: Terminal. Full-screen terminal on Horizon's own native shell (HorizonShellPlugin.kt).
 * Runs what YOU type, as Horizon's app user, in the app's private folder. No root, no Termux, no yt-dlp yet.
 * Minimize puts a strip above the chat box; Exit ends the session. Control keys edit the command line.
 * The AI-shell switch in Permissions is separate: this terminal never lets the AI run anything.
 */
(function () {
    'use strict';
    var MAXLINES = 1500;
    var WELCOME = [
        '\u2566 \u2566\u2554\u2550\u2557\u2566\u2550\u2557\u2566\u2554\u2550\u2557\u2554\u2550\u2557\u2554\u2557\u2554',
        '\u2560\u2550\u2563\u2551 \u2551\u2560\u2566\u255D\u2551\u2554\u2550\u255D\u2551 \u2551\u2551\u2551\u2551',
        '\u2569 \u2569\u255A\u2550\u255D\u2569\u255A\u2550\u2569\u255A\u2550\u255D\u255A\u2550\u255D\u255D\u255A\u255D',
        '\u25C6 BOJACK SECURITY // SHELL \u25C6',
        '\u26A1 no root \u00B7 no limits \u00B7 all vibes',
        '[SOI] Strategy Over Impulse \u00B7 999',
        '',
        'Welcome to Termux, Fezzy.',
        'Welcome to Horizon, where your phone is the lab.',
        'Type a command, or type help.'
    ];
    var st = { built: false, open: false, alive: false, cwd: '', home: '', running: false, last: '', hist: [], hi: 0, ctrl: false, kill: '', cmds: 0,
        rsOn: false, rsQ: '', rsI: 0, typing: null, pendingOpen: 0 };
    var el = {};

    function plugin() { var C = window.Capacitor; return C && C.Plugins && C.Plugins.HorizonShell || null; }
    function native() { var C = window.Capacitor; return !!(plugin() && C.isNativePlatform && C.isNativePlatform()); }
    function q(s) { return String(s).replace(/'/g, "'\\''"); }
    function reduced() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

    var LOGO = '<svg class="hzt-logo" viewBox="0 0 24 24" aria-hidden="true"><rect x="1" y="1" width="22" height="22" rx="6" fill="#fff" stroke="#000" stroke-width="1"/>'
        + '<text x="4.4" y="16.6" font-family="monospace" font-size="12.5" font-weight="700" fill="#000">$_</text></svg>';
    var KEYS = [
        ['CTRL', 'ESC', 'TAB', 'HOME', 'END', 'PGUP', 'PGDN', 'MORE'],
        ['\u2190', '\u2191', '\u2193', '\u2192', 'DEL'],
        ['^A', '^B', '^E', '^F', '^K', '^L', '^N'],
        ['^P', '^R', '^U', '^W', '^Y', '^C', '^D']
    ];

    function build() {
        if (st.built) return;
        var o = document.createElement('div'); o.id = 'hzTerm'; o.className = 'hzt'; o.hidden = true;
        o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Terminal');
        o.innerHTML = '<header class="hzt-bar">' + LOGO
            + '<div class="hzt-name"><b>Termux <i>&lt;</i> Horizon</b><small>Bojack Security \u00B7 no root \u00B7 \u26A1</small></div>'
            + '<span class="hzt-dot" aria-hidden="true"></span>'
            + '<button type="button" class="hzt-btn hzt-min" aria-label="Minimize terminal">\u2304</button>'
            + '<button type="button" class="hzt-btn hzt-exit" aria-label="Exit terminal">\u2715</button></header>'
            + '<div class="hzt-out" role="log" aria-live="polite"></div>'
            + '<form class="hzt-in" autocomplete="off"><span class="hzt-ps"></span>'
            + '<input type="text" class="hzt-input" enterkeyhint="send" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" aria-label="Command"></form>'
            + '<div class="hzt-hint" hidden>CTRL is on. Tap a letter.</div>'
            + '<div class="hzt-keys"></div>';
        document.body.appendChild(o);
        el.o = o; el.out = o.querySelector('.hzt-out'); el.ps = o.querySelector('.hzt-ps'); el.inp = o.querySelector('.hzt-input');
        el.form = o.querySelector('.hzt-in'); el.keys = o.querySelector('.hzt-keys'); el.hint = o.querySelector('.hzt-hint');

        KEYS.forEach(function (row, ri) {
            var r = document.createElement('div'); r.className = 'hzt-row' + (ri >= 2 ? ' hzt-more' : ''); if (ri >= 2) r.hidden = true;
            row.forEach(function (k) {
                var b = document.createElement('button'); b.type = 'button'; b.className = 'hzt-k'; b.textContent = k; b.setAttribute('data-k', k);
                b.setAttribute('aria-label', k.charAt(0) === '^' ? 'Control ' + k.charAt(1) : k);
                b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
                b.addEventListener('click', function () { key(k); });
                r.appendChild(b);
            });
            el.keys.appendChild(r);
        });

        el.form.addEventListener('submit', function (e) { e.preventDefault(); var v = el.inp.value; el.inp.value = ''; st.rsOn = false; submit(v); });
        el.inp.addEventListener('input', function () { st.rsOn = false; });
        el.inp.addEventListener('beforeinput', function (e) {
            if (!st.ctrl || e.inputType !== 'insertText' || !e.data) return;
            var ch = e.data.slice(-1).toLowerCase();
            if (/[a-z]/.test(ch)) { e.preventDefault(); setCtrl(false); ctrlAct(ch); }
        });
        el.inp.addEventListener('keydown', function (e) {
            if (e.ctrlKey && !e.altKey && !e.metaKey && e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
                var l = e.key.toLowerCase();
                if (l === 'c' || l === 'd' || l === 'l' || l === 'a' || l === 'e' || l === 'k' || l === 'u' || l === 'w' || l === 'y' || l === 'r' || l === 'n' || l === 'p' || l === 'b' || l === 'f') { e.preventDefault(); ctrlAct(l); }
            } else if (e.key === 'ArrowUp') { e.preventDefault(); histMove(-1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); histMove(1); }
            else if (e.key === 'Tab') { e.preventDefault(); complete(); }
            else if (e.key === 'Escape') { e.preventDefault(); setVal(''); }
        });
        o.querySelector('.hzt-min').addEventListener('click', function () { minimize(false); });
        o.querySelector('.hzt-exit').addEventListener('click', exitTerm);
        el.out.addEventListener('click', function () { if (st.typing) skipTyping(); else if (!window.getSelection || String(window.getSelection()) === '') el.inp.focus(); });

        var strip = document.createElement('div'); strip.id = 'hzTermStrip'; strip.className = 'hzt-strip'; strip.hidden = true;
        strip.innerHTML = '<span class="hzt-dot" aria-hidden="true"></span>' + LOGO
            + '<button type="button" class="hzt-st-open" aria-label="Open terminal"><span class="hzt-st-txt"></span></button>'
            + '<button type="button" class="hzt-st-up" aria-label="Expand terminal">\u2303</button>'
            + '<button type="button" class="hzt-st-x" aria-label="Exit terminal">\u2715</button>';
        var comp = document.querySelector('.composer');
        if (comp && comp.parentNode) comp.parentNode.insertBefore(strip, comp); else { strip.classList.add('hzt-strip-fixed'); document.body.appendChild(strip); }
        el.strip = strip; el.stTxt = strip.querySelector('.hzt-st-txt');
        strip.querySelector('.hzt-st-open').addEventListener('click', function () { open(); });
        strip.querySelector('.hzt-st-up').addEventListener('click', function () { open(); });
        strip.querySelector('.hzt-st-x').addEventListener('click', exitTerm);

        if (window.visualViewport) {
            var fitRaf = 0;   // V1.63.0: one height write per frame instead of one per resize/scroll event
            var fit = function () {
                if (fitRaf) return;
                fitRaf = requestAnimationFrame(function () { fitRaf = 0; if (st.open) el.o.style.height = Math.round(window.visualViewport.height) + 'px'; });
            };
            window.visualViewport.addEventListener('resize', fit); window.visualViewport.addEventListener('scroll', fit);
        }
        window.addEventListener('popstate', function () {
            var s = history.state;
            if (st.open && !(s && s.hzt)) minimize(true);
        });
        st.built = true;
    }

    /* ---- output ---- */
    function addLine(text, cls) {
        var d = document.createElement('div'); d.className = 'hzt-l' + (cls ? ' ' + cls : ''); d.textContent = text;
        el.out.appendChild(d);
        while (el.out.childNodes.length > MAXLINES) el.out.removeChild(el.out.firstChild);
        el.out.scrollTop = el.out.scrollHeight;
        return d;
    }
    function addText(blob, cls) { String(blob).replace(/\r/g, '').replace(/\n+$/, '').split('\n').forEach(function (ln) { addLine(ln, cls); }); }
    function psText() {
        var c = st.cwd || '', h = st.home || '', shown = '~';
        if (c && h && c !== h) shown = c.indexOf(h + '/') === 0 ? '~' + c.slice(h.length) : c;
        if (shown.length > 26) shown = '\u2026' + shown.slice(-24);
        return 'fezzy@horizon ' + shown + ' $';
    }
    function paintPs() { if (el.ps) el.ps.textContent = psText(); }
    function echo(cmd) {
        var d = document.createElement('div'); d.className = 'hzt-l';
        var p = document.createElement('span'); p.className = 'hzt-p'; p.textContent = psText() + ' ';
        d.appendChild(p); d.appendChild(document.createTextNode(cmd)); el.out.appendChild(d); el.out.scrollTop = el.out.scrollHeight;
    }
    function paintStrip() {
        if (!el.strip) return;
        el.strip.hidden = !(st.alive && !st.open);
        el.stTxt.textContent = st.running ? 'running: ' + st.last.slice(0, 40) : 'Terminal \u00B7 idle \u00B7 ' + st.cmds + (st.cmds === 1 ? ' command' : ' commands');
        if (el.o) el.o.classList.toggle('hzt-busy', st.running);
    }

    /* ---- typewriter welcome ---- */
    function skipTyping() {
        if (!st.typing) return;
        clearTimeout(st.typing.t); var T = st.typing; st.typing = null;
        T.node.textContent = WELCOME.join('\n'); T.node.classList.remove('hzt-caret');
        el.out.scrollTop = el.out.scrollHeight;
    }
    function welcome() {
        var node = document.createElement('div'); node.className = 'hzt-l hzt-welcome hzt-caret'; node.style.whiteSpace = 'pre-wrap'; el.out.appendChild(node);
        if (reduced()) { node.textContent = WELCOME.join('\n'); node.classList.remove('hzt-caret'); return; }
        var T = { node: node, i: 0, j: 0, buf: '', t: 0 }; st.typing = T;
        (function tick() {
            if (st.typing !== T) return;
            if (T.i >= WELCOME.length) { node.classList.remove('hzt-caret'); st.typing = null; return; }
            var line = WELCOME[T.i];
            if (T.j < line.length) { T.j++; node.textContent = T.buf + line.slice(0, T.j); T.t = setTimeout(tick, 26); }
            else { T.buf += line + '\n'; T.i++; T.j = 0; T.t = setTimeout(tick, 280); }
            el.out.scrollTop = el.out.scrollHeight;
        })();
    }

    /* ---- open / minimize / exit ---- */
    function open() {
        build();
        if (st.pendingOpen) return;
        var rp = document.getElementById('rightPanel'), lp = document.getElementById('leftPanel'), ov = document.getElementById('overlay');
        var needs = 0;
        if ((rp && rp.classList.contains('open')) || (lp && lp.classList.contains('open'))) { if (ov) ov.click(); needs = 220; }
        var ad = document.getElementById('hzAddons'), aw = document.getElementById('hzExtensionWindow');
        if (((ad && !ad.hidden) || (aw && !aw.hidden)) && window.HorizonAddons) { window.HorizonAddons.close(); needs = 280; }
        if (needs) { st.pendingOpen = setTimeout(function () { st.pendingOpen = 0; show(); }, needs); } else show();
    }
    function show() {
        if (st.open) return;
        if (!(history.state && history.state.hzt)) history.pushState({ hzt: 1 }, '');
        st.open = true; el.o.hidden = false; document.documentElement.classList.add('hzt-on');
        if (window.visualViewport) el.o.style.height = Math.round(window.visualViewport.height) + 'px';
        if (!st.alive) {
            st.alive = true; el.out.textContent = '';
            if (native()) { try { plugin().cwd().then(function (r) { st.cwd = st.home = r.cwd || ''; paintPs(); }, function () { }); } catch (e) { /* ignore */ } }
            welcome();
        }
        paintPs(); paintStrip();
        setTimeout(function () { try { el.inp.focus(); } catch (e) { /* ignore */ } }, 60);
    }
    function minimize(fromPop) {
        if (!st.open) return;
        if (!fromPop && history.state && history.state.hzt) { history.back(); return; }
        st.open = false; el.o.hidden = true; document.documentElement.classList.remove('hzt-on');
        try { el.inp.blur(); } catch (e) { /* ignore */ }
        paintStrip();
    }
    function exitTerm() {
        if (!st.built) return;
        skipTyping();
        var wasOpen = st.open;
        st.alive = false; st.running = false; st.cmds = 0; st.hist = []; st.hi = 0; st.last = ''; st.cwd = st.home;
        el.out.textContent = ''; el.inp.value = ''; setCtrl(false);
        if (wasOpen) minimize(false);
        paintStrip();
    }

    /* ---- command line editing ---- */
    function setVal(v, pos) { el.inp.value = v; var p = pos == null ? v.length : pos; try { el.inp.setSelectionRange(p, p); } catch (e) { /* ignore */ } }
    function caret() { return el.inp.selectionStart == null ? el.inp.value.length : el.inp.selectionStart; }
    function histMove(d) {
        if (!st.hist.length) return;
        var n = st.hi + d;
        if (n < 0) n = 0;
        if (n >= st.hist.length) { st.hi = st.hist.length; setVal(''); return; }
        st.hi = n; setVal(st.hist[n]);
    }
    function setCtrl(on) {
        st.ctrl = !!on;
        var b = el.keys.querySelector('[data-k="CTRL"]'); if (b) b.classList.toggle('on', st.ctrl);
        el.hint.hidden = !st.ctrl;
    }
    function toggleMore() {
        var rows = el.keys.querySelectorAll('.hzt-more'), show = rows[0].hidden;
        rows.forEach(function (r) { r.hidden = !show; });
        el.keys.querySelector('[data-k="MORE"]').classList.toggle('on', show);
    }
    function key(k) {
        var v = el.inp.value, c = caret();
        if (k === 'CTRL') { setCtrl(!st.ctrl); }
        else if (k === 'MORE') toggleMore();
        else if (k === 'ESC') { setVal(''); setCtrl(false); }
        else if (k === 'TAB') complete();
        else if (k === 'HOME') setVal(v, 0);
        else if (k === 'END') setVal(v);
        else if (k === 'PGUP') el.out.scrollBy(0, -Math.round(el.out.clientHeight * 0.85));
        else if (k === 'PGDN') el.out.scrollBy(0, Math.round(el.out.clientHeight * 0.85));
        else if (k === '\u2190') setVal(v, Math.max(0, c - 1));
        else if (k === '\u2192') setVal(v, Math.min(v.length, c + 1));
        else if (k === '\u2191') histMove(-1);
        else if (k === '\u2193') histMove(1);
        else if (k === 'DEL') { if (c < v.length) setVal(v.slice(0, c) + v.slice(c + 1), c); }
        else if (k.charAt(0) === '^') { setCtrl(false); ctrlAct(k.charAt(1).toLowerCase()); }
        try { el.inp.focus(); } catch (e) { /* ignore */ }
    }
    function ctrlAct(l) {
        var v = el.inp.value, c = caret();
        if (l === 'a') setVal(v, 0);
        else if (l === 'e') setVal(v);
        else if (l === 'b') setVal(v, Math.max(0, c - 1));
        else if (l === 'f') setVal(v, Math.min(v.length, c + 1));
        else if (l === 'c') { echo(v + '^C'); setVal(''); st.rsOn = false; }
        else if (l === 'd') { if (!v) exitTerm(); else if (c < v.length) setVal(v.slice(0, c) + v.slice(c + 1), c); }
        else if (l === 'k') { st.kill = v.slice(c); setVal(v.slice(0, c)); }
        else if (l === 'u') { st.kill = v.slice(0, c); setVal(v.slice(c), 0); }
        else if (l === 'w') {
            var left = v.slice(0, c), cut = left.replace(/\s+$/, '').replace(/\S+$/, '');
            st.kill = left.slice(cut.length); setVal(cut + v.slice(c), cut.length);
        }
        else if (l === 'y') { if (st.kill) setVal(v.slice(0, c) + st.kill + v.slice(c), c + st.kill.length); }
        else if (l === 'l') { el.out.textContent = ''; }
        else if (l === 'n') histMove(1);
        else if (l === 'p') histMove(-1);
        else if (l === 'r') {
            if (!st.rsOn) { st.rsOn = true; st.rsQ = v; st.rsI = st.hist.length; }
            for (var i = st.rsI - 1; i >= 0; i--) {
                if (!st.rsQ || st.hist[i].indexOf(st.rsQ) >= 0) { st.rsI = i; st.hi = i; setVal(st.hist[i]); return; }
            }
        }
    }

    /* ---- TAB completion (file names in the current folder) ---- */
    function complete() {
        if (!native() || st.running) return;
        var v = el.inp.value, pos = caret(), left = v.slice(0, pos), tok = (/(\S*)$/.exec(left) || ['', ''])[1];
        if (/['"$`\\~*?]/.test(tok)) return;
        var sl = tok.lastIndexOf('/'), dir = sl >= 0 ? tok.slice(0, sl + 1) : '', base = tok.slice(sl + 1);
        var cmd = (st.cwd ? "cd '" + q(st.cwd) + "' 2>/dev/null; " : '') + "ls -1ap -- '" + q(dir || '.') + "' 2>/dev/null";
        plugin().execute({ cmd: cmd, timeoutMs: 3000, maxBytes: 32768 }).then(function (r) {
            var names = String(r.stdout || '').split('\n').filter(function (n) { return n && n !== './' && n !== '../' && n.indexOf(base) === 0 && (base || n.charAt(0) !== '.'); });
            if (!names.length) return;
            var pre = names[0];
            names.forEach(function (n) { while (n.indexOf(pre) !== 0) pre = pre.slice(0, -1); });
            if (names.length === 1) {
                var add = dir + names[0] + (names[0].slice(-1) === '/' ? '' : ' ');
                setVal(v.slice(0, pos - tok.length) + add + v.slice(pos), pos - tok.length + add.length);
            } else {
                if (pre.length > base.length) setVal(v.slice(0, pos - tok.length) + dir + pre + v.slice(pos), pos - tok.length + dir.length + pre.length);
                else addText(names.join('   '), 'hzt-dim');
            }
        }, function () { });
    }

    /* ---- running commands ---- */
    function submit(line) {
        skipTyping();
        var cmd = String(line || '').replace(/\s+$/, '');
        echo(cmd);
        if (!cmd.trim()) return;
        if (st.hist[st.hist.length - 1] !== cmd) st.hist.push(cmd);
        st.hi = st.hist.length; st.cmds++;
        var w = cmd.trim().split(/\s+/)[0];
        if (w === 'clear' || w === 'cls') { el.out.textContent = ''; paintStrip(); return; }
        if (w === 'exit' || w === 'quit' || w === 'logout') { exitTerm(); return; }
        if (w === 'help') { help(); paintStrip(); return; }
        if (w === 'yt-dlp' || w === 'ytdlp') {
            addText('yt-dlp is not built into Horizon yet (planned). Android\u2019s own shell has no Python, so it cannot run here.\nFor now use the YouTube app: search a song, tap \u2193 Music.', 'hzt-err'); paintStrip(); return;
        }
        exec(cmd);
    }
    function help() {
        addText('Horizon terminal. Runs /system/bin/sh as Horizon\u2019s app user in the app\u2019s private folder.\n'
            + 'Works: ls, cat, grep, sed, find, ps, df, ping, and the other built-in Android tools. cd stays between commands.\n'
            + 'Does not work: python, git, curl, pkg, root, programs that wait for input (there is no stdin).\n'
            + 'Built in: help, clear, exit. TAB completes file names. Up/Down is history. CTRL then a letter edits the line (^A ^E ^K ^U ^W ^Y ^L ^R ^C ^D).\n'
            + 'yt-dlp: planned, not installed. Commands stop after 30 seconds.', 'hzt-dim');
    }
    function exec(cmd) {
        if (!native()) { addText('This terminal needs the Horizon Android app. A browser preview cannot run shell commands.', 'hzt-err'); paintStrip(); return; }
        if (st.running) { addText('A command is still running. Wait for it to finish.', 'hzt-err'); return; }
        st.running = true; st.last = cmd; paintStrip();
        var pre = st.cwd ? "cd '" + q(st.cwd) + "' 2>/dev/null\n" : '';
        var wrapped = pre + cmd + "\n__hz_rc=$?\nprintf '\\n__HZCWD__%s\\n' \"$(pwd)\"\nexit $__hz_rc";
        plugin().execute({ cmd: wrapped, timeoutMs: 30000, maxBytes: 131072 }).then(function (r) {
            var out = String(r.stdout || ''), i = out.lastIndexOf('\n__HZCWD__');
            if (i >= 0) { var nc = out.slice(i + 10).split('\n')[0].trim(); if (nc) st.cwd = nc; out = out.slice(0, i); }
            if (out) addText(out);
            if (r.stderr) addText(r.stderr, 'hzt-err');
            if (r.timedOut) addLine('[timed out after 30 s]', 'hzt-dim');
            else if (r.exitCode) addLine('[exit ' + r.exitCode + ']', 'hzt-dim');
            if (r.truncated) addLine('[output cut]', 'hzt-dim');
        }, function (e) { addLine('ERROR: ' + ((e && e.message) || e), 'hzt-err'); }).then(function () {
            st.running = false; paintPs(); paintStrip();
            if (st.open) { try { el.inp.focus(); } catch (e) { /* ignore */ } }
        });
    }

    document.addEventListener('click', function (e) {
        var b = e.target.closest && e.target.closest('[data-term-open]');
        if (b) { e.preventDefault(); open(); }
    });
    window.HorizonTerminal = { open: open, minimize: function () { minimize(false); }, exit: exitTerm, isOpen: function () { return st.open; } };
})();
