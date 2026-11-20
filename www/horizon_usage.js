/* Horizon V1.20.0: compact live badge (provider, model, last-replies bars, tokens, time). Horizon V1.18.0: USAGE & ENGINE dashboard + live provider badge.
 * - Records every AI request per provider: latency, tokens (real, or estimated and marked ~), errors.
 * - Keeps 30 days of per-day counts in localStorage (no keys, no message text, no IP is ever stored).
 * - Draws: provider cards, requests per day, response-time sparkline, key health, network (IP + place).
 * - The badge under the header shows the active provider with a live timer and the last token count.
 */
(function () {
    'use strict';
    var KEY = 'horizon_usage_v1';
    var MAXLAT = 40, MAXT = 40, KEEP_DAYS = 30;
    var COLORS = { gemini: '#4f8cff', cohere: '#a855f7', mistral: '#ff8205', openrouter: '#8b5cf6', routeway: '#a78bfa', unorouter: '#fb923c', requesty: '#2dd4bf', githubmodels: '#c084fc', kilo: '#facc15', ovh: '#60a5fa', chatat: '#4ade80', blockrun: '#818cf8', aihorde: '#f59e0b', llm7: '#38bdf8', agnes: '#f472b6', gonka: '#a3e635', gonkabroker: '#d9f20a', freeai: '#22c55e', cloudflare: '#f6821f', hzworker: '#fb923c', hzworker2: '#f59e0b', hzworker3: '#fbbf24', pollinations: 'var(--neon)' };
    var EXTRA = ['#06b6d4', '#eab308', '#ec4899', '#14b8a6'];
    var cfg = null, live = null, tick = 0, saveT = 0, root = null;
    var groupSignature = '', lastGroupError = '';
    var lastSpk = null;   // V1.99.33: last AI that answered in the group; the pill shows the next one in the rotation
    var net = { busy: false, data: null, err: '', at: 0 };
    var chkBusy = false, wipeArm = 0;

    function load() {
        try {
            var v = JSON.parse(localStorage.getItem(KEY));
            if (v && typeof v === 'object' && v.p && v.d) { if (!Array.isArray(v.t)) v.t = []; return v; }
        } catch (e) { /* fresh */ }
        return { p: {}, d: {}, t: [] };
    }
    var store = load();
    function save() {
        clearTimeout(saveT);
        saveT = setTimeout(function () { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { /* full */ } }, 400);
    }
    function dayKey(ts) {
        var d = new Date(ts || Date.now());
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function prune() {
        var cut = dayKey(Date.now() - KEEP_DAYS * 86400000);
        Object.keys(store.d).forEach(function (k) { if (k < cut) delete store.d[k]; });
    }
    prune();

    function fmtTok(n) { n = Math.max(0, Math.round(n || 0)); return n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : String(n); }
    function fmtMs(ms) { ms = Math.round(ms || 0); return ms < 1000 ? ms + 'ms' : (ms / 1000).toFixed(ms >= 10000 ? 0 : 1) + 's'; }
    function colorOf(id) {
        if (COLORS[id]) return COLORS[id];
        var ids = cfg ? cfg.ids : [];
        return EXTRA[Math.max(0, ids.indexOf(id)) % EXTRA.length];
    }
    function el(tag, cls, text) {
        var n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }
    function svgEl(tag, attrs) {
        var n = document.createElementNS('http://www.w3.org/2000/svg', tag);
        Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
        return n;
    }
    function shortErr(s) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > 140 ? s.slice(0, 140) + '...' : s; }
    function prov(id) { var s = store.p[id]; if (!s) { s = store.p[id] = { req: 0, err: 0, i: 0, o: 0, est: 0, okN: 0, sumMs: 0, lat: [], last: null, chk: null, lastTurn: null }; } return s; }

    /* ---------- recording ---------- */
    function begin(id, model) {
        live = { id: id, model: model, t0: Date.now(), estIn: 0, i: 0, o: 0, known: false };
        clearInterval(tick);
        tick = setInterval(function () { if (document.hidden) return; paintBadge(); }, 250);
        paintBadge();
    }
    function tokens(i, o) {
        if (!live) return;
        live.i += Math.max(0, Number(i) || 0); live.o += Math.max(0, Number(o) || 0); live.known = true; paintBadge();
    }
    function runningRead() {
        return fmtMs(Date.now() - live.t0) + ' · ' + (live.known ? '↑' + fmtTok(live.i) + ' ↓' + fmtTok(live.o) : 'tokens pending');
    }
    function end(id, model, r) {
        clearInterval(tick); tick = 0; live = null;
        if (!r || r.stopped) { paintBadge(); return; }
        var s = prov(id), dk = dayKey(), day = (store.d[dk] = store.d[dk] || {});
        var dd = (day[id] = day[id] || { r: 0, e: 0, i: 0, o: 0 });
        s.req++; dd.r++;
        if (r.ok) {
            s.okN++; s.sumMs += r.ms;
            s.i += r.i || 0; s.o += r.o || 0; dd.i += r.i || 0; dd.o += r.o || 0;
            if (r.est) s.est++;
            s.lat.push(r.ms); if (s.lat.length > MAXLAT) s.lat.shift();
            s.lastTurn = { i: r.i || 0, o: r.o || 0, ms: r.ms, est: !!r.est, model: model };
        } else { s.err++; dd.e++; }
        if (!r.ok && (r.status === 429 || /rate.?limit|quota|too many|exhaust/i.test(r.err || ''))) lastGroupError = (cfg.providers[id] ? cfg.providers[id].name : id) + ' rate-limited';
        else if (r.ok && lastGroupError.indexOf(cfg.providers[id] ? cfg.providers[id].name : id) === 0) lastGroupError = '';
        s.last = { ok: !!r.ok, ms: r.ms, at: Date.now(), err: r.ok ? '' : shortErr(r.err), status: r.status || 0, model: model };
        store.t.push({ id: id, ms: r.ms, ok: !!r.ok }); if (store.t.length > MAXT) store.t.shift();
        prune(); save(); paintBadge(); if (visible()) render(); paintCards();
    }

    /* ---------- status ---------- */
    function newest(a, b) { if (a && b) return a.at >= b.at ? a : b; return a || b || null; }
    function status(id) {
        if (!cfg.hasKey(id)) return { t: 'NO KEY', c: 'off' };
        var s = store.p[id], ev = newest(s && s.last, s && s.chk);
        if (!ev) return { t: 'READY', c: 'idle' };
        if (ev.ok) return { t: 'LIVE', c: 'live' };
        var code = ev.status || 0, msg = ev.err || '';
        if (code === 429 || /rate.?limit|quota|tokens per|too many|exhaust/i.test(msg)) return { t: 'RATE-LIMITED', c: 'warn' };
        if (code === 401 || code === 403 || /api.?key|invalid|unauthori|permission|denied|forbidden/i.test(msg)) return { t: 'KEY FAILING', c: 'bad' };
        return { t: 'FAILING', c: 'bad' };
    }

    /* V1.40.0: key-health autopilot helper. True when the newest result for this provider was a limit/quota error in the last 10 minutes. */
    function limitedNow(id) {
        var st = store.p[id], ev = st && st.last;
        if (!ev || ev.ok || Date.now() - ev.at > 600000) return false;
        return ev.status === 429 || /rate.?limit|quota|tokens per|too many|exhaust/i.test(ev.err || '');
    }

    /* ---------- badge ---------- */
    function badgeEl() { return document.getElementById('hzBadge'); }
    // V1.64.0: in a group chat the badge follows the GROUP (names of every AI in it, and whichever one is answering right now),
    // not the last single AI that was picked.
    function paintGroupBadge(b, ids) {
        if (!ids.length) return;
        if (groupSignature !== ids.join(',')) { groupSignature = ids.join(','); lastSpk = null; lastGroupError = ''; }
        var running = !!(live && ids.indexOf(live.id) >= 0);
        if (running) lastSpk = live.id;
        var spkIdx = ids.indexOf(lastSpk), spk = running ? live.id : ids[(spkIdx >= 0 ? spkIdx + 1 : 0) % ids.length];
        window.HzNow = { group: true, running: running, id: spk, name: cfg.providers[spk] ? cfg.providers[spk].name : spk, model: running ? live.model : (cfg.model ? (cfg.model(spk) || '') : ''), status: status(spk).t, alert: lastGroupError };
        var turn = store.p[spk] && store.p[spk].lastTurn;
        window.HzLast = !running && turn ? {i: turn.i, o: turn.o, ms: turn.ms, est: !!turn.est} : null;
        var names = ids.map(function (i) { return cfg.providers[i] ? cfg.providers[i].name : i; });
        var key = ['G', ids.join(','), running ? 'run:' + live.id : 'idle', spk, window.HzNow.model, window.HzNow.status, lastGroupError].join('|');
        if (running && b._hzKey === key && b.firstChild) {
            var rd0 = b.querySelector('.hzb-read');
            if (rd0) { rd0.textContent = runningRead(); return; }
        }
        b._hzKey = key;
        var lead = running ? live.id : ids[0];
        var pill = el('span', 'hzb-pill' + (running ? ' busy' : ''));
        pill.classList.add('hzb-opt');   // V1.69.0: a green OPTIONS pill. Tapping it opens the group menu (the usage dashboard is inside it)
        pill.style.setProperty('--pc', 'var(--neon)');
        b.replaceChildren(pill);
        var dot = el('i', 'hzu-dot ' + (running ? 'run' : 'ok'));
        dot.style.setProperty('--pc', 'var(--neon)');
        pill.appendChild(dot);
        pill.appendChild(el('span', 'hzb-name', window.HzNow.name));
        pill.appendChild(el('span', 'hzb-model', window.HzNow.model));
        var joined = names.join(' + ');
        var out = running ? runningRead() : (turn ? (turn.est ? '~' : '') + '↑' + fmtTok(turn.i) + ' ↓' + fmtTok(turn.o) : 'next · ready');
        if (window.HzNow.status === 'RATE-LIMITED') out = 'RATE-LIMITED · ' + out;
        if (lastGroupError && window.HzNow.status !== 'RATE-LIMITED') out += ' · ' + lastGroupError;
        pill.appendChild(el('span', 'hzb-sep')); pill.appendChild(el('span', 'hzb-read', out));
        b.title = 'Group chat: ' + joined + (running ? ' \u00b7 ' + (cfg.providers[live.id] ? cfg.providers[live.id].name : '') + ' is answering' : '');
        b.setAttribute('aria-label', 'Usage and engine dashboard. Group chat with ' + joined + '. ' + (running ? 'Answering ' : '') + out);
    }
    function paintBadge() {
        var b = badgeEl();
        if (!b || !cfg) return;
        var gids = typeof cfg.group === 'function' ? cfg.group() : null;
        if (gids && gids.length > 1) { paintGroupBadge(b, gids.filter(function (i) { return cfg.providers[i]; })); return; }
        var id = cfg.active(), p = cfg.providers[id];
        if (!p) return;
        var st = status(id), running = !!(live && live.id === id), s = store.p[id];
        window.HzNow = { group: false, running: running, id: id, name: p.name, model: running ? live.model : (cfg.model(id) || ''), status: st.t };
        // V1.43.2: while a reply runs this repaints every 250 ms. Rebuilding the pill each time restarted its sliding bar and pulsing dot
        // before they could move. If nothing but the clock changed, only the clock text is updated and the animations keep running.
        var key = [id, cfg.model(id), running ? 'run' : st.c, st.t, (s && s.lat ? s.lat.slice(-6) : []).join(',')].join('|');
        if (running && b._hzKey === key && b.firstChild) {
            var rd = b.querySelector('.hzb-read');
            if (rd) { rd.textContent = runningRead(); return; }
        }
        b._hzKey = key;
        var pill = el('span', 'hzb-pill' + (running ? ' busy' : ''));
        pill.style.setProperty('--pc', colorOf(id));
        b.replaceChildren(pill);
        var dot = el('i', 'hzu-dot ' + (running ? 'run' : st.c));
        dot.style.setProperty('--pc', colorOf(id));
        pill.appendChild(dot);
        pill.appendChild(el('span', 'hzb-name', p.name));
        var md = cfg.model(id);   // V1.67.9: the model is not drawn in the pill any more (the reply shows provider + model)
        var lat = s && s.lat ? s.lat.slice(-6) : [];
        if (lat.length > 1) {
            var hi = Math.max.apply(null, lat), lo = Math.min.apply(null, lat), span = Math.max(1, hi - lo);
            var bars = el('span', 'hzb-bars');
            bars.setAttribute('aria-hidden', 'true');
            lat.forEach(function (v) {
                var bar = document.createElement('i');
                bar.style.height = Math.round(3 + ((v - lo) / span) * 9) + 'px';
                bars.appendChild(bar);
            });
            pill.appendChild(bars);
        }
        var out;
        /* V1.76.0: the header pill shows tokens in/out and the reply time in ms on its one line */
        window.HzLast = (!running && s && s.lastTurn) ? { i: s.lastTurn.i, o: s.lastTurn.o, ms: s.lastTurn.ms, est: !!s.lastTurn.est } : null;
        if (running) out = runningRead();
        else {
            var lt = s && s.lastTurn;
            if (lt) out = (lt.est ? '~' : '') + '\u2191' + fmtTok(lt.i) + ' \u2193' + fmtTok(lt.o) + ' ' + fmtMs(lt.ms);
            else out = st.t === 'NO KEY' ? 'no key' : 'ready';
        }
        pill.appendChild(el('span', 'hzb-sep'));
        pill.appendChild(el('span', 'hzb-read', out));
        var td = todayOf(id);
        b.title = p.name + ' ' + md + ' \u00b7 ' + st.t.toLowerCase() + ' \u00b7 today ' + td.r + ' request' + (td.r === 1 ? '' : 's') + ', ' + fmtTok(td.i + td.o) + ' tokens';
        b.setAttribute('aria-label', 'Usage and engine dashboard. ' + p.name + ' ' + md + '. ' + (running ? 'Thinking ' : '') + out);
    }

    /* ---------- network (IP + place), looked up only when the page is open ---------- */
    function fetchJSON(url, ms) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms);
        return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
            clearTimeout(to);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json();
        }, function (e) { clearTimeout(to); throw e; });
    }
    function netRefresh() {
        if (net.busy) return;
        net.busy = true; net.err = '';
        if (visible()) render();
        fetchJSON('https://ipwho.is/', 9000).then(function (j) {
            if (!j || j.success === false || !j.ip) throw new Error((j && j.message) || 'No answer');
            return {
                ip: j.ip, city: j.city || '', region: j.region || '', country: j.country || '', cc: j.country_code || '',
                lat: j.latitude, lon: j.longitude,
                isp: (j.connection && (j.connection.isp || j.connection.org)) || '',
                asn: (j.connection && j.connection.asn) || '',
                tz: (j.timezone && j.timezone.id) || '', src: 'ipwho.is'
            };
        }).catch(function () {
            return fetchJSON('https://ipapi.co/json/', 9000).then(function (j) {
                if (!j || j.error || !j.ip) throw new Error((j && j.reason) || 'No answer');
                return { ip: j.ip, city: j.city || '', region: j.region || '', country: j.country_name || '', cc: j.country_code || '',
                    lat: j.latitude, lon: j.longitude, isp: j.org || '', asn: j.asn || '', tz: j.timezone || '', src: 'ipapi.co' };
            });
        }).then(function (d) { net.data = d; net.at = Date.now(); net.err = ''; },
            function (e) { net.err = (e && e.name === 'AbortError') ? 'Timed out. Check your connection.' : 'Could not look up your IP: ' + shortErr(e && e.message); })
            .then(function () { net.busy = false; if (visible()) render(); });
    }

    /* ---------- key check ---------- */
    function checkKeys() {
        if (chkBusy) return;
        chkBusy = true; render();
        var jobs = cfg.ids.filter(function (id) { return cfg.hasKey(id); }).map(function (id) {
            var t0 = Date.now();
            return Promise.resolve().then(function () { return cfg.fetchModels(id, cfg.keyOf(id)); }).then(function () {
                prov(id).chk = { ok: true, ms: Date.now() - t0, at: Date.now(), err: '', status: 0 };
            }, function (e) {
                prov(id).chk = { ok: false, ms: Date.now() - t0, at: Date.now(), err: shortErr(e && e.message), status: (e && e.status) || 0 };
            });
        });
        Promise.all(jobs).then(function () { chkBusy = false; save(); paintBadge(); render(); });
    }

    /* ---------- drawing ---------- */
    function visible() { return !!(root && root.isConnected && root.offsetParent !== null); }

    function spark(vals, color, h, bad) {
        var w = 220;
        var svg = svgEl('svg', { viewBox: '0 0 ' + w + ' ' + h, class: 'hzu-spark', preserveAspectRatio: 'none', role: 'img', 'aria-label': 'Response time trend' });
        if (!vals.length) { svg.appendChild(svgEl('line', { x1: 0, y1: h / 2, x2: w, y2: h / 2, stroke: 'currentColor', 'stroke-opacity': '.25', 'stroke-dasharray': '3 4' })); return svg; }
        var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), span = Math.max(1, max - min);
        var step = vals.length > 1 ? w / (vals.length - 1) : 0;
        var pts = vals.map(function (v, i) { return (vals.length > 1 ? (i * step) : w / 2).toFixed(1) + ',' + (h - 4 - ((v - min) / span) * (h - 8)).toFixed(1); });
        svg.appendChild(svgEl('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': '2', 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }));
        var last = pts[pts.length - 1].split(',');
        svg.appendChild(svgEl('circle', { cx: last[0], cy: last[1], r: '3', fill: color }));
        if (bad) bad.forEach(function (i) {
            var q = pts[i].split(',');
            svg.appendChild(svgEl('circle', { cx: q[0], cy: q[1], r: '3', fill: '#ef4444' }));
        });
        return svg;
    }

    function section(title, sub) {
        var s = el('section', 'hzu-sec');
        s.appendChild(el('h4', 'hzu-h', title));
        if (sub) s.appendChild(el('p', 'hzu-sub', sub));
        return s;
    }
    function kv(k, v, cls) {
        var r = el('div', 'hzu-kv');
        r.appendChild(el('span', 'k', k));
        r.appendChild(el('span', 'v' + (cls ? ' ' + cls : ''), v));
        return r;
    }
    function pill(st) { return el('span', 'hzu-pill ' + st.c, st.t); }
    function todayOf(id) { var d = store.d[dayKey()]; return (d && d[id]) || { r: 0, e: 0, i: 0, o: 0 }; }

    function drawActive(host) {
        var id = cfg.active(), p = cfg.providers[id], s = prov(id), st = status(id), td = todayOf(id);
        var sec = section('ENGINE NOW');
        var top = el('div', 'hzu-eng');
        var dot = el('i', 'hzu-dot ' + st.c); dot.style.setProperty('--pc', colorOf(id));
        top.appendChild(dot);
        var tx = el('div', 'hzu-eng-t');
        tx.appendChild(el('b', null, p.name));
        tx.appendChild(el('small', null, cfg.model(id) || ''));
        top.appendChild(tx); top.appendChild(pill(st));
        sec.appendChild(top);
        var lt = s.lastTurn;
        var grid = el('div', 'hzu-grid');
        grid.appendChild(kv('Last reply', lt ? fmtMs(lt.ms) : '\u2014'));
        grid.appendChild(kv('Last tokens', lt ? (lt.est ? '~' : '') + fmtTok(lt.i) + ' in \u00b7 ' + fmtTok(lt.o) + ' out' : '\u2014'));
        grid.appendChild(kv('Today', td.r + ' request' + (td.r === 1 ? '' : 's')));
        grid.appendChild(kv('Today tokens', fmtTok(td.i + td.o)));
        sec.appendChild(grid);
        host.appendChild(sec);
    }

    function drawEngines(host) {
        var sec = section('PER PROVIDER', 'Tokens marked ~ are estimated when a provider does not report them.');
        cfg.ids.forEach(function (id) {
            var p = cfg.providers[id], s = prov(id), st = status(id), td = todayOf(id);
            var card = el('div', 'hzu-card');
            card.style.setProperty('--pc', colorOf(id));
            var head = el('div', 'hzu-card-h');
            var dot = el('i', 'hzu-dot ' + st.c); dot.style.setProperty('--pc', colorOf(id));
            head.appendChild(dot);
            head.appendChild(el('b', null, p.name));
            head.appendChild(pill(st));
            card.appendChild(head);
            var avg = s.okN ? Math.round(s.sumMs / s.okN) : 0;
            var last = s.lat.length ? s.lat[s.lat.length - 1] : 0;
            var g = el('div', 'hzu-grid');
            g.appendChild(kv('Latency', s.okN ? fmtMs(last) + ' last \u00b7 ' + fmtMs(avg) + ' avg' : '\u2014'));
            g.appendChild(kv('Tokens', (s.est ? '~' : '') + fmtTok(s.i) + ' in \u00b7 ' + fmtTok(s.o) + ' out'));
            g.appendChild(kv('Today', td.r + ' req' + (td.e ? ' \u00b7 ' + td.e + ' failed' : '')));
            g.appendChild(kv('All time', s.req + ' req' + (s.err ? ' \u00b7 ' + s.err + ' failed' : '')));
            card.appendChild(g);
            var bad = [];
            card.appendChild(spark(s.lat, colorOf(id), 34, bad));
            if (s.last && !s.last.ok && s.last.err) card.appendChild(el('p', 'hzu-err', 'Last error: ' + s.last.err));
            sec.appendChild(card);
        });
        host.appendChild(sec);
    }

    function drawDays(host) {
        var sec = section('REQUESTS PER DAY', 'Last 7 days, all providers.');
        var days = [];
        for (var i = 6; i >= 0; i--) { var t = Date.now() - i * 86400000; days.push({ k: dayKey(t), lab: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }) }); }
        var totals = days.map(function (d) {
            var row = store.d[d.k] || {}, n = 0;
            Object.keys(row).forEach(function (id) { n += row[id].r; });
            return n;
        });
        var max = Math.max(1, Math.max.apply(null, totals));
        var W = 300, H = 120, bw = 28, gap = (W - bw * 7) / 6;
        var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + (H + 20), class: 'hzu-bars', role: 'img', 'aria-label': 'Requests per day for the last 7 days' });
        days.forEach(function (d, ix) {
            var x = ix * (bw + gap), y = H, row = store.d[d.k] || {};
            cfg.ids.forEach(function (id) {
                var n = row[id] ? row[id].r : 0;
                if (!n) return;
                var hh = (n / max) * (H - 16);
                y -= hh;
                svg.appendChild(svgEl('rect', { x: x.toFixed(1), y: y.toFixed(1), width: bw, height: hh.toFixed(1), rx: 3, fill: colorOf(id) }));
            });
            if (!totals[ix]) svg.appendChild(svgEl('rect', { x: x.toFixed(1), y: H - 2, width: bw, height: 2, rx: 1, fill: 'currentColor', 'fill-opacity': '.2' }));
            var tn = svgEl('text', { x: (x + bw / 2).toFixed(1), y: (y - 4).toFixed(1), 'text-anchor': 'middle', class: 'hzu-bt' });
            tn.textContent = totals[ix] ? String(totals[ix]) : '';
            svg.appendChild(tn);
            var tl = svgEl('text', { x: (x + bw / 2).toFixed(1), y: H + 14, 'text-anchor': 'middle', class: 'hzu-bl' });
            tl.textContent = d.lab;
            svg.appendChild(tl);
        });
        sec.appendChild(svg);
        var lg = el('div', 'hzu-legend');
        cfg.ids.forEach(function (id) {
            var it = el('span', 'hzu-lg');
            var sw = el('i'); sw.style.background = colorOf(id);
            it.appendChild(sw); it.appendChild(document.createTextNode(cfg.providers[id].name));
            lg.appendChild(it);
        });
        sec.appendChild(lg);
        host.appendChild(sec);
    }

    function drawTimes(host) {
        var sec = section('RESPONSE TIMES', 'Your last ' + MAXT + ' replies. Red dots are failures.');
        var ok = store.t.map(function (x) { return x.ms; });
        var badIx = [];
        store.t.forEach(function (x, i) { if (!x.ok) badIx.push(i); });
        sec.appendChild(spark(ok, 'var(--hzu-ink)', 56, badIx));
        if (ok.length) {
            var good = store.t.filter(function (x) { return x.ok; }).map(function (x) { return x.ms; });
            var g = el('div', 'hzu-grid');
            if (good.length) {
                g.appendChild(kv('Fastest', fmtMs(Math.min.apply(null, good))));
                g.appendChild(kv('Slowest', fmtMs(Math.max.apply(null, good))));
                g.appendChild(kv('Average', fmtMs(good.reduce(function (a, b) { return a + b; }, 0) / good.length)));
            }
            g.appendChild(kv('Failed', String(badIx.length)));
            sec.appendChild(g);
        } else sec.appendChild(el('p', 'hzu-sub', 'Send a message and the line starts drawing.'));
        host.appendChild(sec);
    }

    function drawKeys(host) {
        var sec = section('KEYS: LIVE OR FAILING', 'Live means the last real request or check worked.');
        cfg.ids.forEach(function (id) {
            var p = cfg.providers[id], st = status(id), s = store.p[id], ev = newest(s && s.last, s && s.chk);
            var row = el('div', 'hzu-key');
            var dot = el('i', 'hzu-dot ' + st.c); dot.style.setProperty('--pc', colorOf(id));
            row.appendChild(dot);
            var tx = el('div', 'hzu-key-t');
            tx.appendChild(el('b', null, p.name));
            var sm = p.keyless ? 'No key needed' : p.optionalKey ? 'Key optional' : (cfg.hasKey(id) ? 'Key saved' : 'No key saved');
            if (ev) sm += ' \u00b7 ' + (ev.ok ? 'worked' : 'failed') + ' ' + new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + (ev.ok ? ' \u00b7 ' + fmtMs(ev.ms) : '');
            tx.appendChild(el('small', null, sm));
            if (ev && !ev.ok && ev.err) tx.appendChild(el('small', 'bad', ev.err));
            row.appendChild(tx);
            row.appendChild(pill(st));
            if (!cfg.hasKey(id)) { row.classList.add('tap'); row.addEventListener('click', function () { cfg.openKeys(); }); }
            sec.appendChild(row);
        });
        var b = el('button', 'hzu-btn', chkBusy ? 'Checking keys...' : 'Check all keys now');
        b.type = 'button'; b.disabled = chkBusy;
        b.addEventListener('click', checkKeys);
        sec.appendChild(b);
        host.appendChild(sec);
    }

    /* ---------- V1.99.56 APIzone: independent provider status (https://apizone.io/api/v1/status, no key, 60 req/min) ---------- */
    /* APZ:BEGIN */
    var APZ_ALIAS = {
        gemini: ['googleai', 'googlegemini', 'googleaistudio'],
        cloudflare: ['cloudflareworkersai', 'workersai'],
        github: ['githubmodels'],
        openrouter: ['openrouterai'],
        huggingface: ['hf', 'huggingfaceinference'],
        zai: ['zhipu', 'zhipuai']
    };
    function apzNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
    function apzList(j) {
        var a = j;
        if (j && !Array.isArray(j)) {
            a = j.services || j.apis || j.data || j.items || j.results || j.statuses || null;
            if (a && !Array.isArray(a) && typeof a === 'object') {
                var map = a;
                a = Object.keys(map).map(function (k) { var v = map[k]; return (v && typeof v === 'object') ? Object.assign({ slug: k }, v) : { slug: k, status: v }; });
            }
        }
        return Array.isArray(a) ? a : [];
    }
    function apzState(v) {
        if (v && typeof v === 'object') v = v.indicator || v.status || v.state || v.name || '';
        var s = String(v == null ? '' : v).toLowerCase();
        if (/^(up|ok|operational|healthy|online|available|none|good)$/.test(s)) return { t: 'UP', c: 'live' };
        if (/degrad|partial|slow|minor|elevated|limited/.test(s)) return { t: 'DEGRADED', c: 'warn' };
        if (/down|outage|major|critical|offline|fail|unavailable/.test(s)) return { t: 'DOWN', c: 'bad' };
        return { t: s ? s.toUpperCase().slice(0, 10) : 'UNKNOWN', c: 'off' };
    }
    function apzMs(x) {
        var v = x.latency_ms != null ? x.latency_ms : x.latencyMs != null ? x.latencyMs : x.latency != null ? x.latency : x.response_time != null ? x.response_time : x.responseTime;
        if (v && typeof v === 'object') v = v.ms || v.p50 || v.avg;
        v = Number(v);
        return isFinite(v) && v > 0 ? Math.round(v) : 0;
    }
    function apzFind(list, id, name) {
        var keys = [apzNorm(id), apzNorm(name)].concat((APZ_ALIAS[id] || []).map(apzNorm)).filter(function (k) { return k.length >= 3; });
        var best = null, bestScore = 0;
        list.forEach(function (it) {
            var sl = apzNorm(it.slug || it.id || it.key), nm = apzNorm(it.name || it.title || it.label), sc = 0;
            keys.forEach(function (k) {
                if (sl === k || nm === k) sc = Math.max(sc, 3);
                else if (sl.indexOf(k) === 0 || nm.indexOf(k) === 0) sc = Math.max(sc, 2);
                else if (k.length >= 5 && (sl.indexOf(k) >= 0 || nm.indexOf(k) >= 0)) sc = Math.max(sc, 1);
            });
            if (sc > bestScore) { best = it; bestScore = sc; }
        });
        return best;
    }
    function apzRows(list, ids, providers) {
        var rows = [];
        ids.forEach(function (id) {
            var p = providers[id]; if (!p) return;
            var it = apzFind(list, id, p.name); if (!it) return;
            var st = apzState(it.status != null ? it.status : (it.state != null ? it.state : it.health));
            rows.push({ id: id, name: p.name, label: String(it.name || it.slug || id), st: st, ms: apzMs(it) });
        });
        return rows;
    }
    /* APZ:END */
    var apz = { busy: false, rows: null, total: 0, err: '', at: 0 };
    function apzRefresh() {
        if (apz.busy || !cfg) return;
        apz.busy = true; apz.err = '';
        if (visible()) render();
        fetchJSON('https://apizone.io/api/v1/status', 12000).then(function (j) {
            var list = apzList(j);
            if (!list.length) throw new Error('APIzone sent an empty answer');
            apz.total = list.length; apz.rows = apzRows(list, cfg.ids, cfg.providers); apz.at = Date.now();
        }).catch(function (e) {
            apz.err = (e && e.name === 'AbortError') ? 'APIzone timed out. Check your connection.' : 'Could not reach APIzone: ' + shortErr(e && e.message);
        }).then(function () { apz.busy = false; if (visible()) render(); paintCards(); });
    }
    function drawApz(host) {
        var sec = section('PROVIDER STATUS (APIZONE)', 'Independent probes by apizone.io. Can differ from a provider\u2019s own status page.');
        if (apz.busy && !apz.rows) sec.appendChild(el('p', 'hzu-sub', 'Checking APIzone...'));
        if (apz.rows) {
            apz.rows.forEach(function (r) {
                var row = el('div', 'hzu-key');
                var dot = el('i', 'hzu-dot ' + r.st.c); dot.style.setProperty('--pc', colorOf(r.id));
                row.appendChild(dot);
                var tx = el('div', 'hzu-key-t');
                tx.appendChild(el('b', null, r.name));
                tx.appendChild(el('small', null, 'APIzone: ' + r.label + (r.ms ? ' \u00b7 ' + fmtMs(r.ms) : '')));
                row.appendChild(tx); row.appendChild(pill(r.st));
                sec.appendChild(row);
            });
            if (!apz.rows.length) sec.appendChild(el('p', 'hzu-sub', 'None of your AIs are on the APIzone list.'));
            sec.appendChild(el('p', 'hzu-sub', apz.total + ' APIs monitored \u00b7 updated ' + new Date(apz.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
        }
        if (apz.err) sec.appendChild(el('p', 'hzu-err', apz.err));
        var b = el('button', 'hzu-btn', apz.busy ? 'Checking...' : 'Refresh provider status');
        b.type = 'button'; b.disabled = apz.busy;
        b.addEventListener('click', apzRefresh);
        sec.appendChild(b);
        host.appendChild(sec);
    }

    function drawNet(host) {
        var sec = section('NETWORK', 'Looked up from your public IP when this page opens. Nothing here is saved.');
        var d = net.data;
        if (net.busy && !d) sec.appendChild(el('p', 'hzu-sub', 'Looking up your IP...'));
        if (d) {
            var place = [d.city, d.region, d.country].filter(Boolean).join(', ') || 'Unknown';
            sec.appendChild(kv('IP address', d.ip, 'mono'));
            sec.appendChild(kv('Place', place + (d.cc ? ' (' + d.cc + ')' : '')));
            var coords = (typeof d.lat === 'number' && typeof d.lon === 'number') ? d.lat.toFixed(4) + ', ' + d.lon.toFixed(4) : 'Unknown';
            sec.appendChild(kv('Coordinates', coords, 'mono'));
            if (d.isp) sec.appendChild(kv('Network', d.isp + (d.asn ? ' (AS' + d.asn + ')' : '')));
            if (d.tz) sec.appendChild(kv('Time zone', d.tz));
            sec.appendChild(el('p', 'hzu-sub', 'Approximate, from the IP address. Source ' + d.src + ', ' + new Date(net.at).toLocaleTimeString() + '.'));
        }
        if (net.err) sec.appendChild(el('p', 'hzu-err', net.err));
        var b = el('button', 'hzu-btn', net.busy ? 'Looking up...' : 'Refresh network');
        b.type = 'button'; b.disabled = net.busy;
        b.addEventListener('click', netRefresh);
        sec.appendChild(b);
        host.appendChild(sec);
    }

    function drawReset(host) {
        var b = el('button', 'hzu-btn ghost', wipeArm ? 'Tap again to wipe all stats' : 'Reset usage stats');
        b.type = 'button';
        b.addEventListener('click', function () {
            if (!wipeArm) { wipeArm = 1; render(); setTimeout(function () { wipeArm = 0; if (visible()) render(); }, 4000); return; }
            wipeArm = 0; store = { p: {}, d: {}, t: [] }; save(); paintBadge(); render();
        });
        host.appendChild(b);
    }

    function render() {
        root = document.getElementById('hzUsage');
        if (!root || !cfg) return;
        var sc = document.getElementById('rightPanel'), y = sc ? sc.scrollTop : 0;
        var host = document.createDocumentFragment();
        drawActive(host); drawEngines(host); drawDays(host); drawTimes(host); drawKeys(host); drawApz(host); drawNet(host); drawReset(host);
        root.replaceChildren(host);
        if (sc && y) sc.scrollTop = y;
    }

    function open() {
        root = document.getElementById('hzUsage');
        render();
        if (!net.data || Date.now() - net.at > 60000) netRefresh();
        if (!apz.rows || Date.now() - apz.at > 300000) apzRefresh();
    }

    function bind(c) {
        cfg = c;
        var b = badgeEl();
        if (b && !b.dataset.bound) { b.dataset.bound = '1'; b.addEventListener('click', function () {
            var gids = typeof cfg.group === 'function' ? cfg.group() : null;
            if (gids && gids.length > 1 && !b.dataset.pass && window.HorizonGroup && HorizonGroup.menu) { HorizonGroup.menu(b, 'below'); return; }
            cfg.openDash();
        }); }
        paintBadge();
    }


    /* ---------- V1.99.99: a usage card inside every provider card (Settings > API PROVIDERS PLUS KEYS) ----------
       Collapsed card: one line + a thin bar stay under the title. Expanded card: the full usage card.
       The bar shows tokens used today. With a daily token limit set it is "% of your limit" (amber from 80%, red at 100%),
       with no limit it is "% of all AI use today" (this provider's share of every provider's tokens today). */
    var LIM_KEY = 'horizon_usage_limits';
    var cards = {};
    function limitsGet() { try { var v = JSON.parse(localStorage.getItem(LIM_KEY)); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
    function limitSet(id, n) { var v = limitsGet(); if (n > 0) v[id] = Math.round(n); else delete v[id]; try { localStorage.setItem(LIM_KEY, JSON.stringify(v)); } catch (e) { /* full */ } }
    function usageOf(id) {
        var td = todayOf(id), tot = 0;
        cfg.ids.forEach(function (k) { var t = todayOf(k); tot += t.i + t.o; });
        var used = td.i + td.o, lim = limitsGet()[id] || 0;
        var pct = lim ? (used / lim) * 100 : (tot ? (used / tot) * 100 : 0);
        return { td: td, used: used, tot: tot, lim: lim, pct: pct };
    }
    function pctTxt(p) { return p > 0 && p < 1 ? '<1%' : Math.round(p) + '%'; }
    function lineOf(u) {
        if (u.lim) return fmtTok(u.used) + ' of ' + fmtTok(u.lim) + ' tokens today \u00b7 ' + pctTxt(u.pct) + ' of limit';
        return fmtTok(u.used) + ' tokens today \u00b7 ' + pctTxt(u.pct) + ' of all AI use';
    }
    function barEl(id, u) {
        var b = el('div', 'hzu-ubar'); b.setAttribute('role', 'progressbar');
        b.setAttribute('aria-valuemin', '0'); b.setAttribute('aria-valuemax', '100'); b.setAttribute('aria-valuenow', String(Math.min(100, Math.round(u.pct))));
        var f = el('i', 'hzu-ufill' + (u.lim && u.pct >= 100 ? ' bad' : (u.lim && u.pct >= 80 ? ' warn' : '')));
        f.style.width = Math.max(u.used ? 2 : 0, Math.min(100, u.pct)) + '%';
        f.style.setProperty('--pc', colorOf(id));
        b.appendChild(f);
        return b;
    }
    function paintCard(id) {
        var m = cards[id]; if (!m || !cfg || !cfg.providers[id]) return;
        var u = usageOf(id), s = prov(id), st = status(id);
        /* header line (still visible when the card is collapsed) */
        m.mini.replaceChildren(el('span', 'hzu-uline', lineOf(u)), barEl(id, u));
        /* full card */
        var f = el('div', 'hzu-ucard'); f.style.setProperty('--pc', colorOf(id));
        var top = el('div', 'hzu-utop');
        top.appendChild(el('b', null, 'Usage')); top.appendChild(pill(st));
        f.appendChild(top);
        f.appendChild(el('div', 'hzu-ubig', pctTxt(u.pct)));
        f.appendChild(el('p', 'hzu-usub', u.lim ? 'of your daily limit used today' : 'of all AI use today (set a daily limit below to track against it)'));
        f.appendChild(barEl(id, u));
        var g = el('div', 'hzu-grid');
        g.appendChild(kv('Tokens today', fmtTok(u.used) + ' (' + fmtTok(u.td.i) + ' in \u00b7 ' + fmtTok(u.td.o) + ' out)'));
        g.appendChild(kv('Requests today', u.td.r + (u.td.e ? ' \u00b7 ' + u.td.e + ' failed' : '')));
        g.appendChild(kv('All time', (s.est ? '~' : '') + fmtTok(s.i + s.o) + ' tokens \u00b7 ' + s.req + ' req'));
        var avg = s.okN ? Math.round(s.sumMs / s.okN) : 0;
        g.appendChild(kv('Speed', s.okN ? fmtMs(avg) + ' avg' : '\u2014'));
        f.appendChild(g);
        /* last 7 days of tokens */
        var days = [], mx = 1;
        for (var i = 6; i >= 0; i--) { var t = Date.now() - i * 86400000, d = store.d[dayKey(t)], v = d && d[id] ? d[id].i + d[id].o : 0; days.push({ v: v, lab: new Date(t).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2) }); if (v > mx) mx = v; }
        var wk = el('div', 'hzu-uweek'); wk.setAttribute('aria-label', 'Tokens per day, last 7 days');
        days.forEach(function (d) {
            var col = el('div', 'hzu-ucol'); var bar = el('i'); bar.style.height = Math.max(d.v ? 8 : 3, Math.round((d.v / mx) * 100)) + '%'; if (!d.v) bar.className = 'zero';
            col.appendChild(bar); col.appendChild(el('span', null, d.lab)); wk.appendChild(col);
        });
        f.appendChild(el('div', 'hzu-ulab', 'LAST 7 DAYS (TOKENS)')); f.appendChild(wk);
        /* APIzone status for this provider (filled when the list has been fetched) */
        var az = apz.rows && apz.rows.filter(function (r) { return r.id === id; })[0];
        if (az) f.appendChild(kv('Provider status', az.st.t + (az.ms ? ' \u00b7 ' + fmtMs(az.ms) : '')));
        /* optional daily limit */
        var lr = el('label', 'hzu-ulim'); lr.appendChild(el('span', null, 'Daily token limit (optional)'));
        var inp = el('input'); inp.type = 'number'; inp.min = '0'; inp.step = '1000'; inp.inputMode = 'numeric'; inp.placeholder = 'No limit'; inp.value = u.lim ? String(u.lim) : '';
        inp.setAttribute('aria-label', cfg.providers[id].name + ' daily token limit');
        inp.addEventListener('change', function () { limitSet(id, parseInt(inp.value, 10) || 0); paintCard(id); });
        lr.appendChild(inp); f.appendChild(lr);
        if (s.last && !s.last.ok && s.last.err) f.appendChild(el('p', 'hzu-err', 'Last error: ' + s.last.err));
        var keep = m.full.contains(document.activeElement) && document.activeElement.tagName === 'INPUT';
        if (keep) return;   // never rebuild while the limit box is being typed in
        m.full.replaceChildren(f);
    }
    function paintCards() { Object.keys(cards).forEach(paintCard); }
    function mount(card, id) {
        if (!card || cards[id] || !cfg) return;
        var content = card.querySelector('.settings-row-content'); if (!content) return;
        var mini = el('div', 'hzu-umini');
        content.appendChild(mini);
        var full = el('div', 'hzu-ufull');
        var bar = card.querySelector('.health-bar');
        if (bar && bar.nextSibling) card.insertBefore(full, bar.nextSibling); else card.appendChild(full);
        cards[id] = { mini: mini, full: full };
        paintCard(id);
    }
    function mountAll(map) { Object.keys(map).forEach(function (id) { mount(map[id], id); }); }
    function cardsOpen() { paintCards(); if (!apz.rows || Date.now() - apz.at > 300000) apzRefresh(); }

    window.HzUsage = { mount: mount, mountAll: mountAll, cards: cardsOpen, tokens: tokens, limitedNow: limitedNow, bind: bind, begin: begin, end: end, badge: paintBadge, open: open, apz: { list: apzList, state: apzState, find: apzFind, rows: apzRows }, render: function () { if (visible()) render(); } };
})();
