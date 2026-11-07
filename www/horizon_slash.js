/* Horizon V1.27.0: SLASH COMMANDS. Type / in the message box for a quick-command menu: switch model, flip tools, run a web recon sweep, search music.
   Public API: window.HorizonSlash = { init }. Everything it does goes through the host callbacks passed in by index.html,
   so it never touches keys, chats or storage itself. */
(function () {
    'use strict';
    var host = null, pal = null, input = null;
    var rows = [], sel = 0, isOpen = false, dismissed = false;

    function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function safe(fn, d) { try { return fn(); } catch (e) { return d; } }

    // ---------- commands ----------
    var TOGGLES = [
        { id: 'web', names: ['web'], glyph: '\uD83C\uDF10', label: '/web', desc: 'Live web search for this chat' },
        { id: 'yt', names: ['yt', 'youtube'], glyph: '\u25B6\uFE0F', label: '/yt', desc: 'YouTube music for this chat' },
        { id: 'gh', names: ['gh', 'github'], glyph: '\uD83D\uDC19', label: '/gh', desc: 'GitHub repos open to the AI' },
        { id: 'eye', names: ['eye'], glyph: '\uD83D\uDC41\uFE0F', label: '/eye', desc: 'Let the AI see what is playing' },
        { id: 'pdf', names: ['pdf'], glyph: '\uD83D\uDCC4', label: '/pdf', desc: 'PDF maker' },
        { id: 'img', names: ['img', 'image'], glyph: '\uD83C\uDFA8', label: '/img', desc: 'Image mode: everything you type is drawn' },
        { id: 'vault', names: ['vault'], glyph: '\uD83D\uDD10', label: '/vault', desc: 'Let the AI write Vault notes' },
        { id: 'screen', names: ['screen'], glyph: '\uD83D\uDCF1', label: '/screen', desc: 'Let the AI see the app screen' }
    ];

    function modelItems(arg) {
        var words = arg.toLowerCase().split(/\s+/).filter(Boolean);
        function hit(s) { s = s.toLowerCase(); return words.every(function (w) { return s.indexOf(w) !== -1; }); }
        var provs = host.providers(), out = [];
        provs.forEach(function (p) {
            if (!p.ready) return;
            if (words.length && !hit(p.name) && !hit(p.name + ' ' + p.model)) return;
            out.push({ glyph: '\uD83E\uDD16', title: p.name, sub: p.model || 'default model', badge: p.active ? 'ACTIVE' : '', on: true,
                run: function () { host.useModel(p.id, p.model); } });
        });
        if (words.length) {
            provs.forEach(function (p) {
                if (!p.ready) return;
                p.models.forEach(function (m) {
                    if (out.length >= 14 || m === p.model || !hit(p.name + ' ' + m)) return;
                    out.push({ glyph: '\u2699\uFE0F', title: m, sub: p.name, run: function () { host.useModel(p.id, m); } });
                });
            });
            if (!out.length) out.push({ glyph: '\uD83E\uDD16', title: 'No model matches', sub: 'Try fewer words, or type /model alone' });
        } else {
            provs.forEach(function (p) {
                if (!p.ready) out.push({ glyph: '\uD83D\uDD11', title: p.name, sub: 'Add a key to use it', badge: 'NO KEY', run: function () { host.addKeys(); } });
            });
            out.push({ glyph: '\uD83D\uDCCB', title: 'Full model list', sub: 'Open the provider and model picker', run: function () { host.pickSheet(); } });
        }
        return out;
    }
    function reconItems(arg) {
        if (!arg) return [{ glyph: '\uD83D\uDEF0\uFE0F', title: '/recon <target>', sub: 'e.g. /recon example.com. Turns Web on and sends a sweep', fill: '/recon ' }];
        return [{ glyph: '\uD83D\uDEF0\uFE0F', title: 'Web recon: ' + arg, sub: 'Turns Web on for this chat and sends a public-sources sweep', run: function () { return host.recon(arg); } }];
    }
    function musicItems(arg) {
        if (!arg) return [{ glyph: '\uD83C\uDFB5', title: '/music <words>', sub: 'Search songs, artists and albums in your player', fill: '/music ' }];
        return [{ glyph: '\uD83C\uDFB5', title: 'Search music: ' + arg, sub: 'Opens the Music Player on your library', run: function () { return host.music(arg); } }];
    }
    function lagItems() {
        return [{ glyph: '\u23F1\uFE0F', title: 'Open the lag detector', sub: 'Refresh rate, slow keys, what blocks typing. Copy the report to send it back.',
            run: function () { return !!(window.HorizonPerf && window.HorizonPerf.open() !== false); } }];
    }
    var COMMANDS = [
        { names: ['model', 'm', 'ai'], glyph: '\uD83E\uDD16', label: '/model', desc: 'Switch provider or model', items: modelItems },
        { names: ['recon', 'sweep'], glyph: '\uD83D\uDEF0\uFE0F', label: '/recon', desc: 'Web recon sweep on a target', items: reconItems, onSend: true },
        { names: ['music', 'song', 'find'], glyph: '\uD83C\uDFB5', label: '/music', desc: 'Search your music player', items: musicItems, onSend: true },
        { names: ['lag', 'perf', 'fps'], glyph: '\u23F1\uFE0F', label: '/lag', desc: 'Lag detector: refresh rate and slow keys', items: lagItems, onSend: true }
    ].concat(TOGGLES.map(function (t) {
        return { names: t.names, glyph: t.glyph, label: t.label, desc: t.desc, toggle: t.id, onSend: true };
    }));

    function toggleRow(c, states) {
        return { glyph: c.glyph, title: c.label, sub: c.desc, on: !!states[c.toggle], badge: states[c.toggle] ? 'ON' : 'OFF', sw: true,
            run: function () { host.toggle(c.toggle); } };
    }
    function summaryRow(c, states) {
        if (c.toggle) return toggleRow(c, states);
        return { glyph: c.glyph, title: c.label, sub: c.desc, fill: c.label + ' ' };
    }

    // text -> { rows, cmd } (pure, no DOM)
    function build(text) {
        var m = /^\/(\S*)(?:\s+([\s\S]*))?$/.exec(text);
        if (!m || text.indexOf('\n') !== -1) return null;
        var head = m[1].toLowerCase(), arg = (m[2] || '').trim();
        var states = safe(function () { return host.toggles(); }, {});
        var exact = COMMANDS.filter(function (c) { return c.names.indexOf(head) !== -1; })[0];
        if (exact) return { cmd: exact, rows: exact.toggle ? [toggleRow(exact, states)] : exact.items(arg) };
        var list = COMMANDS.filter(function (c) { return !head || c.names.some(function (n) { return n.indexOf(head) === 0; }); });
        return { cmd: null, rows: list.map(function (c) { return summaryRow(c, states); }) };
    }

    // ---------- palette UI ----------
    function paint() {
        pal.replaceChildren();
        rows.forEach(function (r, i) {
            var b = el('button', 'hzs-row' + (i === sel ? ' sel' : '') + (r.run || r.fill ? '' : ' info'));
            b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === sel));
            b.appendChild(el('span', 'hzs-g', r.glyph || ''));
            var t = el('span', 'hzs-t');
            t.appendChild(el('b', null, r.title));
            if (r.sub) t.appendChild(el('small', null, r.sub));
            b.appendChild(t);
            if (r.badge) b.appendChild(el('span', 'hzs-b' + (r.sw ? (r.on ? ' on' : ' off') : (r.badge === 'ACTIVE' ? ' on' : '')), r.badge));
            b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); sel = i; choose(r); });
            pal.appendChild(b);
        });
        var s = pal.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
    }
    function show() { isOpen = true; pal.hidden = false; paint(); }
    function hide() { isOpen = false; pal.hidden = true; }
    function refresh() {
        if (!host || !pal) return;
        var v = input.value;
        if (v.charAt(0) !== '/' || dismissed) { rows = []; hide(); return; }
        var r = build(v);
        if (!r || !r.rows.length) { rows = []; hide(); return; }
        rows = r.rows; if (sel >= rows.length) sel = 0;
        show();
    }
    function choose(r) {
        if (r.fill) { input.value = r.fill; input.focus(); sel = 0; refresh(); return; }
        if (!r.run) return;
        var ok = r.run();
        if (ok === false) return;
        host.clear(); hide(); rows = [];
    }

    // ---------- keyboard + send ----------
    function onKey(e) {
        if (!isOpen || !rows.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); sel = (sel + 1) % rows.length; paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); sel = (sel + rows.length - 1) % rows.length; paint(); }
        else if (e.key === 'Escape') { e.preventDefault(); dismissed = true; refresh(); }
        else if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); choose(rows[sel]); }
    }
    function onBeforeInput(e) {
        if (e.inputType === 'insertLineBreak' && isOpen && rows.length) { e.preventDefault(); choose(rows[sel]); }
    }
    // The send button runs a command only when the box holds exactly that command (e.g. "/web", "/recon x.com").
    // Any other text, including "/model is broken", is sent as a normal message.
    function onSendCapture(e) {
        if (!host || !e.target.closest || !e.target.closest('#sendBtn')) return;
        var v = input.value, m = /^\/(\S+)(?:\s+([\s\S]*))?$/.exec(v);
        if (!m || v.indexOf('\n') !== -1) return;
        var head = m[1].toLowerCase();
        var c = COMMANDS.filter(function (x) { return x.names.indexOf(head) !== -1; })[0];
        if (!c || !c.onSend) return;
        var r = build(v);
        if (!r || !r.rows.length || !r.rows[0].run) return;
        e.preventDefault(); e.stopImmediatePropagation();
        choose(r.rows[0]);
    }

    function init(h) {
        host = h; input = h.input;
        if (pal || !input) return;
        pal = el('div', 'hz-slash'); pal.id = 'hzSlash'; pal.hidden = true;
        pal.setAttribute('role', 'listbox'); pal.setAttribute('aria-label', 'Commands');
        var anchor = h.anchor && h.anchor.parentNode ? h.anchor : null;
        if (anchor) anchor.parentNode.insertBefore(pal, anchor); else input.parentNode.appendChild(pal);
        input.addEventListener('input', function () { dismissed = false; sel = 0; refresh(); });
        input.addEventListener('focus', refresh);
        input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) hide(); }, 150); });
        input.addEventListener('keydown', onKey);
        input.addEventListener('beforeinput', onBeforeInput);
        document.addEventListener('click', onSendCapture, true);
    }

    window.HorizonSlash = { init: init, _build: function (t, h) { host = h || host; return build(t); } };
})();
