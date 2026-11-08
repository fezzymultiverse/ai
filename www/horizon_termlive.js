/* HORIZON V1.65.2 · Terminal, more alive.
   horizon_terminal.js calls attach() once when the terminal is built and boot() the first time it opens. Everything here only adds
   colour classes and short boot lines. It never changes the text of a line and never touches how a command runs. */
(function () {
  'use strict';
  function span(cls, txt) { var s = document.createElement('span'); s.className = cls; s.textContent = txt; return s; }
  function txt(t) { return document.createTextNode(t); }

  /* "fezzy@horizon ~/x $" -> user, @, host, folder and $ in their own colours */
  function promptFrag(text, trail) {
    var m = /^(\S+)@(\S+) (.+) \$\s*$/.exec(text);
    if (!m) return null;
    var f = document.createDocumentFragment();
    f.appendChild(span('hzt-u', m[1])); f.appendChild(span('hzt-at', '@')); f.appendChild(span('hzt-h', m[2]));
    f.appendChild(txt(' ')); f.appendChild(span('hzt-d', m[3])); f.appendChild(txt(' ')); f.appendChild(span('hzt-s', '$'));
    if (trail) f.appendChild(txt(' '));
    return f;
  }
  function promptify(line, p) {
    var f = promptFrag(p.textContent, true); if (!f) return;
    p.textContent = ''; p.appendChild(f);
    var nx = p.nextSibling;
    if (nx && nx.nodeType === 3) {   // the command you typed: first word bold white
      var m = /^(\s*)(\S+)([\s\S]*)$/.exec(nx.nodeValue);
      if (m) {
        line.removeChild(nx);
        if (m[1]) line.appendChild(txt(m[1]));
        line.appendChild(span('hzt-cmd', m[2]));
        if (m[3]) line.appendChild(txt(m[3]));
      }
    }
  }

  /* plain output lines get a colour only when the line STARTS like a message, so a file you cat is not painted by accident */
  var R_WARNX = /^\[(exit [1-9]\d*|timed out.*)\]$/;
  var R_ERR = /^(sh|\/?[\w.-]+): .*(not found|permission denied|no such file|inaccessible|cannot|can't|unable|fail)/i;
  var R_ERR2 = /^(error|fatal|e\/)\b/i;
  var R_WARN = /^(warn(ing)?|deprecated)\b/i;
  var R_OK = /^(\[ ?ok ?\]|ok\b|done\b|success|passed\b|installed\b|created\b|saved\b|completed\b)/i;
  var R_DIR = /^[^\s/][^\s]*\/$/;
  function plain(n) { for (var i = 0; i < n.classList.length; i++) { var c = n.classList[i]; if (c !== 'hzt-l' && c !== 'hzt-fresh') return false; } return true; }
  function classify(n) {
    if (!n.classList || !n.classList.contains('hzt-l')) return;
    var p = n.firstElementChild;
    if (p && p.classList.contains('hzt-p')) { promptify(n, p); return; }
    if (!plain(n)) return;
    var t = n.textContent; if (!t || t.length > 160) return;
    if (R_WARNX.test(t)) n.classList.add('hzt-c-warn');
    else if (R_ERR.test(t) || R_ERR2.test(t)) n.classList.add('hzt-err');
    else if (R_WARN.test(t)) n.classList.add('hzt-c-warn');
    else if (R_OK.test(t)) n.classList.add('hzt-c-ok');
    else if (R_DIR.test(t)) n.classList.add('hzt-c-dir');
  }

  function attach(el) {
    if (!el || !el.out || !window.MutationObserver) return;
    new MutationObserver(function (recs) {
      var added = [];
      recs.forEach(function (r) { r.addedNodes.forEach(function (n) { if (n.nodeType === 1) added.push(n); }); });
      var fade = added.length <= 40;   // a big dump (cat of a long file) appears at once, no 1000 fades
      added.forEach(function (n) {
        classify(n);
        if (fade && n.classList.contains('hzt-l') && !n.classList.contains('hzt-welcome') && !n.classList.contains('hzt-boot')) {
          n.classList.add('hzt-fresh'); setTimeout(function () { n.classList.remove('hzt-fresh'); }, 400);
        }
      });
    }).observe(el.out, { childList: true });
    if (el.ps) {
      var paint = function () {
        if (el.ps.firstElementChild && el.ps.firstElementChild.classList.contains('hzt-u')) return;
        var f = promptFrag(el.ps.textContent, false); if (!f) return;
        el.ps.textContent = ''; el.ps.appendChild(f);
      };
      new MutationObserver(paint).observe(el.ps, { childList: true, characterData: true, subtree: true });
      paint();
    }
  }

  /* a few boot lines before the welcome banner (about half a second) */
  function boot(out, isNative, done) {
    var reduce = false; try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* ignore */ }
    var rows = [
      ['ok', ' ok ', 'Bojack online'],
      isNative ? ['ok', ' ok ', 'shell ready  /system/bin/sh'] : ['warn', 'warn', 'preview mode: commands need the Horizon app'],
      ['ok', ' ok ', 'private folder, no root']
    ];
    var first = null, i = 0;
    function step() {
      if (first && !first.isConnected) return;   // the terminal was exited meanwhile
      if (i >= rows.length) { done(); return; }
      var r = rows[i++], d = document.createElement('div'); d.className = 'hzt-l hzt-boot';
      d.appendChild(txt('[')); d.appendChild(span('hzt-tag ' + r[0], r[1])); d.appendChild(txt('] ')); d.appendChild(span('hzt-boot-t', r[2]));
      out.appendChild(d); out.scrollTop = out.scrollHeight;
      if (!first) first = d;
      setTimeout(step, reduce ? 0 : 150);
    }
    step();
  }
  window.HorizonTermLive = { attach: attach, boot: boot };
})();
