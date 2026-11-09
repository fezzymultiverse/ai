/* HORIZON · direct YouTube source · V1.79.0
 *
 * Why: the public Piped and Invidious servers Horizon used for YouTube are mostly down or blocked, so
 * search, download and play kept failing. This talks to YouTube's own app API (InnerTube) straight from
 * the phone. CapacitorHttp is on, so fetch() here goes through the native stack: no CORS, and the
 * User-Agent header is really sent.
 *
 *   HzYtDirect.search(q)        -> { items: [{ id, title, artist, dur }], via }
 *   HzYtDirect.audio(id)        -> { title, artist, url, ext, size, dur, ua, via }
 *   HzYtDirect.video(id)        -> { title, artist, url, ext: 'mp4', size, ua, via }
 *   HzYtDirect.diag()           -> text with the last failures
 *
 * The stream URLs are locked to the client that asked for them, so callers must send `ua` as the
 * User-Agent when they download or play the URL. index.html passes it on to the native saver.
 * Index.html tries this first and falls back to the old public servers only if this fails.
 *
 * V1.79.0: seven player clients (newest first) instead of two, every candidate link is probed with a 2-byte
 * Range request before it is handed out (a 403 means YouTube wants a token for that client, so the next one
 * is tried), visitorData from the search answer is reused, `skip` lets the caller ask for a different client
 * after a failed play, audio() falls back to a combined stream when no audio-only link works, and
 * HzYtDirect.fetchBlob() pulls a song in small Range chunks (a single big GET gets throttled).
 */
