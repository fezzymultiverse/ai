/* HORIZON V1.74.0 · PROACTIVE DAEMON.
 * 1. Battery: when the battery falls to your threshold (default 15%) and the phone is not charging, Horizon pauses the music, stops reading aloud
 *    if it was, and drops a banner that says only what it really did.
 * 2. Heat: Android hides real CPU load from apps (since Android 8), so Horizon watches the phone's heat warning instead. Same reaction.
 * 3. Typing help: lots of backspaces in a short time (a cracked screen, ghost touches) and Horizon asks "Need help?". Tap it to talk instead of type.
 * The native half is HorizonDaemonPlugin.kt. It watches while Horizon's process is alive. Settings > Proactive Daemon.
 * What it does NOT do: there is no background sync in Horizon to stop, and it cannot see typing in other apps. */
(function () {
    'use strict';
    var K = { on: 'horizon_daemon_on', pct: 'horizon_daemon_pct', type: 'horizon_daemon_type' };
    var NAME = 'Fezzy';

    // typing help tuning
    var WINDOW_MS = 12000;      // look at the last 12 seconds
    var MIN_DELETES = 8;        // separate backspace taps needed (a held key counts once)
    var MIN_SHARE = 0.4;        // deletes must be at least 40% of all keystrokes
    var TAP_GAP_MS = 90;        // faster than this is a held key, not a tap
    var COOLDOWN_MS = 10 * 60 * 1000;

    function get(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (_) { return d; } }
    function put(k, v) { try { localStorage.setItem(k, String(v)); } catch (_) { /* storage blocked */ } }
    var cfg = {
        on: function () { return get(K.on, '1') === '1'; },
        pct: function () { var n = parseInt(get(K.pct, '15'), 10); return isFinite(n) ? Math.min(50, Math.max(5, n)) : 15; },
        type: function () { return get(K.type, '1') === '1'; }
    };

    function plugin() {
        try {
            var C = window.Capacitor;
            if (!C || typeof C.isNativePlatform !== 'function' || !C.isNativePlatform()) return null;
            if (C.Plugins && C.Plugins.HorizonDaemon) return C.Plugins.HorizonDaemon;
            if (typeof C.registerPlugin === 'function') return C.registerPlugin('HorizonDaemon');
        } catch (_) { /* fall through */ }
        return null;
    }
    function toast(title, sub, bad, onTap) {
        try { if (window.HzToast) HzToast.show({ icon: bad ? 'i-info' : 'i-check', title: title, sub: sub, kind: bad ? 'bad' : '', ms: 9000, onTap: onTap }); } catch (_) { /* a toast must never break anything */ }
    }

    // ---------------------------------------------------------------- what the daemon actually does
    function react() {
        var did = [];
        try { if (window.HorizonMusic && HorizonMusic.pauseNow && HorizonMusic.pauseNow()) did.push('paused the music'); } catch (_) { /* ignore */ }
        try {
            var T = window.HorizonTTS;
            if (T && T.status) { var st = T.status().state; if (st === 'playing' || st === 'loading') { T.stop(); did.push('stopped the voice'); } }
        } catch (_) { /* ignore */ }
        return did;
    }
    function sentence(did) {
        if (!did.length) return '';
        return ' I ' + (did.length > 1 ? did[0] + ' and ' + did[1] : did[0]) + '.';
    }
    function onBattery(ev) {
        var level = ev && isFinite(ev.level) ? ev.level : '?';
        var did = react();
        var text = NAME + ', battery is low (' + level + '%).' + sentence(did) + ' Plug in soon.';
        var p = plugin();
        if (p) p.notify({ kind: 'battery', title: 'Battery low', text: text }).catch(function () { /* the native fallback already covers it */ });
        toast('Battery low', text, true);
    }
    function onHeat() {
        var did = react();
        var text = NAME + ', the phone is running hot.' + sentence(did) + ' Let it cool down.';
        var p = plugin();
        if (p) p.notify({ kind: 'heat', title: 'Phone is hot', text: text }).catch(function () { /* the native fallback already covers it */ });
        toast('Phone is hot', text, true);
    }

    // ---------------------------------------------------------------- start / stop
    var listeners = [], started = false;
    function begin() {
        var p = plugin();
        if (!p || started || !cfg.on()) return;
        started = true;
        try {
            Promise.resolve(p.addListener('batteryLow', onBattery)).then(function (h) { if (h) listeners.push(h); });
            Promise.resolve(p.addListener('thermalHot', onHeat)).then(function (h) { if (h) listeners.push(h); });
        } catch (_) { /* events unavailable: native fallback notifications still fire */ }
        p.start({ threshold: cfg.pct() }).then(paint).catch(function () { started = false; });
    }
    function end() {
        var p = plugin();
        started = false;
        listeners.splice(0).forEach(function (h) { try { h.remove(); } catch (_) { /* ignore */ } });
        if (p) p.stop().then(paint).catch(function () { /* ignore */ });
    }
    function apply() { if (cfg.on()) { if (started) end(); begin(); } else end(); }

    // ---------------------------------------------------------------- typing help
    var keys = [];   // [{ t, del }]
    var lastDel = 0, lastHelp = 0;
    function editable(t) {
        if (!t || !t.tagName) return false;
        var tag = t.tagName.toLowerCase();
        if (tag === 'textarea') return true;
        if (tag === 'input') { var ty = (t.type || 'text').toLowerCase(); return ty === 'text' || ty === 'search' || ty === 'email' || ty === 'url'; }
        return !!t.isContentEditable;
    }
    function offerHelp() {
        lastHelp = Date.now();
        keys = [];
        toast('Need help?', 'Lots of backspaces. Tap to talk instead of type.', false, function () {
            try { if (window.HorizonVoice && !HorizonVoice.recording()) HorizonVoice.toggle(); } catch (_) { /* voice not available */ }
        });
    }
    function onInput(e) {
        if (!cfg.type() || !editable(e.target)) return;
        var t = e.inputType || '';
        var del = t === 'deleteContentBackward';
        if (!del && t.indexOf('insert') !== 0) return;
        var now = Date.now();
        if (del) { if (now - lastDel < TAP_GAP_MS) { lastDel = now; return; } lastDel = now; }   // a held backspace is one tap
        keys.push({ t: now, del: del });
        while (keys.length && now - keys[0].t > WINDOW_MS) keys.shift();
        if (now - lastHelp < COOLDOWN_MS) return;
        var dels = 0;
        for (var i = 0; i < keys.length; i++) if (keys[i].del) dels++;
        if (dels >= MIN_DELETES && dels / keys.length >= MIN_SHARE) offerHelp();
    }
    document.addEventListener('beforeinput', onInput, true);

    // ---------------------------------------------------------------- settings card
    var el = {};
    function $(id) { return document.getElementById(id); }
    function paint() {
        if (!el.on) return;
        el.on.checked = cfg.on();
        el.pct.value = String(cfg.pct());
        el.type.checked = cfg.type();
        var p = plugin();
        if (!p) { el.status.textContent = 'Not running inside the app, so there is nothing to watch.'; el.test.disabled = true; el.heat.disabled = true; return; }
        el.status.textContent = cfg.on() ? 'Watching battery and heat while Horizon is running.' : 'Off';
        p.status().then(function (s) {
            if (!s) return;
            var bits = [cfg.on() ? 'Watching' : 'Off'];
            if (s.level >= 0) bits.push('battery ' + s.level + '%' + (s.charging ? ' (charging)' : ''));
            el.status.textContent = bits.join(' · ');
        }).catch(function () { /* keep the first line */ });
    }
    function wire() {
        el.on = $('dmOn'); el.pct = $('dmPct'); el.type = $('dmType'); el.status = $('dmStatus'); el.test = $('dmTest'); el.heat = $('dmHeat');
        if (!el.on) return;
        el.on.addEventListener('change', function () { put(K.on, el.on.checked ? '1' : '0'); apply(); paint(); });
        el.pct.addEventListener('change', function () { put(K.pct, el.pct.value); if (cfg.on()) apply(); paint(); });
        el.type.addEventListener('change', function () { put(K.type, el.type.checked ? '1' : '0'); });
        el.test.addEventListener('click', function () { var p = plugin(); if (p) p.test({ kind: 'battery' }).catch(function () { toast('Test failed', 'The daemon plugin did not answer.', true); }); });
        el.heat.addEventListener('click', function () { var p = plugin(); if (p) p.test({ kind: 'heat' }).catch(function () { toast('Test failed', 'The daemon plugin did not answer.', true); }); });
        paint();
    }

    function init() { wire(); begin(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
    window.HorizonDaemon = { apply: apply, config: function () { return { on: cfg.on(), pct: cfg.pct(), type: cfg.type() }; } };
})();
