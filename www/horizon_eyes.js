/* HORIZON V1.99.147: EYES 3. The pictures-for-blind-models layer. V1.99.147 added the ON-PHONE READER (horizon_sight.js: offline OCR, layout and
 * measurements), so a text-only model gets real sight with NO provider call. A vision provider is used only if the helper readers are switched back on.
 *
 * HORIZON V1.99.136: EYES 2. Real pictures for models that cannot see them (ch.at, Groq text models, most free models).
 *
 * V1.99.135 gave a text-only model ONE description of a picture. A description is a blind person asking "what colour is yellow":
 * the model could not look again, could not zoom, and every colour was only a word. This module fixes that with four things:
 *
 *   1. REAL PIXEL FACTS. The app measures the picture itself (canvas): size, brightness, the exact palette in hex with percentages,
 *      and the dominant colour of each of the 9 cells of a 3x3 grid. No vision model is involved, so these numbers cannot be invented.
 *   2. FOLLOW-UP QUESTIONS.  [[see.ask: n | question]]  The chat model asks; the on-phone reader answers from the real picture (a vision model only if helpers are on).
 *   3. ZOOM.                 [[see.zoom: n | region | question]]  The app crops and enlarges the region and re-reads it, so small text is readable.
 *   3b. FIND.                [[see.find: n | words]]  Where those words are on the picture, with the text and background colour there.
 *   4. EXACT COLOUR.         [[see.color: n | x%,y%]]  The measured pixel colour (hex, rgb, name) at that point. Never a guess.
 *   And the app's own screen:  [[see.ui]] the live UI map (real element names, sizes, colours, contrast, problems) and
 *                              [[see.shot]] a fresh screenshot (private fields blurred) that is then measured and read.
 *
 * Pictures live in memory for this session only (last 8 per chat), never in storage. Vision reads go to the vision provider the
 * user already has (chosen in index.html). Everything a vision model returns is labelled as its reading, not as fact.
 * Kill switch for the tools: localStorage horizon_eyes_tools = '0'.
 */
