/* Horizon V1.44.0: the place tag always shows (suburb and city, or why there is none) with a VPN chip beside it.
   Horizon V1.42.1 adds the place tag. V1.42.0: OPERATOR. A name tag on the left of your messages, beside the date and time.
   Rename it or switch it off under Personalisation. Stored only on this device. It watches the chat, so every way a message
   is drawn (new, reloaded, edited) gets the tag without touching the message code. */
(function () {
    'use strict';
    var ON = 'horizon_operator_on', NM = 'horizon_operator_name', DEF = 'Operator', MAX = 24;
    var LON = 'horizon_operator_loc_on', LCA = 'horizon_operator_loc_cache', NS = 'http://www.w3.org/2000/svg';
    var placeName = '', locNote = '', locErr = 0, locBusy = false, locAt = 0, vpn = null;
    function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked */ } }
    function del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, MAX); }
    function enabled() { return rd(ON) !== '0'; }
    function name() { return clean(rd(NM)) || DEF; }
    function locOn() { return rd(LON) !== '0'; }
    try { placeName = clean(JSON.parse(rd(LCA) || '{}').n); } catch (e) { placeName = ''; }

    var feed = document.getElementById('chatMessages');
    var sw = document.getElementById('opSwitch'), input = document.getElementById('opName'),
        reset = document.getElementById('opReset'), status = document.getElementById('opStatus'),
        lsw = document.getElementById('opLocSwitch'), lstat = document.getElementById('opLocStatus');

    function apply() {
        if (!feed) return;
        var on = enabled(), nm = name();
        feed.querySelectorAll('.message.user > .message-meta').forEach(function (meta) {
            var tag = meta.querySelector(':scope > .meta-op');
            if (!on) { if (tag) tag.remove(); return; }
            if (!tag) { tag = document.createElement('span'); tag.className = 'meta-op'; meta.insertBefore(tag, meta.firstChild); }
            if (tag.textContent !== nm) tag.textContent = nm;
        });
        var lon = locOn();
        var liveShown = placeName || (locNote ? (locErr === 1 ? 'Allow location' : locErr === 2 ? 'Location off' : 'No location') : 'Locating\u2026');
        feed.querySelectorAll('.message.user > .message-meta').forEach(function (meta) {
            var wrap = meta.parentNode, stamped = (wrap.dataset && wrap.dataset.place) || '', fresh = !!(wrap.dataset && wrap.dataset.fresh === '1');
            var loc = meta.querySelector(':scope > .meta-loc');
            /* V1.51.0: each message shows the place it was SENT from. Old messages without one show nothing. */
            if (!lon || (!stamped && !fresh)) { if (loc) loc.remove(); return; }
            var shown = stamped || liveShown, isPlace = !!(stamped || placeName), isVpn = stamped ? wrap.dataset.vpn === '1' : vpn === true;
            if (!loc) {
                loc = document.createElement('span'); loc.className = 'meta-loc';
                var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'meta-pin'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
                var pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z');
                svg.appendChild(pth); loc.appendChild(svg);
                var t = document.createElement('span'); t.className = 'meta-loc-t'; loc.appendChild(t);
                meta.appendChild(loc);
            }
            var tx = loc.querySelector('.meta-loc-t');
            if (tx && tx.textContent !== shown) tx.textContent = shown;
            loc.title = (stamped || placeName || locNote || 'Finding your place');
            /* V1.52.0: the VPN chip is gone from message bubbles. Clear any left over. */
            var vc = loc.querySelector('.meta-vpn'); if (vc) vc.remove();
            loc.classList.toggle('none', !isPlace);
        });
    }

    /* Place name: the phone's own GPS (a VPN cannot change it), turned into a suburb name. Rounded to ~1 km before lookup. */
    function snoozed() { return rd('horizon_snooze') === '1'; }
    function getGps(ask) {
        if (window.HzGeo) return window.HzGeo.get(ask !== false);
        return new Promise(function (res) {
            if (!navigator.geolocation) return res({ err: 0 });
            navigator.geolocation.getCurrentPosition(function (p) { res({ lat: p.coords.latitude, lon: p.coords.longitude }); },
                function (e) { res({ err: e && e.code }); }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
        });
    }
    function reverse(lat, lon) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null, to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
        var r2 = function (n) { return Math.round(Number(n) * 100) / 100; };
        return fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + r2(lat) + '&longitude=' + r2(lon) + '&localityLanguage=en', ctl ? { signal: ctl.signal } : {})
            .then(function (r) { clearTimeout(to); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }, function (e) { clearTimeout(to); throw e; })
            .then(function (j) {
                var a = clean(j.locality || ''), b = clean(j.city || '');
                if (a && b && a.toLowerCase() !== b.toLowerCase() && (a + ', ' + b).length <= MAX) return a + ', ' + b;
                return a || b || clean(j.principalSubdivision || j.countryName || '');
            });
    }
    /* VPN: Android's own network state (the same source as the DASH badge). Unknown outside the app, so no chip then. */
    function readVpn() {
        try {
            var p = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HorizonStats;
            if (!p || typeof p.snapshot !== 'function') return;
            Promise.resolve(p.snapshot()).then(function (r) {
                if (r && typeof r.vpn === 'boolean' && r.vpn !== vpn) { vpn = r.vpn; apply(); paint(); }
            }, function () { /* leave it as it was */ });
        } catch (e) { /* no plugin */ }
    }
    function refreshLoc(force) {
        if (!locOn() || locBusy) return;
        if (!force && Date.now() - locAt < 600000) return;
        if (snoozed()) { locNote = 'Snooze is on, showing the last place'; paint(); return; }
        locBusy = true;
        getGps().then(function (g) {
            if (g.lat == null) {
                locErr = g.err == null ? 3 : g.err;
                locNote = g.why || (g.err === 1 ? 'Location is blocked. Allow it in Android Settings > Apps > Horizon > Permissions' : 'No GPS fix yet');
                return null;
            }
            return reverse(g.lat, g.lon).then(function (n) { if (n) { placeName = n; locNote = ''; locErr = 0; wr(LCA, JSON.stringify({ n: n })); } }, function () { locNote = 'Could not look up the place name'; });
        }).then(function () { locBusy = false; locAt = placeName ? Date.now() : Date.now() - 540000; apply(); paint(); }, function () { locBusy = false; });
    }
    function paint(note) {
        var on = enabled();
        if (sw) sw.setAttribute('aria-checked', String(on));
        if (input) { input.disabled = !on; if (document.activeElement !== input) input.value = clean(rd(NM)); }
        if (reset) reset.disabled = !on || !clean(rd(NM));
        if (lsw) lsw.setAttribute('aria-checked', String(locOn()));
        if (lstat) lstat.textContent = locOn() ? (placeName ? 'On. Showing "' + placeName + '" from your phone GPS, VPN or not' + (vpn === true ? ' \u00b7 VPN is on' : vpn === false ? ' \u00b7 no VPN' : '') : 'On. Waiting for your phone location') + (locNote ? ' \u00b7 ' + locNote : '') : 'Off. No place on your messages';
        if (status) status.textContent = (on ? 'On. Your messages show "' + name() + '" beside the date and time' : 'Off. Your messages show only the date and time') + (note ? ' \u00b7 ' + note : '');
    }

    if (sw) sw.addEventListener('click', function (e) { e.stopPropagation(); wr(ON, enabled() ? '0' : '1'); apply(); paint(); });   // stopPropagation: the card header would otherwise collapse the card
    if (input) {
        input.addEventListener('input', function () {
            var v = clean(input.value);
            if (v) wr(NM, v); else del(NM);
            apply(); paint();
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('blur', function () { paint(); });
    }
    if (lsw) lsw.addEventListener('click', function (e) { e.stopPropagation(); wr(LON, locOn() ? '0' : '1'); apply(); paint(); if (locOn()) refreshLoc(true); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden) { if (!placeName && window.HzGeo) window.HzGeo.forget(); refreshLoc(false); readVpn(); } });
    setInterval(function () { if (!document.hidden) readVpn(); }, 15000);
    if (reset) reset.addEventListener('click', function () { del(NM); if (input) input.value = ''; apply(); paint('reset'); });

    /* V1.50.0: tap the place tag. No place yet: ask again (shows the Android prompt). Blocked: open the app's settings page. */
    if (feed) feed.addEventListener('click', function (e) {
        var t = e.target && e.target.closest ? e.target.closest('.message.user .meta-loc') : null;
        if (!t || !t.classList.contains('none')) return;
        if (locErr === 1 && window.HzGeo) { window.HzGeo.settings(); return; }
        if (window.HzGeo) window.HzGeo.forget();
        locNote = ''; locErr = 0; apply(); refreshLoc(true);
    });
    if (feed && window.MutationObserver) new MutationObserver(apply).observe(feed, { childList: true, subtree: true });
    window.HzOperator = { enabled: enabled, name: name, apply: apply, place: function () { return placeName; },
        /* V1.51.0: what to save on a message at the moment it is sent */
        stamp: function () { return locOn() && placeName ? { place: placeName, vpn: vpn === true } : null; } };
    apply();
    paint();
    setTimeout(function () { refreshLoc(true); readVpn(); }, 1500);
})();
