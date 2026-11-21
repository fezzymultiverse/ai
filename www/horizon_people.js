/* V1.99.23 · live bar: cyan pulse "Connecting to <AI>…" the moment the request goes out, then "<AI> is typing" with bouncing dots when the reply starts typing out; works for every AI; V1.99.21 · rule sync across members (toast + auto-tick), AI replies ON/OFF, persistent AI-first box (X or swipe, show/hide in Options), Options pill + people pill by the chat box, Referee label, Leave opens a new chat with your last provider (Gemini by default); V1.99.20 · after-everyone timing restored beside Who goes first + Exclude AI; V1.99.19 · one rule (AI answers after every message) + Who goes first pop-up + Exclude AI; V1.99.18 · my own name + photo beside my Horizon ID; V1.99.17 · load-safe (styles start from init); V1.99.16 · AI auto-reply (after each / after everyone) fixed; V1.99.15 · providers use their own sprite mark, never a letter; V1.99.14 · every provider has an SVG mark; People i and Group i are separate; header text readable. Horizon People: additive number/PIN identity, accepted contacts, shared rooms and Reply first. V1.99.0: one united hub (Add & preferences + Synced contacts), group pill, pinned +. */
(function () {
    'use strict';
    var host, panel, status, section, strip, gate = null, skipOnce = {}, syncing = false, sending = false, backupTimer, pollTimer, liveBar, lbLoad, lbClock, lbState, lbText, emptyCard, loaded = false, offline = false;
    var snapshot = { contacts: [], requests: [], invitations: [], rooms: [], people: [] };
    var key = 'horizon_people_v1', config;
    try { config = JSON.parse(localStorage.getItem(key) || '{}'); } catch (_) { config = {}; }
    if (!config.mig197) { config.replyFirst = false; config.mig197 = true; try { localStorage.setItem(key, JSON.stringify(config)); } catch (_) {} }
    if (!config.mig1919) { config.replyFirst = true; config.mig1919 = true; try { localStorage.setItem(key, JSON.stringify(config)); } catch (_) {} }
    if (!config.mig199) { config.defaults = config.defaults || {}; config.defaults.timing = 'all'; config.mig199 = true; try { localStorage.setItem(key, JSON.stringify(config)); } catch (_) {} }
    // Cache accepted contacts per identity, not only in the open panel. The relay remains authoritative.
    if (config.me && config.savedContacts && config.savedContacts[config.me.id]) {
        snapshot.contacts = config.savedContacts[config.me.id]; snapshot.people = [config.me].concat(snapshot.contacts);
    }
    function selectAlertAccount(id) {
        config.alertAccounts = config.alertAccounts || {};
        if (config.watchAccount && config.watchAccount !== id) config.alertAccounts[config.watchAccount] = { watchToken: config.watchToken, alertCursor: config.alertCursor, alertsEnabled: config.alertsEnabled, pushURL: config.pushURL };
        if (config.watchAccount !== id) { var saved = config.alertAccounts[id] || {}; ['watchToken','alertCursor','alertsEnabled','pushURL'].forEach(function(k) { delete config[k]; if (saved[k] != null) config[k] = saved[k]; }); }
        config.watchAccount = id;
    }
    function store() { localStorage.setItem(key, JSON.stringify(config)); }
    function el(tag, text, cls) { var n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; }
    function button(text, run) { var b = el('button', text); b.type = 'button'; b.onclick = async function () { if (b.disabled) return; b.disabled = true; try { await run(); } catch (e) { error(e); } finally { b.disabled = false; } }; return b; }
    function error(e) { if (status) status.textContent = e.message || String(e); if (host) host.notice(e.message || String(e), 'error'); }
    function me() { return config.me && config.me.id; }
    function selections() { var k = 'selection_' + (me() || 'local'); return config[k] || (config[k] = { contacts: [], ai: [], includeAI: false }); }
    function exclusionKey() { return 'excluded_' + (me() || 'local'); }
    function excluded(room) { return (config[exclusionKey()] || []).indexOf(room) >= 0; }
    // The chat service address is built into the app (www/horizon_people_config.js). Nobody types it in.
    function native() { return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); }
    function base() {
        var s = (window.HORIZON_PEOPLE_SERVER || config.server || '').replace(/\/$/, '');
        if (!s) { if (native()) throw new Error('The chat service is not set up in this build yet.'); s = location.origin; }
        return s + '/people-api/';
    }
    function b64url(t) { return btoa(t).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
    async function api(route, data) {
        var controller = new AbortController(), timer = setTimeout(function () { controller.abort(); }, 20000);
        try {
            var r = await fetch(base() + route, { method: data === undefined ? 'GET' : 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, config.token ? { Authorization: 'Bearer ' + config.token } : {}), body: data === undefined ? undefined : JSON.stringify(data), signal: controller.signal, cache: 'no-store' });
            var b; try { b = await r.json(); } catch (_) { throw new Error('Could not reach the chat service. Check your internet and try again.'); }
            if (!r.ok) { if (r.status === 401 && route !== 'connect') { delete config.token; store(); if (panel) render(); if (host) host.notice('You were signed out. Open People and enter your number and PIN.', 'error'); } throw new Error(b.error || 'Could not connect.'); }
            return b;
        } catch (e) { if (e.name === 'AbortError') throw new Error('The chat service timed out. Check your internet and try again.'); throw e; }
        finally { clearTimeout(timer); }
    }
    function name(id) { var p = snapshot.people.find(function (p) { return p.id === id; }); return id === me() ? 'You' : (p ? (p.name || p.number || p.id) : id); }
    function active(chat) { return !!(chat && chat.people && config.token && chat.people.account === me() && !excluded(chat.people.room)); }
    function chatFor(r) {
        var chat = host.chats().find(function (c) { return c.people && c.people.room === r.id && c.people.account === me(); });
        if (!chat) { chat = host.make(r.title, { room: r.id, account: me(), ai: false }); applyDefaults(chat); }
        return chat;
    }
    function cursorsFor() {
        var all = (config.cursors && config.cursors[me()]) || {}, out = {}, any = false;
        host.chats().forEach(function (c) { var id = c.people && c.people.account === me() && c.people.room; if (id && all[id] != null && !excluded(id)) { out[id] = all[id]; any = true; } });
        return any ? out : null;
    }
    function advance(r, sent) {
        var top = r.messages.reduce(function (n, m) { return Math.max(n, m.ts || 0); }, 0);
        config.cursors = config.cursors || {}; var mine = config.cursors[me()] = config.cursors[me()] || {};
        var next = sent && sent[r.id] != null ? Math.max(sent[r.id], top) : top;
        if (next && mine[r.id] !== next) { mine[r.id] = next; return true; }
        return false;
    }
    function ingest(s, sent) {
        snapshot = s; loaded = true; offline = false;
        var meChanged = JSON.stringify(config.me) !== JSON.stringify(s.me);
        config.me = s.me;
        config.savedContacts = config.savedContacts || {};
        var contactsChanged = JSON.stringify(config.savedContacts[me()]) !== JSON.stringify(s.contacts);
        config.savedContacts[me()] = s.contacts;
        if (contactsChanged || meChanged) store();
        paintBadge();
        var changed = false, moved = false, ruleChanged = false;
        s.rooms.forEach(function (r) {
            var c = chatFor(r); if (c.messages.some(function (x) { return x.text === CTRL; })) { c.messages = c.messages.filter(function (x) { return x.text !== CTRL; }); changed = true; }
            var seen = new Set(c.messages.filter(function (m) { return m.remoteId; }).map(function (m) { return m.remoteId; }));
            if (c.people.memberCount !== r.members.length) { c.people.memberCount = r.members.length; changed = true; }
            if (excluded(r.id)) return;
            if (advance(r, sent)) moved = true;
            r.messages.forEach(function (m) {
                if (seen.has(m.id)) return; seen.add(m.id);
                if (m.text && String(m.text).indexOf(RULE) === 0) {   // V1.99.21: rule sync. Never shown as a message.
                    if (m.kind !== 'ai') {
                        if (m.sender === me()) c.people.ruleTs = Math.max(c.people.ruleTs || 0, m.ts || 0);
                        else {
                            var rb = parseRule(m.text);
                            if (rb && (m.ts || 0) > (c.people.ruleTs || 0)) {
                                applyRule(c, rb.t, rb.on, m.ts || Date.now(), false); delete c.people.rulePending; ruleChanged = true;
                                if (Date.now() - (m.ts || 0) < 600000) host.notice(name(m.sender) + ' set: ' + ruleLabel(rb.t, rb.on));
                            }
                        }
                    }
                    changed = true; return;
                }
                // Matching client id stitches the sender's optimistic/local AI bubble to the relay record.
                var local = m.clientId && c.messages.find(function (x) { return x.clientId === m.clientId; });
                if (local) { local.remoteId = m.id; if (local.delivery) local.delivery = 'sent'; delete local.shareFailed; changed = true; return; }
                if (m.kind !== 'ai' && m.sender === me() && m.text === CTRL) { return; }   // V1.99.16: my own Ask AI signal is never shown as a message
                if (m.kind !== 'ai' && m.sender !== me() && m.text === CTRL) { c.people.ctrl = c.people.ctrl || []; if (c.people.ctrl.indexOf(m.id) < 0) { c.people.ctrl = c.people.ctrl.concat(m.id).slice(-50); if (iOwnAI(c) && c.people.joined !== false && !aiOff(c)) wantAI(c, lastText(c) ? awarePrompt(c, lastText(c), { asker: m.sender, forced: true, intro: introFor(c, c.people.aiMembers || []) }) : null, true); changed = true; } return; }
                c.messages.push({ role: m.kind === 'ai' ? 'ai' : (m.sender === me() ? 'user' : 'human'), text: m.text, ts: m.ts, remoteId: m.id, clientId: m.clientId, sender: name(m.sender), sharedAI: m.kind === 'ai', sharedProvider: m.provider, peopleMessage: true });
                c.updated = Math.max(c.updated || 0, m.ts); changed = true;
                if (m.kind === 'ai' && m.sender !== me() && c.people.aiBy !== m.sender) c.people.aiBy = m.sender;
                if (m.kind !== 'ai' && m.sender !== me()) {
                    var mentions = mentionIds(m.text, c), tagged = taggedMine(c, m.text);
                    if (mentions.length) { if (tagged.length) answerTagged(c, m, tagged); }
                    else if (shouldAnswer(c, m.sender)) wantAI(c, awarePrompt(c, m.text, { intro: introFor(c, c.people.aiMembers || []) }));
                }
            });
        });
        // If removed/left remotely, stop publishing from that room immediately.
        host.chats().forEach(function (c) { if (c.people && c.people.account === me()) { var joined = s.rooms.some(function (r) { return r.id === c.people.room; }); if (c.people.joined !== joined) { c.people.joined = joined; changed = true; } } });
        host.chats().forEach(function (c) { if (c.people && c.people.rulePending) sendRule(c); });
        if (ruleChanged) refreshInfo();
        if (moved) store();
        if (changed) { host.save(); if (!host.busy()) host.refresh(); }
        // V1.98.0: a one-to-one chat from an accepted contact needs no second approval. Groups still ask.
        (s.invitations || []).forEach(function (r) {
            if (r.group !== false || autoJoin[r.id] || !contactById(r.from) || (s.blocked || []).some(function (b) { return b.id === r.from; })) return;
            autoJoin[r.id] = 1; api('join', { id: r.id, accept: true }).then(function () { return sync(); }).catch(function () { delete autoJoin[r.id]; });
        });
        paintStrip();
    }
    async function sync() {
        if (!config.token || syncing) return;
        syncing = true; paintLive();
        var session = config.token;
        function signature(s) { return JSON.stringify([s.me, s.people, s.contacts, s.requests, s.invitations, s.blocked, (s.rooms || []).map(function (r) { return [r.id, r.members, r.pending]; })]); }
        try { var sent = cursorsFor(), s = await api('sync' + (sent ? '?c=' + b64url(JSON.stringify(sent)) : '')); if (session !== config.token) return; var changed = signature(snapshot) !== signature(s); ingest(s, sent || {}); autoRetry(); autoAlerts(); if (status) status.textContent = 'Connected · ' + config.me.id; if (changed && panel && !panel.hidden) renderSections(); }
        catch (e) { offline = true; if (status) status.textContent = 'Offline · ' + e.message; }
        finally { syncing = false; paintLive(); }
    }
    function scheduleBackup() {
        if (!config.token || !host) return;
        clearTimeout(backupTimer);
        backupTimer = setTimeout(function () {
            if (!config.token) return;
            var chats = host.chats().filter(function (c) { return !c.people || c.people.account === me(); });
            api('backup', { chats: chats, excluded: config[exclusionKey()] || [] }).catch(function (e) { if (status) status.textContent = 'Backup pending · ' + e.message; });
        }, 2000);
    }
    function cancelWait(allow) {
        if (!gate) return;
        var old = gate; gate = null; clearInterval(old.interval); clearTimeout(old.timer); try { old.bar.remove(); } catch (_) {} old.resolve(!!allow);
    }
    function aiOff(c) { return !!(c && c.people && c.people.aiOff); }
    // V1.99.21: the X (or a swipe) closes the box and the AI stays quiet so you can reply yourself.
    function dismissBox(chat) { skipOnce[chat.id] = true; cancelWait(false); try { host.input.focus(); } catch (_) {} }
    function mountBox(bar) { var comp = host.input.closest ? host.input.closest('.composer') : null; if (comp) comp.prepend(bar); else host.input.parentElement.before(bar); }
    // Swipe the box left or right to dismiss it. Taps on the buttons still work: dragging only starts after a few pixels of sideways movement.
    function swipeAway(bar, done) {
        var sx = null, dx = 0, pid = null, drag = false;
        bar.style.touchAction = 'pan-y';
        bar.addEventListener('pointerdown', function (e) { sx = e.clientX; dx = 0; pid = e.pointerId; drag = false; });
        bar.addEventListener('pointermove', function (e) {
            if (sx == null || e.pointerId !== pid) return;
            dx = e.clientX - sx;
            if (!drag && Math.abs(dx) > 8) { drag = true; try { bar.setPointerCapture(pid); } catch (_) {} bar.style.transition = 'none'; }
            if (drag) { bar.style.transform = 'translateX(' + dx + 'px)'; bar.style.opacity = String(Math.max(0.25, 1 - Math.abs(dx) / 260)); }
        });
        function end(e) {
            if (sx == null || (e && e.pointerId !== pid)) return;
            var far = drag && Math.abs(dx) > 70; sx = null;
            if (!drag) return;
            bar.style.transition = 'transform .18s, opacity .18s';
            if (far) { bar.style.transform = 'translateX(' + (dx > 0 ? 420 : -420) + 'px)'; bar.style.opacity = '0'; setTimeout(done, 170); }
            else { bar.style.transform = ''; bar.style.opacity = ''; }
        }
        bar.addEventListener('pointerup', end); bar.addEventListener('pointercancel', end);
    }
    function beforeAI(chat) {
        // V1.99.21: the box belongs to live people chats only, never to a normal AI chat, and never when AI replies are off.
        if (!active(chat) || aiOff(chat)) return Promise.resolve(true);
        if (bypass[chat.id] && bypass[chat.id] > Date.now()) { delete bypass[chat.id]; return Promise.resolve(true); }
        if (config.replyFirst !== true) return Promise.resolve(true);
        if (gate && gate.chatId === chat.id && chat.messages.filter(function(m) {return m.role === 'user';}).length > gate.userTurns) { cancelWait(false); return Promise.resolve(true); }
        if (skipOnce[chat.id]) { delete skipOnce[chat.id]; return Promise.resolve(true); }
        if (chat._userFirstHandled) { delete chat._userFirstHandled; return Promise.resolve(true); }
        cancelWait(false);
        return new Promise(function (resolve) {
            var bar = el('div', null, 'hzp-reply'), label = el('span', 'Let the AI answer first?', 'hzp-reply-t');
            var go = button('AI reply first', function () { cancelWait(true); }); go.className = 'hzp-reply-go';
            var x = button('✕', function () { dismissBox(chat); }); x.className = 'hzp-reply-x'; x.setAttribute('aria-label', 'Close, I will reply first'); x.title = 'Close: I will reply first';
            bar.setAttribute('role', 'status'); bar.append(label, go, x);
            swipeAway(bar, function () { dismissBox(chat); });
            mountBox(bar);
            gate = { bar: bar, resolve: resolve, chatId: chat.id, userTurns: chat.messages.filter(function(m) {return m.role === 'user';}).length, timer: null, interval: null };
        });
    }
    async function shareAI(chat, message) {
        if (!active(chat) || chat.people.joined === false || !chat.people.ai || message.remoteId) return;
        message.clientId = message.clientId || crypto.randomUUID();
        try {
            var result = await api('message', { room: chat.people.room, text: message.text, kind: 'ai', provider: message.prov, clientId: message.clientId });
            message.remoteId = result.message.id; host.save();
        } catch (e) { message.shareFailed = true; host.save(); error(new Error('AI reply kept locally; sharing failed. Use Retry unsent in People. ' + e.message)); }
    }
    async function send(text, hasAttachments) {
        var c = host.current();
        if (!active(c)) return false;
        if (c.people.joined === false) { error(new Error('You have left this chat. Exclude it to continue locally with AI.')); return true; }
        if (hasAttachments) { error(new Error('People chat currently sends text only. Remove the attachment, or exclude people to continue with AI.')); return true; }
        if (sending) return true;
        if (!text) return true;
        if (gate && gate.chatId === c.id) { c._userFirstHandled = true; }
        cancelWait(false); force(c.id, false); sending = true;
        try {
            var clientId = crypto.randomUUID(), m = host.append(c, 'user', text, { clientId: clientId, sender: 'You', peopleMessage: true, delivery: 'pending' });
            host.clearInput(); host.refresh();
            try { var result = await api('message', { room: c.people.room, text: text, clientId: clientId }); m.remoteId = result.message.id; m.delivery = 'sent'; }
            catch (e) { m.delivery = 'failed'; host.save(); host.refresh(); throw new Error('Message not delivered. It is kept here; use Retry unsent in People. ' + e.message); }
            host.save(); host.refresh();
        } finally { sending = false; }
        // Release the transport lock before waiting for AI, so Reply first can send the next human turn.
        var ments = mentionIds(text, c);
        if (ments.length && !aiOff(c) && active(c)) {
            var ready = providers().filter(function (p) { return p.ready && ments.indexOf(p.id) >= 0; }).map(function (p) { return p.id; });
            if (ready.length) {
                wantAI(c, awarePrompt(c, text, { asker: me(), forced: true, intro: introFor(c, ready) }), true, ready);
            } else host.notice('Tagged provider needs a key on its owner’s device. No other AI will answer instead.');
        } else if (!ments.length && active(c) && shouldAnswer(c, me())) {
            wantAI(c, awarePrompt(c, text, { intro: introFor(c, c.people.aiMembers || []) }));
        }
        return true;
    }
    async function autoRetry() {
        if (sending || !config.token) return;
        var did = false;
        for (var c of host.chats()) {
            if (!active(c) || c.people.joined === false) continue;
            for (var m of c.messages) {
                if (m.delivery !== 'failed') continue;
                try { var r = await api('message', { room: c.people.room, text: m.text, clientId: m.clientId }); m.remoteId = r.message.id; m.delivery = 'sent'; did = true; } catch (_) { return; }
            }
        }
        if (did) { host.save(); host.refresh(); }
    }
    async function retryUnsent() {
        var c = host.current(); if (!active(c)) throw new Error('Open the people chat to retry.');
        for (var m of c.messages) {
            if (m.delivery === 'failed') { var r = await api('message', { room: c.people.room, text: m.text, clientId: m.clientId }); m.remoteId = r.message.id; m.delivery = 'sent'; }
            if (m.shareFailed) { await shareAI(c, m); if (m.remoteId) delete m.shareFailed; }
        }
        host.save(); host.refresh(); renderSections();
    }
    function field(label, type, placeholder) {
        var wrap = el('label', label), input = el('input'); input.type = type; input.placeholder = placeholder || ''; wrap.append(input); return { wrap: wrap, input: input };
    }
    function row() { return el('div', null, 'hzp-row'); }
    function check(label, value, run) { var l = el('label', null, 'hzp-check'), i = el('input'); i.type = 'checkbox'; i.checked = value; i.onchange = function () { Promise.resolve().then(function () { return run(i.checked); }).catch(function(e) { i.checked = !i.checked; error(e); }); }; l.append(i, document.createTextNode(label)); return l; }
    async function copyID(id) {
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(id);
            else throw new Error('fallback');
        } catch (_) {
            var input = el('textarea'); input.value = id; input.setAttribute('readonly', '');
            input.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(input); input.select();
            var copied = false;
            try { copied = document.execCommand('copy'); } finally { input.remove(); }
            if (!copied) throw new Error('Copy is unavailable. Your Horizon ID is ' + id);
        }
        if (status) status.textContent = 'Horizon ID copied';
        host.notice('Horizon ID copied');
    }
    /* V1.99.18 · my own name and my own picture, right beside my Horizon ID. The photo is centre-cropped to the app shape and stays on this phone. */
    function ownControls(card) {
        var m = config.me, box = el('div', null, 'hzp-own');
        function repaintOwn() { pillSig = ''; paintBadge(); try { paintPills(); paintStrip(); } catch (e) { } renderSections(); }
        var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
        file.onchange = async function () {
            var f = file.files && file.files[0]; file.value = ''; if (!f) return;
            var old = photos()[m.id];
            try { photos()[m.id] = await cropPhoto(f); store(); }
            catch (e) { if (old) photos()[m.id] = old; else delete photos()[m.id]; error(e && e.name === 'QuotaExceededError' ? new Error('Not enough storage for this photo.') : e); return; }
            repaintOwn(); host.notice('Your photo is set');
        };
        var pb = el('div', null, 'hzp-cd-pb');
        pb.append(file, button(photos()[m.id] ? 'Change my photo' : 'Add my photo', function () { file.click(); }));
        if (photos()[m.id]) pb.append(button('Remove my photo', function () { delete photos()[m.id]; store(); repaintOwn(); }));
        var nm = field('My name', 'text', 'Display name'); nm.input.value = m.name || ''; nm.input.maxLength = 60; nm.input.dataset.hzpDraft = 'ownname';
        var save = button('Save name', async function () {
            var v = nm.input.value.trim(); if (!v) throw new Error('Type the name you want people to see.');
            var result = await api('profile', { name: v, avatar: m.avatar || '\u25CE', status: m.status || '' });
            config.me = result.me; store(); await sync(); repaintOwn(); host.notice('Name saved');
        });
        box.append(pb, el('small', 'Your photo shows next to your ID on this phone', 'hzp-muted'), nm.wrap, save); card.append(box);
    }
    function nameCard(person, own) {
        var card = el('article', null, 'hzp-name-card'), top = row(), avatar = face(person, 'big');
        var info = el('div', null, 'hzp-card-info');
        info.append(el('small', own ? 'YOUR DIGITAL NAME CARD' : 'HORIZON NAME CARD'), el('strong', person.name || 'Horizon member'), el('p', person.status || 'Available'));
        top.append(avatar, info); card.append(top);
        var id = person.horizonId || person.id;
        var copy = button(id + '  ⧉', function () { return copyID(id); }); copy.className = 'hzp-copy-id'; copy.setAttribute('aria-label', (own ? 'Copy my Horizon ID' : 'Copy Horizon ID ' + id));
        card.append(copy, el('small', own ? 'Tap your ID to copy · share it to connect' : 'Invitation to connect · accept to save this contact'));
        if (own && config.me) ownControls(card);
        return card;
    }
    /* V1.99.25 · People + Horizon ID live in the bottom strip of the Tools menu (#hzgDockL), with Add chat on the far right (#hzgDockR), all in the multicolour ring.
       The row above the chat box keeps only Options. horizon_toolgrid.js builds the strip after this file loads and calls HorizonPeople.dock() when it is ready;
       if the strip never appears, the old row (People, Horizon ID, Options) stays as it was, so nothing is lost. */
    function mountDock() {
        if (docked || !launchRow || !launchBtnRef) return;
        var dockL = document.getElementById('hzgDockL'), dockR = document.getElementById('hzgDockR');
        if (!dockL || !dockR || !dockL.append || !dockR.append) return;
        /* V1.99.113 · the right-hand + (Add chat) is gone: People already opens the same sheet. The dock keeps only People + Horizon ID. */
        /* V1.99.125 · the Horizon ID chip stays beside People (it was hidden in .124), and a quick "+ Add" sits on the right to invite an ID without opening the People sheet. */
        dockL.append(launchBtnRef); if (launchSub) { launchSub.style.display = ''; dockL.append(launchSub); }
        if (!quickBtn) {
            quickBtn = button('', function () { quickAdd(); });
            quickBtn.append(el('span', null, 'hzp-qplus'), el('span', 'Add', 'hzp-qlbl'));   /* V1.99.127: drawn plus icon instead of a typed "+" */
            quickBtn.className = 'hzp-launch-add hzp-quick-add'; quickBtn.id = 'peopleQuickAdd';
            quickBtn.setAttribute('aria-label', 'Add a Horizon ID to invite'); quickBtn.title = 'Add a Horizon ID to invite';
        }
        dockR.style.display = ''; dockR.append(quickBtn); docked = true;
        launchRow.hidden = !!(iBtn && iBtn.hidden);   // the row above the chat box only holds Options now
    }
    /* V1.99.125 · quick add: paste or type a Horizon ID (or number), tap Invite. Same invite call as Add contact in the People sheet. */
    var quickBtn = null, quickPop = false;
    function quickCss() {
        if (document.getElementById('hzq-style')) return;
        var st = el('style'); st.id = 'hzq-style';
        st.textContent = [
            '.hzp-quick-sheet{border:1px solid rgba(0,229,255,.5)!important;border-bottom:0!important;background:#0a1620!important;box-shadow:0 -10px 40px rgba(0,0,0,.6),0 0 0 1px rgba(122,44,255,.3);padding:14px 18px max(24px,env(safe-area-inset-bottom))!important}',
            '.hzq-head{display:flex;align-items:center;gap:10px;margin:0 0 6px}',
            '.hzq-head h3{flex:1;margin:0;font:700 17px/1.2 system-ui;letter-spacing:.02em}',
            '.hzq-x{flex:0 0 auto;width:36px;height:36px;padding:0!important;border-radius:50%!important;border:1px solid rgba(0,229,255,.45)!important;background:rgba(0,229,255,.08)!important;color:#00e5ff!important;font:600 18px/1 system-ui!important;display:grid;place-items:center}',
            '.hzp-quick-sheet input{box-sizing:border-box;width:100%;height:44px;padding:0 14px;border-radius:999px;border:1px solid rgba(0,229,255,.4);background:#07111a;color:#fff;font:15px system-ui;outline:none}',
            '.hzp-quick-sheet input:focus{border-color:#00e5ff;box-shadow:0 0 0 3px rgba(0,229,255,.18)}',
            '.hzq-go{display:block;width:100%;height:46px;margin:12px 0 4px;padding:0;border:0!important;border-radius:999px!important;background:linear-gradient(135deg,#ff005f,#af5fff)!important;color:#fff!important;font:700 15px system-ui!important}',
            '#hzgDock button.hzp-quick-add{display:inline-flex;align-items:center;gap:7px}',
            '.hzp-qplus{position:relative;flex:0 0 auto;width:16px;height:16px}',
            '.hzp-qplus::before,.hzp-qplus::after{content:"";position:absolute;background:var(--accent-cyan,#00e5ff);border-radius:2px}',
            '.hzp-qplus::before{left:0;right:0;top:7px;height:2px}',
            '.hzp-qplus::after{top:0;bottom:0;left:7px;width:2px}',
            '.hzp-qlbl{font:700 13px system-ui;color:var(--text-main,#fff)}'
        ].join('');
        document.head.append(st);
    }
    function quickAdd() {
        if (!config.token || !config.me) { tab = 'contacts'; open(); return; }   // not signed in yet: the People sheet has the sign-in form
        closeSheet(); var back = el('div', null, 'hzp-back'), sh = el('section', null, 'hzp-sheet hzp-quick-sheet'); sheetBack = back;
        sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Add a Horizon ID');
        quickCss();
        /* V1.99.127: Android Back closes this box (one history entry while it is open). */
        try { history.pushState({ hzpAdd: true }, ''); back._hzq = true; } catch (e) { /* history unavailable: the X still closes it */ }
        if (!quickPop) { quickPop = true; window.addEventListener('popstate', function () { if (sheetBack && sheetBack._hzq && !(history.state && history.state.hzpAdd)) closeSheet(true); }); }
        back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });
        back.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
        ['touchstart', 'touchmove', 'wheel'].forEach(function (ev) { sh.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
        var add = field('Horizon ID or phone number', 'text', 'HZ-\u2026 or +27821234567'); add.input.autocapitalize = 'characters'; add.input.spellcheck = false; add.input.autocomplete = 'off';
        var go = button('Invite', async function () {
            var target = add.input.value.trim(); if (!target) throw new Error('Enter a Horizon ID or international phone number.');
            var result = await api('invite', { target: target }); await sync();
            var req = result.request, other = req.from === me() ? req.to : req.from;
            closeSheet();
            if (req.status === 'accepted') { host.notice('Already in your contacts'); await goTo(other); return; }
            host.notice(req.from === me() ? 'Invitation sent with your Name Card' : 'They already invited you. Open People and Accept.');
        });
        go.className = 'hzq-go';
        var xBtn = button('\u2715', function () { closeSheet(); }); xBtn.className = 'hzq-x'; xBtn.setAttribute('aria-label', 'Close');
        var headRow = el('div', null, 'hzq-head'); headRow.append(el('h3', 'Add a Horizon ID'), xBtn);
        add.input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go.click(); } });
        sh.append(headRow, el('p', 'Enter their Horizon ID or number. Once they accept, they sit in your People list and you can chat straight away.', 'hzp-muted'), add.wrap, go);
        back.append(sh); document.body.append(back); add.input.focus();
    }
    function paintBadge() {
        if (launchSub) {
            var sub = config.token && config.me ? 'me|' + config.me.id + '|' + (config.me.name || '') + '|' + (config.me.avatar || '') + '|' + (photos()[config.me.id] ? photos()[config.me.id].length : 0) : 'out';
            if (launchSub._sig !== sub) {
                launchSub._sig = sub; launchSub.replaceChildren();
                if (config.token && config.me) { launchSub.append(face(config.me, 'tiny'), document.createTextNode('Horizon ID')); }
                else launchSub.textContent = 'Tap to sign in';
            }
        }
        var b = document.getElementById('peopleBtn'); if (!b) return;
        var count = config.token ? snapshot.requests.filter(function (r) { return r.to === me() && r.status === 'pending'; }).length + snapshot.invitations.length : 0;
        var badge = b.querySelector('.hzp-badge');
        if (!badge) { badge = el('span', null, 'hzp-badge'); badge.setAttribute('aria-hidden', 'true'); b.append(badge); }
        badge.hidden = !count; badge.textContent = count > 99 ? '99+' : String(count);
        b.setAttribute('aria-label', count ? 'People · ' + count + ' pending invites' : 'People · saved contacts and Horizon ID');
        b.title = count ? count + ' pending invites' : 'People and saved contacts';
    }

    function providers() { return host.providers ? host.providers() : []; }
    function setAI(c, enabled, ids) {
        delete c.people.guest;
        c.people.ai = !!enabled; c.people.aiMembers = ids.slice(); if (enabled) c.people.aiOwner = me(); else delete c.people.aiOwner;
        if (enabled && ids.length) c.group = { members: ids.map(function (id) { return { id: id }; }) };
        else delete c.group;
        host.save(); paintStrip();
    }
    var watching = false;
    async function permission() {
        if (native() && window.Capacitor) {
            var plugin = Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
            if (!plugin && Capacitor.registerPlugin) plugin = Capacitor.registerPlugin('LocalNotifications');
            if (plugin) { var result = await plugin.requestPermissions(); return result.display === 'granted'; }
        }
        if ('Notification' in window) return (await Notification.requestPermission()) === 'granted';
        return false;
    }
    var tab = 'contacts', CTRL = '[[hz:ask-ai]]', RULE = '[[hz:rule:', ruleBusy = {}, pendingAI = {}, pendingQ = {}, pendingForce = {}, bypass = {}, autoAt = 0, channelMade = false;
    function defaults() { config.defaults = config.defaults || {}; if (!config.defaults.timing) config.defaults.timing = 'all'; return config.defaults; }
    function roomOf(c) { return c && c.people && snapshot.rooms.find(function (r) { return r.id === c.people.room; }); }
    function isGroup(c) { var r = roomOf(c); return !!(r && r.group); }
    function autoOn(c) { var p = c.people.guest ? c.people.guest.prev : c.people; return p.auto != null ? !!p.auto : (isGroup(c) || !!p.ai); }   // V1.99.16: an AI you added answers on its own unless you switch Auto-reply off
    function timingOf(c) { return (c && c.people && c.people.timing) || defaults().timing; }   // V1.99.20: both rules are back: after each message, or after everyone has sent
    function iOwnAI(c) { var p = c && c.people; if (p && p.guest) p = p.guest.prev; return !!(p && p.ai && (!p.aiOwner || p.aiOwner === me())); }
    // Only the person who added the AI answers (with their own key). Everyone else just sees the shared reply.
    function shouldAnswer(c, senderId) {
        if (aiOff(c) || !iOwnAI(c) || c.people.joined === false || !autoOn(c) || c.people.paused) return false;
        if (timingOf(c) !== 'all') return true;
        var p = c.people, room = roomOf(c), need = room ? room.members : [];
        if (!need.length || need.indexOf(senderId) < 0) return false;
        p.round = (p.round || []).filter(function (id) { return need.indexOf(id) >= 0; });
        p.round = p.round || [];
        if (!p.round.length) p.roundAt = Date.now();
        if (p.round.indexOf(senderId) < 0) p.round.push(senderId);
        if (need.every(function (id) { return p.round.indexOf(id) >= 0; })) { p.round = []; p.roundAt = 0; host.save(); return true; }
        host.save(); return false;
    }
    // V1.99.11 · @tag = automatic. When someone tags a provider that is a member of MY AI in this chat, my phone answers on its own (no Ask AI, whatever
    // Auto-reply / Pause / timing say). The typer's phone gets 5 seconds to answer first; if that provider's reply has not shown up by then, mine goes out.
    function taggedMine(c, text) {
        if (!c || !c.people || aiOff(c) || !iOwnAI(c) || c.people.joined === false || !text || text === CTRL || text.indexOf(RULE) === 0) return [];
        var mine = c.people.aiMembers || []; return mentionIds(text, c).filter(function (id) { return mine.indexOf(id) >= 0; });
    }
    function answerTagged(c, m, ids) {
        setTimeout(function () {
            try {
                var names = ids.map(function (id) { return String(pname(id)).toLowerCase(); });
                var done = (c.messages || []).some(function (x) { var sp = String(x.sharedProvider || x.prov || '').toLowerCase(); return x.role === 'ai' && (x.ts || 0) >= (m.ts || 0) - 1000 && (ids.indexOf(sp) >= 0 || names.indexOf(sp) >= 0); });
                if (done || aiOff(c) || !iOwnAI(c) || c.people.joined === false) return;
                wantAI(c, awarePrompt(c, m.text, { asker: m.sender, forced: true, intro: introFor(c, ids) }), true, ids); paintStrip();
            } catch (e) { }
        }, 5000);
    }
    function force(id, on) { if (!id) return; if (on) bypass[id] = Date.now() + 600000; else delete bypass[id]; }
    function mentionIds(text, c) { var r = window.HorizonGroup && HorizonGroup.route ? HorizonGroup.route(text, c) : null; return r && r.mention ? r.targets.map(function (t) { return t.id; }) : []; }
    function lastText(c) { var m = c.messages.slice().reverse().find(function (x) { return x.role === 'user' || x.role === 'human'; }); return m && m.text; }
    var runningAI = {}, drainTimer = 0;
    function wantAI(c, text, forced, targets) {
        if (aiOff(c) || c.people.joined === false) return;
        var t = text != null ? text : lastText(c); if (!t) return;
        var job = {text:t, forced:!!forced, targets:targets ? targets.slice() : null};
        if (pendingAI[c.id]) (pendingQ[c.id] = pendingQ[c.id] || []).push(job);
        else pendingAI[c.id] = job;
        drainAI();
    }
    function scheduleDrain() {
        if (drainTimer) return;
        drainTimer = setTimeout(function () { drainTimer = 0; drainAI(); }, 80);
    }
    /* V1.98.1 · background replies. When the AI is yours and Auto-reply is on, Horizon keeps syncing while the app is hidden (Android keeps the page alive
       through the existing "Horizon is running" service) and answers on its own, in whichever chat the message arrived. */
    var bgOn = false, bgTried = 0;
    function bgWanted() {
        if (config.bgReply === false || !config.token || !host) return false;
        return host.chats().some(function (c) { return c.people && c.people.account === me() && iOwnAI(c) && c.people.joined !== false && autoOn(c) && !aiOff(c); });
    }
    function syncBg() {
        var want = bgWanted(); if (want === bgOn) return;
        var C = window.Capacitor, plug = C && C.Plugins && C.Plugins.HorizonPerms; if (!plug || !plug.bgStart) return;
        if (Date.now() - bgTried < 30000) return; bgTried = Date.now();
        bgOn = want; Promise.resolve(want ? plug.bgStart() : plug.bgStop()).catch(function () { bgOn = !want; });
    }
    function drainAI() {
        var c = host && host.current();
        if ((!c || !pendingAI[c.id]) && document.hidden && bgWanted() && !host.busy() && !gate) {
            var chats = host.chats(), id = Object.keys(pendingAI).find(function (k) { return chats.some(function (x) { return x.id === k && x.people && active(x); }); });
            if (id) { host.open(id); c = host.current(); }
        }
        if (!c || !pendingAI[c.id] || host.busy() || gate || runningAI[c.id] || !active(c)) {
            if (Object.keys(pendingAI).length) scheduleDrain(); return;
        }
        if (aiOff(c) || c.people.joined === false) { delete pendingAI[c.id]; delete pendingQ[c.id]; delete pendingForce[c.id]; return; }
        var job = pendingAI[c.id]; delete pendingAI[c.id];
        if (pendingQ[c.id] && pendingQ[c.id].length) { pendingAI[c.id] = pendingQ[c.id].shift(); if (!pendingQ[c.id].length) delete pendingQ[c.id]; }
        runningAI[c.id] = true;
        // A transient guest changes transport eligibility only during this awaited turn.
        // Auto rules always read the permanent membership, even during a guest response.
        var guests = job.targets && job.targets.filter(function (id) { return !c.people.ai || (c.people.aiMembers || []).indexOf(id) < 0; });
        if (guests && guests.length) { guestOn(c, job.targets, true); host.notice('Referee: ' + guests.map(pname).join(' & ') + ' answers this once, then steps out.'); }
        if (job.forced) force(c.id, true);
        Promise.resolve().then(function () { return host.ai(c, job.text); }).catch(error).finally(function () {
            force(c.id, false); if (guests && guests.length) guestOff(c);
            delete runningAI[c.id]; drainAI(); paintStrip();
        });
    }
    async function askAI() {
        var c = host.current(); if (!c || !c.people || !active(c)) throw new Error('Open a people chat first.');
        if (aiOff(c)) throw new Error('AI replies are off in this chat. Turn them on in Options.');
        if (iOwnAI(c)) {
            if (host.busy()) throw new Error('Wait for the current response.');
            var t = lastText(c); if (!t) throw new Error('Send a message first.');
            cancelWait(false); force(c.id, true); c.people.round = []; if (panel && !panel.hidden) close();
            return host.ai(c, awarePrompt(c, t, { asker: me(), forced: true, intro: introFor(c, c.people.aiMembers || []) }));
        }
        if (c.people.aiBy && c.people.joined !== false) {
            await api('message', { room: c.people.room, text: CTRL, clientId: crypto.randomUUID() });
            host.notice('Asked ' + name(c.people.aiBy) + '\u2019s AI to answer. It replies when their phone is open.'); return;
        }
        throw new Error('No AI in this chat yet. Open People and tick an AI.');
    }
    function chosenAI() {
        var ready = providers().filter(function (p) { return p.ready; }).map(function (p) { return p.id; });
        var ids = selections().ai.filter(function (id) { return ready.indexOf(id) >= 0; });
        var skipped = selections().ai.length - ids.length;
        if (skipped > 0) host.notice(skipped + ' ticked AI skipped: no key set up yet.', 'error');
        return ids;
    }
    function tick(value, run) {
        var i = el('input'); i.type = 'checkbox'; i.checked = value;
        i.onchange = function () { var want = i.checked; Promise.resolve().then(function () { return run(want); }).then(function (ok) { if (ok === false) i.checked = !want; }).catch(function (e) { i.checked = !want; error(e); }); };
        return i;
    }
    /* ===== V1.98.0 · chat-first contacts =====
       Top pill row = saved contacts. Tap a contact = straight into the chat (no AI, no setup).
       The "i" button on the chat bar holds everything per contact: ping, photo, AI, alerts, block. */
    var pillRow, pillSig = '', sheetBack = null, autoJoin = {}, launchSub = null, iBtn = null, addBtn = null, docked = false, launchRow = null, launchBtnRef = null;
    function listFor(prefix) { var k = prefix + (me() || 'local'); return config[k] || (config[k] = []); }
    function hidden() { return listFor('hidden_'); }
    function muted() { return listFor('muted_'); }
    function photos() { return config.photos || (config.photos = {}); }
    function toggleIn(list, id, on) { var i = list.indexOf(id); if (on && i < 0) list.push(id); if (!on && i >= 0) list.splice(i, 1); if (on) selections().off = false; store(); }
    function contactById(id) { return snapshot.contacts.find(function (p) { return p.id === id; }); }
    function labelOf(p) { return (p && (p.name || p.number || p.id)) || 'Contact'; }
    function initials(t) { var w = String(t || '').trim().split(/\s+/).filter(Boolean); return w.length ? (Array.from(w[0])[0] + (w[1] ? Array.from(w[1])[0] : '')).toUpperCase() : '\u25CE'; }
    function pendingCount() { return config.token ? snapshot.requests.filter(function (r) { return r.to === me() && r.status === 'pending'; }).length + snapshot.invitations.length : 0; }
    function hidePanel() { if (panel) panel.hidden = true; }
    function face(p, cls) {
        var f = el('span', null, 'hzp-face' + (cls ? ' ' + cls : '')), url = p && p.id ? photos()[p.id] : '';
        if (url) { var im = el('img'); im.alt = ''; im.src = url; im.draggable = false; f.append(im); }
        else f.append(document.createTextNode(p && p.avatar && p.avatar !== '\u25CE' ? p.avatar : initials(p && labelOf(p))));
        return f;
    }
    /* a photo is centre-cropped square and stored on this phone only; the SVG clip-path (#hzp-shape) gives it the app's shape */
    function cropPhoto(file) {
        return new Promise(function (resolve, reject) {
            if (!/^image\//.test(file.type || '')) return reject(new Error('Pick an image file.'));
            if (file.size > 25 * 1024 * 1024) return reject(new Error('That image is too large. Pick one under 25 MB.'));
            var url = URL.createObjectURL(file), img = new Image();
            img.onload = function () {
                try {
                    var S = 192, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(w, h), cv = document.createElement('canvas');
                    if (!s) throw new Error('Could not read that image.');
                    cv.width = cv.height = S; cv.getContext('2d').drawImage(img, (w - s) / 2, (h - s) / 2, s, s, 0, 0, S, S);
                    var out = cv.toDataURL('image/webp', 0.82); if (out.indexOf('data:image/webp') !== 0) out = cv.toDataURL('image/jpeg', 0.82);
                    resolve(out);
                } catch (e) { reject(e); } finally { URL.revokeObjectURL(url); }
            };
            img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('Could not read that image.')); };
            img.src = url;
        });
    }
    function roomOther(c) {
        var r = roomOf(c); if (!r || r.group) return null;
        var id = (r.members || []).concat(r.pending || []).find(function (x) { return x !== me(); });
        return id ? (contactById(id) || { id: id, name: name(id) }) : null;
    }
    function chatWith(id) {
        return host.chats().find(function (c) { var r = c.people && c.people.account === me() && roomOf(c); return !!(r && !r.group && r.members.indexOf(id) >= 0 && c.people.joined !== false); }) || null;
    }
    function incomingTs(c) { return c.messages.reduce(function (n, m) { return m.role === 'human' && m.ts > n ? m.ts : n; }, 0); }
    function seenMap() { return config.seen || (config.seen = {}); }
    function markSeen(c) { var t = incomingTs(c), s = seenMap(); if (t && s[c.id] !== t) { s[c.id] = t; store(); } }
    function unread(c) { return !!c && incomingTs(c) > (seenMap()[c.id] || 0); }
    function startChat(p, displayName) {
        return api('room', { members: [p.id], title: displayName, approval: true }).then(function (v) { return sync().then(function () { return v; }); }).then(function (v) {
            var c = chatFor(v.room); hidePanel(); host.open(c.id); paintStrip(); return c;
        });
    }
    /* contact -> chat. An existing chat opens instantly with no network wait. */
    async function goTo(id) {
        var c = chatWith(id); if (c) { hidePanel(); host.open(c.id); paintStrip(); return c; }
        var p = contactById(id) || { id: id, name: name(id) };
        return startChat(p, labelOf(p));
    }
    function openPlus() { tab = 'contacts'; open(); }
    /* ---------- group pill: who is in, tap a name to keep or remove ---------- */
    var gFocus = null, gPop = null, gTop = 60, gBottom = 0, gUp = false;
    function groupMembers() {
        var out = [{ id: me(), label: 'You', own: true }];
        pickedContacts().forEach(function (id) { out.push({ id: id, label: labelOf(contactById(id)), kind: 'c' }); });
        pickedAI().forEach(function (id) { var pr = providers().find(function (x) { return x.id === id; }); out.push({ id: id, label: pr ? pr.name : id, kind: 'a' }); });
        return out;
    }
    function closeGroupPop() { if (gPop) { gPop.remove(); gPop = null; } gFocus = null; }
    function groupPill(newMsgs) {
        var m = groupMembers(), b = button('', function () { if (gPop) { closeGroupPop(); return; } openGroupPop(b); });
        b.className = 'hzp-chip hzp-gpill'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', m.length + ' in the group, open contacts');
        var dots = el('span', null, 'hzp-gdots'); m.slice(0, 3).forEach(function (x) { dots.append(el('i', initials(x.label.replace('\u2728 ', '')))); });
        b.append(dots, el('span', m.length + ' in group', 'nm'), el('span', '\u25BE', 'hzp-caret'));
        if (newMsgs) b.append(el('i', null, 'hzp-unread')); return b;
    }
    /* Dropdown under the top pill: the group (tap a name to keep or remove) and all contacts (tick = in group, tap name = chat). */
    function openGroupPop(anchor) {
        if (gPop) gPop.remove();
        if (anchor) { var rc = anchor.getBoundingClientRect(); gTop = Math.round(rc.bottom + 6); gBottom = Math.round(window.innerHeight - rc.top + 6); gUp = rc.top > window.innerHeight / 2; }
        var pop = el('div', null, 'hzp-gpop'); gPop = pop;
        pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Contacts and group');
        if (gUp) { pop.style.top = 'auto'; pop.style.bottom = gBottom + 'px'; pop.style.maxHeight = Math.max(180, Math.min(window.innerHeight * 0.72, window.innerHeight - gBottom - 12)) + 'px'; } else pop.style.top = gTop + 'px';
        function head(t, sub) { var h = el('div', null, 'hzp-gh'); h.append(el('span', t)); if (sub) h.append(el('span', sub, 'hzp-gh-s')); pop.append(h); }
        function rowOf(cls, lead, nm, sub) { var r = el('div', null, cls), info = el('span', null, 'hzp-gm-info'); info.append(el('span', nm, 'hzp-nm'), el('span', sub, 'hzp-sb')); r.append(lead, info); return r; }
        function refresh() { repaintGroup(); openGroupPop(null); if (panel && !panel.hidden) renderSections(); }
        /* the group: who is in it. The red x takes someone out of the group (the contact stays saved, tick them again to add back). */
        var members = groupMembers(); head('In this group · ' + members.length, 'tap × to take out');
        members.forEach(function (x) {
            var p = x.kind === 'c' ? contactById(x.id) : null, pr = x.kind === 'a' ? providers().find(function (q) { return q.id === x.id; }) : null, r;
            if (x.own) r = rowOf('hzp-gm', face(config.me || { id: x.id, name: 'You' }), 'You', (config.me && config.me.status) || 'Available');
            else if (pr || x.kind === 'a') r = rowOf('hzp-gm', aiIcon(pr || { id: x.id, name: x.label }), x.label, pr && !pr.ready ? 'needs a key in Settings' : 'AI');
            else r = rowOf('hzp-gm', face(p || { id: x.id, name: x.label }), x.label, (p && p.status) || 'Available');
            if (x.own) r.append(el('span', 'you', 'hzp-gm-you'));
            else {
                var rm = button('×', function () { toggleIn(x.kind === 'a' ? selections().ai : selections().contacts, x.id, false); refresh(); });
                rm.className = 'hzp-gm-x'; rm.setAttribute('aria-label', 'Remove ' + x.label + ' from the group'); r.append(rm);
            }
            pop.append(r);
        });
        if (members.length === 1) pop.append(el('p', 'Just you. Tick contacts below, or pick AI in Synced contacts.', 'hzp-muted'));
        /* chats: tap a row to open it, tick to add to the group */
        head('Contacts', 'tick = add to group');
        var cur = host.current();
        var aiRow = el('div', null, 'hzp-gc'), aiBtn = button('', function () {
            closeGroupPop(); hidePanel(); if (cur && !cur.people) return;
            var list = host.chats().filter(function (x) { return !x.people; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
            host.open((list[0] || host.make('AI Normal Chat Mode')).id); paintStrip();
        }), aiInfo = el('span', null, 'hzp-gm-info'); aiInfo.append(el('span', 'AI chat', 'hzp-nm'), el('span', 'Normal chat, no contacts', 'hzp-sb'));
        aiBtn.className = 'hzp-gc-main'; aiBtn.setAttribute('aria-label', 'Normal AI chat'); aiBtn.append(aiIcon({ id: '__aichat', name: 'AI chat' }), aiInfo); aiRow.append(aiBtn); pop.append(aiRow);
        var shown = config.token ? snapshot.contacts.filter(function (p) { return hidden().indexOf(p.id) < 0; }) : [];
        shown.forEach(function (p) {
            var r = el('div', null, 'hzp-gc'), c = chatWith(p.id), info = el('span', null, 'hzp-gm-info');
            var box = tick(selections().contacts.indexOf(p.id) >= 0, function (v) { toggleIn(selections().contacts, p.id, v); refresh(); return true; });
            box.setAttribute('aria-label', 'Add ' + labelOf(p) + ' to the group');
            info.append(el('span', labelOf(p), 'hzp-nm'), el('span', p.status || 'Available', 'hzp-sb'));
            var n = button('', function () { closeGroupPop(); return goTo(p.id); }); n.className = 'hzp-gc-main'; n.dataset.hzpContact = p.id; n.setAttribute('aria-label', 'Chat with ' + labelOf(p) + (unread(c) ? ', new messages' : ''));
            n.append(face(p), info); if (unread(c)) n.append(el('i', null, 'hzp-unread hzp-unread-r')); r.append(n, box); pop.append(r);
        });
        if (!shown.length) pop.append(el('p', config.token ? 'No contacts yet. Tap + to add one.' : 'Sign in with +', 'hzp-muted'));
        var foot = button('Synced contacts', function () { closeGroupPop(); tab = 'sync'; open(); }); foot.className = 'hzp-gfoot'; pop.append(foot);
        /* V1.99.32: Leave group clears everyone and hides the group pill, so it never hangs there. Tick a contact (or tap +) and it comes back. */
        var lv = button('Leave group', function () { var sel = selections(); sel.contacts = []; sel.ai = []; sel.off = true; store(); closeGroupPop(); repaintGroup(); if (panel && !panel.hidden) renderSections(); if (host && host.notice) host.notice('Left the group. Tick a contact or tap + to start one again.'); });
        lv.className = 'hzp-gfoot hzp-gleave'; lv.setAttribute('aria-label', 'Leave the group and hide the group bar'); pop.append(lv);
        document.body.append(pop);
    }
    document.addEventListener('pointerdown', function (e) { if (gPop && !gPop.contains(e.target) && !(e.target.closest && e.target.closest('.hzp-gpill'))) closeGroupPop(); }, true);
    function paintPills() {
        if (!pillRow || !host) return;
        var cur = host.current(), other = cur && cur.people ? roomOther(cur) : null;
        var shown = config.token ? snapshot.contacts.filter(function (p) { return hidden().indexOf(p.id) < 0; }) : [];
        var sig = JSON.stringify([!!config.token, cur && cur.id, !!(cur && cur.people), other && other.id, shown.map(function (p) { var ph = photos()[p.id]; return [p.id, p.name, p.avatar, ph ? ph.length : 0, unread(chatWith(p.id))]; }), pendingCount(), pickedContacts(), pickedAI(), gFocus, !!selections().off]);
        if (sig === pillSig) return; pillSig = sig;
        pillRow.replaceChildren();
        if (config.token && !selections().off) pillRow.append(groupPill(shown.some(function (p) { var c = chatWith(p.id); return unread(c) && !(cur && c && cur.id === c.id); })));
        /* V1.99.113 · no + chip at the right of the pill row (redundant with People); an empty row takes no space */
        pillRow.style.display = pillRow.childNodes.length ? '' : 'none'; paintBadge();
    }
    /* ---------- chat bar + "i" info sheet ---------- */
    function line(title, sub, control) { var l = el('label', null, 'hzp-line'), t = el('span'); t.append(el('strong', title)); if (sub) t.append(el('small', sub)); l.append(t, control); return l; }
    /* ---------- V1.99.3 · AI provider icons: an original glyph on a colour tile, icon left of the name, tick on the right.
       Not the official logos. To use an official one, set window.HZP_AI_ICONS = { providerId: '<svg viewBox="0 0 24 24">…</svg>' } before People loads. ---------- */
    var AI_ICONS = [
        /* V1.99.14 · every provider gets its own SVG mark (no more plain letters) */
        [/unorouter|uno-?router/, '#ea580c', '#b45309', '<path d="M8.5 9l3.5-3v12M8.5 18h7"/>'],
        [/routeway/, '#0ea5a4', '#0b6e8a', '<circle cx="5.5" cy="6" r="2"/><circle cx="18.5" cy="18" r="2"/><path d="M7.5 6H14a3.5 3.5 0 0 1 0 7h-4a3.5 3.5 0 0 0 0 5h6.5"/>'],
        [/requesty/, '#c026d3', '#6d28d9', '<path d="M4 8h13l-3-3M20 16H7l3 3"/>'],
        [/kilo/, '#f59e0b', '#d97706', '<path d="M7 4v16M17 4L7.5 12.5 17 20"/>'],
        [/ovh/, '#123f6d', '#0a2a4a', '<path d="M7.5 18.5a4.5 4.5 0 0 1-.6-8.96 5.5 5.5 0 0 1 10.6 1.46 3.75 3.75 0 0 1-.5 7.5z"/>'],
        [/chatat|ch\.at/, '#16a34a', '#0f766e', '<path d="M4 5h16v11h-9l-4.5 4v-4H4z"/><path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01"/>'],
        [/blockrun|block run/, '#7c3aed', '#4338ca', '<rect x="8.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13" width="7" height="7" rx="1.5"/><rect x="13.5" y="13" width="7" height="7" rx="1.5"/>'],
        [/\bzai\b|z\.ai/, '#2563eb', '#1e3a8a', '<path d="M5 5h14L5 19h14"/>'],
        [/aionlabs|aion/, '#06b6d4', '#0e7490', '<path d="M12 3L4 20M12 3l8 17M7.5 14h9"/>'],
        [/iteracompute|itera compute|itera/, '#fb923c', '#c2410c', '<path d="M12 4v4M12 16v4M4 12h4M16 12h4"/><circle cx="12" cy="12" r="3.5"/>'],
        [/agnes/, '#f472b6', '#9d174d', '<path d="M6 19 12 5l6 14M8.8 14.5h6.4"/>'],
        [/gonka/, '#d9f20a', '#4d5a00', '<path d="M16.5 8A5.5 5.5 0 1 0 17 14.5V12h-4.5"/>'],
        [/llm7/, '#ef4444', '#b91c1c', '<path d="M5 5h14L10 20"/>'],
        [/free\.ai|freeai/, '#22c55e', '#15803d', '<path d="M7 6h10M7 6v12M7 12h7"/>'],
        [/__aichat/, '#7a2cff', '#00b8d4', '<path d="M4 5h11v8H9l-3 3v-3H4z"/><path d="M18 9h2v8h-2v3l-3-3h-5v-2"/>'],
        [/cloudflare|workers/, '#f6821f', '#f9a03f', '<path d="M7 17.5a3.5 3.5 0 0 1-.4-7A5.5 5.5 0 0 1 17 9.2a4 4 0 0 1 .5 8.3z"/>'],
        [/nvidia/, '#76b900', '#3f6b00', '<path d="M2.5 12S6 6 12 6s9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="2.8"/>'],
        [/github/, '#475569', '#0f172a', '<circle cx="7" cy="6" r="2"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="9" r="2"/><path d="M7 8v8M17 11c0 3-4 3-10 5"/>'],
        [/sambanova/, '#EE7624', '#EE7624', '<path d="M17 7c-1-2-3-3-5-3-3 0-5 1.7-5 4 0 5.5 10 2.5 10 8 0 2.3-2 4-5 4-2.2 0-4-1-5-3"/>'],
        [/gemini|google/, '#4f8bff', '#a259ff', '<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>'],
        [/groq/, '#F55036', '#F55036', '<path d="M13.5 3L5.5 13.5h5.8L10 21l8.5-11h-5.7z" fill="#fff" stroke="none"/>'],
        [/cohere/, '#39594D', '#39594D', '<circle cx="6" cy="17" r="2.4"/><circle cx="18" cy="17" r="2.4"/><circle cx="12" cy="6.5" r="2.4"/><path d="M7.7 15.1l3-6.6M16.3 15.1l-3-6.6M8.6 17h6.8"/>'],
        [/mistral/, '#ff9a1f', '#ff5a1f', '<path d="M3.5 8h10.5a3 3 0 1 0-3-3M3.5 12.5h14.5a3 3 0 1 1-3 3M3.5 17h6.5"/>'],
        [/openrouter|open router/, '#6366f1', '#38bdf8', '<circle cx="5" cy="12" r="2"/><path d="M7 12h3.5l4-5.5h3M10.5 12l4 5.5h3"/><path d="M16 4l2.8 2.5L16 9M16 15l2.8 2.5L16 20"/>'],
        [/pollinat/, '#111111', '#111111', ['0', '72', '144', '216', '288'].map(function (r) { return '<ellipse cx="12" cy="6.6" rx="2.5" ry="3.6" transform="rotate(' + r + ' 12 12)"/>'; }).join('') + '<circle cx="12" cy="12" r="1.8" fill="#fff" stroke="none"/>'],
        [/horde/, '#10b981', '#0ea5e9', '<circle cx="12" cy="8" r="2.6"/><circle cx="5.5" cy="10" r="2"/><circle cx="18.5" cy="10" r="2"/><path d="M7 19c0-3 2.2-5 5-5s5 2 5 5M2.5 17c0-2 1.3-3.4 3-3.4M21.5 17c0-2-1.3-3.4-3-3.4"/>'],
        [/openai|chatgpt|gpt/, '#10a37f', '#0b6b55', '<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><circle cx="12" cy="12" r="2.6"/>'],
        [/anthropic|claude/, '#d97757', '#b45309', '<path d="M5 5h14v10h-8l-4 4v-4H5z"/>'],
        [/deepseek/, '#3b82f6', '#1d4ed8', '<circle cx="10.5" cy="10.5" r="5.5"/><path d="M15 15l5 5"/>'],
        [/hugging/, '#fbbf24', '#f59e0b', '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.8 2.2 2.6 3.5 2.6s2.5-.8 3.5-2.6"/><circle cx="9" cy="10" r=".9" fill="#fff" stroke="none"/><circle cx="15" cy="10" r=".9" fill="#fff" stroke="none"/>'],
        [/together/, '#0F6FFF', '#0F6FFF', '<rect x="4" y="4" width="10" height="10" rx="2"/><rect x="10" y="10" width="10" height="10" rx="2"/>'],
        [/perplex/, '#14b8a6', '#0f766e', '<circle cx="12" cy="12" r="8.5"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>'],
        [/grok|xai/, '#64748b', '#1e293b', '<path d="M5.5 5.5l13 13M18.5 5.5l-13 13"/>'],
        [/cerebras/, '#F15A29', '#F15A29', '<rect x="6.5" y="6.5" width="11" height="11" rx="2"/><path d="M9.5 3.5v3M14.5 3.5v3M9.5 17.5v3M14.5 17.5v3M3.5 9.5h3M3.5 14.5h3M17.5 9.5h3M17.5 14.5h3"/>']
    ];

    /* ---------- V1.99.10 · official provider logos. Real vector marks (Simple Icons + Remix Icon, 24x24 paths) on each provider's own brand colour.
       Order matters: first match wins. Providers with no official vector available here (Groq, Cohere, Together, Cerebras, Pollinations, AI Horde, SambaNova)
       keep the drawn glyph on their brand colour. Override any of them with window.HZP_AI_ICONS = { providerId: '<svg viewBox="0 0 24 24">…</svg>' }. ---------- */
    var AI_BRAND = [
        [/cloudflare|workers/, '#F38020', '#ffffff', "m8.213.063 8.879 12.136-8.67 11.739h2.476l8.665-11.735-8.89-12.14Zm4.728 0 9.02 11.992-9.018 11.883h2.496L24 12.656v-1.199L15.434.063ZM7.178 2.02.01 11.398l-.01 1.2 7.203 9.644 1.238-1.676-6.396-8.556 6.361-8.313Z"],
        [/nvidia/, '#000000', '#76B900', "M8.948 8.798v-1.43a6.7 6.7 0 0 1 .424-.018c3.922-.124 6.493 3.374 6.493 3.374s-2.774 3.851-5.75 3.851c-.398 0-.787-.062-1.158-.185v-4.346c1.528.185 1.837.857 2.747 2.385l2.04-1.714s-1.492-1.952-4-1.952a6.016 6.016 0 0 0-.796.035m0-4.735v2.138l.424-.027c5.45-.185 9.01 4.47 9.01 4.47s-4.08 4.964-8.33 4.964c-.37 0-.733-.035-1.095-.097v1.325c.3.035.61.062.91.062 3.957 0 6.82-2.023 9.593-4.408.459.371 2.34 1.263 2.73 1.652-2.633 2.208-8.772 3.984-12.253 3.984-.335 0-.653-.018-.971-.053v1.864H24V4.063zm0 10.326v1.131c-3.657-.654-4.673-4.46-4.673-4.46s1.758-1.944 4.673-2.262v1.237H8.94c-1.528-.186-2.73 1.245-2.73 1.245s.68 2.412 2.739 3.11M2.456 10.9s2.164-3.197 6.5-3.533V6.201C4.153 6.59 0 10.653 0 10.653s2.35 6.802 8.948 7.42v-1.237c-4.84-.6-6.492-5.936-6.492-5.936z"],
        [/github/, '#0d1117', '#ffffff', "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"],
        [/gemini|google/, '#ffffff', 'gemini', "M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81"],
        [/mistral/, '#FA520F', '#ffffff', "M17.143 3.429v3.428h-3.429v3.429h-3.428V6.857H6.857V3.43H3.43v13.714H0v3.428h10.286v-3.428H6.857v-3.429h3.429v3.429h3.429v-3.429h3.428v3.429h-3.428v3.428H24v-3.428h-3.43V3.429z"],
        [/openrouter|open router/, '#6467F2', '#ffffff', "M16.778 1.844v1.919q-.569-.026-1.138-.032-.708-.008-1.415.037c-1.93.126-4.023.728-6.149 2.237-2.911 2.066-2.731 1.95-4.14 2.75-.396.223-1.342.574-2.185.798-.841.225-1.753.333-1.751.333v4.229s.768.108 1.61.333c.842.224 1.789.575 2.185.799 1.41.798 1.228.683 4.14 2.75 2.126 1.509 4.22 2.11 6.148 2.236.88.058 1.716.041 2.555.005v1.918l7.222-4.168-7.222-4.17v2.176c-.86.038-1.611.065-2.278.021-1.364-.09-2.417-.357-3.979-1.465-2.244-1.593-2.866-2.027-3.68-2.508.889-.518 1.449-.906 3.822-2.59 1.56-1.109 2.614-1.377 3.978-1.466.667-.044 1.418-.017 2.278.02v2.176L24 6.014Z"],
        [/openai|chatgpt|gpt/, '#10A37F', '#ffffff', "M20.5624 10.1875C20.8124 9.5 20.8749 8.8125 20.8124 8.125C20.7499 7.4375 20.4999 6.75 20.1874 6.125C19.6249 5.1875 18.8124 4.4375 17.8749 4C16.8749 3.5625 15.8124 3.4375 14.7499 3.6875C14.2499 3.1875 13.6874 2.75 13.0624 2.4375C12.4374 2.125 11.6874 2 10.9999 2C9.9374 2 8.8749 2.3125 7.9999 2.9375C7.1249 3.5625 6.4999 4.4375 6.1874 5.4375C5.4374 5.625 4.8124 5.9375 4.1874 6.3125C3.6249 6.75 3.1874 7.3125 2.8124 7.875C2.24991 8.8125 2.06241 9.875 2.18741 10.9375C2.31241 12 2.7499 13 3.4374 13.8125C3.1874 14.5 3.1249 15.1875 3.1874 15.875C3.2499 16.5625 3.4999 17.25 3.8124 17.875C4.3749 18.8125 5.1874 19.5625 6.1249 20C7.1249 20.4375 8.1874 20.5625 9.2499 20.3125C9.7499 20.8125 10.3124 21.25 10.9374 21.5625C11.5624 21.875 12.3124 22 12.9999 22C14.0624 22 15.1249 21.6875 15.9999 21.0625C16.8749 20.4375 17.4999 19.5625 17.8124 18.5625C18.4999 18.4375 19.1874 18.125 19.7499 17.6875C20.3124 17.25 20.8124 16.75 21.1249 16.125C21.6874 15.1875 21.8749 14.125 21.7499 13.0625C21.6249 12 21.2499 11 20.5624 10.1875ZM13.0624 20.6875C12.0624 20.6875 11.3124 20.375 10.6249 19.8125C10.6249 19.8125 10.6874 19.75 10.7499 19.75L14.7499 17.4375C14.8749 17.375 14.9374 17.3125 14.9999 17.1875C15.0624 17.0625 15.0624 17 15.0624 16.875V11.25L16.7499 12.25V16.875C16.8124 19.0625 15.0624 20.6875 13.0624 20.6875ZM4.9999 17.25C4.5624 16.5 4.3749 15.625 4.5624 14.75C4.5624 14.75 4.6249 14.8125 4.6874 14.8125L8.6874 17.125C8.8124 17.1875 8.8749 17.1875 8.9999 17.1875C9.1249 17.1875 9.2499 17.1875 9.3124 17.125L14.1874 14.3125V16.25L10.1249 18.625C9.2499 19.125 8.2499 19.25 7.3124 19C6.3124 18.75 5.4999 18.125 4.9999 17.25ZM3.9374 8.5625C4.3749 7.8125 5.0624 7.25 5.8749 6.9375V7.0625V11.6875C5.8749 11.8125 5.8749 11.9375 5.9374 12C5.9999 12.125 6.0624 12.1875 6.1874 12.25L11.0624 15.0625L9.3749 16.0625L5.3749 13.75C4.4999 13.25 3.8749 12.4375 3.6249 11.5C3.3749 10.5625 3.4374 9.4375 3.9374 8.5625ZM17.7499 11.75L12.8749 8.9375L14.5624 7.9375L18.5624 10.25C19.1874 10.625 19.6874 11.125 19.9999 11.75C20.3124 12.375 20.4999 13.0625 20.4374 13.8125C20.3749 14.5 20.1249 15.1875 19.6874 15.75C19.2499 16.3125 18.6874 16.75 17.9999 17V12.25C17.9999 12.125 17.9999 12 17.9374 11.9375C17.9374 11.9375 17.8749 11.8125 17.7499 11.75ZM19.4374 9.25C19.4374 9.25 19.3749 9.1875 19.3124 9.1875L15.3124 6.875C15.1874 6.8125 15.1249 6.8125 14.9999 6.8125C14.8749 6.8125 14.7499 6.8125 14.6874 6.875L9.8124 9.6875V7.75L13.8749 5.375C14.4999 5 15.1874 4.875 15.9374 4.875C16.6249 4.875 17.3124 5.125 17.9374 5.5625C18.4999 6 18.9999 6.5625 19.2499 7.1875C19.4999 7.8125 19.5624 8.5625 19.4374 9.25ZM8.9374 12.75L7.2499 11.75V7.0625C7.2499 6.375 7.4374 5.625 7.8124 5.0625C8.1874 4.4375 8.7499 4 9.3749 3.6875C9.9999 3.375 10.7499 3.25 11.4374 3.375C12.1249 3.4375 12.8124 3.75 13.3749 4.1875C13.3749 4.1875 13.3124 4.25 13.2499 4.25L9.2499 6.5625C9.1249 6.625 9.0624 6.6875 8.9999 6.8125C8.9374 6.9375 8.9374 7 8.9374 7.125V12.75ZM9.8124 10.75L11.9999 9.5L14.1874 10.75V13.25L11.9999 14.5L9.8124 13.25V10.75Z"],
        [/anthropic|claude/, '#D97757', '#ffffff', "m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z"],
        [/deepseek/, '#4D6BFE', '#ffffff', "M23.748 4.651c-.254-.124-.364.113-.512.233-.051.04-.094.09-.137.137-.372.397-.806.657-1.373.626-.829-.046-1.537.214-2.163.848-.133-.782-.575-1.248-1.247-1.548-.352-.155-.708-.311-.955-.65-.172-.24-.219-.509-.305-.774-.055-.16-.11-.323-.293-.35-.2-.031-.278.136-.356.276-.313.572-.434 1.202-.422 1.84.027 1.436.633 2.58 1.838 3.393.137.094.172.187.129.323-.082.28-.18.553-.266.833-.055.179-.137.218-.328.14a5.5 5.5 0 0 1-1.737-1.179c-.857-.828-1.631-1.743-2.597-2.46a12 12 0 0 0-.689-.47c-.985-.957.13-1.743.387-1.836.27-.098.094-.433-.778-.428-.872.003-1.67.295-2.687.685a3 3 0 0 1-.465.136 9.6 9.6 0 0 0-2.883-.101c-1.885.21-3.39 1.1-4.497 2.622C.082 8.776-.231 10.854.152 13.02c.403 2.284 1.568 4.175 3.36 5.653 1.857 1.533 3.997 2.284 6.438 2.14 1.482-.085 3.132-.284 4.994-1.86.47.234.962.328 1.78.398.629.058 1.235-.031 1.705-.129.735-.155.684-.836.418-.961-2.155-1.004-1.682-.595-2.112-.926 1.095-1.295 2.768-3.598 3.284-6.733.05-.346.115-.834.108-1.114-.004-.171.035-.238.23-.257a4.2 4.2 0 0 0 1.545-.475c1.397-.763 1.96-2.016 2.093-3.517.02-.23-.004-.467-.247-.588M11.58 18.168c-2.088-1.642-3.101-2.183-3.52-2.16-.39.024-.32.472-.234.763.09.288.207.487.371.74.114.167.192.416-.113.603-.673.416-1.842-.14-1.897-.168-1.361-.801-2.5-1.86-3.301-3.306-.775-1.393-1.225-2.888-1.299-4.482-.02-.385.094-.522.477-.592a4.7 4.7 0 0 1 1.53-.038c2.131.311 3.946 1.264 5.467 2.774.868.86 1.525 1.887 2.202 2.89.72 1.066 1.494 2.082 2.48 2.915.348.291.626.513.892.677-.802.09-2.14.109-3.055-.615zm1.001-6.44a.306.306 0 0 1 .415-.287.3.3 0 0 1 .113.074.3.3 0 0 1 .086.214c0 .17-.136.307-.308.307a.303.303 0 0 1-.306-.307m3.11 1.596c-.2.081-.4.151-.591.16a1.25 1.25 0 0 1-.798-.254c-.274-.23-.47-.358-.551-.758a1.7 1.7 0 0 1 .015-.588c.07-.327-.007-.537-.238-.727-.188-.156-.426-.199-.689-.199a.6.6 0 0 1-.254-.078.253.253 0 0 1-.114-.358 1 1 0 0 1 .192-.21c.356-.202.767-.136 1.146.016.352.144.618.408 1.001.782.392.451.462.576.685.915.176.264.336.536.446.848.066.194-.02.353-.25.45"],
        [/hugging/, '#0b0f19', '#FFD21E', "M12.025 1.13c-5.77 0-10.449 4.647-10.449 10.378 0 1.112.178 2.181.503 3.185.064-.222.203-.444.416-.577a.96.96 0 0 1 .524-.15c.293 0 .584.124.84.284.278.173.48.408.71.694.226.282.458.611.684.951v-.014c.017-.324.106-.622.264-.874s.403-.487.762-.543c.3-.047.596.06.787.203s.31.313.4.467c.15.257.212.468.233.542.01.026.653 1.552 1.657 2.54.616.605 1.01 1.223 1.082 1.912.055.537-.096 1.059-.38 1.572.637.121 1.294.187 1.967.187.657 0 1.298-.063 1.921-.178-.287-.517-.44-1.041-.384-1.581.07-.69.465-1.307 1.081-1.913 1.004-.987 1.647-2.513 1.657-2.539.021-.074.083-.285.233-.542.09-.154.208-.323.4-.467a1.08 1.08 0 0 1 .787-.203c.359.056.604.29.762.543s.247.55.265.874v.015c.225-.34.457-.67.683-.952.23-.286.432-.52.71-.694.257-.16.547-.284.84-.285a.97.97 0 0 1 .524.151c.228.143.373.388.43.625l.006.04a10.3 10.3 0 0 0 .534-3.273c0-5.731-4.678-10.378-10.449-10.378M8.327 6.583a1.5 1.5 0 0 1 .713.174 1.487 1.487 0 0 1 .617 2.013c-.183.343-.762-.214-1.102-.094-.38.134-.532.914-.917.71a1.487 1.487 0 0 1 .69-2.803m7.486 0a1.487 1.487 0 0 1 .689 2.803c-.385.204-.536-.576-.916-.71-.34-.12-.92.437-1.103.094a1.487 1.487 0 0 1 .617-2.013 1.5 1.5 0 0 1 .713-.174m-10.68 1.55a.96.96 0 1 1 0 1.921.96.96 0 0 1 0-1.92m13.838 0a.96.96 0 1 1 0 1.92.96.96 0 0 1 0-1.92M8.489 11.458c.588.01 1.965 1.157 3.572 1.164 1.607-.007 2.984-1.155 3.572-1.164.196-.003.305.12.305.454 0 .886-.424 2.328-1.563 3.202-.22-.756-1.396-1.366-1.63-1.32q-.011.001-.02.006l-.044.026-.01.008-.03.024q-.018.017-.035.036l-.032.04a1 1 0 0 0-.058.09l-.014.025q-.049.088-.11.19a1 1 0 0 1-.083.116 1.2 1.2 0 0 1-.173.18q-.035.029-.075.058a1.3 1.3 0 0 1-.251-.243 1 1 0 0 1-.076-.107c-.124-.193-.177-.363-.337-.444-.034-.016-.104-.008-.2.022q-.094.03-.216.087-.06.028-.125.063l-.13.074q-.067.04-.136.086a3 3 0 0 0-.135.096 3 3 0 0 0-.26.219 2 2 0 0 0-.12.121 2 2 0 0 0-.106.128l-.002.002a2 2 0 0 0-.09.132l-.001.001a1.2 1.2 0 0 0-.105.212q-.013.036-.024.073c-1.139-.875-1.563-2.317-1.563-3.203 0-.334.109-.457.305-.454m.836 10.354c.824-1.19.766-2.082-.365-3.194-1.13-1.112-1.789-2.738-1.789-2.738s-.246-.945-.806-.858-.97 1.499.202 2.362c1.173.864-.233 1.45-.685.64-.45-.812-1.683-2.896-2.322-3.295s-1.089-.175-.938.647 2.822 2.813 2.562 3.244-1.176-.506-1.176-.506-2.866-2.567-3.49-1.898.473 1.23 2.037 2.16c1.564.932 1.686 1.178 1.464 1.53s-3.675-2.511-4-1.297c-.323 1.214 3.524 1.567 3.287 2.405-.238.839-2.71-1.587-3.216-.642-.506.946 3.49 2.056 3.522 2.064 1.29.33 4.568 1.028 5.713-.624m5.349 0c-.824-1.19-.766-2.082.365-3.194 1.13-1.112 1.789-2.738 1.789-2.738s.246-.945.806-.858.97 1.499-.202 2.362c-1.173.864.233 1.45.685.64.451-.812 1.683-2.896 2.322-3.295s1.089-.175.938.647-2.822 2.813-2.562 3.244 1.176-.506 1.176-.506 2.866-2.567 3.49-1.898-.473 1.23-2.037 2.16c-1.564.932-1.686 1.178-1.464 1.53s3.675-2.511 4-1.297c.323 1.214-3.524 1.567-3.287 2.405.238.839 2.71-1.587 3.216-.642.506.946-3.49 2.056-3.522 2.064-1.29.33-4.568 1.028-5.713-.624"],
        [/perplex/, '#091717', '#20B8CD', "M22.3977 7.0896h-2.3106V.0676l-7.5094 6.3542V.1577h-1.1554v6.1966L4.4904 0v7.0896H1.6023v10.3976h2.8882V24l6.932-6.3591v6.2005h1.1554v-6.0469l6.9318 6.1807v-6.4879h2.8882V7.0896zm-3.4657-4.531v4.531h-5.355l5.355-4.531zm-13.2862.0676 4.8691 4.4634H5.6458V2.6262zM2.7576 16.332V8.245h7.8476l-6.1149 6.1147v1.9723H2.7576zm2.8882 5.0404v-3.8852h.0001v-2.6488l5.7763-5.7764v7.0111l-5.7764 5.2993zm12.7086.0248-5.7766-5.1509V9.0618l5.7766 5.7766v6.5588zm2.8882-5.0652h-1.733v-1.9723L13.3948 8.245h7.8478v8.087z"],
        [/grok|xai/, '#000000', '#ffffff', "M4.93945 4.96094C7.86569 2.03348 12.1756 1.29525 15.7754 2.77832C16.5718 3.07449 17.2661 3.49585 17.8076 3.8877L14.8018 5.27734C12.003 4.10183 8.79674 4.9012 6.83984 6.86035C4.27606 9.42495 3.69417 13.8137 6.48047 16.7822L6.75781 17.0664L0.124023 23C1.99897 21.0271 3.89507 18.5729 2.75977 15.8096C1.23981 12.1122 2.12498 7.77906 4.93945 4.96094ZM23.9004 0.0996094C21.6357 3.27424 20.7155 5.48855 21.7031 9.74023L21.6963 9.7334C22.4495 12.9342 21.6438 16.4839 19.043 19.0879C15.7641 22.3728 10.5173 23.1041 6.19629 20.1475L9.20898 18.751C11.9667 19.8351 14.984 19.3584 17.1523 17.1875C19.3206 15.0165 19.8074 11.8547 18.7178 9.22363C18.5107 8.72479 17.8897 8.599 17.4551 8.91992L8.58984 15.4717L21.2891 2.70117V2.71191L23.9004 0.0996094Z"],
        [/qwen|alibaba/, '#615CED', '#ffffff', "M23.919 14.545 20.817 9.17l1.47-2.544a.56.56 0 0 0 0-.566l-1.633-2.83a.57.57 0 0 0-.49-.283h-6.207L12.487.402a.57.57 0 0 0-.49-.284H8.732a.56.56 0 0 0-.49.284L5.139 5.775h-2.94a.56.56 0 0 0-.49.284L.077 8.887a.56.56 0 0 0 0 .567L3.18 14.83l-1.47 2.545a.56.56 0 0 0 0 .566l1.634 2.83a.57.57 0 0 0 .49.283h6.205l1.47 2.545a.57.57 0 0 0 .49.284h3.266a.57.57 0 0 0 .49-.284l3.104-5.375h2.94a.57.57 0 0 0 .49-.283l1.634-2.828a.55.55 0 0 0-.004-.568M8.733.686l1.634 2.828-1.634 2.828H21.8L20.164 9.17H7.425L5.63 6.06Zm1.306 19.801-6.205-.002 1.634-2.83h3.265L2.201 6.344h3.267q3.182 5.517 6.367 11.032zm10.124-5.66L18.53 12l-6.532 11.315-1.634-2.83c2.129-3.673 4.25-7.351 6.373-11.028h3.592l3.102 5.374z"],
        [/moonshot|kimi/, '#16191E', '#ffffff', "m1.053 16.91 9.538 2.55a21 20.981 0 0 0 .06 2.031l5.956 1.592a12 11.99 0 0 1-15.554-6.172m-1.02-5.79 11.352 3.035a21 20.981 0 0 0-.469 2.01l10.817 2.89a12 11.99 0 0 1-1.845 2.004L.658 15.918a12 11.99 0 0 1-.625-4.796m1.593-5.146L13.573 9.17a21 20.981 0 0 0-1.01 1.874l11.297 3.02a21 20.981 0 0 1-.67 2.362l-11.55-3.087L.125 10.26a12 11.99 0 0 1 1.499-4.285ZM6.067 1.58l11.285 3.016a21 20.981 0 0 0-1.688 1.719l7.824 2.091a21 20.981 0 0 1 .513 2.664L2.107 5.218a12 11.99 0 0 1 3.96-3.638M21.68 4.866 7.222 1.003A12 11.99 0 0 1 21.68 4.866"],
        [/replicate/, '#000000', '#ffffff', "M24 10.262v2.712h-9.518V24h-3.034V10.262zm0-5.131v2.717H8.755V24H5.722V5.131zM24 0v2.717H3.034V24H0V0z"],
        [/\bmeta\b/, '#0467DF', '#ffffff', "M6.915 4.03c-1.968 0-3.683 1.28-4.871 3.113C.704 9.208 0 11.883 0 14.449c0 .706.07 1.369.21 1.973a6.624 6.624 0 0 0 .265.86 5.297 5.297 0 0 0 .371.761c.696 1.159 1.818 1.927 3.593 1.927 1.497 0 2.633-.671 3.965-2.444.76-1.012 1.144-1.626 2.663-4.32l.756-1.339.186-.325c.061.1.121.196.183.3l2.152 3.595c.724 1.21 1.665 2.556 2.47 3.314 1.046.987 1.992 1.22 3.06 1.22 1.075 0 1.876-.355 2.455-.843a3.743 3.743 0 0 0 .81-.973c.542-.939.861-2.127.861-3.745 0-2.72-.681-5.357-2.084-7.45-1.282-1.912-2.957-2.93-4.716-2.93-1.047 0-2.088.467-3.053 1.308-.652.57-1.257 1.29-1.82 2.05-.69-.875-1.335-1.547-1.958-2.056-1.182-.966-2.315-1.303-3.454-1.303zm10.16 2.053c1.147 0 2.188.758 2.992 1.999 1.132 1.748 1.647 4.195 1.647 6.4 0 1.548-.368 2.9-1.839 2.9-.58 0-1.027-.23-1.664-1.004-.496-.601-1.343-1.878-2.832-4.358l-.617-1.028a44.908 44.908 0 0 0-1.255-1.98c.07-.109.141-.224.211-.327 1.12-1.667 2.118-2.602 3.358-2.602zm-10.201.553c1.265 0 2.058.791 2.675 1.446.307.327.737.871 1.234 1.579l-1.02 1.566c-.757 1.163-1.882 3.017-2.837 4.338-1.191 1.649-1.81 1.817-2.486 1.817-.524 0-1.038-.237-1.383-.794-.263-.426-.464-1.13-.464-2.046 0-2.221.63-4.535 1.66-6.088.454-.687.964-1.226 1.533-1.533a2.264 2.264 0 0 1 1.088-.285z"]
    ];
    var aiSeq = 0;
    function aiIcon(pr) {
        var key = ((pr && pr.id) + ' ' + (pr && pr.name)).toLowerCase(), hit = null, custom = window.HZP_AI_ICONS && pr ? window.HZP_AI_ICONS[pr.id] : null;
        for (var i = 0; i < AI_ICONS.length && !hit; i++) if (AI_ICONS[i][0].test(key)) hit = AI_ICONS[i];
        var brand = null; for (var j = 0; j < AI_BRAND.length && !brand; j++) if (AI_BRAND[j][0].test(key)) brand = AI_BRAND[j];
        var tile = el('span', null, 'hzp-aiic'), letter = String((pr && pr.name) || '?').replace(/[^A-Za-z0-9]/g, '').charAt(0).toUpperCase() || '?';
        if (brand && !custom) {
            var id = 'hzpg' + (++aiSeq), fill = brand[2] === 'gemini' ? 'url(#' + id + ')' : brand[2];
            var defs = brand[2] === 'gemini' ? '<defs><linearGradient id="' + id + '" x1="3" y1="3" x2="21" y2="21" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4E82EE"/><stop offset=".55" stop-color="#9168C0"/><stop offset="1" stop-color="#D96570"/></linearGradient></defs>' : '';
            tile.style.background = brand[1]; tile.setAttribute('aria-hidden', 'true'); tile.setAttribute('data-hzp-logo', 'official');
            tile.innerHTML = '<svg viewBox="0 0 24 24" fill="' + fill + '" stroke="none" focusable="false">' + defs + '<path d="' + brand[3] + '"/></svg>';
            return tile;
        }
        if (!brand && !custom && pr && pr.icon && document.getElementById(pr.icon)) {   // V1.99.14: the provider's own sprite mark (same one the main picker uses)
            tile.style.background = 'transparent'; tile.style.boxShadow = 'none'; tile.setAttribute('aria-hidden', 'true'); tile.setAttribute('data-hzp-logo', 'sprite');
            tile.innerHTML = '<svg viewBox="0 0 24 24" focusable="false" style="width:100%;height:100%;display:block"><use href="#' + pr.icon + '"/></svg>';
            return tile;
        }
        var glyph = hit ? hit[3] : '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>';
        tile.style.background = 'linear-gradient(135deg,' + (hit ? hit[1] : '#5b6b8c') + ',' + (hit ? hit[2] : '#2f3b57') + ')';
        tile.setAttribute('aria-hidden', 'true');
        tile.innerHTML = custom && /^\s*<svg/i.test(custom) ? custom : '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">' + (custom || glyph) + '</svg>';
        return tile;
    }
    function aiLine(pr, sub, control) {
        var l = el('label', null, 'hzp-line hzp-ai'), t = el('span', null, 'hzp-ai-t'); t.append(el('strong', pr.name)); if (sub) t.append(el('small', sub));
        l.append(aiIcon(pr), t, control); return l;
    }
    function alertsOn() { return !!(config.alertsEnabled && config.watchToken); }
    async function disableAlerts() { await api('notifications', { enabled: false, deviceToken: config.watchToken }); delete config.watchToken; config.alertsEnabled = false; config.alertsOptOut = true; delete config.pushURL; store(); }
    function readyIds() { return providers().filter(function (p) { return p.ready; }).map(function (p) { return p.id; }); }
    function enableAI(c) {
        var ready = readyIds(), ids = (c.people.aiMembers || []).filter(function (id) { return ready.indexOf(id) >= 0; });
        if (!ids.length) { var pick = window.HzPick && window.HzPick.id; var d = ready.indexOf(pick) >= 0 ? pick : ready[0]; if (!d) throw new Error('Add an AI key in Settings first, then include AI.'); ids = [d]; }
        setAI(c, true, ids);
    }
    /* ---------- V1.99.21 · one rule for the whole chat ----------
       Whoever sets "AI replies" (on / off) or the timing (after each message / after all users) sends a hidden control message through the room.
       Every phone applies it, ticks the same option and shows a toast. The newest change (relay time) wins, so the last person to change it is the rule. */
    function ruleLabel(t, on) { return on === false ? 'AI replies off' : (t === 'each' ? 'AI replies after every message' : 'AI replies after all users'); }
    function ruleShort(c) { if (aiOff(c)) return 'AI off'; return (c.people.ai || c.people.aiBy) ? (timingOf(c) === 'each' ? 'AI each message' : 'AI after all') : ''; }
    function parseRule(text) {
        try { var s = String(text); if (s.slice(-2) !== ']]') return null; var o = JSON.parse(s.slice(RULE.length, -2)); return { t: o.t === 'each' ? 'each' : 'all', on: o.on !== false }; } catch (_) { return null; }
    }
    function applyRule(c, t, on, ts, local) {
        var p = c.people; p.timing = t === 'each' ? 'each' : 'all'; p.aiOff = on === false; p.round = []; p.roundAt = 0;
        if (local && on !== false) p.auto = true;   // choosing a rule on this phone also switches Auto-reply on, as before
        p.ruleTs = Math.max(p.ruleTs || 0, ts || 0);
        delete pendingAI[c.id]; delete pendingQ[c.id]; delete pendingForce[c.id];
        if (p.aiOff && gate && gate.chatId === c.id) cancelWait(false);
        host.save(); paintStrip();
    }
    function setRule(c, t, on) {
        applyRule(c, t, on, Date.now(), true);
        c.people.rulePending = { t: t === 'each' ? 'each' : 'all', on: on !== false }; host.save(); sendRule(c);
    }
    function sendRule(c) {
        var body = c.people && c.people.rulePending; if (!body || ruleBusy[c.id] || !active(c) || c.people.joined === false) return Promise.resolve();
        ruleBusy[c.id] = true;
        return api('message', { room: c.people.room, text: RULE + JSON.stringify(body) + ']]', clientId: crypto.randomUUID() }).then(function (r) {
            var ts = r && r.message && r.message.ts; if (ts) c.people.ruleTs = Math.max(c.people.ruleTs || 0, ts);
            if (c.people.rulePending && c.people.rulePending.t === body.t && c.people.rulePending.on === body.on) delete c.people.rulePending;
            host.save();
        }).catch(function () { /* kept as pending, retried on the next sync */ }).then(function () { delete ruleBusy[c.id]; });
    }
    function refreshInfo() { if (sheetBack && infoSheet && infoChat) { try { buildInfo(infoSheet, infoChat); } catch (e) { } } }
    function closeSheet(fromPop) { infoAdd = false; infoSheet = null; infoChat = null; if (sheetBack) { if (sheetBack._hzq) { sheetBack._hzq = false; if (!fromPop) { try { history.back(); } catch (e) { /* nothing to step back */ } } } sheetBack.remove(); sheetBack = null; } }
    function openInfo(c) {
        c = c || host.current(); if (!c || !c.people) return;
        closeSheet(); var back = el('div', null, 'hzp-back'), sh = el('section', null, 'hzp-sheet'); sheetBack = back;
        sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Chat info');
        back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });
        back.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
        // Drags inside the sheet belong to the sheet: keep them away from any page-level touch/wheel handler, and stop the page behind scrolling.
        ['touchstart', 'touchmove', 'wheel'].forEach(function (ev) { sh.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
        // Fallback: bubble-phase page handlers never see these drags (stopPropagation above). If a capture-phase handler already cancelled the drag
        // (defaultPrevented), the browser will not scroll, so move the sheet by hand. Normal drags are left to the browser (no double scroll).
        var lastY = null;
        sh.addEventListener('touchstart', function (e) { lastY = e.touches && e.touches.length ? e.touches[0].clientY : null; }, { passive: true });
        sh.addEventListener('touchmove', function (e) {
            if (lastY == null || !e.touches || !e.touches.length) return;
            var y = e.touches[0].clientY, dy = lastY - y; lastY = y;
            if (e.defaultPrevented && dy) sh.scrollTop += dy;
        }, { passive: true });
        back.addEventListener('touchmove', function (e) { if (e.target === back && e.cancelable) e.preventDefault(); }, { passive: false });
        buildInfo(sh, c); infoSheet = sh; infoChat = c; back.append(sh); document.body.append(back);
        var first = sh.querySelector('button'); if (first) first.focus();
    }
    /* ---------- V1.99.5 · the "i" = chat settings (AI, preferences, leave). Contact details (photo, ping, mute, block) live in Synced contacts. ---------- */
    var infoAdd = false, infoSheet = null, infoChat = null;
    function addProvider(c, pr) {
        if (!pr.ready) throw new Error(pr.name + ' needs a key first. Add it in Settings.');
        setAI(c, true, Array.from(new Set((c.people.aiMembers || []).concat(pr.id)))); infoAdd = false;
    }
    function dropProvider(c, id) { var next = (c.people.aiMembers || []).filter(function (x) { return x !== id; }); setAI(c, next.length > 0, next); }
    function savePreferences(c) { var d = defaults(); d.timing = timingOf(c); d.auto = autoOn(c); d.ai = !!c.people.ai; d.aiMembers = (c.people.aiMembers || []).slice(); store(); }
    function applyDefaults(c) {
        var d = config.defaults || {}; if (!c || !c.people) return;
        if (d.auto != null && c.people.auto == null) c.people.auto = !!d.auto;
        if (d.ai && d.aiMembers && d.aiMembers.length && !c.people.ai) {
            var ready = readyIds(), ids = d.aiMembers.filter(function (id) { return ready.indexOf(id) >= 0; });
            if (ids.length) { c.people.ai = true; c.people.aiMembers = ids; c.people.aiOwner = me(); c.group = { members: ids.map(function (id) { return { id: id }; }) }; }
        }
    }
    function buildInfo(sh, c) {
        var group = isGroup(c), room = roomOf(c), p = group ? null : roomOther(c), aiOn = !!c.people.ai, theirAI = !aiOn && !!c.people.aiBy;
        var keep = sh.scrollTop; sh.replaceChildren();
        function redo() { buildInfo(sh, c); }
        var head = el('div', null, 'hzp-info-head'), who = group ? { id: '', name: c.title, avatar: '👥' } : (p || { id: '', name: c.title }), txt = el('div');
        txt.append(el('strong', group ? (c.title || 'Group') : labelOf(p)), el('small', group ? (room ? room.members.map(name).join(', ') : '') : ((p && p.status) || 'Available')));
        var x = button('✕', closeSheet); x.className = 'hzp-close'; x.setAttribute('aria-label', 'Close'); head.append(face(who, 'big'), txt, x); sh.append(head);
        sh.append(el('p', 'Chat settings' + (group ? '' : ' · photo, ping, mute and block are in Synced contacts') + '.', 'hzp-muted'));
        if (p && p.id) sh.append(button('Open contact in Synced contacts', function () { closeSheet(); syncFocus = p.id; tab = 'sync'; open(); }));
        // V1.99.21: the rule is for the whole chat, so everyone sees these controls, and a change here is sent to every member.
        sh.append(el('h3', 'AI replies'));
        sh.append(line('AI replies', aiOff(c) ? 'Off · a normal chat, nothing goes to an AI' : 'On · the AI answers by the rule below', tick(!aiOff(c), function (v) { setRule(c, timingOf(c), v); redo(); return true; })));
        if (!aiOff(c)) {
            sh.append(el('p', 'Pick one. It is sent to everyone in this chat, and their phones switch to the same rule.', 'hzp-muted'));
            sh.append(timingPicker(c, redo));
            sh.append(line('AI reply box', 'Show the "Let the AI answer first?" box. It stays until you tap AI reply first, the X, or swipe it away. Off = it never shows.', tick(config.replyFirst === true, function (v) { config.replyFirst = v; store(); if (!v) cancelWait(true); return true; })));
        }
        sh.append(el('h3', 'AI in this chat'));
        if (theirAI) {
            sh.append(el('p', name(c.people.aiBy) + '’s AI is in this chat. They control it · you can still tap Ask AI.', 'hzp-muted'));
            sh.append(line('Exclude AI', 'Hide ' + name(c.people.aiBy) + '’s AI replies on this phone', tick(!!c.people.hideAI, function (v) { c.people.hideAI = v; host.save(); host.refresh(); return true; })));
        }
        else {
            (aiOn ? (c.people.aiMembers || []) : []).forEach(function (id) {
                var pr = providers().find(function (q) { return q.id === id; }) || { id: id, name: id }, r = el('div', null, 'hzp-gm'), info = el('span', null, 'hzp-gm-info');
                info.append(el('span', pr.name, 'hzp-nm'), el('span', pr.ready === false ? 'needs a key in Settings' : 'In this chat', 'hzp-sb'));
                var rm = button('×', function () { dropProvider(c, id); redo(); }); rm.className = 'hzp-gm-x'; rm.setAttribute('aria-label', 'Remove ' + pr.name + ' from this chat');
                r.append(aiIcon(pr), info, rm); sh.append(r);
            });
            var add = button('+ Add AI provider', function () { infoAdd = !infoAdd; redo(); }); add.className = 'hzp-add'; add.setAttribute('aria-label', 'Add AI provider'); add.setAttribute('aria-expanded', String(infoAdd)); sh.append(add);
            if (infoAdd) {
                var mine = aiOn ? (c.people.aiMembers || []) : [], avail = providers().filter(function (q) { return mine.indexOf(q.id) < 0; }).sort(function (a, b) { return (b.ready ? 1 : 0) - (a.ready ? 1 : 0); });
                if (!avail.length) sh.append(el('p', 'Every provider is already in this chat.', 'hzp-muted'));
                avail.forEach(function (pr) { sh.append(aiLine(pr, pr.ready ? '' : 'needs a key in Settings', tick(false, function () { addProvider(c, pr); redo(); return true; }))); });
            }
            if (aiOn && !aiOff(c)) {
                var ex = button('Exclude AI', function () { c.people.auto = false; setAI(c, false, []); host.notice('AI excluded from this chat'); redo(); }); ex.className = 'hzp-danger'; sh.append(ex);
                sh.append(line('Auto-reply', 'Off = the AI answers only when you tap Ask AI', tick(autoOn(c), function (v) { c.people.auto = v; host.save(); paintStrip(); return true; })));
                sh.append(line('Pause AI', c.people.paused ? 'Paused · untick to continue. Ask AI still answers.' : 'Stops automatic replies in this chat · untick to continue', tick(!!c.people.paused, function (v) { c.people.paused = v; host.save(); paintStrip(); return true; })));
            }
        }
        sh.append(el('h3', 'Preferences'));
        var pref = el('div', null, 'hzp-pref'); pref.append(el('span', 'Use this chat’s AI providers, auto-reply and reply timing for new chats.', 'hzp-pref-t'), button('Save preferences', function () { savePreferences(c); closeSheet(); host.notice('Preferences saved'); }));
        sh.append(pref);
        if (group && room) {
            var canEdit = room.owner === me();
            sh.append(el('h3', 'People · ' + room.members.length));
            room.members.forEach(function (id) {
                var r = row(); r.append(face(contactById(id) || { id: id, name: name(id) }), el('span', name(id)));
                if (canEdit && id !== me()) r.append(button('Remove', async function () { if (!window.confirm('Remove ' + name(id) + ' from this chat?')) return; await api('remove_member', { room: room.id, member: id }); await sync(); buildInfo(sh, c); }));
                sh.append(r);
            });
            if (canEdit) snapshot.contacts.filter(function (q) { return room.members.indexOf(q.id) < 0 && (room.pending || []).indexOf(q.id) < 0; }).forEach(function (q) {
                var r = row(); r.append(face(q), el('span', labelOf(q)), button('Invite', async function () { await api('invite', { room: c.people.room, members: [q.id] }); await sync(); host.notice(labelOf(q) + ' invited. They must Join.'); buildInfo(sh, c); })); sh.append(r);
            });
        }
        sh.append(el('h3', 'Leave'));
        var leave = button(group ? 'Leave group' : 'Leave chat', async function () {
            if (!window.confirm(group ? 'Leave this group? Your contacts and local history are kept.' : 'Leave this chat? Your contacts and local history are kept.')) return;
            await api('leave', { id: c.people.room }); c.people.joined = false; var list = config[exclusionKey()] || []; if (list.indexOf(c.people.room) < 0) list.push(c.people.room);
            config[exclusionKey()] = list; store(); await sync(); host.save(); closeSheet(); paintStrip(); escortAfterLeave(c);
        }); leave.className = 'hzp-danger'; sh.append(leave);
        var more = el('details', null, 'hzp-more'); more.append(el('summary', 'More'), button('Resend undelivered messages', retryUnsent)); sh.append(more);
        sh.scrollTop = keep;
    }
    /* ---------- V1.99.21 · after Leave you are taken straight to a new chat: your last provider in this chat, else Gemini, else the first ready one ---------- */
    function escortAfterLeave(c) {
        var ready = providers().filter(function (q) { return q.ready; });
        function idOf(x) { var k = String(x || '').toLowerCase(), q = ready.find(function (r) { return r.id === x || String(r.name).toLowerCase() === k; }); return q ? q.id : null; }
        var pick = null;
        (c.people.aiMembers || []).slice().reverse().some(function (id) { pick = idOf(id); return !!pick; });
        if (!pick) (c.messages || []).slice().reverse().some(function (m) { if (m.role !== 'ai') return false; pick = idOf(m.prov || m.sharedProvider); return !!pick; });
        if (!pick) pick = idOf('gemini') || (ready[0] && ready[0].id) || null;
        if (pick && host.newWith && host.newWith(pick)) { host.notice('You left. New chat with ' + pname(pick) + '.'); paintStrip(); return; }
        openLeavePicker();
    }
    /* ---------- V1.99.13 · after Leave: pick a ready AI provider, tap it, and a new chat opens with that provider ---------- */
    function openLeavePicker() {
        if (!host.newWith) return;
        var ready = providers().filter(function (p) { return p.ready; });
        closeSheet();
        var back = el('div', null, 'hzp-back'), sh = el('section', null, 'hzp-sheet'); sheetBack = back;
        sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Start a new chat');
        back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });
        back.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
        ['touchstart', 'touchmove', 'wheel'].forEach(function (ev) { sh.addEventListener(ev, function (e) { e.stopPropagation(); }, { passive: true }); });
        back.addEventListener('touchmove', function (e) { if (e.target === back && e.cancelable) e.preventDefault(); }, { passive: false });
        var head = el('div', null, 'hzp-info-head'), txt = el('div'), x = button('✕', closeSheet); x.className = 'hzp-close'; x.setAttribute('aria-label', 'Close');
        txt.append(el('strong', 'You left. Start a new chat with…'), el('small', ready.length ? 'Pick one of your ready AI providers.' : 'No AI provider is ready yet.'));
        head.append(txt, x); sh.append(head);
        if (!ready.length) sh.append(el('p', 'Add an AI key in Settings, then start a new chat.', 'hzp-muted'));
        ready.forEach(function (pr) {
            var row = el('div', null, 'hzp-gc'), info = el('span', null, 'hzp-gm-info');
            info.append(el('span', pr.name, 'hzp-nm'), el('span', 'New chat with ' + pr.name, 'hzp-sb'));
            var b = button('', function () { closeSheet(); host.newWith(pr.id); paintStrip(); });
            b.className = 'hzp-gc-main'; b.setAttribute('aria-label', 'New chat with ' + pr.name); b.append(aiIcon(pr), info); row.append(b); sh.append(row);
        });
        back.append(sh); document.body.append(back);
        var first = sh.querySelector('button.hzp-gc-main') || sh.querySelector('button'); if (first) first.focus();
    }
    /* ---------- V1.99.6 · green i, one-to-one visuals, two AI reply modes, whole-round AI prompt ---------- */
    function pname(id) { var pr = providers().find(function (q) { return q.id === id; }); return pr ? pr.name : id; }
    // Providers that have never spoken in this chat (or are guests right now) say hello first.
    function introFor(c, ids, guests) {
        return (ids || []).filter(function (id) {
            if ((guests || []).indexOf(id) >= 0) return true;
            var nm = String(pname(id)).toLowerCase();
            return !(c.messages || []).some(function (m) { return m.role === 'ai' && (m.prov === id || m.sharedProvider === id || String(m.prov || m.sharedProvider || '').toLowerCase() === nm); });
        }).map(pname);
    }
    // Every AI turn in a people chat: the question first (so @mentions still route), then the room: who is here, who asked, what was said, how to behave.
    function awarePrompt(c, text, o) {
        o = o || {};
        var room = roomOf(c), self = (config.me && config.me.name) || 'You';
        var people = room ? room.members.map(function (id) { return id === me() ? self : name(id); }) : [self];
        var asker = o.asker ? (o.asker === me() ? self : name(o.asker)) : '';
        var whole = timingOf(c) === 'all' && !o.forced, msgs = (c.messages || []).filter(function (m) { return (m.role === 'user' || m.role === 'human' || m.role === 'ai') && m.text && m.text !== CTRL; });
        if (msgs.length && msgs[msgs.length - 1].text === text) msgs = msgs.slice(0, -1);
        // Every AI gets the whole recent chat (people and other AIs), oldest first. In "after everyone has sent" mode the new round is marked with an arrow.
        var roundFrom = msgs.length; if (whole) { roundFrom = 0; for (var i = msgs.length - 1; i >= 0; i--) if (msgs[i].role === 'ai') { roundFrom = i + 1; break; } }
        var lines = msgs.map(function (m, ix) {
            var who = m.role === 'user' ? self : m.role === 'ai' ? ((m.sharedProvider || m.prov || 'AI') + ' (AI)') : (m.sender || 'Person');
            // "@" is defused in the transcript so old tags in it can never route this turn to another provider.
            return (whole && ix >= roundFrom ? '\u25B8 ' : '') + who + ': ' + String(m.text).replace(/@(?=\w)/g, '@\u200B');
        });
        var ais = ((c.people && c.people.aiMembers) || []).map(pname);
        var out = text + '\n\n[Room context, for you only]\nThis is a live GROUP chat between real people and AIs, like a team meeting. It is NOT a one-on-one chat, and you CAN see the whole conversation: the full transcript is below. Never say you cannot see the chat.\nIn the room: ' + people.join(', ') + (ais.length ? '. AIs here: ' + ais.join(', ') : '') + '.\n';
        if (asker) out += asker + ' called on you.\n';
        if (o.intro && o.intro.length) out += 'New to this room: ' + o.intro.join(', ') + '. If that is you, open with a short, warm hello like a guest walking into someone\u2019s house: say who you are, thank ' + (asker || 'the room') + ' for having you, and greet the people here by name. Then answer.\n';
        if (whole) out += 'Everyone has now sent a message, so reply to the whole round (the lines marked \u25B8), not only the last line.\n';
        out += '\nConversation so far (oldest first, read it before you answer):\n' + (lines.length ? lines.join('\n') : '(no earlier messages)');
        out += '\n\nStay aware of the room: speak to people by name, pick up what each of them actually said, and answer what was asked. Do not bring up unrelated topics (for example Termux, coding or your own tools) unless someone in this room raised them. Use only what was said in this chat.';
        return out;
    }
    // @tag = a guest for that one reply. They are not a member until added properly (Synced contacts or the i sheet).
    function guestOn(c, ids, quiet) {
        var pp = c.people;
        pp.guest = { ids: ids.slice(), at: Date.now(), prev: { ai: pp.ai, aiMembers: pp.aiMembers ? pp.aiMembers.slice() : null, aiOwner: pp.aiOwner || null, auto: pp.auto == null ? null : pp.auto, group: c.group || null } };
        pp.ai = true; pp.aiMembers = ids.slice(); pp.aiOwner = me(); if (quiet) pp.auto = false;
        c.group = { members: ids.map(function (id) { return { id: id }; }) };
        host.save(); paintStrip();
    }
    function guestOff(c) {
        var g = c && c.people && c.people.guest; if (!g) return;
        var pv = g.prev || {}, pp = c.people;
        pp.ai = !!pv.ai; if (pv.aiMembers) pp.aiMembers = pv.aiMembers; else delete pp.aiMembers;
        if (pv.aiOwner) pp.aiOwner = pv.aiOwner; else delete pp.aiOwner;
        if (pv.auto == null) delete pp.auto; else pp.auto = pv.auto;
        if (pv.group) c.group = pv.group; else delete c.group;
        delete pp.guest; host.save(); paintStrip();
        if (strip) { strip.classList.add('hz-guest-ended'); setTimeout(function () { strip.classList.remove('hz-guest-ended'); }, 650); }
    }
    function guestLater(c) { guestOff(c); }
    function clockText() {
        var d = new Date();
        try { return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + ' \u00B7 ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
        catch (e) { return d.toString().slice(0, 21); }
    }
    function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate(); }
    function dayLabel(ts) {
        var now = new Date(), y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        if (dayKey(ts) === dayKey(now)) return 'Today';
        if (dayKey(ts) === dayKey(y)) return 'Yesterday';
        try { return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); } catch (e) { return dayKey(ts); }
    }
    // V1.99.23: any AI, not only Mistral. host.aiName() is whoever is answering right now; host.aiPhase() is 'connect' (request sent, nothing back yet) or 'type' (reply is typing out).
    function aiPhase() { try { return (host.aiPhase && host.aiPhase()) || ''; } catch (e) { return ''; } }
    function typingText(c) {
        if (!host.busy() || !c.people.ai) return '';
        var live = ''; try { live = (host.aiName && host.aiName()) || ''; } catch (e) { live = ''; }
        var names = live ? [live] : (c.people.aiMembers || []).map(function (id) { var pr = providers().find(function (q) { return q.id === id; }); return pr ? pr.name : id; });
        var who = names.length && names.length < 3 ? names.join(' & ') : 'AI';
        return aiPhase() === 'connect' ? 'Connecting to ' + who + '…' : who + ' is typing';
    }
    function waitingText(c) {
        var room = roomOf(c), p = c.people;
        if (aiOff(c) || !iOwnAI(c) || p.joined === false || !autoOn(c) || p.paused || timingOf(c) !== 'all' || !room || !p.round || !p.round.length) return '';
        var left = room.members.filter(function (id) { return p.round.indexOf(id) < 0; });
        if (!left.length) return '';
        var who = left.map(function (id) { return id === me() ? 'you' : name(id); }).join(' & ');
        if (p.roundAt && Date.now() - p.roundAt > 60000) return 'Still waiting for ' + who + ' \u00B7 tap Ask AI to go ahead without them';
        return 'Waiting for ' + who + ' before the AI replies';
    }
    // Empty one-to-one chat: shimmering placeholder bubbles while the first sync loads, then a friendly card, so the screen never looks blank.
    function paintEmpty(st) {
        var box = document.getElementById('chatMessages'), c = st && st.c;
        var empty = !!(c && !st.group && st.live && !(c.messages || []).some(function (m) { return m.role === 'user' || m.role === 'human' || m.role === 'ai'; }));
        if (!box || !empty) { if (emptyCard) { emptyCard.remove(); emptyCard = null; } return; }
        var mode = loaded ? 'ready' : (offline ? 'offline' : 'load');
        if (emptyCard && emptyCard.parentNode === box && emptyCard._mode === mode && emptyCard._chat === c.id) return;
        if (emptyCard) emptyCard.remove();
        var p = roomOther(c) || { id: '', name: c.title }, who = labelOf(p), node = el('div', null, 'hzp-empty');
        node._mode = mode; node._chat = c.id; node.setAttribute('role', 'status');
        node.append(face(p, 'big'), el('strong', who));
        if (mode === 'load') { var sk = el('div', null, 'hzp-sk'); sk.append(el('i'), el('i'), el('i')); node.append(el('span', 'Loading messages\u2026'), sk); }
        else if (mode === 'offline') node.append(el('span', 'Offline. Your messages with ' + who + ' load when you are back online.'));
        else node.append(el('span', 'No messages yet. Say hi to ' + who + '.'));
        box.append(node); emptyCard = node;
    }
    function paintLive() {
        if (!host || !liveBar) return;
        var c = host.current(), st = c && c.people ? { c: c, group: isGroup(c), live: active(c) && c.people.joined !== false } : null;
        paintEmpty(st);
        var one = !!(st && !st.group && st.live);
        liveBar.hidden = !one; if (!one) return;
        lbLoad.className = 'hzp-load' + (syncing || (!loaded && !offline) ? ' on' : '');
        lbClock.textContent = clockText();
        var typ = typingText(c), t = typ || waitingText(c);
        lbState.className = 'hzp-state' + (typ && aiPhase() === 'connect' ? ' connect' : '');
        lbState.hidden = !t; lbText.textContent = t;
    }
    // The "i" sheet: two clear choices for when the AI replies.
    function timingPicker(c, redo) {
        var box = el('div', null, 'hzp-modes'); box.setAttribute('role', 'radiogroup'); box.setAttribute('aria-label', 'When the AI replies');
        [['each', 'AI replies after each message', 'The AI answers every message as it arrives, whoever sent it.'],
         ['all', 'AI replies after everyone has sent', 'The AI waits until everyone has sent a message, then answers the whole round once. It only uses what was said in the chat.']].forEach(function (o) {
            var on = timingOf(c) === o[0], l = el('label', null, 'hzp-mode' + (on ? ' on' : '')), i = el('input'), t = el('span', null, 'hzp-mode-t');
            i.type = 'radio'; i.name = 'hzp-timing'; i.checked = on;
            i.onchange = i.onclick = function () { if (!i.checked) return; var same = c.people.timing === o[0] && c.people.auto === true && !aiOff(c); if (same) return; setRule(c, o[0], true); redo(); };   // V1.99.16: the default option was shown selected but never saved, so re-tapping it did nothing
            t.append(el('strong', o[1]), el('small', o[2])); l.append(i, t); box.append(l);
        });
        return box;
    }
    function room0(c) { return roomOf(c) || null; }

    /* V1.99.14 · two separate setups, two separate "i" buttons. The green "i" is PEOPLE (Horizon ID chats) and only shows in a people chat.
       The purple "i" is the AI GROUP's and never shows inside a people chat. */
    /* V1.99.22 · in a peer-to-peer chat the box says "Message Peer to Peer"; leaving it hands the box back */
    var P2P_HINT = 'Message Peer to Peer';
    function pinPlaceholder() {
        try {
            var cur = host && host.current && host.current(), inp = host && host.input;
            if (!inp) return;
            if (cur && cur.people) { if (inp.placeholder !== P2P_HINT) inp.placeholder = P2P_HINT; }
            else if (inp.placeholder === P2P_HINT) inp.placeholder = 'Message Horizon...';
        } catch (e) { /* cosmetic only */ }
    }
    function sortInfoButtons() {
        try {
            var cur = host && host.current && host.current(), people = !!(cur && cur.people);
            document.body.setAttribute('data-hzp-chat', people ? 'people' : 'ai');
            if (iBtn) { iBtn.hidden = !people; if (docked && launchRow) launchRow.hidden = true; }   // V1.99.25: the row above the chat box only holds Options now
            var all = document.querySelectorAll('button,[role="button"]');
            for (var i = 0; i < all.length; i++) {
                var b = all[i]; if (b === iBtn || (b.classList && b.classList.contains('hzp-i'))) continue;
                var t = (b.textContent || '').trim(), lab = ((b.getAttribute && b.getAttribute('aria-label')) || '') + ' ' + (b.title || '');
                var isI = t === 'i' || t === '\u2139' || (/group/i.test(lab) && /(info|details|settings)/i.test(lab) && t.length <= 2);
                if (isI && !b.closest('.hzp-sheet,.hzp-panel,.hzp-back')) {
                    b.classList.add('hz-group-i', 'hzp-gopt');   // V1.99.22: the AI group's "i" is now the same cyan Options pill, same button and same click
                    if (t === 'i' || t === '\u2139') { b.textContent = 'Options'; b.setAttribute('aria-label', 'Options'); b.title = 'Options'; }
                }
            }
            var box = document.querySelector('.chat-input-area');
            if (box) {
                if (iBtn && iBtn.parentNode !== box) box.appendChild(iBtn);
                var groupOptions = document.querySelector('.hz-gpbar .hgp-i') || box.querySelector('.hgp-i');
                if (groupOptions && groupOptions.parentNode !== box) box.appendChild(groupOptions);
                var groupActive = !people && !!(cur && cur.group && cur.group.members && cur.group.members.length);
                if (groupOptions) groupOptions.hidden = !groupActive;
                box.classList.toggle('hz-has-options', people || groupActive);
            }
            pinPlaceholder();
        } catch (e) { /* cosmetic only */ }
    }
    function startInfoSplit() {   // V1.99.17: runs from init (never at load), uses only calls the file already makes elsewhere
        try {
            var st = el('style');
            st.textContent = 'body[data-hzp-chat="people"] .hz-group-i{display:none!important}body[data-hzp-chat="ai"] .hzp-i{display:none!important}'
                + '.hzp-launch .hzp-face.tiny{flex:0 0 24px;width:24px;height:24px;font-size:11px;display:inline-grid;place-items:center;vertical-align:middle;margin-right:6px}.hzp-own{display:flex;flex-direction:column;gap:8px;margin-top:10px}.hzp-name-card .hzp-face.big{flex:0 0 52px;width:52px;height:52px;font-size:20px}'
            + 'body .hzp-line.hzp-ai{justify-content:flex-start;gap:10px;min-height:0;padding:5px 10px;margin:4px 0;border:1px solid rgba(68,87,124,.45);border-radius:12px;transition:box-shadow .15s,border-color .15s,background .15s}body .hzp-line.hzp-ai .hzp-ai-t{flex:0 1 auto}body .hzp-line.hzp-ai strong{font-size:14px;line-height:1.2}.hzp-panel .hzp-line.hzp-ai small,.hzp-sheet .hzp-line.hzp-ai small,body .hzp-line.hzp-ai small{margin:0;font-size:11px;line-height:1.2}body .hzp-line.hzp-ai .hzp-aiic{flex:0 0 28px;width:28px;height:28px;border-radius:9px}body .hzp-line.hzp-ai .hzp-aiic svg{width:18px;height:18px}body .hzp-line.hzp-ai input[type=checkbox]{margin:0 0 0 4px;width:18px;height:18px}body .hzp-line.hzp-ai:has(input:checked){border-color:#00e5ff;background:rgba(0,229,255,.12);box-shadow:0 0 14px rgba(0,229,255,.55),inset 0 0 10px rgba(0,229,255,.14)}'
            + 'body .hzp-launch{--hzp-pill-pull:18px}.hzp-launch{box-sizing:border-box;width:100%;align-self:stretch}.hzp-launch button.hzp-i.hzp-opt{margin-left:auto!important;margin-right:0!important}button.hz-group-i.hzp-gopt{flex:0 0 auto!important;width:auto!important;height:36px!important;min-width:0!important;padding:0 16px!important;margin-left:auto;border-radius:999px!important;border:1px solid #00e5ff!important;background:rgba(0,229,255,.08)!important;color:#00e5ff!important;box-shadow:0 0 10px rgba(0,229,255,.35)!important;font:700 13px system-ui!important;font-style:normal!important;letter-spacing:.2px;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;touch-action:manipulation}'
            + '.hzp-who strong{color:#fff}.hzp-who small{color:#dce8ff;opacity:1}'
                + 'html[data-theme="grey"] .hzp-who strong{color:#0b1220!important}html[data-theme="grey"] .hzp-who small{color:#1f2a3d!important;opacity:1!important}';
            document.head.append(st);
            sortInfoButtons();
            if (window.MutationObserver && host && host.input) { try { new MutationObserver(function () { pinPlaceholder(); }).observe(host.input, { attributes: true, attributeFilter: ['placeholder'] }); } catch (e) { } }
            if (window.MutationObserver && document.body) {
                var q = 0;
                new MutationObserver(function (records) {
                    var relevant = records.some(function (r) { return Array.prototype.some.call(r.addedNodes, function (n) {
                        return n.nodeType === 1 && (n.matches('button,[role="button"],.chat-input-area,.hz-gpbar') || n.querySelector('button,[role="button"],.chat-input-area,.hz-gpbar'));
                    }); });
                    if (!relevant || q) return;
                    q = setTimeout(function retry() {
                        if (window.hzTyping || window.hzKbBusy || window.hzEditorFocused || document.hidden) { q = setTimeout(retry, 400); return; }
                        q = 0; sortInfoButtons();
                    }, 120);
                }).observe(document.body, { childList: true, subtree: true });
            }
        } catch (e) { /* cosmetic only */ }
    }
    function paintStrip() {
        paintBadge(); drainAI(); syncBg();
        if (gate && gate.bar && !gate.bar.isConnected) { try { mountBox(gate.bar); } catch (e) { } }   // V1.99.21: the AI-first box stays until you close it
        if (host) paintPills();
        try { host.chats().forEach(function (x) { var g = x.people && x.people.guest; if (g && Date.now() - g.at > 60000 && !host.busy()) guestOff(x); }); } catch (e) { }
        try { var cur = host && host.current(); document.body.setAttribute('data-hzp-chat', cur && cur.people ? 'people' : 'ai'); } catch (e) { }
        if (!strip) return;
        var c = host.current(); strip.replaceChildren();
        sortInfoButtons();
        strip.hidden = !(c && c.people);
        if (strip.hidden) { paintLive(); return; }
        markSeen(c);
        var group = isGroup(c), p = group ? null : roomOther(c), live = active(c) && c.people.joined !== false;
        var who = el('div', null, 'hzp-who'), t = el('span');
        var mode = !live ? 'AI Normal Chat Mode \u00B7 people excluded / signed out' : group ? (room0(c) ? room0(c).members.length + ' people' : 'Group') : ((p && p.status) || 'Available');
        if (live) { var rs = ruleShort(c); if (rs) mode += ' \u00B7 ' + rs; if (c.people.guest && c.people.guest.ids) { var gp = (c.people.guest.prev && c.people.guest.prev.aiMembers) || [], gn = c.people.guest.ids.filter(function (id) { return gp.indexOf(id) < 0; }); mode += ' \u00B7 Referee ' + (gn.length ? gn : c.people.guest.ids).map(pname).join(' & '); } }
        t.append(el('strong', group ? (c.title || 'Group') : labelOf(p || { name: c.title })), el('small', mode));
        who.append(face(group ? { id: '', name: c.title, avatar: '\uD83D\uDC65' } : (p || { id: '', name: c.title })), t); strip.append(who);
        if (live && (c.messages || []).some(function (m) { return m.delivery === 'failed' || m.shareFailed; })) { var failed = (c.messages || []).filter(function (m) { return m.delivery === 'failed' || m.shareFailed; }).length, rb = button('', async function () { await retryUnsent(); paintStrip(); }); rb.className = 'hzp-retry'; rb.title = 'Resend ' + failed + ' undelivered message' + (failed === 1 ? '' : 's'); rb.setAttribute('aria-label', rb.title);
            var rbi = el('span', null, 'hzp-retry-i'); rbi.setAttribute('aria-hidden', 'true'); rbi.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-7.5L3 9.5z"/></svg>'; rb.append(rbi, el('span', 'Resend ' + failed)); strip.append(rb); }
        if (live && (c.people.ai || c.people.aiBy) && !aiOff(c)) { var ab = button('Ask AI', askAI); ab.className = 'hzp-ask'; ab.title = 'Ask the AI to answer, aware of everyone in the room'; strip.append(ab); }
        paintLive();
    }
    function renderAdd(parent) {
        parent.append(el('h3', 'Add contact'), el('p', 'Enter their Horizon ID or number. Once they accept, they sit in your top pill and you can chat straight away.', 'hzp-muted'));
        var add = field('Horizon ID or phone number', 'text', 'HZ-\u2026 or +27821234567'); add.input.autocapitalize = 'characters'; add.input.spellcheck = false; add.input.dataset.hzpDraft = 'add';
        parent.append(add.wrap, button('Add contact', async function () {
            var target = add.input.value.trim(); if (!target) throw new Error('Enter a Horizon ID or international phone number.');
            var result = await api('invite', { target: target }); await sync(); add.input.value = '';
            var req = result.request, other = req.from === me() ? req.to : req.from;
            if (req.status === 'accepted') { host.notice('Already in your contacts'); await goTo(other); return; }
            host.notice(req.from === me() ? 'Invitation sent with your Name Card' : 'They already invited you. Open Invites and Accept.');
            renderSections();
        }));
        snapshot.requests.filter(function (r) { return r.from === me() && r.status === 'pending'; }).forEach(function (r) { parent.append(el('p', 'Invitation sent \u00B7 waiting for ' + name(r.to), 'hzp-muted')); });
        if (!snapshot.contacts.length) parent.append(el('p', 'No contacts yet.', 'hzp-muted'));
    }
    function renderNameCard(parent) {
        var profile = el('details', null, 'hzp-profile'); profile.append(el('summary', 'Edit my Name Card'));
        var display = field('Your name', 'text', 'Display name'), avatar = field('Avatar \u00B7 emoji or initials', 'text', '\uD83C\uDF05'), bio = field('Status', 'text', 'Available to chat');
        display.input.value = config.me.name || ''; display.input.maxLength = 60; display.input.dataset.hzpDraft = 'name';
        avatar.input.value = config.me.avatar || '\u25CE'; avatar.input.maxLength = 16; avatar.input.dataset.hzpDraft = 'avatar';
        bio.input.value = config.me.status || ''; bio.input.maxLength = 100; bio.input.dataset.hzpDraft = 'status';
        profile.append(display.wrap, avatar.wrap, bio.wrap, button('Save Name Card', async function () {
            var result = await api('profile', { name: display.input.value, avatar: avatar.input.value, status: bio.input.value });
            config.me = result.me; store(); await sync(); renderSections(); host.notice('Name Card saved');
        })); parent.append(profile);
    }
    function renderSettings(parent) {
        parent.append(el('h3', 'Preferences'));
        parent.append(check('Default ID \u00B7 keep ' + config.me.id + ' on this phone', config.defaultId === me(), function (v) { if (v) config.defaultId = me(); else delete config.defaultId; store(); }));
        parent.append(el('small', 'Your Horizon ID comes from your number and never changes. Signing in with a different number gives a different ID, and Horizon warns you if it is not your default.'));
        parent.append(check('Keep Horizon in the background', config.bgReply !== false, function (v) { config.bgReply = v; store(); syncBg(); }));
        parent.append(el('small', 'Only for chats where the AI is yours and Auto-reply is on. Shows a small \u201CHorizon is running\u201D notification and uses your own AI key. The AI controls for each chat live behind the \u201Ci\u201D button.'));
        var timing = el('details', null, 'hzp-profile'); timing.append(el('summary', 'AI reply default for new chats'));
        radios(timing, 'Default for new chats', function () { return defaults().timing; }, function (v) { defaults().timing = v; store(); }); parent.append(timing);
        renderNotifications(parent);
        parent.append(button('Sign out of this phone', async function () { try { await api('logout', {}); } catch (_) {} clearTimeout(backupTimer); delete config.token; store(); snapshot = { contacts: [], requests: [], invitations: [], rooms: [], people: [] }; cancelWait(false); closeSheet(); render(); paintStrip(); paintBadge(); }));
        parent.append(el('small', 'Signing out stops live messages, not opted-in alerts or pings. Messages and backups are NOT end-to-end encrypted; an AI provider can read the context you send to it.'));
    }
    /* ---------- Synced contacts: tick who is in the group, tap a name for actions, pick the AI ---------- */
    var syncFocus = null, syncOpen = { c: true, a: true, s: false };
    function pickedContacts() { return selections().contacts.filter(function (id) { return !!contactById(id); }); }
    function pickedAI() { return selections().ai.filter(function (id) { return providers().some(function (p) { return p.id === id; }); }); }
    function repaintGroup() { pillSig = ''; paintPills(); }
    function isBlocked(id) { return (snapshot.blocked || []).some(function (b) { return b.id === id; }); }
    function dropdown(title, key, parent) {
        var d = el('details', null, 'hzp-dd'); d.open = syncOpen[key] !== false; d.append(el('summary', title));
        d.addEventListener('toggle', function () { syncOpen[key] = d.open; }); parent.append(d); return d;
    }
    /* V1.99.5 · everything about one contact lives here: photo, chat, ping, copy ID, top pill, mute, block, remove. */
    function contactDetails(p) {
        var sel = selections(), blocked = isBlocked(p.id), box = el('div', null, 'hzp-cd');
        function gone() { toggleIn(sel.contacts, p.id, false); syncFocus = null; repaintGroup(); }
        function again() { pillSig = ''; paintPills(); paintStrip(); renderSections(); }
        var file = el('input'); file.type = 'file'; file.accept = 'image/*'; file.style.display = 'none';
        file.onchange = async function () {
            var f = file.files && file.files[0]; file.value = ''; if (!f) return;
            var old = photos()[p.id];
            try { photos()[p.id] = await cropPhoto(f); store(); } catch (e) { if (old) photos()[p.id] = old; else delete photos()[p.id]; error(e.name === 'QuotaExceededError' ? new Error('Not enough storage for this photo.') : e); return; }
            again(); host.notice('Photo set for ' + labelOf(p));
        };
        var top = el('div', null, 'hzp-cd-photo'), pb = el('div', null, 'hzp-cd-pb');
        pb.append(file, button(photos()[p.id] ? 'Change photo' : 'Upload photo', function () { file.click(); }));
        if (photos()[p.id]) pb.append(button('Remove photo', function () { delete photos()[p.id]; store(); again(); }));
        pb.append(el('small', 'Fits the app shape · stays on this phone', 'hzp-muted')); top.append(face(p, 'big'), pb); box.append(top);
        var acts = el('div', null, 'hzp-cd-acts');
        acts.append(button('Chat', function () { return goTo(p.id); }), button('Ping ❗', async function () { await api('ping', { id: p.id }); host.notice('Ping sent to ' + labelOf(p)); }), button('Copy ID', function () { return copyID(p.id); }));
        box.append(acts);
        box.append(line('Show in top pill', 'Keep this contact one tap away', tick(hidden().indexOf(p.id) < 0, function (v) { toggleIn(hidden(), p.id, !v); pillSig = ''; paintPills(); return true; })));
        box.append(line('Mute messages', 'No popup for new messages · pings still ring', tick(muted().indexOf(p.id) >= 0, function (v) { toggleIn(muted(), p.id, v); return true; })));
        var danger = el('div', null, 'hzp-cd-danger');
        danger.append(
            button(blocked ? 'Unblock' : 'Block', async function () { await api(blocked ? 'unblock' : 'block', { id: p.id }); await sync(); renderSections(); }),
            button('Remove', async function () { if (!window.confirm('Remove ' + labelOf(p) + ' from your contacts? Old history stays. This does not block them.')) return; await api('forget', { id: p.id }); gone(); await sync(); renderSections(); }),
            button('Block & remove', async function () { if (!window.confirm('Block ' + labelOf(p) + ' and remove them from your contacts?')) return; await api('block', { id: p.id }); await api('forget', { id: p.id }); gone(); await sync(); renderSections(); })
        );
        box.append(danger); return box;
    }
    async function startPicked() {
        var ids = pickedContacts(), ai = chosenAI();
        if (!ids.length && !ai.length) throw new Error('Tick a contact or an AI first.');
        if (!ids.length) { hidePanel(); var list = host.chats().filter(function (x) { return !x.people; }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); }); host.open((list[0] || host.make('AI Normal Chat Mode')).id); paintStrip(); return; }
        var c;
        if (ids.length === 1) c = await goTo(ids[0]);
        else {
            var v = await api('room', { members: ids, title: ids.map(function (id) { return labelOf(contactById(id)); }).join(', ').slice(0, 60), group: true, approval: true });
            await sync(); c = chatFor(v.room); hidePanel(); host.open(c.id); host.notice('Group started. Everyone has to Join.');
        }
        if (ai.length && c && c.people) setAI(c, true, ai);
        paintStrip();
    }
    /* V1.99.3 \u00B7 status message. Saved through the same profile call as the Name Card; contacts see it on their card of you after their next sync. */
    var STATUS_PRESETS = ['Available', 'Busy', 'At work', 'In a meeting', 'Away', 'Do not disturb'];
    async function saveStatus(input, text) {
        var m = config.me || {}; text = String(text || '').trim().slice(0, 100); input.value = text;
        var result = await api('profile', { name: m.name || '', avatar: m.avatar || '\u25CE', status: text });
        config.me = result.me || Object.assign({}, m, { status: text }); store(); await sync(); renderSections(); host.notice(text ? 'Status set' : 'Status cleared');
    }
    function renderMyStatus(parent) {
        var m = config.me || {}, card = el('details', null, 'hzp-mystatus'), head = el('summary', null, 'hzp-ms-head'), t = el('span', null, 'hzp-ms-t');
        card.open = syncOpen.s === true; card.addEventListener('toggle', function () { syncOpen.s = card.open; });
        t.append(el('strong', 'My status'), el('small', m.status ? '\u201C' + m.status + '\u201D' : 'Not set \u00B7 contacts see \u201CAvailable\u201D'));
        head.append(face(m), t, el('span', '\u25BE', 'hzp-ms-caret'));
        var input = el('input'); input.type = 'text'; input.maxLength = 100; input.placeholder = 'What are you up to?'; input.value = m.status || ''; input.dataset.hzpDraft = 'mystatus'; input.setAttribute('aria-label', 'Status message');
        var chips = el('div', null, 'hzp-ms-chips');
        STATUS_PRESETS.forEach(function (s) { chips.append(button(s, function () { return saveStatus(input, s); })); });
        var acts = el('div', null, 'hzp-ms-acts'); acts.append(button('Save status', function () { return saveStatus(input, input.value); }), button('Clear', function () { return saveStatus(input, ''); }));
        card.append(head, input, chips, acts); parent.append(card);
    }
    function renderSync(parent) {
        renderMyStatus(parent);
        var sel = selections(), list = dropdown('Contacts \u00B7 ' + snapshot.contacts.length, 'c', parent);
        if (!snapshot.contacts.length) list.append(el('p', 'No contacts yet. Add one on the Add & preferences tab.', 'hzp-muted'));
        snapshot.contacts.forEach(function (p) {
            var wrap = el('div', null, 'hzp-pick'), blocked = isBlocked(p.id), card = el('div', null, 'hzp-cc hzp-pickrow' + (blocked ? ' blocked' : '') + (syncFocus === p.id ? ' on' : ''));
            var info = el('span', null, 'hzp-cc-info'); info.append(el('strong', labelOf(p)), el('small', blocked ? 'Blocked' : (p.status || 'Available')));
            var name = button('', function () { syncFocus = syncFocus === p.id ? null : p.id; renderSections(); });
            name.className = 'hzp-pickname' + (syncFocus === p.id ? ' on' : ''); name.setAttribute('aria-expanded', String(syncFocus === p.id)); name.setAttribute('aria-label', labelOf(p) + ', ' + (blocked ? 'blocked' : (p.status || 'Available')) + '. Tap for actions'); name.append(face(p), info);
            var box = tick(sel.contacts.indexOf(p.id) >= 0, function (v) { toggleIn(sel.contacts, p.id, v); repaintGroup(); return true; }); box.setAttribute('aria-label', 'Add ' + labelOf(p) + ' to the group');
            card.append(name, box); wrap.append(card); if (syncFocus === p.id) wrap.append(contactDetails(p)); list.append(wrap);
        });
        var ai = dropdown('AI to include \u00B7 ' + pickedAI().length, 'a', parent);
        providers().slice().sort(function (a, b) { return (b.ready ? 1 : 0) - (a.ready ? 1 : 0); }).forEach(function (pr) {
            ai.append(aiLine(pr, pr.ready ? '' : 'needs a key in Settings', tick(sel.ai.indexOf(pr.id) >= 0, function (v) {
                if (v && !pr.ready) throw new Error(pr.name + ' needs a key first. Add it in Settings.');
                toggleIn(sel.ai, pr.id, v); repaintGroup(); return true;
            })));
        });
        parent.append(el('small', 'Ticked stays ticked until you untick it. The group pill at the top shows who is in.', 'hzp-muted'));
        parent.append(button('Start chat with ticked', startPicked));
    }
    function renderInvites(parent) {
        var incoming = snapshot.requests.filter(function (r) { return r.to === me() && r.status === 'pending'; });
        parent.append(el('h3', 'Invites' + (incoming.length + snapshot.invitations.length ? ' \u00B7 ' + (incoming.length + snapshot.invitations.length) : '')));
        if (!incoming.length && !snapshot.invitations.length) parent.append(el('p', 'No pending invites', 'hzp-muted'));
        incoming.forEach(function (r) {
            var wrap = el('div', null, 'hzp-invite'), person = snapshot.people.find(function (p) { return p.id === r.from; }) || { id: r.from };
            wrap.append(nameCard(r.nameCard || person, false)); var actions = row();
            actions.append(button('Accept & Save', async function () { await api('accept_invite', { id: r.id }); await sync(); host.notice('Contact saved. Opening chat.'); await goTo(r.from); }), button('Decline', async function () { await api('answer', { id: r.id, accept: false }); await sync(); }));
            wrap.append(actions); parent.append(wrap);
        });
        snapshot.invitations.forEach(function (r) {
            var line = row(); line.append(el('span', 'Chat approval: ' + r.title + ' \u00B7 from ' + name(r.from)),
                button('Join', async function () { await api('join', { id: r.id, accept: true }); await sync(); var rm = snapshot.rooms.find(function (v) { return v.id === r.id; }); if (rm) { var c = chatFor(rm); setAI(c, false, []); host.open(c.id); close(); } }),
                button('Decline', async function () { await api('join', { id: r.id, accept: false }); await sync(); })); parent.append(line);
        });
        snapshot.requests.filter(function (r) { return r.from === me() && r.status === 'pending'; }).forEach(function (r) { parent.append(el('p', 'Invitation sent \u00B7 waiting for ' + name(r.to), 'hzp-muted')); });
        (snapshot.blocked || []).filter(function (p) { return !snapshot.contacts.some(function (c) { return c.id === p.id; }); }).forEach(function (p) { var line = row(); line.append(el('span', 'Blocked: ' + (p.name || p.id)), button('Unblock ' + (p.name || p.id), async function () { await api('unblock', { id: p.id }); await sync(); })); parent.append(line); });
    }
    function radios(parent, label, get, set) {
        var box = el('div', null, 'hzp-opts'); box.append(el('strong', label));
        [['each', 'AI replies after each user\u2019s message'], ['all', 'AI replies after all users have sent (one reply per round)']].forEach(function (o) {
            var l = el('label', null, 'hzp-check'), i = el('input'); i.type = 'radio'; i.name = 'hzp-t-' + label; i.checked = get() === o[0];
            i.onchange = function () { if (i.checked) set(o[0]); }; l.append(i, document.createTextNode(o[1])); box.append(l);
        }); parent.append(box);
    }
    async function pingChannel(plugin) {
        if (channelMade) return; channelMade = true;
        try { await plugin.createChannel({ id: 'horizon_pings_v2', name: 'Horizon pings', description: 'Name + PING alerts', importance: 5, visibility: 1, vibration: true, lights: true, lightColor: '#FF2D3D' }); } catch (_) {}
    }
    async function alertUser(ev) {
        var who = ev.senderName || 'A contact', ping = ev.kind === 'ping';
        if (ev.kind === 'message' && muted().indexOf(ev.sender) >= 0) return;
        var go = function () { if (ev.sender && contactById(ev.sender)) goTo(ev.sender).catch(error); else openPlus(); };
        var line = ping ? 'PING \u00B7 tap to open chat' : ev.kind === 'invite' ? 'Invited you to a chat \u00B7 tap to open People' : 'Sent you a message \u00B7 tap to open chat';
        if (window.HzToast) HzToast.show({ icon: ping ? 'hzp-i-ping' : 'i-check', title: ping ? who + ' \u00B7 PING' : who, sub: line, kind: ping ? 'bad' : '', cls: ping ? 'hzp-ping' : '', ms: ping ? 10000 : 5000, onTap: go });
        else host.notice(who + ' \u00B7 ' + line);
        try { if (ping && navigator.vibrate) navigator.vibrate([200, 100, 200]); } catch (_) {}
        try { if (window.HzChime) HzChime(ping); } catch (_) {}
        try {
            if (native()) {
                var plugin = Capacitor.Plugins && Capacitor.Plugins.LocalNotifications;
                if (!plugin && Capacitor.registerPlugin) plugin = Capacitor.registerPlugin('LocalNotifications');
                if (plugin && (await plugin.checkPermissions()).display === 'granted') { await pingChannel(plugin); await plugin.schedule({ notifications: [{ id: Math.floor(ev.ts % 2000000000), title: ping ? '\u2757 ' + who + ' \u00B7 PING' : who, body: ping ? 'PING from ' + who + ' \u2757' : line, channelId: 'horizon_pings_v2', extra: { people: true } }] }); }
            } else if ('Notification' in window && Notification.permission === 'granted') { var note = new Notification(ping ? '\u2757 ' + who + ' \u00B7 PING' : who, { body: line, tag: ev.id }); note.onclick = function () { window.focus(); go(); }; }
        } catch (_) { /* In-app alert still works when OS permission is denied. */ }
    }
    async function pollAlerts() {
        if (watching || !config.watchToken || !config.alertsEnabled || config.watchAccount !== me()) return;
        watching = true; var token = config.watchToken;
        try {
            var r = await fetch(base() + 'alerts?since=' + encodeURIComponent(config.alertCursor || 0), { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
            if (!r.ok) return; var data = await r.json(); if (token !== config.watchToken) return;
            for (var ev of (data.events || [])) { config.alertCursor = Math.max(config.alertCursor || 0, ev.ts); store(); await alertUser(ev); }
        } catch (_) {} finally { watching = false; }
    }
    // Alerts switch on by themselves once you are signed in (no opt-in step). Turning them off is remembered.
    async function enableAlerts() {
        try { await permission(); } catch (_) {}
        selectAlertAccount(me());
        var v = await api('notifications', { enabled: true, includeSenderName: true, deviceToken: config.watchToken || '' });
        config.watchToken = v.watchToken; config.alertCursor = config.alertCursor || v.since; config.alertsEnabled = true; config.alertsOptOut = false; config.pushURL = v.pushURL || ''; store(); pollAlerts();
    }
    function autoAlerts() {
        if (!config.token || !me() || config.alertsOptOut) return;
        if (config.alertsEnabled && config.watchToken && config.watchAccount === me()) { pollAlerts(); return; }
        if (Date.now() - autoAt < 60000) return; autoAt = Date.now();
        enableAlerts().catch(function () {});
    }
    function renderNotifications(parent) {
        parent.append(el('h3', 'Notifications & pings'));
        var on = !!(config.alertsEnabled && config.watchToken);
        parent.append(el('p', on ? 'Alerts ON \u00B7 a ping shows the sender name with a red \u2757' : 'Alerts OFF \u00B7 turn on to see pings', 'hzp-muted'));
        parent.append(el('small', 'Notification-only access stays active after sign-out. It cannot fetch messages, contacts or backups. No message content is placed in alerts. Background push uses an optional ntfy subscription; the push service and lock screen may see sender names.'));
        parent.append(button(on ? 'Refresh notification permission' : 'Turn alerts on', async function () { await enableAlerts(); renderSections(); host.notice('Alerts on. Pings show the sender name with a red \u2757 while Horizon is open.'); }));
        if (on) parent.append(button('Turn alerts off on this device', async function () { await api('notifications', { enabled: false, deviceToken: config.watchToken }); delete config.watchToken; config.alertsEnabled = false; config.alertsOptOut = true; delete config.pushURL; store(); renderSections(); }));
        if (config.pushURL) { var a = el('a', 'Open background push subscription (ntfy)'); a.href = config.pushURL; a.target = '_blank'; a.rel = 'noopener noreferrer'; parent.append(a, el('small', 'Subscribe to this secret topic in the ntfy app for closed-app alerts. Keep the link private. Android battery limits can delay delivery.')); }
    }
    function renderSections() {
        if (!section) return;
        var draft = {}, selected = selections().contacts.slice();
        section.querySelectorAll('[data-hzp-draft]').forEach(function (i) { draft[i.dataset.hzpDraft] = i.value; });
        section.replaceChildren();
        if (!config.token) {
            if (config.alertsEnabled && config.watchToken) { section.append(el('p', 'Notification-only mode \u00B7 sign in to view messages or approve new chats')); section.append(button('Disable signed-out alerts on this device', async function () { var response = await fetch(base() + 'alerts', { method: 'POST', headers: { Authorization: 'Bearer ' + config.watchToken, 'Content-Type': 'application/json' }, body: JSON.stringify({ enabled: false }) }); if (!response.ok) throw new Error('Could not disable alerts. Try again online.'); config.alertsEnabled = false; config.alertsOptOut = true; delete config.watchToken; delete config.pushURL; store(); renderSections(); })); }
            return;
        }
        section.append(nameCard(config.me, true));
        var count = snapshot.requests.filter(function (r) { return r.to === me() && r.status === 'pending'; }).length + snapshot.invitations.length;
        var tabs = row(); tabs.classList.add('hzp-tabs');
        [['contacts', 'Add & preferences' + (count ? ' \u00B7 ' + count : '')], ['sync', 'Synced contacts']].forEach(function (t) {
            var b = button(t[1], function () { tab = t[0]; renderSections(); }); b.className = 'hzp-tab' + (tab === t[0] ? ' on' : ''); b.setAttribute('aria-selected', String(tab === t[0])); tabs.append(b);
        });
        section.append(tabs);
        var body = el('div'); section.append(body);
        if (tab === 'sync') renderSync(body); else { renderNameCard(body); renderAdd(body); renderInvites(body); renderSettings(body); }
        section.querySelectorAll('[data-hzp-draft]').forEach(function (i) { if (Object.prototype.hasOwnProperty.call(draft, i.dataset.hzpDraft)) i.value = draft[i.dataset.hzpDraft]; });
        paintBadge();
    }
    function render() {
        panel.replaceChildren();
        var head = row(); head.append(el('h2', 'People'));
        if (window.HorizonContacts && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) head.append(button('Device contacts', function () { HorizonContacts.open(); }));
        head.append(button('Close', close)); panel.append(head);
        status = el('p', config.token ? 'Connected · ' + config.me.id : 'Enter your number and choose a 4-digit PIN. That is the whole sign-up.'); status.setAttribute('role', 'status'); panel.append(status);
        if (!config.token) {
            var form = el('form'), display = field('Your name · new accounts', 'text', 'Your name'), number = field('Your number with country code', 'tel', '+27821234567'), pin = field('4-digit PIN', 'password', '••••'); display.input.maxLength = 60; display.input.autocomplete = 'name';
            number.input.autocomplete = 'tel'; if (config.defaultId && config.lastNumber) number.input.value = config.lastNumber; pin.input.inputMode = 'numeric'; pin.input.maxLength = 4; pin.input.pattern = '[0-9]{4}'; pin.input.autocomplete = 'off';
            var submit = el('button', 'Connect'); submit.type = 'submit';
            form.append(display.wrap, number.wrap, pin.wrap, el('small', 'New here? This creates your Horizon ID. Back on a new phone? Enter the same number and PIN to get your ID and chats back. There is no PIN reset, so remember it. Messages are stored on the Horizon service and are not end-to-end encrypted.'), submit);
            form.onsubmit = async function (e) { e.preventDefault(); submit.disabled = true; var password = pin.input.value; pin.input.value = ''; try {
                var s = await api('connect', { number: number.input.value, pin: password, name: display.input.value }); password = '';
                selectAlertAccount(s.me.id); config.token = s.token; config.me = s.me;
                if (config.defaultId) { config.lastNumber = number.input.value; if (config.defaultId !== s.me.id) host.notice('Not your default Horizon ID (' + config.defaultId + '). You are now ' + s.me.id, 'error'); }
                if (s.backup && Array.isArray(s.backup.chats)) { host.restore(s.backup.chats.filter(function (c) { return !c.people || c.people.account === s.me.id; })); if (!Object.prototype.hasOwnProperty.call(config, exclusionKey())) config[exclusionKey()] = s.backup.excluded || []; }
                store(); ingest(s); render(); scheduleBackup(); if (config.watchToken) pollAlerts(); autoAlerts();
            } catch (e2) { error(e2); } finally { password = ''; submit.disabled = false; } };
            panel.append(form);
        }
        section = el('div'); panel.append(section); renderSections();
    }
    function open() { render(); panel.hidden = false; panel.querySelector('button').focus(); sync(); }
    function close() { panel.hidden = true; var pb = document.getElementById('peopleBtn'); if (pb) pb.focus(); }
    function init(h) {
        host = h;
        var style = el('style'); style.textContent = '.hzp-panel{position:fixed;inset:5vh max(12px,calc((100vw - 570px)/2));z-index:10050;background:var(--bg,#10121a);color:var(--text,#eee);border:1px solid #68708b;border-radius:20px;padding:20px;overflow:auto;box-shadow:0 20px 90px #000c;font:14px system-ui}.hzp-panel[hidden],.hzp-strip[hidden]{display:none}.hzp-panel h2{font-size:20px;margin:0}.hzp-panel h3{margin:22px 0 10px}.hzp-panel label:not(.hzp-check){display:block;margin:12px 0}.hzp-panel input:not([type=checkbox]){display:block;width:100%;box-sizing:border-box;padding:11px;border:1px solid #68708b;border-radius:10px;margin-top:7px;color:inherit;background:#181d2b}.hzp-panel button,.hzp-strip button,.hzp-reply button{border:1px solid #66729b;background:#232e48;color:#fff;border-radius:10px;padding:9px 12px;cursor:pointer;margin:4px}.hzp-panel button:disabled{opacity:.5}.hzp-panel small{display:block;line-height:1.5;color:#a9b6ce;margin:10px 0}.hzp-panel select{max-width:100%;padding:9px;border:1px solid #68708b;border-radius:9px;background:#181d2b;color:inherit}.hzp-panel a{color:#96bdff}.hzp-check{display:flex;gap:10px;align-items:center;margin:12px 0;line-height:1.5}.hzp-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:10px 0}.hzp-row span{flex:1;min-width:100px;overflow-wrap:anywhere}.hzp-row h2{flex:1}.hzp-strip,.hzp-reply{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:7px 12px;background:#182139;border:1px solid #44577c;color:#dce8ff;border-radius:12px;font:12px system-ui;margin:5px}.hzp-reply{position:relative;z-index:20}.hzp-human{padding:12px 16px;margin:12px 8px;border:1px solid #486d86;border-radius:16px;background:#142730;color:#e4f5ff;white-space:pre-wrap;overflow-wrap:anywhere}.hzp-human strong{display:block;font:12px system-ui;color:#91d5eb;margin-bottom:5px}'; document.head.append(style);
        var extraStyle = el('style'); extraStyle.textContent = '.hzp-launch{display:flex;align-items:center;gap:10px;font:11px system-ui;color:var(--text-muted,#9baabe);padding:2px 6px}.hzp-launch-btn{font:600 12px system-ui;border:1px solid var(--border-color,#44577c);border-radius:12px;padding:7px 14px;background:var(--surface,#182139);color:var(--accent-cyan,#96bdff);cursor:pointer}'; document.head.append(extraStyle);
        var polish = el('style'); polish.textContent = '.hzp-panel{box-sizing:border-box;border-color:var(--border-color,#39465b);max-height:90dvh;padding:20px;padding-bottom:max(24px,env(safe-area-inset-bottom));overscroll-behavior:contain;scrollbar-width:thin}.hzp-panel button{min-height:42px;touch-action:manipulation;max-width:100%;white-space:normal}.hzp-panel button:focus-visible,.hzp-panel summary:focus-visible{outline:2px solid #91ddff;outline-offset:3px}.hzp-panel input[type=checkbox]{width:19px;height:19px;accent-color:#89cfff;flex-shrink:0}.hzp-name-card{padding:18px;border:1px solid #53788d;border-radius:18px;background:linear-gradient(135deg,#1d3a48,#20263b 75%);box-shadow:0 8px 24px #0003;margin:14px 0;overflow:hidden}.hzp-name-card .hzp-row{flex-wrap:nowrap;margin:0 0 12px;gap:14px}.hzp-name-card .hzp-avatar{display:grid;place-items:center;flex:0 0 52px;min-width:52px;height:52px;border-radius:17px;font:600 25px system-ui;background:#a4deec1c;border:1px solid #8dd7ee50;overflow:hidden}.hzp-card-info{min-width:0;flex:1}.hzp-card-info strong{font:650 20px system-ui;overflow-wrap:anywhere}.hzp-card-info p{margin:5px 0;color:#c0d2db;overflow-wrap:anywhere}.hzp-name-card small{font-size:10px;letter-spacing:.07em;margin:0 0 7px;color:#a4c3d4}.hzp-name-card .hzp-copy-id{display:block;width:100%;text-align:left;overflow-wrap:anywhere;background:#08142180;border-color:#7098af70;margin:6px 0 10px;font:600 13px ui-monospace,monospace;letter-spacing:.04em}.hzp-profile{padding:12px;border:1px solid #5b6d8250;border-radius:12px}.hzp-profile summary{cursor:pointer;font-weight:600}.hzp-invite{border-bottom:1px solid #5b6d8240;padding-bottom:8px}.hzp-muted{color:var(--text-muted,#a0afc2);font-size:13px;line-height:1.6}.hzp-row>span>small{margin:4px 0;font-size:11px;overflow-wrap:anywhere}.hzp-launch-btn{display:inline-flex;gap:7px;align-items:center;min-height:36px}.hzp-badge{display:inline-grid;place-items:center;min-width:19px;height:19px;padding:0 3px;box-sizing:border-box;background:#a8e5ff;color:#102130;border-radius:99px;font:700 10px system-ui}.hzp-badge[hidden]{display:none}@media(max-width:380px){.hzp-panel{padding:14px}.hzp-name-card{padding:13px}.hzp-card-info strong{font-size:18px}}'; document.head.append(polish);
        var neon = el('style'); neon.textContent = '.hzp-tabs{position:sticky;top:-20px;z-index:3;background:var(--bg,#10121a);padding:6px 0;margin:6px 0;flex-wrap:nowrap}.hzp-tab{flex:1;font-weight:700}.hzp-panel button.hzp-tab.on{background:#7a2cff;border-color:#c18bff;box-shadow:0 0 12px #7a2cff90}.hzp-contact{border:1px solid #44577c60;border-radius:14px;padding:10px;margin:10px 0}.hzp-contact.blocked{opacity:.65}.hzp-menu summary{list-style:none;cursor:pointer;border:1px solid #66729b;background:#232e48;border-radius:10px;padding:9px 16px;margin:4px;min-height:24px;font-weight:700}.hzp-menu summary::-webkit-details-marker{display:none}.hzp-menu[open]>summary{border-color:#ff5a6a}.hzp-menu-body{display:flex;flex-direction:column;padding:4px 0}.hzp-opts{border:1px solid #44577c60;border-radius:12px;padding:6px 12px;margin:10px 0}.hzp-pop{inset:auto max(12px,calc((100vw - 520px)/2)) 8vh;max-height:80dvh}.hz-tt.hzp-ping{border:1px solid #ff2d3d;box-shadow:0 0 18px #ff2d3d80}.hz-tt.hzp-ping .ic{width:26px;height:26px}.hzp-panel input[type=radio]{display:inline-block!important;width:19px!important;height:19px;margin:0!important;accent-color:#b36bff;flex-shrink:0}.hzp-panel input[type=checkbox]{accent-color:#b36bff}'; document.head.append(neon);
        document.body.insertAdjacentHTML('beforeend', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><symbol id="hzp-i-ping" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10.5" fill="#ff2d3d" stroke="none"/><rect x="10.8" y="5.5" width="2.4" height="8" rx="1.2" fill="#fff" stroke="none"/><circle cx="12" cy="17.6" r="1.5" fill="#fff" stroke="none"/></symbol></svg>');
        panel = el('section', null, 'hzp-panel'); panel.id = 'hzPeoplePanel'; panel.hidden = true; panel.setAttribute('role', 'dialog'); panel.setAttribute('aria-label', 'Horizon People'); panel.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); }); document.body.append(panel);
        var v198 = el('style'); v198.textContent = ".hzp-pills{display:flex;align-items:center;gap:8px;overflow-x:auto;overflow-y:hidden;padding:6px 12px 8px;scrollbar-width:none;overscroll-behavior-x:contain;flex:0 0 auto;min-width:0}.hzp-pills::-webkit-scrollbar{display:none}.hzp-chip{position:relative;flex:0 0 auto;display:flex;align-items:center;gap:7px;height:42px;max-width:150px;padding:0 13px 0 5px;border-radius:999px;border:1px solid var(--border-color,#39465b);background:var(--surface,#182139);color:var(--text,#eee);font:600 12px system-ui;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;margin:0}.hzp-chip.on{border-color:var(--neon,#00e5ff);box-shadow:0 0 10px rgba(var(--neon-rgb,0,229,255),.45)}.hzp-chip .nm{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}.hzp-chip.plus{padding:0 16px;color:var(--accent-cyan,#96bdff)}.hzp-chip.plus .nm{font-size:18px;line-height:1}.hzp-unread{position:absolute;top:2px;left:28px;width:11px;height:11px;border-radius:50%;background:#ff2d3d;border:2px solid var(--bg,#10121a)}.hzp-chip .hzp-badge{position:absolute;top:-4px;right:-4px}.hzp-face{position:relative;flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;clip-path:url(#hzp-shape);background:linear-gradient(135deg,#7a2cff,#00b8d4);color:#fff;font:700 13px system-ui;overflow:hidden}.hzp-face img{width:100%;height:100%;object-fit:cover;display:block}.hzp-face.big{width:68px;height:68px;font-size:26px}.hzp-strip{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;padding:4px 12px;margin:0 12px 4px;background:transparent;border:0;border-radius:14px}.hzp-strip button{margin:0}.hzp-who{display:flex;align-items:center;gap:9px;flex:1;min-width:0}.hzp-who span{display:flex;flex-direction:column;min-width:0}.hzp-who strong{font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hzp-who small{opacity:.75;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hzp-strip button.hzp-i{flex:0 0 auto;width:38px;height:38px;padding:0;border-radius:50%;border:1px solid var(--neon,#00e5ff);background:transparent;color:var(--neon,#00e5ff);font:italic 700 19px Georgia,serif;display:grid;place-items:center}.hzp-back{position:fixed;inset:0;z-index:10070;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center}.hzp-sheet{box-sizing:border-box;width:min(100%,560px);max-height:88dvh;overflow:auto;overscroll-behavior:contain;background:var(--bg,#10121a);color:var(--text,#eee);border:1px solid var(--border-color,#39465b);border-bottom:0;border-radius:22px 22px 0 0;padding:16px 16px max(20px,env(safe-area-inset-bottom));font:14px system-ui}.hzp-sheet h3{margin:18px 0 8px;font-size:12px;letter-spacing:.7px;text-transform:uppercase;opacity:.8}.hzp-sheet button{min-height:42px;border:1px solid #66729b;background:#232e48;color:#fff;border-radius:12px;padding:8px 14px;cursor:pointer;touch-action:manipulation;max-width:100%;white-space:normal;font:inherit}.hzp-sheet button:disabled{opacity:.6}.hzp-sheet button:focus-visible,.hzp-sheet summary:focus-visible{outline:2px solid #91ddff;outline-offset:3px}.hzp-info-head{display:flex;align-items:center;gap:12px}.hzp-info-head div{flex:1;min-width:0}.hzp-info-head strong{display:block;font-size:17px}.hzp-info-head small{display:block;opacity:.75;overflow-wrap:anywhere}.hzp-line{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 4px;border-bottom:1px solid rgba(68,87,124,.35);min-height:44px;cursor:pointer}.hzp-line span{display:flex;flex-direction:column;min-width:0;gap:2px}.hzp-line small{opacity:.7;font-size:11px}.hzp-line input[type=checkbox]{width:22px;height:22px;flex:0 0 auto;accent-color:var(--neon,#00e5ff)}.hzp-seg{display:flex;border:1px solid #66729b;border-radius:14px;overflow:hidden;margin:6px 0}.hzp-seg button{flex:1;border:0;border-radius:0;background:transparent}.hzp-seg button.on{background:#7a2cff;box-shadow:inset 0 0 12px rgba(193,139,255,.4)}.hzp-more summary{cursor:pointer;padding:12px 0;font-weight:700}.hzp-more button{display:block;margin:8px 0}"; document.head.append(v198);
        var v199 = el('style'); v199.textContent = '.hzp-chip.plus{position:sticky;right:0;z-index:2;margin-left:auto;background:var(--surface,#182139);box-shadow:-10px 0 10px var(--bg,#10121a)}.hzp-pills{overflow:visible}.hzp-gpill{flex:1;max-width:none;height:38px;padding:0 14px 0 8px;font-size:12px;border-color:var(--neon,#00e5ff);color:var(--accent-cyan,#96bdff)}.hzp-caret{margin-left:auto}.hzp-gdots{display:flex}.hzp-gdots i{width:20px;height:20px;border-radius:50%;margin-left:-6px;display:grid;place-items:center;font:700 10px system-ui;font-style:normal;background:var(--accent-cyan,#96bdff);color:#06222a;border:2px solid var(--surface,#182139)}.hzp-gdots i:first-child{margin-left:0}.hzp-gpop{position:fixed;left:max(12px,calc((100vw - 420px)/2));right:max(12px,calc((100vw - 420px)/2));z-index:10060;background:var(--surface,#182139);color:var(--text,#eee);border:1px solid var(--border-color,#39465b);border-radius:16px;padding:10px;box-shadow:0 14px 50px #000b;max-height:60dvh;overflow:auto;font:13px system-ui}.hzp-gpop strong{display:block;margin:4px 6px 8px;color:var(--text-muted,#9baabe);font-weight:600}.hzp-gmem{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 0}.hzp-gmem button,.hzp-gpop button{border:1px solid var(--border-color,#39465b);background:#232e48;color:#fff;border-radius:10px;padding:8px 12px;min-height:38px;cursor:pointer}.hzp-gmem button[data-hzp-contact]{flex:1;text-align:left;position:relative}.hzp-gmem input[type=checkbox],.hzp-pickrow input[type=checkbox]{flex:none;margin:0 6px 0 auto;width:22px;height:22px}.hzp-gmem small{margin-left:auto;color:var(--ok,#34d399)}.hzp-dd{border:1px solid #44577c60;border-radius:12px;margin:10px 0;padding:2px 12px}.hzp-dd>summary{cursor:pointer;font-weight:700;padding:11px 0}.hzp-pickrow{flex-wrap:nowrap;gap:10px;margin:2px 0}.hzp-pickname{flex:1;display:flex;align-items:center;gap:10px;text-align:left}.hzp-pickname.on{border-color:var(--neon,#00e5ff)}.hzp-acts{flex-wrap:wrap;margin:0 0 8px}'; document.head.append(v199);
        var v1993 = el('style'); v1993.textContent = '.hzp-panel label.hzp-line{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0}.hzp-line.hzp-ai{justify-content:flex-start;gap:14px;padding:11px 2px}.hzp-line.hzp-ai .hzp-ai-t{flex:1;min-width:0}.hzp-line.hzp-ai strong{font-size:15px}.hzp-panel .hzp-line.hzp-ai small,.hzp-sheet .hzp-line.hzp-ai small{margin:2px 0 0}.hzp-line.hzp-ai input[type=checkbox]{margin:0 2px 0 auto}.hzp-line .hzp-aiic{display:grid!important;place-items:center;flex:0 0 38px;width:38px;height:38px;border-radius:12px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 2px 8px rgba(0,0,0,.4)}.hzp-aiic svg{width:23px;height:23px;display:block}.hzp-gmem .hzp-aiic{display:inline-grid;width:24px;height:24px;border-radius:8px;vertical-align:middle;margin-right:8px}.hzp-gmem .hzp-aiic svg{width:16px;height:16px}.hzp-row .hzp-face{flex:0 0 32px;min-width:32px}.hzp-row .hzp-face.big{flex-basis:68px;min-width:68px}.hzp-cc{display:flex;align-items:center;gap:12px;padding:12px 14px;margin:9px 0;border:1px solid rgba(150,110,255,.38);border-radius:18px;background:linear-gradient(135deg,rgba(122,44,255,.2),rgba(0,184,212,.08) 72%),var(--surface,#182139);box-shadow:0 5px 16px rgba(0,0,0,.3)}.hzp-cc.on{border-color:var(--neon,#00e5ff);box-shadow:0 0 14px rgba(0,229,255,.25)}.hzp-cc.blocked{opacity:.6}.hzp-panel .hzp-cc button.hzp-pickname{flex:1;min-width:0;display:flex;align-items:center;gap:13px;text-align:left;background:none;border:0;padding:0;margin:0;min-height:50px;color:inherit}.hzp-cc .hzp-face{flex:0 0 50px;width:50px;height:50px;font-size:20px}.hzp-cc-info{display:flex;flex-direction:column;flex:1;min-width:0;gap:3px}.hzp-cc-info strong{font:650 16px system-ui;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hzp-panel .hzp-cc-info small{display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;margin:0;font-size:12.5px;line-height:1.35;color:#b9c6dc;letter-spacing:0;overflow-wrap:anywhere}.hzp-cc input[type=checkbox]{flex:0 0 auto;width:24px;height:24px;margin:0}.hzp-mystatus{margin:10px 0 12px;padding:14px;border:1px solid rgba(150,110,255,.38);border-radius:18px;background:linear-gradient(135deg,rgba(122,44,255,.18),rgba(0,184,212,.07) 75%),var(--surface,#182139)}.hzp-ms-head{display:flex;align-items:center;gap:12px;cursor:pointer;list-style:none}.hzp-ms-head::-webkit-details-marker{display:none}.hzp-ms-caret{flex:0 0 auto;color:#b9c6dc;font-size:16px;transition:transform .15s}.hzp-mystatus[open] .hzp-ms-caret{transform:rotate(180deg)}.hzp-mystatus[open] .hzp-ms-head{margin-bottom:10px}.hzp-mystatus{padding:12px 14px}.hzp-ms-t{display:flex;flex-direction:column;min-width:0;flex:1}.hzp-ms-t strong{font:650 16px system-ui}.hzp-panel .hzp-ms-t small{margin:2px 0 0;font-size:12.5px;color:#b9c6dc;overflow-wrap:anywhere}.hzp-mystatus .hzp-face{flex:0 0 46px;width:46px;height:46px;font-size:18px}.hzp-ms-chips{display:flex;flex-wrap:wrap;gap:6px;margin:8px 0 4px}.hzp-panel .hzp-ms-chips button{min-height:34px;padding:6px 12px;margin:0;border-radius:999px;font-size:12px}.hzp-ms-acts{display:flex;gap:8px;margin-top:6px}.hzp-panel .hzp-ms-acts button{flex:1;margin:0}'; document.head.append(v1993);
        var v1994 = el('style'); v1994.textContent = '.hzp-gpop{max-height:72dvh;padding:8px 12px 12px;border-radius:20px}.hzp-gh{display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin:12px 4px 4px;color:var(--text-muted,#9baabe);font:700 11px system-ui;letter-spacing:.09em;text-transform:uppercase}.hzp-gh:first-child{margin-top:6px}.hzp-gh-s{font-weight:500;letter-spacing:.02em;text-transform:none;opacity:.8}.hzp-gm,.hzp-gc{display:flex;align-items:center;gap:11px;padding:8px 10px;margin:6px 0;border:1px solid rgba(150,110,255,.3);border-radius:15px;background:linear-gradient(135deg,rgba(122,44,255,.16),rgba(0,184,212,.06) 75%),rgba(255,255,255,.02)}.hzp-gpop .hzp-face{flex:0 0 40px;width:40px;height:40px;font-size:16px}.hzp-gpop .hzp-aiic{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:13px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 2px 8px rgba(0,0,0,.4)}.hzp-gpop .hzp-aiic svg{width:23px;height:23px;display:block}.hzp-gm-info{display:flex;flex-direction:column;flex:1;min-width:0;gap:1px;text-align:left}.hzp-nm{font:650 15px system-ui;color:var(--text,#eee);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hzp-sb{font:12px system-ui;color:#b9c6dc;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hzp-gm-you{flex:0 0 auto;padding:3px 10px;border-radius:999px;background:rgba(0,229,255,.14);border:1px solid rgba(0,229,255,.45);color:var(--accent-cyan,#7fe8ff);font:700 11px system-ui;letter-spacing:.04em}.hzp-gpop button.hzp-gm-x{flex:0 0 36px;width:36px;height:36px;min-height:36px;padding:0;margin:0;border-radius:50%;font-size:20px;line-height:1;display:grid;place-items:center;background:rgba(255,45,61,.12);border-color:rgba(255,90,106,.55);color:#ff8a94}.hzp-gpop button.hzp-gc-main{position:relative;flex:1;min-width:0;display:flex;align-items:center;gap:11px;padding:0;margin:0;min-height:42px;background:none;border:0;border-radius:0;color:inherit;text-align:left}.hzp-gc input[type=checkbox]{flex:0 0 auto;width:24px;height:24px;margin:0 2px 0 0;accent-color:#b36bff}.hzp-gpop .hzp-unread-r{position:static;margin-left:auto;flex:0 0 auto}.hzp-gpop button.hzp-gfoot{display:block;width:100%;margin:12px 0 0;min-height:44px;background:#7a2cff;border-color:#c18bff;font-weight:700}.hzp-gpop p.hzp-muted{margin:6px 4px;font:12px system-ui;color:#9baabe}'; document.head.append(v1994);
        var v1995 = el('style'); v1995.textContent = '.hzp-launch{gap:10px;padding:0 12px 2px;margin:0;align-items:center}.hzp-launch button.hzp-i{flex:0 0 auto;width:36px;height:36px;padding:0;margin:0;border-radius:50%;border:1px solid var(--neon,#00e5ff);background:rgba(0,229,255,.08);color:var(--neon,#00e5ff);font:italic 700 18px Georgia,serif;display:grid;place-items:center;cursor:pointer;touch-action:manipulation;box-shadow:0 0 10px rgba(0,229,255,.3)}.hzp-launch button.hzp-i[hidden]{display:none}.hzp-info-head{position:sticky;top:0;z-index:4;margin:-16px -16px 8px;padding:14px 16px 10px;background:var(--bg,#10121a);border-bottom:1px solid rgba(68,87,124,.35)}.hzp-info-head .hzp-face{flex:0 0 52px;width:52px;height:52px;font-size:20px}.hzp-sheet button.hzp-close{flex:0 0 40px;width:40px;height:40px;min-height:40px;padding:0;margin:0 0 0 auto;border-radius:50%;display:grid;place-items:center;font-size:16px;line-height:1;background:#232e48;border:1px solid #66729b}.hzp-sheet .hzp-gm .hzp-aiic{display:grid;place-items:center;flex:0 0 40px;width:40px;height:40px;border-radius:13px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2),0 2px 8px rgba(0,0,0,.4)}.hzp-sheet .hzp-gm .hzp-aiic svg{width:23px;height:23px;display:block}.hzp-sheet button.hzp-gm-x{flex:0 0 36px;width:36px;height:36px;min-height:36px;padding:0;margin:0;border-radius:50%;font-size:20px;line-height:1;display:grid;place-items:center;background:rgba(255,45,61,.12);border-color:rgba(255,90,106,.55);color:#ff8a94}.hzp-sheet button.hzp-add{display:block;width:100%;margin:8px 0;border-style:dashed;border-color:#b36bff;color:#d9b8ff;background:rgba(122,44,255,.1);font-weight:700}.hzp-pref{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid rgba(150,110,255,.3);border-radius:14px;background:rgba(122,44,255,.08)}.hzp-pref-t{flex:1;font-size:13px;line-height:1.4;color:#b9c6dc}.hzp-sheet .hzp-pref button{flex:0 0 auto;margin:0;background:#7a2cff;border-color:#c18bff;font-weight:700}.hzp-sheet button.hzp-danger{display:block;width:100%;background:rgba(255,45,61,.12);border-color:rgba(255,90,106,.6);color:#ff8a94;font-weight:700}.hzp-cd{margin:0 0 10px;padding:12px;border:1px solid rgba(150,110,255,.3);border-radius:16px;background:rgba(255,255,255,.03)}.hzp-cd-photo{display:flex;align-items:center;gap:14px}.hzp-cd-photo .hzp-face.big{flex:0 0 64px;width:64px;height:64px;font-size:24px}.hzp-cd-pb{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-width:0}.hzp-cd-acts,.hzp-cd-danger{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0}.hzp-panel .hzp-cd button{margin:0;flex:1 1 auto}.hzp-panel .hzp-cd-danger button{color:#ff8a94;border-color:rgba(255,90,106,.5)}.hzp-panel .hzp-cd-pb small{margin:2px 0;flex-basis:100%}'; document.head.append(v1995);
        var v1996 = el('style'); v1996.textContent = ':root{--hzp-green:#00e5ff}.hzp-launch button.hzp-i,.hzp-strip button.hzp-i{border-color:var(--hzp-green);color:var(--hzp-green);background:rgba(0,229,255,.08);box-shadow:0 0 10px rgba(0,229,255,.35)}.hzp-live{margin:0 12px 6px;padding:7px 12px;border:1px solid rgba(0,229,255,.22);border-radius:14px;background:rgba(255,255,255,.03);font:12px system-ui;color:var(--text-muted,#9baabe);overflow:hidden;position:relative}.hzp-live[hidden]{display:none}.hzp-live-row{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:20px;flex-wrap:wrap}.hzp-clock{font-weight:600;letter-spacing:.02em;white-space:nowrap}.hzp-state{display:inline-flex;align-items:center;gap:7px;color:var(--text,#eee);min-width:0}.hzp-state[hidden]{display:none}.hzp-dots{display:inline-flex;gap:3px}.hzp-dots i{width:6px;height:6px;border-radius:50%;background:var(--hzp-green);opacity:.35;animation:hzpDot 1.2s infinite ease-in-out}.hzp-dots i:nth-child(2){animation-delay:.2s}.hzp-dots i:nth-child(3){animation-delay:.4s}@keyframes hzpDot{0%,80%,100%{opacity:.3;transform:translateY(0)}40%{opacity:1;transform:translateY(-3px)}}.hzp-load{position:absolute;left:0;right:0;top:0;height:2px;opacity:0;transition:opacity .2s;background:linear-gradient(90deg,transparent,var(--hzp-green),transparent);background-size:40% 100%;background-repeat:no-repeat;animation:hzpSlide 1.1s infinite linear}.hzp-load.on{opacity:1}@keyframes hzpSlide{0%{background-position:-60% 0}100%{background-position:160% 0}}.hzp-day{display:flex;align-items:center;gap:10px;margin:14px 8px 4px;color:var(--text-muted,#9baabe);font:600 11px system-ui;letter-spacing:.06em;text-transform:uppercase}.hzp-day:before,.hzp-day:after{content:"";flex:1;height:1px;background:rgba(150,160,190,.25)}.hzp-empty{display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 16px;text-align:center;color:var(--text-muted,#9baabe);font:13px system-ui}.hzp-empty strong{color:var(--text,#eee);font:650 16px system-ui}.hzp-sk{width:100%;max-width:340px;display:flex;flex-direction:column;gap:10px;margin-top:4px}.hzp-sk i{display:block;height:38px;width:68%;border-radius:16px;background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.12) 50%,rgba(255,255,255,.05) 75%);background-size:300% 100%;animation:hzpShimmer 1.4s infinite}.hzp-sk i:nth-child(even){align-self:flex-end;width:55%}@keyframes hzpShimmer{0%{background-position:100% 0}100%{background-position:-100% 0}}.hzp-modes{display:flex;flex-direction:column;gap:8px;margin:8px 0}.hzp-mode{display:flex;align-items:flex-start;gap:12px;padding:12px;border:1px solid rgba(68,87,124,.5);border-radius:14px;background:rgba(255,255,255,.03);cursor:pointer}.hzp-mode.on{border-color:var(--hzp-green);box-shadow:0 0 12px rgba(0,229,255,.25);background:rgba(0,229,255,.06)}.hzp-mode input[type=radio]{accent-color:var(--hzp-green);width:20px;height:20px;margin:2px 0 0;flex:0 0 auto}.hzp-mode-t{display:flex;flex-direction:column;min-width:0;gap:3px}.hzp-mode-t strong{font-size:14px}.hzp-sheet .hzp-mode-t small{font-size:12px;line-height:1.4;color:#b9c6dc;margin:0}@media(prefers-reduced-motion:reduce){.hzp-dots i,.hzp-load,.hzp-sk i{animation:none}}'; document.head.append(v1996);
        var v1997 = el('style'); v1997.textContent = '.hzp-strip button.hzp-ask{border-color:var(--hzp-green);color:var(--hzp-green);background:rgba(0,229,255,.08);font-weight:700;box-shadow:0 0 10px rgba(0,229,255,.3)}.hzp-strip button.hzp-retry{display:inline-flex;align-items:center;gap:6px;white-space:nowrap;border-color:rgba(255,90,106,.6);color:#ff8a94;background:rgba(255,45,61,.1)}'; v1997.textContent += '.hzp-retry-i{display:inline-grid;place-items:center}.hzp-retry-i svg{width:16px;height:16px;display:block}'; document.head.append(v1997);
        var v1998 = el('style'); v1998.textContent = '@property --hzp-a{syntax:"<angle>";initial-value:0deg;inherits:false}@keyframes hzpSpin{to{--hzp-a:360deg}}@keyframes hzpPulse{0%,100%{opacity:.45}50%{opacity:.9}}.hzp-launch{isolation:isolate}.hzp-launch button.hzp-launch-btn{position:relative;border:2px solid transparent;background:linear-gradient(var(--surface,#182139),var(--surface,#182139)) padding-box,conic-gradient(from var(--hzp-a,0deg),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff,#ff2d95) border-box;animation:hzpSpin 3.2s linear infinite}.hzp-launch button.hzp-launch-btn::before{content:"";position:absolute;inset:-3px;border-radius:inherit;background:conic-gradient(from var(--hzp-a,0deg),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff,#ff2d95);filter:blur(10px);z-index:-1;pointer-events:none;animation:hzpSpin 3.2s linear infinite,hzpPulse 2.4s ease-in-out infinite}@media(prefers-reduced-motion:reduce){.hzp-launch button.hzp-launch-btn,.hzp-launch button.hzp-launch-btn::before{animation:none}}'; document.head.append(v1998);
        var v1999 = el('style'); v1999.textContent = '.hzp-launch{--hzp-pill-pull:8px;position:relative;z-index:3;padding-bottom:0;margin-bottom:calc(var(--hzp-pill-pull) * -1)}.hzp-launch button.hzp-i{margin-left:auto}'; document.head.append(v1999);
        var v19910 = el('style'); v19910.textContent = ".hzp-back{overscroll-behavior:contain;touch-action:none}.hzp-sheet{display:block;height:auto;min-height:0;max-height:88vh;max-height:88dvh;overflow-x:hidden;overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;overscroll-behavior:contain;scroll-behavior:auto;padding-top:0;padding-bottom:max(28px,env(safe-area-inset-bottom))}.hzp-sheet .hzp-info-head{position:sticky;top:0;margin:0 -16px 8px;padding-top:16px}.hzp-sheet *{touch-action:pan-y}.hzp-sheet .hzp-mode{touch-action:pan-y}.hzp-aiic[data-hzp-logo]{box-shadow:inset 0 0 0 1px rgba(255,255,255,.18),0 2px 8px rgba(0,0,0,.4)}.hzp-aiic[data-hzp-logo] svg{width:24px;height:24px}"; document.head.append(v19910);
        var v19921 = el('style'); v19921.textContent = ".hzp-reply{display:flex;align-items:center;gap:8px;touch-action:pan-y;user-select:none;-webkit-user-select:none;will-change:transform}.hzp-reply-t{flex:1;min-width:0;font-weight:600}.hzp-reply button.hzp-reply-go{margin:0;border-color:var(--hzp-green,#00e5ff);color:var(--hzp-green,#00e5ff);background:rgba(0,229,255,.1);font-weight:700}.hzp-reply button.hzp-reply-x{margin:0;flex:0 0 34px;width:34px;height:34px;padding:0;border-radius:50%;line-height:1;font-size:15px;display:grid;place-items:center}.hzp-launch button.hzp-i.hzp-opt{width:auto;height:36px;padding:0 16px;margin:0;border-radius:999px;font:700 13px system-ui;font-style:normal;letter-spacing:.2px;display:inline-flex;align-items:center;justify-content:center}.hzp-pills{padding:4px 12px 4px}"; document.head.append(v19921);
        var v19923 = el('style'); v19923.textContent = '.hzp-pulse{display:none;position:relative;flex:0 0 8px;width:8px;height:8px;margin:0 3px;border-radius:50%;background:var(--hzp-green,#00e5ff)}.hzp-pulse::after{content:"";position:absolute;inset:-2px;border-radius:50%;border:2px solid var(--hzp-green,#00e5ff);animation:hzpPing 1.2s infinite ease-out}.hzp-state.connect .hzp-pulse{display:inline-block}.hzp-state.connect .hzp-dots{display:none}@keyframes hzpPing{0%{transform:scale(1);opacity:.9}100%{transform:scale(3);opacity:0}}@media(prefers-reduced-motion:reduce){.hzp-pulse::after{animation:none;opacity:.5}}'; document.head.append(v19923);
        var v19925 = el('style'); v19925.textContent = 'html body .hzp-launch[hidden]{display:none!important}html body .hzp-launch{--hzp-pill-pull:28px}html body .hzp-launch button.hzp-i.hzp-opt,html body button.hz-group-i.hzp-gopt{background:#fff!important;color:#000!important;border:2px solid #00e5ff!important;border-radius:999px!important;height:36px!important;padding:0 16px!important;font:700 13px system-ui!important;font-style:normal!important;letter-spacing:.2px;box-shadow:0 0 10px rgba(0,229,255,.5)!important}html body .hzp-launch button.hzp-i.hzp-opt:active,html body button.hz-group-i.hzp-gopt:active{background:#e6fbff!important}#hzgDock button.hzp-launch-btn,#hzgDock button.hzp-launch-add{position:relative;box-sizing:border-box;height:36px;margin:0;border:2px solid transparent;background:linear-gradient(var(--surface,#182139),var(--surface,#182139)) padding-box,conic-gradient(from var(--hzp-a,0deg),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff,#ff2d95) border-box;animation:hzpSpin 3.2s linear infinite;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent}#hzgDock button.hzp-launch-btn{flex:0 0 auto;padding:0 14px;border-radius:12px;font:600 12px system-ui;color:var(--accent-cyan,#00e5ff)}#hzgDock button.hzp-launch-add{flex:0 0 auto;width:44px;padding:0;border-radius:12px;display:grid;place-items:center;font:600 20px/1 system-ui;color:var(--accent-cyan,#00e5ff)}#hzgDock button.hzp-launch-add .nm{display:block;line-height:1}#hzgDock button.hzp-launch-btn::before,#hzgDock button.hzp-launch-add::before{content:"";position:absolute;inset:-2px;border-radius:inherit;background:conic-gradient(from var(--hzp-a,0deg),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff,#ff2d95);filter:blur(8px);z-index:-1;pointer-events:none;animation:hzpSpin 3.2s linear infinite,hzpPulse 2.4s ease-in-out infinite}#hzgDock button.hzp-launch-btn:active,#hzgDock button.hzp-launch-add:active{transform:scale(.96)}@media(prefers-reduced-motion:reduce){#hzgDock button.hzp-launch-btn,#hzgDock button.hzp-launch-add,#hzgDock button.hzp-launch-btn::before,#hzgDock button.hzp-launch-add::before{animation:none}}'; document.head.append(v19925);
        startInfoSplit();
        document.body.insertAdjacentHTML('beforeend', "<svg width=\"0\" height=\"0\" style=\"position:absolute\" aria-hidden=\"true\"><defs><clipPath id=\"hzp-shape\" clipPathUnits=\"objectBoundingBox\"><path d=\"M0.5,0 C0.86,0 1,0.14 1,0.5 C1,0.86 0.86,1 0.5,1 C0.14,1 0,0.86 0,0.5 C0,0.14 0.14,0 0.5,0 Z\"/></clipPath></defs></svg>");
        pillRow = el('div', null, 'hzp-pills'); pillRow.setAttribute('aria-label', 'Contacts and group');
        strip = el('div', null, 'hzp-strip'); strip.hidden = true;
        var hdr = document.querySelector('.app-header');
        if (hdr && hdr.parentNode) hdr.after(strip); else host.input.parentElement.before(strip);   // V1.99.21: the people pills now sit right above the chat box (see launch row below)
        // V1.99.6: one-to-one live bar (date and time, typing / waiting indicator, loading line) right under the name strip.
        lbLoad = el('div', null, 'hzp-load'); lbClock = el('span', null, 'hzp-clock'); lbText = el('span'); lbState = el('span', null, 'hzp-state'); lbState.hidden = true;
        var dots = el('span', null, 'hzp-dots'); dots.append(el('i'), el('i'), el('i')); lbState.append(el('span', null, 'hzp-pulse'), dots, lbText); lbState.setAttribute('role', 'status'); lbState.setAttribute('aria-live', 'polite');
        var lrow = el('div', null, 'hzp-live-row'); lrow.append(lbClock, lbState);
        liveBar = el('div', null, 'hzp-live'); liveBar.hidden = true; liveBar.append(lbLoad, lrow); strip.after(liveBar);
        // The People pill lives at the bottom, just above the message box, where it always was.
        var launch = el('div', null, 'hzp-launch'), launchBtn = button('People', function () { tab = 'contacts'; open(); }); launchBtn.className = 'hzp-launch-btn'; launchBtn.id = 'peopleBtn'; launchBtn.setAttribute('aria-haspopup', 'dialog');
        iBtn = button('Options', function () { var cc = host.current(); if (cc && cc.people) openInfo(cc); }); iBtn.className = 'hzp-i hzp-opt'; iBtn.hidden = true; iBtn.setAttribute('aria-label', 'Options'); iBtn.title = 'Options: AI replies, rule, AI reply box, leave';
        launchSub = el('span', 'Horizon ID'); launch.append(launchBtn, launchSub, iBtn);   // V1.99.22: Options sits on the right end of the row
        launchRow = launch; launchBtnRef = launchBtn; mountDock();   // V1.99.25: moves People + Horizon ID into the Tools strip as soon as it exists
        var comp = host.input.closest ? host.input.closest('.composer') : null, tgt = comp || host.input.parentElement; tgt.before(pillRow); tgt.before(launch);
        var lastActive = Date.now();
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { lastActive = Date.now(); }, { passive: true, capture: true }); });
        (function loop() { pollTimer = setTimeout(function () { paintStrip(); if ((!document.hidden || bgWanted()) && config.token) sync(); loop(); }, Date.now() - lastActive > 60000 ? 12000 : 3500); })();
        document.addEventListener('visibilitychange', function () { if (!document.hidden) sync(); });
        window.addEventListener('online', sync); paintStrip(); sync();
        setInterval(pollAlerts, 5000); pollAlerts();
    }
    function renderHuman(container, m) { var cur0 = host && host.current && host.current(); if (m.sharedAI && cur0 && cur0.people && cur0.people.hideAI) return; var node = el('div', null, 'message hzp-human'), label = el('strong', (m.sharedAI ? (m.sharedProvider || 'AI') + ' · shared by ' : '') + (m.sender || 'Person')); var stamp = el('small'); HorizonTimes.bind(stamp, m.ts); node.append(label, document.createTextNode(m.text), stamp); node._msg = m;
        var cur = host && host.current && host.current();
        if (m.ts && cur && cur.people && !isGroup(cur)) {
            var seen = container.querySelectorAll ? container.querySelectorAll('.hzp-human') : [], prev = seen.length ? seen[seen.length - 1]._msg : null;
            if (!prev || !prev.ts || dayKey(prev.ts) !== dayKey(m.ts)) container.append(el('div', dayLabel(m.ts), 'hzp-day'));
        }
        container.append(node); }
    window.HorizonPeople = { init: init, dock: mountDock, open: open, send: send, beforeAI: beforeAI, cancelWait: cancelWait, shareAI: shareAI, force: force, scheduleBackup: scheduleBackup, changed: paintStrip, live: paintLive, renderHuman: renderHuman, active: active, go: goTo, info: openInfo };
})();
