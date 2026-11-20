/* Horizon V1.99.48: HORIZON RADIO.
   An old-time radio widget docked above the weather card in the Menu, with its own player.
   - Say where you are (country, town or station name) and it scans the world's live stations from the open
     radio-browser.info directory, then lists what is on the air. Frequencies are READ FROM THE STATION NAME
     (most internet stations have none, those show as NET). Nothing is invented.
   - Own player: one HTMLAudio element, https first, three connection attempts, auto-reconnect when a stream drops.
   - Speaker + wave: real signal analysis when the station allows it, an honest simulated wave when it does not (labelled).
   - The AI drives it with [[radio.find: place]] [[radio.play: n or name]] [[radio.stop: now]] [[radio.vol: 0-100]] [[radio.now: status]];
     the tags run through the same tool pipeline as alarm.set / calendar.add (see horizon_dash.js).
   Network: radio-browser.info (stations), geocoding-api.open-meteo.com (town to country), the station's own stream host.
   Saved on this device only: volume, favourites, presets, last station, recent searches. */
(function () {
    'use strict';

    var KEY = 'horizon_radio_v1';
    var SERVERS = ['https://all.api.radio-browser.info', 'https://de1.api.radio-browser.info', 'https://at1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
    var GEO = 'https://geocoding-api.open-meteo.com/v1/search';
    var H = null;
    var root = null, sheet = null;
    var refs = {};
    var S = {
        st: null, queue: [], lastRes: [], fav: [], pre: [null, null, null, null, null], recent: [], vol: 0.85, min: false,
        status: 'idle', msg: '', label: '', cc: '', busy: false, view: 'search', corsOk: false, realAt: 0
    };

    /* ---------- tiny helpers ---------- */
    function $(s, r) { return (r || document).querySelector(s); }
    function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
    function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
    /* station names come from strangers: no tag brackets, no newlines, so a name can never act as a tool call */
    function clean(s) { return String(s == null ? '' : s).replace(/[\[\]{}<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function rd() { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { return {}; } }
    function wr() {
        try {
            localStorage.setItem(KEY, JSON.stringify({ vol: S.vol, fav: S.fav.slice(0, 60), pre: S.pre, recent: S.recent.slice(0, 6), last: S.st, min: S.min, cc: S.cc, label: S.label }));
        } catch (e) { /* storage full or blocked */ }
    }
    function notice(t) { try { if (H && H.notice) H.notice(t); } catch (e) { /* ignore */ } }
    function fj(url, ms) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 9000);
        return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
            clearTimeout(to);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }, function (e) { clearTimeout(to); throw e; });
    }
    var srv = 0;
    function rb(path) {
        var tries = 0;
        function go() {
            var i = (srv + tries) % SERVERS.length;
            return fj(SERVERS[i] + '/json/' + path, 9000).then(function (j) { srv = i; return j; }, function (e) { if (++tries < SERVERS.length) return go(); throw e; });
        }
        return go();
    }
    function qs(o) { return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ''; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(o[k]); }).join('&'); }

    /* ---------- frequency: only what the station name says ---------- */
    function parseFreq(n) {
        n = String(n || '');
        var m = /(?:^|[^\d.,])(8[7-9]|9\d|10[0-8])[.,](\d)(?!\d)/.exec(n);
        if (m) return { band: 'FM', v: parseFloat(m[1] + '.' + m[2]) };
        m = /(?:^|[^\d])(8[7-9]|9\d|10[0-8])\s?(?:fm|mhz)\b/i.exec(n);
        if (m) return { band: 'FM', v: +m[1] };
        m = /(?:^|[^\d])(5[3-9]\d|[6-9]\d\d|1[0-6]\d\d)\s?(?:am|khz|mw)\b/i.exec(n);
        if (m) return { band: 'AM', v: +m[1] };
        return null;
    }
    function freqText(f) { return !f ? 'NET' : f.band === 'FM' ? (f.v % 1 ? f.v.toFixed(1) : f.v.toFixed(1)) + ' FM' : Math.round(f.v) + ' AM'; }

    function norm(r, scope) {
        if (!r) return null;
        var url = r.url_resolved || r.url;
        if (!url || !/^https?:\/\//i.test(url) || r.hls === 1) return null;
        var name = clean(r.name).slice(0, 80);
        if (!name) return null;
        return {
            id: String(r.stationuuid || ''), name: name, url: url, alt: r.url && r.url !== url ? r.url : '', cc: r.countrycode || '',
            country: clean(r.country), state: clean(r.state), tags: clean(r.tags).split(',').map(function (t) { return t.trim(); }).filter(Boolean).slice(0, 3).join(' · '),
            codec: String(r.codec || '').toUpperCase(), br: r.bitrate | 0, https: /^https:/i.test(url), clicks: r.clickcount | 0, scope: scope || '', f: parseFreq(r.name)
        };
    }

    /* ---------- places: country, town or station name ---------- */
    var ALIAS = { usa: 'US', 'u.s.a.': 'US', 'united states': 'US', america: 'US', uk: 'GB', 'u.k.': 'GB', england: 'GB', britain: 'GB', 'great britain': 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB', uae: 'AE', holland: 'NL', russia: 'RU', 'south korea': 'KR', korea: 'KR', 'ivory coast': 'CI', czechia: 'CZ', turkey: 'TR', 'turkiye': 'TR', 'south africa': 'ZA', 'sa': 'ZA' };
    var codes = null;
    function regionName(cc) { try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc; } catch (e) { return cc; } }
    function countryMap() {
        if (codes) return Promise.resolve(codes);
        var cached = null;
        try { cached = JSON.parse(localStorage.getItem(KEY + '_cc') || 'null'); } catch (e) { /* none */ }
        if (cached && cached.at > Date.now() - 6048e5 && cached.list && cached.list.length) { codes = cached.list; return Promise.resolve(codes); }
        return rb('countrycodes?hidebroken=true').then(function (list) {
            codes = (list || []).filter(function (c) { return c && c.name && c.name.length === 2; }).map(function (c) { return c.name.toUpperCase(); });
            try { localStorage.setItem(KEY + '_cc', JSON.stringify({ at: Date.now(), list: codes })); } catch (e) { /* ignore */ }
            return codes;
        }).catch(function () { codes = codes || []; return codes; });
    }
    function lc(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function countryFrom(text) {
        var t = lc(text);
        if (!t) return Promise.resolve(null);
        if (ALIAS[t]) return Promise.resolve({ cc: ALIAS[t], name: regionName(ALIAS[t]) });
        return countryMap().then(function (list) {
            for (var i = 0; i < list.length; i++) { if (lc(regionName(list[i])) === t || list[i].toLowerCase() === t && t.length === 2) return { cc: list[i], name: regionName(list[i]) }; }
            return null;
        });
    }
    function geocode(name, cc, hint) {
        return fj(GEO + '?' + qs({ name: name, count: 10, language: 'en', format: 'json' }), 8000).then(function (j) {
            var rs = (j && j.results) || [];
            if (cc) { var f = rs.filter(function (r) { return (r.country_code || '').toUpperCase() === cc; }); if (f.length) rs = f; }
            else if (hint) {
                var h = lc(hint), f2 = rs.filter(function (r) { return lc(r.admin1).indexOf(h) >= 0 || lc(r.country).indexOf(h) >= 0 || h.indexOf(lc(r.country)) >= 0; });
                if (f2.length) rs = f2;
            }
            return rs[0] || null;
        });
    }
    /* -> { kind: 'country' | 'town' | 'name', label, cc, town, admin, lat, lon, q } */
    function resolvePlace(q) {
        q = String(q || '').replace(/\s+/g, ' ').trim();
        if (!q) return Promise.reject(new Error('Tell me a country, town or station name.'));
        return countryFrom(q).then(function (c) {
            if (c) return { kind: 'country', label: c.name, cc: c.cc, q: q };
            var parts = q.split(/\s*[,/]\s*/).filter(Boolean), nm = parts[0], hint = parts.slice(1).join(' ');
            return (hint ? countryFrom(hint) : Promise.resolve(null)).then(function (hc) {
                return geocode(nm, hc && hc.cc, hint).then(function (r) {
                    if (!r) return { kind: 'name', label: q, q: q };
                    return { kind: 'town', label: r.name + (r.admin1 && r.admin1 !== r.name ? ', ' + r.admin1 : '') + (r.country ? ', ' + r.country : ''), cc: (r.country_code || '').toUpperCase(), town: r.name, admin: r.admin1 || '', lat: r.latitude, lon: r.longitude, q: q };
                }, function () { return { kind: 'name', label: q, q: q }; });
            });
        });
    }
    function here() {
        var p = null;
        try { p = window.HorizonDash && window.HorizonDash.place ? window.HorizonDash.place() : null; } catch (e) { p = null; }
        if (!p || !p.name) return null;
        var town = String(p.name).split(',')[0].trim();
        return { kind: 'town', label: p.name, cc: (p.cc || '').toUpperCase(), town: town, lat: p.lat, lon: p.lon, q: p.name, here: true };
    }

    var BASE = { hidebroken: 'true', order: 'clickcount', reverse: 'true' };
    function lst(params, scope) {
        return rb('stations/search?' + qs(Object.assign({}, BASE, params))).then(function (a) { return (a || []).map(function (r) { return norm(r, scope); }).filter(Boolean); });
    }
    function none() { return []; }
    /* -> { place, list } ; list is local first, then region, then national, https first */
    function searchPlace(pl) {
        var jobs, failed = 0;
        function safe(p) { return p.catch(function () { failed++; return []; }); }
        if (pl.kind === 'country') jobs = [safe(lst({ countrycode: pl.cc, limit: 60 }, 'national'))];
        else if (pl.kind === 'town') {
            jobs = [
                safe(lst({ countrycode: pl.cc || undefined, name: pl.town, limit: 30 }, 'local')),
                pl.lat != null && pl.lon != null ? safe(lst({ geo_lat: pl.lat, geo_long: pl.lon, geo_distance: 80000, limit: 30 }, 'local')) : Promise.resolve([]),
                pl.admin && pl.cc ? safe(lst({ countrycode: pl.cc, state: pl.admin, limit: 30 }, 'region')) : Promise.resolve([]),
                pl.cc ? safe(lst({ countrycode: pl.cc, limit: 40 }, 'national')) : Promise.resolve([])
            ];
        } else jobs = [safe(lst({ name: pl.q, limit: 50 }, 'name'))];
        return Promise.all(jobs).then(function (groups) {
            if (failed === jobs.length) throw new Error('Could not reach the station directory. Check the connection.');
            var seen = {}, seenName = {}, out = [];
            groups.forEach(function (g) {
                g.slice().sort(function (a, b) { return (b.https - a.https) || (b.clicks - a.clicks); }).forEach(function (s) {
                    var k = s.id || s.url, nk = lc(s.name);
                    if (seen[k] || seenName[nk]) return;
                    seen[k] = 1; seenName[nk] = 1; out.push(s);
                });
            });
            var secure = out.filter(function (s) { return s.https; });
            if (secure.length >= 6) out = secure;   // http streams are blocked by the app's https page on most phones
            return { place: pl, list: out.slice(0, 60) };
        });
    }
    function setBrowse(res) {
        S.queue = res.list; S.label = res.place.label; S.cc = res.place.cc || S.cc;
        if (res.place.q && !res.place.here) { S.recent = [res.place.label].concat(S.recent.filter(function (r) { return r !== res.place.label; })).slice(0, 6); }
        wr(); paintTop(); paintResults();
    }
    function doSearch(q, hereMode) {
        S.busy = true; paintResults();
        var p = hereMode ? Promise.resolve(here()) : resolvePlace(q);
        return p.then(function (pl) {
            if (!pl) throw new Error('Your location is not known yet. Say a town or country.');
            return searchPlace(pl);
        }).then(function (res) { S.busy = false; S.err = ''; setBrowse(res); return res; }, function (e) { S.busy = false; S.err = e && e.message || 'Search failed'; paintResults(); throw e; });
    }

    /* ---------- the player ---------- */
    var au = null, ctx = null, an = null, srcNode = null, sink = null, buf = null, token = 0, loadT = 0, retryT = 0, retries = 0, tuneT = 0;
    function killAudio() {
        token++; clearTimeout(loadT); clearTimeout(retryT);
        if (au) { try { au.onplaying = au.onerror = au.onwaiting = au.onstalled = au.onended = null; au.pause(); au.removeAttribute('src'); au.load(); } catch (e) { /* ignore */ } }
        au = null;
        try { if (srcNode) srcNode.disconnect(); if (an) an.disconnect(); if (sink) sink.disconnect(); } catch (e) { /* ignore */ }
        srcNode = null; an = null; sink = null; S.corsOk = false;
    }
    function pauseMusic() { try { if (window.HorizonMusic && window.HorizonMusic.pauseNow) window.HorizonMusic.pauseNow(); } catch (e) { /* ignore */ } }
    function attachAnalyser(a) {
        try {
            if (!a.captureStream) return;
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            if (!ctx) ctx = new AC();
            if (ctx.state === 'suspended') ctx.resume().catch(function () { /* ignore */ });
            var ms = a.captureStream(); if (!ms.getAudioTracks().length) return;
            srcNode = ctx.createMediaStreamSource(ms);
            an = ctx.createAnalyser(); an.fftSize = 1024; an.smoothingTimeConstant = 0.6;
            sink = ctx.createGain(); sink.gain.value = 0;   // keeps the graph pulling; the element itself still plays natively
            srcNode.connect(an); an.connect(sink); sink.connect(ctx.destination);
            buf = new Uint8Array(an.fftSize);
        } catch (e) { an = null; }
    }
    /* resolves { ok, why } with the REAL outcome */
    function tune(st, opts) {
        opts = opts || {};
        killAudio(); retries = 0;
        var my = token;
        S.st = st; S.status = 'loading'; S.msg = 'Tuning…'; wr(); paintAll();
        pauseMusic(); media();
        var tries = [{ u: st.url, cors: true }, { u: st.url, cors: false }];
        if (st.alt && /^https?:/i.test(st.alt)) tries.push({ u: st.alt, cors: false });
        return new Promise(function (resolve) {
            var i = 0, done = false;
            function finish(r) { if (done) return; done = true; resolve(r); }
            function fail(why) {
                if (my !== token) return finish({ ok: false, why: 'cancelled' });
                S.status = 'error'; S.msg = why; killAudio(); paintAll(); finish({ ok: false, why: why });
            }
            function next() {
                if (my !== token) return finish({ ok: false, why: 'cancelled' });
                if (i >= tries.length) return fail('This station would not open (offline, blocked or http-only). Try another.');
                var t = tries[i++], a = new Audio();
                a.preload = 'none'; a.volume = S.vol;
                if (t.cors) a.crossOrigin = 'anonymous';
                var hit = false;
                a.onplaying = function () {
                    if (my !== token || a !== au) return;
                    clearTimeout(loadT); S.status = 'playing'; S.msg = ''; S.corsOk = !!t.cors; retries = 0;
                    if (t.cors) attachAnalyser(a);
                    media(); paintAll(); watchMusic(); finish({ ok: true });
                    a.onplaying = function () { if (a === au) { S.status = 'playing'; S.msg = ''; paintAll(); } };
                };
                a.onerror = function () { if (my !== token || a !== au || hit) return; hit = true; clearTimeout(loadT); a.onerror = null; next(); };
                a.onwaiting = function () { if (a === au && S.status === 'playing') { S.status = 'loading'; S.msg = 'Buffering…'; paintAll(); } };
                a.onstalled = a.onwaiting;
                a.onended = function () { if (a === au) lost(); };
                killAudioKeepToken(); au = a;
                loadT = setTimeout(function () { if (my !== token || a !== au || hit) return; hit = true; a.onerror = null; next(); }, 11000);
                a.src = t.u;
                var pr; try { pr = a.play(); } catch (e) { pr = null; }
                if (pr && pr.catch) pr.catch(function (e) {
                    if (my !== token || a !== au || hit) return;
                    if (e && e.name === 'NotAllowedError') { hit = true; clearTimeout(loadT); S.status = 'paused'; S.msg = 'Android wants a tap first. Press play.'; paintAll(); finish({ ok: false, why: 'Android blocked autoplay until you tap play on the radio.' }); }
                });
            }
            function killAudioKeepToken() { if (au) { try { au.onplaying = au.onerror = au.onwaiting = au.onstalled = au.onended = null; au.pause(); au.removeAttribute('src'); au.load(); } catch (e) { /* ignore */ } au = null; } }
            next();
        });
    }
    /* a live stream dropped: ask for it again, three times, with a pause between */
    function lost() {
        if (!S.st || !au) return;
        if (retries >= 3) { S.status = 'error'; S.msg = 'Signal lost. Press play to retry.'; paintAll(); return; }
        retries++; S.status = 'loading'; S.msg = 'Signal lost, reconnecting (' + retries + '/3)…'; paintAll();
        var st = S.st, my = token;
        clearTimeout(retryT);
        retryT = setTimeout(function () { if (my !== token) return; var n = retries; tune(st).then(function (r) { if (!r.ok) retries = n; }); }, 1500 * retries);
    }
    function togglePlay() {
        if (!S.st) { openSheet(); return; }
        if (S.status === 'playing' || S.status === 'loading') { stop(); return; }
        tune(S.st);
    }
    function stop() {
        killAudio(); S.status = S.st ? 'paused' : 'idle'; S.msg = ''; paintAll(); media();
    }
    function setVol(v) {
        S.vol = Math.max(0, Math.min(1, v)); if (au) au.volume = S.vol;
        if (refs.vol && +refs.vol.value !== Math.round(S.vol * 100)) refs.vol.value = Math.round(S.vol * 100);
        paintVol(); wr();
    }
    function media() {
        try {
            if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined' || !S.st) return;
            navigator.mediaSession.metadata = new MediaMetadata({ title: S.st.name, artist: 'Horizon Radio', album: freqText(S.st.f) + (S.st.country ? ' · ' + S.st.country : '') });
            navigator.mediaSession.setActionHandler('play', function () { if (S.st && S.status !== 'playing') tune(S.st); });
            navigator.mediaSession.setActionHandler('pause', stop);
            navigator.mediaSession.setActionHandler('stop', stop);
            navigator.mediaSession.setActionHandler('previoustrack', function () { step(-1, true); });
            navigator.mediaSession.setActionHandler('nexttrack', function () { step(1, true); });
            navigator.mediaSession.playbackState = S.status === 'playing' ? 'playing' : 'paused';
        } catch (e) { /* optional */ }
    }
    /* radio and the music player never talk over each other */
    var mTimer = 0;
    function watchMusic() {
        clearInterval(mTimer);
        mTimer = setInterval(function () {
            if (S.status !== 'playing' && S.status !== 'loading') { clearInterval(mTimer); return; }
            try { if (window.HorizonMusic && window.HorizonMusic.playingNow && window.HorizonMusic.playingNow()) { stop(); notice('Radio stopped: music started.'); } } catch (e) { /* ignore */ }
        }, 2000);
    }

    /* ---------- queue navigation (prev / next / tune knob) ---------- */
    function pool() { return S.queue.length ? S.queue : S.fav.length ? S.fav : S.lastRes; }
    function idxOf(list, st) { if (!st) return -1; for (var i = 0; i < list.length; i++) if (list[i].id === st.id && list[i].url === st.url) return i; return -1; }
    var pend = null;
    function step(d, now) {
        var p = pool(); if (!p.length) { openSheet(); return; }
        var base = pend || S.st, i = idxOf(p, base);
        i = i < 0 ? (d > 0 ? 0 : p.length - 1) : (i + d + p.length) % p.length;
        pend = p[i];
        spinKnob(d);
        S.st = pend; S.status = 'loading'; S.msg = 'Tuning…'; paintAll();
        clearTimeout(tuneT);
        tuneT = setTimeout(function () { var s = pend; pend = null; killAudio(); tune(s); }, now ? 0 : 520);
    }

    /* ---------- drawing: speaker, scope, dial ---------- */
    var spk = null, scope = null, dots = null, raf = 0, simT = 0, simAmp = 0.25, rot = 0, RGB = [0, 229, 255];
    function themeRgb() { try { var v = getComputedStyle(root).getPropertyValue('--hzr-rgb').split(',').map(function (n) { return parseInt(n, 10); }); if (v.length === 3 && v.every(function (n) { return n >= 0 && n <= 255; })) RGB = v; } catch (e) { /* keep last */ } }
    function dpr() { return Math.min(window.devicePixelRatio || 1, 2.5); }
    function fit(c) {
        var d = dpr(), w = c.clientWidth, h = c.clientHeight;
        if (!w || !h) return false;
        if (c.width !== Math.round(w * d) || c.height !== Math.round(h * d)) { c.width = Math.round(w * d); c.height = Math.round(h * d); }
        return true;
    }
    function buildDots() {
        dots = []; var R = 1, gap = 0.105, rows = Math.round(2 * R / gap);
        for (var r = 0; r <= rows; r++) {
            var y = -R + r * gap * 0.866 * 1.0; if (y > R) break;
            var off = (r % 2) ? gap / 2 : 0;
            for (var x = -R + off; x <= R; x += gap) { var dd = Math.sqrt(x * x + y * y); if (dd < 0.9) dots.push([x, y, dd]); }
        }
    }
    function level() {
        var playing = S.status === 'playing';
        if (!playing) return { lv: 0, wave: null, real: false };
        if (an && buf) {
            try {
                an.getByteTimeDomainData(buf);
                var sum = 0; for (var i = 0; i < buf.length; i++) { var v = (buf[i] - 128) / 128; sum += v * v; }
                var rms = Math.sqrt(sum / buf.length);
                if (rms > 0.004) { S.realAt = Date.now(); return { lv: Math.min(1, rms * 3.2), wave: buf, real: true }; }
            } catch (e) { /* fall through */ }
            if (Date.now() - S.realAt < 2500) return { lv: 0.05, wave: buf, real: true };
        }
        return { lv: simLevel(), wave: null, real: false };
    }
    function simLevel() {
        simT += 0.05;
        var target = 0.18 + 0.5 * Math.abs(Math.sin(simT * 1.7)) * (0.55 + 0.45 * Math.sin(simT * 0.31 + 1.3));
        simAmp += (target - simAmp) * 0.25;
        return Math.max(0.05, Math.min(1, simAmp + (Math.random() - 0.5) * 0.12));
    }
    function drawSpeaker(lv) {
        if (!spk || !fit(spk)) return;
        if (!dots) buildDots();
        var g = spk.getContext('2d'), w = spk.width, h = spk.height, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 2 * dpr();
        g.clearRect(0, 0, w, h);
        var rg = g.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
        rg.addColorStop(0, 'rgba(' + RGB.join(',') + ',.16)'); rg.addColorStop(1, 'rgba(0,0,0,.55)');
        g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.fill();
        var pulse = 1 + lv * 0.16, dr = Math.max(1.1, R * 0.034);
        for (var i = 0; i < dots.length; i++) {
            var d = dots[i], x = cx + d[0] * R * pulse * 0.97, y = cy + d[1] * R * pulse * 0.97, near = Math.max(0, 1 - d[2] / 0.9);
            var a = 0.22 + near * (0.18 + lv * 0.75);
            g.fillStyle = 'rgba(' + RGB.join(',') + ',' + Math.min(1, a).toFixed(3) + ')';
            g.beginPath(); g.arc(x, y, dr * (0.85 + lv * 0.5 * near), 0, 6.2832); g.fill();
        }
        g.lineWidth = 1.5 * dpr(); g.strokeStyle = 'rgba(' + RGB.join(',') + ',.6)'; g.beginPath(); g.arc(cx, cy, R, 0, 6.2832); g.stroke();
        
        if (lv > 0.08) {   // a ring leaves the cone with the beat
            g.strokeStyle = 'rgba(' + RGB.join(',') + ',' + (0.15 + lv * 0.4).toFixed(2) + ')'; g.lineWidth = 1.4 * dpr();
            g.beginPath(); g.arc(cx, cy, R * (0.32 + lv * 0.45), 0, 6.2832); g.stroke();
        }
    }
    function drawScope(o) {
        if (!scope || !fit(scope)) return;
        var g = scope.getContext('2d'), w = scope.width, h = scope.height, mid = h / 2;
        g.clearRect(0, 0, w, h);
        g.lineWidth = 1.5 * dpr(); g.lineJoin = 'round';
        g.strokeStyle = o.lv > 0.01 ? 'rgb(' + RGB.join(',') + ')' : 'rgba(' + RGB.join(',') + ',.35)';
        g.shadowColor = 'rgba(' + RGB.join(',') + ',.9)'; g.shadowBlur = o.lv > 0.01 ? 6 * dpr() : 0;
        g.beginPath();
        var n = 64;
        for (var i = 0; i <= n; i++) {
            var x = i / n * w, y;
            if (o.lv <= 0.01) y = mid;
            else if (o.wave) { var k = Math.floor(i / n * (o.wave.length - 1)); y = mid + ((o.wave[k] - 128) / 128) * mid * 1.9; }
            else { var t = simT * 2 + i * 0.34; y = mid + (Math.sin(t) * 0.55 + Math.sin(t * 2.3 + 1) * 0.3 + Math.sin(t * 5.1) * 0.15) * mid * o.lv * 1.8 * Math.sin(i / n * Math.PI); }
            if (i) g.lineTo(x, Math.max(1, Math.min(h - 1, y))); else g.moveTo(x, y);
        }
        g.stroke(); g.shadowBlur = 0;
    }
    function visible() { return root && root.isConnected && !S.min && !document.hidden && !!($('#leftPanel') && $('#leftPanel').classList.contains('open')); }
    function frame() {
        raf = 0;
        if (!visible()) return;
        themeRgb();
        var o = level();
        drawSpeaker(o.lv); drawScope(o);
        if (refs.wave) { var t = S.status !== 'playing' ? '' : o.real ? 'LIVE WAVE' : 'SIM WAVE'; if (refs.wave.textContent !== t) { refs.wave.textContent = t; refs.wave.title = o.real ? 'Drawn from the real audio signal' : 'This station blocks audio analysis, so the wave is a simulation'; } }
        if (S.status === 'playing' || spkDirty) { spkDirty = false; raf = requestAnimationFrame(frame); }
    }
    var spkDirty = false;
    function kick() { spkDirty = true; if (!raf) raf = requestAnimationFrame(frame); }

    /* ---------- widget ---------- */
    var SVG_KNOB = '<svg viewBox="0 0 48 48" aria-hidden="true"><defs><radialGradient id="hzrk" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#5a4a3a"/><stop offset=".55" stop-color="#1d1610"/><stop offset="1" stop-color="#0c0804"/></radialGradient></defs><circle cx="24" cy="24" r="22" fill="#c9a24a"/><circle cx="24" cy="24" r="20" fill="url(#hzrk)"/><g class="hzr-knob-g" stroke="#e8c76a" stroke-width="1.6" stroke-linecap="round"><line x1="24" y1="7" x2="24" y2="14"/></g><g stroke="rgba(232,199,106,.3)" stroke-width="1"><path d="M24 24m-15 0a15 15 0 1 0 30 0"/></g></svg>';
    function ico(p) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>'; }
    var I = {
        play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>', pause: '<path d="M7 5v14M17 5v14" stroke-width="3.4"/>',
        prev: '<path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor"/>', next: '<path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/>',
        pin: '<path d="M12 21s-7-6.2-7-11.2A7 7 0 0 1 19 9.8C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.8" r="2.4"/>', star: '<path d="M12 3.6l2.7 5.5 6 .9-4.4 4.2 1 6-5.3-2.8-5.4 2.8 1-6L3.3 10l6-.9z"/>',
        chev: '<path d="M6 9l6 6 6-6"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>', vol: '<path d="M4 9.5v5h4l5 4v-13l-5 4z" fill="currentColor"/><path d="M16.5 9a4.5 4.5 0 0 1 0 6"/>', search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'
    };
    function btn(cls, label, svg) { var b = el('button', cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label; b.innerHTML = ico(svg); return b; }

    function build() {
        root.replaceChildren(); root.className = 'hz-radio hzr';
        var top = el('div', 'hzr-top');
        refs.led = el('i', 'hzr-led');
        var ttl = el('b', 'hzr-ttl', 'HORIZON RADIO');
        refs.band = el('span', 'hzr-tag', 'FM'); refs.wave = el('span', 'hzr-tag wave', '');
        refs.mname = el('span', 'hzr-mname', '');
        refs.mplay = btn('hzr-mplay', 'Play or pause the radio', I.play);
        refs.chev = btn('hzr-chev', 'Collapse the radio', I.chev);
        top.appendChild(refs.led); top.appendChild(ttl); top.appendChild(refs.band); top.appendChild(refs.wave); top.appendChild(refs.mname); top.appendChild(refs.mplay); top.appendChild(refs.chev);

        var body = el('div', 'hzr-body');
        var sp = el('div', 'hzr-spk'); spk = el('canvas'); spk.setAttribute('aria-hidden', 'true'); sp.appendChild(spk);
        var dial = el('div', 'hzr-dial');
        var win = el('div', 'hzr-win');
        var dg = el('div', 'hzr-dg'); refs.digits = el('b', 'hzr-digits', '--.-'); refs.unit = el('span', 'hzr-unit', 'MHz'); refs.status = el('span', 'hzr-stat', '');
        dg.appendChild(refs.digits); dg.appendChild(refs.unit); dg.appendChild(refs.status);
        refs.nameWrap = el('div', 'hzr-name'); refs.name = el('span', '', 'Pick a station'); refs.nameWrap.appendChild(refs.name);
        refs.scale = el('div', 'hzr-scale'); refs.needle = el('i', 'hzr-needle'); refs.scale.appendChild(refs.needle);
        scope = el('canvas', 'hzr-scope'); scope.setAttribute('aria-hidden', 'true');
        win.appendChild(dg); win.appendChild(refs.nameWrap); win.appendChild(refs.scale); win.appendChild(scope);
        dial.appendChild(win);
        refs.where = el('div', 'hzr-where', '');
        dial.appendChild(refs.where);
        body.appendChild(sp); body.appendChild(dial);

        var ctl = el('div', 'hzr-ctl');
        refs.prev = btn('hzr-b', 'Previous station', I.prev);
        refs.knob = el('button', 'hzr-knob'); refs.knob.type = 'button'; refs.knob.setAttribute('aria-label', 'Tuning knob. Drag or tap the sides to change station'); refs.knob.title = 'Tuning knob: drag to tune'; refs.knob.innerHTML = SVG_KNOB;
        refs.play = btn('hzr-b big', 'Play or pause', I.play);
        refs.next = btn('hzr-b', 'Next station', I.next);
        var vw = el('label', 'hzr-vol'); vw.innerHTML = '<span class="hzr-vi">' + ico(I.vol) + '</span>';
        refs.vol = el('input'); refs.vol.type = 'range'; refs.vol.min = '0'; refs.vol.max = '100'; refs.vol.step = '1'; refs.vol.value = String(Math.round(S.vol * 100)); refs.vol.setAttribute('aria-label', 'Radio volume');
        vw.appendChild(refs.vol);
        refs.find = btn('hzr-b', 'Find stations by country or town', I.pin);
        refs.favb = btn('hzr-b', 'Save this station', I.star);
        ctl.appendChild(refs.prev); ctl.appendChild(refs.knob); ctl.appendChild(refs.play); ctl.appendChild(refs.next); ctl.appendChild(vw); ctl.appendChild(refs.find); ctl.appendChild(refs.favb);

        var pre = el('div', 'hzr-pre'); refs.pres = [];
        for (var i = 0; i < 5; i++) { var p = el('button', 'hzr-p', String(i + 1)); p.type = 'button'; p.dataset.i = String(i); refs.pres.push(p); pre.appendChild(p); }
        var hint = el('span', 'hzr-phint', 'hold a preset to save'); pre.appendChild(hint);

        root.appendChild(top); root.appendChild(body); root.appendChild(ctl); root.appendChild(pre);
        wire();
        paintAll();
    }

    function wire() {
        refs.chev.addEventListener('click', function () { S.min = !S.min; wr(); paintAll(); kick(); });
        refs.mplay.addEventListener('click', togglePlay);
        refs.play.addEventListener('click', togglePlay);
        refs.prev.addEventListener('click', function () { step(-1); });
        refs.next.addEventListener('click', function () { step(1); });
        refs.find.addEventListener('click', function () { openSheet(); });
        refs.favb.addEventListener('click', function () { if (S.st) toggleFav(S.st); else openSheet(); });
        refs.vol.addEventListener('input', function () { setVol(+refs.vol.value / 100); });
        refs.digits.addEventListener('click', function () { openSheet(); });
        refs.nameWrap.addEventListener('click', function () { openSheet(); });
        // tuning knob: drag sideways (or round) to move through the stations, tap left/right half to step
        var drag = null;
        refs.knob.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, acc: 0, moved: false, id: e.pointerId }; try { refs.knob.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ } });
        refs.knob.addEventListener('pointermove', function (e) {
            if (!drag) return;
            var dx = e.clientX - drag.x; drag.x = e.clientX; drag.acc += dx;
            if (Math.abs(drag.acc) > 3) drag.moved = true;
            while (Math.abs(drag.acc) >= 26) { var d = drag.acc > 0 ? 1 : -1; drag.acc -= d * 26; step(d); }
        });
        function end(e) {
            if (!drag) return;
            var d = drag; drag = null;
            if (!d.moved) { var r = refs.knob.getBoundingClientRect(); step(e.clientX < r.left + r.width / 2 ? -1 : 1); }
        }
        refs.knob.addEventListener('pointerup', end);
        refs.knob.addEventListener('pointercancel', function () { drag = null; });
        refs.knob.addEventListener('keydown', function (e) { if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { e.preventDefault(); step(1); } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { e.preventDefault(); step(-1); } });
        // presets: tap to tune, hold to save the current station there
        refs.pres.forEach(function (b) {
            var timer = 0, held = false;
            b.addEventListener('pointerdown', function () { held = false; timer = setTimeout(function () { held = true; if (S.st) { S.pre[+b.dataset.i] = S.st; wr(); paintPres(); notice('Preset ' + (+b.dataset.i + 1) + ': ' + clip(S.st.name, 30)); try { navigator.vibrate && navigator.vibrate(25); } catch (e) { /* ignore */ } } else notice('Tune a station first, then hold a preset to save it.'); }, 600); });
            ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, function () { clearTimeout(timer); }); });
            b.addEventListener('click', function () { if (held) { held = false; return; } var s = S.pre[+b.dataset.i]; if (s) { tune(s); } else notice('Empty. Tune a station, then hold this preset to save it.'); });
            b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
        });
    }
    function spinKnob(d) { rot += d * 40; var g = $('.hzr-knob-g', refs.knob); if (g) g.style.transform = 'rotate(' + rot + 'deg)'; }

    function isFav(st) { return !!st && S.fav.some(function (f) { return f.id === st.id && f.url === st.url; }); }
    function toggleFav(st) {
        if (isFav(st)) S.fav = S.fav.filter(function (f) { return !(f.id === st.id && f.url === st.url); });
        else S.fav.unshift(st);
        wr(); paintFav(); paintResults();
    }
    function paintFav() { if (refs.favb) { var on = isFav(S.st); refs.favb.classList.toggle('on', on); refs.favb.setAttribute('aria-pressed', String(on)); refs.favb.title = on ? 'Saved. Tap to remove' : 'Save this station'; } }
    function paintPres() {
        if (!refs.pres) return;
        refs.pres.forEach(function (b, i) {
            var s = S.pre[i]; b.classList.toggle('set', !!s); b.classList.toggle('cur', !!s && !!S.st && s.id === S.st.id && s.url === S.st.url);
            b.title = s ? s.name : 'Empty preset. Hold to save the current station'; b.setAttribute('aria-label', 'Preset ' + (i + 1) + (s ? ': ' + s.name : ' (empty)'));
        });
    }
    function paintVol() { if (refs.vol) refs.vol.style.setProperty('--v', Math.round(S.vol * 100) + '%'); }
    function scaleFor(band) {
        var min = band === 'AM' ? 530 : 87.5, max = band === 'AM' ? 1710 : 108, ticks = band === 'AM' ? [600, 800, 1000, 1200, 1400, 1600] : [88, 92, 96, 100, 104, 108], h = '';
        for (var v = Math.ceil(min / (band === 'AM' ? 20 : 0.5)) * (band === 'AM' ? 20 : 0.5); v <= max; v += band === 'AM' ? 20 : 0.5) {
            var big = ticks.indexOf(Math.round(v)) >= 0 && (band === 'AM' || Math.abs(v - Math.round(v)) < 0.01);
            h += '<i class="t' + (big ? ' b' : '') + '" style="left:' + ((v - min) / (max - min) * 100).toFixed(2) + '%"></i>';
        }
        ticks.forEach(function (t) { h += '<u style="left:' + ((t - min) / (max - min) * 100).toFixed(2) + '%">' + t + '</u>'; });
        return { html: h, min: min, max: max };
    }
    var lastBand = '';
    function paintAll() { paintTop(); paintVol(); paintFav(); paintPres(); paintSheetRows(); }
    function paintTop() {
        if (!root || !refs.digits) return;
        var st = S.st, f = st && st.f, playing = S.status === 'playing', band = f ? f.band : 'FM';
        root.classList.toggle('min', S.min); root.dataset.status = S.status;
        refs.chev.setAttribute('aria-label', S.min ? 'Expand the radio' : 'Collapse the radio'); refs.chev.title = S.min ? 'Expand the radio' : 'Collapse the radio';
        refs.chev.style.transform = S.min ? 'rotate(180deg)' : '';
        refs.band.textContent = st ? (f ? f.band : 'NET') : 'RADIO';
        var ph = playing ? I.pause : I.play, lbl = playing || S.status === 'loading' ? 'Pause the radio' : 'Play the radio';
        [refs.play, refs.mplay].forEach(function (b) { if (b._p !== ph) { b._p = ph; b.innerHTML = ico(ph); } b.setAttribute('aria-label', lbl); b.title = lbl; });
        refs.play.classList.toggle('on', playing); refs.mplay.classList.toggle('on', playing);
        if (band !== lastBand) { lastBand = band; var sc = scaleFor(band); refs.scale.innerHTML = sc.html; refs.scale.appendChild(refs.needle); refs.scale._min = sc.min; refs.scale._max = sc.max; }
        if (f) {
            refs.digits.textContent = f.band === 'FM' ? f.v.toFixed(1) : String(Math.round(f.v)); refs.unit.textContent = f.band === 'FM' ? 'MHz' : 'kHz';
            refs.needle.style.left = ((f.v - refs.scale._min) / (refs.scale._max - refs.scale._min) * 100).toFixed(2) + '%'; refs.needle.classList.remove('park');
        } else {
            refs.digits.textContent = st ? 'NET' : '--.-'; refs.unit.textContent = st ? 'stream' : 'MHz';
            refs.needle.style.left = '0%'; refs.needle.classList.add('park');
        }
        var nm = st ? st.name : 'Pick a station';
        if (refs.name.textContent !== nm) { refs.name.textContent = nm; refs.name.classList.remove('run'); requestAnimationFrame(function () { var over = refs.name.scrollWidth - refs.nameWrap.clientWidth; if (over > 4) { refs.name.style.setProperty('--dx', '-' + over + 'px'); refs.name.style.setProperty('--dur', Math.max(6, over / 18) + 's'); refs.name.classList.add('run'); } }); }
        refs.mname.textContent = st ? st.name : 'Tap play to choose';
        var meta = '';
        if (S.status === 'loading') meta = S.msg || 'Tuning…';
        else if (S.status === 'error') meta = S.msg || 'No signal';
        else if (S.status === 'paused' && S.msg) meta = S.msg;
        else if (playing) meta = [st && st.codec, st && st.br ? st.br + 'k' : ''].filter(Boolean).join(' ') || 'ON AIR';
        else meta = st ? 'OFF' : 'STANDBY';
        refs.status.textContent = meta;
        refs.status.className = 'hzr-stat ' + S.status;
        refs.where.textContent = st ? (st.f ? '' : 'Internet stream: no FM frequency on record') + (st.country || st.state ? (st.f ? '' : ' · ') + [st.state, st.country].filter(Boolean).join(', ') : '') : (S.label ? 'Last scan: ' + S.label + ' (' + S.queue.length + ' stations)' : 'Say a country or town to scan the dial');
        refs.led.className = 'hzr-led ' + S.status;
        kick();
    }

    /* ---------- picker sheet ---------- */
    var sheetBack = null;
    function buildSheet() {
        sheet = el('div', 'hzr-shade'); sheet.hidden = true;
        sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true'); sheet.setAttribute('aria-label', 'Find radio stations');
        sheet.innerHTML = '<div class="hzr-card">' +
            '<div class="hzr-sh"><b>Tune in</b><span class="hzr-sub">Any country or town in the world</span><button type="button" class="hzr-x" aria-label="Close">' + ico(I.x) + '</button></div>' +
            '<form class="hzr-form" autocomplete="off"><input class="hzr-q" type="search" enterkeyhint="search" placeholder="Country, town or station name" aria-label="Country, town or station name" autocapitalize="words" spellcheck="false">' +
            '<button class="hzr-go" type="submit">Scan</button></form>' +
            '<div class="hzr-row2"><button type="button" class="hzr-near">' + ico(I.pin) + '<span>Near me</span></button><div class="hzr-seg" role="tablist"><button type="button" data-v="search" class="on" role="tab">Dial</button><button type="button" data-v="saved" role="tab">Saved</button></div></div>' +
            '<div class="hzr-chips"></div><div class="hzr-res" role="list"></div></div>';
        document.body.appendChild(sheet);
        sheet.addEventListener('click', function (e) {
            if (e.target === sheet) return closeSheet();
            var t = e.target.closest('button'); if (!t) return;
            if (t.classList.contains('hzr-x')) return closeSheet();
            if (t.classList.contains('hzr-near')) { return doSearch('', true).catch(function () { }); }
            if (t.dataset.v) { S.view = t.dataset.v; $$('.hzr-seg button', sheet).forEach(function (b) { b.classList.toggle('on', b === t); }); return paintResults(); }
            if (t.dataset.chip) { $('.hzr-q', sheet).value = t.dataset.chip; S.view = 'search'; return doSearch(t.dataset.chip).catch(function () { }); }
            if (t.dataset.fav != null) { var s1 = rowStation(t); if (s1) toggleFav(s1); return; }
            var row = t.closest('.hzr-r'); if (row) { var s = rowStation(row); if (s) { if (S.st && s.id === S.st.id && s.url === S.st.url && S.status === 'playing') { stop(); } else { if (idxOf(S.queue, s) < 0 && S.view === 'saved') { /* playing from Saved keeps the browse list */ } tune(s); } } }
        });
        $('.hzr-form', sheet).addEventListener('submit', function (e) { e.preventDefault(); var q = $('.hzr-q', sheet).value.trim(); if (!q) return; S.view = 'search'; $$('.hzr-seg button', sheet).forEach(function (b) { b.classList.toggle('on', b.dataset.v === 'search'); }); doSearch(q).catch(function () { }); try { document.activeElement.blur(); } catch (x) { /* ignore */ } });
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheet && !sheet.hidden) { e.preventDefault(); closeSheet(); } });
    }
    function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
    function rowStation(n) {
        var r = n.closest('[data-k]'); if (!r) return null;
        var k = r.dataset.k, list = S.view === 'saved' ? S.fav : S.queue, i;
        for (i = 0; i < list.length; i++) if ((list[i].id || list[i].url) === k) return list[i];
        for (i = 0; i < S.fav.length; i++) if ((S.fav[i].id || S.fav[i].url) === k) return S.fav[i];
        return null;
    }
    function openSheet(q) {
        if (!sheet) buildSheet();
        if (!sheet.hidden) return;
        sheetBack = document.activeElement;
        sheet.hidden = false;
        try { history.pushState(Object.assign({}, history.state || {}, { hzRadio: 1 }), ''); } catch (e) { /* ignore */ }
        paintResults();
        var inp = $('.hzr-q', sheet);
        if (q) { inp.value = q; doSearch(q).catch(function () { }); }
        else if (!S.queue.length && !S.fav.length) { setTimeout(function () { try { inp.focus(); } catch (e) { /* ignore */ } }, 120); }
    }
    function closeSheet(fromPop) {
        if (!sheet || sheet.hidden) return;
        sheet.hidden = true;
        if (sheetBack && sheetBack.isConnected) try { sheetBack.focus(); } catch (e) { /* ignore */ }
        if (!fromPop) { try { if (history.state && history.state.hzRadio) history.back(); } catch (e) { /* ignore */ } }
    }
    function rowEl(s) {
        var r = el('div', 'hzr-r'); r.setAttribute('role', 'listitem'); r.dataset.k = s.id || s.url;
        var cur = S.st && s.id === S.st.id && s.url === S.st.url;
        if (cur) r.classList.add('cur', S.status);
        var main = el('button', 'hzr-rm'); main.type = 'button'; main.setAttribute('aria-label', (cur && S.status === 'playing' ? 'Pause ' : 'Play ') + s.name);
        var fb = el('span', 'hzr-fb' + (s.f ? '' : ' net'), s.f ? (s.f.band === 'FM' ? s.f.v.toFixed(1) : String(Math.round(s.f.v))) : 'NET');
        fb.appendChild(el('small', '', s.f ? s.f.band : 'stream'));
        var tx = el('span', 'hzr-rt'); tx.appendChild(el('b', '', s.name));
        tx.appendChild(el('span', '', [s.tags, s.codec ? s.codec + (s.br ? ' ' + s.br + 'k' : '') : '', s.https ? '' : 'http'].filter(Boolean).join(' · ') || s.country));
        var eq = el('span', 'hzr-eq'); eq.innerHTML = '<i></i><i></i><i></i>';
        main.appendChild(fb); main.appendChild(tx); main.appendChild(eq);
        var fv = el('button', 'hzr-fv' + (isFav(s) ? ' on' : '')); fv.type = 'button'; fv.dataset.fav = '1'; fv.setAttribute('aria-label', isFav(s) ? 'Remove from saved' : 'Save station'); fv.setAttribute('aria-pressed', String(isFav(s))); fv.innerHTML = ico(I.star);
        r.appendChild(main); r.appendChild(fv);
        return r;
    }
    function paintSheetRows() { if (sheet && !sheet.hidden) paintResults(); }
    function paintResults() {
        if (!sheet) return;
        var box = $('.hzr-res', sheet), chips = $('.hzr-chips', sheet);
        chips.replaceChildren();
        if (S.view === 'search') S.recent.forEach(function (r) { var c = el('button', 'hzr-chip', r); c.type = 'button'; c.dataset.chip = r; chips.appendChild(c); });
        box.replaceChildren();
        if (S.view === 'saved') {
            if (!S.fav.length) { box.appendChild(el('p', 'hzr-empty', 'Nothing saved yet. Tap the star on any station.')); return; }
            S.fav.forEach(function (s) { box.appendChild(rowEl(s)); });
            return;
        }
        if (S.busy) { var b = el('div', 'hzr-busy'); b.innerHTML = '<i></i><i></i><i></i><i></i><i></i><span>Scanning the dial…</span>'; box.appendChild(b); return; }
        if (S.err) { box.appendChild(el('p', 'hzr-empty err', S.err)); return; }
        if (!S.queue.length) { box.appendChild(el('p', 'hzr-empty', S.label ? 'No live stations found for ' + S.label + '. Try the country name.' : 'Type a country or town and press Scan, or tap Near me. Stations come from the open radio-browser.info directory.')); return; }
        box.appendChild(el('p', 'hzr-found', '📍 ' + S.label + ' · ' + S.queue.length + ' stations on the air'));
        var groups = { local: 'In and around ' + (S.label || '').split(',')[0], region: 'In the region', national: 'Across the country', name: 'Matching stations' }, last = '';
        S.queue.forEach(function (s) {
            if (s.scope !== last) { last = s.scope; box.appendChild(el('div', 'hzr-gh', groups[s.scope] || 'Stations')); }
            box.appendChild(rowEl(s));
        });
    }

    /* ---------- AI tools ---------- */
    function fmtRow(s, n) {
        return n + '. ' + s.name + ' [' + (s.f ? s.f.band + ' ' + (s.f.band === 'FM' ? s.f.v.toFixed(1) + ' MHz' : Math.round(s.f.v) + ' kHz') + ' (from station name)' : 'internet stream, no frequency on record') + ']' +
            (s.tags ? ' ' + s.tags : '') + (s.codec ? ' · ' + s.codec + (s.br ? ' ' + s.br + 'k' : '') : '') + (s.scope === 'local' ? ' · local' : s.scope === 'region' ? ' · region' : '') + (s.https ? '' : ' · http (may not play)');
    }
    function pick(arg) {
        var a = String(arg || '').trim(), m = /^#?(\d{1,3})$/.exec(a);
        if (m) { var s = S.lastRes[+m[1] - 1]; return Promise.resolve(s || null); }
        var t = lc(a);
        if (!t) return Promise.resolve(null);
        function best(list) {
            var hit = null, sc = 0;
            list.forEach(function (s) { var n = lc(s.name), v = n === t ? 3 : n.indexOf(t) === 0 ? 2.5 : n.indexOf(t) >= 0 ? 2 : t.indexOf(n) >= 0 && n.length > 3 ? 1.5 : 0; if (!v && s.f && t.replace(/[^0-9.]/g, '') && String(s.f.v) === t.replace(/[^0-9.]/g, '')) v = 1.8; if (v > sc) { sc = v; hit = s; } });
            return hit;
        }
        var local = best(S.lastRes) || best(S.queue) || best(S.fav) || best(S.pre.filter(Boolean));
        if (local) return Promise.resolve(local);
        return lst({ name: a, countrycode: S.cc || undefined, limit: 12 }, 'name').then(function (l) { return l.length ? l : lst({ name: a, limit: 12 }, 'name'); }).then(function (l) { return best(l) || l[0] || null; }, function () { return null; });
    }
    function nowText() {
        var s = S.st;
        if (!s) return 'Radio: nothing tuned. ' + (S.queue.length ? 'Last scan: ' + S.label + ' (' + S.queue.length + ' stations).' : 'No scan yet.');
        return 'Radio ' + (S.status === 'playing' ? 'PLAYING' : S.status === 'loading' ? 'tuning' : S.status === 'error' ? 'FAILED (' + S.msg + ')' : 'paused') + ': ' + s.name + ' [' + (s.f ? s.f.band + ' ' + (s.f.band === 'FM' ? s.f.v.toFixed(1) : Math.round(s.f.v)) : 'internet stream') + ']' + (s.country ? ', ' + s.country : '') + ', volume ' + Math.round(S.vol * 100) + '%.';
    }
    function run(kind, arg) {
        kind = String(kind || '').toLowerCase().replace(/^radio\./, ''); arg = String(arg || '').trim();
        if (kind === 'find') {
            var hereMode = !arg || /^(here|near me|nearby|local|my (?:area|location|place|town|city)|where i am|around me)$/i.test(arg);
            if (hereMode && !here()) return Promise.resolve({ text: 'ERROR: the dashboard has not located Fezzy yet. Ask which country or town to scan.' });
            return doSearch(arg, hereMode).then(function (res) {
                S.lastRes = res.list.slice(0, 12);
                if (!S.lastRes.length) return { text: 'No live stations found for ' + res.place.label + '. Ask for a bigger town or the country name.' };
                var p = res.place;
                return { text: 'RADIO SCAN: ' + p.label + (p.cc ? ' (country ' + p.cc + ')' : '') + ' · ' + res.list.length + ' live stations; top ' + S.lastRes.length + ' below, local first. Frequencies are read from the station name only; internet-only stations have none. Never invent a frequency.\n' +
                    S.lastRes.map(function (s, i) { return fmtRow(s, i + 1); }).join('\n') + '\nNext: offer Fezzy 3-6 of these (name + frequency/genre) and ask which to play, unless he told you to choose. Then [[radio.play: number]]. The widget in the Menu also lists all ' + res.list.length + '.' };
            }, function (e) { return { text: 'ERROR: ' + (e && e.message || 'scan failed') }; });
        }
        if (kind === 'play') {
            if (!arg) return Promise.resolve({ text: 'ERROR: say which station: a number from the last scan or the station name.' });
            return pick(arg).then(function (st) {
                if (!st) return { text: 'ERROR: no station matches "' + clip(arg, 60) + '". Run [[radio.find: place]] first and use a returned number.' };
                return tune(st).then(function (r) {
                    if (r.ok) return { text: 'PLAYING NOW in Horizon Radio: ' + st.name + ' [' + (st.f ? freqText(st.f) : 'internet stream') + ']' + (st.country ? ', ' + st.country : '') + '. Confirm to Fezzy; the widget above the weather card shows it.' };
                    return { text: 'ERROR: could not play ' + st.name + ': ' + r.why + ' Offer another station from the list.' };
                });
            });
        }
        if (kind === 'stop') { stop(); return Promise.resolve({ text: 'Radio stopped.' }); }
        if (kind === 'vol') {
            var v = /^\d{1,3}$/.test(arg.replace('%', '')) ? +arg.replace('%', '') : /up|louder|higher/i.test(arg) ? Math.round(S.vol * 100) + 15 : /down|quiet|lower/i.test(arg) ? Math.round(S.vol * 100) - 15 : /mute/i.test(arg) ? 0 : NaN;
            if (isNaN(v)) return Promise.resolve({ text: 'ERROR: use [[radio.vol: 0-100]], up, down or mute.' });
            setVol(Math.max(0, Math.min(100, v)) / 100); return Promise.resolve({ text: 'Radio volume is now ' + Math.round(S.vol * 100) + '%.' });
        }
        if (kind === 'now') return Promise.resolve({ text: nowText() });
        return Promise.resolve({ text: 'ERROR: unknown radio tool.' });
    }
    function block() {
        return 'HORIZON RADIO (native widget above the weather card, own player; not YouTube, not the music player): [[radio.find: town, country or station name]] scans live stations worldwide (use "here" for Fezzy\'s current place' + (here() ? ': ' + here().label : '') + ') and returns numbered results with frequencies read from the station names (many are internet-only, no frequency); then offer a few and ask which one, unless he told you to pick, and start it with [[radio.play: number or station name]]. Also [[radio.stop: now]], [[radio.vol: 0-100]], [[radio.now: status]]. Always include the colon and an argument. Wait for each result, only use returned stations, never invent a station or a frequency. ' + nowText();
    }

    function init(h) {
        H = h || H || {};
        if (root) return;
        root = document.getElementById('hzRadio');
        if (!root) return;
        var saved = rd();
        if (typeof saved.vol === 'number') S.vol = Math.max(0, Math.min(1, saved.vol));
        if (Array.isArray(saved.fav)) S.fav = saved.fav.filter(function (s) { return s && s.url; });
        if (Array.isArray(saved.pre)) for (var i = 0; i < 5; i++) S.pre[i] = saved.pre[i] && saved.pre[i].url ? saved.pre[i] : null;
        if (Array.isArray(saved.recent)) S.recent = saved.recent.filter(function (r) { return typeof r === 'string'; });
        if (saved.last && saved.last.url) { S.st = saved.last; S.status = 'paused'; }
        if (typeof saved.min === 'boolean') S.min = saved.min;
        S.cc = saved.cc || ''; S.label = saved.label || '';
        build();
        var lp = $('#leftPanel');
        if (lp) new MutationObserver(function () { if (lp.classList.contains('open')) { paintTop(); kick(); } }).observe(lp, { attributes: true, attributeFilter: ['class'] });
        document.addEventListener('visibilitychange', function () { if (!document.hidden) kick(); });
        window.addEventListener('resize', function () { kick(); });
        window.addEventListener('popstate', function () { if (sheet && !sheet.hidden && !(history.state && history.state.hzRadio)) closeSheet(true); });
        var mi = document.getElementById('bRadioOpen');
        if (mi) mi.addEventListener('click', function () { openSheet(); });
        setTimeout(kick, 300);
    }

    /* V1.99.101: read-only feed for the shared waveform. Returns { real, bins } with n values 0..1 (index 0 = bass), or null when
       nothing is playing. real=true only when the station allowed analysis (CORS) and the analyser is hearing signal. */
    function spectrum(n) {
        if (S.status !== 'playing') return null;
        n = Math.max(4, Math.min(64, n | 0 || 28));
        var o = level(), out = new Array(n), i;
        if (o.real && o.wave && o.wave.length) {
            var w = o.wave, seg = Math.floor(w.length / n) || 1;
            for (i = 0; i < n; i++) {
                var s0 = i * seg, mx = 0;
                for (var k = 0; k < seg; k++) { var v = Math.abs((w[s0 + k] - 128) / 128); if (v > mx) mx = v; }
                out[i] = Math.max(0.05, Math.min(1, mx * 2.4));
            }
            return { real: true, bins: out, lv: o.lv };
        }
        return { real: false, bins: null, lv: o.lv };
    }
    /* V1.99.102: Gemini ears. Records a few seconds of what is on air from the same analyser feed the waveform uses and hands back mono 16 kHz samples.
       Only works when the station allows signal analysis (CORS). Nothing is sent anywhere from here; horizon_music.js sends it to Gemini when you tap Ask. */
    function capture(secs) {
        return new Promise(function (resolve, reject) {
            if (S.status !== 'playing' || !S.st) { reject(new Error('No station is on air.')); return; }
            if (!S.corsOk || !srcNode || !ctx || !ctx.createScriptProcessor) { reject(new Error('This station does not let Horizon record its sound, so Gemini cannot hear it.')); return; }
            secs = Math.max(5, Math.min(60, Math.round(secs) || 15));
            var my = token, rate = ctx.sampleRate, need = Math.ceil(secs * rate), got = 0, chunks = [], done = false;
            var proc = ctx.createScriptProcessor(4096, 1, 1), mute = ctx.createGain(); mute.gain.value = 0;
            function end(err) {
                if (done) return; done = true; clearTimeout(guard);
                proc.onaudioprocess = null;
                try { if (srcNode) srcNode.disconnect(proc); } catch (e) { /* already gone */ }
                try { proc.disconnect(); mute.disconnect(); } catch (e) { /* already gone */ }
                if (err) { reject(err); return; }
                if (got < rate * 3) { reject(new Error('Not enough sound came through. Try again in a moment.')); return; }
                var all = new Float32Array(got), o = 0, i, k;
                for (i = 0; i < chunks.length; i++) { all.set(chunks[i], o); o += chunks[i].length; }
                var R = 16000, ratio = rate / R, n = Math.floor(got / ratio), out = new Float32Array(n), peak = 0;
                for (i = 0; i < n; i++) {
                    var a = Math.floor(i * ratio), b = Math.max(a + 1, Math.floor((i + 1) * ratio)), sum = 0;
                    for (k = a; k < b && k < got; k++) sum += all[k];
                    out[i] = sum / (b - a); if (Math.abs(out[i]) > peak) peak = Math.abs(out[i]);
                }
                if (peak < 0.002) { reject(new Error('The station is silent right now, so there is nothing to hear.')); return; }
                resolve({ pcm: out, rate: R, secs: Math.round(n / R), station: S.st });
            }
            var guard = setTimeout(function () { end(); }, secs * 1000 + 6000);
            proc.onaudioprocess = function (e) {
                if (done) return;
                if (my !== token || S.status !== 'playing') { end(new Error('The station changed while recording. Try again.')); return; }
                var d = e.inputBuffer.getChannelData(0); chunks.push(new Float32Array(d)); got += d.length;
                if (got >= need) end();
            };
            try { srcNode.connect(proc); proc.connect(mute); mute.connect(ctx.destination); }
            catch (e) { end(new Error('This station does not let Horizon record its sound, so Gemini cannot hear it.')); }
        });
    }
    window.HorizonRadio = { capture: capture, spectrum: spectrum, init: init, run: run, block: block, state: function () { return { status: S.status, station: S.st, queue: S.queue.length }; }, open: openSheet, parseFreq: parseFreq, norm: norm, clean: clean, _resolve: resolvePlace };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { init(); }); else setTimeout(function () { init(); }, 0);
})();
