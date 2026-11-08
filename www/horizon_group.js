/* Horizon V1.60.0: GROUP CHAT. The Group tile (top right) starts a chat with several AIs at once; typing @gemini, @groq ... pops up the AI names
   (like the slash menu) and singles one out for that message. Works in any chat: an @mention in a normal chat sends that one message to that AI.
   Public API: window.HorizonGroup = { init, route }. All chat state goes through the host callbacks passed in by index.html. */
(function () {
    'use strict';
    var host = null, input = null, pal = null, sheet = null, bar = null;
    var rows = [], sel = 0, isOpen = false, dismissed = false, tok = null;
    var draft = {};   // id -> { on, model } while the sheet is open

    function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function safe(fn, d) { try { return fn(); } catch (e) { return d; } }
    function ico(id) {
        var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
    }
    function provs() { return safe(function () { return host.providers(); }, []); }
    function curChat() { return safe(function () { return host.current(); }, null); }
    function memberOf(g, id) { return g && g.members ? g.members.filter(function (m) { return m.id === id; })[0] : null; }

    // ---------- routing (pure) ----------
    // text + chat -> { targets:[{id, model?}], mention:bool } or null (null = normal single reply from the active AI)
    function route(text, chat) {
        var ps = provs(), by = {};
        ps.forEach(function (p) { by[p.id] = p; by[String(p.name).toLowerCase()] = p; });
        var re = /(^|[\s(])@([a-z0-9_-]+)/gi, m, ids = [], all = false;
        while ((m = re.exec(String(text || '')))) {
            var w = m[2].toLowerCase();
            if (w === 'all' || w === 'everyone' || w === 'group') { all = true; continue; }
            var p = by[w];
            if (p && ids.indexOf(p.id) < 0) ids.push(p.id);
        }
        var g = chat && chat.group && chat.group.members && chat.group.members.length ? chat.group : null;
        if (ids.length) return { mention: true, targets: ids.map(function (id) { var mm = memberOf(g, id); return mm ? { id: id, model: mm.model } : { id: id }; }) };
        if (g) return { mention: false, targets: g.members.filter(function (mm) { return by[mm.id]; }).map(function (mm) { return { id: mm.id, model: mm.model }; }) };
        if (all) return null;
        return null;
    }

    // ---------- @ popup ----------
    function token() {
        var v = input.value, pos = input.selectionStart == null ? v.length : input.selectionStart;
        var m = /(^|[\s(])@([a-z0-9_-]*)$/i.exec(v.slice(0, pos));
        if (!m) return null;
        return { start: pos - m[2].length - 1, end: pos, q: m[2].toLowerCase() };
    }
    function buildRows(q) {
        var chat = curChat(), g = chat && chat.group, out = [];
        var ps = provs().filter(function (p) { return p.ready; });
        ps.sort(function (a, b) { return (memberOf(g, b.id) ? 1 : 0) - (memberOf(g, a.id) ? 1 : 0); });
        ps.forEach(function (p) {
            if (q && p.name.toLowerCase().indexOf(q) !== 0 && p.id.indexOf(q) !== 0) return;
            var mm = memberOf(g, p.id);
            out.push({ icon: p.icon, title: p.name, sub: (mm && mm.model) || p.model || 'default model', badge: mm ? 'IN GROUP' : '', word: p.name.toLowerCase() });
        });
        if (g && g.members.length > 1 && (!q || 'all'.indexOf(q) === 0 || 'everyone'.indexOf(q) === 0)) out.push({ glyph: '👥', title: 'all', sub: 'Everyone in the group answers', badge: '', word: 'all' });
        return out;
    }
    function paint() {
        pal.replaceChildren();
        rows.forEach(function (r, i) {
            var b = el('button', 'hzs-row' + (i === sel ? ' sel' : ''));
            b.type = 'button'; b.setAttribute('role', 'option'); b.setAttribute('aria-selected', String(i === sel));
            var g = el('span', 'hzs-g'); if (r.icon) g.appendChild(ico(r.icon)); else g.textContent = r.glyph || '';
            b.appendChild(g);
            var t = el('span', 'hzs-t'); t.appendChild(el('b', null, '@' + r.title)); if (r.sub) t.appendChild(el('small', null, r.sub)); b.appendChild(t);
            if (r.badge) b.appendChild(el('span', 'hzs-b on', r.badge));
            b.addEventListener('pointerdown', function (e) { e.preventDefault(); });
            b.addEventListener('mousedown', function (e) { e.preventDefault(); });
            b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); sel = i; choose(r); });
            pal.appendChild(b);
        });
        var s = pal.querySelector('.sel'); if (s && s.scrollIntoView) s.scrollIntoView({ block: 'nearest' });
    }
    function hide() { isOpen = false; pal.hidden = true; }
    function refresh() {
        if (!host || !pal) return;
        tok = dismissed ? null : token();
        if (!tok) { rows = []; hide(); return; }
        rows = buildRows(tok.q);
        if (!rows.length) { hide(); return; }
        if (sel >= rows.length) sel = 0;
        isOpen = true; pal.hidden = false; paint();
    }
    function choose(r) {
        if (!tok) return;
        var v = input.value, ins = '@' + r.word + ' ';
        input.value = v.slice(0, tok.start) + ins + v.slice(tok.end);
        var pos = tok.start + ins.length;
        try { input.setSelectionRange(pos, pos); } catch (e) { /* ignore */ }
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.focus();
        hide(); rows = []; tok = null;
    }
    function onKey(e) {
        if (!isOpen || !rows.length) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + 1) % rows.length; paint(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); e.stopImmediatePropagation(); sel = (sel + rows.length - 1) % rows.length; paint(); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); dismissed = true; refresh(); }
        else if ((e.key === 'Enter' || e.key === 'Tab') && !e.shiftKey && !e.isComposing) { e.preventDefault(); e.stopImmediatePropagation(); choose(rows[sel]); }
    }

    // ---------- members bar (shows in a group chat) ----------
    function paintBar() {
        if (!bar) return;
        var chat = curChat(), g = chat && chat.group;
        var btn = host.button; if (btn) btn.classList.toggle('hgp-on', !!g);
        if (!g || !g.members || !g.members.length) { bar.hidden = true; bar.replaceChildren(); return; }
        var ps = provs(), by = {}; ps.forEach(function (p) { by[p.id] = p; });
        bar.replaceChildren();
        bar.appendChild(el('span', 'hgp-lbl', 'GROUP'));
        g.members.forEach(function (m) {
            var p = by[m.id]; if (!p) return;
            var c = el('button', 'hgp-chip' + (p.ready ? '' : ' off')); c.type = 'button'; c.title = m.model || '';
            c.appendChild(ico(p.icon)); c.appendChild(document.createTextNode(' ' + p.name));
            c.addEventListener('click', function () { input.focus(); input.value = ('@' + p.name.toLowerCase() + ' ') + input.value.replace(/^@\w+\s*/, ''); input.dispatchEvent(new Event('input', { bubbles: true })); });
            bar.appendChild(c);
        });
        // V1.61.0: DEBATE. One tap and every AI in the group critiques the others' replies.
        if (g.members.length > 1 && host.debate) {
            var db = el('button', 'hgp-debate', '\u2694\uFE0F Debate'); db.type = 'button'; db.title = 'Each AI critiques the others\u2019 replies';
            db.addEventListener('click', function () { host.debate(); });
            bar.appendChild(db);
        }
        var ed = el('button', 'hgp-edit', 'Edit'); ed.type = 'button'; ed.addEventListener('click', openSheet); bar.appendChild(ed);
        bar.hidden = false;
    }

    // ---------- sheet ----------
    function closeSheet() { if (sheet) sheet.hidden = true; }
    function paintSheet() {
        var chat = curChat(), g = chat && chat.group;
        var list = sheet.querySelector('.hgp-list'); list.replaceChildren();
        provs().forEach(function (p) {
            var d = draft[p.id] || (draft[p.id] = { on: false, model: p.model });
            var row = el('div', 'hgp-row' + (p.ready ? '' : ' off'));
            var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!d.on && p.ready; cb.disabled = !p.ready; cb.setAttribute('aria-label', 'Add ' + p.name);
            cb.addEventListener('change', function () { d.on = cb.checked; paintCount(); });
            var nm = el('span', 'hgp-nm'); nm.appendChild(ico(p.icon)); nm.appendChild(el('b', null, p.name));
            row.appendChild(cb); row.appendChild(nm);
            if (p.ready) {
                var s = el('select', 'hgp-sel'); s.setAttribute('aria-label', p.name + ' model');
                var ms = p.models.slice(); if (d.model && ms.indexOf(d.model) < 0) ms.unshift(d.model);
                ms.forEach(function (m) { var o = el('option', null, m); o.value = m; if (m === d.model) o.selected = true; s.appendChild(o); });
                s.addEventListener('change', function () { d.model = s.value; });
                row.appendChild(s);
            } else {
                var k = el('button', 'hgp-key', 'Add key'); k.type = 'button'; k.addEventListener('click', function () { closeSheet(); host.openKeys(p.id); }); row.appendChild(k);
            }
            list.appendChild(row);
        });
        var act = sheet.querySelector('.hgp-acts'); act.replaceChildren();
        function btn(label, cls, fn) { var b = el('button', 'use-btn ' + cls, label); b.type = 'button'; b.addEventListener('click', fn); act.appendChild(b); return b; }
        btn(g ? 'New group chat' : 'Start group chat', 'hgp-go', function () { commit('start'); });
        if (g) {
            btn('Update this group', 'hgp-alt', function () { commit('update'); });
            btn('Ungroup', 'hgp-alt', function () { host.ungroup(chat); host.notice('This chat is a normal chat again'); closeSheet(); paintBar(); });
        }
        paintCount();
    }
    function chosen() {
        return provs().filter(function (p) { return p.ready && draft[p.id] && draft[p.id].on; }).map(function (p) { return { id: p.id, model: draft[p.id].model || p.model }; });
    }
    function paintCount() {
        var n = chosen().length, c = sheet.querySelector('.hgp-count');
        c.textContent = n + ' selected' + (n < 2 ? ' (pick at least 2)' : '');
        c.classList.toggle('bad', n < 2);
    }
    function commit(mode) {
        var members = chosen();
        if (members.length < 2) { host.notice('Pick at least 2 AIs for a group chat.', 'error'); return; }
        var chat = curChat();
        if (mode === 'update' && chat) { host.update(chat, members); host.notice('Group updated: ' + members.length + ' AIs'); }
        else if (!host.start(members, true)) return;
        else host.notice('Group chat started with ' + members.length + ' AIs. Type @name to single one out.');
        closeSheet(); paintBar();
    }
    function buildSheet() {
        sheet = el('div', 'hz-gchat'); sheet.hidden = true;
        sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Group chat');
        var bg = el('div', 'hgp-bg'); bg.addEventListener('click', closeSheet);
        var box = el('div', 'hgp-sheet');
        var top = el('div', 'hgp-top');
        var ic = el('span', 'hgp-ic'); ic.appendChild(ico('i-users'));
        var tt = el('div', 'hgp-ttl'); tt.appendChild(el('b', null, 'Group chat')); tt.appendChild(el('span', null, 'Pick the AIs and their models. They all answer, one after another, and read each other.'));
        var x = el('button', 'hgp-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.appendChild(ico('i-x')); x.addEventListener('click', closeSheet);
        top.appendChild(ic); top.appendChild(tt); top.appendChild(x);
        box.appendChild(top);
        box.appendChild(el('div', 'hgp-list'));
        box.appendChild(el('div', 'hgp-count'));
        box.appendChild(el('p', 'hgp-tip', 'Type @gemini, @groq ... in the message box to send one message to just that AI. @all wakes the whole group.'));
        box.appendChild(el('div', 'hgp-acts'));
        sheet.appendChild(bg); sheet.appendChild(box);
        document.body.appendChild(sheet);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet(); });
    }
    function openSheet() {
        if (!sheet) buildSheet();
        var chat = curChat(), g = chat && chat.group;
        draft = {};
        provs().forEach(function (p) { draft[p.id] = { on: false, model: p.model }; });
        if (g) g.members.forEach(function (m) { if (draft[m.id]) { draft[m.id].on = true; draft[m.id].model = m.model || draft[m.id].model; } });
        paintSheet();
        sheet.hidden = false;
    }

    function init(h) {
        host = h; input = h.input;
        if (pal || !input) return;
        pal = el('div', 'hz-slash hz-mention'); pal.id = 'hzMention'; pal.hidden = true;
        pal.setAttribute('role', 'listbox'); pal.setAttribute('aria-label', 'AIs');
        var anchor = h.anchor && h.anchor.parentNode ? h.anchor : null;
        bar = el('div', 'hz-gpbar'); bar.hidden = true;
        if (anchor) { anchor.parentNode.insertBefore(pal, anchor); anchor.parentNode.insertBefore(bar, anchor); }
        else { input.parentNode.appendChild(pal); input.parentNode.appendChild(bar); }
        input.addEventListener('input', function () { dismissed = false; sel = 0; refresh(); });
        input.addEventListener('click', refresh);
        input.addEventListener('keyup', function (e) { if (e.key.indexOf('Arrow') === 0 && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) refresh(); });
        input.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== input) hide(); }, 150); });
        input.addEventListener('keydown', onKey, true);
        if (h.button) h.button.addEventListener('click', openSheet);
        var cm = document.getElementById('chatMessages');
        if (cm && window.MutationObserver) new MutationObserver(function () { paintBar(); }).observe(cm, { childList: true });
        document.addEventListener('hz:pick', paintBar);
        paintBar();
    }

    window.HorizonGroup = { init: init, route: route, open: openSheet };
})();
