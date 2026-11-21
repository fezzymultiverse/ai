/* Horizon V1.26.0: ABOUT & UPDATES page: version, release check, backup export/import, changelog, privacy awareness + reminder switch. */
(function () {
    'use strict';
    var VERSION = 'V1.99.171';
    var LSK = 'horizon_privacy_notice';
    var REPO_API = 'https://api.github.com/repos/fezzymultiverse/ai';
    var warned = {}, checking = false, result = '', resultBad = false;

    function lsGet() { try { return localStorage.getItem(LSK); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(LSK, v); } catch (e) { /* ignore */ } }
    var LSN = 'horizon_no_train';
    function noTrain() { return lsGetK(LSN) !== '0'; }
    function lsGetK(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var okSent = {};
    /* Asks once per provider per session while the switch is on. Cannot change a provider's own policy. */
    function allow(id, name) {
        if (!noTrain() || okSent[id]) return true;
        var yes = false;
        try { yes = window.confirm('Send to ' + name + '?\n\n"Don\u2019t send my data for training" is ON. Horizon never trains on your data, but ' + name + ' has its own terms and may keep prompts. Send anyway?'); } catch (e) { yes = true; }
        if (yes) okSent[id] = 1;
        return yes;
    }
    function noticeOn() { return lsGet() !== '0'; }
    function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function vnum(v) { return String(v).replace(/^[^0-9]*/, '').split('.').map(function (x) { return parseInt(x, 10) || 0; }); }
    function newer(a, b) { var x = vnum(a), y = vnum(b); for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

    function getJSON(url) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
        return fetch(url, ctl ? { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } } : {}).then(function (r) {
            clearTimeout(to);
            return r.json().then(function (j) { return { status: r.status, ok: r.ok, json: j }; });
        }, function (e) { clearTimeout(to); throw e; });
    }
    function check() {
        if (checking) return;
        checking = true; result = ''; render();
        getJSON(REPO_API + '/releases/latest').then(function (r) {
            if (r.ok && r.json && r.json.tag_name) return r.json.tag_name;
            return getJSON(REPO_API + '/tags?per_page=20').then(function (t) {
                if (t.ok && Array.isArray(t.json) && t.json.length) {
                    var best = t.json.map(function (x) { return x.name; }).reduce(function (a, b) { return newer(b, a) ? b : a; });
                    return best;
                }
                return '';
            });
        }).then(function (tag) {
            if (!tag) { result = 'No published release found. You are on ' + VERSION + '.'; resultBad = false; }
            else if (newer(tag, VERSION)) { result = 'New version available: ' + tag + ' (you have ' + VERSION + ').'; resultBad = true; }
            else { result = 'You are up to date (' + VERSION + ').'; resultBad = false; }
        }, function (e) {
            result = (e && e.name === 'AbortError') ? 'Timed out. Check your connection.' : 'Could not check right now. Try again later.'; resultBad = true;
        }).then(function () { checking = false; render(); });
    }

    function sec(title) { var s = el('section', 'hza-sec'); s.appendChild(el('h4', 'hza-h', title)); return s; }
    function para(t) { return el('p', 'hza-p', t); }

    /* ---- V1.26.0: EXPORT & IMPORT (one JSON file; localStorage + Archive items) ---- */
    var BK_FORMAT = 1;
    var BK_OK = /^(horizon|ember)_/;
    var BK_NEVER = /^(horizon_snooze|horizon_snooze_snap|horizon_vault_fail)$/;
    var BK_SECRET = /^horizon_(key_|xkeys_|webkey_)|^horizon_gh_token$|_key$/;
    var ARCH_DB = 'horizon_archive_db', ARCH_STORE = 'items';
    var withKeys = false, bkMsg = '', bkBad = false, bkBusy = false, pending = null;

    function openArch() {
        return new Promise(function (res) {
            try {
                if (!window.indexedDB) { res(null); return; }
                var r = indexedDB.open(ARCH_DB, 1);
                r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(ARCH_STORE)) r.result.createObjectStore(ARCH_STORE, { keyPath: 'id' }); };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { res(null); };
            } catch (e) { res(null); }
        });
    }
    function archAll() {
        return openArch().then(function (d) {
            if (!d) return [];
            return new Promise(function (res) {
                var out = [];
                function done() { try { d.close(); } catch (e) { /* ignore */ } res(out); }
                try {
                    var t = d.transaction(ARCH_STORE, 'readonly');
                    var q = t.objectStore(ARCH_STORE).openCursor();
                    q.onsuccess = function () { var c = q.result; if (c) { out.push(c.value); c.continue(); } };
                    t.oncomplete = done; t.onerror = done; t.onabort = done;
                } catch (e) { done(); }
            });
        });
    }
    function archPut(list) {
        if (!list.length) return Promise.resolve(0);
        return openArch().then(function (d) {
            if (!d) return 0;
            return new Promise(function (res) {
                var n = 0;
                function done() { try { d.close(); } catch (e) { /* ignore */ } res(n); }
                try {
                    var t = d.transaction(ARCH_STORE, 'readwrite');
                    var st = t.objectStore(ARCH_STORE);
                    list.forEach(function (it) { st.put(it); n++; });
                    t.oncomplete = done;
                    t.onerror = function () { n = 0; done(); };
                    t.onabort = function () { n = 0; done(); };
                } catch (e) { n = 0; done(); }
            });
        });
    }
    function collect() {
        try { if (window.HorizonFlushChats) window.HorizonFlushChats(); } catch (e) { /* ignore */ }
        var ls = {}, n = 0, skipped = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k || !BK_OK.test(k) || BK_NEVER.test(k)) continue;
                if (!withKeys && BK_SECRET.test(k)) { skipped++; continue; }
                ls[k] = localStorage.getItem(k); n++;
            }
        } catch (e) { /* storage blocked */ }
        return archAll().then(function (arch) { return { ls: ls, arch: arch, n: n, skipped: skipped }; });
    }
    function plug(name) {
        try {
            var c = window.Capacitor;
            if (!c || typeof c.isNativePlatform !== 'function' || !c.isNativePlatform()) return null;
            if (c.Plugins && c.Plugins[name]) return c.Plugins[name];
            if (typeof c.registerPlugin === 'function') return c.registerPlugin(name);
        } catch (e) { /* no native bridge */ }
        return null;
    }
    function toB64(blob) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () { res(String(r.result).split(',')[1]); };
            r.onerror = function () { rej(r.error); };
            r.readAsDataURL(blob);
        });
    }
    function saveBackup(blob, fname) {
        return window.HorizonOutputs.saveBlob(blob, fname);
    }
    function stamp() {
        var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    }
    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

    function doExport() {
        if (bkBusy) return;
        bkBusy = true; bkMsg = ''; pending = null; render();
        collect().then(function (c) {
            var payload = { app: 'horizon', format: BK_FORMAT, version: VERSION, created: new Date().toISOString(), includesKeys: withKeys, ls: c.ls, archive: c.arch };
            var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            return saveBackup(blob, 'horizon-backup-' + stamp() + '.json').then(function (where) {
                bkMsg = 'Saved to ' + where + '. ' + plural(c.n, 'entry') + ' and ' + plural(c.arch.length, 'Archive item') + '.' + (c.skipped ? ' ' + plural(c.skipped, 'key') + ' left out.' : '');
                bkBad = false;
            });
        }).catch(function (e) {
            bkMsg = 'Export failed: ' + ((e && e.message) || e); bkBad = true;
        }).then(function () { bkBusy = false; render(); });
    }

    function parseBackup(text) {
        var j;
        try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not a Horizon backup (not valid JSON).'); }
        if (!j || j.app !== 'horizon' || !j.ls || typeof j.ls !== 'object') throw new Error('That file is not a Horizon backup.');
        if (Number(j.format) > BK_FORMAT) throw new Error('This backup was made by a newer Horizon. Update the app first.');
        var ls = {}, n = 0;
        Object.keys(j.ls).forEach(function (k) {
            if (typeof j.ls[k] === 'string' && BK_OK.test(k) && !BK_NEVER.test(k)) { ls[k] = j.ls[k]; n++; }
        });
        var arch = Array.isArray(j.archive) ? j.archive.filter(function (x) { return x && typeof x === 'object' && typeof x.id === 'string' && x.id; }) : [];
        var chats = 0;
        try { var c = JSON.parse(ls.horizon_chats || '[]'); if (Array.isArray(c)) chats = c.length; } catch (e) { /* ignore */ }
        if (!n && !arch.length) throw new Error('That backup is empty.');
        return { ls: ls, arch: arch, n: n, chats: chats, created: j.created || '', version: j.version || '', keys: !!j.includesKeys };
    }
    function readBackup(f) {
        bkMsg = ''; pending = null;
        if (f.size > 80 * 1048576) { bkMsg = 'That file is too large to be a Horizon backup.'; bkBad = true; render(); return; }
        var r = new FileReader();
        r.onload = function () {
            try { pending = parseBackup(String(r.result)); } catch (e) { bkMsg = e.message; bkBad = true; }
            render();
        };
        r.onerror = function () { bkMsg = 'Could not read that file.'; bkBad = true; render(); };
        r.readAsText(f);
    }
    function mergeChats(cur, inc) {
        try {
            var a = JSON.parse(cur), b = JSON.parse(inc);
            if (!Array.isArray(a) || !Array.isArray(b)) return inc;
            var by = {};
            a.concat(b).forEach(function (c) {
                if (!c || c.id == null) return;
                var o = by[c.id];
                if (!o || (Number(c.updated) || 0) >= (Number(o.updated) || 0)) by[c.id] = c;
            });
            return JSON.stringify(Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return (Number(y.updated) || 0) - (Number(x.updated) || 0); }));
        } catch (e) { return inc; }
    }
    function mergeIdx(cur, inc) {
        try {
            var a = JSON.parse(cur), b = JSON.parse(inc);
            if (!Array.isArray(a) || !Array.isArray(b)) return inc;
            return JSON.stringify(a.concat(b.filter(function (x) { return a.indexOf(x) < 0; })));
        } catch (e) { return inc; }
    }
    function applyBackup() {
        try { if (window.HorizonFlushChats) window.HorizonFlushChats(); } catch (e) { /* ignore */ }
        var b = pending;
        if (!b || bkBusy) return;
        bkBusy = true; render();
        var ok = 0, fail = 0;
        Object.keys(b.ls).forEach(function (k) {
            try {
                var v = b.ls[k], cur = localStorage.getItem(k);
                if (cur != null && k === 'horizon_chats') v = mergeChats(cur, v);
                else if (cur != null && k === 'horizon_att_idx') v = mergeIdx(cur, v);
                localStorage.setItem(k, v); ok++;
            } catch (e) { fail++; }
        });
        archPut(b.arch).then(function (na) {
            pending = null; bkBusy = false;
            bkBad = fail > 0 || (b.arch.length > 0 && !na);
            bkMsg = 'Restored ' + plural(ok, 'entry') + ' and ' + plural(na, 'Archive item') + '.' + (fail ? ' ' + plural(fail, 'entry') + ' did not fit in storage.' : '') + ' Restarting Horizon...';
            render();
            setTimeout(function () { try { location.reload(); } catch (e) { /* ignore */ } }, 1400);
        });
    }
    function pickFile() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
        inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.remove(); if (f) readBackup(f); });
        document.body.appendChild(inp); inp.click();
    }
    function backupSection() {
        var s = sec('BACKUP: EXPORT & IMPORT');
        s.appendChild(para('Save your chats, settings, saved attachments, Archive items and Vault (still encrypted) to one file, or bring them back from one. The file stays on this device until you move it. The music library scan and downloaded GitHub repos are not included; they rebuild from your phone and GitHub.'));

        var row = el('button', 'hza-tog'); row.type = 'button';
        row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(withKeys));
        var tx = el('span', 'hza-tog-t');
        tx.appendChild(el('b', null, 'Include API keys'));
        tx.appendChild(el('small', null, 'Off by default. When on, the file holds your provider, search and GitHub keys in plain text, so keep it private.'));
        row.appendChild(tx);
        row.appendChild(el('span', 'hza-sw ' + (withKeys ? 'on' : 'off'), withKeys ? 'ON' : 'OFF'));
        row.addEventListener('click', function () { withKeys = !withKeys; render(); });
        s.appendChild(row);

        var ex = el('button', 'hza-btn', bkBusy && !pending ? 'Working...' : 'Export backup');
        ex.type = 'button'; ex.disabled = bkBusy; ex.addEventListener('click', doExport);
        s.appendChild(ex);
        var im = el('button', 'hza-btn', 'Import backup');
        im.type = 'button'; im.disabled = bkBusy; im.addEventListener('click', pickFile);
        s.appendChild(im);

        if (pending) {
            var card = el('div', 'hza-card');
            card.appendChild(el('b', null, 'Restore this backup?'));
            var when = '';
            try { if (pending.created) when = new Date(pending.created).toLocaleString(); } catch (e) { /* ignore */ }
            card.appendChild(el('p', 'hza-p', (when ? 'Made ' + when : 'Backup') + (pending.version ? ' in Horizon ' + pending.version : '') + ': ' + plural(pending.chats, 'chat') + ', ' + plural(pending.arch.length, 'Archive item') + ', ' + plural(pending.n, 'saved entry') + ' in all. API keys ' + (pending.keys ? 'are included.' : 'are not included, so your current keys stay.')));
            card.appendChild(el('p', 'hza-p', 'Chats are merged with the ones on this phone. Everything else in the file replaces what is here now, including the Vault, so use the passphrase you had when you exported. Horizon restarts when it is done.'));
            var two = el('div', 'hza-two');
            var go = el('button', 'hza-btn', bkBusy ? 'Restoring...' : 'Restore'); go.type = 'button'; go.disabled = bkBusy; go.addEventListener('click', applyBackup);
            var no = el('button', 'hza-btn alt', 'Cancel'); no.type = 'button'; no.disabled = bkBusy; no.addEventListener('click', function () { pending = null; render(); });
            two.appendChild(go); two.appendChild(no);
            card.appendChild(two);
            s.appendChild(card);
        }
        if (bkMsg) s.appendChild(el('p', 'hza-res' + (bkBad ? ' flag' : ''), bkMsg));
        return s;
    }


    function render() {
        var root = document.getElementById('hzAbout');
        if (!root) return;
        var f = document.createDocumentFragment();

        /* 1. logo + tagline */
        var hero = el('div', 'hza-hero');
        var img = document.createElement('img'); img.src = 'icon.png'; img.alt = 'Horizon'; img.className = 'hza-logo';
        hero.appendChild(img);
        hero.appendChild(el('div', 'hza-name', 'HORIZON'));
        hero.appendChild(el('div', 'hza-tag', 'Strategy over impulse.'));
        f.appendChild(hero);

        /* 2. developer disclosure */
        var dv = el('div', 'hza-dev');
        dv.appendChild(el('b', null, 'Developer: Grant Phil Festers'));
        dv.appendChild(el('span', null, 'Disclosure: independent, self-funded app. Horizon has no server of its own.'));
        f.appendChild(dv);

        /* 3. security and privacy now lives in Settings > SECURITY (V1.35.1) */

        /* 4. updates: version + release check (kept) */
        var a = sec('VERSION & UPDATES');
        a.appendChild(el('div', 'hza-ver', 'Horizon ' + VERSION));
        a.appendChild(para('Your personal AI workspace for conversation, research, creativity and everyday tools. Choose your own AI provider; account requirements and service limits vary.'));
        var b = el('button', 'hza-btn', checking ? 'Checking...' : 'Check for new release');
        b.type = 'button'; b.disabled = checking; b.addEventListener('click', check);
        a.appendChild(b);
        if (result) a.appendChild(el('p', 'hza-res' + (resultBad ? ' flag' : ''), result));
        f.appendChild(a);

        f.appendChild(backupSection());

        /* Capabilities replace only the old update history. Logo, developer, release check and backups stay. */
        var c = sec('WHAT HORIZON CAN DO');
        c.appendChild(para('One workspace. Your choice of AI. Real tools with clear results.'));
        var grid = el('div', 'hza-cap-grid');
        [
            ['Think, write & code', 'Have conversations, brainstorm, draft stories and messages, explain concepts, review code and work with your chosen AI provider. Model abilities and limits vary.'],
            ['Research & check facts', 'Look up Wikipedia, Wikidata, books and music metadata. DuckDuckGo Instant Answers adds definitions and summaries, not full web search. Sources can be incomplete; Horizon reports failed lookups.'],
            ['Create & preview', 'Build documents, spreadsheets, PDFs, Markdown, HTML pages, SVG art and diagrams with local previews and exports. Existing image-generation services may require their own account.'],
            ['Music & playlists', 'Find music, control local playback and radio, and save named, ordered playlists. Resolve streaming tracks when played, or use real local-library IDs. Ask the AI for a playlist and it saves the list, downloads every song to the phone and sends you the tracklist.'],
            ['Keyless instrumental studio', 'Compose ambient, lo-fi and electronic instrumentals locally. Set tempo and duration, preview the result and export WAV. Ask the AI and it saves the WAV for you. Procedural synthesis only: no vocals, no studio-grade AI song model and no signup.'],
            ['Podcast scripts & voices', 'Ask the AI for a podcast: it writes the script with your selected provider and records it with a Microsoft Edge voice into an MP3 saved to Downloads. Needs internet and the latest APK. You can still edit scripts and listen with offline device voices.'],
            ['Everyday tools', 'Explore maps and routes, RSS feeds, files, downloads, alarms, calendar and device tools where supported. Android permissions and individual tool settings still apply.'],
            ['You stay in control', 'Keep your existing provider choice, inspect tool results and review scripts before running them in Termux. Optional integrations retain their own permissions and requirements. No new key or signup is needed for the local studio.']
        ].forEach(function (item) {
            var card = el('article', 'hza-cap-card');
            card.appendChild(el('h5', null, item[0]));
            card.appendChild(el('p', null, item[1]));
            grid.appendChild(card);
        });
        c.appendChild(grid);
        c.appendChild(para('Public online services need internet and may rate-limit or change. No service is promised to be unlimited. Local music and offline-voice playback do not call a generation API.'));
        f.appendChild(c);

        /* data-training reminder moved into SECURITY AND PRIVACY above; the notice() reminder below still runs while its key is on */

        root.replaceChildren(f);
    }

    /* Settings > SECURITY page (V1.35.1): the old SECURITY AND PRIVACY block from ABOUT, moved. */
    function renderSecurity() {
        var root = document.getElementById('hzSecurity');
        if (!root) return;
        var p = sec('SECURITY AND PRIVACY');
        p.firstChild.className = 'hza-h red';
        p.appendChild(para('Nothing goes to the developer and nothing is used to train any Horizon model. Messages go straight from this device to the provider you pick. Free tiers may keep prompts or train on them, and Horizon cannot change that.'));
        var row = el('button', 'hza-tog'); row.type = 'button';
        row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(noTrain()));
        var tx = el('span', 'hza-tog-t');
        tx.appendChild(el('b', null, 'Don\u2019t send my data for training'));
        tx.appendChild(el('small', null, 'ON: Horizon asks before the first message to each provider each session. It cannot override a provider\u2019s own policy.'));
        row.appendChild(tx);
        row.appendChild(el('span', 'hza-sw ' + (noTrain() ? 'on' : 'off'), noTrain() ? 'ON' : 'OFF'));
        row.addEventListener('click', function () { try { localStorage.setItem(LSN, noTrain() ? '0' : '1'); } catch (e) { /* ignore */ } okSent = {}; renderSecurity(); });
        p.appendChild(row);
        var perm = (window.HorizonBrowser && HorizonBrowser.perm) ? HorizonBrowser.perm() : null;
        var lensMode = (window.HorizonLens && HorizonLens.mode) ? HorizonLens.mode() : 'auto';
        var acc = el('div', 'hza-acc');
        acc.appendChild(el('b', 'hza-acc-h', 'SECURITY ACCESS (what the AI can reach)'));
        [
            ['Vault, API keys, passwords', 'NEVER', 0],
            ['UI Lens (app + side panels)', lensMode === 'off' ? 'OFF' : lensMode.toUpperCase(), lensMode === 'off' ? 0 : 1],
            ['Browser Eye (pages you open)', perm ? (perm.eye ? 'ON' : 'BLOCKED') : 'n/a', perm && perm.eye ? 1 : 0],
            ['Browser Lens', perm ? (perm.lens ? 'ON' : 'OFF') : 'n/a', perm && perm.lens ? 1 : 0],
            ['Music control', perm ? (perm.music ? 'ALLOWED' : 'OFF') : 'n/a', perm && perm.music ? 1 : 0]
        ].forEach(function (r) {
            var li = el('div', 'hza-acc-r');
            li.appendChild(el('span', null, r[0]));
            li.appendChild(el('em', r[2] ? 'on' : 'off', r[1]));
            acc.appendChild(li);
        });
        p.appendChild(acc);

        root.replaceChildren(p);
    }

    function warn(id, name, notice) {
        if (!noticeOn() || warned[id]) return;
        warned[id] = 1;
        notice('Reminder: your messages go to ' + name + '. Its own terms decide whether they are kept or used for training.');
    }

    window.HzAbout = { open: render, openSecurity: renderSecurity, warn: warn, allow: allow, version: VERSION };
})();
