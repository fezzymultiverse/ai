/* V1.15.0: modern terminal front end. Any text is a search; results are cards with art, audio and video buttons.
   Uses the existing source settings, never runs shell commands. */
(function () {
    'use strict';
    const log = document.getElementById('hzYtLog');
    const form = document.getElementById('hzYtForm');
    const command = document.getElementById('hzYtCommand');
    if (!log || !form || !command) return;
    const statusEl = document.getElementById('hzYtStatus');
    const chipsEl = document.getElementById('hzYtChips');
    const RECENT_KEY = 'horizon_yt_recent';
    let results = [], busy = false, commandHistory = [], cursor = 0, lastQuery = '';

    const style = document.createElement('style');
    style.textContent = `
.hz-yt-terminal{--g:var(--accent-cyan,#00e5ff);background:radial-gradient(120% 80% at 0% 0%,#0b1f26 0%,#070b10 55%,#05080b 100%);color:#c9f7ff;border:1px solid rgba(var(--accent-rgb),.28);border-radius:16px;overflow:hidden;font:14.5px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;margin:0 auto;max-width:820px;box-shadow:0 0 0 1px rgba(var(--accent-rgb),.05),0 12px 50px rgba(var(--accent-rgb),.08);display:flex;flex-direction:column;min-height:min(78dvh,640px)}
.hz-yt-bar{display:flex;align-items:center;gap:10px;padding:10px 12px;background:rgba(255,255,255,.03);border-bottom:1px solid rgba(var(--accent-rgb),.18);color:#9fdbe8}
.hz-yt-dots{display:flex;gap:6px}.hz-yt-dots b{width:10px;height:10px;border-radius:50%;background:#ff5f57}.hz-yt-dots b:nth-child(2){background:#febc2e}.hz-yt-dots b:nth-child(3){background:#28c840}
.hz-yt-title{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#e6fbff}.hz-yt-title em{color:#5aa7b8;font-style:normal}
.hz-yt-status{font-size:12.5px;padding:3px 9px;border-radius:999px;border:1px solid rgba(var(--accent-rgb),.3);color:#8ad8e8;white-space:nowrap;max-width:46%;overflow:hidden;text-overflow:ellipsis}
.hz-yt-status[data-state=ok]{color:#6dffb0;border-color:rgba(109,255,176,.45)}.hz-yt-status[data-state=bad]{color:#ff8f8f;border-color:rgba(255,143,143,.45)}.hz-yt-status[data-state=busy]{color:#ffd76a;border-color:rgba(255,215,106,.45)}
.hz-yt-chips{display:flex;gap:6px;flex-wrap:wrap;padding:8px 12px 0}.hz-yt-chips:empty{display:none}
.hz-yt-chip{border:1px solid rgba(var(--accent-rgb),.25);background:rgba(var(--accent-rgb),.06);color:#9fe8f5;border-radius:999px;padding:4px 11px;font:inherit;font-size:13.5px;cursor:pointer;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hz-yt-chip:active{background:rgba(var(--accent-rgb),.18)}
#hzYtLog{flex:1;position:relative;padding:12px;min-height:200px;max-height:calc(100dvh - 300px);overflow:auto;overflow-wrap:anywhere;white-space:pre-wrap;scroll-behavior:smooth}
#hzYtLog>.hz-l{padding:1px 0}
.hz-l.cmd{color:#e6fbff;margin-top:10px}.hz-l.cmd::before{content:'❯ ';color:var(--g)}
.hz-l.dim{color:#6f9aa6}.hz-l.ok{color:#6dffb0}.hz-l.err{color:#ff9a9a;border-left:2px solid #ff6b6b;padding-left:8px;margin:4px 0}
.hz-l.hint{color:#8fb8c3}.hz-l .k{color:var(--g)}
.hz-spin{display:inline-block;width:11px;height:11px;border:2px solid rgba(var(--accent-rgb),.25);border-top-color:var(--g);border-radius:50%;animation:hzyt-spin .7s linear infinite;vertical-align:-1px;margin-right:8px}
@keyframes hzyt-spin{to{transform:rotate(360deg)}}
.hz-yt-head{margin:10px 0 6px;color:#6f9aa6;font-size:13.5px;letter-spacing:.04em;text-transform:uppercase}
.hz-yt-card{display:grid;grid-template-columns:92px 1fr;gap:10px;padding:8px;margin:0 0 8px;border:1px solid rgba(var(--accent-rgb),.16);background:rgba(255,255,255,.025);border-radius:12px;white-space:normal;animation:hzyt-in .25s ease both}
@keyframes hzyt-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.hz-yt-art{position:relative;width:92px;height:68px;border-radius:8px;overflow:hidden;background:#0d1a20 linear-gradient(135deg,#0d2a33,#0a1217)}
.hz-yt-art img{width:100%;height:100%;object-fit:cover;display:block}
.hz-yt-art b{position:absolute;left:4px;top:4px;background:rgba(0,0,0,.7);color:var(--g);font-size:12.5px;padding:0 5px;border-radius:4px}
.hz-yt-art s{position:absolute;right:4px;bottom:4px;text-decoration:none;background:rgba(0,0,0,.75);color:#fff;font-size:12.5px;padding:0 5px;border-radius:4px}
.hz-yt-info{min-width:0;display:flex;flex-direction:column;gap:2px}
.hz-yt-info strong{color:#f1fdff;font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:1.3}
.hz-yt-info small{color:#79a6b3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hz-yt-actions{display:flex;gap:6px;margin-top:auto;padding-top:4px;flex-wrap:wrap}
.hz-yt-actions button,#hzYtForm button{border:1px solid rgba(var(--accent-rgb),.4);background:rgba(var(--accent-rgb),.1);color:#b9f4ff;border-radius:8px;padding:6px 11px;font:inherit;font-size:13.5px;cursor:pointer;min-height:32px}
.hz-yt-actions button:active,#hzYtForm button:active{background:rgba(var(--accent-rgb),.28)}
.hz-yt-actions button.vid{border-color:rgba(255,255,255,.2);background:rgba(255,255,255,.05);color:#d7e6ea}
.hz-yt-actions button:disabled{opacity:.55;cursor:wait}.hz-yt-actions button.done{border-color:rgba(109,255,176,.5);color:#6dffb0;background:rgba(109,255,176,.08)}
.hz-yt-note{grid-column:1/-1;font-size:13.5px;color:#8fb8c3;white-space:normal}.hz-yt-note.err{color:#ff9a9a}.hz-yt-note.ok{color:#6dffb0}
#hzYtForm{display:flex;align-items:center;gap:8px;padding:8px 12px calc(8px + env(safe-area-inset-bottom,0px));border-top:1px solid rgba(var(--accent-rgb),.18);background:rgba(0,0,0,.25)}
#hzYtForm label{color:var(--g);font-weight:700;font-size:17px}
#hzYtCommand{flex:1;min-width:0;background:transparent;color:#e6fbff;border:0;outline:none;font:inherit;font-size:18px;padding:10px 0;caret-color:var(--g)}
#hzYtCommand::placeholder{color:#4f7783}
#hzYtForm button{min-width:42px;font-size:17px}
.hz-yt-terminal>p{font-size:12.5px;color:#5d8590;padding:0 12px 10px;margin:0;background:rgba(0,0,0,.25)}
#hzYouTubeView:not([hidden]){display:flex;flex-direction:column;gap:12px}
.hz-yt-terminal{min-height:340px!important;flex:1 1 auto}
#hzYtLog{max-height:calc(100dvh - 430px)!important;min-height:170px!important}
.hz-yt-panel{max-width:820px;width:100%;margin:0 auto;box-sizing:border-box;background:linear-gradient(160deg,#0b1a20,#070b10);color:#c9f7ff;border:1px solid rgba(var(--accent-rgb),.22);border-radius:16px;overflow:hidden;font:14.5px/1.5 ui-monospace,SFMono-Regular,Consolas,monospace}
.hz-yt-ph{width:100%;display:flex;align-items:center;gap:10px;padding:12px 14px;background:rgba(255,255,255,.03);border:0;color:#e6fbff;font:inherit;cursor:pointer;text-align:left}
.hz-yt-ph .t{font-weight:700;letter-spacing:.04em}.hz-yt-ph .c{flex:1;min-width:0;color:#79a6b3;font-size:13.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hz-yt-ph .x{color:var(--accent-cyan,#00e5ff);font-size:13.5px;border:1px solid rgba(var(--accent-rgb),.35);border-radius:999px;padding:3px 10px;white-space:nowrap}
.hz-yt-dlbody{padding:6px 12px 12px;display:flex;flex-direction:column;gap:8px}
.hz-yt-dlrow{display:grid;grid-template-columns:1fr auto;gap:2px 10px;padding:9px 10px;border:1px solid rgba(var(--accent-rgb),.14);border-radius:10px;background:rgba(255,255,255,.025)}
.hz-yt-dlrow strong{color:#f1fdff;font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hz-yt-dlrow small{color:#79a6b3;grid-column:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hz-yt-dlrow .st{grid-row:1;grid-column:2;font-size:12.5px;border-radius:999px;padding:1px 9px;border:1px solid rgba(var(--accent-rgb),.3);color:#8ad8e8}
.hz-yt-dlrow .st.queued{color:#6dffb0;border-color:rgba(109,255,176,.45)}.hz-yt-dlrow .st.failed{color:#ff9a9a;border-color:rgba(255,143,143,.45)}.hz-yt-dlrow .st.working{color:#ffd76a;border-color:rgba(255,215,106,.45)}
.hz-yt-dlrow .acts{grid-column:1/-1;display:flex;gap:6px;margin-top:4px}
.hz-yt-dlrow .acts button,.hz-yt-clear{border:1px solid rgba(var(--accent-rgb),.35);background:rgba(var(--accent-rgb),.08);color:#b9f4ff;border-radius:8px;padding:4px 10px;font:inherit;font-size:13.5px;cursor:pointer;min-height:30px}
.hz-yt-dlrow .why{grid-column:1/-1;color:#ff9a9a;font-size:13.5px;white-space:normal}
.hz-yt-empty{color:#6f9aa6;padding:6px 2px}
.hz-yt-picks{padding:4px 14px 14px}.hz-yt-picks h4{margin:12px 0 6px;font-size:12.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#6f9aa6}
.hz-yt-picks .row{display:flex;flex-wrap:wrap;gap:6px}
.hz-yt-pickhead{display:flex;align-items:center;justify-content:space-between;gap:8px}.hz-yt-pickhead h4{margin:12px 0 6px!important}
.hz-yt-pickbtn{border:1px solid rgba(var(--accent-rgb),.35);background:rgba(var(--accent-rgb),.08);color:#b9f4ff;border-radius:8px;padding:4px 11px;font:inherit;font-size:13.5px;cursor:pointer;min-height:30px}
.hz-yt-gh{display:flex;align-items:center;justify-content:space-between;gap:8px}.hz-yt-gh h4{flex:1}
.hz-yt-chip.add{border-style:dashed;color:#6dffb0;border-color:rgba(109,255,176,.5);background:rgba(109,255,176,.06);font-weight:700}
.hz-yt-pc{display:inline-flex;align-items:stretch;border:1px solid rgba(var(--accent-rgb),.25);background:rgba(var(--accent-rgb),.06);border-radius:999px;overflow:hidden;max-width:100%}
.hz-yt-pc button{border:0;background:transparent;color:#9fe8f5;font:inherit;font-size:13.5px;padding:5px 10px;cursor:pointer;min-height:32px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hz-yt-pc button.x{color:#ff9a9a;padding:5px 11px;border-left:1px solid rgba(var(--accent-rgb),.2)}
.hz-yt-ask{display:flex;gap:6px;align-items:center;width:100%;margin:4px 0}
.hz-yt-ask input{flex:1;min-width:0;background:rgba(0,0,0,.35);color:#e6fbff;border:1px solid rgba(var(--accent-rgb),.4);border-radius:8px;padding:7px 10px;font:inherit;font-size:18px;outline:none}
.hz-yt-tip{margin:12px 0 0;padding:9px 11px;border-radius:10px;border:1px dashed rgba(var(--accent-rgb),.22);color:#8fb8c3;font-size:13.5px}
@media(max-width:420px){.hz-yt-card{grid-template-columns:78px 1fr}.hz-yt-art{width:78px;height:58px}}`;
    document.head.appendChild(style);

    function line(text, cls) {
        const node = document.createElement('div');
        node.className = 'hz-l' + (cls ? ' ' + cls : '');
        node.textContent = text;
        log.appendChild(node);
        while (log.children.length > 150) log.firstElementChild.remove();
        log.scrollTop = log.scrollHeight;
        return node;
    }
    function spinner(text) {
        const node = document.createElement('div');
        node.className = 'hz-l dim';
        const dot = document.createElement('span'); dot.className = 'hz-spin';
        node.append(dot, document.createTextNode(text));
        log.appendChild(node);
        log.scrollTop = log.scrollHeight;
        return node;
    }
    function setStatus(state, text) {
        if (!statusEl) return;
        statusEl.dataset.state = state;
        statusEl.textContent = '● ' + text;
    }
    function setBusy(value) {
        busy = value;
        form.querySelector('button').disabled = value;
        form.setAttribute('aria-busy', String(value));
    }
    const fmt = s => { s = Math.max(0, Math.round(Number(s) || 0)); return s ? Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') : ''; };
    const readRecent = () => { try { const v = JSON.parse(localStorage.getItem(RECENT_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
    function pushRecent(q) {
        const list = [q].concat(readRecent().filter(x => x.toLowerCase() !== q.toLowerCase())).slice(0, 4);
        try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch (e) { /* storage blocked */ }
        drawChips();
    }
    function drawChips() {
        if (!chipsEl) return;
        chipsEl.replaceChildren();
        readRecent().concat(['help', 'diag', 'clear']).forEach(label => {
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'hz-yt-chip'; b.textContent = label;
            b.addEventListener('click', () => run(label));
            chipsEl.appendChild(b);
        });
    }
    function help() {
        line('Just type an artist or song and hit enter.', 'hint');
        line('  <number>        download audio of that result\n  audio <n|url>   save audio (m4a)\n  video <n|url>   save video with sound\n  diag            show source status\n  clear           wipe the screen', 'dim');
    }
    function resolveId(value) {
        if (/^\d+$/.test(value)) {
            const row = results[Number(value) - 1];
            if (!row) throw new Error('No result #' + value + '. Search first.');
            return row.id;
        }
        const match = String(value).match(/(?:v=|youtu\.be\/|shorts\/|embed\/|^)([\w-]{11})(?:[&?#\s]|$)/);
        if (!match) throw new Error('Use a result number, video ID or YouTube URL.');
        return match[1];
    }
    const DL_KEY = 'horizon_yt_dl';
    let dlOpen = false, dlBody = null, dlCount = null, dlChev = null, dlHead = null;
    function readDl() {
        try { const v = JSON.parse(localStorage.getItem(DL_KEY)); return Array.isArray(v) ? v : []; } catch (e) { return []; }
    }
    function writeDl(list) { try { localStorage.setItem(DL_KEY, JSON.stringify(list.slice(0, 40))); } catch (e) { /* storage blocked */ } }
    function dlRecord(rec) {
        const list = readDl().filter(x => x.k !== rec.k);
        list.unshift(rec); writeDl(list); drawDl();
    }
    async function doDownload(id, kind, item) {
        const rec = { k: id + kind, id, kind, title: (item && item.title) || id, artist: (item && item.artist) || '', status: 'working', msg: 'Finding a stream…', ts: Date.now() };
        dlRecord(rec);
        if (!window.HorizonYouTube) { rec.status = 'failed'; rec.msg = 'Source bridge not ready. Reopen the app.'; dlRecord(rec); return rec; }
        setStatus('busy', 'working');
        // V1.23.0: every terminal download is also tracked in the Downloads app (progress, Open, Retry).
        const track = window.HorizonDownloads ? window.HorizonDownloads.begin({ type: kind === 'video' ? 'video' : 'audio', src: 'youtube', title: rec.title, sub: rec.artist, retry: { op: 'yt', id, kind } }) : null;
        try {
            rec.msg = await window.HorizonYouTube.download(id, kind, track ? track.live : undefined);
            rec.status = 'queued'; setStatus('ok', 'saved');
            if (track) track.finish(rec.msg);
        } catch (error) {
            rec.status = 'failed'; rec.msg = error.message || String(error); setStatus('bad', 'failed');
            if (track) track.fail(error);
        }
        dlRecord(rec);
        return rec;
    }
    async function download(id, kind, btn, note, item) {
        if (btn) { btn.disabled = true; btn.textContent = '…'; }
        note.className = 'hz-yt-note'; note.textContent = 'Finding a stream…';
        const rec = await doDownload(id, kind, item);
        const ok = rec.status === 'queued';
        note.className = 'hz-yt-note ' + (ok ? 'ok' : 'err'); note.textContent = rec.msg;
        if (btn) { btn.disabled = false; btn.textContent = ok ? '✓ saved' : '↻ retry'; btn.classList.toggle('done', ok); }
    }
    function card(item, index) {
        const row = document.createElement('div'); row.className = 'hz-yt-card';
        row.style.animationDelay = (index * 35) + 'ms';
        const art = document.createElement('div'); art.className = 'hz-yt-art';
        const img = document.createElement('img'); img.loading = 'lazy'; img.alt = '';
        img.src = 'https://i.ytimg.com/vi/' + item.id + '/mqdefault.jpg';
        img.addEventListener('error', () => img.remove());
        const num = document.createElement('b'); num.textContent = String(index + 1).padStart(2, '0');
        art.append(img, num);
        if (item.dur) { const d = document.createElement('s'); d.textContent = fmt(item.dur); art.appendChild(d); }
        const info = document.createElement('div'); info.className = 'hz-yt-info';
        const title = document.createElement('strong'); title.textContent = item.title || item.id;
        const meta = document.createElement('small'); meta.textContent = item.artist || '';
        const actions = document.createElement('div'); actions.className = 'hz-yt-actions';
        const note = document.createElement('div'); note.className = 'hz-yt-note'; note.hidden = true;
        [['audio', '↓ Music'], ['video', '↓ Video']].forEach(([kind, text]) => {
            const button = document.createElement('button'); button.type = 'button';
            button.textContent = text; if (kind === 'video') button.className = 'vid';
            button.addEventListener('click', () => { note.hidden = false; download(item.id, kind, button, note, item); });
            actions.appendChild(button);
        });
        info.append(title, meta, actions);
        row.append(art, info, note);
        return row;
    }
    async function search(query) {
        if (!window.HorizonYouTube) throw new Error('YouTube source bridge is not ready. Reopen the app.');
        lastQuery = query;
        setStatus('busy', 'searching');
        const spin = spinner('searching "' + query + '"…');
        try {
            const answer = await window.HorizonYouTube.search(query);
            spin.remove();
            results = answer.items;
            setStatus('ok', answer.via);
            pushRecent(query);
            const head = document.createElement('div'); head.className = 'hz-yt-head';
            head.textContent = results.length + ' results · ' + answer.via;
            log.appendChild(head);
            results.forEach((item, index) => log.appendChild(card(item, index)));
            log.scrollTop = Math.max(0, head.offsetTop - 8);
        } catch (error) {
            spin.remove();
            setStatus('bad', 'offline');
            line(error.message || String(error), 'err');
            const retry = document.createElement('button');
            retry.type = 'button'; retry.className = 'hz-yt-chip'; retry.textContent = '↻ retry "' + query + '"';
            retry.addEventListener('click', () => { retry.remove(); run(query); });
            log.appendChild(retry);
            line('type  diag  to see which sources failed', 'dim');
        }
    }
    async function run(raw) {
        raw = String(raw || '').trim();
        if (busy || !raw) return;
        line(raw, 'cmd');
        commandHistory.push(raw); cursor = commandHistory.length;
        const match = raw.match(/^(\S+)(?:\s+([\s\S]*))?$/);
        const verb = match[1].toLowerCase(), arg = (match[2] || '').trim();
        if (verb === 'help' || verb === '?') { help(); return; }
        if (verb === 'clear' || verb === 'cls') { log.replaceChildren(); setStatus('ok', 'ready'); return; }
        if (verb === 'diag') { line(window.HorizonYouTube ? window.HorizonYouTube.diag() : 'Source bridge not ready.', 'dim'); return; }
        setBusy(true);
        try {
            const isAv = verb === 'audio' || verb === 'video';
            const ytUrl = /(?:youtu\.be\/|youtube\.com\/)/i.test(raw);
            const rowPick = /^\d+$/.test(raw) && results[Number(raw) - 1];
            if (isAv || ytUrl || rowPick) {
                const kind = verb === 'video' ? 'video' : 'audio';
                const target = isAv ? arg : raw;
                if (!target) throw new Error('Usage: ' + verb + ' result-number-or-URL');
                const note = line('', 'dim');
                note.className = 'hz-yt-note';
                const did = resolveId(target);
                await download(did, kind, null, note, results.find(r => r.id === did));
                note.className = 'hz-l ' + (note.className.indexOf('err') > -1 ? 'err' : 'ok');
            } else {
                const query = (verb === 'search' || verb === 's' || verb === 'find') && arg ? arg : raw;
                await search(query);
            }
        } catch (error) { line(error.message || String(error), 'err'); }
        finally { setBusy(false); }
    }
    form.addEventListener('submit', event => { event.preventDefault(); const text = command.value; if (busy) return; command.value = ''; run(text); });
    command.addEventListener('keydown', event => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        cursor = Math.max(0, Math.min(commandHistory.length, cursor + (event.key === 'ArrowUp' ? -1 : 1)));
        command.value = commandHistory[cursor] || '';
    });
    function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function drawDl() {
        if (!dlBody) return;
        const list = readDl();
        const q = list.filter(x => x.status === 'queued').length, f = list.filter(x => x.status === 'failed').length, w = list.filter(x => x.status === 'working').length;
        dlCount.textContent = list.length ? [w && w + ' working', q && q + ' saved', f && f + ' failed'].filter(Boolean).join(' · ') : 'nothing yet';
        dlChev.textContent = dlOpen ? 'Collapse ▴' : 'Expand ▾';
        dlHead.setAttribute('aria-expanded', String(dlOpen));
        dlBody.replaceChildren();
        if (!list.length) { dlBody.appendChild(el('div', 'hz-yt-empty', 'Songs you save from the terminal show up here.')); return; }
        list.slice(0, dlOpen ? 30 : 2).forEach(rec => {
            const row = el('div', 'hz-yt-dlrow');
            row.append(el('strong', '', rec.title), el('span', 'st ' + rec.status, rec.status === 'queued' ? '✓ saved' : rec.status),
                el('small', '', (rec.artist ? rec.artist + ' · ' : '') + (rec.kind === 'video' ? 'video' : 'audio')));
            if (rec.status === 'failed') row.appendChild(el('div', 'why', rec.msg));
            if (dlOpen && rec.status !== 'working') {
                const acts = el('div', 'acts');
                if (rec.status === 'failed') { const r = el('button', '', '↻ Retry'); r.type = 'button'; r.addEventListener('click', () => doDownload(rec.id, rec.kind, rec)); acts.appendChild(r); }
                const x = el('button', '', '✕ Remove'); x.type = 'button';
                x.addEventListener('click', () => { writeDl(readDl().filter(z => z.k !== rec.k)); drawDl(); });
                acts.appendChild(x); row.appendChild(acts);
            }
            dlBody.appendChild(row);
        });
        if (dlOpen) {
            const c = el('button', 'hz-yt-clear', 'Clear all'); c.type = 'button';
            c.addEventListener('click', () => { writeDl([]); drawDl(); });
            dlBody.appendChild(c);
        } else if (list.length > 2) dlBody.appendChild(el('div', 'hz-yt-empty', '+ ' + (list.length - 2) + ' more · tap Expand'));
    }
    // V1.23.0: Quick picks you can change. "+" adds a pick, Edit lets you replace (tap the name) or remove (x) any pick, and add or remove whole groups.
    const PICKS_KEY = 'horizon_yt_picks';
    const DEFAULT_PICKS = [['Local heat', ['Cape Town hip hop', 'amapiano', 'gqom', 'South African rap']], ['Beats & focus', ['lofi hip hop', 'boom bap instrumentals', 'jazz hop', 'deep focus']], ['Classics', ['90s hip hop', 'Eminem', 'Kendrick Lamar', 'Nas']]];
    let picksEl = null, picksEdit = false, resetArmed = false;
    function readPicks() {
        try {
            const v = JSON.parse(localStorage.getItem(PICKS_KEY));
            if (Array.isArray(v) && v.length && v.every(g => Array.isArray(g) && typeof g[0] === 'string' && Array.isArray(g[1]) && g[1].every(w => typeof w === 'string'))) return v;
        } catch (e) { /* fall back to defaults */ }
        return DEFAULT_PICKS.map(g => [g[0], g[1].slice()]);
    }
    function writePicks(v) { try { localStorage.setItem(PICKS_KEY, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
    function askText(parent, placeholder, initial, done) {
        const form = document.createElement('form'); form.className = 'hz-yt-ask';
        const input = document.createElement('input'); input.type = 'text'; input.maxLength = 40; input.placeholder = placeholder; input.value = initial || '';
        input.autocomplete = 'off'; input.autocapitalize = 'off'; input.spellcheck = false; input.enterKeyHint = 'done';
        const ok = document.createElement('button'); ok.type = 'submit'; ok.className = 'hz-yt-pickbtn'; ok.textContent = '✓';
        const no = document.createElement('button'); no.type = 'button'; no.className = 'hz-yt-pickbtn'; no.textContent = '✕';
        form.append(input, ok, no);
        form.addEventListener('submit', e => { e.preventDefault(); done(input.value.replace(/\s+/g, ' ').trim().slice(0, 40)); });
        no.addEventListener('click', () => drawPicks());
        parent.appendChild(form);
        input.focus(); input.select();
    }
    function drawPicks() {
        if (!picksEl) return;
        const groups = readPicks();
        picksEl.replaceChildren();
        const head = el('div', 'hz-yt-pickhead'); head.appendChild(el('h4', '', 'Quick picks'));
        const edit = el('button', 'hz-yt-pickbtn', picksEdit ? '✓ Done' : '✎ Edit'); edit.type = 'button';
        edit.addEventListener('click', () => { picksEdit = !picksEdit; resetArmed = false; drawPicks(); });
        head.appendChild(edit); picksEl.appendChild(head);
        groups.forEach((group, gi) => {
            const gh = el('div', 'hz-yt-gh'); const title = el('h4', '', group[0]);
            gh.appendChild(title);
            if (picksEdit) {
                const ren = el('button', 'hz-yt-pickbtn', 'Rename'); ren.type = 'button';
                ren.addEventListener('click', () => { gh.replaceChildren(); askText(gh, 'Group name', group[0], name => { if (name) { groups[gi][0] = name; writePicks(groups); } drawPicks(); }); });
                const del = el('button', 'hz-yt-pickbtn', '✕ Group'); del.type = 'button';
                del.addEventListener('click', () => { groups.splice(gi, 1); writePicks(groups.length ? groups : DEFAULT_PICKS.map(g => [g[0], g[1].slice()])); drawPicks(); });
                gh.append(ren, del);
            }
            picksEl.appendChild(gh);
            const row = el('div', 'row');
            group[1].forEach((w, wi) => {
                if (!picksEdit) {
                    const b = el('button', 'hz-yt-chip', w); b.type = 'button'; b.addEventListener('click', () => run(w)); row.appendChild(b); return;
                }
                const pc = el('span', 'hz-yt-pc');
                const label = el('button', '', w + ' ✎'); label.type = 'button'; label.setAttribute('aria-label', 'Replace ' + w);
                label.addEventListener('click', () => { pc.replaceChildren(); pc.style.width = '100%'; pc.style.borderRadius = '10px'; askText(pc, 'Replace with…', w, text => { if (text) groups[gi][1][wi] = text; else groups[gi][1].splice(wi, 1); writePicks(groups); drawPicks(); }); });
                const x = el('button', 'x', '✕'); x.type = 'button'; x.setAttribute('aria-label', 'Remove ' + w);
                x.addEventListener('click', () => { groups[gi][1].splice(wi, 1); writePicks(groups); drawPicks(); });
                pc.append(label, x); row.appendChild(pc);
            });
            if (group[1].length < 16) {
                const plus = el('button', 'hz-yt-chip add', '+'); plus.type = 'button'; plus.setAttribute('aria-label', 'Add a quick pick to ' + group[0]);
                plus.addEventListener('click', () => { plus.remove(); const holder = el('div'); holder.style.width = '100%'; row.appendChild(holder); askText(holder, 'Artist, song or genre…', '', text => { if (text && !groups[gi][1].some(x => x.toLowerCase() === text.toLowerCase())) { groups[gi][1].push(text); writePicks(groups); } drawPicks(); }); });
                row.appendChild(plus);
            }
            picksEl.appendChild(row);
        });
        if (picksEdit) {
            const foot = el('div', 'row'); foot.style.marginTop = '12px';
            if (groups.length < 8) {
                const addG = el('button', 'hz-yt-chip add', '+ New group'); addG.type = 'button';
                addG.addEventListener('click', () => { foot.replaceChildren(); askText(foot, 'Group name', '', name => { if (name) { groups.push([name, []]); writePicks(groups); } drawPicks(); }); });
                foot.appendChild(addG);
            }
            const reset = el('button', 'hz-yt-chip', resetArmed ? 'Tap again to reset' : 'Reset to default'); reset.type = 'button';
            reset.addEventListener('click', () => {
                if (!resetArmed) { resetArmed = true; drawPicks(); setTimeout(() => { if (resetArmed) { resetArmed = false; drawPicks(); } }, 3500); return; }
                resetArmed = false; try { localStorage.removeItem(PICKS_KEY); } catch (e) { /* storage blocked */ } drawPicks();
            });
            foot.appendChild(reset); picksEl.appendChild(foot);
        } else if (!groups.length) picksEl.appendChild(el('div', 'hz-yt-empty', 'No picks yet. Tap Edit, then + New group.'));
        picksEl.appendChild(el('div', 'hz-yt-tip', 'Tap + to add a pick, or ✎ Edit to replace or remove one. Music saves to Music/Horizon, video to Movies/Horizon. Tip: paste any YouTube link into the terminal to grab it straight away. Everything you save also shows in Apps → Downloads.'));
    }
    function buildPanels() {
        const view = form.closest('#hzYouTubeView') || form.parentElement.parentElement;
        const dl = el('section', 'hz-yt-panel'); dl.setAttribute('aria-label', 'Downloads');
        dlHead = el('button', 'hz-yt-ph'); dlHead.type = 'button';
        dlCount = el('span', 'c'); dlChev = el('span', 'x');
        dlHead.append(el('span', 't', '⬇ DOWNLOADS'), dlCount, dlChev);
        dlHead.addEventListener('click', () => { dlOpen = !dlOpen; drawDl(); });
        dlBody = el('div', 'hz-yt-dlbody');
        dl.append(dlHead, dlBody);
        const picks = el('section', 'hz-yt-panel hz-yt-picks'); picks.setAttribute('aria-label', 'Quick picks');
        picksEl = picks; drawPicks();
        view.append(dl, picks);
        readDl().some(x => x.status === 'working') && writeDl(readDl().map(x => x.status === 'working' ? Object.assign(x, { status: 'failed', msg: 'Interrupted when the app closed' }) : x));
        drawDl();
    }
    buildPanels();
    drawChips();
    line('HORIZON / YOUTUBE', 'k');
    line('No Google login. Type an artist or song to search.', 'dim');
})();
