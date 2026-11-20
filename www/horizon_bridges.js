/* Targeted native integrations. Existing chat, providers, Vault and shell stay intact. */
(function () {
  'use strict';
  var states = { termux: {} }, refreshing = null;
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
    var lr = liveRuns[r.id]; if (lr && !lr.closed) {
      lr.sawResult = true;
      var deliverFinal = function () {
        if (lr.closed) return;
        if (lr.lastLive && Date.now() - lr.lastLive < 5000) { setTimeout(deliverFinal, 1000); return; }
        lr.exit = typeof r.exitCode === 'number' ? r.exitCode : -1; lr.transportError = r.error || '';
        if (!lr.raw) lr.raw = String(r.stdout || '') + (r.stderr ? '\n' + r.stderr : '');
        finishLive(lr, liveResult(lr));
      };
      setTimeout(deliverFinal, 1500);
    } if (activeJob && activeJob.id === r.id && activeJob.unknown && (r.status === 'complete' || typeof r.exitCode === 'number')) { activeJob = null; emitCommand({ phase: 'recovered', result: r }); } notice('Termux job ' + r.id + ': ' + (r.exitCode === 0 && !r.error ? 'complete' : 'failed'), r.exitCode !== 0 || !!r.error);
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
  var liveRuns = {}, early = {}, forced = {};
  function emitRun(detail) { if (typeof window.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') window.dispatchEvent(new CustomEvent('horizon-run', { detail: detail })); }
  function liveResult(r) {
    var text = window.HorizonRunLog ? HorizonRunLog.flatten(r.raw) : r.raw;
    return { status: 'complete', exitCode: r.exit, stdout: text, stderr: '', error: r.transportError || (r.timedOut ? 'Timed out after ' + Math.round(r.timeout / 1000) + 's and was killed' : (r.stopped ? 'Stopped by you (Ctrl+C / STOP). Termux did not confirm; if the process is still alive, run: pkill -f "' + String(r.cmd || '').trim().split(/\s+/).slice(0, 2).join(' ').replace(/[^\w. -]/g, '') + '"' : '')), live: true, cwd: r.cwd, bash: r.bash, ms: Date.now() - r.t0, ops: window.HorizonRunLog ? HorizonRunLog.ops(text) : [], jobId: r.id };
  }
  function finishLive(r, res) {
    if (r.closed) return; r.closed = true; clearTimeout(r.timer); delete liveRuns[r.id];
    if (activeJob === r.job) activeJob = null; clearInterval(r.poll);
    emitRun({ phase: 'end', id: r.id, fromAI: r.ai, command: r.cmd, result: res });
    r.resolve(res);
  }
  function liveEvent(r, e) {
    if (r.closed) return; r.lastLive = Date.now();
    if (e.t === 'O') { r.raw += e.d; if (r.raw.length > 4000000) {r.raw = r.raw.slice(-3000000); if(!r.trimNoted) {r.trimNoted=true; emitRun({phase:'note',id:r.id,text:'Earlier output remains in the full Termux log; the live history is bounded.'});}} emitRun({ phase: 'chunk', id: r.id, text: e.d }); }
    else if (e.t === 'N') emitRun({ phase: 'note', id: r.id, text: e.d });
    else if (e.t === 'B') { r.bash = e.d; emitRun({ phase: 'bash', id: r.id, text: e.d }); }
    else if (e.t === 'C') r.cwd = e.d;
    else if (e.t === 'X') { r.exit = parseInt(e.d, 10); if (isNaN(r.exit)) r.exit = -1; finishLive(r, liveResult(r)); }
  }
  window.addEventListener('horizon-termux-live', function (e) {
    var d = e.detail || {}, r = liveRuns[d.id], ev = d.ev || [];
    if (!r) { if (forced[d.id]) return; (early[d.id] = early[d.id] || []).push.apply(early[d.id], ev); return; }
    ev.forEach(function (x) { liveEvent(r, x); });
  });
  async function termuxLive(p, cmd, timeout, fromAI, opts) {
    var job = { id: '', cmd: cmd, ai: !!fromAI, live: true }; activeJob = job;
    var cwd = (opts && opts.cwd) || (window.HorizonTerminal && window.HorizonTerminal.cwd && window.HorizonTerminal.cwd()) || '';
    var trace = (function () { try { return localStorage.getItem('hzTermTrace') === '1'; } catch (e) { return false; } })();
    emitRun({ phase: 'start', command: cmd, fromAI: !!fromAI });
    var start;
    try { start = await p.executeLive({ cmd: cmd, fromAI: !!fromAI, trace: trace, cwd: cwd }); }
    catch (e) { activeJob = null; emitRun({ phase: 'error', command: cmd, error: error(e) }); throw e; }
    job.id = start.jobId;
    return new Promise(function (resolve, reject) {
      var r = { id: start.jobId, cmd: cmd, ai: !!fromAI, job: job, raw: '', exit: null, cwd: cwd, bash: '', t0: Date.now(), timeout: fromAI ? (timeout || 600000) : ((opts && opts.timeoutMs) || 0), resolve: resolve, closed: false };
      liveRuns[r.id] = r; emitRun({ phase: 'run', id: r.id, command: cmd, fromAI: !!fromAI });
      if (r.timeout > 0) r.timer = setTimeout(function () {
        r.timedOut = true; try { p.liveKill({ jobId: r.id }); } catch (e) { /* ignore */ }
        if (r.timeout > 0) r.timer = setTimeout(function () {
          if (r.closed) return; r.closed = true; delete liveRuns[r.id]; job.unknown = true;
          emitRun({ phase: 'unknown', id: r.id, command: cmd, error: 'No answer after the kill request. The job may still be running; check Recent jobs before repeating it.' });
          reject(new Error('No Termux result after timeout. Job: ' + r.id + '. Check Recent jobs / results before repeating.'));
        }, 8000);
      }, r.timeout);
      r.poll = setInterval(function () {
        if (r.closed || !p.result || r.polling) return;
        r.polling = true;
        p.result({jobId:r.id}).then(function(result) {
          if (!r.closed && result.status === 'complete' && !r.sawResult) {
            r.sawResult = true;
            window.dispatchEvent(new CustomEvent('horizon-termux-result', {detail:result}));
          }
        }).catch(function() {}).finally(function() {r.polling=false;});
      }, 2500);
      var pre = early[r.id]; delete early[r.id]; if (pre) pre.forEach(function (x) { liveEvent(r, x); });
    });
  }
  async function liveKill() {
    var p = plugin('HorizonTermux'); var ids = Object.keys(liveRuns); if (!p || !ids.length) return false;
    for (var i = 0; i < ids.length; i++) { try { await p.liveKill({ jobId: ids[i] }); } catch (e) { notice(error(e), true); } }
    setTimeout(function () {
      ids.forEach(function(id) {
        var lr=liveRuns[id]; if(!lr || lr.closed) return;
        emitRun({phase:'note',id:id,text:'Stop sent; waiting for Termux to confirm exit. Open Termux if the process does not respond.'});
      });
    }, 3500);
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
    rows.push(window.HorizonRunLog ? HorizonRunLog.knowHow() : 'TERMUX: rootless Android bash. Show commands in fenced bash blocks; wait for RUN and real output.');
    if (states.termux.enabled && states.termux.aiEnabled) rows.push('TERMUX BRIDGE READY: present shell commands in fenced bash blocks for the RUN button. Do not emit termux.run tags or termux.run fences: these bypass the user-run workflow. [[termux.status]] checks setup; For setup commands use fenced bash and RUN too. Never assume an installed tool is available until checked.');
    else rows.push('TERMUX NOT READY: Settings > Permissions > Terminal Controls. Enable the bridge, grant Run commands, choose AI approval mode and set allow-external-apps=true in ~/.termux/termux.properties. Present commands as fenced bash; wait for setup and RUN. Never pretend execution.');
    return rows.join('\n');
  }
  async function run(kind, arg) {
    try {
      await refresh();
      if (kind === 'termux.status') return { text: JSON.stringify(states.termux) };
      if (kind === 'termux.run' || kind === 'termux.install') return { text: 'ERROR: not executed. Present the command in a fenced bash block and wait for Fezzy to press RUN, then inspect the actual result.' };
      return { text: 'ERROR: Unknown bridge tool.' };
    } catch (e) { return { text: 'ERROR: ' + error(e) }; }
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(); });
  window.addEventListener('horizon-resume', refresh);
  window.addEventListener('horizon-reply', refresh);
  window.HorizonBridges = { liveCapable: function () { var p = plugin('HorizonTermux'); return !!(p && typeof p.executeLive === 'function'); }, input: async function(text) {var p=plugin('HorizonTermux'), ids=Object.keys(liveRuns); if(!p || !p.liveInput || ids.length!==1) throw new Error('No connected input channel'); return p.liveInput({jobId:ids[0],text:String(text)});}, kill: liveKill, plugin: plugin, notice: notice, installCommand: installCommand, resultText: resultText, configure: async function (o) { var p = plugin('HorizonTermux'); if (!p) throw new Error('Android app required'); await p.configure(o); await refresh(); }, SRC: SRC, parse: parse, block: block, run: run, refresh: refresh, mountTermux: mountTermux, busy: function () { return !!activeJob; },  termux: termux, torrent: torrent, quote: quote, state: function () { return states; } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
})();