(function () {
    'use strict';

    var VERSION = '1.99.147';
    var LS_ON = 'horizon_eyes_tools';
    var MAX_PICS = 8, MAX_TEXT = 3000;
    var host = {
        ask: null,                                   // async (g, prompt, minLen) -> { text, via } | null   (set by index.html)
        chatId: function () { return ''; },
        canSee: function () { return false; },       // can the ACTIVE chat model see pictures itself
        ready: function () { return false; },        // is any vision provider ready to read for it
        native: null
    };
    var stores = new Map();                          // chatId -> { list: [{ n, g, key, via, desc, facts }], next }
    var factCache = new Map();

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function isOn() { return lsGet(LS_ON) !== '0'; }
    function setOn(on) { try { localStorage.setItem(LS_ON, on ? '1' : '0'); } catch (e) { /* storage blocked */ } }
    function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '\u2026' : s; }
    function clean(s) {
        return String(s == null ? '' : s).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').replace(/\[\[/g, '[ [').replace(/\]\]/g, '] ]').trim();
    }
    var keyOf = function (g) { return String(g.mime) + ':' + g.b64.length + ':' + g.b64.slice(0, 48) + g.b64.slice(-48); };
    function sight() { return window.HorizonSight && window.HorizonSight.available && window.HorizonSight.available() ? window.HorizonSight : null; }
    function localReady() { return !!sight(); }
    function visionReady() { return !!(host.ask && host.ready && host.ready()); }

    /* ---------- colour maths (pure, testable) ---------- */
    function hex2(v) { return ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2).toUpperCase(); }
    function toHex(r, g, b) { return '#' + hex2(r) + hex2(g) + hex2(b); }
    function hsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0, d = mx - mn;
        if (d > 0) {
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
            h *= 60;
        }
        return { h: h, s: s, l: l };
    }
    function nameColor(r, g, b) {
        var c = hsl(r, g, b), h = c.h, s = c.s, l = c.l;
        if (l < 0.09) return 'black';
        if (l > 0.94) return 'white';
        if (s < 0.1) return l < 0.3 ? 'dark grey' : l < 0.65 ? 'grey' : 'light grey';
        var base;
        if (h < 15 || h >= 345) base = 'red';
        else if (h < 40) base = 'orange';
        else if (h < 68) base = 'yellow';
        else if (h < 95) base = 'lime';
        else if (h < 165) base = 'green';
        else if (h < 195) base = 'teal';
        else if (h < 215) base = 'cyan';
        else if (h < 255) base = 'blue';
        else if (h < 285) base = 'purple';
        else if (h < 330) base = 'magenta';
        else base = 'pink';
        if ((base === 'orange' || base === 'yellow' || base === 'red') && l < 0.36 && s < 0.9 && h >= 10 && h < 50) return 'brown';
        if (base === 'red' && l > 0.7) return 'pink';
        if (base === 'orange' && l > 0.75) return 'peach';
        if (base === 'yellow' && l < 0.4) return 'olive';
        if (l < 0.22) return 'dark ' + base;
        if (l > 0.78) return 'light ' + base;
        return base;
    }
    function dist(a, b) { var x = a.r - b.r, y = a.g - b.g, z = a.b - b.b; return Math.sqrt(x * x + y * y + z * z); }
    // Palette of a rectangle of RGBA pixels. Buckets are 4 bits per channel, then close buckets merge. Transparent pixels are ignored.
    function paletteRect(data, w, x0, y0, x1, y1, max) {
        var buckets = {}, total = 0, i, x, y, p, a, k, bk;
        for (y = y0; y < y1; y++) for (x = x0; x < x1; x++) {
            p = (y * w + x) * 4; a = data[p + 3];
            if (a < 128) continue;
            k = ((data[p] >> 4) << 8) | ((data[p + 1] >> 4) << 4) | (data[p + 2] >> 4);
            bk = buckets[k] || (buckets[k] = { n: 0, r: 0, g: 0, b: 0 });
            bk.n++; bk.r += data[p]; bk.g += data[p + 1]; bk.b += data[p + 2]; total++;
        }
        var arr = Object.keys(buckets).map(function (q) { var o = buckets[q]; return { n: o.n, r: o.r / o.n, g: o.g / o.n, b: o.b / o.n }; }).sort(function (a2, b2) { return b2.n - a2.n; });
        var out = [];
        arr.forEach(function (c) {
            for (i = 0; i < out.length; i++) {
                if (dist(out[i], c) < 46) { var t = out[i].n + c.n; out[i].r = (out[i].r * out[i].n + c.r * c.n) / t; out[i].g = (out[i].g * out[i].n + c.g * c.n) / t; out[i].b = (out[i].b * out[i].n + c.b * c.n) / t; out[i].n = t; return; }
            }
            out.push({ n: c.n, r: c.r, g: c.g, b: c.b });
        });
        out.sort(function (a2, b2) { return b2.n - a2.n; });
        return { total: total, colors: out.slice(0, max || 6).map(function (c) { return { hex: toHex(c.r, c.g, c.b), name: nameColor(c.r, c.g, c.b), pct: total ? Math.round(c.n * 1000 / total) / 10 : 0, r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }; }) };
    }
    function lumaStats(data, w, h) {
        var sum = 0, n = 0, lo = 255, hi = 0, p, l;
        for (p = 0; p < w * h * 4; p += 4) {
            if (data[p + 3] < 128) continue;
            l = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
            sum += l; n++; if (l < lo) lo = l; if (l > hi) hi = l;
        }
        return n ? { mean: sum / n, lo: lo, hi: hi } : { mean: 0, lo: 0, hi: 0 };
    }
    var CELLS = ['top-left', 'top', 'top-right', 'left', 'center', 'right', 'bottom-left', 'bottom', 'bottom-right'];
    function describeRGBA(data, w, h, meta) {
        meta = meta || {};
        var pal = paletteRect(data, w, 0, 0, w, h, 6), ls = lumaStats(data, w, h), lines = [];
        var tone = ls.mean < 70 ? 'dark' : ls.mean > 185 ? 'light' : 'mid-tone';
        var spread = ls.hi - ls.lo;
        lines.push('PIXEL MEASUREMENTS (measured by the app from the real pixels, exact, not a vision model\'s opinion):');
        if (meta.w && meta.h) lines.push('- size ' + meta.w + 'x' + meta.h + ' px, ' + (meta.w >= meta.h * 1.15 ? 'landscape' : meta.h >= meta.w * 1.15 ? 'portrait' : 'about square') + (meta.bytes ? ', ' + Math.round(meta.bytes / 1024) + ' KB' : ''));
        lines.push('- overall tone: ' + tone + ' (average brightness ' + Math.round(ls.mean / 2.55) + '%), ' + (spread < 40 ? 'very flat, little contrast (blank or nearly one colour)' : spread < 130 ? 'moderate contrast' : 'strong contrast'));
        var shown = pal.colors.filter(function (c, i) { return i === 0 || c.pct >= 1; });
        lines.push('- palette: ' + shown.map(function (c) { return c.name + ' ' + c.hex + ' ' + c.pct + '%'; }).join(', '));
        var gl = [], cx, cy, cell, pc;
        for (cy = 0; cy < 3; cy++) for (cx = 0; cx < 3; cx++) {
            cell = paletteRect(data, w, Math.floor(cx * w / 3), Math.floor(cy * h / 3), Math.floor((cx + 1) * w / 3), Math.floor((cy + 1) * h / 3), 2);
            pc = cell.colors[0];
            gl.push(CELLS[cy * 3 + cx] + ': ' + (pc ? pc.name + ' ' + pc.hex + ' (' + Math.round(pc.pct) + '%)' + (cell.colors[1] && cell.colors[1].pct >= 15 ? ' + ' + cell.colors[1].name + ' ' + cell.colors[1].hex : '') : 'transparent'));
        }
        lines.push('- 3x3 grid, dominant colour per cell: ' + gl.join(' | '));
        return lines.join('\n');
    }

    /* ---------- regions (pure) ---------- */
    var T3 = 1 / 3;
    var NAMED = {
        'top-left': [0, 0, T3, T3], 'top': [0, 0, 1, T3], 'top-right': [2 * T3, 0, T3, T3],
        'left': [0, 0, T3, 1], 'center': [T3, T3, T3, T3], 'right': [2 * T3, 0, T3, 1],
        'bottom-left': [0, 2 * T3, T3, T3], 'bottom': [0, 2 * T3, 1, T3], 'bottom-right': [2 * T3, 2 * T3, T3, T3],
        'middle': [0, T3, 1, T3],
        'top half': [0, 0, 1, 0.5], 'bottom half': [0, 0.5, 1, 0.5], 'left half': [0, 0, 0.5, 1], 'right half': [0.5, 0, 0.5, 1],
        'whole': [0, 0, 1, 1]
    };
    function parseRegion(s) {
        s = String(s || '').trim().toLowerCase().replace(/[_\s]+/g, ' ').replace(/\bupper\b/g, 'top').replace(/\blower\b/g, 'bottom').replace(/\bcentre\b|\bmiddle center\b|\bmiddle centre\b/g, 'center');
        var nums = s.match(/-?\d+(?:\.\d+)?/g);
        if (nums && nums.length >= 4 && /^[\d\s.,%x:;-]+$/i.test(s)) {
            var v = nums.slice(0, 4).map(parseFloat);
            var big = v.some(function (n) { return n > 1; }) || /%/.test(s);
            if (big) v = v.map(function (n) { return n / 100; });
            var x = Math.max(0, Math.min(0.98, v[0])), y = Math.max(0, Math.min(0.98, v[1]));
            var w = Math.max(0.02, Math.min(1 - x, v[2])), h = Math.max(0.02, Math.min(1 - y, v[3]));
            return { x: x, y: y, w: w, h: h, label: Math.round(x * 100) + ',' + Math.round(y * 100) + ',' + Math.round(w * 100) + ',' + Math.round(h * 100) + '%' };
        }
        s = s.replace(/^(?:the )?/, '').replace(/\bleft top\b/, 'top left').replace(/\bright top\b/, 'top right').replace(/\bleft bottom\b/, 'bottom left').replace(/\bright bottom\b/, 'bottom right').replace(/\b(top|bottom) (left|right)\b/, '$1-$2');
        s = s.replace(/\s*(?:part|area|corner|section|region)$/, '');
        if (NAMED[s]) { var n = NAMED[s]; return { x: n[0], y: n[1], w: n[2], h: n[3], label: s }; }
        return null;
    }
    // "x%,y%" or a named region (its centre) -> { fx, fy }
    function parsePoint(s) {
        s = String(s || '').trim();
        var m = /^(-?\d+(?:\.\d+)?)\s*%?\s*[,x:\s]\s*(-?\d+(?:\.\d+)?)\s*%?$/i.exec(s);
        if (m) {
            var a = parseFloat(m[1]), b = parseFloat(m[2]);
            if (a > 1 || b > 1 || /%/.test(s)) { a /= 100; b /= 100; }
            return { fx: Math.max(0, Math.min(1, a)), fy: Math.max(0, Math.min(1, b)), label: Math.round(a * 100) + '%,' + Math.round(b * 100) + '%' };
        }
        var r = parseRegion(s);
        if (r) return { fx: r.x + r.w / 2, fy: r.y + r.h / 2, label: r.label + ' (centre)' };
        return null;
    }

    /* ---------- canvas side (browser / webview only) ---------- */
    function loadImage(g) {
        return new Promise(function (ok, bad) {
            var im = new Image();
            im.onload = function () { ok(im); };
            im.onerror = function () { bad(new Error('the picture could not be decoded')); };
            im.src = 'data:' + g.mime + ';base64,' + g.b64;
        });
    }
    function raster(im, maxSide) {
        var nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height, k = Math.min(1, maxSide / Math.max(nw, nh));
        var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(nw * k)); c.height = Math.max(1, Math.round(nh * k));
        var cx = c.getContext('2d', { willReadFrequently: true }); cx.drawImage(im, 0, 0, c.width, c.height);
        return { c: c, cx: cx, nw: nw, nh: nh };
    }
    function approxBytes(g) { return Math.round(String(g.b64 || '').length * 3 / 4); }
    // Measured facts about a picture (cached). Resolves to text, or '' when the canvas is not available.
    function analyze(g) {
        var k = keyOf(g);
        if (factCache.has(k)) return Promise.resolve(factCache.get(k));
        return loadImage(g).then(function (im) {
            var r = raster(im, 160), d = r.cx.getImageData(0, 0, r.c.width, r.c.height);
            var txt = describeRGBA(d.data, r.c.width, r.c.height, { w: r.nw, h: r.nh, bytes: approxBytes(g) });
            factCache.set(k, txt); if (factCache.size > 40) factCache.delete(factCache.keys().next().value);
            return txt;
        }).catch(function () { return ''; });
    }
    // Exact measurements of a region, taken from the ORIGINAL pixels (not from the JPEG crop that is sent to the reader).
    function analyzeRegion(g, reg) {
        return loadImage(g).then(function (im) {
            var r = raster(im, 1200), x0 = Math.round(reg.x * r.c.width), y0 = Math.round(reg.y * r.c.height);
            var w = Math.max(1, Math.min(r.c.width - x0, Math.round(reg.w * r.c.width))), h = Math.max(1, Math.min(r.c.height - y0, Math.round(reg.h * r.c.height)));
            var d = r.cx.getImageData(x0, y0, w, h);
            return describeRGBA(d.data, w, h, { w: Math.round(reg.w * r.nw), h: Math.round(reg.h * r.nh) });
        }).catch(function () { return ''; });
    }
    function pixelColor(g, fx, fy) {
        return loadImage(g).then(function (im) {
            var r = raster(im, 2048), px = Math.round(fx * (r.c.width - 1)), py = Math.round(fy * (r.c.height - 1));
            var x0 = Math.max(0, px - 2), y0 = Math.max(0, py - 2), x1 = Math.min(r.c.width, px + 3), y1 = Math.min(r.c.height, py + 3);
            var d = r.cx.getImageData(x0, y0, x1 - x0, y1 - y0).data, n = 0, R = 0, G = 0, B = 0, A = 0, p;
            for (p = 0; p < d.length; p += 4) { R += d[p]; G += d[p + 1]; B += d[p + 2]; A += d[p + 3]; n++; }
            if (!n) throw new Error('outside the picture');
            R /= n; G /= n; B /= n;
            return { r: Math.round(R), g: Math.round(G), b: Math.round(B), hex: toHex(R, G, B), name: nameColor(R, G, B), alpha: Math.round(A / n), at: Math.round(fx * r.nw) + ',' + Math.round(fy * r.nh) };
        });
    }
    function crop(g, reg) {
        return loadImage(g).then(function (im) {
            var nw = im.naturalWidth || im.width, nh = im.naturalHeight || im.height;
            var sx = Math.round(reg.x * nw), sy = Math.round(reg.y * nh), sw = Math.max(8, Math.round(reg.w * nw)), sh = Math.max(8, Math.round(reg.h * nh));
            sw = Math.min(sw, nw - sx); sh = Math.min(sh, nh - sy);
            var up = Math.max(1, Math.min(4, 900 / Math.max(sw, sh)));   // enlarge small crops so small text is readable, never beyond about 1600 px
            var tw = Math.min(1600, Math.round(sw * up)), th = Math.min(1600, Math.round(sh * up));
            var c = document.createElement('canvas'); c.width = tw; c.height = th;
            var cx = c.getContext('2d'); cx.imageSmoothingQuality = 'high'; cx.drawImage(im, sx, sy, sw, sh, 0, 0, tw, th);
            return { mime: 'image/jpeg', b64: c.toDataURL('image/jpeg', 0.88).split(',')[1], px: sw + 'x' + sh };
        });
    }

    /* ---------- the picture store ---------- */
    function storeOf(chatId) { var id = String(chatId || '_'); var s = stores.get(id); if (!s) { s = { list: [], next: 1 }; stores.set(id, s); if (stores.size > 12) stores.delete(stores.keys().next().value); } return s; }
    // Remember a picture for this chat and return its number. The same picture keeps its number.
    function register(chatId, g, info) {
        if (!g || !g.b64) return 0;
        var s = storeOf(chatId), k = keyOf(g), hit = null;
        s.list.forEach(function (e) { if (e.key === k) hit = e; });
        if (hit) { if (info && info.via) { hit.via = info.via; hit.desc = info.desc || hit.desc; } return hit.n; }
        var e = { n: s.next++, g: { mime: g.mime || 'image/jpeg', b64: g.b64 }, key: k, via: (info && info.via) || '', desc: (info && info.desc) || '' };
        s.list.push(e);
        while (s.list.length > MAX_PICS) s.list.shift();
        return e.n;
    }
    function get(chatId, n) {
        var s = storeOf(chatId);
        if (!s.list.length) return null;
        if (!n) return s.list[s.list.length - 1];
        for (var i = 0; i < s.list.length; i++) if (s.list[i].n === n) return s.list[i];
        return null;
    }
    function count(chatId) { return storeOf(chatId).list.length; }
    function forget(chatId) { stores.delete(String(chatId || '_')); }
    function listText(chatId) { return storeOf(chatId).list.map(function (e) { return '#' + e.n; }).join(', '); }

    /* ---------- tag protocol ---------- */
    var SRC = '\\[\\[(see\\.(?:ask|zoom|color|find|ui|shot))(?::\\s*((?:(?!\\]\\])[\\s\\S])*?))?\\s*\\]\\]';
    function parse(raw) {
        var text = String(raw || '').replace(/```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)/g, '');
        var re = new RegExp(SRC, 'gi'), calls = [], m;
        while ((m = re.exec(text)) && calls.length < 3) calls.push({ se: true, kind: m[1].toLowerCase(), arg: String(m[2] || '').trim() });
        return calls;
    }
    // "2 | rest" -> { n: 2, rest }.   "rest" -> { n: 0, rest }
    function splitPic(arg) {
        var m = /^\s*#?(\d{1,2})\s*(?:\|\s*([\s\S]*))?$/.exec(String(arg || ''));
        return m ? { n: parseInt(m[1], 10), rest: String(m[2] || '').trim() } : { n: 0, rest: String(arg || '').trim() };
    }
    function err(msg) { return { text: 'ERROR: ' + msg }; }
    function noPic(chatId, n) {
        return err(n ? 'there is no picture #' + n + ' in this chat. Pictures available: ' + (listText(chatId) || 'none') + '.' : 'there is no picture in this chat to look at. Ask Fezzy to attach one' + (host.native ? ', or use [[see.shot]] to capture the app screen.' : '.'));
    }
    function label(e, via) { return 'PICTURE #' + e.n + (via ? ' (read by ' + via + ', a vision model: it can be wrong, especially on small text; if it says something is unreadable, believe it)' : ''); }

    var STOP = /^(?:the|and|for|you|what|does|say|says|that|this|with|from|are|was|there|which|have|has|how|why|who|whom|can|could|would|please|picture|image|photo|screen|about|show|tell|read|text|write|written|picture)$/;
    // No vision model is involved: the app reads the picture itself and answers with the rows that match the question plus everything it read.
    function localAsk(e, question) {
        var S = sight();
        if (!S) return Promise.resolve(err('no vision provider answered and the on-phone reader is not available. Do not guess the answer.'));
        var keys = String(question || '').toLowerCase().split(/[^a-z0-9%$.@:\/-]+/).filter(function (w) { return w.length >= 3 && !STOP.test(w); });
        return S.read(e.g).then(function (rd) {
            var hit = rd.rows.filter(function (r) { var t = r.segs.map(function (x) { return x.t; }).join(' ').toLowerCase(); return keys.some(function (k) { return t.indexOf(k) !== -1; }); });
            return analyze(e.g).then(function (facts) {
                return { text: 'PICTURE #' + e.n + ' read ON THIS PHONE (OCR + measurements; it reads text, it does not see objects) for the question "' + clip(question, 120) + '":\n' +
                    (hit.length ? 'ROWS THAT MATCH YOUR QUESTION:\n' + S.rowsText(hit, 1000) + '\n\n' : (rd.rows.length ? 'No row contains the words of your question.\n\n' : '')) +
                    clean(S.report(rd, { maxChars: 2400 })).slice(0, MAX_TEXT + 600) + (facts ? '\n' + facts : '') };
            });
        }).catch(function (x) { return err('the on-phone reader failed: ' + clip(x && x.message, 120) + '. Do not guess what the picture shows.'); });
    }
    function runAsk(chatId, arg) {
        var p = splitPic(arg), e = get(chatId, p.n);
        if (!e) return Promise.resolve(noPic(chatId, p.n));
        if (!p.rest) return Promise.resolve(err('write the question after the picture number: [[see.ask: 1 | what does the red banner say?]]'));
        if (!visionReady()) return localAsk(e, p.rest);
        var prompt = 'Look at this picture and answer ONLY this question about it, literally and precisely. Quote any visible text exactly, character for character. If the answer is not visible, unreadable or cut off, say exactly that; never guess.\nQuestion: ' + p.rest.slice(0, 400);
        return host.ask(e.g, prompt, 2).then(function (r) {
            if (!r) return localAsk(e, p.rest);
            return { text: label(e, r.via) + ' answer to "' + clip(p.rest, 120) + '":\n' + clean(r.text).slice(0, MAX_TEXT) };
        });
    }
    function runZoom(chatId, arg) {
        var p = splitPic(arg), e = get(chatId, p.n);
        if (!e) return Promise.resolve(noPic(chatId, p.n));
        var bits = p.rest.split('|'), reg = parseRegion(bits[0]);
        if (!reg) return Promise.resolve(err('unknown region "' + clip(bits[0], 40) + '". Use top-left, top, top-right, left, center, right, bottom-left, bottom, bottom-right, top half, bottom half, left half, right half, or x,y,w,h as percentages of the picture (for example 10,60,50,25).'));
        var q = (bits.slice(1).join('|') || '').trim().slice(0, 400), S = sight(), useVision = visionReady();
        if (!useVision && !S) return Promise.resolve(err('no reader is available to look at that region. Do not guess what is in it.'));
        var seen = useVision ? crop(e.g, reg).then(function (cg) {
            var prompt = 'This is a ZOOMED, enlarged crop (' + reg.label + ', ' + cg.px + ' px of the original) of a larger picture. ' + (q ? 'Answer ONLY this: ' + q + '\n' : 'Transcribe ALL visible text in it exactly, line by line, then describe what is in it.\n') + 'Quote text character for character. Say plainly what is cut off at the crop edge or unreadable; never guess.';
            return host.ask(cg, prompt, 2);
        }).catch(function () { return null; }) : Promise.resolve(null);
        var local = S ? S.readRegion(e.g, reg).catch(function () { return null; }) : Promise.resolve(null);
        return Promise.all([seen, local, analyzeRegion(e.g, reg)]).then(function (res) {
            var r = res[0], lr = res[1], facts = res[2];
            if (!r && !lr) return err('could not read that region (no reader answered). Do not guess what is in it.');
            var out = (r ? label(e, r.via) : 'PICTURE #' + e.n) + ' ZOOM ' + reg.label + (q ? ' on "' + clip(q, 100) + '"' : '') + ':\n';
            if (r) out += clean(r.text).slice(0, MAX_TEXT) + '\n';
            if (lr) out += 'RE-READ ON THIS PHONE (the area enlarged and run through OCR, ' + lr.px + ' px; positions are % of the WHOLE picture):\n' + (lr.rows.length ? clean(S.rowsText(lr.rows, 2200)) : 'no readable text in that area.') + '\n';
            if (!r && q) out += 'Your question was "' + clip(q, 100) + '": this reader only reads text and measures colour; answer from the text and measurements above, and say if the question needs more.\n';
            return { text: out.trim() + (facts ? '\n' + facts.replace('PIXEL MEASUREMENTS (', 'PIXEL MEASUREMENTS OF THIS REGION (') : '') };
        }).catch(function (x) { return err('could not look at that region: ' + clip(x && x.message, 100)); });
    }
    // Text colour and background colour of a found word, measured from the real pixels of its box.
    function boxColors(g, h) {
        return loadImage(g).then(function (im) {
            var r = raster(im, 1600), padX = (h.x1 - h.x0) * 0.04, padY = (h.y1 - h.y0) * 0.15;
            var x0 = Math.max(0, Math.floor((h.x0 - padX) * r.c.width)), y0 = Math.max(0, Math.floor((h.y0 - padY) * r.c.height));
            var x1 = Math.min(r.c.width, Math.ceil((h.x1 + padX) * r.c.width)), y1 = Math.min(r.c.height, Math.ceil((h.y1 + padY) * r.c.height));
            var w = Math.max(1, x1 - x0), hh = Math.max(1, y1 - y0), d = r.cx.getImageData(x0, y0, w, hh), pal = paletteRect(d.data, w, 0, 0, w, hh, 5);
            if (!pal.colors.length) return null;
            var bg = pal.colors[0], fg = null, best = 0;
            pal.colors.slice(1).forEach(function (c) { var sc = dist(c, bg) * Math.sqrt(c.pct); if (c.pct >= 2 && sc > best) { best = sc; fg = c; } });
            return { bg: bg, fg: fg };
        }).catch(function () { return null; });
    }
    function runFind(chatId, arg) {
        var p = splitPic(arg), e = get(chatId, p.n);
        if (!e) return Promise.resolve(noPic(chatId, p.n));
        if (!p.rest) return Promise.resolve(err('write the words to find after the picture number: [[see.find: 1 | Send]]'));
        var S = sight();
        if (!S) return Promise.resolve(err('the on-phone reader is not available, so the words cannot be located. Do not guess where they are.'));
        return S.find(e.g, p.rest).then(function (hits) {
            if (!hits.length) return { text: 'PICTURE #' + e.n + ': the words "' + clip(p.rest, 80) + '" were NOT found by the on-phone reader. They may be an icon, part of an image, very small, or misread; try [[see.zoom: ' + e.n + ' | region]]. Do not claim they are on the picture.' };
            return Promise.all(hits.map(function (h) { return boxColors(e.g, h); })).then(function (cols) {
                var rows = hits.map(function (h, i) {
                    var c = cols[i], cxp = Math.round((h.x0 + h.x1) * 50), cyp = Math.round((h.y0 + h.y1) * 50);
                    return '- "' + clip(h.t, 80) + '" [' + S.where(h.x0, h.y0, h.x1, h.y1) + '] x ' + Math.round(h.x0 * 100) + '-' + Math.round(h.x1 * 100) + '%, y ' + Math.round(h.y0 * 100) + '-' + Math.round(h.y1 * 100) + '%, centre ' + cxp + '%,' + cyp + '%' +
                        (c ? '; background ' + c.bg.name + ' ' + c.bg.hex + (c.fg ? ', text about ' + c.fg.name + ' ' + c.fg.hex : '') + ' (measured)' : '');
                });
                return { text: 'PICTURE #' + e.n + ' FOUND "' + clip(p.rest, 80) + '" (on-phone reader; positions are % of the picture from its top-left):\n' + rows.join('\n') + '\nUse [[see.color: ' + e.n + ' | x%,y%]] for an exact colour at a point.' };
            });
        }).catch(function (x) { return err('the on-phone reader failed: ' + clip(x && x.message, 120) + '. Do not guess.'); });
    }
    function runColor(chatId, arg) {
        var p = splitPic(arg), e = get(chatId, p.n);
        if (!e) return Promise.resolve(noPic(chatId, p.n));
        var pts = p.rest.split(/[;]/).map(function (s) { return parsePoint(s); }).filter(Boolean).slice(0, 6);
        if (!pts.length) return Promise.resolve(err('give a point as x%,y% (0,0 is the top-left corner), or a region name: [[see.color: 1 | 50%,20%]] or [[see.color: 1 | bottom-right]]. Separate several points with ;'));
        return Promise.all(pts.map(function (pt) { return pixelColor(e.g, pt.fx, pt.fy).then(function (c) { return '- ' + pt.label + ' (pixel ' + c.at + '): ' + c.name + ' ' + c.hex + ' rgb(' + c.r + ',' + c.g + ',' + c.b + ')' + (c.alpha < 250 ? ' alpha ' + Math.round(c.alpha / 2.55) + '%' : ''); }); })).then(function (rows) {
            return { text: 'PICTURE #' + e.n + ' EXACT PIXEL COLOURS (measured by the app, averaged over a 5x5 pixel patch; this is not a vision model\'s guess):\n' + rows.join('\n') };
        }).catch(function (x) { return err('could not measure that point: ' + clip(x && x.message, 100)); });
    }
    function runUi() {
        var L = window.HorizonLens;
        if (!L || !L.report) return Promise.resolve(err('the UI Lens is not available in this build.'));
        if (!L.enabled()) return Promise.resolve(err('the UI Lens is off, so the app screen is hidden from you. Tell Fezzy to switch on Screen view (Apps menu, Lens) if he wants you to look at the app. Do not guess what the screen looks like.'));
        try {
            var t = String(L.report() || '');
            if (!t) return Promise.resolve(err('the UI map came back empty.'));
            return Promise.resolve({ text: 'LIVE UI MAP of Horizon right now (real elements, sizes in CSS px, colours, contrast and problems read from the running app; private fields and chat text are hidden):\n' + clean(t).slice(0, 7000) });
        } catch (x) { return Promise.resolve(err('could not read the UI: ' + clip(x && x.message, 100))); }
    }
    function runShot(chatId) {
        var L = window.HorizonLens;
        if (!L || !L.shot || !L.enabled()) return Promise.resolve(err('the UI Lens is off or not available, so no screenshot can be taken. Tell Fezzy to switch on Screen view (Apps menu, Lens).'));
        if (!host.native) return Promise.resolve(err('screenshots only work inside the Android app.'));
        return L.shot().then(function (s) {
            if (!s || !s.b64) return err('the screenshot did not come back. This build may be missing the HorizonLens plugin.');
            var g = { mime: s.mime || 'image/jpeg', b64: s.b64 }, n = register(chatId, g, {});
            var e = get(chatId, n), S = sight(), useVision = visionReady();
            var tips = '\nLook closer with [[see.zoom: ' + n + ' | region | question]], [[see.find: ' + n + ' | words]], [[see.color: ' + n + ' | x%,y%]].';
            var prompt = 'This is a screenshot of an Android app screen. Describe it completely and literally for another AI that cannot see it: every visible text transcribed exactly, every button, switch, tab, panel and notice with its position (top, middle, bottom, left, right), anything cut off, overlapping, too small or low contrast. Do not guess what is not visible. Under 400 words.';
            return Promise.all([useVision ? host.ask(g, prompt, 20) : Promise.resolve(null), S ? S.read(g).catch(function () { return null; }) : Promise.resolve(null), analyze(g)]).then(function (res) {
                var r = res[0], rd = res[1], facts = res[2];
                if (e && r) { e.via = r.via; e.desc = r.text; }
                if (!r && !rd) return { text: 'PICTURE #' + n + ' = a fresh screenshot of the app (private fields blurred), but nothing could read it right now. Use [[see.ui]] for the exact UI map, and [[see.color: ' + n + ' | x%,y%]] for exact colours.' + (facts ? '\n' + facts : '') };
                return { text: 'PICTURE #' + n + ' = a fresh screenshot of the app (private fields blurred). ' + (r ? 'Read by ' + r.via + ', a vision model (it can be wrong on small text):\n' + clean(r.text).slice(0, MAX_TEXT) + '\n' : '') + (rd ? clean(S.report(rd, { maxChars: 3000 })) : '') + (facts ? '\n' + facts : '') + tips };
            });
        }).catch(function (x) { return err('could not capture: ' + clip(x && x.message, 100)); });
    }
    function run(kind, arg, chatId) {
        if (!isOn()) return Promise.resolve(err('the eyes tools are switched off. Tell Fezzy; do not guess what the picture or screen shows.'));
        chatId = chatId || host.chatId();
        arg = String(arg || '').slice(0, 600);
        switch (String(kind || '').toLowerCase()) {
            case 'see.ask': return runAsk(chatId, arg);
            case 'see.zoom': return runZoom(chatId, arg);
            case 'see.color': return runColor(chatId, arg);
            case 'see.find': return runFind(chatId, arg);
            case 'see.ui': return runUi();
            case 'see.shot': return runShot(chatId);
            default: return Promise.resolve(err('unknown eyes tool. Use see.ask, see.zoom, see.find, see.color, see.ui or see.shot.'));
        }
    }

    /* ---------- the prompt block ---------- */
    // V1.99.147: short on purpose. The model is told ONE true thing (it cannot see; the app reads for it) and only the tools that exist right now.
    // The long per-tool manual used to ride on every message; now the pictures themselves say what to do next.
    function block(lite, chatId) {
        if (!isOn()) return '';
        var blind = !host.canSee(), has = count(chatId || host.chatId()) > 0;
        var shot = host.native ? ' [[see.shot]] reads a screenshot of the app.' : '';
        var ui = '[[see.ui]] gives the live UI map of the app (real element names, sizes, colours, contrast, problems).' + (blind ? shot : '');
        if (!blind) return lite ? '' : 'EYES (app screen): ' + ui + ' Use it before you judge how the app looks. Write the tag alone, max 3 per turn, then wait for the result.';
        if (!has) return 'EYES: you cannot see pictures; the app reads them for you when Fezzy attaches one. ' + ui + ' Never guess how the app looks.';
        return 'EYES: you cannot see pictures. The app reads each one on the phone (OCR + pixel measuring) and gives it to you as [PICTURE #n] text; it reads text and colour, it cannot recognise objects or people. To look closer write a tag alone (max 3 per turn, then wait): [[see.zoom: n | region | question]] re-reads an enlarged area (top-left, top, center, bottom-right, top half... or x,y,w,h in %); [[see.find: n | words]] says where words are and their colours; [[see.color: n | x%,y%]] exact pixel colour; [[see.ask: n | question]]. ' + ui + ' Never invent text, colours or layout the reading did not give you; say what you could not make out.';
    }

    // The text a chat model receives for a picture, produced on this phone (no provider). Resolves { text, via }.
    function readLocal(g) {
        var S = sight();
        if (!S) return Promise.reject(new Error('the on-phone reader is not available'));
        return Promise.all([S.read(g), analyze(g)]).then(function (r) {
            return { text: clean(S.report(r[0], { maxChars: 3200 })) + (r[1] ? '\n' + r[1] : ''), via: 'the on-phone reader' };
        });
    }

    function init(h) { host = Object.assign(host, h || {}); }
    window.HorizonEyes = {
        version: VERSION, SRC: SRC, init: init, parse: parse, run: run, block: block, isOn: isOn, setOn: setOn,
        register: register, get: get, count: count, forget: forget, analyze: analyze, readLocal: readLocal, localReady: localReady,
        _t: { nameColor: nameColor, toHex: toHex, paletteRect: paletteRect, describeRGBA: describeRGBA, parseRegion: parseRegion, parsePoint: parsePoint, splitPic: splitPic, lumaStats: lumaStats }
    };
})();
