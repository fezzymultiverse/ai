/* Horizon V1.42.1 adds the place tag. V1.42.0: OPERATOR. A name tag on the left of your messages, beside the date and time.
   Rename it or switch it off under Personalisation. Stored only on this device. It watches the chat, so every way a message
   is drawn (new, reloaded, edited) gets the tag without touching the message code. */
(function () {
    'use strict';
    var ON = 'horizon_operator_on', NM = 'horizon_operator_name', DEF = 'Operator', MAX = 24;
    var LON = 'horizon_operator_loc_on', LCA = 'horizon_operator_loc_cache', NS = 'http://www.w3.org/2000/svg';
    var placeName = '', locNote = '', locBusy = false, locAt = 0;
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
        var lon = locOn() && placeName;
        feed.querySelectorAll('.message.user > .message-meta').forEach(function (meta) {
            var loc = meta.querySelector(':scope > .meta-loc');
            if (!lon) { if (loc) loc.remove(); return; }
            if (!loc) {
                loc = document.createElement('span'); loc.className = 'meta-loc';
                var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'meta-pin'); svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
                var pth = document.createElementNS(NS, 'path'); pth.setAttribute('d', 'M12 2a7 7 0 0 0-7 7c0 5.2 7 13 7 13s7-7.8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z');
                svg.appendChild(pth); loc.appendChild(svg);
                var t = document.createElement('span'); t.className = 'meta-loc-t'; loc.appendChild(t);
                meta.appendChild(loc);
            }
            var tx = loc.querySelector('.meta-loc-t');
            if (tx && tx.textContent !== placeName) tx.textContent = placeName;
            loc.title = placeName;
        });
    }

    /* Place name: the phone's own GPS (a VPN cannot change it), turned into a suburb name. Rounded to ~1 km before lookup. */
    function snoozed() { return rd('horizon_snooze') === '1'; }
    function getGps() {
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
            .then(function (j) { return clean(j.locality || j.city || j.principalSubdivision || j.countryName || ''); });
    }
    function refreshLoc(force) {
        if (!locOn() || locBusy) return;
        if (!force && Date.now() - locAt < 600000) return;
        if (snoozed()) { locNote = 'Snooze is on, showing the last place'; paint(); return; }
        locBusy = true;
        getGps().then(function (g) {
            if (g.lat == null) {
                locNote = g.err === 1 ? 'Location is blocked. Allow it in Android Settings > Apps > Horizon > Permissions' : 'No GPS fix yet';
                return null;
            }
            return reverse(g.lat, g.lon).then(function (n) { if (n) { placeName = n; locNote = ''; wr(LCA, JSON.stringify({ n: n })); } }, function () { locNote = 'Could not look up the place name'; });
        }).then(function () { locBusy = false; locAt = Date.now(); apply(); paint(); }, function () { locBusy = false; });
    }
    function paint(note) {
        var on = enabled();
        if (sw) sw.setAttribute('aria-checked', String(on));
        if (input) { input.disabled = !on; if (document.activeElement !== input) input.value = clean(rd(NM)); }
        if (reset) reset.disabled = !on || !clean(rd(NM));
        if (lsw) lsw.setAttribute('aria-checked', String(locOn()));
        if (lstat) lstat.textContent = locOn() ? (placeName ? 'On. Showing "' + placeName + '" from your phone GPS, VPN or not' : 'On. Waiting for your phone location') + (locNote ? ' \u00b7 ' + locNote : '') : 'Off. No place on your messages';
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
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshLoc(false); });
    if (reset) reset.addEventListener('click', function () { del(NM); if (input) input.value = ''; apply(); paint('reset'); });

    if (feed && window.MutationObserver) new MutationObserver(apply).observe(feed, { childList: true, subtree: true });
    window.HzOperator = { enabled: enabled, name: name, apply: apply, place: function () { return placeName; } };
    apply();
    paint();
    setTimeout(function () { refreshLoc(true); }, 1500);
})();
