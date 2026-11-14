/* HORIZON V1.90.0 · Terminal CONTROL DECK. Replaces the old Controls / Options list (which copied the Permissions layout):
   a setup rail, one AI run-mode selector, live-view chips and a tile toolbelt. Mounted by HorizonBridges.mountTermux(). */
(function () {
  'use strict';
  var SCAN = 'printf "arch: %s\\n" "$(uname -m)"; printf "bash: %s\\n" "$BASH_VERSION"; printf "tools: "; for t in git python python3 node npm pip curl wget ffmpeg yt-dlp aria2c rsync jq zip unzip tar openssl ssh gcc clang make; do command -v "$t" >/dev/null 2>&1 && printf "%s " "$t"; done; echo; if [ -d "$HOME/storage/downloads" ]; then echo "storage: linked (~/storage/downloads)"; else echo "storage: not linked (run termux-setup-storage)"; fi; df -h "$HOME" 2>/dev/null | tail -n 1';
  var DEV = 'pkg install -y git python nodejs curl wget rsync jq zip unzip openssl-tool && git --version && python --version && node --version';
  var MODES = [
    ['off', 'OFF', 'The AI cannot touch Termux.'],
    ['ask', 'ASK', 'The AI proposes, you tap Run on a native popup for every command.'],
    ['auto', 'AUTO', 'The AI runs on its own and you watch it live. A guard still asks first for root, rm of / or home, pipe-to-shell, mkfs and .bashrc edits. STOP kills a run.']
  ];
  var el = {};
  function B() { return window.HorizonBridges; }
  function T() { return B() && B().state().termux || {}; }
  function ls(k, d) { try { var v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } }
  function lw(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  function n(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function guard(fn) { return async function () { try { await fn(); } catch (e) { B().notice(e && e.message || e, true); } paint(); }; }
  function mode() { var t = T(); return !t.aiEnabled ? 'off' : t.aiAuto ? 'auto' : 'ask'; }

  function step(num, label, id, fn) {
    var b = n('button', 'hzh-step'); b.type = 'button'; if (id) b.id = id;
    b.appendChild(n('i', 'hzh-num', num)); b.appendChild(n('b', null, label)); b.appendChild(n('small', null, ''));
    b.addEventListener('click', guard(fn)); return b;
  }
  function chip(label, key, fn) {
    var b = n('button', 'hzh-chip', label); b.type = 'button'; b.dataset.k = key; b.addEventListener('click', guard(fn)); return b;
  }
  function tile(icon, label, hint, fn) {
    var b = n('button', 'hzh-tile'); b.type = 'button';
    b.appendChild(n('span', 'hzh-ti', icon)); b.appendChild(n('b', null, label)); b.appendChild(n('small', null, hint));
    b.addEventListener('click', guard(fn)); return b;
  }
  function run(cmd, ms) { return window.HorizonTerminal.run(cmd, ms); }

  function mount(host) {
    if (!host || document.getElementById('hzTermuxCard')) return;
    var root = n('section', 'hzh'); root.id = 'hzTermuxCard';
    var head = n('div', 'hzh-head'); head.appendChild(n('h2', null, 'CONTROL DECK'));
    el.led = n('span', 'hzh-led', 'offline'); head.appendChild(el.led);
    el.status = n('p', 'hzh-status'); el.status.id = 'hzTermuxStatus';

    var rail = n('div', 'hzh-rail');
    el.s1 = step('1', 'Termux', '', async function () { var p = B().plugin('HorizonTermux'); if (!p) throw new Error('Android app required'); await p.openTermux(); });
    el.s2 = step('2', 'Bridge', 'hzTermuxToggle', async function () { await B().configure({ enabled: !T().enabled }); if (T().enabled && !T().permission) await B().plugin('HorizonTermux').requestAccess(); await B().refresh(); });
    el.s3 = step('3', 'Permission', '', async function () { var p = B().plugin('HorizonTermux'); if (!p) throw new Error('Android app required'); await p.requestAccess(); await B().refresh(); });
    el.s4 = step('4', 'Test', '', async function () { var r = await run('printf "Horizon bridge OK\\n"', 45000); if (r && r.exitCode === 0) lw('hzTermTested', '1'); });
    [el.s1, el.s2, el.s3, el.s4].forEach(function (s) { rail.appendChild(s); });

    var aiHead = n('div', 'hzh-sec', 'AI RUN MODE');
    el.seg = n('div', 'hzh-seg'); el.seg.id = 'hzTermuxAiToggle'; el.seg.setAttribute('role', 'radiogroup'); el.seg.setAttribute('aria-label', 'AI run mode');
    MODES.forEach(function (m) {
      var b = n('button', 'hzh-seg-b', m[1]); b.type = 'button'; b.dataset.mode = m[0]; b.setAttribute('role', 'radio');
      b.addEventListener('click', guard(async function () {
        if (m[0] === 'auto' && !window.confirm('AUTO lets the AI run commands in your Termux without a popup. You watch every run live and STOP kills it, but it has your Termux access (not root). A guard still asks for dangerous commands. Turn AUTO on?')) return;
        await B().configure({ aiEnabled: m[0] !== 'off', aiAuto: m[0] === 'auto' });
      }));
      el.seg.appendChild(b);
    });
    el.modeTxt = n('p', 'hzh-note');

    var view = n('div', 'hzh-sec', 'LIVE VIEW');
    var chips = n('div', 'hzh-chips');
    el.cFollow = chip('', 'follow', async function () { lw('hzTermFollow', ls('hzTermFollow', 'open') === 'open' ? 'strip' : 'open'); });
    el.cTrace = chip('', 'trace', async function () { lw('hzTermTrace', ls('hzTermTrace', '1') === '0' ? '1' : '0'); });
    el.cManual = chip('', 'manual', async function () { await B().configure({ manualAuto: !T().manualAuto }); });
    [el.cFollow, el.cTrace, el.cManual].forEach(function (c) { chips.appendChild(c); });

    var belt = n('div', 'hzh-sec', 'TOOLBELT');
    var grid = n('div', 'hzh-grid');
    grid.append(
      tile('⌕', 'Scan box', 'what is installed', async function () { var r = await run(SCAN, 60000); if (r && r.exitCode === 0) { lw('hzBoxFacts', String(r.stdout || '').trim().slice(0, 1500)); } }),
      tile('⚒', 'Dev tools', 'git python node', function () { return run(DEV, 900000); }),
      tile('↓', 'Download tools', 'yt-dlp ffmpeg aria2', function () { return run(B().installCommand(), 900000); }),
      tile('⧖', 'Recent jobs', 'results after restart', async function () {
        var p = B().plugin('HorizonTermux'); if (!p) throw new Error('Android app required'); var r = await p.jobs();
        window.HorizonTerminal.showOutput((r.jobs || []).map(function (j) { return j.id + ' · ' + j.status + (j.status === 'complete' ? ' · exit ' + j.exitCode : ''); }).join('\n') || 'No recent jobs');
      }),
      tile('■', 'Stop run', 'kill the live job', async function () { if (!(await B().kill())) B().notice('Nothing is running'); }),
      tile('⎘', 'Clear screen', 'terminal output', function () { window.HorizonTerminal.showOutput('screen cleared'); var o = document.querySelector('#hzTerm .hzt-out'); if (o) o.textContent = ''; })
    );
    el.facts = n('pre', 'hzh-facts');

    root.append(head, el.status, rail, aiHead, el.seg, el.modeTxt, view, chips, belt, grid, n('div', 'hzh-sec', 'BOX FACTS'), el.facts);
    host.insertBefore(root, host.firstChild); paint();
  }

  function setStep(b, state, sub) { b.classList.toggle('done', state === 'done'); b.classList.toggle('todo', state === 'todo'); b.setAttribute('aria-pressed', String(state === 'done')); b.querySelector('small').textContent = sub; }
  function paint() {
    if (!el.seg || !B()) return;
    var t = T(), tested = ls('hzTermTested', '0') === '1', native = !!B().plugin('HorizonTermux');
    setStep(el.s1, t.installed ? 'done' : 'todo', t.installed ? 'installed' : 'install it');
    setStep(el.s2, t.enabled ? 'done' : 'todo', t.enabled ? 'on' : 'off');
    setStep(el.s3, t.permission ? 'done' : 'todo', t.permission ? 'granted' : 'grant');
    setStep(el.s4, tested ? 'done' : 'todo', tested ? 'passed' : 'run test');
    var ready = native && t.installed && t.enabled && t.permission;
    el.led.textContent = !native ? 'app only' : ready ? (tested ? 'ready' : 'untested') : 'setup';
    el.led.className = 'hzh-led ' + (ready && tested ? 'on' : ready ? 'mid' : '');
    el.status.textContent = !native ? 'Android app required' : !t.installed ? 'Install standard Termux first' : !t.enabled ? 'Off' : !t.permission ? 'Grant Run commands permission' : 'Permission granted · Test verifies allow-external-apps in Termux';
    var m = mode();
    el.seg.classList.toggle('on', m !== 'off'); el.seg.setAttribute('aria-pressed', String(m !== 'off'));
    [].forEach.call(el.seg.children, function (b) { var on = b.dataset.mode === m; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); });
    el.modeTxt.textContent = MODES.filter(function (x) { return x[0] === m; })[0][2];
    function setChip(c, on, label) { c.textContent = (on ? '● ' : '○ ') + label; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); }
    setChip(el.cFollow, ls('hzTermFollow', 'open') === 'open', 'Open terminal when AI runs');
    setChip(el.cTrace, ls('hzTermTrace', '1') !== '0', 'Trace each command');
    setChip(el.cManual, !!t.manualAuto, 'My typing runs without popup');
    el.facts.textContent = ls('hzBoxFacts', '') || 'Not scanned yet. Tap Scan box so the AI knows what is installed.';
  }
  window.addEventListener('horizon-bridges-paint', paint);
  window.HorizonHub = { mount: mount, paint: paint };
})();
