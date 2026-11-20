/* HORIZON · Auto Router · V1.99.162
 *
 * Picks the provider AND the key for each message, and moves to the next one when a call fails.
 * - Runs only inside Horizon. Keys never leave the phone and are never stored here (only a one-way fingerprint + last 4).
 * - AUTO (default): rank every ready provider, try the best key, on failure cool that key down and try the next one (max 4 tries).
 *   PINNED: Auto stays out of it; the provider you picked answers, like before.
 * - Honest: the reply is always labelled with the provider that really answered. Nothing is swapped silently.
 * - Cooldowns: a rate-limited or failing key rests for a while, then is tried again by itself. A rejected key (401/403) rests 24 h.
 *
 * Public API (window.HorizonRouter): enabled, mode, setMode, freeOn, setFree, isOff, setOff, plan, report, sticky,
 *   snapshot, resetCooldowns, cooldownText, render, _state (for tests)
 */
(function (root) {
    'use strict';
    var LS = 'horizon_router_v1';
    var MIN = 60000, HOUR = 3600000;
    // Strength tiers (0-100). Hard tasks lean on these; chit-chat leans on measured speed. Unknown providers get 40.
    var TIER = {
        gemini: 100, mistral: 76, groq: 72, cohere: 66, zai: 62, zro: 60, openrouter: 60, kilo: 56, gonka: 55, gonkabroker: 55, agnes: 55,
        tokenharbor: 50, requesty: 50, routeway: 50, typhoon: 46, unorouter: 45, ovh: 45, cloudflare: 45, aionlabs: 45, hzworker: 40,
        llm7: 35, freeai: 30, chatat: 30, blockrun: 30, pollinations: 30, mlvoca: 10, aihorde: 10
    };
    var NAMES = {};
    var st = load();

    function lsGet(k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } }
    function lsSet(k, v) { try { root.localStorage.setItem(k, v); } catch (_) { /* storage blocked */ } }
    function blank() { return { mode: 'auto', free: false, off: {}, cool: {}, coolN: {}, stat: {}, sticky: {}, use: {} }; }
    function load() {
        var o = blank();
        try { var v = JSON.parse(lsGet(LS) || 'null'); if (v && typeof v === 'object') Object.keys(o).forEach(function (k) { if (v[k] !== undefined && v[k] !== null) o[k] = v[k]; }); } catch (_) { /* start clean */ }
        if (o.mode !== 'pin') o.mode = 'auto';
        return o;
    }
    function save() {
        // keep it small: forget expired cooldowns and old sticky chats
        var now = Date.now();
        Object.keys(st.cool).forEach(function (k) { if (st.cool[k] <= now) delete st.cool[k]; });
        var sk = Object.keys(st.sticky); if (sk.length > 60) sk.slice(0, sk.length - 60).forEach(function (k) { delete st.sticky[k]; });
        lsSet(LS, JSON.stringify(st));
    }
    function fp(key) {
        var KH = root.HorizonKeyHealth;
        if (KH && KH.fp) { try { return KH.fp(key); } catch (_) { /* fall through */ } }
        var s = String(key || ''), h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'r' + (h >>> 0).toString(36);
    }
    function tail(key) { var s = String(key || ''); return key === 'free' ? 'no key' : (s.length > 12 ? '••••' + s.slice(-4) : s.replace(/^https:\/\//, '').replace(/\.workers\.dev$/, '')); }
    var ck = function (id, key) { return id + '|' + fp(key); };

    function enabled() { return st.mode === 'auto'; }
    function mode() { return st.mode; }
    function setMode(m) { st.mode = m === 'pin' ? 'pin' : 'auto'; save(); }
    function freeOn() { return !!st.free; }
    function setFree(v) { st.free = !!v; save(); }
    function isOff(id) { return !!st.off[id]; }
    function setOff(id, v) { if (v) st.off[id] = 1; else delete st.off[id]; save(); }
    function sticky(chatId, id) { if (id === undefined) return st.sticky[chatId] || ''; st.sticky[chatId] = id; save(); return id; }

    function isCool(id, key) { var u = st.cool[ck(id, key)]; return !!u && u > Date.now(); }
    function coolLeft(id, key) { var u = st.cool[ck(id, key)]; return u && u > Date.now() ? u - Date.now() : 0; }
    function recentFails(id) {
        var s = st.stat[id]; if (!s || !s.f) return 0;
        var cut = Date.now() - 15 * MIN; s.f = s.f.filter(function (t) { return t > cut; }); return s.f.length;
    }
    function score(id, o) {
        var s = st.stat[id] || {}, tier = TIER[id] == null ? 40 : TIER[id];
        var speed = s.ms ? Math.max(0, Math.min(100, 100 - s.ms / 250)) : 50;
        var v = o.hard ? tier + speed * 0.1 : tier * 0.4 + speed * 0.6;
        v -= recentFails(id) * 25;
        if (id === o.activeId) v += 20;
        if (o.chatId && st.sticky[o.chatId] === id) v += 25;
        return v;
    }
    /* plan({providers:[{id, keys:[...], model}], hard, activeId, chatId, max}) -> [{id, key, model, score}] in the order to try.
       Keys of the same provider stay together, so a second key (maybe another account) is tried before another provider. */
    function plan(o) {
        o = o || {};
        var rows = (o.providers || []).filter(function (p) { return p && p.id && p.model && !st.off[p.id] && p.keys && p.keys.length; });
        rows.forEach(function (p) { p._s = score(p.id, o); });
        rows.sort(function (a, b) { return b._s - a._s; });
        var KH = root.HorizonKeyHealth, out = [], max = o.max || 4;
        rows.forEach(function (p) {
            var usable = p.keys.filter(function (k) { return !isCool(p.id, k) && !(KH && k !== 'free' && KH.isBad && KH.isBad(k)); });
            // spread load over equal keys: the least-used key first (stable on ties)
            usable = usable.map(function (k, i) { return { k: k, i: i, n: st.use[ck(p.id, k)] || 0 }; }).sort(function (a, b) { return a.n - b.n || a.i - b.i; });
            usable.slice(0, 3).forEach(function (u) { out.push({ id: p.id, key: u.k, model: p.model, score: p._s }); });
        });
        return out.slice(0, max);
    }
    function parseWait(msg) {
        var m = /(?:retry|try again)[^0-9]{0,20}([\d.]+)\s*(ms|s|sec|seconds|m|min|minutes|h|hours?)?/i.exec(msg || '');
        if (!m) return 0; var n = parseFloat(m[1]) || 0, u = (m[2] || 's').toLowerCase();
        return Math.round(n * (u === 'ms' ? 1 : /^m/.test(u) && u !== 'ms' ? 60000 : /^h/.test(u) ? HOUR : 1000));
    }
    function coolFor(id, key, e) {
        var s = Number(e && e.status) || 0, m = String(e && e.message || ''), now = Date.now(), k = ck(id, key);
        var n = st.coolN[k] && now - st.coolN[k].t < 30 * MIN ? st.coolN[k].n + 1 : 1;
        st.coolN[k] = { n: n, t: now };
        var ms, why;
        if (s === 401 || s === 403 || /invalid[ _-]?(?:api[ _-]?)?key|unauthori[sz]ed|incorrect api key/i.test(m)) { ms = 24 * HOUR; why = 'key rejected'; }
        else if (/per day|daily|quota.{0,40}(?:day|exceeded)|RPD|neuron|insufficient|credit|out of/i.test(m) && (s === 429 || s === 402 || /quota|neuron|credit/i.test(m))) { ms = 4 * HOUR; why = 'daily quota'; }
        else if (s === 429 || s === 402 || /rate.?limit|too many|quota/i.test(m)) { ms = [2, 10, 45][Math.min(n, 3) - 1] * MIN; why = 'rate limit'; }
        else if (s === 404) { ms = [10, 60][Math.min(n, 2) - 1] * MIN; why = 'not found (model or path)'; }
        else if (s >= 500 || s === 504 || /timed out|abort|network|failed to fetch/i.test(m)) { ms = [1, 5, 20][Math.min(n, 3) - 1] * MIN; why = 'down or slow'; }
        else { ms = [1, 5, 15][Math.min(n, 3) - 1] * MIN; why = 'failed'; }
        var w = parseWait(m); if (w > 0 && w < 6 * HOUR && ms < 6 * HOUR) ms = Math.max(Math.min(ms, 15 * MIN), w + 2000);
        st.cool[k] = now + ms; return { ms: ms, why: why };
    }
    /* report(id, key, ok, ms, err, chatId) -> null on success, or {ms, why} when the key was put to rest */
    function report(id, key, ok, ms, err, chatId) {
        var s = st.stat[id] || (st.stat[id] = { ok: 0, fail: 0, ms: 0, f: [] });
        var k = ck(id, key); st.use[k] = (st.use[k] || 0) + 1;
        var res = null;
        if (ok) {
            s.ok++; s.ms = s.ms ? Math.round(s.ms * 0.7 + ms * 0.3) : Math.round(ms);
            delete st.cool[k]; delete st.coolN[k]; if (chatId) st.sticky[chatId] = id;
        } else if (!(err && (err.stopped || err.skipped))) {
            s.fail++; s.f = (s.f || []).concat(Date.now()).slice(-10); res = coolFor(id, key, err);
        }
        save(); return res;
    }
    function cooldownText(ms) {
        if (!ms || ms < 1000) return 'now';
        var m = Math.ceil(ms / 60000); if (m < 60) return m + ' min';
        var h = Math.floor(m / 60), r = m % 60; return h + ' h' + (r ? ' ' + r + ' min' : '');
    }
    function resetCooldowns() { st.cool = {}; st.coolN = {}; st.stat = {}; save(); }

    /* snapshot(providers:[{id,name,keys:[...],model}]) -> rows for the Pool screen */
    function snapshot(providers) {
        var KH = root.HorizonKeyHealth;
        return (providers || []).map(function (p) {
            var s = st.stat[p.id] || {};
            return {
                id: p.id, name: p.name || p.id, model: p.model || '', off: !!st.off[p.id], tier: TIER[p.id] == null ? 40 : TIER[p.id],
                ms: s.ms || 0, ok: s.ok || 0, fail: s.fail || 0, recent: recentFails(p.id),
                keys: (p.keys || []).map(function (k) {
                    var bad = !!(KH && k !== 'free' && KH.isBad && KH.isBad(k)), left = coolLeft(p.id, k);
                    return { tail: tail(k), state: bad ? 'bad' : left ? 'rest' : 'ready', left: left, uses: st.use[ck(p.id, k)] || 0 };
                })
            };
        });
    }

    /* ---------- Pool screen ---------- */
    function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function render(rootEl, host) {
        if (!rootEl) return;
        rootEl.textContent = '';
        var box = el('div', 'hzr');
        var info = el('p', 'hzr-note', 'Auto picks the provider and key for every message and moves on by itself when one fails or hits a limit. Your keys stay on this phone.');
        box.append(info);
        var seg = el('div', 'hzr-seg');
        [['auto', 'AUTO'], ['pin', 'PINNED']].forEach(function (m) {
            var b = el('button', 'hzr-btn' + (st.mode === m[0] ? ' on' : ''), m[1]); b.type = 'button';
            b.onclick = function () { setMode(m[0]); render(rootEl, host); if (host && host.notice) host.notice(m[0] === 'auto' ? 'Auto router on' : 'Pinned: only the AI you picked answers'); };
            seg.append(b);
        });
        box.append(seg);
        box.append(el('p', 'hzr-note', st.mode === 'auto' ? 'Auto: the best ready provider answers. The one you picked in the AI sheet gets a small preference.' : 'Pinned: no switching. The provider you picked answers, like before.'));
        var fr = el('label', 'hzr-row'); var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!st.free;
        cb.onchange = function () { setFree(cb.checked); };
        fr.append(cb, el('span', null, 'Also use free providers that need no key (weaker, can be wrong)')); box.append(fr);
        var rows = snapshot(host && host.providers ? host.providers() : []);
        if (!rows.length) box.append(el('p', 'hzr-note', 'No ready providers yet. Add keys under API PROVIDERS PLUS KEYS, then tap Save & validate on each.'));
        rows.sort(function (a, b) { return b.tier - a.tier; });
        rows.forEach(function (r) {
            var card = el('div', 'hzr-card' + (r.off ? ' off' : ''));
            var head = el('div', 'hzr-head');
            var lab = el('label', 'hzr-name'); var c2 = document.createElement('input'); c2.type = 'checkbox'; c2.checked = !r.off;
            c2.onchange = function () { setOff(r.id, !c2.checked); render(rootEl, host); };
            lab.append(c2, el('b', null, r.name)); head.append(lab);
            head.append(el('span', 'hzr-meta', (r.ms ? (r.ms / 1000).toFixed(1) + 's avg' : 'not used yet') + ' · ' + r.ok + ' ok · ' + r.fail + ' failed'));
            card.append(head, el('div', 'hzr-model', r.model));
            r.keys.forEach(function (k) {
                var row = el('div', 'hzr-key ' + k.state);
                row.append(el('i', 'hzr-dot'), el('span', 'hzr-tail', k.tail),
                    el('span', 'hzr-st', k.state === 'bad' ? 'REJECTED' : k.state === 'rest' ? 'resting ' + cooldownText(k.left) : 'READY'),
                    el('span', 'hzr-use', k.uses + ' used'));
                card.append(row);
            });
            box.append(card);
        });
        var rs = el('button', 'hzr-btn hzr-reset', 'Clear all cooldowns and stats'); rs.type = 'button';
        rs.onclick = function () { resetCooldowns(); render(rootEl, host); if (host && host.notice) host.notice('Cooldowns cleared'); };
        box.append(rs);
        rootEl.append(box);
    }

    root.HorizonRouter = Object.freeze({
        enabled: enabled, mode: mode, setMode: setMode, freeOn: freeOn, setFree: setFree, isOff: isOff, setOff: setOff, plan: plan, report: report,
        sticky: sticky, snapshot: snapshot, resetCooldowns: resetCooldowns, cooldownText: cooldownText, render: render, TIER: TIER,
        _state: function () { return st; }, _reload: function () { st = load(); }
    });
})(typeof window !== 'undefined' ? window : globalThis);