(function () {
    'use strict';

    const API = 'https://www.youtube.com/youtubei/v1/';
    const CLIENTS = {
        vr2: {
            id: 28, ver: '1.65.10', name: 'Android VR 1.65',
            ua: 'com.google.android.apps.youtube.vr.oculus/1.65.10 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            ctx: { clientName: 'ANDROID_VR', clientVersion: '1.65.10', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32, hl: 'en', gl: 'US' }
        },
        vr: {
            id: 28, ver: '1.60.19', name: 'Android VR',
            ua: 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip',
            ctx: { clientName: 'ANDROID_VR', clientVersion: '1.60.19', deviceMake: 'Oculus', deviceModel: 'Quest 3', osName: 'Android', osVersion: '12L', androidSdkVersion: 32, hl: 'en', gl: 'US' }
        },
        ios: {
            id: 5, ver: '20.10.4', name: 'iOS',
            ua: 'com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)',
            ctx: { clientName: 'IOS', clientVersion: '20.10.4', deviceMake: 'Apple', deviceModel: 'iPhone16,2', osName: 'iPhone', osVersion: '18.3.2.22D82', hl: 'en', gl: 'US' }
        },
        testsuite: {
            id: 30, ver: '1.9', name: 'Android test',
            ua: 'com.google.android.youtube/1.9 (Linux; U; Android 11) gzip',
            ctx: { clientName: 'ANDROID_TESTSUITE', clientVersion: '1.9', osName: 'Android', osVersion: '11', androidSdkVersion: 30, hl: 'en', gl: 'US' }
        },
        android: {
            id: 3, ver: '20.10.38', name: 'Android',
            ua: 'com.google.android.youtube/20.10.38 (Linux; U; Android 11) gzip',
            ctx: { clientName: 'ANDROID', clientVersion: '20.10.38', osName: 'Android', osVersion: '11', androidSdkVersion: 30, hl: 'en', gl: 'US' }
        },
        tvembed: {
            id: 85, ver: '2.0', name: 'TV embedded',
            ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
            ctx: { clientName: 'TVHTML5_SIMPLY_EMBEDDED_PLAYER', clientVersion: '2.0', hl: 'en', gl: 'US' },
            extra: { thirdParty: { embedUrl: 'https://www.youtube.com/' } }
        },
        tv: {
            id: 7, ver: '7.20250219.14.00', name: 'TV',
            ua: 'Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version',
            ctx: { clientName: 'TVHTML5', clientVersion: '7.20250219.14.00', hl: 'en', gl: 'US' }
        },
        web: {
            id: 1, ver: '2.20250312.04.00', name: 'Web',
            ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
            ctx: { clientName: 'WEB', clientVersion: '2.20250312.04.00', hl: 'en', gl: 'US' }
        },
        mweb: {
            id: 2, ver: '2.20250312.01.00', name: 'Mobile web',
            ua: 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36',
            ctx: { clientName: 'MWEB', clientVersion: '2.20250312.01.00', hl: 'en', gl: 'US' }
        }
    };
    const PLAYER_ORDER = ['vr2', 'vr', 'ios', 'testsuite', 'android', 'tvembed', 'tv'];
    const SEARCH_ORDER = ['web', 'mweb'];
    const VIDEOS_ONLY = 'EgIQAQ==';
    const DEADLINE = 55000;   // one player() call gives up after this long in total
    let visitor = '';

    let errs = [];
    const note = (what, e) => { errs.push(what + ': ' + String((e && e.message) || e).slice(0, 120)); if (errs.length > 8) errs.shift(); };
    const timed = (p, ms) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timed out')), ms);
        Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });

    async function post(path, body, client) {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': client.ua,
            'X-YouTube-Client-Name': String(client.id),
            'X-YouTube-Client-Version': client.ver,
            'Origin': 'https://www.youtube.com',
            'Cookie': 'SOCS=CAI'
        };
        const cctx = Object.assign({}, client.ctx);
        if (visitor) { cctx.visitorData = visitor; headers['X-Goog-Visitor-Id'] = visitor; }
        const res = await timed(fetch(API + path + '?prettyPrint=false', {
            method: 'POST',
            headers,
            body: JSON.stringify(Object.assign({ context: Object.assign({ client: cctx }, client.extra || {}) }, body))
        }), 14000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const json = await res.json();
        try { const v = json && json.responseContext && json.responseContext.visitorData; if (v) visitor = String(v); } catch (e) { /* optional */ }
        return json;
    }

    const text = t => !t ? '' : (t.simpleText || (Array.isArray(t.runs) ? t.runs.map(r => r.text).join('') : ''));
    const clock = s => { const p = String(s || '').split(':').map(Number); if (!p.length || p.some(isNaN)) return 0; return p.reduce((a, v) => a * 60 + v, 0); };
    const cleanArtist = s => String(s || '').replace(/\s+-\s+Topic$/i, '').trim();

    function walk(node, key, out, depth) {
        if (!node || typeof node !== 'object' || depth > 14 || out.length > 40) return;
        if (Array.isArray(node)) { for (const n of node) walk(n, key, out, depth + 1); return; }
        if (node[key] && typeof node[key] === 'object') out.push(node[key]);
        for (const k in node) { if (k !== key) walk(node[k], key, out, depth + 1); }
    }

    function parseSearch(json) {
        const found = [];
        walk(json, 'videoRenderer', found, 0);
        const seen = new Set();
        const items = [];
        for (const v of found) {
            const id = v.videoId;
            if (!/^[\w-]{11}$/.test(id || '') || seen.has(id)) continue;
            const len = text(v.lengthText);
            if (!len) continue; // live streams and premieres have no length
            seen.add(id);
            items.push({ id, title: text(v.title), artist: cleanArtist(text(v.ownerText) || text(v.longBylineText)), dur: clock(len) });
            if (items.length >= 10) break;
        }
        return items;
    }

    async function search(q) {
        q = String(q || '').trim();
        if (!q) throw new Error('empty search');
        const local = [];
        for (const key of SEARCH_ORDER) {
            try {
                const json = await post('search', { query: q, params: VIDEOS_ONLY }, CLIENTS[key]);
                const items = parseSearch(json);
                if (items.length) return { items, via: 'youtube.com' };
                local.push(key + ': no results');
            } catch (e) { note('search ' + key, e); local.push(key + ': ' + ((e && e.message) || e)); }
        }
        throw new Error('YouTube search failed (' + local.join(', ') + ')');
    }

    const direct = f => f && f.url && /^https:\/\//.test(f.url);

    // A link YouTube will not serve (403/410) is useless, so test it with a 2-byte Range request before handing it out.
    // A network error here proves nothing, so that case is let through.
    async function probe(url, ua) {
        try {
            const res = await timed(fetch(url, { method: 'GET', headers: { 'User-Agent': ua, 'Range': 'bytes=0-1' } }), 9000);
            if (res.status === 200 || res.status === 206) return true;
            return 'HTTP ' + res.status;
        } catch (e) { return true; }
    }

    function pickAudio(sd) {
        const list = (sd.adaptiveFormats || []).filter(f => direct(f) && /^audio\//i.test(f.mimeType || ''));
        if (!list.length) return null;
        const m4a = list.filter(f => /audio\/mp4/i.test(f.mimeType));
        const pool = m4a.length ? m4a : list;
        pool.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        return pool[0];
    }
    function pickVideo(sd) {
        const list = (sd.formats || []).filter(f => direct(f) && /^video\/mp4/i.test(f.mimeType || ''));
        if (!list.length) return null;
        list.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
        return list[0];
    }
    function pickMuxedAudio(sd) {   // last resort for audio: a combined stream (bigger file, same sound)
        const list = (sd.formats || []).filter(f => direct(f) && /^video\/mp4/i.test(f.mimeType || ''));
        if (!list.length) return null;
        list.sort((a, b) => (Number(a.height) || 0) - (Number(b.height) || 0));
        return list[0];
    }

    // Asks each client in turn until one hands back a link that really answers. want: 'audio' | 'video'.
    // opts.skip: client keys to leave out (used when a link was handed out but the player refused it).
    async function player(id, want, opts) {
        if (!/^[\w-]{11}$/.test(String(id || ''))) throw new Error('Invalid YouTube video ID');
        const skip = (opts && opts.skip) || [];
        const t0 = Date.now();
        let why = 'no client answered';
        for (const key of PLAYER_ORDER) {
            if (skip.indexOf(key) >= 0) continue;
            if (Date.now() - t0 > DEADLINE) { why = 'timed out after ' + Math.round(DEADLINE / 1000) + 's (' + why + ')'; break; }
            const client = CLIENTS[key];
            try {
                const json = await post('player', { videoId: id, contentCheckOk: true, racyCheckOk: true, playbackContext: { contentPlaybackContext: { html5Preference: 'HTML5_PREF_WANTS' } } }, client);
                const ps = json && json.playabilityStatus;
                if (!ps || ps.status !== 'OK') { why = (ps && (ps.reason || ps.status)) || 'unplayable'; note('player ' + key, why); continue; }
                const sd = json.streamingData || {};
                const fmt = want === 'video' ? pickVideo(sd) : (pickAudio(sd) || pickMuxedAudio(sd));
                if (!fmt) { why = 'no direct stream links'; note('player ' + key, why); continue; }
                const pr = await probe(fmt.url, client.ua);
                if (pr !== true) { why = 'link refused (' + pr + ')'; note('player ' + key, why); continue; }
                return { key, fmt, client, details: json.videoDetails || {} };
            } catch (e) { why = (e && e.message) || String(e); note('player ' + key, e); }
        }
        throw new Error('YouTube would not give a stream (' + why + ')');
    }

    async function audio(id, opts) {
        const p = await player(id, 'audio', opts);
        const best = p.fmt;
        const isAudio = /^audio\//i.test(best.mimeType || '');
        const ext = /audio\/mp4|video\/mp4/i.test(best.mimeType) ? (isAudio ? 'm4a' : 'mp4') : /opus/i.test(best.mimeType) ? 'opus' : 'webm';
        return {
            title: p.details.title || id, artist: cleanArtist(p.details.author), url: best.url, ext,
            size: Number(best.contentLength) || 0, dur: Number(p.details.lengthSeconds) || 0, ua: p.client.ua, client: p.key, via: 'youtube.com (' + p.client.name + ')'
        };
    }

    async function video(id, opts) {
        const p = await player(id, 'video', opts);
        const best = p.fmt;
        return {
            title: p.details.title || id, artist: cleanArtist(p.details.author), url: best.url, ext: 'mp4',
            size: Number(best.contentLength) || 0, ua: p.client.ua, client: p.key, via: 'youtube.com (' + p.client.name + ')'
        };
    }

    // Pulls a stream in small Range chunks (one big GET gets throttled to a crawl). Returns a Blob.
    async function fetchBlob(url, ua, size, onProg) {
        const CH = 2 * 1048576;
        const parts = [];
        let pos = 0, total = Number(size) || 0, type = '';
        for (let guard = 0; guard < 200; guard++) {
            const end = pos + CH - 1;
            const res = await timed(fetch(url, { headers: { 'User-Agent': ua, 'Range': 'bytes=' + pos + '-' + end } }), 40000);
            if (res.status !== 200 && res.status !== 206) throw new Error('HTTP ' + res.status);
            if (!type) type = res.headers.get('content-type') || '';
            const cr = /\/(\d+)\s*$/.exec(res.headers.get('content-range') || '');
            if (cr) total = Number(cr[1]);
            const blob = await res.blob();
            if (!blob.size) break;
            parts.push(blob);
            pos += blob.size;
            if (onProg) { try { onProg(pos, total); } catch (e) { /* progress is optional */ } }
            if (res.status === 200) break;   // the server ignored Range and sent everything
            if (total && pos >= total) break;
            if (blob.size < CH && !total) break;
        }
        if (!pos) throw new Error('empty stream');
        return new Blob(parts, { type: type || 'audio/mp4' });
    }

    const diag = () => errs.length ? 'Direct YouTube failures:\n' + errs.map(e => '  ' + e).join('\n') : 'Direct YouTube: no failures recorded.';

    window.HzYtDirect = { search, audio, video, fetchBlob, diag, clients: () => PLAYER_ORDER.slice(), _parseSearch: parseSearch };
})();
