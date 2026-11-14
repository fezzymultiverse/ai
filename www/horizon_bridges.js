/* Targeted native integrations. Existing chat, providers, Vault and shell stay intact. */
(function () {
  'use strict';
  var states = { termux: {} }, refreshing = null, recent = [];
  var SRC = '\\[\\[(termux\\.(?:run|status|install))(?::\\s*((?:(?!\\]\\])[\\s\\S])*?))?\\s*\\]\\]|```(termux\\.run)[ \\t]*\\n([\\s\\S]*?)```';
  function plugin(name) { var c = window.Capacitor; return c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins[name]; }
  function notice(text, bad) { if (window.HzToast) HzToast.show({ title: bad ? 'Needs attention' : 'Horizon bridge', sub: String(text), kind: bad ? 'bad' : '', ms: 8000 }); }
  function error(e) { return String(e && e.message || e); }
  function node(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function quote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'"; }
  async function refresh() {
    if (refreshing) return refreshing;
    refreshing = Promise.all([
      plugin('HorizonTermux') ? plugin('HorizonTermux').status().then(function (s) { states.termux = s; }) : Promise.resolve()
    ]).catch(function (e) { notice(error(e), true); }).then(async function () {
      refreshing = null;
      paint();

    }).catch(function (e) { refreshing = null; notice(error(e), true); });
    return refreshing;
  }
  function paint() {
    var ts = document.getElementById('hzTermuxStatus');
    if (ts) ts.textContent = !plugin('HorizonTermux') ? 'Android app required' : !states.termux.installed ? 'Install standard Termux first' : !states.termux.enabled ? 'Off' : !states.termux.permission ? 'Grant Run commands permission' : 'Permission granted · Test bridge verifies Termux setup';
    window.dispatchEvent(new Event('horizon-bridges-paint'));
    var ai = document.getElementById('hzTermuxAiToggle');
    if (ai) { ai.classList.toggle('on', !!states.termux.aiEnabled); ai.setAttribute('aria-pressed', String(!!states.termux.aiEnabled)); }
    var tb = document.getElementById('hzTermuxToggle');
    if (tb) { tb.classList.toggle('on', !!states.termux.enabled); tb.setAttribute('aria-pressed', String(!!states.termux.enabled)); }
  }
  function button(text, fn, cls) {
    var b = node('button', cls || 'hzb-action', text); b.type = 'button';
    b.addEventListener('click', async function () {
      if (b.disabled) return; b.disabled = true;
      try { await fn(); } catch (e) { notice(error(e), true); } finally { b.disabled = false; }
    }); return b;
  }
  var approvalDialog = null, approvalToken = null;
  function closeApproval(approved) {
    var token = approvalToken; approvalToken = null;
    if (approvalDialog) { approvalDialog.close(); approvalDialog.remove(); approvalDialog = null; }
    if (token) { var p = plugin('HorizonTermux'); if (p) p.resolveApproval({ token: token, approved: !!approved }).catch(function (e) { notice(error(e), true); }); }
  }
  window.addEventListener('horizon-termux-approval', function (e) {
    var d = e.detail || {}, p = plugin('HorizonTermux');
    if (!p || !d.token) return;
    if (approvalToken) closeApproval(false);
    approvalToken = d.token;
    if (document.hidden) { closeApproval(false); return; }
    var dialog = node('dialog', 'hzb-approval'); approvalDialog = dialog;
    dialog.setAttribute('data-hz-private', ''); dialog.setAttribute('aria-label', 'Approve Termux command');
    dialog.append(node('h2', '', d.title || 'Termux command'), node('p', '', d.warning || 'Review this command carefully.'), node('pre', '', d.command || ''));
    var cancel = button('Cancel', function () { closeApproval(false); });
    var run = button('Run', function () { closeApproval(true); });
    dialog.append(cancel, run); dialog.addEventListener('cancel', function (ev) { ev.preventDefault(); closeApproval(false); });
    document.body.appendChild(dialog); dialog.showModal(); cancel.focus();
    setTimeout(function () { if (approvalToken === d.token) closeApproval(false); }, 120000);
  });
  window.addEventListener('horizon-termux-result', function (e) {
    var r = e.detail || {};
    var lr = liveRuns[r.id]; if (lr && !lr.closed) { setTimeout(function () { if (lr.closed) return; lr.exit = typeof r.exitCode === 'number' ? r.exitCode : -1; if (!lr.raw) lr.raw = String(r.stdout || '') + (r.stderr ? '\n' + r.stderr : ''); finishLive(lr, liveResult(lr)); }, 1500); } if (activeJob && activeJob.id === r.id && activeJob.unknown && (r.status === 'complete' || typeof r.exitCode === 'number')) { activeJob = null; emitCommand({ phase: 'recovered', result: r }); } notice('Termux job ' + r.id + ': ' + (r.exitCode === 0 && !r.error ? 'complete' : 'failed'), r.exitCode !== 0 || !!r.error);
    var out = document.getElementById('hzTermuxStatus'); if (out) out.textContent = 'Last job: ' + r.id + ' · exit ' + r.exitCode;
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden && approvalToken) closeApproval(false); });
  function mount() { refresh(); }
  function mountTermux(host) {
    if (!host || document.getElementById('hzTermuxCard')) return;
    if (window.HorizonHub) window.HorizonHub.mount(host); paint();
  }
  function installCommand() { return 'pkg install -y python ffmpeg aria2 curl && python -m pip install --upgrade yt-dlp && yt-dlp --version && ffmpeg -version | head -n 1'; }
  function resultText(r) {
    if (r.live) { var o = String(r.stdout || ''); if (o.length > 9000) o = '[...earlier output cut]\n' + o.slice(-9000); return 'exit ' + r.exitCode + ' \u00B7 ' + (r.ms / 1000).toFixed(1) + 's \u00B7 cwd ' + (r.cwd || '?') + (r.error ? '\n' + r.error : '') + '\n' + o + (r.ops && r.ops.length && window.HorizonRunLog ? '\n' + HorizonRunLog.opsText(r.ops) : ''); }
    return 'exit ' + r.exitCode + (r.error ? '\n' + r.error : '') + '\n' + (r.stdout || '') + (r.stderr ? '\nSTDERR:\n' + r.stderr : '');
  }
  // One shared execution owner for manual commands, AI calls and download helpers.
  // Unknown completion keeps the lock: timeout is NOT a cancellation.
  var activeJob = null;
  function emitCommand(detail) { if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('horizon-terminal-command', { detail: detail })); }

  /* V1.90.0 live runs: Termux streams merged output back over a one-shot localhost socket (HorizonTermuxPlugin.executeLive). */
  var liveRuns = {}, early = {};
  function emitRun(detail) { if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('horizon-run', { detail: detail })); }
  function liveResult(r) {
    var text = window.HorizonRunLog ? HorizonRunLog.flatten(r.raw) : r.raw;
    return { status: 'complete', exitCode: r.exit, stdout: text.slice(-60000), stderr: '', error: r.timedOut ? 'Timed out after ' + Math.round(r.timeout / 1000) + 's and was killed' : '', live: true, cwd: r.cwd, bash: r.bash, ms: Date.now() - r.t0, ops: window.HorizonRunLog ? HorizonRunLog.ops(text) : [], jobId: r.id };
  }
  function finishLive(r, res) {
    if (r.closed) return; r.closed = true; clearTimeout(r.timer); delete liveRuns[r.id];
    if (activeJob === r.job) activeJob = null;
    emitRun({ phase: 'end', id: r.id, fromAI: r.ai, command: r.cmd, result: res });
    r.resolve(res);
  }
  function liveEvent(r, e) {
    if (e.t === 'O') { r.raw += e.d; if (r.raw.length > 400000) r.raw = r.raw.slice(-300000); emitRun({ phase: 'chunk', id: r.id, text: e.d }); }
    else if (e.t === 'N') emitRun({ phase: 'note', id: r.id, text: e.d });
    else if (e.t === 'B') { r.bash = e.d; emitRun({ phase: 'bash', id: r.id, text: e.d }); }
    else if (e.t === 'C') r.cwd = e.d;
    else if (e.t === 'X') { r.exit = parseInt(e.d, 10); if (isNaN(r.exit)) r.exit = -1; finishLive(r, liveResult(r)); }
  }
  window.addEventListener('horizon-termux-live', function (e) {
    var d = e.detail || {}, r = liveRuns[d.id], ev = d.ev || [];
    if (!r) { (early[d.id] = early[d.id] || []).push.apply(early[d.id], ev); return; }
    ev.forEach(function (x) { liveEvent(r, x); });
  });
  async function termuxLive(p, cmd, timeout, fromAI, opts) {
    var job = { id: '', cmd: cmd, ai: !!fromAI, live: true }; activeJob = job;
    var cwd = (opts && opts.cwd) || (window.HorizonTerminal && window.HorizonTerminal.cwd && window.HorizonTerminal.cwd()) || '';
    var trace = (function () { try { return localStorage.getItem('hzTermTrace') !== '0'; } catch (e) { return true; } })();
    emitRun({ phase: 'start', command: cmd, fromAI: !!fromAI });
    var start;
    try { start = await p.executeLive({ cmd: cmd, fromAI: !!fromAI, trace: trace, cwd: cwd }); }
    catch (e) { activeJob = null; emitRun({ phase: 'error', command: cmd, error: error(e) }); throw e; }
    job.id = start.jobId;
    return new Promise(function (resolve, reject) {
      var r = { id: start.jobId, cmd: cmd, ai: !!fromAI, job: job, raw: '', exit: null, cwd: cwd, bash: '', t0: Date.now(), timeout: timeout || 600000, resolve: resolve, closed: false };
      liveRuns[r.id] = r; emitRun({ phase: 'run', id: r.id, command: cmd, fromAI: !!fromAI });
      r.timer = setTimeout(function () {
        r.timedOut = true; try { p.liveKill({ jobId: r.id }); } catch (e) { /* ignore */ }
        r.timer = setTimeout(function () {
          if (r.closed) return; r.closed = true; delete liveRuns[r.id]; job.unknown = true;
          emitRun({ phase: 'unknown', id: r.id, command: cmd, error: 'No answer after the kill request. The job may still be running; check Recent jobs before repeating it.' });
          reject(new Error('No Termux result after timeout. Job: ' + r.id + '. Check Recent jobs / results before repeating.'));
        }, 8000);
      }, r.timeout);
      var pre = early[r.id]; delete early[r.id]; if (pre) pre.forEach(function (x) { liveEvent(r, x); });
    });
  }
  async function liveKill() {
    var p = plugin('HorizonTermux'); var ids = Object.keys(liveRuns); if (!p || !ids.length) return false;
    for (var i = 0; i < ids.length; i++) { try { await p.liveKill({ jobId: ids[i] }); } catch (e) { notice(error(e), true); } }
    return true;
  }
  async function termux(cmd, timeout, fromAI, opts) {
    var p = plugin('HorizonTermux'); if (!p) throw new Error('Termux bridge needs the Android app');
    if (!String(cmd || '').trim()) throw new Error('Enter a command first');
    if (fromAI && !states.termux.aiEnabled) throw new Error('AI commands are off in Terminal Controls');
    if (activeJob) throw new Error('Termux job ' + (activeJob.id || 'awaiting approval') + ' is still pending. Retrieve its result before starting another command.');
    if (typeof p.executeLive === 'function' && !(opts && opts.legacy) && p.live !== false) return termuxLive(p, cmd, timeout, fromAI, opts);
    var job = { id: '', cmd: cmd, ai: !!fromAI }; activeJob = job;
    emitCommand({ phase: 'start', command: cmd, fromAI: !!fromAI });
    try {
      var start = await p.execute({ cmd: cmd, fromAI: !!fromAI }); job.id = start.jobId;
      var deadline = Date.now() + (timeout || 120000);
      while (Date.now() < deadline) {
        var r = await p.result({ jobId: start.jobId });
        if (r.status === 'complete') { if (activeJob === job) activeJob = null; emitCommand({ phase: 'complete', command: cmd, jobId: start.jobId, result: r }); return r; }
        await new Promise(function (resolve) { setTimeout(resolve, document.hidden ? 3000 : 1000); });
      }
      throw new Error('No Termux result yet. The command may still be running; do not blindly repeat it. Job: ' + start.jobId + '. Use Recent jobs / results.');
    } catch (e) {
      if (!job.id && activeJob === job) activeJob = null;
      if (job.id) job.unknown = true;
      emitCommand({ phase: job.id ? 'unknown' : 'error', command: cmd, jobId: job.id, error: error(e) });
      throw e;
    }
  }
  function directoryCommand() { return 'DEST="$HOME/horizon-downloads"; if [ -d "$HOME/storage/downloads" ] && [ -w "$HOME/storage/downloads" ]; then DEST="$HOME/storage/downloads/Horizon"; fi; mkdir -p "$DEST" && '; }
  async function youtubeDownload(id, kind, fromAI) {
    await refresh(); if (!states.termux.enabled || !states.termux.permission) throw new Error('Enable Termux bridge and install download tools in Terminal Controls for the yt-dlp fallback');
    if (!/^[\w-]{11}$/.test(id)) throw new Error('Invalid video ID');
    var opts = kind === 'video' ? '-f "bv*+ba/b" --merge-output-format mp4' : '-f "ba/b" -x --audio-format m4a';
    var cmd = directoryCommand() + 'yt-dlp --no-playlist --newline --retries 3 --fragment-retries 3 ' + opts + ' -P "$DEST" -o "%(title).100B [%(id)s].%(ext)s" --print after_move:filepath -- ' + quote('https://www.youtube.com/watch?v=' + id);
    var r = await termux(cmd, 1200000, !!fromAI);
    if (r.exitCode !== 0 || r.error) throw new Error(resultText(r).slice(-5000));
    return 'Termux yt-dlp finished successfully. File path/output:\n' + r.stdout.slice(-3000);
  }
  // V1.91.0: last-resort YouTube search through yt-dlp in Termux (used only when NewPipe and the app API both fail). Returns [] / null on any failure.
  async function youtubeSearch(q, fromAI) {
    await refresh(); if (!states.termux.enabled || !states.termux.permission) return null;
    q = String(q || '').replace(/[\r\n]+/g, ' ').trim().slice(0, 200); if (!q) return null;
    var r = await termux('command -v yt-dlp >/dev/null 2>&1 && yt-dlp --no-warnings --flat-playlist --print "%(id)s@@@%(title)s@@@%(channel)s@@@%(duration)s" -- ' + quote('ytsearch8:' + q), 120000, !!fromAI);
    if (r.exitCode !== 0 || r.error) return null;
    var items = [];
    String(r.stdout || '').split('\n').forEach(function (l) {
      var f = l.trim().split('@@@');
      if (f.length >= 3 && /^[\w-]{11}$/.test(f[0])) items.push({ id: f[0], title: f[1] || f[0], artist: f[2] && f[2] !== 'NA' ? f[2] : '', dur: Number(f[3]) || 0 });
    });
    return items;
  }
  async function torrent(ref, fromAI) {
    await refresh(); if (!states.termux.enabled) throw new Error('Enable Termux bridge first');
    if (!/^magnet:\?xt=urn:btih:/i.test(ref) && !/^https:\/\//i.test(ref)) throw new Error('Use a magnet or HTTPS .torrent link');
    var r = await termux(directoryCommand() + 'aria2c --seed-time=0 --max-concurrent-downloads=2 --max-tries=3 --dir="$DEST" -- ' + quote(ref), 1200000, !!fromAI);
    if (r.exitCode !== 0 || r.error) throw new Error(resultText(r).slice(-3000));
    return { text: 'Termux torrent command completed:\n' + r.stdout.slice(-3000) };
  }
  function parse(text) {
    var re = new RegExp(SRC, 'gi'), m, calls = [];
    while ((m = re.exec(text)) && calls.length < 3) calls.push({ br: true, kind: (m[1] || m[3]).toLowerCase(), arg: (m[2] || m[4] || '').trim() });
    return calls;
  }
  function block() {
    var rows = [];
    if (states.termux.enabled && states.termux.aiEnabled) rows.push('UNIFIED TERMUX TERMINAL (LIVE): ' + (window.HorizonRunLog ? HorizonRunLog.knowHow() : '') + ' [[termux.run: command]] runs a command; if the command contains ]] (for example bash [[ ]] tests) or spans many lines, use a fenced block whose language is exactly termux.run instead. [[termux.status]] checks permission; [[termux.install]] offers Python, yt-dlp, FFmpeg, curl and aria2. Music, video, playlists and ordinary file downloads work with yt-dlp, FFmpeg, curl or aria2c when installed (the YOUTUBE DOWNLOADS recipes above are the exact commands); save to $HOME/storage/downloads/Horizon if writable, otherwise $HOME/horizon-downloads, never bypass DRM. Every result starts with exit N; the run is also streaming in the terminal so Fezzy sees it; the AI mode in Terminal Controls decides whether he must approve each command.');
    else if (states.termux.installed) rows.push('TERMINAL IS OFF: Fezzy has a real Termux terminal you can drive with [[termux.run: command]]. It is not usable yet (' + (!states.termux.enabled ? 'Termux bridge is off' : !states.termux.aiEnabled ? 'AI mode is OFF' : 'Run commands permission missing') + '). If Fezzy asks you to run something, do NOT pretend to run it and do NOT emit the tool: tell him exactly to open Settings > Permissions > Terminal Controls, switch the Termux bridge on, set AI mode to ASK (he approves each command) or AUTO (runs by itself, needed when the app is in the background), grant Run commands, and make sure allow-external-apps=true is set in ~/.termux/termux.properties.');
    return rows.join('\n');
  }
  async function run(kind, arg) {
    try {
      await refresh();
      if (kind === 'termux.status') return { text: JSON.stringify(states.termux) };
      if (kind.indexOf('termux.') === 0) {
        var r = await termux(kind === 'termux.install' ? installCommand() : arg, kind === 'termux.install' ? 900000 : 600000, true);
        var rt = resultText(r); return { text: (r.exitCode !== 0 || r.error ? 'ERROR: ' : '') + (r.live ? rt.slice(-12000) : rt.slice(0, 12000)) };
      }
      return { text: 'ERROR: Unknown bridge tool.' };
    } catch (e) { return { text: 'ERROR: ' + error(e) }; }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('horizon-resume', refresh);
  window.addEventListener('horizon-reply', refresh);
  window.HorizonBridges = { liveCapable: function () { var p = plugin('HorizonTermux'); return !!(p && typeof p.executeLive === 'function'); }, kill: liveKill, plugin: plugin, notice: notice, installCommand: installCommand, resultText: resultText, configure: async function (o) { var p = plugin('HorizonTermux'); if (!p) throw new Error('Android app required'); await p.configure(o); await refresh(); }, SRC: SRC, parse: parse, block: block, run: run, refresh: refresh, mountTermux: mountTermux, busy: function () { return !!activeJob; },  termux: termux, youtubeDownload: youtubeDownload, youtubeSearch: youtubeSearch, torrent: torrent, quote: quote, state: function () { return states; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
