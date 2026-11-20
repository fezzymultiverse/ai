/* Horizon V1.99.138 - YOUTUBE PICKER IN THE CHAT.
 * Ask the AI for a playlist, an artist or anything: a scrollable YouTube-style card pops up INSIDE the chat.
 * Every row has its own buttons, so PLAY and DOWNLOAD are never mixed up:
 *   Play      streams it through the music player right now (nothing is saved)
 *   Audio     saves the audio to the phone (progress bar on the row)
 *   Video     saves the video (mp4) to the phone (progress bar on the row)
 *   Link      copies the youtube.com link
 * The top bar takes a pasted YouTube link: Play it or save it without asking the AI at all.
 * The AI opens the card with [[yt.pick: search words]]. It never plays or saves by itself from this card;
 * only the buttons do. The app side (HorizonYtPickHost) lives in index.html next to the other YouTube tools.
 * Cards are remembered per chat (last 8, ten rows each, ids and titles only) and come back when the chat is reopened.
 */
(function () {
    'use strict';
    var W = window, D = document;
    var STORE = 'horizon_yt_picks';
    var KEEP = 8, ROWS = 12;

    function el(tag, cls, text) { var n = D.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function btn(label, cls, title) { var b = el('button', 'hzyp-b' + (cls ? ' ' + cls : ''), label); b.type = 'button'; if (title) { b.title = title; b.setAttribute('aria-label', title); } return b; }
    function host() { return W.HorizonYtPickHost || null; }
    function toast(msg) { try { if (typeof W.toast === 'function') W.toast(msg); else if (W.HzFilesNotice) W.HzFilesNotice(msg); } catch (_) { /* no toast available */ } }
    function dur(sec) {
        sec = Math.round(Number(sec) || 0);
        if (sec <= 0) return '';
        var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
        return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
    }
    function link(id) { return 'https://www.youtube.com/watch?v=' + id; }
    function readAll() { try { var v = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } }
    function writeAll(list) { try { localStorage.setItem(STORE, JSON.stringify(list.slice(-KEEP))); } catch (_) { /* storage full: the card still works for this session */ } }

    var CSS = '.hzyp{margin:10px 8px;max-width:100%;border:1px solid rgba(var(--accent-rgb,0,229,255),.35);border-radius:14px;background:var(--panel,#0b1720);color:var(--text,#e4f9fc);overflow:hidden}' +
        '.hzyp-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid rgba(var(--accent-rgb,0,229,255),.2)}' +
        '.hzyp-logo{flex:none;width:26px;height:18px;border-radius:5px;background:#ff2d2d;position:relative}' +
        '.hzyp-logo:after{content:"";position:absolute;left:10px;top:5px;border-left:8px solid #fff;border-top:4px solid transparent;border-bottom:4px solid transparent}' +
        '.hzyp-q{flex:1;min-width:0;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '.hzyp-n{flex:none;font-size:12px;opacity:.7}' +
        '.hzyp-paste,.hzyp-refine{display:flex;gap:6px;padding:8px 12px;border-bottom:1px solid rgba(var(--accent-rgb,0,229,255),.12)}' +
        '.hzyp-paste input,.hzyp-refine input{flex:1;min-width:0;background:rgba(255,255,255,.05);color:inherit;border:1px solid rgba(var(--accent-rgb,0,229,255),.3);border-radius:8px;padding:8px 10px;font:inherit;font-size:14px}' +
        '.hzyp-list{max-height:54vh;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain}' +
        '.hzyp-row{display:grid;grid-template-columns:104px 1fr;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(var(--accent-rgb,0,229,255),.1)}' +
        '.hzyp-row:last-child{border-bottom:0}' +
        '.hzyp-art{position:relative;width:104px;height:58px;border-radius:8px;overflow:hidden;background:#0d1a20}' +
        '.hzyp-art img{width:100%;height:100%;object-fit:cover;display:block}' +
        '.hzyp-art s{position:absolute;right:3px;bottom:3px;text-decoration:none;background:rgba(0,0,0,.78);color:#fff;font-size:11px;padding:0 5px;border-radius:4px}' +
        '.hzyp-info{min-width:0;display:flex;flex-direction:column;gap:2px}' +
        '.hzyp-t{font-weight:600;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
        '.hzyp-a{font-size:12.5px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
        '.hzyp-act{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:6px}' +
        '.hzyp-b{border:1px solid rgba(var(--accent-rgb,0,229,255),.45);background:rgba(var(--accent-rgb,0,229,255),.1);color:inherit;border-radius:8px;padding:7px 12px;min-height:36px;font:inherit;font-size:13.5px;cursor:pointer}' +
        '.hzyp-b:active{background:rgba(var(--accent-rgb,0,229,255),.3)}.hzyp-b:disabled{opacity:.55}' +
        '.hzyp-b.play{border-color:#3ddc84;background:rgba(61,220,132,.12)}' +
        '.hzyp-b.save{border-color:#ffb020;background:rgba(255,176,32,.12)}' +
        '.hzyp-b.done{border-color:#3ddc84;background:rgba(61,220,132,.2)}' +
        '.hzyp-b.bad{border-color:#ff6b6b;background:rgba(255,107,107,.15)}' +
        '.hzyp-bar{grid-column:1/-1;height:6px;border-radius:4px;background:rgba(255,255,255,.1);overflow:hidden}' +
        '.hzyp-bar i{display:block;height:100%;width:0;background:#ffb020;transition:width .3s}' +
        '.hzyp-bar.ok i{background:#3ddc84}.hzyp-bar.bad i{background:#ff6b6b}' +
        '.hzyp-msg{grid-column:1/-1;font-size:12.5px;opacity:.85;overflow-wrap:anywhere}';
    function css() { if (D.getElementById('hzypCss')) return; var s = el('style'); s.id = 'hzypCss'; s.textContent = CSS; D.head.appendChild(s); }

    // Shows progress for one row: polls the real download record until it finishes or fails.
    function watch(row, id, kind, bar, fill, msg, b, downloadId) {
        var h = host(), tries = 0, timer = setInterval(function () {
            if (row.isConnected === false || tries > 1500) { clearInterval(timer); b.disabled = false; msg.textContent = 'Live progress paused. Check Downloads for the actual result.'; return; }
            var st = h && h.status ? h.status(id, kind, downloadId) : null;
            tries++;
            if (!st) { if (tries > 40) { clearInterval(timer); b.disabled = false; msg.textContent = 'No download record found. Check Downloads or retry; nothing is confirmed saved.'; } return; }
            if (st.status === 'done') { clearInterval(timer); fill.style.width = '100%'; bar.className = 'hzyp-bar ok'; b.disabled = false; b.className = 'hzyp-b done'; b.textContent = 'Saved \u2713'; msg.textContent = 'Saved: ' + (st.path || 'Downloads'); return; }
            if (st.status === 'error') { clearInterval(timer); bar.className = 'hzyp-bar bad'; b.disabled = false; b.className = 'hzyp-b bad'; b.textContent = 'Retry'; msg.textContent = 'Failed: ' + String(st.err || 'unknown reason').slice(0, 140); return; }
            fill.style.width = Math.max(4, Math.min(99, Number(st.pct) || 4)) + '%';
            msg.textContent = (st.status === 'queued' ? 'Waiting in the Downloads queue\u2026' : 'Downloading ' + (Number(st.pct) || 0) + '%');
        }, 600);
    }

    function save(row, id, title, kind, b, bar, fill, msg) {
        var h = host();
        if (!h || !h.save) { msg.textContent = 'Downloads are not ready. Reopen the app.'; return; }
        b.disabled = true; bar.hidden = false; bar.className = 'hzyp-bar'; fill.style.width = '4%'; msg.hidden = false; msg.textContent = 'Starting\u2026';
        Promise.resolve(h.save(id, title, kind)).then(function (r) {
            if (r && r.error) { b.disabled = false; bar.className = 'hzyp-bar bad'; msg.textContent = r.error; return; }
            watch(row, id, kind, bar, fill, msg, b, r && r.downloadId);
        }).catch(function (e) { b.disabled = false; bar.className = 'hzyp-bar bad'; msg.textContent = 'Failed: ' + String(e && e.message || e).slice(0, 140); });
    }

    function play(id, title, b, msg) {
        var h = host();
        if (!h || !h.play) { msg.hidden = false; msg.textContent = 'The player is not ready. Reopen the app.'; return; }
        b.disabled = true; msg.hidden = false; msg.textContent = 'Starting\u2026';
        Promise.resolve(h.play(id, title)).then(function (r) {
            b.disabled = false;
            var t = String(r && r.text || '');
            msg.textContent = /^ERROR|NEEDS CHOICE/i.test(t) ? t.replace(/^ERROR:\s*/i, '').slice(0, 160) : 'Playing: ' + (title || id);
        }).catch(function (e) { b.disabled = false; msg.textContent = String(e && e.message || e).slice(0, 160); });
    }

    function copy(text, b) {
        var done = function () { var old = b.textContent; b.textContent = 'Copied \u2713'; setTimeout(function () { b.textContent = old; }, 1400); };
        function fallback() {
            var input = D.createElement('textarea'); input.value = text; input.style.cssText = 'position:fixed;left:-9999px'; D.body.appendChild(input); input.select();
            var ok = false; try { ok = D.execCommand('copy'); } catch (_) {} input.remove();
            if (ok) done(); else toast('Copy unavailable. Link: ' + text);
        }
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; } } catch (_) { /* fall through */ }
        fallback();
    }

    function rowFor(it) {
        var row = el('div', 'hzyp-row'), id = String(it.id), title = String(it.title || id);
        var art = el('div', 'hzyp-art'), img = D.createElement('img'); img.loading = 'lazy'; img.alt = ''; img.src = 'https://i.ytimg.com/vi/' + encodeURIComponent(id) + '/mqdefault.jpg'; art.appendChild(img);
        var d = dur(it.dur); if (d) art.appendChild(el('s', '', d));
        var info = el('div', 'hzyp-info'); info.appendChild(el('div', 'hzyp-t', title)); info.appendChild(el('div', 'hzyp-a', String(it.artist || '')));
        var act = el('div', 'hzyp-act'), bar = el('div', 'hzyp-bar'), fill = D.createElement('i'), msg = el('div', 'hzyp-msg');
        bar.hidden = true; msg.hidden = true; bar.appendChild(fill);
        var bp = btn('\u25B6 Play', 'play', 'Play now, nothing is saved'), ba = btn('\u2B07 Audio', 'save', 'Save the audio to the phone'), bv = btn('\u2B07 Video', 'save', 'Save the video to the phone'), bl = btn('Link', '', 'Copy the link');
        bp.onclick = function () { play(id, title, bp, msg); };
        ba.onclick = function () { save(row, id, title, 'audio', ba, bar, fill, msg); };
        bv.onclick = function () { save(row, id, title, 'video', bv, bar, fill, msg); };
        bl.onclick = function () { copy(link(id), bl); };
        var view = btn('View', '', 'Watch the selected video in this chat');
        view.onclick = function () {
            var old = row.querySelector ? row.querySelector('.hzyp-player') : null;
            if (old) { old.remove(); view.textContent = 'View'; return; }
            var frame = D.createElement('iframe'); frame.className = 'hzyp-player';
            frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id);
            frame.title = title; frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
            frame.setAttribute('allowfullscreen', ''); frame.referrerPolicy = 'strict-origin-when-cross-origin';
            frame.style.cssText = 'grid-column:1/-1;width:100%;aspect-ratio:16/9;border:0;border-radius:8px';
            row.appendChild(frame); view.textContent = 'Close video';
        };
        act.appendChild(view); act.appendChild(bp); act.appendChild(ba); act.appendChild(bv); act.appendChild(bl);
        row.appendChild(art); row.appendChild(info); row.appendChild(act); row.appendChild(bar); row.appendChild(msg);
        return row;
    }

    function pasteBar(msgHost) {
        var wrap = el('div', 'hzyp-paste'), inp = D.createElement('input');
        inp.type = 'text'; inp.placeholder = 'Paste a YouTube link\u2026'; inp.setAttribute('aria-label', 'Paste a YouTube link'); inp.autocomplete = 'off'; inp.spellcheck = false;
        var bp = btn('\u25B6', 'play', 'Play this link'), bs = btn('\u2B07', 'save', 'Save the audio of this link');
        function pid() { var h = host(); var id = h && h.parseId ? h.parseId(inp.value) : ''; if (!id) { msgHost.hidden = false; msgHost.textContent = 'That is not a YouTube link or video id.'; return ''; } return id; }
        bp.onclick = function () { var id = pid(); if (id) play(id, '', bp, msgHost); };
        bs.onclick = function () {
            var id = pid(); if (!id) return;
            var h = host(); bs.disabled = true; msgHost.hidden = false; msgHost.textContent = 'Saving\u2026';
            Promise.resolve(h && h.save ? h.save(id, '', 'audio') : { error: 'Downloads are not ready.' }).then(function (r) { bs.disabled = false; msgHost.textContent = r && r.error ? r.error : 'Queued. Progress is in the Downloads page.'; }).catch(function (e) { bs.disabled = false; msgHost.textContent = String(e && e.message || e).slice(0, 140); });
        };
        wrap.appendChild(inp); wrap.appendChild(bp); wrap.appendChild(bs);
        return wrap;
    }

    function build(pick) {
        css();
        var card = el('section', 'hzyp'); card.setAttribute('aria-label', 'YouTube results for ' + pick.query);
        var head = el('div', 'hzyp-head'); head.appendChild(el('span', 'hzyp-logo')); head.appendChild(el('span', 'hzyp-q', pick.query)); head.appendChild(el('span', 'hzyp-n', pick.items.length + ' results'));
        card.appendChild(head);
        var pasteMsg = el('div', 'hzyp-msg'); pasteMsg.hidden = true; pasteMsg.style.padding = '0 12px 6px';
        card.appendChild(pasteBar(pasteMsg)); card.appendChild(pasteMsg);
        var list = el('div', 'hzyp-list'); list.setAttribute('role', 'list');
        pick.items.forEach(function (it) { var r = rowFor(it); r.setAttribute('role', 'listitem'); list.appendChild(r); });
        card.appendChild(list);
        var search = el('form', 'hzyp-refine'), input = D.createElement('input'), go = btn('Search', '', 'Search YouTube in this card');
        input.type = 'search'; input.value = pick.query; input.placeholder = 'Refine YouTube search'; input.setAttribute('aria-label', 'Search YouTube'); go.type = 'submit';
        search.appendChild(input); search.appendChild(go); card.insertBefore(search, list);
        var token = 0;
        search.onsubmit = async function (ev) {
            ev.preventDefault(); var q = input.value.trim(), h = host(), mine = ++token;
            if (q.length < 2 || !h || !h.search) return;
            go.disabled = true; pasteMsg.hidden = false; pasteMsg.textContent = 'Searching YouTube…';
            try {
                var result = clean(await h.search(q)); if (mine !== token || card.isConnected === false) return;
                if (!result.length) { pasteMsg.textContent = 'No videos returned. Your previous results are still below.'; return; }
                list.replaceChildren(); result.forEach(function (it) { var row = rowFor(it); row.setAttribute('role', 'listitem'); list.appendChild(row); });
                head.querySelector('.hzyp-q').textContent = q; head.querySelector('.hzyp-n').textContent = result.length + ' results';
                pick.query = q; pick.items = result;
                var all = readAll(); for (var i = 0; i < all.length; i++) if (all[i].ts === pick.ts && all[i].chatId === pick.chatId) all[i] = pick; writeAll(all);
                pasteMsg.textContent = 'Choose a result to view, copy or download. Nothing starts automatically.';
            } catch (e) { pasteMsg.textContent = 'Search failed: ' + String(e && e.message || e).slice(0, 140); }
            finally { if (mine === token) go.disabled = false; }
        };
        return card;
    }

    function clean(items) {
        var seen = {};
        return (Array.isArray(items) ? items : []).filter(function (it) { if (!it || !/^[\w-]{11}$/.test(String(it.id)) || seen[it.id]) return false; seen[it.id] = true; return true; }).slice(0, ROWS)
            .map(function (it) { return { id: String(it.id), title: String(it.title || '').slice(0, 140), artist: String(it.artist || '').slice(0, 80), dur: Number(it.dur) || 0 }; });
    }

    // Shows a new picker at the end of the chat. chatId/count (messages in the chat right now) let it come back in the same place later.
    function show(query, items, chatId, count) {
        var host_ = D.getElementById('chatMessages'), list = clean(items);
        if (!host_ || !list.length) return false;
        var pick = { query: String(query || 'YouTube').slice(0, 80), items: list, chatId: String(chatId || ''), count: Number(count) || 0, ts: Date.now() };
        var all = readAll(); all.push(pick); writeAll(all);
        host_.appendChild(build(pick));
        try { host_.scrollTop = host_.scrollHeight; } catch (_) { /* scroll is cosmetic */ }
        return true;
    }

    // Called after a chat is drawn: puts that chat's saved cards back right after the message they were made for.
    function restore(chatId, container, firstShown, total) {
        if (!container) return;
        var mine = readAll().filter(function (p) { return p.chatId === String(chatId); });
        if (!mine.length) return;
        var kids = Array.prototype.slice.call(container.children).filter(function (n) { return !n.classList.contains('hz-earlier'); });
        var aligned = kids.length === total - firstShown;
        mine.forEach(function (p) {
            var card = build(p), idx = p.count - 1 - firstShown;
            if (aligned && idx >= 0 && idx < kids.length) { var ref = kids[idx]; if (ref.nextSibling) container.insertBefore(card, ref.nextSibling); else container.appendChild(card); }
            else if (aligned && idx < 0) { /* its message is in the hidden earlier part */ }
            else container.appendChild(card);
        });
    }

    W.HorizonYtPick = { show: show, restore: restore, _build: build, _clean: clean };
})();
