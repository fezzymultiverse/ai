/* V1.24.0: SNOOZE. Like airplane mode for Horizon: network off, access permissions off, 4 AIs asleep.
   Waking restores every permission to what it was before snoozing. */
(function () {
    'use strict';
    var KEY = 'horizon_snooze', SNAP = 'horizon_snooze_snap';
    var AIS = [
        { id: 'gemini', name: 'Gemini' }, { id: 'groq', name: 'Groq' },
        { id: 'cohere', name: 'Cohere' }, { id: 'pollinations', name: 'Pollinations' }
    ];
    var NS = 'http://www.w3.org/2000/svg';
    var btn = document.getElementById('snoozeBtn'), bar = document.getElementById('hzSnoozeBar');
    var chatMessages = document.getElementById('chatMessages'), chatInput = document.getElementById('chatInput');
    var sendBtn = document.getElementById('sendBtn'), brandSub = document.querySelector('.brand span');
    if (!btn) return;
    var busy = false, origBrand = brandSub ? brandSub.textContent : '', origPh = chatInput ? chatInput.placeholder : '';

    function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
    function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
    function isOn() { return ls(KEY) === '1'; }
    function toast(t) {
        var el = document.createElement('div'); el.className = 'hz-toast'; el.textContent = t; document.body.appendChild(el);
        setTimeout(function () { el.remove(); }, 2600);
    }

    function logo(id) {
        var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'hz-sz-logo'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
        var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#i-b-' + id); s.appendChild(u); return s;
    }
    function dash() {
        var d = document.createElement('div'); d.className = 'hz-sz-dash'; d.id = 'hzSzDash';
        d.setAttribute('role', 'group'); d.setAttribute('aria-label', 'AI providers are asleep');
        var h = document.createElement('b'); h.textContent = 'AI TEAM · ASLEEP'; d.appendChild(h);
        var row = document.createElement('div'); row.className = 'hz-sz-row';
        AIS.forEach(function (a) {
            var c = document.createElement('div'); c.className = 'hz-sz-ai';
            var z1 = document.createElement('i'); z1.textContent = '💤'; z1.setAttribute('aria-hidden', 'true');
            var z2 = document.createElement('i'); z2.textContent = '💤'; z2.setAttribute('aria-hidden', 'true');
            var n = document.createElement('span'); n.className = 'nm'; n.textContent = a.name;
            c.appendChild(logo(a.id)); c.appendChild(z1); c.appendChild(z2); c.appendChild(n); row.appendChild(c);
        });
        d.appendChild(row); return d;
    }

    var wl = { h: null, sub: null };
    function paintWelcome() {
        var w = chatMessages && chatMessages.querySelector('.welcome');
        if (bar) bar.classList.toggle('is-hidden', !!w);
        if (!w) return;
        var h = w.querySelector('h2'), sub = w.querySelector('.wl-sub'), old = w.querySelector('#hzSzDash');
        if (isOn()) {
            if (h) { if (wl.h == null) wl.h = h.textContent; h.textContent = 'Horizon Offline'; }
            if (sub) { if (wl.sub == null) wl.sub = sub.textContent; sub.textContent = 'Snoozed. Network and permissions are off.'; }
            if (!old) w.appendChild(dash());
        } else {
            if (old) old.remove();
            if (h && wl.h != null) h.textContent = wl.h;
            if (sub && wl.sub != null) sub.textContent = wl.sub;
        }
    }

    function paint() {
        var on = isOn();
        document.documentElement.classList.toggle('hz-snoozed', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.setAttribute('aria-label', on ? 'Snoozed. Tap to wake Horizon' : 'Snooze: turn network and permissions off');
        if (brandSub) brandSub.textContent = on ? 'OFFLINE' : origBrand;
        if (chatInput) chatInput.placeholder = on ? 'Snoozed. Tap the moon to wake' : origPh;
        paintWelcome();
    }

    async function snooze() {
        var snap = {}, P = window.HzPerms;
        if (P) {
            P.list.forEach(function (p) { if (!p.unsupported && p.id !== 'battery') snap[p.id] = P.state[p.id] === true; });
            lsSet(SNAP, JSON.stringify(snap));
        }
        lsSet(KEY, '1');
        document.querySelectorAll('audio, video').forEach(function (m) { try { m.pause(); } catch (e) { /* ignore */ } });
        if (P) {
            for (var i = 0; i < P.list.length; i++) {
                var p = P.list[i];
                if (p.unsupported || p.id === 'battery' || snap[p.id] !== true) continue;
                try { await p.off(); } catch (e) { /* keep going */ }
            }
            P.refresh();
        }
    }
    async function wake() {
        lsDel(KEY);
        var P = window.HzPerms, snap = {};
        try { snap = JSON.parse(ls(SNAP) || '{}') || {}; } catch (e) { snap = {}; }
        lsDel(SNAP);
        if (P) {
            for (var i = 0; i < P.list.length; i++) {
                var p = P.list[i];
                if (p.unsupported || p.id === 'battery' || snap[p.id] !== true) continue;
                try { await p.on(); } catch (e) { /* the Permissions page shows what still needs a tap */ }
            }
            P.refresh();
        }
    }

    btn.addEventListener('click', async function () {
        if (busy) return;
        busy = true; btn.disabled = true;
        var turningOn = !isOn();
        try { if (turningOn) await snooze(); else await wake(); } finally { busy = false; btn.disabled = false; }
        paint();
        toast(turningOn ? '💤 Horizon is snoozed. Offline, permissions off.' : 'Horizon is awake. Permissions restored.');
    });
    if (bar) bar.addEventListener('click', function () { btn.click(); });

    function block(e) {
        if (!isOn()) return;
        e.preventDefault(); e.stopImmediatePropagation();
        toast('💤 Horizon is snoozed. Tap the moon to wake.');
    }
    if (sendBtn) sendBtn.addEventListener('click', block, true);
    if (chatInput) chatInput.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) block(e); }, true);

    if (chatMessages) new MutationObserver(function () { if (isOn() || chatMessages.querySelector('#hzSzDash')) paintWelcome(); }).observe(chatMessages, { childList: true });
    paint();
})();
