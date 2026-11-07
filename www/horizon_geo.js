/* Horizon V1.50.0: one shared location helper (window.HzGeo).
   Why: the WebView's own navigator.geolocation never got a real Android permission prompt on some phones,
   so the place tag on your messages and the DASH stayed empty. Inside the app this now asks Android directly
   (HorizonPerms: locationStatus / requestLocation / getLocation). In a plain browser it falls back to
   navigator.geolocation. One request at a time is shared by everything that asks, so there is never a double prompt.
   Result: { lat, lon, acc } or { err: 1 denied | 2 location switched off | 3 no fix | 0 unsupported, why } */
(function () {
    'use strict';
    var inflight = null, last = null, lastAt = 0, FRESH = 5 * 60 * 1000;

    function perms() {
        try {
            var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HorizonPerms;
            return p && typeof p.getLocation === 'function' ? p : null;
        } catch (e) { return null; }
    }
    function code(e) {
        var c = String((e && (e.code || e.message)) || '').toUpperCase();
        if (c.indexOf('DENIED') >= 0) return 1;
        if (c.indexOf('OFF') >= 0) return 2;
        return 3;
    }
    function why(n) {
        return n === 1 ? 'Location is not allowed. Allow it in Android Settings > Apps > Horizon > Permissions > Location'
            : n === 2 ? 'Location is switched off on the phone. Turn Location on in the quick settings'
            : n === 0 ? 'This device has no location'
            : 'No GPS fix yet. Try again with a clear sky or Wi-Fi on';
    }
    function fail(n) { return { err: n, why: why(n) }; }

    function viaNative(p, ask) {
        return Promise.resolve(p.locationStatus ? p.locationStatus() : { granted: false }).then(function (s) {
            if (s && s.granted) return true;
            if (!ask || typeof p.requestLocation !== 'function') return false;
            return Promise.resolve(p.requestLocation()).then(function (r) { return !!(r && r.granted); }, function () { return false; });
        }, function () { return false; }).then(function (ok) {
            if (!ok) return fail(1);
            return Promise.resolve(p.getLocation({ maxAge: 600000, timeout: 14000 })).then(function (r) {
                if (r && typeof r.lat === 'number' && typeof r.lon === 'number') return { lat: r.lat, lon: r.lon, acc: r.acc };
                return fail(3);
            }, function (e) { return fail(code(e)); });
        });
    }
    function viaWeb() {
        return new Promise(function (res) {
            if (!navigator.geolocation) return res(fail(0));
            navigator.geolocation.getCurrentPosition(function (q) { res({ lat: q.coords.latitude, lon: q.coords.longitude, acc: q.coords.accuracy }); },
                function (e) { res(fail(e && e.code === 1 ? 1 : 3)); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
        });
    }

    /* get(ask): ask=true shows the Android permission prompt when it is not granted yet. */
    function get(ask) {
        if (last && Date.now() - lastAt < FRESH) return Promise.resolve(last);
        if (inflight) return inflight;
        var p = perms();
        inflight = (p ? viaNative(p, ask !== false) : viaWeb()).then(function (r) {
            if (r && r.lat != null) { last = r; lastAt = Date.now(); }
            inflight = null; return r;
        }, function () { inflight = null; return fail(3); });
        return inflight;
    }
    /* status(): true granted, false not granted, null unknown (plain browser). Never prompts. */
    function status() {
        var p = perms();
        if (p && typeof p.locationStatus === 'function') {
            return Promise.resolve(p.locationStatus()).then(function (s) { return !!(s && s.granted); }, function () { return null; });
        }
        try {
            if (navigator.permissions && navigator.permissions.query) {
                return navigator.permissions.query({ name: 'geolocation' }).then(function (s) { return s.state === 'granted' ? true : s.state === 'denied' ? false : null; }, function () { return null; });
            }
        } catch (e) { /* unknown */ }
        return Promise.resolve(null);
    }
    function settings() {
        try { var p = window.Capacitor.Plugins.HorizonPerms; if (p && p.openAppSettings) return Promise.resolve(p.openAppSettings()); } catch (e) { /* no plugin */ }
        return Promise.resolve();
    }
    window.HzGeo = { get: get, status: status, why: why, settings: settings, forget: function () { last = null; lastAt = 0; } };
})();
