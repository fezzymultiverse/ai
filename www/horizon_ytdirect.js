/* HORIZON · direct YouTube source · V1.78.0
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
 */
(function () {
    'use strict';

    const API = 'https://www.youtube.com/youtubei/v1/';
    const CLIENTS = {
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
    const PLAYER_ORDER = ['vr', 'ios'];
    const SEARCH_ORDER = ['web', 'mweb'];
    const VIDEOS_ONLY = 'EgIQAQ==';

    let errs = [];
    const note = (what, e) => { errs.push(what + ': ' + String((e && e.message) || e).slice(0, 120)); if (errs.length > 8) errs.shift(); };
    const timed = (p, ms) => new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('timed out')), ms);
        Promise.resolve(p).then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); });
    });

    async function post(path, body, client) {
        const res = await timed(fetch(API + path + '?prettyPrint=false', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': client.ua,
                'X-YouTube-Client-Name': String(client.id),
                'X-YouTube-Client-Version': client.ver,
                'Origin': 'https://www.youtube.com',
                'Cookie': 'SOCS=CAI'
            },
            body: JSON.stringify(Object.assign({ context: { client: client.ctx } }, body))
        }), 14000);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
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

    // Asks each client in turn until one hands back playable URLs (no cipher, no token).
    async function player(id) {
        if (!/^[\w-]{11}$/.test(String(id || ''))) throw new Error('Invalid YouTube video ID');
        let why = 'no client answered';
        for (const key of PLAYER_ORDER) {
            const client = CLIENTS[key];
            try {
                const json = await post('player', { videoId: id, contentCheckOk: true, racyCheckOk: true }, client);
                const ps = json && json.playabilityStatus;
                if (!ps || ps.status !== 'OK') { why = (ps && (ps.reason || ps.status)) || 'unplayable'; note('player ' + key, why); continue; }
                const sd = json.streamingData || {};
                const all = (sd.adaptiveFormats || []).concat(sd.formats || []).filter(f => f && f.url && /^https:\/\//.test(f.url));
                if (!all.length) { why = 'no direct stream links'; note('player ' + key, why); continue; }
                return { json, all, muxed: (sd.formats || []).filter(f => f && f.url && /^https:\/\//.test(f.url)), client, details: json.videoDetails || {} };
            } catch (e) { why = (e && e.message) || String(e); note('player ' + key, e); }
        }
        throw new Error('YouTube would not give a stream (' + why + ')');
    }

    async function audio(id) {
        const p = await player(id);
        const list = p.all.filter(f => /^audio\//i.test(f.mimeType || ''));
        if (!list.length) throw new Error('no audio stream');
        const m4a = list.filter(f => /audio\/mp4/i.test(f.mimeType));
        const pool = m4a.length ? m4a : list;
        pool.sort((a, b) => (Number(b.bitrate) || 0) - (Number(a.bitrate) || 0));
        const best = pool[0];
        const ext = /audio\/mp4/i.test(best.mimeType) ? 'm4a' : /opus/i.test(best.mimeType) ? 'opus' : 'webm';
        return {
            title: p.details.title || id, artist: cleanArtist(p.details.author), url: best.url, ext,
            size: Number(best.contentLength) || 0, dur: Number(p.details.lengthSeconds) || 0, ua: p.client.ua, via: 'youtube.com (' + p.client.name + ')'
        };
    }

    async function video(id) {
        const p = await player(id);
        const list = p.muxed.filter(f => /^video\/mp4/i.test(f.mimeType || ''));
        if (!list.length) throw new Error('no combined audio/video stream');
        list.sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
        const best = list[0];
        return {
            title: p.details.title || id, artist: cleanArtist(p.details.author), url: best.url, ext: 'mp4',
            size: Number(best.contentLength) || 0, ua: p.client.ua, via: 'youtube.com (' + p.client.name + ')'
        };
    }

    const diag = () => errs.length ? 'Direct YouTube failures:\n' + errs.map(e => '  ' + e).join('\n') : 'Direct YouTube: no failures recorded.';

    window.HzYtDirect = { search, audio, video, diag, _parseSearch: parseSearch };
})();
