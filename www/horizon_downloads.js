/* Horizon V1.23.0: DOWNLOADS app (Apps menu, 5th tile).
 * - MY DOWNLOADS: one history for everything saved by Horizon (YouTube terminal, chat AI, and every source below),
 *   with filters, live progress, Open on finished files, Retry on failed ones, Remove, Clear finished.
 * - GET: YouTube (opens the terminal), Audius (music), Internet Archive (films, shows, radio, albums, .torrent),
 *   Wikimedia Commons (openly licensed images), any direct link, GitHub / GitLab repo .zip, torrent (magnet or .torrent).
 * Files are saved through the same MediaStore path as music: Music/Horizon, Movies/Horizon, Pictures/Horizon, Download/Horizon.
 * Horizon has no torrent engine: magnet links are handed to an installed torrent app. Only save what you have the right to save.
 */
(function () {
    'use strict';
    const view = document.getElementById('hzDownloadsView');
    if (!view) return;
    const KEY = 'horizon_dl_hist', PROV_KEY = 'horizon_dl_repo_prov', MAX = 200, MAXP = 3;
    const TYPES = { audio: ['🎵', 'Music'], video: ['🎬', 'Video'], image: ['🖼️', 'Images'], file: ['📄', 'Files'], repo: ['📦', 'Repos'], torrent: ['🧲', 'Torrents'] };
    const SRC = { youtube: 'YouTube', chat: 'Chat AI', audius: 'Audius', archive: 'Internet Archive', commons: 'Wikimedia Commons', link: 'Link', repo: 'Repo', torrent: 'Torrent' };
    const EXT = { audio: /^(mp3|m4a|aac|opus|ogg|oga|wav|flac|wma)$/i, video: /^(mp4|m4v|mkv|webm|mov|avi|3gp|ogv)$/i, image: /^(jpe?g|png|gif|webp|bmp|svg|avif|heic)$/i };
    const DEF_EXT = { audio: 'mp3', video: 'mp4', image: 'jpg', file: 'bin' };
    const enc = encodeURIComponent;
    const host = () => window.HorizonDlHost || null;
    const isActive = s => s === 'working' || s === 'queued';
    const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
    const btn = (label, cls, fn) => { const b = el('button', 'dlx-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; };
    const say = (text, kind) => { const h = host(); if (h && h.notice) h.notice(text, kind); };
    const bytesText = n => { n = Number(n) || 0; if (!n) return ''; return n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' GB' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; };
    const ago = ts => { const s = (Date.now() - (ts || 0)) / 1000; return s < 60 ? 'just now' : s < 3600 ? Math.floor(s / 60) + ' min ago' : s < 86400 ? Math.floor(s / 3600) + ' h ago' : Math.floor(s / 86400) + ' d ago'; };
    const safe = s => { const h = host(); const v = String(s || '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, ' ').trim().slice(0, 90); return v || (h && h.safeName ? h.safeName('download') : 'download'); };
    const kindOf = name => { const m = String(name).match(/\.([A-Za-z0-9]{2,5})$/); const e = m ? m[1] : ''; return EXT.audio.test(e) ? 'audio' : EXT.video.test(e) ? 'video' : EXT.image.test(e) ? 'image' : 'file'; };
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } };
    const uid = () => 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // ---------- history ----------
    let list = [];
    let tab = 'mine', filter = 'all', source = '';
    const waiting = []; let active = 0, pollTimer = 0;
    const live = {};      // id -> { bar, sub, pill } for the rows on screen

    function load() {
        try {
            const v = JSON.parse(lsGet(KEY));
            list = (Array.isArray(v) ? v : []).filter(r => r && r.id).map(r => isActive(r.status) ? Object.assign(r, { status: 'failed', err: 'Interrupted when the app closed' }) : r);
        } catch (e) { list = []; }
    }
    function save() { lsSet(KEY, JSON.stringify(list.slice(0, MAX), (k, v) => (k === 'ref' ? undefined : v))); }
    function syncRefs() {
        let changed = false;
        list.forEach(r => {
            const d = r.ref; if (!d) return;
            const status = d.status === 'done' ? 'done' : d.status === 'error' ? 'failed' : d.status === 'queued' ? 'queued' : 'working';
            if (status !== r.status) changed = true;
            r.status = status; r.title = (d.artist ? d.artist + ' - ' : '') + (d.title || d.vid || r.title);
            r.pct = d.pct || 0; r.bytes = d.bytes || 0; r.total = d.total || 0; r.path = d.path || ''; r.err = d.err || ''; r.uri = d.uri || ''; r.mime = d.mime || '';
            if (!isActive(status)) r.ref = null;
        });
        return changed;
    }
    function newRec(meta, status) {
        const rec = Object.assign({ id: uid(), type: 'file', src: 'link', title: 'Download', sub: '', filename: '', status: status || 'queued', pct: 0, bytes: 0, total: 0, path: '', uri: '', mime: '', err: '', ts: Date.now(), retry: null }, meta);
        list.unshift(rec);
        if (list.length > MAX) list.length = MAX;
        return rec;
    }
    function badge() {
        const tile = document.querySelector('[data-addon="downloads"]'); if (!tile) return;
        const failed = list.filter(r => r.status === 'failed').length;
        let b = tile.querySelector('.hz-dl-badge');
        if (!failed) { if (b) b.remove(); return; }
        if (!b) { b = el('span', 'hz-dl-badge'); b.setAttribute('aria-hidden', 'true'); tile.appendChild(b); }
        b.textContent = String(failed);
        tile.setAttribute('aria-label', 'Downloads, ' + failed + ' failed');
    }
    function visible() { return !view.hidden; }
    function touch() {
        syncRefs(); save(); badge();
        const any = list.some(r => isActive(r.status));
        if (any && !pollTimer) pollTimer = setInterval(tick, 600);
        if (!any && pollTimer) { clearInterval(pollTimer); pollTimer = 0; }
        if (visible()) { if (tab === 'mine') render(); else paintTabs(); }
    }
    function tick() {
        const changed = syncRefs();
        if (changed) { touch(); return; }
        if (visible() && tab === 'mine') paintLive();
    }
    function paintLive() {
        list.forEach(r => {
            const l = live[r.id]; if (!l || !isActive(r.status)) return;
            if (l.bar) { l.bar.firstChild.style.width = (r.pct || 0) + '%'; l.bar.classList.toggle('wait', !r.pct); }
            if (l.sub) l.sub.textContent = subText(r);
            if (l.pill) l.pill.textContent = pillText(r);
        });
    }
    function finishRec(rec, out) {
        rec.status = 'done'; rec.pct = 100; rec.err = '';
        const p = String(out == null ? '' : out).replace(/^Saved:\s*/i, '').trim();
        if (p) rec.path = p;
        rec.ts = Date.now();
        touch();
    }
    function failRec(rec, e) {
        const h = host();
        rec.status = 'failed';
        rec.err = String((h && h.friendly ? h.friendly(e) : (e && e.message) || e) || 'Failed').slice(0, 400);
        rec.ts = Date.now();
        touch();
    }

    // ---------- running jobs (3 at a time) ----------
    function runRec(rec, fn) {
        rec.ref = null; rec.status = 'queued'; rec.pct = 0; rec.bytes = 0; rec.total = 0; rec.uri = ''; rec.mime = ''; rec.err = ''; rec.ts = Date.now();
        waiting.push({ rec, fn });
        touch();
        pump();
    }
    function pump() {
        while (active < MAXP && waiting.length) {
            const job = waiting.shift();
            active++;
            exec(job).then(() => { active--; pump(); }, () => { active--; pump(); });
        }
    }
    async function exec(job) {
        const rec = job.rec;
        rec.status = 'working'; touch();
        try { finishRec(rec, await job.fn(rec)); } catch (e) { failRec(rec, e); }
    }
    function add(meta, fn) { const rec = newRec(meta, 'queued'); runRec(rec, fn); say('Added to My downloads'); return rec; }
    function startUrl(meta, url, filename, kind) {
        const h = host();
        if (!h) { say('Downloads are not ready. Reopen the app.', 'error'); return null; }
        if (!h.filesOn()) { say('File access is off. Turn it on under Settings > Permissions.', 'error'); return null; }
        if (!/^https:\/\//i.test(url)) { say('Only https links can be saved.', 'error'); return null; }
        const fname = safe(filename);
        return add(Object.assign({ filename: fname, retry: { op: 'url', url, filename: fname, kind } }, meta), rec => h.save(rec, url, fname, kind));
    }
    function startYt(id, kind, meta) {
        return add(Object.assign({ type: kind === 'video' ? 'video' : 'audio', src: 'youtube', retry: { op: 'yt', id, kind } }, meta), rec => {
            if (!window.HorizonYouTube) throw new Error('YouTube source bridge is not ready. Reopen the app.');
            return window.HorizonYouTube.download(id, kind, rec);
        });
    }
    async function openLink(url) {
        const h = host();
        const r = h ? await h.call('HorizonAI', 'openLink', { url }) : null;
        if (!r) throw new Error((h && h.lastErr && h.lastErr()) || 'Open this on the Android app.');
    }
    function retry(rec) {
        const r = rec.retry; const h = host();
        if (!r) { say('Nothing to retry for this one.', 'error'); return; }
        if (r.op === 'yt') runRec(rec, () => { if (!window.HorizonYouTube) throw new Error('YouTube source bridge is not ready. Reopen the app.'); return window.HorizonYouTube.download(r.id, r.kind, rec); });
        else if (r.op === 'url') runRec(rec, () => h.save(rec, r.url, r.filename, r.kind));
        else if (r.op === 'magnet') runRec(rec, async () => { await openLink(r.url); return ''; });
    }
    async function openRec(rec) {
        const h = host();
        if (rec.retry && rec.retry.op === 'magnet') { try { await openLink(rec.retry.url); } catch (e) { say(String(e.message || e), 'error'); } return; }
        if (rec.uri && h) {
            const r = await h.call('HorizonAI', 'openMedia', { uri: rec.uri, mime: rec.mime || '*/*' });
            if (!r) say(h.lastErr() || 'Could not open the file.', 'error');
            return;
        }
        say('Saved to ' + (rec.path || 'your phone') + '. Open it from your Files app.');
    }

    // ---------- public API (YouTube terminal and chat AI use these) ----------
    window.HorizonDownloads = {
        show() { syncRefs(); tab = list.length ? 'mine' : 'get'; source = ''; filter = 'all'; touch(); render(); },
        // used by the YouTube terminal: begin() returns a record that saveFile fills in (bytes, total, pct, uri)
        begin(meta) {
            const rec = newRec(meta, 'working');
            touch();
            return { live: rec, finish: out => finishRec(rec, out), fail: e => failRec(rec, e) };
        },
        // used by the chat AI queue: keeps one record in sync with the tray item d
        mirror(d) {
            if (!d || !d.id) return;
            const id = 'tray-' + d.id;
            let rec = list.find(r => r.id === id);
            if (!rec) rec = newRec({ id, type: 'audio', src: 'chat', title: d.title || d.vid, retry: { op: 'yt', id: d.vid, kind: 'audio' } }, 'queued');
            rec.ref = d; rec.ts = d.ts || rec.ts;
            touch();
        },
        ai: { run: aiRun, trust },
        count() { return list.length; },
        failed() { return list.filter(r => r.status === 'failed').length; }
    };

    // ---------- V1.34.0: chat AI tools (get.search, get.url, get.magnet) ----------
    // The AI reaches the same sources as the Downloads page: Audius, Internet Archive, Wikimedia Commons images,
    // direct https links, .torrent files, and magnet links (handed to a torrent app). Links on unknown hosts and magnets ask you first.
    const AI_TRUSTED = /^https:\/\/(?:archive\.org|[\w-]+\.archive\.org|api\.audius\.co|upload\.wikimedia\.org)\//i;
    // V1.78.0: image links that came back from the AI's own image search were already shown to Fezzy, so saving them does not ask again.
    const aiTrusted = new Set();
    const trust = urls => { (urls || []).forEach(u => { if (typeof u === 'string' && /^https:\/\//i.test(u)) { aiTrusted.add(u); if (aiTrusted.size > 200) aiTrusted.delete(aiTrusted.values().next().value); } }); };
    const aiFail = t => ({ text: 'ERROR: ' + t });
    function aiAsk(msg) { try { return window.confirm(msg); } catch (e) { return false; } }
    async function aiSearch(arg) {
        const bar = String(arg).indexOf('|');
        const src = (bar < 0 ? '' : arg.slice(0, bar)).trim().toLowerCase(), q = (bar < 0 ? arg : arg.slice(bar + 1)).trim();
        if (!src || !q) return aiFail('use [[get.search: audius | query]], [[get.search: images | query]], [[get.search: archive | query]] or [[get.search: archive-audio | query]].');
        if (!host()) return aiFail('Downloads are not ready.');
        if (src === 'audius' || src === 'music') {
            const d = await getJSON('https://api.audius.co/v1/tracks/search?query=' + enc(q) + '&limit=8&app_name=Horizon');
            const items = (d.data || []).filter(t => t && t.id);
            if (!items.length) return { text: 'No Audius tracks found for "' + q + '".' };
            return { text: items.map((t, n) => (n + 1) + '. ' + ((t.user && t.user.name) || '?') + ' - ' + (t.title || 'Track') + (t.duration ? ' [' + Math.floor(t.duration / 60) + ':' + String(t.duration % 60).padStart(2, '0') + ']' : '') + '  ref=audius:' + t.id).join('\n') + '\nDownload with [[get.url: audius:ID | Artist - Title]].' };
        }
        if (src === 'images' || src === 'image' || src === 'commons') {
            const d = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + enc(q + ' filetype:bitmap') + '&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiextmetadatafilter=LicenseShortName&format=json&origin=*');
            const pages = d.query && d.query.pages ? Object.values(d.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
            const imgs = pages.filter(p => p.imageinfo && p.imageinfo[0] && /^image\//.test(p.imageinfo[0].mime || ''));
            if (!imgs.length) return { text: 'No images found for "' + q + '".' };
            return { text: imgs.map((p, n) => { const ii = p.imageinfo[0], m = ii.extmetadata || {}; const lic = m.LicenseShortName && m.LicenseShortName.value ? String(m.LicenseShortName.value).replace(/<[^>]*>/g, '') : 'see Commons page'; return (n + 1) + '. ' + String(p.title || '').replace(/^File:/i, '') + ' [' + lic + (ii.width ? ', ' + ii.width + 'x' + ii.height : '') + ']  url=' + ii.url; }).join('\n') + '\nSave with [[get.url: IMAGE_URL | name.jpg]]. Mention the licence to Fezzy.' };
        }
        if (src === 'archive' || src === 'archive-video' || src === 'archive-audio') {
            const mt = src === 'archive-audio' ? 'audio' : 'movies';
            const d = await getJSON('https://archive.org/advancedsearch.php?q=' + enc('(' + q + ') AND mediatype:(' + mt + ')') + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&sort%5B%5D=downloads+desc&rows=8&page=1&output=json');
            const docs = (d.response && d.response.docs) || [];
            if (!docs.length) return { text: 'Nothing found on the Internet Archive for "' + q + '".' };
            const t = mt === 'audio' ? 'audio' : 'video';
            return { text: docs.map((x, n) => (n + 1) + '. ' + (Array.isArray(x.title) ? x.title[0] : x.title || x.identifier) + (x.creator ? ' - ' + (Array.isArray(x.creator) ? x.creator[0] : x.creator) : '') + '  ref=archive:' + x.identifier).join('\n') + '\nDownload with [[get.url: archive:ID | ' + t + ']] (or | torrent for the .torrent file).' };
        }
        return aiFail('unknown source "' + src + '". Use audius, images, archive or archive-audio.');
    }
    async function aiArchive(id, hint) {
        const want = String(hint || 'video').toLowerCase();
        if (want === 'torrent') {
            const rec = startUrl({ type: 'torrent', src: 'archive', title: id + ' (.torrent)', sub: '' }, 'https://archive.org/download/' + enc(id) + '/' + enc(id) + '_archive.torrent', safe(id) + '.torrent', 'file');
            return rec ? { text: 'Queued the .torrent file for ' + id + '. It is NOT finished yet; say queued. Open it with a torrent app from Downloads.' } : aiFail('could not start (is File access on in Permissions?).');
        }
        const type = want === 'audio' ? 'audio' : 'video';
        const meta = await getJSON('https://archive.org/metadata/' + enc(id));
        const re = type === 'audio' ? /\.(mp3|m4a|ogg|opus|flac|wav)$/i : /\.(mp4|m4v|mkv|webm|ogv)$/i;
        const found = (meta.files || []).filter(f => f && f.name && re.test(f.name) && !/thumb|_itemimage|__ia_thumb/i.test(f.name));
        const mp3 = found.filter(f => /\.mp3$/i.test(f.name)), mp4 = found.filter(f => /\.mp4$/i.test(f.name));
        const f = (type === 'audio' ? mp3[0] : mp4[0]) || found[0];
        if (!f) return aiFail('no ' + type + ' file in archive item ' + id + '. Try | torrent.');
        const base = f.name.split('/').pop();
        const rec = startUrl({ type, src: 'archive', title: (Array.isArray(meta.metadata && meta.metadata.title) ? meta.metadata.title[0] : (meta.metadata && meta.metadata.title)) || id, sub: '' }, 'https://archive.org/download/' + enc(id) + '/' + f.name.split('/').map(enc).join('/'), base, type);
        return rec ? { text: 'Queued ' + base + (f.size ? ' (' + bytesText(f.size) + ')' : '') + '. It is NOT finished yet; say queued, not done.' } : aiFail('could not start (is File access on in Permissions?).');
    }
    async function aiUrl(arg) {
        const bar = String(arg).indexOf('|');
        const ref = (bar < 0 ? arg : arg.slice(0, bar)).trim(), hint = (bar < 0 ? '' : arg.slice(bar + 1)).trim();
        if (!ref) return aiFail('use [[get.url: https://link | name.ext]].');
        if (!host()) return aiFail('Downloads are not ready.');
        let m;
        if ((m = /^audius:([\w-]+)$/i.exec(ref))) {
            const name = safe(hint || ('audius-' + m[1]));
            const rec = startUrl({ type: 'audio', src: 'audius', title: name, sub: '' }, 'https://api.audius.co/v1/tracks/' + enc(m[1]) + '/stream?app_name=Horizon', name.replace(/\.mp3$/i, '') + '.mp3', 'audio');
            return rec ? { text: 'Queued "' + name + '". It is NOT finished yet; say queued, not done.' } : aiFail('could not start (is File access on in Permissions?).');
        }
        if ((m = /^archive:([\w.\-]+)$/i.exec(ref))) return aiArchive(m[1], hint);
        if (/^magnet:\?/i.test(ref)) return aiMagnet(ref);
        if (/youtu\.?be/i.test(ref)) return aiFail('that is a YouTube link. Use [[yt.download: VIDEO_ID | Title]] instead.');
        if (/^https:\/\/(?:www\.)?(?:github|gitlab)\.com\/[^/?#]+\/[^/?#]+\/?$/i.test(ref)) return aiFail('that is a repo. Fezzy pulls repos from the GitHub widget in the right panel.');
        if (!/^https:\/\/[^\s/]+/i.test(ref)) return aiFail('only full https:// links can be saved.');
        if (!AI_TRUSTED.test(ref) && !aiTrusted.has(ref) && !aiAsk('The AI wants to save this link to your phone:\n\n' + ref.slice(0, 300) + '\n\nSave it?')) return aiFail('Fezzy declined that download.');
        const isTor = /\.torrent(?:[?#]|$)/i.test(ref) || /^torrent$/i.test(hint);
        const fname = hint && /\.[A-Za-z0-9]{2,5}$/.test(hint) ? safe(hint) : nameFromUrl(ref, isTor ? 'torrent' : (EXT[hint] ? DEF_EXT[hint] : 'bin'));
        const kind = isTor ? 'file' : (hint && DEF_EXT[hint] ? hint : kindOf(fname));
        const rec = startUrl({ type: isTor ? 'torrent' : kind, src: isTor ? 'torrent' : 'link', title: fname.replace(/\.[^.]+$/, ''), sub: (function () { try { return new URL(ref).hostname; } catch (e) { return ''; } })() }, ref, fname, kind);
        return rec ? { text: 'Queued "' + fname + '". It is NOT finished yet; say queued, not done.' } : aiFail('could not start (is File access on in Permissions?).');
    }
    async function aiMagnet(arg) {
        const raw = String(arg).trim();
        if (!/^magnet:\?xt=urn:/i.test(raw)) return aiFail('that is not a magnet link.');
        const name = (/[?&]dn=([^&]+)/i.exec(raw) || [])[1];
        let label = 'a torrent'; try { if (name) label = decodeURIComponent(name.replace(/\+/g, ' ')); } catch (e) { /* keep default */ }
        if (!aiAsk('The AI wants to send this magnet link to your torrent app:\n\n' + label.slice(0, 200) + '\n\nHorizon has no torrent engine; your torrent app does the download. Only do this for files you have the right to download. Send it?')) return aiFail('Fezzy declined that magnet link.');
        add({ type: 'torrent', src: 'torrent', title: label.slice(0, 80), sub: 'Handed to your torrent app', retry: { op: 'magnet', url: raw } }, async () => { await openLink(raw); return ''; });
        return { text: 'Magnet link sent to the torrent app (if one is installed). Horizon cannot see its progress; say "sent", not "downloaded".' };
    }
    async function aiRun(kind, arg) {
        try {
            if (kind === 'get.search') return await aiSearch(arg);
            if (kind === 'get.url' || kind === 'get.download') return await aiUrl(arg);
            if (kind === 'get.magnet') return await aiMagnet(arg);
            return aiFail('unknown tool ' + kind + '.');
        } catch (e) { return aiFail(String((host() && host().friendly ? host().friendly(e) : (e && e.message) || e)).slice(0, 160)); }
    }

    // ---------- rendering ----------
    function pillText(r) { return r.status === 'done' ? 'Saved' : r.status === 'failed' ? 'Failed' : r.status === 'queued' ? 'Waiting' : (r.pct ? r.pct + '%' : '…'); }
    function subText(r) {
        const size = r.total ? (isActive(r.status) && r.bytes ? bytesText(r.bytes) + ' of ' + bytesText(r.total) : bytesText(r.total)) : bytesText(r.bytes);
        return [r.sub, SRC[r.src] || r.src, size, ago(r.ts)].filter(Boolean).join(' · ');
    }
    let tabsEl = null;
    // Only the tab bar is repainted while you browse a source, so search results and file pickers are never wiped by a finishing download.
    function paintTabs() { if (!tabsEl || !tabsEl.isConnected) return; const t = makeTabs(); tabsEl.replaceWith(t); tabsEl = t; }
    function makeTabs() {
        const act = list.filter(r => isActive(r.status)).length, bad = list.filter(r => r.status === 'failed').length;
        const tabs = el('div', 'dlx-tabs'); tabs.setAttribute('role', 'tablist');
        [['mine', 'My downloads'], ['get', 'Get something']].forEach(([id, label]) => {
            const b = el('button', 'dlx-tab', label); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(tab === id));
            if (id === 'mine' && (act || bad)) b.appendChild(el('span', 'dlx-count' + (act ? '' : ' bad'), String(act || bad)));
            b.addEventListener('click', () => { tab = id; source = ''; render(); });
            tabs.appendChild(b);
        });
        return tabs;
    }
    function render() {
        view.replaceChildren();
        Object.keys(live).forEach(k => delete live[k]);
        tabsEl = makeTabs();
        view.appendChild(tabsEl);
        if (tab === 'mine') renderMine(); else if (!source) renderGet(); else renderSource();
    }
    function renderMine() {
        const counts = {}; list.forEach(r => { counts[r.type] = (counts[r.type] || 0) + 1; });
        if (filter !== 'all' && !counts[filter]) filter = 'all';
        const chips = el('div', 'dlx-chips');
        [['all', 'All (' + list.length + ')']].concat(Object.keys(TYPES).filter(t => counts[t]).map(t => [t, TYPES[t][0] + ' ' + TYPES[t][1] + ' (' + counts[t] + ')'])).forEach(([id, label]) => {
            const c = el('button', 'dlx-chip', label); c.type = 'button'; c.setAttribute('aria-pressed', String(filter === id));
            c.addEventListener('click', () => { filter = id; render(); });
            chips.appendChild(c);
        });
        if (list.length) view.appendChild(chips);
        const shown = list.filter(r => filter === 'all' || r.type === filter);
        if (!shown.length) {
            const e = el('div', 'dlx-empty'); e.appendChild(el('div', '', 'Nothing here yet. Everything Horizon saves lands in this list, with Open on finished files and Retry on failed ones.'));
            e.appendChild(el('div', 'dlx-stack')).appendChild(btn('Get something', 'pri', () => { tab = 'get'; render(); }));
            view.appendChild(e); return;
        }
        const box = el('div', 'dlx-list');
        shown.forEach(r => box.appendChild(row(r)));
        view.appendChild(box);
        const foot = el('div', 'dlx-foot');
        foot.appendChild(el('span', 'dlx-hint', 'Removing a row never deletes the saved file.'));
        if (list.some(r => !isActive(r.status))) foot.appendChild(btn('Clear finished', '', () => { list = list.filter(r => isActive(r.status)); touch(); }));
        view.appendChild(foot);
    }
    function row(r) {
        const d = el('div', 'dlx-row ' + r.status);
        d.appendChild(el('div', 'dlx-ic', (TYPES[r.type] || TYPES.file)[0]));
        const main = el('div', 'dlx-main'); main.appendChild(el('strong', '', r.title || r.filename || 'Download'));
        const sub = el('small', '', subText(r)); main.appendChild(sub); d.appendChild(main);
        const pill = el('span', 'dlx-pill ' + r.status, pillText(r)); d.appendChild(pill);
        let bar = null;
        if (isActive(r.status)) {
            bar = el('div', 'dlx-bar' + (r.pct ? '' : ' wait')); const i = el('i'); i.style.width = (r.pct || 0) + '%'; bar.appendChild(i); d.appendChild(bar);
            live[r.id] = { bar, sub, pill };
        }
        if (r.status === 'failed' && r.err) d.appendChild(el('div', 'dlx-why', r.err));
        if (r.status === 'done' && r.path) d.appendChild(el('div', 'dlx-path', r.path));
        if (!isActive(r.status)) {
            const acts = el('div', 'dlx-acts');
            if (r.status === 'done' && (r.uri || (r.retry && r.retry.op === 'magnet'))) acts.appendChild(btn(r.retry && r.retry.op === 'magnet' ? 'Open again' : 'Open', 'pri', () => openRec(r)));
            if (r.status === 'failed' && r.retry) acts.appendChild(btn('↻ Retry', 'pri', () => retry(r)));
            acts.appendChild(btn('✕ Remove', '', () => { list = list.filter(z => z.id !== r.id); touch(); }));
            d.appendChild(acts);
        }
        return d;
    }

    // ---------- GET ----------
    const SOURCES = [
        ['youtube', '🎵', 'YouTube', 'Search songs and videos, then save audio or video'],
        ['audius', '🎧', 'Audius', 'Open music platform: artists and tracks'],
        ['archive', '🎞️', 'Internet Archive', 'Free films, shows, radio, albums and .torrent files'],
        ['commons', '🖼️', 'Images', 'Openly licensed photos from Wikimedia Commons'],
        ['link', '🔗', 'Any link', 'Paste a direct link to a song, video, picture or file'],
        ['repo', '📦', 'Repo zip', 'A GitHub or GitLab repository as a .zip'],
        ['torrent', '🧲', 'Torrent', 'Magnet link or .torrent file']
    ];
    function renderGet() {
        view.appendChild(el('p', 'dlx-hint', 'Pick a source. Everything you save lands in My downloads. Only save what you have the right to save.'));
        const g = el('div', 'dlx-grid');
        SOURCES.forEach(([id, e, name, desc]) => {
            const b = el('button', 'dlx-src'); b.type = 'button';
            b.append(el('span', 'e', e), el('b', '', name), el('span', '', desc));
            b.addEventListener('click', () => {
                if (id === 'youtube') { if (window.HorizonAddons) window.HorizonAddons.open('youtube'); return; }
                source = id; render();
            });
            g.appendChild(b);
        });
        view.appendChild(g);
    }
    function shell(title, desc) {
        const back = btn('‹ Sources', 'dlx-back', () => { source = ''; render(); }); back.classList.add('dlx-back');
        view.appendChild(back);
        view.appendChild(el('h3', 'dlx-h', title));
        if (desc) view.appendChild(el('p', 'dlx-hint', desc));
    }
    function input(ph, type) { const i = el('input', 'dlx-in'); i.type = type || 'text'; i.placeholder = ph; i.autocomplete = 'off'; i.autocapitalize = 'off'; i.spellcheck = false; return i; }
    function searchForm(ph, onGo) {
        const f = el('form', 'dlx-form'); const i = input(ph, 'search'); i.enterKeyHint = 'search';
        const go = el('button', 'dlx-btn pri', 'Search'); go.type = 'submit';
        f.append(i, go);
        f.addEventListener('submit', e => { e.preventDefault(); const q = i.value.trim(); if (q) onGo(q); });
        return f;
    }
    function status(out, text, bad) { out.replaceChildren(); if (text) { const s = el('div', 'dlx-status'); if (!bad) s.appendChild(el('span', 'dlx-spin')); s.appendChild(document.createTextNode(text)); if (bad) s.style.color = 'var(--dx-bad)'; out.appendChild(s); } }
    async function getJSON(url) {
        const h = host(); const res = await h.timed(fetch(url, { headers: { Accept: 'application/json' } }), 20000);
        if (!res.ok) throw new Error('the server answered ' + res.status);
        return res.json();
    }
    function resCard(art, title, sub, acts, noteText) {
        const c = el('div', 'dlx-res');
        const a = el('div', 'dlx-art');
        if (art && /^https:\/\//.test(art)) { const im = el('img'); im.loading = 'lazy'; im.alt = ''; im.src = art; im.addEventListener('error', () => { im.remove(); a.textContent = '♪'; }); a.appendChild(im); } else a.textContent = '♪';
        const m = el('div', 'dlx-main'); m.appendChild(el('strong', '', title)); if (sub) m.appendChild(el('small', '', sub));
        c.append(a, m);
        const ac = el('div', 'dlx-acts'); acts.forEach(x => ac.appendChild(x)); c.appendChild(ac);
        const n = el('div', 'dlx-note'); n.hidden = !noteText; n.textContent = noteText || ''; c.appendChild(n);
        c.note = (t, k) => { n.hidden = !t; n.className = 'dlx-note' + (k ? ' ' + k : ''); n.textContent = t || ''; };
        return c;
    }
    function added(b) { b.textContent = '✓ Added'; b.disabled = true; setTimeout(() => { b.disabled = false; b.textContent = b.dataset.label || b.textContent; }, 2500); }

    function renderSource() {
        const fn = { audius: srcAudius, archive: srcArchive, commons: srcCommons, link: srcLink, repo: srcRepo, torrent: srcTorrent }[source];
        if (fn) fn(); else { source = ''; renderGet(); }
    }

    // Audius: open music platform (public API, no key)
    function srcAudius() {
        shell('🎧 Audius', 'Search tracks on Audius. Artists decide what is shareable, so only save what you have the right to keep.');
        const out = el('div');
        view.appendChild(searchForm('artist or track…', async q => {
            status(out, 'Searching Audius…');
            try {
                const d = await getJSON('https://api.audius.co/v1/tracks/search?query=' + enc(q) + '&limit=15&app_name=Horizon');
                const items = (d.data || []).filter(t => t && t.id);
                if (!items.length) { status(out, 'No tracks found for “' + q + '”.', true); return; }
                out.replaceChildren();
                items.forEach(t => {
                    const artist = (t.user && t.user.name) || '', title = t.title || 'Track';
                    const mins = t.duration ? Math.floor(t.duration / 60) + ':' + String(t.duration % 60).padStart(2, '0') : '';
                    const b = btn('↓ Music', 'pri'); b.dataset.label = '↓ Music';
                    b.addEventListener('click', () => {
                        const url = 'https://api.audius.co/v1/tracks/' + enc(t.id) + '/stream?app_name=Horizon';
                        if (startUrl({ type: 'audio', src: 'audius', title: (artist ? artist + ' - ' : '') + title, sub: '' }, url, (artist ? artist + ' - ' : '') + title + '.mp3', 'audio')) added(b);
                    });
                    out.appendChild(resCard(t.artwork && (t.artwork['150x150'] || t.artwork['480x480']), title, [artist, mins].filter(Boolean).join(' · '), [b]));
                });
            } catch (e) { status(out, 'Audius did not answer: ' + String(host().friendly(e)).slice(0, 120) + '. Try again in a moment.', true); }
        }));
        view.appendChild(out);
    }

    // Internet Archive: films, shows, radio, albums, .torrent
    function srcArchive() {
        shell('🎞️ Internet Archive', 'Public-domain and freely shared films, shows, radio and albums. Tap a result to pick the exact file.');
        let mt = 'movies';
        const chips = el('div', 'dlx-chips');
        [['movies', '🎬 Video'], ['audio', '🎧 Audio']].forEach(([id, label]) => {
            const c = el('button', 'dlx-chip', label); c.type = 'button'; c.setAttribute('aria-pressed', String(mt === id));
            c.addEventListener('click', () => { mt = id; chips.querySelectorAll('.dlx-chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); });
            chips.appendChild(c);
        });
        view.appendChild(chips);
        const out = el('div');
        view.appendChild(searchForm('title, show, band…', async q => {
            status(out, 'Searching the Internet Archive…');
            try {
                const query = '(' + q + ') AND mediatype:(' + mt + ')';
                const d = await getJSON('https://archive.org/advancedsearch.php?q=' + enc(query) + '&fl%5B%5D=identifier&fl%5B%5D=title&fl%5B%5D=creator&sort%5B%5D=downloads+desc&rows=15&page=1&output=json');
                const docs = (d.response && d.response.docs) || [];
                if (!docs.length) { status(out, 'Nothing found for “' + q + '”.', true); return; }
                out.replaceChildren();
                docs.forEach(doc => out.appendChild(archiveCard(doc, mt)));
            } catch (e) { status(out, 'The Internet Archive did not answer: ' + String(host().friendly(e)).slice(0, 120) + '. Try again in a moment.', true); }
        }));
        view.appendChild(out);
    }
    function archiveCard(doc, mt) {
        const id = String(doc.identifier), title = Array.isArray(doc.title) ? doc.title[0] : (doc.title || id);
        const creator = Array.isArray(doc.creator) ? doc.creator[0] : (doc.creator || '');
        const type = mt === 'audio' ? 'audio' : 'video';
        const files = el('div');
        const pickBtn = btn(mt === 'audio' ? 'Pick audio file' : 'Pick video file', 'pri');
        const tor = btn('🧲 .torrent', '', () => {
            startUrl({ type: 'torrent', src: 'archive', title: title + ' (.torrent)', sub: creator }, 'https://archive.org/download/' + enc(id) + '/' + enc(id) + '_archive.torrent', safe(id) + '.torrent', 'file');
        });
        const card = resCard('', title, [creator, id].filter(Boolean).join(' · '), [pickBtn, tor]);
        card.appendChild(files); files.style.gridColumn = '1/3';
        pickBtn.addEventListener('click', async () => {
            pickBtn.disabled = true; card.note('Looking at the files…');
            try {
                const meta = await getJSON('https://archive.org/metadata/' + enc(id));
                const want = type === 'audio' ? /\.(mp3|m4a|ogg|opus|flac|wav)$/i : /\.(mp4|m4v|mkv|webm|ogv)$/i;
                const found = (meta.files || []).filter(f => f && f.name && want.test(f.name) && !/thumb|_itemimage|__ia_thumb/i.test(f.name));
                const mp3 = found.filter(f => /\.mp3$/i.test(f.name));
                const pool = (type === 'audio' && mp3.length ? mp3 : found).slice(0, 15);
                files.replaceChildren();
                if (!pool.length) { card.note('No ' + type + ' file in this item. Try the .torrent.', 'bad'); pickBtn.disabled = false; return; }
                card.note(pool.length + ' file' + (pool.length > 1 ? 's' : '') + ' available:');
                pool.forEach(f => {
                    const r = el('div', 'dlx-pick'); r.appendChild(el('span', '', f.name + (f.size ? ' · ' + bytesText(f.size) : '')));
                    const b = btn('↓', 'pri'); b.dataset.label = '↓';
                    b.addEventListener('click', () => {
                        const base = f.name.split('/').pop();
                        if (startUrl({ type, src: 'archive', title: title + (pool.length > 1 ? ' · ' + base : ''), sub: creator }, 'https://archive.org/download/' + enc(id) + '/' + f.name.split('/').map(enc).join('/'), base, type)) added(b);
                    });
                    r.appendChild(b); files.appendChild(r);
                });
            } catch (e) { card.note('Could not read the file list: ' + String(host().friendly(e)).slice(0, 100), 'bad'); }
            pickBtn.disabled = false;
        });
        return card;
    }

    // Wikimedia Commons: openly licensed images
    function srcCommons() {
        shell('🖼️ Images', 'Photos and artwork from Wikimedia Commons. Each one shows its licence, so you know how it may be reused.');
        const out = el('div');
        view.appendChild(searchForm('what to look for…', async q => {
            status(out, 'Searching Wikimedia Commons…');
            try {
                const d = await getJSON('https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=' + enc(q + ' filetype:bitmap') + '&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url%7Csize%7Cmime%7Cextmetadata&iiextmetadatafilter=LicenseShortName%7CArtist&iiurlwidth=240&format=json&origin=*');
                const pages = d.query && d.query.pages ? Object.values(d.query.pages).sort((a, b) => (a.index || 0) - (b.index || 0)) : [];
                const imgs = pages.filter(p => p.imageinfo && p.imageinfo[0] && /^image\//.test(p.imageinfo[0].mime || ''));
                if (!imgs.length) { status(out, 'No images found for “' + q + '”.', true); return; }
                out.replaceChildren();
                imgs.forEach(p => {
                    const ii = p.imageinfo[0], meta = ii.extmetadata || {};
                    const name = String(p.title || 'image').replace(/^File:/i, '');
                    const lic = meta.LicenseShortName && meta.LicenseShortName.value ? String(meta.LicenseShortName.value).replace(/<[^>]*>/g, '') : 'see Commons page';
                    const by = meta.Artist && meta.Artist.value ? String(meta.Artist.value).replace(/<[^>]*>/g, '').slice(0, 40) : '';
                    const b = btn('↓ Save image', 'pri'); b.dataset.label = '↓ Save image';
                    b.addEventListener('click', () => { if (startUrl({ type: 'image', src: 'commons', title: name.replace(/\.[^.]+$/, ''), sub: lic }, ii.url, name, 'image')) added(b); });
                    out.appendChild(resCard(ii.thumburl, name.replace(/\.[^.]+$/, ''), [lic, by, ii.width && ii.height ? ii.width + '×' + ii.height : '', bytesText(ii.size)].filter(Boolean).join(' · '), [b]));
                });
            } catch (e) { status(out, 'Wikimedia Commons did not answer: ' + String(host().friendly(e)).slice(0, 120) + '. Try again in a moment.', true); }
        }));
        view.appendChild(out);
    }

    // Any link
    function nameFromUrl(u, ext) {
        let n = '';
        try { n = decodeURIComponent(new URL(u).pathname.split('/').filter(Boolean).pop() || ''); } catch (e) { n = ''; }
        n = safe(n);
        if (!n || n === 'download') n = 'download';
        if (!/\.[A-Za-z0-9]{2,5}$/.test(n)) n += '.' + ext;
        return n;
    }
    function srcLink() {
        shell('🔗 Any link', 'Paste a direct https link to a song, video, picture or file. Magnet links, YouTube links and GitHub / GitLab repo links are sent to the right place for you.');
        const url = input('https://…', 'url'), nm = input('file name (optional)');
        const sel = el('select', 'dlx-sel'); [['auto', 'Type: detect'], ['audio', 'Music'], ['video', 'Video'], ['image', 'Image'], ['file', 'Other file']].forEach(([v, t]) => { const o = el('option', '', t); o.value = v; sel.appendChild(o); });
        const note = el('div', 'dlx-note'); note.hidden = true;
        const go = btn('↓ Download', 'pri', () => {
            const raw = url.value.trim(); note.hidden = true;
            if (!raw) return;
            if (/^magnet:\?/i.test(raw)) { source = 'torrent'; render(); return; }
            const yt = raw.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/i);
            if (yt) { startYt(yt[1], sel.value === 'video' ? 'video' : 'audio', { title: yt[1], sub: '' }); tab = 'mine'; render(); return; }
            if (/^https:\/\/(?:www\.)?(?:github|gitlab)\.com\/[^/?#]+\/[^/?#]+\/?$/i.test(raw)) { source = 'repo'; render(); const r = view.querySelector('input'); if (r) r.value = raw; return; }
            if (!/^https:\/\/[^\s/]+/i.test(raw)) { note.hidden = false; note.className = 'dlx-note bad'; note.textContent = 'Use a full https:// link. Plain http links are blocked by Android.'; return; }
            const typed = sel.value;
            const guess = typed === 'auto' ? kindOf(nameFromUrl(raw, 'bin')) : typed;
            const fname = nm.value.trim() ? safe(nm.value.trim()) + (/\.[A-Za-z0-9]{2,5}$/.test(nm.value.trim()) ? '' : '.' + (nameFromUrl(raw, DEF_EXT[guess]).split('.').pop())) : nameFromUrl(raw, DEF_EXT[guess]);
            const kind = typed === 'auto' ? kindOf(fname) : typed;
            const rec = startUrl({ type: kind === 'file' ? 'file' : kind, src: 'link', title: fname.replace(/\.[^.]+$/, ''), sub: (function () { try { return new URL(raw).hostname; } catch (e) { return ''; } })() }, raw, fname, kind);
            if (rec) { url.value = ''; nm.value = ''; note.hidden = false; note.className = 'dlx-note ok'; note.textContent = 'Added “' + fname + '” to My downloads.'; }
        });
        const st = el('div', 'dlx-stack'); st.append(url, nm, sel, go, note);
        view.appendChild(st);
    }

    // Repo zip
    function parseRepo(raw, provider) {
        let t = String(raw || '').trim().replace(/^git@(github|gitlab)\.com:/i, 'https://$1.com/').replace(/\.git(?=$|[?#/])/i, '');
        let prov = provider, path = t, ref = '';
        const m = t.match(/^https?:\/\/(?:www\.)?(github|gitlab)\.com\/(.+)$/i);
        if (m) { prov = m[1].toLowerCase(); path = m[2]; }
        path = path.replace(/[?#].*$/, '').replace(/^\/+|\/+$/g, '');
        const tr = path.match(/^(.*?)\/(?:-\/)?(?:tree|blob)\/([^/]+)/);
        if (tr) { path = tr[1]; ref = tr[2]; }
        if (!/^[\w.-]+(\/[\w.-]+)+$/.test(path)) throw new Error('Use owner/repo or a full GitHub or GitLab link.');
        if (prov === 'github' && path.split('/').length !== 2) throw new Error('A GitHub repo looks like owner/repo.');
        return { prov, path, ref };
    }
    function srcRepo() {
        shell('📦 Repo zip', 'Saves the repository as a .zip in Download/Horizon. Public repos only: Horizon never asks for or stores a token here.');
        let prov = lsGet(PROV_KEY) === 'github' ? 'github' : 'gitlab';
        const chips = el('div', 'dlx-chips');
        [['gitlab', 'GitLab'], ['github', 'GitHub']].forEach(([id, label]) => {
            const c = el('button', 'dlx-chip', label); c.type = 'button'; c.setAttribute('aria-pressed', String(prov === id));
            c.addEventListener('click', () => { prov = id; lsSet(PROV_KEY, id); chips.querySelectorAll('.dlx-chip').forEach(x => x.setAttribute('aria-pressed', String(x === c))); });
            chips.appendChild(c);
        });
        const i = input('owner/repo or a link'), br = input('branch or tag (optional)');
        const note = el('div', 'dlx-note'); note.hidden = true;
        const go = btn('↓ Download .zip', 'pri', () => {
            try {
                const p = parseRepo(i.value, prov); if (br.value.trim()) p.ref = br.value.trim();
                const last = p.path.split('/').pop(), r = p.ref || 'HEAD';
                const url = p.prov === 'github' ? 'https://github.com/' + p.path + '/archive/' + enc(r).replace(/%2F/g, '/') + '.zip'
                    : 'https://gitlab.com/' + p.path + '/-/archive/' + enc(r).replace(/%2F/g, '/') + '/' + last + '-' + enc(r) + '.zip';
                const fname = safe(p.path.replace(/\//g, '-') + (p.ref ? '-' + p.ref.replace(/\//g, '-') : '')) + '.zip';
                const rec = startUrl({ type: 'repo', src: 'repo', title: p.path + (p.ref ? ' @ ' + p.ref : ''), sub: p.prov === 'github' ? 'GitHub' : 'GitLab' }, url, fname, 'file');
                if (rec) { i.value = ''; br.value = ''; note.hidden = false; note.className = 'dlx-note ok'; note.textContent = 'Added “' + fname + '”. If it fails with 404 the repo is private or the branch name is wrong.'; }
            } catch (e) { note.hidden = false; note.className = 'dlx-note bad'; note.textContent = e.message; }
        });
        const st = el('div', 'dlx-stack'); st.append(chips, i, br, go, note);
        view.appendChild(st);
    }

    // Torrent: magnet link to a torrent app, or a .torrent file saved to the phone
    function srcTorrent() {
        shell('🧲 Torrent', 'Horizon has no torrent engine of its own. A magnet link is handed to a torrent app on your phone (for example LibreTorrent or Flud), and a .torrent link is saved so that app can open it.');
        const i = input('magnet:?xt=… or https://….torrent');
        const note = el('div', 'dlx-note'); note.hidden = true;
        const go = btn('Go', 'pri', () => {
            const raw = i.value.trim(); note.hidden = true; if (!raw) return;
            if (/^magnet:\?/i.test(raw)) {
                const dn = (raw.match(/[?&]dn=([^&]+)/i) || [])[1];
                let title = 'Magnet link'; try { if (dn) title = decodeURIComponent(dn.replace(/\+/g, ' ')); } catch (e) { /* keep default */ }
                add({ type: 'torrent', src: 'torrent', title, sub: 'Handed to your torrent app', retry: { op: 'magnet', url: raw } }, async () => { await openLink(raw); return ''; });
                i.value = ''; note.hidden = false; note.className = 'dlx-note ok'; note.textContent = 'Sent to your torrent app.';
            } else if (/^https:\/\/\S+\.torrent(?:[?#]\S*)?$/i.test(raw)) {
                const fname = nameFromUrl(raw.replace(/[?#].*$/, ''), 'torrent');
                if (startUrl({ type: 'torrent', src: 'torrent', title: fname.replace(/\.torrent$/i, ''), sub: '' }, raw, fname, 'file')) { i.value = ''; note.hidden = false; note.className = 'dlx-note ok'; note.textContent = 'Saving the .torrent. Tap Open on it in My downloads to hand it to your torrent app.'; }
            } else { note.hidden = false; note.className = 'dlx-note bad'; note.textContent = 'Paste a magnet link or an https link that ends in .torrent.'; }
        });
        const st = el('div', 'dlx-stack'); st.append(i, go, note);
        view.appendChild(st);
        view.appendChild(el('p', 'dlx-hint', 'Looking for something legal to try? Internet Archive items come with a .torrent.'));
    }

    load(); syncRefs(); badge();
    if (list.some(r => isActive(r.status))) touch();
})();
