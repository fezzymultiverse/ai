/* HORIZON · music player · V1.10.0
 *
 * A full music player that lives in the left panel (own MUSIC tab + a mini widget at the bottom), plus a
 * now-playing strip under the Horizon logo. The AI can see what is playing when the red eye is on.
 *
 * - Library: Android MediaStore scan through the native HorizonPerms.scanMusic method (whole storage that
 *   Android has indexed). Outside the installed app, "Add files" loads audio files for the session only.
 * - Player: queue, shuffle, repeat (off / all / one), seek, previous / next, likes, recent, search, sort.
 * - AI: a MUSIC block in the system prompt (now playing, position, next up, recent) and tools
 *   [[music.search: q]] [[music.play: id or words]] [[music.queue: id]] [[music.pause]] [[music.resume]]
 *   [[music.next]] [[music.prev]] [[music.now]]. The AI only knows metadata, it cannot hear the audio.
 *
 * Public API: window.HorizonMusic = { init, SRC, parse, run, block, seesAi, setAi, openTab, scan }
 */
(function () {
    'use strict';

    const LS = { ai: 'horizon_music_ai', liked: 'horizon_music_liked', recent: 'horizon_music_recent', last: 'horizon_music_last',
        shuffle: 'horizon_music_shuffle', repeat: 'horizon_music_repeat', all: 'horizon_music_all', sort: 'horizon_music_sort' };
    const SRC = '\\[\\[music\\.(search|play|queue|pause|resume|next|prev|now)(?::\\s*((?:(?!\\]\\])[\\s\\S])*?))?\\s*\\]\\]';
    const PAGE = 80;

    let host = { lsGet: () => null, lsSet() {}, notice() {}, onChange() {}, askAI() {}, openLeftTab() {}, nativeScan: null, srcFor: p => p };
    let lib = [];            // every track found
    let byId = new Map();
    let queue = [];          // track ids
    let qi = -1;
    let cur = null;
    let hist = [];
    let liked = new Set();
    let recent = [];         // [{id, ts}]
    let shuffle = false, repeat = 0, allAudio = false, sortBy = 'title';
    let view = 'songs', filter = null, search = '', shown = PAGE;
    let scanning = false, scanNote = '', scanTs = 0;
    let errRun = 0, seeking = false, loadedId = '';
    const au = window.HorizonAudio ? window.HorizonAudio() : new Audio();
    au.preload = 'metadata';

    const $ = id => document.getElementById(id);
    const jget = (k, d) => { try { const v = JSON.parse(host.lsGet(k)); return v == null ? d : v; } catch (e) { return d; } };
    const fmt = s => { s = Math.max(0, Math.floor(Number(s) || 0)); const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };
    const ico = (id, cls) => `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true"><use href="#${id}"/></svg>`;
    const hue = s => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 360; return h; };
    const seesAi = () => host.lsGet(LS.ai) !== '0';

    // ---------- library cache (IndexedDB) ----------
    let dbp = null;
    function db() {
        if (!dbp) dbp = new Promise((res, rej) => {
            if (!window.indexedDB) { rej(new Error('no IndexedDB')); return; }
            const r = indexedDB.open('horizon_music', 1);
            r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains('kv')) r.result.createObjectStore('kv'); };
            r.onsuccess = () => res(r.result);
            r.onerror = () => rej(r.error);
        });
        return dbp;
    }
    const kvGet = k => db().then(d => new Promise((res, rej) => { const q = d.transaction('kv', 'readonly').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }));
    const kvPut = (k, v) => db().then(d => new Promise((res, rej) => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(); t.onerror = () => rej(t.error); }));

    function setLib(tracks) {
        lib = tracks;
        byId = new Map(lib.map(t => [t.id, t]));
    }
    const visible = () => lib.filter(t => allAudio || t.music);
    async function saveLib() {
        try { await kvPut('lib', { ts: scanTs, tracks: lib.filter(t => !t.tmp).map(t => { const o = Object.assign({}, t); delete o.src; return o; }) }); } catch (e) { /* cache is optional */ }
    }
    function withSrc(t) { if (!t.src && t.path) t.src = host.srcFor(t.path); return t; }

    // ---------- scan ----------
    function fromNative(r) {
        const un = v => (!v || /^<unknown>$/i.test(v) ? '' : v);
        return {
            id: 'm' + r.id, title: r.title || String(r.path || '').split('/').pop().replace(/\.[^.]+$/, '') || 'Untitled',
            artist: un(r.artist) || 'Unknown artist', album: un(r.album) || 'Unknown album', dur: (Number(r.duration) || 0) / 1000,
            path: r.path || '', size: Number(r.size) || 0, added: Number(r.added) || 0, music: !!r.music
        };
    }
    async function scan() {
        if (scanning) return;
        scanning = true; scanNote = 'Scanning your storage for music...'; paintLib();
        try {
            const r = host.nativeScan ? await host.nativeScan() : null;
            if (r === null || r === undefined) {
                scanNote = 'Storage scanning works in the installed app. Here you can use Add files.';
            } else if (r.err) {
                scanNote = r.err; host.notice(r.err, 'error');
            } else {
                const keepTmp = lib.filter(t => t.tmp);
                setLib((r.tracks || []).map(fromNative).map(withSrc).filter(t => t.src).concat(keepTmp));
                scanTs = Date.now();
                await saveLib();
                const v = visible().length;
                scanNote = `Found ${v.toLocaleString()} song${v === 1 ? '' : 's'}${lib.length > v ? ' (' + (lib.length - v).toLocaleString() + ' other audio files hidden, switch All audio on to see them)' : ''}.`;
                if (cur && !byId.has(cur.id)) { cur = null; }
            }
        } catch (e) { scanNote = 'Scan failed: ' + ((e && e.message) || e); }
        scanning = false;
        paintAll();
        host.onChange();
    }
    function addFiles(files) {
        const add = [];
        Array.from(files || []).forEach(f => {
            if (!/^audio\//.test(f.type) && !/\.(mp3|m4a|aac|flac|wav|ogg|opus)$/i.test(f.name)) return;
            const name = f.name.replace(/\.[^.]+$/, '');
            const m = /^(.+?)\s+-\s+(.+)$/.exec(name);
            add.push({ id: 'f' + Date.now().toString(36) + add.length, title: m ? m[2] : name, artist: m ? m[1] : 'Unknown artist', album: 'Added files', dur: 0, path: '', size: f.size, added: Date.now() / 1000, music: true, tmp: true, src: URL.createObjectURL(f) });
        });
        if (!add.length) { host.notice('No audio files in that pick.', 'error'); return; }
        setLib(lib.concat(add));
        scanNote = `Added ${add.length} file${add.length === 1 ? '' : 's'} for this session.`;
        paintAll();
    }

    // ---------- playback ----------
    function noteRecent(id) {
        recent = recent.filter(r => r.id !== id);
        recent.unshift({ id, ts: Date.now() });
        recent = recent.slice(0, 40);
        host.lsSet(LS.recent, JSON.stringify(recent));
    }
    function mediaSession() {
        if (!cur || !('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
        try {
            navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist, album: cur.album, artwork: artCache.get(cur.id) ? [{ src: artCache.get(cur.id), sizes: '256x256', type: 'image/jpeg' }] : [] }); wantArt(cur);
            navigator.mediaSession.setActionHandler('play', () => { if (au.paused) toggle(); });
            navigator.mediaSession.setActionHandler('pause', () => { if (!au.paused) au.pause(); });
            navigator.mediaSession.setActionHandler('nexttrack', () => next(false));
            navigator.mediaSession.setActionHandler('previoustrack', () => prev());
            navigator.mediaSession.setActionHandler('seekto', d => { if (Number.isFinite(d.seekTime)) au.currentTime = d.seekTime; });
            navigator.mediaSession.setActionHandler('seekbackward', d => { au.currentTime = Math.max(0, au.currentTime - (d.seekOffset || 10)); });
            navigator.mediaSession.setActionHandler('seekforward', d => { au.currentTime = Math.min(au.duration || Infinity, au.currentTime + (d.seekOffset || 10)); });
            navigator.mediaSession.playbackState = au.paused ? 'paused' : 'playing';
        } catch (e) { /* not supported on this WebView */ }
    }
    function load(t, autoplay) {
        cur = t;
        au.track = t;
        if (loadedId !== t.id) { au.src = t.src; loadedId = t.id; }
        host.lsSet(LS.last, t.id);
        if (autoplay) {
            const p = au.play();
            if (p && p.catch) p.catch(e => onErr(e));
            noteRecent(t.id);
        }
        mediaSession();
        paintAll();
        host.onChange();
    }
    function playId(id, list) {
        const t = byId.get(id);
        if (!t) return false;
        if (list && list.length) queue = list.slice(0, 3000);
        qi = queue.indexOf(id);
        if (qi < 0) { queue.push(id); qi = queue.length - 1; }
        if (cur && cur.id !== id) { hist.push(cur.id); hist = hist.slice(-60); }
        errRun = 0;
        load(t, true);
        return true;
    }
    function toggle() {
        if (!cur) {
            const v = visible();
            if (!v.length) { host.notice('No songs yet. Scan your storage first.', 'error'); return; }
            const pick = shuffle ? v[Math.floor(Math.random() * v.length)] : v[0];
            playId(pick.id, sorted(v).map(t => t.id));
            return;
        }
        if (au.paused) {
            if (loadedId !== cur.id) { au.track = cur; au.src = cur.src; loadedId = cur.id; }
            const p = au.play(); if (p && p.catch) p.catch(e => onErr(e));
            noteRecent(cur.id);
        } else au.pause();
    }
    function next(auto) {
        if (!queue.length) return false;
        let n;
        if (shuffle && queue.length > 1) { do { n = Math.floor(Math.random() * queue.length); } while (n === qi); }
        else {
            n = qi + 1;
            if (n >= queue.length) {
                if (repeat === 1 || !auto) n = 0;
                else { au.pause(); au.currentTime = 0; paintNow(); return false; }
            }
        }
        return playId(queue[n]);
    }
    function prev() {
        if (au.currentTime > 3 || !queue.length) { au.currentTime = 0; return; }
        if (hist.length) { const id = hist.pop(); const t = byId.get(id); if (t) { qi = queue.indexOf(id); if (qi < 0) { queue.unshift(id); qi = 0; } errRun = 0; load(t, true); return; } }
        const n = qi > 0 ? qi - 1 : queue.length - 1;
        playId(queue[n]);
    }
    function onErr() {
        loadedId = '';
        errRun++;
        host.notice(`Could not play ${cur ? cur.title : 'that file'}. It may have moved. Rescan your storage.`, 'error');
        if (errRun < 3 && queue.length > 1) setTimeout(() => next(true), 400); else paintNow();
    }
    au.addEventListener('ended', () => { if (repeat === 2) { au.currentTime = 0; const p = au.play(); if (p && p.catch) p.catch(onErr); } else next(true); });
    au.addEventListener('error', onErr);
    au.addEventListener('play', () => { errRun = 0; mediaSession(); paintNow(); host.onChange(); });
    au.addEventListener('pause', () => { mediaSession(); paintNow(); host.onChange(); });
    au.addEventListener('loadedmetadata', () => { if (cur && isFinite(au.duration) && au.duration > 0) { cur.dur = au.duration; paintProgress(); } });
    au.addEventListener('timeupdate', paintProgress);

    // ---------- views ----------
    function sorted(list) {
        const a = list.slice();
        if (sortBy === 'artist') a.sort((x, y) => x.artist.localeCompare(y.artist) || x.title.localeCompare(y.title));
        else if (sortBy === 'newest') a.sort((x, y) => (y.added || 0) - (x.added || 0));
        else a.sort((x, y) => x.title.localeCompare(y.title));
        return a;
    }
    function matches(t, q) {
        const h = (t.title + ' ' + t.artist + ' ' + t.album).toLowerCase();
        return q.toLowerCase().split(/\s+/).filter(Boolean).every(w => h.indexOf(w) !== -1);
    }
    function songList() {
        let l = visible();
        if (view === 'liked') l = l.filter(t => liked.has(t.id));
        if (view === 'recent') l = recent.map(r => byId.get(r.id)).filter(t => t && (allAudio || t.music));
        if (view === 'queue') l = queue.map(id => byId.get(id)).filter(Boolean);
        if (filter) l = l.filter(t => (filter.k === 'artist' ? t.artist : t.album) === filter.v);
        if (search) l = l.filter(t => matches(t, search));
        return (view === 'recent' || view === 'queue') ? l : sorted(l);
    }
    function groups(key) {
        const m = new Map();
        visible().forEach(t => { const k = t[key]; m.set(k, (m.get(k) || 0) + 1); });
        let a = [...m.entries()];
        if (search) a = a.filter(([k]) => k.toLowerCase().indexOf(search.toLowerCase()) !== -1);
        return a.sort((x, y) => x[0].localeCompare(y[0]));
    }

    // ---------- paint ----------
    // V1.40.0: real album artwork. Android pulls the embedded picture (or the thumbnail, or cover.jpg beside the file) and caches it.
    const artCache = new Map();   // track id -> data URL, or '' when the song has no artwork
    const artQueue = [];
    let artBusy = 0;
    const artPlugin = () => { try { const c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() ? ((c.Plugins && c.Plugins.HorizonMedia) || (c.registerPlugin && c.registerPlugin('HorizonMedia'))) : null; } catch (_) { return null; } };
    const artSource = t => (t && t.path && !t.tmp) ? (/^(content|file):\/\//.test(t.path) ? t.path : 'file://' + t.path) : '';
    function paintArt(node, url) {
        if (!node || !url) return;
        node.style.background = 'center / cover no-repeat url("' + url + '")';
        node.textContent = '';
        node.classList.add('has-art');
    }
    function paintArtFor(id) {
        const url = artCache.get(id);
        if (!url) return;
        document.querySelectorAll('.mp-tile[data-art="' + String(id).replace(/"/g, '') + '"]').forEach(n => paintArt(n, url));
        if (cur && cur.id === id && 'mediaSession' in navigator && typeof MediaMetadata !== 'undefined') {
            try { navigator.mediaSession.metadata = new MediaMetadata({ title: cur.title, artist: cur.artist, album: cur.album, artwork: [{ src: url, sizes: '256x256', type: 'image/jpeg' }] }); } catch (_) { /* optional */ }
        }
    }
    function pumpArt() {
        const p = artPlugin();
        while (p && artBusy < 2 && artQueue.length) {
            const t = artQueue.shift();
            if (artCache.has(t.id)) { paintArtFor(t.id); continue; }
            artBusy++;
            Promise.resolve(p.art({ source: artSource(t), size: 256 })).then(r => { artCache.set(t.id, (r && r.data) || ''); paintArtFor(t.id); }, () => { artCache.set(t.id, ''); }).then(() => { artBusy--; pumpArt(); });
        }
    }
    function wantArt(t) {
        if (!t || !artSource(t) || !artPlugin()) return;
        if (artCache.has(t.id)) { paintArtFor(t.id); return; }
        if (artQueue.some(q => q.id === t.id)) return;
        artQueue.push(t); pumpArt();
    }
    const artObserver = ('IntersectionObserver' in window) ? new IntersectionObserver(es => { es.forEach(e => { if (e.isIntersecting) { artObserver.unobserve(e.target); const t = byId.get(e.target.dataset.art); if (t) wantArt(t); } }); }, { rootMargin: '120px' }) : null;
    function tile(t, big) {
        const d = document.createElement('span');
        d.className = 'mp-tile' + (big ? ' big' : '');
        const h = hue(t ? t.artist + t.album : 'x');
        d.style.background = `linear-gradient(135deg, hsl(${h} 70% 48%), hsl(${(h + 50) % 360} 70% 38%))`;
        d.textContent = t ? (t.title.trim().charAt(0) || '♪').toUpperCase() : '♪';
        if (t && artSource(t)) {
            d.dataset.art = t.id;
            if (artCache.has(t.id)) paintArt(d, artCache.get(t.id));
            else if (big || !artObserver) wantArt(t);
            else artObserver.observe(d);
        }
        return d;
    }
    function eyeBtn(cls) {
        const on = seesAi();
        return `<button class="mp-eye ${on ? 'on' : 'off'} ${cls || ''}" type="button" data-act="eye" aria-pressed="${on}" aria-label="${on ? 'AI can see your music. Tap to hide it' : 'Music is hidden from the AI. Tap to show it'}" title="${on ? 'AI can see what is playing' : 'Hidden from the AI'}">${ico(on ? 'i-eye' : 'i-eye-off')}</button>`;
    }
    function paintProgress() {
        const dur = (cur && (au.duration > 0 && isFinite(au.duration) ? au.duration : cur.dur)) || 0;
        const pos = au.currentTime || 0;
        if ('mediaSession' in navigator && navigator.mediaSession.setPositionState && dur > 0 && isFinite(dur)) {
            try { navigator.mediaSession.setPositionState({ duration: dur, playbackRate: 1, position: Math.min(dur, Math.max(0, pos)) }); } catch (_) {}
        }
        const f = dur ? Math.min(1, pos / dur) : 0;
        document.querySelectorAll('.mp-prog').forEach(e => { e.style.width = (f * 100).toFixed(1) + '%'; });
        const s = $('mpSeek');
        if (s && !seeking) s.value = String(Math.round(f * 1000));
        const a = $('mpPos'), b = $('mpDur');
        if (a) a.textContent = fmt(pos);
        if (b) b.textContent = dur ? fmt(dur) : '--:--';
    }
    let dismissedId = '', wasPlaying = false;
    function paintNow() {
        const playing = !!cur && !au.paused;
        const title = cur ? cur.title : 'Nothing playing';
        const sub = cur ? cur.artist + (cur.album && cur.album !== 'Unknown album' ? ' · ' + cur.album : '') : 'Scan your storage in the Music tab';
        const strip = $('mpNow');
        if (strip) {
            if (playing && !wasPlaying) dismissedId = '';
            wasPlaying = playing;
            strip.hidden = !cur || (!!cur && dismissedId === cur.id);
            strip.style.transform = ''; strip.style.opacity = ''; strip.classList.remove('swiping');
            strip.classList.toggle('playing', playing);
            strip.innerHTML = `<button class="mp-now-main" type="button" data-act="open" aria-label="Open the music player">
                <span class="mp-now-t"><b></b><span></span></span>
                <span class="mp-wave" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></span></button>
                <button class="mp-ctl" type="button" data-act="toggle" aria-label="${playing ? 'Pause' : 'Play'}">${ico(playing ? 'i-pause' : 'i-play')}</button>
                ${eyeBtn()}<i class="mp-prog"></i>`;
            if (cur) { const nt = tile(cur); nt.classList.add('mp-now-ic'); strip.querySelector('.mp-now-main').prepend(nt); }
            strip.querySelector('.mp-now-t b').textContent = title;
            strip.querySelector('.mp-now-t span').textContent = cur ? cur.artist : '';
        }
        const mini = $('mpMini');
        if (mini) {
            mini.classList.toggle('playing', playing);
            mini.innerHTML = `<div class="mp-mini-top"><span class="mp-mini-ic"></span><span class="mp-mini-t"><b></b><span></span></span>
                ${eyeBtn()}<button class="mp-ctl" type="button" data-act="open" aria-label="Expand the music player">${ico('i-expand')}</button></div>
                <div class="mp-mini-ctl"><button class="mp-ctl" type="button" data-act="prev" aria-label="Previous">${ico('i-prev')}</button>
                <button class="mp-ctl big" type="button" data-act="toggle" aria-label="${playing ? 'Pause' : 'Play'}">${ico(playing ? 'i-pause' : 'i-play')}</button>
                <button class="mp-ctl" type="button" data-act="next" aria-label="Next">${ico('i-next')}</button></div><i class="mp-prog"></i>`;
            mini.querySelector('.mp-mini-t b').textContent = title;
            mini.querySelector('.mp-mini-t').dataset.act = 'open';
            mini.querySelector('.mp-mini-t').setAttribute('role', 'button');
            mini.querySelector('.mp-mini-t').tabIndex = 0;
            mini.querySelector('.mp-mini-t span').textContent = sub;
            mini.querySelector('.mp-mini-ic').replaceWith(Object.assign(tile(cur), { className: 'mp-tile mp-mini-ic' }));
        }
        const card = $('mpCard');
        if (card) {
            card.innerHTML = `<div class="mp-card-art"></div><div class="mp-card-t"><b></b><span></span><em></em></div>
                <div class="mp-seekrow"><span id="mpPos">0:00</span><input id="mpSeek" class="mp-seek" type="range" min="0" max="1000" value="0" aria-label="Seek"><span id="mpDur">--:--</span></div>
                <div class="mp-ctls">
                    <button class="mp-ctl ${shuffle ? 'act' : ''}" type="button" data-act="shuffle" aria-pressed="${shuffle}" aria-label="Shuffle">${ico('i-shuffle')}</button>
                    <button class="mp-ctl" type="button" data-act="prev" aria-label="Previous">${ico('i-prev')}</button>
                    <button class="mp-ctl huge" type="button" data-act="toggle" aria-label="${playing ? 'Pause' : 'Play'}">${ico(playing ? 'i-pause' : 'i-play')}</button>
                    <button class="mp-ctl" type="button" data-act="next" aria-label="Next">${ico('i-next')}</button>
                    <button class="mp-ctl ${repeat ? 'act' : ''}" type="button" data-act="repeat" aria-label="Repeat: ${['off', 'all', 'one'][repeat]}">${ico('i-repeat')}${repeat === 2 ? '<sup>1</sup>' : ''}</button>
                </div>
                <div class="mp-extra">
                    <button class="use-btn ${cur && liked.has(cur.id) ? 'on' : ''}" type="button" data-act="like" ${cur ? '' : 'disabled'}>${ico('i-heart')} ${cur && liked.has(cur.id) ? 'Liked' : 'Like'}</button>
                    <button class="use-btn" type="button" data-act="comment" ${cur ? '' : 'disabled'}>${ico('i-chat')} Ask AI</button>
                    ${eyeBtn('wide')}
                </div>`;
            card.querySelector('.mp-card-art').appendChild(tile(cur, true));
            card.querySelector('.mp-card-t b').textContent = title;
            card.querySelector('.mp-card-t span').textContent = cur ? cur.artist : 'Tap Scan below to find your music';
            card.querySelector('.mp-card-t em').textContent = cur && cur.album ? cur.album : '';
            const s = $('mpSeek');
            s.addEventListener('input', () => { seeking = true; const d = au.duration || (cur && cur.dur) || 0; $('mpPos').textContent = fmt((s.value / 1000) * d); });
            s.addEventListener('change', () => { const d = au.duration || (cur && cur.dur) || 0; if (d) au.currentTime = (s.value / 1000) * d; seeking = false; });
            paintProgress();
        }
        document.querySelectorAll('#mpList .mp-row').forEach(r => r.classList.toggle('cur', !!cur && r.dataset.id === cur.id));
        paintProgress();
    }
    function rowFor(t) {
        const r = document.createElement('div');
        r.className = 'mp-row' + (cur && cur.id === t.id ? ' cur' : '');
        r.dataset.id = t.id;
        r.setAttribute('role', 'button'); r.tabIndex = 0;
        const x = document.createElement('span'); x.className = 'mp-row-t';
        const b = document.createElement('b'); b.textContent = t.title;
        const s = document.createElement('span'); s.textContent = t.artist + (t.dur ? ' · ' + fmt(t.dur) : '');
        x.append(b, s);
        const h = document.createElement('button');
        h.type = 'button'; h.dataset.act = 'rowlike'; h.className = 'mp-heart' + (liked.has(t.id) ? ' on' : '');
        h.setAttribute('aria-label', (liked.has(t.id) ? 'Unlike ' : 'Like ') + t.title);
        h.innerHTML = ico('i-heart');
        r.append(tile(t), x, h);
        return r;
    }
    function paintLib() {
        const st = $('mpStatus');
        if (st) st.textContent = scanNote || (lib.length ? `${visible().length.toLocaleString()} songs${scanTs ? ' · scanned ' + new Date(scanTs).toLocaleDateString() : ''}` : 'No songs yet. Tap Scan to look through your storage.');
        const sc = $('mpScan');
        if (sc) { sc.disabled = scanning; sc.textContent = scanning ? 'Scanning...' : 'Scan storage'; }
        const all = $('mpAll');
        if (all) { all.classList.toggle('on', allAudio); all.setAttribute('aria-pressed', String(allAudio)); }
        document.querySelectorAll('#mpViews [data-v]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.v === view)));
        const so = $('mpSort');
        if (so) so.textContent = 'Sort: ' + ({ title: 'A-Z', artist: 'Artist', newest: 'Newest' })[sortBy];
        const fl = $('mpFilter');
        if (fl) { fl.hidden = !filter; fl.textContent = filter ? (filter.k === 'artist' ? 'Artist: ' : 'Album: ') + filter.v + '  ✕' : ''; }
        const box = $('mpList');
        if (!box) return;
        box.replaceChildren();
        if (view === 'artists' || view === 'albums') {
            const key = view === 'artists' ? 'artist' : 'album';
            const g = groups(key);
            if (!g.length) box.appendChild(emptyMsg('Nothing here yet.'));
            g.slice(0, shown).forEach(([name, n]) => {
                const r = document.createElement('div');
                r.className = 'mp-row'; r.dataset.group = name; r.dataset.gk = key; r.setAttribute('role', 'button'); r.tabIndex = 0;
                const x = document.createElement('span'); x.className = 'mp-row-t';
                const b = document.createElement('b'); b.textContent = name;
                const s = document.createElement('span'); s.textContent = n + ' song' + (n === 1 ? '' : 's');
                x.append(b, s);
                r.append(tile({ title: name, artist: name, album: name }), x);
                box.appendChild(r);
            });
            if (g.length > shown) box.appendChild(moreBtn(g.length));
            return;
        }
        const l = songList();
        if (!l.length) box.appendChild(emptyMsg(view === 'liked' ? 'No liked songs yet. Tap a heart.' : view === 'queue' ? 'The queue is empty. Play a song to fill it.' : view === 'recent' ? 'Nothing played yet.' : lib.length ? 'No songs match.' : 'No songs yet. Tap Scan storage.'));
        l.slice(0, shown).forEach(t => box.appendChild(rowFor(t)));
        if (l.length > shown) box.appendChild(moreBtn(l.length));
    }
    const emptyMsg = t => { const p = document.createElement('p'); p.className = 'hint mp-empty'; p.textContent = t; return p; };
    function moreBtn(total) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'use-btn mp-more'; b.dataset.act = 'more'; b.textContent = `Show more (${total - shown} left)`;
        return b;
    }
    function paintAll() { paintNow(); paintLib(); }

    // ---------- skeleton + events ----------
    function build() {
        const tab = $('mpTab');
        if (tab) {
            tab.innerHTML = `<div class="mp-card" id="mpCard"></div>
                <div class="mp-scanbar"><button class="primary-btn" id="mpScan" type="button">Scan storage</button>
                    <button class="use-btn" id="mpAdd" type="button">Add files</button>
                    <button class="use-btn" id="mpAll" type="button" aria-pressed="false">All audio</button></div>
                <p class="hint" id="mpStatus"></p>
                <input id="mpFile" type="file" accept="audio/*" multiple hidden>
                <input id="mpQ" class="mp-q" type="search" placeholder="Search songs, artists, albums" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Search music">
                <div class="mp-views" id="mpViews" role="tablist" aria-label="Music views">
                    <button role="tab" data-v="songs" type="button">Songs</button><button role="tab" data-v="artists" type="button">Artists</button>
                    <button role="tab" data-v="albums" type="button">Albums</button><button role="tab" data-v="liked" type="button">Liked</button>
                    <button role="tab" data-v="recent" type="button">Recent</button><button role="tab" data-v="queue" type="button">Queue</button></div>
                <div class="mp-tools"><button class="use-btn" id="mpSort" type="button"></button><button class="use-btn" id="mpFilter" type="button" hidden></button></div>
                <div class="mp-list" id="mpList"></div>`;
            $('mpScan').addEventListener('click', scan);
            $('mpAdd').addEventListener('click', () => $('mpFile').click());
            $('mpFile').addEventListener('change', e => { addFiles(e.target.files); e.target.value = ''; });
            $('mpAll').addEventListener('click', () => { allAudio = !allAudio; host.lsSet(LS.all, allAudio ? '1' : '0'); shown = PAGE; paintLib(); });
            $('mpSort').addEventListener('click', () => { sortBy = sortBy === 'title' ? 'artist' : sortBy === 'artist' ? 'newest' : 'title'; host.lsSet(LS.sort, sortBy); paintLib(); });
            $('mpFilter').addEventListener('click', () => { filter = null; shown = PAGE; paintLib(); });
            $('mpQ').addEventListener('input', e => { search = e.target.value.trim(); shown = PAGE; paintLib(); });
            $('mpViews').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; shown = PAGE; paintLib(); });
            $('mpList').addEventListener('click', e => {
                const act = e.target.closest('[data-act]');
                if (act && act.dataset.act === 'more') { shown += PAGE; paintLib(); return; }
                if (act && act.dataset.act === 'rowlike') { const id = e.target.closest('.mp-row').dataset.id; toggleLike(id); act.classList.toggle('on', liked.has(id)); return; }
                const row = e.target.closest('.mp-row');
                if (!row) return;
                if (row.dataset.group) { filter = { k: row.dataset.gk, v: row.dataset.group }; view = 'songs'; shown = PAGE; paintLib(); return; }
                const l = songList().map(t => t.id);
                playId(row.dataset.id, view === 'queue' ? queue : l);
            });
        }
        document.addEventListener('click', e => {
            const b = e.target.closest('#mpNow [data-act], #mpMini [data-act], #mpCard [data-act]');
            if (!b) return;
            e.stopPropagation();
            const a = b.dataset.act;
            if (a === 'toggle') toggle();
            else if (a === 'next') next(false);
            else if (a === 'prev') prev();
            else if (a === 'shuffle') { shuffle = !shuffle; host.lsSet(LS.shuffle, shuffle ? '1' : '0'); paintNow(); }
            else if (a === 'repeat') { repeat = (repeat + 1) % 3; host.lsSet(LS.repeat, String(repeat)); paintNow(); }
            else if (a === 'like') { if (cur) { toggleLike(cur.id); paintAll(); } }
            else if (a === 'eye') setAi(!seesAi());
            else if (a === 'open') openTab();
            else if (a === 'comment') comment();
        });
    }
    function toggleLike(id) {
        if (liked.has(id)) liked.delete(id); else liked.add(id);
        host.lsSet(LS.liked, JSON.stringify([...liked]));
    }
    function setAi(on) {
        host.lsSet(LS.ai, on ? '1' : '0');
        paintNow();
        host.notice(on ? 'The AI can see what is playing' : 'Music is hidden from the AI');
        host.onChange();
    }
    document.addEventListener('horizon-media-command', e => { if (e.detail === 'next') next(false); else if (e.detail === 'prev') prev(); });
    function openTab() { host.openLeftTab('music'); }
    function comment() {
        if (!cur) return;
        if (!seesAi()) { host.notice('The AI cannot see your music. Tap the red eye first.', 'error'); return; }
        host.askAI(`What do you think of what's playing right now? "${cur.title}" by ${cur.artist}.`);
    }

    // ---------- AI side ----------
    function state() { return !cur ? 'stopped' : au.paused ? 'paused' : 'playing'; }
    function line(t) { return `${t.title} - ${t.artist}${t.album && t.album !== 'Unknown album' ? ' (' + t.album + ')' : ''}${t.dur ? ' [' + fmt(t.dur) + ']' : ''}`; }
    function block() {
        if (!seesAi()) return 'MUSIC PLAYER\nHidden by Fezzy (the red eye in the music widget). You cannot see what is playing and you have no music tools. If he asks about his music, tell him to tap the eye to show it.';
        const out = ['MUSIC PLAYER (Fezzy\'s own player, live; the red eye is on so you can see it)'];
        out.push(lib.length ? `Library: ${visible().length} songs.` : 'Library: not scanned yet (Music tab, Scan storage).');
        if (cur) {
            const dur = (au.duration > 0 && isFinite(au.duration)) ? au.duration : cur.dur;
            out.push(`NOW PLAYING (${state()}): ${line(cur)} at ${fmt(au.currentTime)}${dur ? ' of ' + fmt(dur) : ''}. id=${cur.id}${liked.has(cur.id) ? ', he liked it' : ''}`);
            const nx = queue.slice(qi + 1, qi + 4).map(id => byId.get(id)).filter(Boolean);
            if (nx.length) out.push('Up next: ' + nx.map(t => t.title + ' - ' + t.artist).join(' | '));
        } else out.push('NOW PLAYING: nothing.');
        const rc = recent.filter(r => !cur || r.id !== cur.id).slice(0, 5).map(r => byId.get(r.id)).filter(Boolean);
        if (rc.length) out.push('Recently played: ' + rc.map(t => t.title + ' - ' + t.artist).join(' | '));
        if (liked.size) out.push(`Liked songs: ${liked.size}.`);
        out.push('TOOLS (tag alone in your reply, up to 3 per turn; the result comes back to you before you answer): [[music.now]]  [[music.search: words]] returns up to 10 songs with ids  [[music.play: id or words]]  [[music.queue: id]]  [[music.pause]]  [[music.resume]]  [[music.next]]  [[music.prev]].');
        out.push('You only know metadata (title, artist, album, length, position). You cannot hear the audio and cannot see lyrics here: talk about the song from what you genuinely know, say so when you do not, and never paste long lyrics. Comment on what is playing like a friend when he asks or it fits, do not interrupt unprompted. Never say you played something until the tool result confirms it.');
        return out.join('\n');
    }
    function parse(text) {
        const re = new RegExp(SRC, 'gi');
        const calls = [];
        let m;
        while ((m = re.exec(text)) && calls.length < 3) calls.push({ mu: true, kind: 'music.' + m[1].toLowerCase(), arg: (m[2] || '').trim() });
        return calls;
    }
    function find(q, n) {
        const l = visible();
        const byIdHit = byId.get(q);
        if (byIdHit) return [byIdHit];
        const words = q.toLowerCase().split(/\s+/).filter(Boolean);
        return l.map(t => { const h = (t.title + ' ' + t.artist + ' ' + t.album).toLowerCase(); let s = 0; words.forEach(w => { if (h.indexOf(w) !== -1) s++; if (t.title.toLowerCase().indexOf(w) !== -1) s += 0.5; }); return { t, s }; })
            .filter(x => x.s >= words.length).sort((a, b) => b.s - a.s).slice(0, n).map(x => x.t);
    }
    async function run(kind, arg) {
        if (!seesAi()) return { text: 'ERROR: music is hidden from you. Tell Fezzy to tap the red eye.' };
        try {
            if (kind === 'music.now') return { text: cur ? `${state()}: ${line(cur)} at ${fmt(au.currentTime)} id=${cur.id}` : 'Nothing is playing.' };
            if (kind === 'music.pause') { au.pause(); return { text: cur ? 'Paused.' : 'Nothing was playing.' }; }
            if (kind === 'music.resume') { if (!cur) return { text: 'ERROR: nothing is loaded. Use music.play first.' }; if (au.paused) toggle(); return { text: 'Playing: ' + line(cur) }; }
            if (kind === 'music.next') { if (!next(false)) return { text: 'ERROR: nothing queued.' }; return { text: 'Now playing: ' + line(cur) }; }
            if (kind === 'music.prev') { prev(); return { text: cur ? 'Now playing: ' + line(cur) : 'Nothing to go back to.' }; }
            if (!lib.length) return { text: 'ERROR: the library is empty. Tell Fezzy to open the Music tab and tap Scan storage.' };
            if (kind === 'music.search') {
                if (!arg) return { text: 'ERROR: use [[music.search: words]].' };
                const r = find(arg, 10);
                return { text: r.length ? r.map((t, i) => `${i + 1}. ${line(t)} id=${t.id}`).join('\n') : `No songs match "${arg}".` };
            }
            if (kind === 'music.play' || kind === 'music.queue') {
                if (!arg) return { text: 'ERROR: give an id or words.' };
                const r = find(arg, 1);
                if (!r.length) return { text: `ERROR: nothing in the library matches "${arg}". Try music.search.` };
                const t = r[0];
                if (kind === 'music.queue') { if (!cur) return playTool(t); queue.splice(qi + 1, 0, t.id); paintLib(); return { text: `Queued next: ${line(t)}` }; }
                return playTool(t);
            }
            return { text: 'ERROR: unknown music tool ' + kind };
        } catch (e) { return { text: 'ERROR: ' + ((e && e.message) || e) }; }
    }
    function playTool(t) {
        playId(t.id, sorted(visible()).map(x => x.id));
        return { text: `Started: ${line(t)}. If Android blocks autoplay it may need a tap on play.` };
    }

    // ---------- init ----------
    // V1.40.0: swipe the now-playing strip to the right to remove it (it comes back with the next song, or when you press play again).
    function bindSwipe() {
        const strip = $('mpNow');
        if (!strip || strip.dataset.swipe) return;
        strip.dataset.swipe = '1';
        let x0 = 0, y0 = 0, dx = 0, on = false, locked = false;
        strip.addEventListener('touchstart', e => {
            if (e.touches.length !== 1) return;
            x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; dx = 0; on = true; locked = false;
        }, { passive: true });
        strip.addEventListener('touchmove', e => {
            if (!on) return;
            const mx = e.touches[0].clientX - x0, my = e.touches[0].clientY - y0;
            if (!locked) {
                if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { on = false; return; }
                if (Math.abs(mx) > 10 && Math.abs(mx) > Math.abs(my) * 1.4) { locked = true; strip.classList.add('swiping'); }
                else return;
            }
            dx = Math.max(0, mx);
            strip.style.transform = 'translateX(' + dx + 'px)';
            strip.style.opacity = String(Math.max(0.25, 1 - dx / (strip.offsetWidth || 300)));
        }, { passive: true });
        const end = () => {
            if (!on) return;
            on = false;
            if (!locked) return;
            const w = strip.offsetWidth || 300;
            if (dx > Math.min(110, w * 0.3)) {
                strip.style.transform = 'translateX(' + w + 'px)'; strip.style.opacity = '0';
                const id = cur ? cur.id : '';
                setTimeout(() => { dismissedId = id; strip.hidden = true; strip.classList.remove('swiping'); strip.style.transform = ''; strip.style.opacity = ''; }, 170);
            } else {
                strip.classList.remove('swiping'); strip.style.transform = ''; strip.style.opacity = '';
            }
            locked = false;
        };
        strip.addEventListener('touchend', end, { passive: true });
        strip.addEventListener('touchcancel', end, { passive: true });
    }
    async function init(h) {
        host = Object.assign(host, h || {});
        liked = new Set(jget(LS.liked, []));
        recent = jget(LS.recent, []);
        shuffle = host.lsGet(LS.shuffle) === '1';
        repeat = Number(host.lsGet(LS.repeat)) || 0;
        allAudio = host.lsGet(LS.all) === '1';
        sortBy = host.lsGet(LS.sort) || 'title';
        build();
        bindSwipe();
        try {
            const c = await kvGet('lib');
            if (c && c.tracks) { scanTs = c.ts || 0; setLib(c.tracks.map(withSrc).filter(t => t.src)); }
        } catch (e) { /* no cache yet */ }
        const last = host.lsGet(LS.last);
        if (last && byId.has(last)) { cur = byId.get(last); queue = [last]; qi = 0; }
        if (typeof au.restore === 'function') {
            try {
                const live = await au.restore(lib);
                if (live && byId.has(live)) { cur = byId.get(live); loadedId = live; queue = [live]; qi = 0; mediaSession(); }
            } catch (_) { /* No live Android player to reattach. */ }
        }
        paintAll();
        host.onChange();
    }

    window.HorizonMusic = { init, SRC, parse, run, block, seesAi, setAi, openTab, scan };
})();
