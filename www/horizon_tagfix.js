/* HORIZON V1.99.139 · Fix music info
 *
 * Songs with no title / artist / album, no artwork or no lyrics are looked up online and filled in. No key, no account.
 *   Info + artwork : iTunes Search (title, artist, album, cover). Used only on a confident match (title + artist or length).
 *   Lyrics         : LRCLIB (time-stamped when it can), saved on the phone so they open instantly and offline.
 * What is stored: only the fields that were MISSING (never over a real tag), the cover (shrunk to 320 px) and the lyric text.
 * They live inside Horizon (the player, the lyric box, the AI and the lock-screen card all use them) and survive rescans.
 * The audio files themselves are not rewritten: Android's file tags stay as they are.
 * Public API: window.HorizonTagFix = { apply, artFor, lyricsFor, saveLyrics, runAll, stop, status, clean }
 */
(function () {
    'use strict';
    if (window.HorizonTagFix) return;

    const LS = 'horizon_tagfix_v1';
    const ITUNES_GAP = 3200;     // ms between iTunes calls (their soft limit is about 20 a minute)
    const REQ_MS = 9000;
    const RETRY_DAYS = 14;       // a song with no confident match is not asked again for two weeks
    let ov = {};
    try { ov = JSON.parse(localStorage.getItem(LS) || '{}') || {}; } catch (_) { ov = {}; }
    let saveTimer = 0;
    function save() {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => { try { localStorage.setItem(LS, JSON.stringify(ov)); } catch (_) { /* storage full: fixes still apply this session */ } }, 400);
    }

    // ---------- tiny IndexedDB (covers + lyrics) ----------
    let dbp = null;
    function db() {
        if (dbp) return dbp;
        dbp = new Promise((resolve, reject) => {
            try {
                const rq = indexedDB.open('horizon_tagfix', 1);
                rq.onupgradeneeded = () => { const d = rq.result; if (!d.objectStoreNames.contains('art')) d.createObjectStore('art'); if (!d.objectStoreNames.contains('lyr')) d.createObjectStore('lyr'); };
                rq.onsuccess = () => resolve(rq.result);
                rq.onerror = () => reject(rq.error || new Error('idb'));
            } catch (e) { reject(e); }
        });
        dbp.catch(() => { dbp = null; });
        return dbp;
    }
    function kvGet(store, key) {
        return db().then(d => new Promise(res => { try { const r = d.transaction(store).objectStore(store).get(key); r.onsuccess = () => res(r.result || null); r.onerror = () => res(null); } catch (_) { res(null); } })).catch(() => null);
    }
    function kvPut(store, key, val) {
        return db().then(d => new Promise(res => { try { const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).put(val, key); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (_) { res(false); } })).catch(() => false);
    }
    const artMem = new Map();
    async function artFor(id) {
        if (artMem.has(id)) return artMem.get(id);
        const v = (await kvGet('art', id)) || '';
        artMem.set(id, v);
        return v;
    }
    const lyricsFor = id => kvGet('lyr', id);
    function saveLyrics(id, res) {
        if (!id || !res || !(res.lrc || res.plain)) return Promise.resolve(false);
        return kvPut('lyr', id, { lrc: res.lrc || '', plain: res.plain || '', source: res.source || '', ts: Date.now() });
    }

    // ---------- text helpers ----------
    const UNK_A = /^(unknown artist|<unknown>|unknown|)$/i, UNK_AL = /^(unknown album|<unknown>|unknown|added files|)$/i;
    const norm = s => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim();
    const core = s => norm(String(s || '').replace(/\s*[(\[{][^)\]}]*[)\]}]/g, ''));
    function words(s) { return core(s).split(' ').filter(w => w && !/^(the|a|an|feat|ft|featuring|official|audio|video|lyrics|lyric|hd|hq)$/.test(w)); }
    function overlap(a, b) {
        const x = words(a), y = words(b);
        if (!x.length || !y.length) return 0;
        const sy = new Set(y);
        const hit = x.filter(w => sy.has(w)).length;
        return hit / Math.max(x.length, y.length);
    }
    // "01 - Drake_-_God's Plan (Official Video) [HD] www.site.com.mp3" -> { artist:'Drake', title:"God's Plan" }
    function clean(name) {
        let n = String(name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/_/g, ' ');
        n = n.replace(/\b(?:https?:\/\/)?(?:www\.)?[a-z0-9-]+\.(?:com|net|org|co|io|me|cc|info|ru|in|pk|mobi)\b/gi, ' ');
        n = n.replace(/[(\[{]\s*(?:official|lyric|lyrics|audio|video|music video|hd|hq|4k|explicit|clean|visualizer|remaster(?:ed)?|\d{2,3}\s*kbps|mp3|320|128)[^)\]}]*[)\]}]/gi, ' ');
        n = n.replace(/\b(?:official (?:music )?video|official audio|lyric video|audio only|\d{2,3}\s*kbps)\b/gi, ' ');
        n = n.replace(/^\s*\d{1,3}\s*[-.)]\s+/, '').replace(/\s{2,}/g, ' ').trim();
        const m = /^(.{2,60}?)\s+[-\u2013\u2014]\s+(.{2,120})$/.exec(n);
        return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: '', title: n };
    }
    const junkTitle = t => !t || /[_]|www\.|\.com|official|kbps|^\d{1,3}\s*[-.)]\s/i.test(t) || / - /.test(t);

    // ---------- network ----------
    function getJson(url, ms) {
        return new Promise((resolve, reject) => {
            let done = false;
            const ctl = typeof AbortController === 'function' ? new AbortController() : null;
            const timer = setTimeout(() => { if (done) return; done = true; try { if (ctl) ctl.abort(); } catch (_) { /* nothing to abort */ } const e = new Error('timeout'); e.timeout = true; reject(e); }, ms || REQ_MS);
            const fin = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
            let p; try { p = fetch(url, ctl ? { signal: ctl.signal } : undefined); } catch (e) { fin(reject, e); return; }
            Promise.resolve(p).then(r => { if (!r || !r.ok) { const e = new Error('http ' + (r && r.status)); e.status = r && r.status; throw e; } return r.json(); })
                .then(j => fin(resolve, j)).catch(e => fin(reject, e));
        });
    }
    let lastItunes = 0;
    async function itunes(term) {
        const wait = ITUNES_GAP - (Date.now() - lastItunes);
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        lastItunes = Date.now();
        const j = await getJson('https://itunes.apple.com/search?media=music&entity=song&limit=8&term=' + encodeURIComponent(term));
        return (j && Array.isArray(j.results)) ? j.results : [];
    }
    // Picks one result, or null. A lookalike is worse than nothing.
    function best(results, want) {
        let top = null, topScore = -1;
        results.forEach(r => {
            if (!r || !r.trackName) return;
            const ts = Math.max(overlap(want.title, r.trackName), overlap(r.trackName, want.title));
            if (ts < 0.74) return;
            const as = want.artist ? Math.max(overlap(want.artist, r.artistName), (norm(r.artistName).indexOf(norm(want.artist)) !== -1 || norm(want.artist).indexOf(norm(r.artistName)) !== -1) ? 0.8 : 0) : 0;
            const dd = (want.dur > 0 && r.trackTimeMillis) ? Math.abs(r.trackTimeMillis / 1000 - want.dur) : -1;
            if (want.artist && as < 0.5) return;
            if (!want.artist && !(dd >= 0 && dd <= 8)) return;                    // no artist known: the length has to agree, a bare title could be any artist's song
            if (dd > 25) return;
            const sc = ts + as * 0.6 + (dd >= 0 ? (dd <= 3 ? 0.3 : dd <= 8 ? 0.12 : 0) : 0);
            if (sc > topScore) { topScore = sc; top = r; }
        });
        return top;
    }
    async function shrink(url) {
        const big = String(url).replace(/\/\d+x\d+(bb)?\./, '/600x600bb.');
        try {
            const r = await fetch(big);
            if (!r || !r.ok) throw new Error('http');
            const blob = await r.blob();
            const bmp = await new Promise((res, rej) => { const im = new Image(); const u = URL.createObjectURL(blob); im.onload = () => { URL.revokeObjectURL(u); res(im); }; im.onerror = () => { URL.revokeObjectURL(u); rej(new Error('img')); }; im.src = u; });
            const c = document.createElement('canvas'); c.width = c.height = 320;
            const g = c.getContext('2d'), s = Math.min(bmp.width, bmp.height);
            g.drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, 320, 320);
            return c.toDataURL('image/jpeg', 0.86);
        } catch (_) { return big; }   // the link itself still paints (CSS backgrounds need no CORS)
    }
    async function lrc(artist, title, album, dur) {
        const q = 'artist_name=' + encodeURIComponent(artist) + '&track_name=' + encodeURIComponent(title);
        let row = null;
        try { row = await getJson('https://lrclib.net/api/get?' + q + (album ? '&album_name=' + encodeURIComponent(album) : '') + (dur > 0 ? '&duration=' + Math.round(dur) : '')); }
        catch (e) { if (!(e && e.status === 404)) throw e; }
        if (!row) {
            const rows = await getJson('https://lrclib.net/api/search?' + q);
            if (Array.isArray(rows)) row = rows.filter(r => r && !r.instrumental && (r.syncedLyrics || r.plainLyrics) && overlap(title, r.trackName) >= 0.74 && (!r.artistName || overlap(artist, r.artistName) >= 0.5) && !(dur > 0 && r.duration && Math.abs(r.duration - dur) > 20))
                .sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0))[0] || null;
        }
        if (!row || row.instrumental) return null;
        const synced = row.syncedLyrics ? String(row.syncedLyrics).trim() : '', plain = row.plainLyrics ? String(row.plainLyrics).trim() : '';
        if (!synced && !plain) return null;
        return { lrc: synced, plain: plain || synced.replace(/^\[[^\]]*\]\s*/gm, ''), source: 'LRCLIB' };
    }

    // ---------- the library ----------
    const mediaPlugin = () => { try { const c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() ? ((c.Plugins && c.Plugins.HorizonMedia) || null) : null; } catch (_) { return null; } };
    const srcOf = t => (t && t.path && !t.tmp) ? (/^(content|file):\/\//.test(t.path) ? t.path : 'file://' + t.path) : '';
    const fileName = t => String(t.path || '').split('/').pop();

    function apply(t, afterNative) {
        const o = t && ov[t.id];
        if (!o) return t;
        if (o.t && (!t.title || t.title === o.ft || t.title === o.t || junkTitle(t.title))) t.title = o.t;
        if (o.a && (UNK_A.test(t.artist || '') || t.artist === o.a)) t.artist = o.a;
        if (o.al && (UNK_AL.test(t.album || '') || t.album === o.al)) t.album = o.al;
        return t;
    }

    let running = false, stopFlag = false, prog = { done: 0, total: 0, fixed: 0, art: 0, lyrics: 0, skipped: 0 };
    const status = () => Object.assign({ running }, prog);
    function stop() { stopFlag = true; }

    async function fixTrack(t, flags) {
        const out = { meta: false, art: false, lyrics: false, tried: false };
        const o = ov[t.id] || {};
        const plug = mediaPlugin();
        // 1) what the file itself says (embedded tags can be richer than the Android index)
        if (plug && typeof plug.metadata === 'function' && srcOf(t)) {
            try {
                const tags = await plug.metadata({ source: srcOf(t) });
                if (tags) {
                    if (tags.title && String(tags.title).trim() && junkTitle(t.title)) t.title = String(tags.title).trim();
                    if (tags.artist && String(tags.artist).trim() && UNK_A.test(t.artist || '')) t.artist = String(tags.artist).trim();
                    if (tags.album && String(tags.album).trim() && UNK_AL.test(t.album || '')) t.album = String(tags.album).trim();
                    if (!t.dur && Number(tags.durationMs) > 0) t.dur = Number(tags.durationMs) / 1000;
                }
            } catch (_) { /* tags unreadable: the filename is still a clue */ }
        }
        const needMeta = UNK_A.test(t.artist || '') || UNK_AL.test(t.album || '') || junkTitle(t.title);
        const hasArtSaved = !!(await artFor(t.id));
        let hasArt = hasArtSaved;
        if (!hasArt && plug && srcOf(t)) { try { const r = await plug.art({ source: srcOf(t), size: 128 }); hasArt = !!(r && r.data); } catch (_) { hasArt = false; } }
        const hasLyr = !!(await lyricsFor(t.id));
        const recentlyTried = o.x && (Date.now() - o.x) < RETRY_DAYS * 864e5;
        let artist = UNK_A.test(t.artist || '') ? '' : t.artist, title = t.title;
        if (needMeta || !hasArt) {
            if (recentlyTried && !flags.force) { prog.skipped++; }
            else {
                const fn = clean(fileName(t));
                const want = { artist: artist || fn.artist, title: junkTitle(title) ? (fn.title || title) : title, dur: t.dur || 0 };
                if (!want.title) { out.tried = true; }
                else {
                    let hit = null;
                    try {
                        hit = best(await itunes((want.artist ? want.artist + ' ' : '') + want.title), want);
                        if (!hit && want.artist && want.dur > 0) hit = best(await itunes(want.title), Object.assign({}, want, { artist: '' }));   // the filename's artist may be wrong: the length has to agree
                    } catch (_) { return Object.assign(out, { net: true }); }
                    if (hit) {
                        const n = { t: o.t, a: o.a, al: o.al, ft: o.ft || t.title, s: 'iTunes', ts: Date.now() };
                        if (junkTitle(title) && hit.trackName) { n.t = hit.trackName; }
                        if (UNK_A.test(t.artist || '') && hit.artistName) { n.a = hit.artistName; }
                        if (UNK_AL.test(t.album || '') && hit.collectionName) { n.al = hit.collectionName.replace(/\s+-\s+(?:Single|EP)$/i, ''); }
                        if (n.t !== o.t || n.a !== o.a || n.al !== o.al) { ov[t.id] = n; apply(t); save(); out.meta = true; }
                        artist = UNK_A.test(t.artist || '') ? '' : t.artist; title = t.title;
                        if (!hasArt && hit.artworkUrl100) {
                            const data = await shrink(hit.artworkUrl100);
                            if (data) { artMem.set(t.id, data); await kvPut('art', t.id, data); if (window.HorizonMusic && HorizonMusic.setArt) HorizonMusic.setArt(t.id, data); out.art = true; }
                        }
                    } else out.tried = true;
                }
            }
        }
        // 2) lyrics, once the name is trustworthy
        if (!hasLyr && flags.lyrics !== false && artist && title && !junkTitle(title)) {
            try { const L = await lrc(artist, title, UNK_AL.test(t.album || '') ? '' : t.album, t.dur || 0); if (L) { await saveLyrics(t.id, L); out.lyrics = true; } } catch (_) { /* offline or rate limited: try next time */ }
        }
        if (out.tried) { const cur = ov[t.id] || {}; cur.x = Date.now(); ov[t.id] = cur; save(); }
        return out;
    }

    async function runAll(opts) {
        opts = opts || {};
        const say = m => { try { if (opts.status) opts.status(m); } catch (_) { /* ui gone */ } };
        if (running) return 'Already fixing music info (' + prog.done + '/' + prog.total + '). Fixed ' + prog.fixed + ' so far.';
        const M = window.HorizonMusic;
        if (!M || !M.library) return 'ERROR: the music player is not ready.';
        const list = M.library().filter(t => t && t.path && !t.tmp && !t.remote);
        if (!list.length) return 'ERROR: no songs in the library yet. Scan storage first.';
        running = true; stopFlag = false; prog = { done: 0, total: list.length, fixed: 0, art: 0, lyrics: 0, skipped: 0 };
        let net = 0;
        try {
            for (const t of list) {
                if (stopFlag) break;
                say('Fixing music info ' + (prog.done + 1) + '/' + prog.total + ' \u00b7 ' + (t.title || '').slice(0, 40));
                let r = null;
                try { r = await fixTrack(t, opts); } catch (_) { r = { net: true }; }
                prog.done++;
                if (r.net) { net++; if (net >= 6) break; } else net = 0;   // offline: stop instead of hammering
                if (r.meta) prog.fixed++;
                if (r.art) prog.art++;
                if (r.lyrics) prog.lyrics++;
                if (prog.done % 8 === 0 && M.rescanTags) M.rescanTags();
            }
        } finally {
            running = false;
            if (M.rescanTags) M.rescanTags();
        }
        const head = stopFlag ? 'Stopped' : (net >= 6 ? 'Stopped (no internet)' : 'Done');
        const msg = head + ': checked ' + prog.done + '/' + prog.total + ' songs. Filled in info for ' + prog.fixed + ', artwork for ' + prog.art + ', lyrics for ' + prog.lyrics + '.' + (prog.skipped ? ' ' + prog.skipped + ' had no confident match recently and were left alone.' : '') + ' Song files themselves were not changed.';
        say(msg);
        try { if (opts.notice) opts.notice(msg, 'ok'); } catch (_) { /* ui gone */ }
        return msg;
    }

    window.HorizonTagFix = { apply, artFor, lyricsFor, saveLyrics, runAll, stop, status, clean, _best: best };
})();
