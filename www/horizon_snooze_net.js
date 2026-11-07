/* V1.24.0: network gate for SNOOZE. Loads first so nothing can reach the network while snoozed.
   Local targets (this app, localhost, blob:, data:) stay allowed. */
(function () {
    'use strict';
    var KEY = 'horizon_snooze';
    function snoozed() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
    function local(u) {
        try {
            var url = new URL(String(u && u.url ? u.url : u), location.href);
            if (/^(blob:|data:|file:|capacitor:|about:)/.test(url.protocol)) return true;
            if (url.origin === location.origin) return true;
            return /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname);
        } catch (e) { return true; }
    }
    function err() { var e = new TypeError('Horizon is snoozed. Wake it to use the network.'); e.snoozed = true; return e; }
    window.__hzSnoozed = snoozed;

    function gate(f) {
        return function (input, init) {
            if (snoozed() && !local(input)) return Promise.reject(err());
            return f.call(this, input, init);
        };
    }
    // Capacitor may swap window.fetch after this file loads, so every assignment is wrapped again.
    var cur = window.fetch ? gate(window.fetch) : undefined;
    try {
        Object.defineProperty(window, 'fetch', {
            configurable: true, enumerable: true,
            get: function () { return cur; },
            set: function (v) { cur = typeof v === 'function' ? gate(v) : v; }
        });
    } catch (e) { if (window.fetch) window.fetch = cur; }
    var xo = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (m, u) {
        if (snoozed() && !local(u)) { this.__hzBlock = true; }
        return xo.apply(this, arguments);
    };
    var xs = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function () {
        if (this.__hzBlock && snoozed()) {
            var x = this; setTimeout(function () { try { x.dispatchEvent(new Event('error')); } catch (e) { /* ignore */ } }, 0); return;
        }
        return xs.apply(this, arguments);
    };
    if (window.WebSocket) {
        var WS = window.WebSocket;
        window.WebSocket = function (u, p) { if (snoozed() && !local(u.replace(/^ws/, 'http'))) throw err(); return p === undefined ? new WS(u) : new WS(u, p); };
        window.WebSocket.prototype = WS.prototype;
        ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k) { window.WebSocket[k] = WS[k]; });
    }
    if (navigator.sendBeacon) {
        var sb = navigator.sendBeacon.bind(navigator);
        navigator.sendBeacon = function (u, d) { return snoozed() && !local(u) ? false : sb(u, d); };
    }
})();
