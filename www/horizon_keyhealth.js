/* HORIZON · Key health · V1.99.116
 *
 * One place that remembers which API keys the app has seen fail, so the provider cards and the Vault can show it.
 * - INDICATOR ONLY. Nothing is deleted, nothing is removed. You decide what to remove, in the provider card and in the Vault.
 * - A key is flagged BAD when its provider rejects it (HTTP 401 / 403, "invalid key"). It stays flagged until that same key works again
 *   (or you remove it). Rate limits and out-of-credit are flagged LIMITED and fade after 6 hours.
 * - Scraping keys rotate to the next key by themselves; the flagged key is moved to the back of the line and the indicator tells you it happened.
 * - Keys are never stored here. Each one is kept as a one-way fingerprint (never reversible) plus the last 4 characters, the provider id, the status, the time and the provider's message.
 *
 * Public API: window.HorizonKeyHealth = { mark, get, getByValue, isBad, forget, badCount, list, on, setNotifier, fp, tail, LIMIT_MS }
 */
(function () {
    'use strict';
    var LS = 'horizon_keyhealth_v1';
    var LIMIT_MS = 6 * 3600 * 1000;
    var MAX = 400;
    var store = {};
    var subs = [];
    var notifier = null;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }

    // cyrb53: fast 53-bit one-way hash. Enough to tell keys apart, not reversible to a key.
    function fp(key) {
        var s = String(key == null ? '' : key).trim();
        if (!s) return '';
        var h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
        for (var i = 0; i < s.length; i++) {
            var ch = s.charCodeAt(i);
            h1 = Math.imul(h1 ^ ch, 2654435761);
            h2 = Math.imul(h2 ^ ch, 1597334677);
        }
        h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
        h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
        return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36) + '.' + s.length;
    }
    function tail(key) { return String(key || '').trim().slice(-4); }

    function load() {
        try { var v = JSON.parse(lsGet(LS) || '{}'); store = v && typeof v === 'object' && !Array.isArray(v) ? v : {}; } catch (e) { store = {}; }
    }
    function save() {
        var ks = Object.keys(store);
        if (ks.length > MAX) {
            ks.sort(function (a, b) { return (store[a].t || 0) - (store[b].t || 0); });
            ks.slice(0, ks.length - MAX).forEach(function (k) { delete store[k]; });
        }
        lsSet(LS, JSON.stringify(store));
    }
    function fire() { subs.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a listener must never break a request */ } }); }

    function fresh(rec) {
        if (!rec) return null;
        if (rec.s === 'limited' && Date.now() - (rec.t || 0) > LIMIT_MS) return null;
        return rec;
    }

    // state: 'bad' | 'limited' | 'live'.  opts: { name, msg, status, quiet, note }
    function mark(kind, id, key, state, opts) {
        var f = fp(key);
        if (!f) return null;
        opts = opts || {};
        var prev = fresh(store[f]);
        if (state === 'live') {
            var live = {}; try { live = JSON.parse(lsGet(LS + '_verified') || '{}'); } catch (_) {}
            live[f] = { t: Date.now(), id: id || '' };
            var ids = Object.keys(live).sort(function(a,b){ return live[b].t-live[a].t; });
            ids.slice(MAX).forEach(function(k){ delete live[k]; });
            lsSet(LS + '_verified', JSON.stringify(live));
            if (!store[f]) return null;
            delete store[f]; save(); fire(); return null;
        }
        // a hard rejection is never downgraded by a later soft limit message
        if (prev && prev.s === 'bad' && state === 'limited') return prev;
        var rec = {
            s: state, t: Date.now(), k: kind || 'ai', id: id || '', n: opts.name || (prev && prev.n) || id || '',
            m: String(opts.msg || '').slice(0, 220), h: opts.status || 0, e: tail(key),
            c: (prev && prev.s === state ? (prev.c || 1) + 1 : 1)
        };
        store[f] = rec; save(); fire();
        if (!opts.quiet && notifier && (!prev || prev.s !== state)) {
            try {
                var who = (rec.n || 'A') + ' key ····' + rec.e;
                if (state === 'bad') notifier(who + ' is BAD' + (rec.h ? ' (HTTP ' + rec.h + ')' : '') + '. ' + (opts.note || 'Remove it in the provider card and in the Vault.'), 'error');
                else notifier(who + ' is limited right now. ' + (opts.note || ''), 'error');
            } catch (e) { /* ignore */ }
        }
        return rec;
    }
    function getByValue(key) { var f = fp(key); return f ? fresh(store[f]) : null; }
    function get(kind, id, key) { var r = getByValue(key); return r && (!id || !r.id || r.id === id) ? r : null; }
    function isBad(key) { var r = getByValue(key); return !!r && r.s === 'bad'; }
    function verified(kind, id, key) {
        if (getByValue(key)) return false;
        try { var r = JSON.parse(lsGet(LS + '_verified') || '{}')[fp(key)]; return !!r && (!id || r.id === id) && Date.now() - r.t < 24 * 3600 * 1000; } catch (_) { return false; }
    }
    function forget(key) { var f = fp(key); if (f && store[f]) { delete store[f]; save(); fire(); } }
    function list() { return Object.keys(store).map(function (k) { return fresh(store[k]); }).filter(Boolean); }
    function badCount() { return list().filter(function (r) { return r.s === 'bad'; }).length; }
    function on(fn) { if (typeof fn === 'function') subs.push(fn); }
    function setNotifier(fn) { notifier = typeof fn === 'function' ? fn : null; }

    // Same rule everywhere: what counts as "this key is rejected" in a thrown error.
    var BAD_RE = /\b(?:HTTP\s*)?(?:401|403)\b|invalid[ _-]?(?:api[ _-]?)?key|api[ _-]?key[^.]{0,30}(?:not valid|invalid|expired|revoked|disabled)|incorrect api key|unauthori[sz]ed|authentication (?:failed|error)|key (?:has been )?(?:revoked|disabled|expired)/i;
    var LIMIT_RE = /rate.?limit|quota|exhaust|too many|out of (?:credits?|searches)|insufficient|credit|\b429\b|\b402\b|limit reached/i;
    function classify(e) {
        if (!e || e.stopped) return '';
        var st = Number(e.status) || 0, m = String(e.message || '');
        if (st === 401 || st === 403) return 'bad';
        if (st === 429 || st === 402) return 'limited';
        if (BAD_RE.test(m)) return 'bad';
        if (LIMIT_RE.test(m)) return 'limited';
        return '';
    }
    function ago(ts) {
        var s = (Date.now() - (ts || 0)) / 1000;
        return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago';
    }

    load();
    window.addEventListener('storage', function (ev) { if (ev.key === LS) { load(); fire(); } });
    window.HorizonKeyHealth = { verified: verified, mark: mark, get: get, getByValue: getByValue, isBad: isBad, forget: forget, badCount: badCount, list: list, on: on, setNotifier: setNotifier, classify: classify, ago: ago, fp: fp, tail: tail, LIMIT_MS: LIMIT_MS };
})();
