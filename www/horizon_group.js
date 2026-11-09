/* Horizon V1.60.0: GROUP CHAT. The Group tile (top right) starts a chat with several AIs at once; typing @gemini, @groq ... pops up the AI names
   (like the slash menu) and singles one out for that message. Works in any chat: an @mention in a normal chat sends that one message to that AI.
   Public API: window.HorizonGroup = { init, route }. All chat state goes through the host callbacks passed in by index.html. */
(function () {
    'use strict';
    var host = null, input = null, pal = null, sheet = null, bar = null;
    var rows = [], sel = 0, isOpen = false, dismissed = false, tok = null;
    var draft = {};   // id -> { on, model } while the sheet is open
    var draftReady = false, fresh = false;   // V1.69.0: fresh = the sheet was opened from Create new group
    var leaving = false;   // V1.63.3: the bar shows the Continue-with chips after Leave is tapped

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
        if (g) {
            var live = g.members.filter(function (mm) { return by[mm.id] && !mm.mute; });
            if (!live.length) live = g.members.filter(function (mm) { return by[mm.id]; });   // everyone muted: never leave the group silent
            return { mention: false, targets: live.map(function (mm) { return { id: mm.id, model: mm.model }; }) };
        }
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

    // ---------- V1.69.0: the green "i" and the Options cascade menu (replaces the scrolling pill bar) ----------
    var menu = null, openKey = null;
    function paintBar() {
        if (!bar) return;
        var chat = curChat(), g = chat && chat.group;
        var btn = host.button; if (btn) btn.classList.toggle('hgp-on', !!g);
        if (!g || !g.members || !g.members.length) { bar.hidden = true; bar.replaceChildren(); closeMenu(); return; }
        if (!bar.querySelector('.hgp-i')) {
            bar.replaceChildren();
            var b = el('button', 'hgp-i', 'i'); b.type = 'button';
            b.setAttribute('aria-label', 'Group options: tag an AI, edit the group, preferences'); b.setAttribute('aria-haspopup', 'menu');
            b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); toggleMenu(b, 'above'); });
            bar.appendChild(b);
        }
        bar.hidden = false;
    }
    function closeMenu() {
        if (menu) { menu.remove(); menu = null; }
        openKey = null; draftReady = false;
        document.removeEventListener('pointerdown', outside, true);
    }
    function outside(e) {
        if (!menu) return;
        var t = e.target;
        if (menu.contains(t) || (t.closest && t.closest('.hgp-i, #hzBadge'))) return;
        closeMenu();
    }
    function toggleMenu(anchor, where) {
        if (menu) { closeMenu(); return; }
        var chat = curChat();
        if (!(chat && chat.group && chat.group.members && chat.group.members.length)) return;
        menu = el('div', 'hgp-menu'); menu.setAttribute('role', 'menu');
        menu._anchor = anchor; menu._where = where;
        document.body.appendChild(menu);
        paintMenu(true);
        document.addEventListener('pointerdown', outside, true);
    }
    function place() {
        if (!menu) return;
        var a = menu._anchor && menu._anchor.getBoundingClientRect ? menu._anchor.getBoundingClientRect() : null;
        var vw = window.innerWidth, vh = window.innerHeight, w = Math.min(344, vw - 16);
        menu.style.width = w + 'px';
        var left = a ? (menu._where === 'above' ? a.right - w : a.left + a.width / 2 - w / 2) : (vw - w) / 2;
        left = Math.max(8, Math.min(vw - w - 8, left));
        menu.style.left = left + 'px';
        if (a && menu._where === 'above') {
            menu.style.top = 'auto'; menu.style.bottom = Math.max(8, vh - a.top + 8) + 'px';
            menu.style.maxHeight = Math.max(160, a.top - 20) + 'px';
        } else {
            var top = a ? a.bottom + 8 : 70;
            menu.style.bottom = 'auto'; menu.style.top = top + 'px';
            menu.style.maxHeight = Math.max(160, vh - top - 12) + 'px';
        }
    }
    function mrow(i, glyph, title, hint, cls, fn) {
        var b = el('button', 'hgp-mi' + (cls ? ' ' + cls : '')); b.type = 'button'; b.setAttribute('role', 'menuitem');
        b.style.setProperty('--i', i);
        b.appendChild(el('span', 'hgp-mg', glyph));
        var tx = el('span', 'hgp-mt'); tx.appendChild(el('b', null, title)); if (hint) tx.appendChild(el('small', null, hint)); b.appendChild(tx);
        b.addEventListener('click', function (e) { e.preventDefault(); fn(); });
        return b;
    }
    function section(key, i, glyph, title, hint, cls, build) {
        var open = openKey === key;
        var frag = document.createDocumentFragment();
        var h = mrow(i, glyph, title, hint, (cls || '') + (open ? ' open' : ''), function () { openKey = openKey === key ? null : key; paintMenu(false); });
        h.appendChild(el('span', 'hgp-mc', open ? '\u2212' : '+'));
        h.setAttribute('aria-expanded', String(open));
        frag.appendChild(h);
        if (open) { var body = el('div', 'hgp-mb'); build(body); frag.appendChild(body); }
        return frag;
    }
    function mchip(i, p, sub, fn) {
        var c = el('button', 'hgp-mc2'); c.type = 'button'; c.style.setProperty('--i', i);
        c.appendChild(ico(p.icon)); var t = el('span', 'hgp-mt'); t.appendChild(el('b', null, p.name)); if (sub) t.appendChild(el('small', null, sub)); c.appendChild(t);
        c.addEventListener('click', function (e) { e.preventDefault(); fn(); });
        return c;
    }
    function paintMenu(first) {
        if (!menu) return;
        var chat = curChat(), g = chat && chat.group;
        if (!g || !g.members) { closeMenu(); return; }
        var ps = provs(), by = {}; ps.forEach(function (p) { by[p.id] = p; });
        var scroll = menu.scrollTop;
        menu.replaceChildren();
        menu.classList.toggle('first', !!first);
        var head = el('div', 'hgp-mh');
        head.appendChild(el('b', null, 'Options'));
        head.appendChild(el('small', null, g.members.length + ' AIs in this group'));
        var x = el('button', 'hgp-mx', '\u2715'); x.type = 'button'; x.setAttribute('aria-label', 'Close'); x.addEventListener('click', closeMenu);
        head.appendChild(x);
        menu.appendChild(head);
        var n = 0;
        // 1. TAG A PROVIDER
        menu.appendChild(section('tag', n++, '@', 'Tag a provider', 'Send one message to just that AI', '', function (b) {
            var k = 0;
            g.members.forEach(function (m) {
                var p = by[m.id]; if (!p) return;
                b.appendChild(mchip(k++, p, m.model || '', function () { tagInput('@' + p.name.toLowerCase() + ' '); }));
            });
            if (g.members.length > 1) b.appendChild(mchip(k++, { icon: 'i-users', name: 'Everyone' }, '@all: the whole group answers', function () { tagInput('@all '); }));
        }));
        // 2. EDIT GROUP
        menu.appendChild(section('edit', n++, '\u270E', 'Edit group', 'Pick the AIs and their models', '', function (b) { editBody(b); }));
        // 3. CREATE NEW GROUP
        menu.appendChild(mrow(n++, '\uFF0B', 'Create new group', 'Start a fresh group chat', '', function () { closeMenu(); openSheet(true); }));
        // 4. ADD AN AI TO THIS GROUP
        var spare = ps.filter(function (p) { return p.ready && !memberOf(g, p.id); });
        menu.appendChild(section('add', n++, '\u2795', 'Add AI', spare.length ? 'Bring another AI into this group' : 'Every ready AI is already in', '', function (b) {
            if (!spare.length) { b.appendChild(el('p', 'hgp-mn', 'Add a key for another provider in Settings to bring it in.')); return; }
            spare.forEach(function (p, k) {
                b.appendChild(mchip(k, p, p.model || '', function () {
                    var members = g.members.map(function (m) { return m.mute ? { id: m.id, model: m.model, mute: true } : { id: m.id, model: m.model }; }); members.push({ id: p.id, model: p.model });
                    host.update(chat, members); host.notice(p.name + ' joined the group'); paintBar(); paintMenu(false);
                }));
            });
        }));
        // 5. DEBATE (was a pill in the bar)
        if (g.members.length > 1 && host.debate) menu.appendChild(mrow(n++, '\u2694\uFE0F', 'Debate', 'Each AI critiques the others\u2019 replies', '', function () { closeMenu(); host.debate(); }));
        // 5b. JUDGE: one AI reads the others' replies and rules on them
        if (g.members.length > 1 && host.send) menu.appendChild(section('judge', n++, '\u2696\uFE0F', 'Judge', 'One AI weighs the replies and picks the best', '', function (b) {
            b.appendChild(el('p', 'hgp-mn', 'Pick who judges. It reads the latest replies above, says where they agree, where they clash, and gives the best answer.'));
            g.members.forEach(function (m, k) {
                var p = by[m.id]; if (!p) return;
                b.appendChild(mchip(k, p, m.model || '', function () {
                    if (host.busy && host.busy()) { host.notice('Wait for the AIs to finish first.'); return; }
                    closeMenu();
                    host.send('@' + p.name.toLowerCase() + ' Judge: read the latest replies from the other AIs above. In three short parts: 1) where they agree, 2) where they clash, 3) the best answer, in your own words. Do not repeat their replies.');
                }));
            });
        }));
        // 5c. ORDER AND MUTE
        if (g.members.length > 1) menu.appendChild(section('order', n++, '\u2195', 'Order and mute', 'Who answers first, and who stays quiet', '', function (b) {
            b.appendChild(el('p', 'hgp-mn', 'Top answers first. A muted AI stays in the group and can still be tagged with @name, it just skips group replies.'));
            var mem = g.members.slice();
            function commitOrder(arr) { host.update(chat, arr); paintBar(); paintMenu(false); }
            mem.forEach(function (m, k) {
                var p = by[m.id]; if (!p) return;
                var row = el('div', 'hgp-or' + (m.mute ? ' muted' : '')); row.style.setProperty('--i', k);
                row.appendChild(el('span', 'hgp-on2', String(k + 1)));
                var nm = el('span', 'hgp-nm'); nm.appendChild(ico(p.icon)); nm.appendChild(el('b', null, p.name)); row.appendChild(nm);
                function mini(txt, label, dis, fn) { var x = el('button', 'hgp-mini', txt); x.type = 'button'; x.setAttribute('aria-label', label); x.disabled = !!dis; x.addEventListener('click', function (e) { e.preventDefault(); fn(); }); return x; }
                row.appendChild(mini('\u25B2', 'Move ' + p.name + ' up', k === 0, function () { var a = mem.slice(); var t = a[k - 1]; a[k - 1] = a[k]; a[k] = t; commitOrder(a); }));
                row.appendChild(mini('\u25BC', 'Move ' + p.name + ' down', k === mem.length - 1, function () { var a = mem.slice(); var t = a[k + 1]; a[k + 1] = a[k]; a[k] = t; commitOrder(a); }));
                row.appendChild(mini(m.mute ? '\uD83D\uDD07' : '\uD83D\uDD0A', (m.mute ? 'Unmute ' : 'Mute ') + p.name, false, function () {
                    var live = mem.filter(function (x) { return !x.mute; }).length;
                    if (!m.mute && live <= 1) { host.notice('Keep at least one AI unmuted.'); return; }
                    var a = mem.map(function (x) { var o = { id: x.id, model: x.model }; if (x.mute) o.mute = true; return o; });
                    if (m.mute) delete a[k].mute; else a[k].mute = true;
                    commitOrder(a);
                }));
                b.appendChild(row);
            });
        }));
        // 6. PREFERENCES (group rules)
        menu.appendChild(section('prefs', n++, '\u2699', 'Preferences', 'Group rules: the hard guard rails', '', function (b) { prefsBody(b, chat); }));
        // 6b. WAKE ALARM: repeating (daily / weekdays) plus the morning brief
        menu.appendChild(section('wake', n++, '\u23F0', 'Wake alarm', wakeHint(), '', function (b) { wakeBody(b); }));
        menu.appendChild(mrow(n++, '\u2600\uFE0F', 'Hear my morning brief now', 'Calendar, weather and one line of news', '', function () { closeMenu(); window.dispatchEvent(new Event('horizon-brief-now')); }));
        // 7. LEAVE GROUP
        menu.appendChild(section('leave', n++, '\u21AA', 'Leave group', 'Keep chatting with one AI (history stays)', 'hgp-danger', function (b) {
            b.appendChild(el('p', 'hgp-mn', 'Continue with:'));
            g.members.forEach(function (m, k) {
                var p = by[m.id]; if (!p) return;
                b.appendChild(mchip(k, p, m.model || '', function () {
                    if (host.leave && host.leave(chat, m.id)) { host.notice('Left the group. Now a normal chat with ' + p.name + '.'); closeMenu(); paintBar(); }
                }));
            });
        }));
        // 8. USAGE (the header pill used to open this)
        var badge = document.getElementById('hzBadge');
        if (badge) menu.appendChild(mrow(n++, '\u25D4', 'Usage dashboard', 'Engine, speed and keys', '', function () { closeMenu(); badge.dataset.pass = '1'; badge.click(); delete badge.dataset.pass; }));
        place();
        menu.scrollTop = scroll;
    }
    function wakeHint() {
        var W = window.HorizonDash && HorizonDash.wake; if (!W) return 'Repeats daily or weekdays, with a morning brief';
        var w = W.get(); return w.on ? (w.r === 'weekdays' ? 'Weekdays' : 'Every day') + ' at ' + w.t + (w.brief ? ' + morning brief' : '') : 'Off. Repeats daily or weekdays, with a morning brief';
    }
    function wakeBody(b) {
        var W = window.HorizonDash && HorizonDash.wake;
        if (!W) { b.appendChild(el('p', 'hgp-mn', 'Alarms need the Android app.')); return; }
        var w = W.get();
        function chk(label, on) { var l = el('label', 'hgp-wk'); var c = el('input'); c.type = 'checkbox'; c.checked = !!on; l.appendChild(c); l.appendChild(el('span', null, label)); b.appendChild(l); return c; }
        var cOn = chk('Wake alarm on', w.on);
        var row = el('div', 'hgp-wk');
        var tm = el('input', 'hgp-time'); tm.type = 'time'; tm.value = w.t; tm.setAttribute('aria-label', 'Wake time');
        var rp = el('select', 'hgp-sel'); rp.setAttribute('aria-label', 'Repeat');
        [['daily', 'Every day'], ['weekdays', 'Weekdays only']].forEach(function (o) { var x = el('option', null, o[1]); x.value = o[0]; if (o[0] === w.r) x.selected = true; rp.appendChild(x); });
        row.appendChild(tm); row.appendChild(rp); b.appendChild(row);
        var cBr = chk('Morning brief when I tap Stop (calendar, weather, one line of news, read aloud)', w.brief);
        var songRow = el('div', 'hgp-acts');
        var sb = el('button', 'use-btn hgp-alt', '\uD83C\uDFB5 Wake-up song'); sb.type = 'button';
        sb.addEventListener('click', function () {
            var ap = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.HorizonAlarm;
            if (!ap) { host.notice('Alarm songs need the Android app.'); return; }
            ap.pickSong().then(function (r) { host.notice(r && r.ok ? 'Wake-up song: ' + r.name : 'No song chosen. The phone alarm tone is used.'); }).catch(function () { host.notice('Could not open the song picker.'); });
        });
        songRow.appendChild(sb); b.appendChild(songRow);
        var st = el('p', 'hgp-mn', ''); b.appendChild(st);
        var go = el('button', 'use-btn hgp-go hgp-wide', 'Save wake alarm'); go.type = 'button';
        go.addEventListener('click', function () {
            go.disabled = true;
            W.set({ on: cOn.checked, t: tm.value || '07:00', r: rp.value, brief: cBr.checked }).then(function (res) {
                go.disabled = false;
                if (!res.w.on) { st.textContent = 'Wake alarm is off.'; host.notice('Wake alarm off'); }
                else if (res.ok) { var d = new Date(res.next); st.textContent = 'Next ring: ' + d.toLocaleDateString([], { weekday: 'long' }) + ' ' + res.w.t + '. Then it repeats ' + (res.w.r === 'weekdays' ? 'on weekdays' : 'every day') + '.'; host.notice('Wake alarm set for ' + res.w.t); }
                else { st.textContent = 'Could not set it here. It works in the Android app.'; }
                paintMenu(false);
            });
        });
        b.appendChild(go);
        b.appendChild(el('p', 'hgp-mn', 'Tip: in the calendar, tap Fix alarm settings once so Honor lets the alarm ring with the screen off.'));
    }
    function tagInput(txt) {
        closeMenu();
        input.focus();
        input.value = txt + input.value.replace(/^@\w+\s*/, '');
        input.dispatchEvent(new Event('input', { bubbles: true }));
        try { input.setSelectionRange(input.value.length, input.value.length); } catch (e) { /* not selectable */ }
    }
    function editBody(b) {
        var chat = curChat(), g = chat && chat.group;
        if (!draftReady || !Object.keys(draft).length) initDraft(false);
        var list = el('div', 'hgp-list hgp-mlist');
        provs().forEach(function (p, k) {
            var d = draft[p.id] || (draft[p.id] = { on: false, model: p.model });
            var row = el('div', 'hgp-row' + (p.ready ? '' : ' off')); row.style.setProperty('--i', k);
            var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!d.on && p.ready; cb.disabled = !p.ready; cb.setAttribute('aria-label', 'Include ' + p.name);
            cb.addEventListener('change', function () { d.on = cb.checked; cnt(); });
            var nm = el('span', 'hgp-nm'); nm.appendChild(ico(p.icon)); nm.appendChild(el('b', null, p.name));
            row.appendChild(cb); row.appendChild(nm);
            if (p.ready) {
                var s = el('select', 'hgp-sel'); s.setAttribute('aria-label', p.name + ' model');
                var ms = p.models.slice(); if (d.model && ms.indexOf(d.model) < 0) ms.unshift(d.model);
                ms.forEach(function (m) { var o = el('option', null, m); o.value = m; if (m === d.model) o.selected = true; s.appendChild(o); });
                s.addEventListener('change', function () { d.model = s.value; });
                row.appendChild(s);
            } else {
                var kb = el('button', 'hgp-key', 'Add key'); kb.type = 'button'; kb.addEventListener('click', function () { closeMenu(); host.openKeys(p.id); }); row.appendChild(kb);
            }
            list.appendChild(row);
        });
        b.appendChild(list);
        var c = el('div', 'hgp-count'); b.appendChild(c);
        function cnt() { var k = chosen().length; c.textContent = k + ' selected' + (k < 2 ? ' (pick at least 2)' : ''); c.classList.toggle('bad', k < 2); }
        cnt();
        var go = el('button', 'use-btn hgp-go hgp-wide', 'Update this group'); go.type = 'button';
        go.addEventListener('click', function () { var m = chosen(); if (m.length < 2) { host.notice('Pick at least 2 AIs for a group chat.', 'error'); return; } host.update(chat, m); host.notice('Group updated: ' + m.length + ' AIs'); closeMenu(); paintBar(); });
        b.appendChild(go);
    }
    function prefsBody(b, chat) {
        b.appendChild(el('p', 'hgp-mn', 'Group rules sit on top of your normal reply preferences. Every AI here still follows those, and these are their harder guard rails: if the two clash, the group rules win.'));
        var ta = el('textarea', 'hgp-rules'); ta.rows = 5; ta.maxLength = 1500;
        ta.placeholder = 'e.g. Keep replies under 5 lines. No code unless I ask. Do not repeat what another AI said. Disagree politely and say why.';
        ta.value = (chat.group && chat.group.rules) || '';
        ta.setAttribute('aria-label', 'Group rules');
        b.appendChild(ta);
        var row = el('div', 'hgp-acts');
        var sv = el('button', 'use-btn hgp-go', 'Save rules'); sv.type = 'button';
        sv.addEventListener('click', function () { if (host.rules) host.rules(chat, ta.value.trim()); host.notice(ta.value.trim() ? 'Group rules saved. All AIs here follow them.' : 'Group rules cleared.'); });
        var cl = el('button', 'use-btn hgp-alt', 'Clear'); cl.type = 'button';
        cl.addEventListener('click', function () { ta.value = ''; if (host.rules) host.rules(chat, ''); host.notice('Group rules cleared.'); });
        row.appendChild(sv); row.appendChild(cl); b.appendChild(row);
    }

    // ---------- sheet ----------
    function closeSheet() { if (sheet) sheet.hidden = true; draftReady = false; }
    function paintSheet() {
        var chat = curChat(), g = fresh ? null : (chat && chat.group);
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
            btn('Ungroup', 'hgp-alt', function () { if (host.leave) { if (!host.leave(chat)) return; } else host.ungroup(chat); host.notice('This chat is a normal chat again'); closeSheet(); paintBar(); });
        }
        paintCount();
    }
    function chosen() {
        var cg = curChat() && curChat().group, old = cg && cg.members ? cg.members : [];
        var list = provs().filter(function (p) { return p.ready && draft[p.id] && draft[p.id].on; }).map(function (p) {
            var o = memberOf(cg, p.id), r = { id: p.id, model: draft[p.id].model || p.model };
            if (o && o.mute) r.mute = true;
            return r;
        });
        var pos = function (id) { for (var i = 0; i < old.length; i++) if (old[i].id === id) return i; return 999; };
        return list.sort(function (a, b) { return pos(a.id) - pos(b.id); });
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
    function initDraft(blank) {
        var chat = curChat(), g = blank ? null : (chat && chat.group);
        draft = {};
        provs().forEach(function (p) { draft[p.id] = { on: false, model: p.model }; });
        if (g) g.members.forEach(function (m) { if (draft[m.id]) { draft[m.id].on = true; draft[m.id].model = m.model || draft[m.id].model; } });
        draftReady = true;
    }
    function openSheet(blank) {
        if (!sheet) buildSheet();
        fresh = blank === true;
        initDraft(fresh);
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
        if (h.button) h.button.addEventListener('click', function () { openSheet(false); });
        var cm = document.getElementById('chatMessages');
        if (cm && window.MutationObserver) new MutationObserver(function () { paintBar(); }).observe(cm, { childList: true });
        document.addEventListener('hz:pick', paintBar);
        paintBar();
    }

    // V1.64.0: which voice slot an AI takes when replies are read aloud. Group members count in group order; a one-off @mention chat counts
    // AIs in the order they first spoke. Slot 0 is the voice picked in Settings, then each slot steps to the next voice on the same engine.
    function voiceSlot(provId) {
        var chat = curChat();
        if (!chat || !provId) return 0;
        var order = [];
        if (chat.group && chat.group.members && chat.group.members.length) order = chat.group.members.map(function (m) { return m.id; });
        else if (chat.multi && chat.messages) chat.messages.forEach(function (m) { if (m.role !== 'user' && m.prov && order.indexOf(m.prov) < 0) order.push(m.prov); });
        var i = order.indexOf(provId);
        return i > 0 ? i : 0;
    }

    window.HorizonGroup = { init: init, route: route, open: function () { openSheet(false); }, menu: toggleMenu, voiceSlot: voiceSlot };
})();
