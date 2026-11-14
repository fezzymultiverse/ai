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
    var COLORS = { gemini: '#4f8cff', groq: '#f97316', cohere: '#a855f7', mistral: '#ff8205', openrouter: '#8b5cf6', anyapi: '#22d3ee', gonka: '#fbbf24', routeway: '#a78bfa', requesty: '#2dd4bf', githubmodels: '#c084fc', kilo: '#facc15', ovh: '#60a5fa', llm7: '#38bdf8', cloudflare: '#f6821f', pollinations: 'var(--neon)' };
    var EXTRA = ['#06b6d4', '#eab308', '#ec4899', '#14b8a6'];
    var cfg = null, live = null, tick = 0, saveT = 0, root = null;
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
        live = { id: id, model: model, t0: Date.now(), estIn: 0 };
        clearInterval(tick);
        tick = setInterval(function () { if (document.hidden) return; paintBadge(); }, 250);
        paintBadge();
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
        s.last = { ok: !!r.ok, ms: r.ms, at: Date.now(), err: r.ok ? '' : shortErr(r.err), status: r.status || 0, model: model };
        store.t.push({ id: id, ms: r.ms, ok: !!r.ok }); if (store.t.length > MAXT) store.t.shift();
        prune(); save(); paintBadge(); if (visible()) render();
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
        var running = !!(live && ids.indexOf(live.id) >= 0);
        window.HzLast = null;   /* V1.76.0: no tokens + ms readout in a group pill */
        var names = ids.map(function (i) { return cfg.providers[i] ? cfg.providers[i].name : i; });
        var key = ['G', ids.join(','), running ? 'run:' + live.id : 'idle'].join('|');
        if (running && b._hzKey === key && b.firstChild) {
            var rd0 = b.querySelector('.hzb-read');
            if (rd0) { rd0.textContent = fmtMs(Date.now() - live.t0); return; }
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
        pill.appendChild(el('span', 'hzb-name', 'Options'));
        var joined = names.join(' + ');
        var out = running ? fmtMs(Date.now() - live.t0) : 'Options';
        if (running) { pill.appendChild(el('span', 'hzb-sep')); pill.appendChild(el('span', 'hzb-read', out)); }
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
        // V1.43.2: while a reply runs this repaints every 250 ms. Rebuilding the pill each time restarted its sliding bar and pulsing dot
        // before they could move. If nothing but the clock changed, only the clock text is updated and the animations keep running.
        var key = [id, cfg.model(id), running ? 'run' : st.c, st.t, (s && s.lat ? s.lat.slice(-6) : []).join(',')].join('|');
        if (running && b._hzKey === key && b.firstChild) {
            var rd = b.querySelector('.hzb-read');
            if (rd) { rd.textContent = fmtMs(Date.now() - live.t0); return; }
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
        if (running) out = fmtMs(Date.now() - live.t0);
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
        drawActive(host); drawEngines(host); drawDays(host); drawTimes(host); drawKeys(host); drawNet(host); drawReset(host);
        root.replaceChildren(host);
        if (sc && y) sc.scrollTop = y;
    }

    function open() {
        root = document.getElementById('hzUsage');
        render();
        if (!net.data || Date.now() - net.at > 60000) netRefresh();
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

    window.HzUsage = { limitedNow: limitedNow, bind: bind, begin: begin, end: end, badge: paintBadge, open: open, render: function () { if (visible()) render(); } };
})();
