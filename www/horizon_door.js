/* HORIZON V1.65.3 · edge door.
   A cyan door on the right edge of the header opens one compact drawer: Snooze, Group, Browser, Terminal,
   Github Push and Downloads, then Menu + Settings as a pair at the bottom. The drawer never re-implements anything: each tile clicks the real button or calls the
   real opener, so every existing handler keeps working. Tap the door or drag it; drag the drawer right (or tap outside) to close.
   Hardware Back closes it. Long-press the Horizon logo chip to switch between this layout and the old header (reloads). */
(function () {
  'use strict';
  var KEY = 'horizon_door', root = document.documentElement;
  function rd() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function wr(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } }
  var header = document.querySelector('.app-header');
  var chipEl = header && header.querySelector('.chip-logo');
  if (chipEl) {   // escape hatch, works in both layouts
    var lp = 0;
    chipEl.addEventListener('pointerdown', function () { lp = setTimeout(function () { wr(rd() === 'off' ? 'on' : 'off'); location.reload(); }, 800); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (n) { chipEl.addEventListener(n, function () { clearTimeout(lp); }); });
  }
  if (rd() === 'off' || !header) return;

  var NS = 'http://www.w3.org/2000/svg', $ = function (id) { return document.getElementById(id); };
  function ic(name) {
    return '<svg viewBox="0 0 24 24" aria-hidden="true">' + ({
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      sl: '<path d="M5 3v18M12 3v18M19 3v18M3 8h4M10 15h4M17 7h4"/>',
      moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
      users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.8a3.5 3.5 0 0 1 0 6.4M18 14.3c2.3.7 3.5 2.6 3.5 5.7"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
      term: '<path d="M4 5h16v14H4zM7.5 10l3 2.5-3 2.5M13 15h4"/>',
      gh: '<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>',
      dl: '<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',
      arr: '<path d="M9 5l7 7-7 7"/>'
    })[name] + '</svg>';
  }
  function click(sel) { var b = typeof sel === 'string' ? document.querySelector(sel) : sel; if (b) b.click(); }

  /* tiles: label, icon, colour, action. Each action calls the real thing. */
  var TOOLS = [
    ['Browser', 'globe', '#3d8bff', function () { click('#hzbOpen'); }],
    ['AI Group Chat', 'users', '#2bff88', function () { click('#groupBtn'); }]
  ];
  var PAIR = [['Settings', 'sl', function () { click('#settingsBtn'); }], ['Menu', 'menu', function () { click('#menuBtn'); }]];
  function tile(t, c, i, pair) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'hzd-t'; b.style.setProperty('--c', c);
    b.innerHTML = '<span class="ch">' + ic(i) + '</span>' + t; b.setAttribute('aria-label', t); return b;
  }

  /* move the provider pill into the header so the header is one row */
  var pill = $('hzPill'), prow = document.querySelector('.hz-prow');
  /* provider pill and usage badge sit side by side in the header (the badge used to live in the bottom row) */
  var badge = $('hzBadge');
  if (pill) {
    var top = document.createElement('div'); top.className = 'hzd-top';
    top.appendChild(pill); if (badge) top.appendChild(badge);
    header.appendChild(top); if (prow) prow.hidden = true;
  }
  root.classList.add('hzd-on');

  var scr = document.createElement('div'); scr.className = 'hzd-scrim';
  var dw = document.createElement('div'); dw.className = 'hzd-dw';
  var drw = document.createElement('div'); drw.className = 'hzd-drw'; drw.setAttribute('role', 'dialog'); drw.setAttribute('aria-label', 'Horizon menu');
  var brand = document.createElement('div'); brand.className = 'hzd-brand';
  brand.innerHTML = '<div><b>HORIZON</b><small>STRATEGY OVER IMPULSE</small></div>';
  var pair = document.createElement('div'); pair.className = 'hzd-pair';
  PAIR.forEach(function (p) { var b = tile(p[0], '#ff3b4e', p[1], true); b.addEventListener('click', function () { run(p[2]); }); pair.appendChild(b); });
  var sec = document.createElement('div'); sec.className = 'hzd-sec'; sec.textContent = 'Tools';
  TOOLS.forEach(function (t) {
    var b = tile(t[0], t[2], t[1]); b.addEventListener('click', function () { run(t[3]); }); drw.appendChild(b);
  });
  drw.appendChild(pair);   // Menu + Settings sit at the bottom
  var door = document.createElement('button'); door.type = 'button'; door.className = 'hzd-door';
  door.setAttribute('aria-label', 'Open menu'); door.innerHTML = ic('menu');
  dw.appendChild(drw); dw.appendChild(door);
  document.body.appendChild(scr); document.body.appendChild(dw);

  var W = 0, cur = 0, isOpen = false, after = null, popTimer = 0;
  function paint(x) {
    W = dw.offsetWidth; x = Math.max(0, Math.min(W, x)); cur = x;
    dw.style.setProperty('--x', x + 'px'); scr.style.opacity = W ? x / W : 0;
    var o = x > W * 0.5; scr.classList.toggle('on', o); dw.classList.toggle('open', o);
    door.setAttribute('aria-label', o ? 'Close menu' : 'Open menu');
  }
  function doOpen() {
    paint(dw.offsetWidth);
    if (!isOpen) { isOpen = true; var old = history.state || {}; history.pushState(Object.assign({}, old, { hzDoor: 1 }), ''); }
  }
  function visualClose() { dw.classList.remove('drag'); paint(0); isOpen = false; }
  function doClose(fn) {
    after = fn || null;
    if (isOpen && history.state && history.state.hzDoor) {
      visualClose(); history.back();
      popTimer = setTimeout(flush, 350);   // popstate normally gets there first
    } else { visualClose(); flush(); }
  }
  function flush() { clearTimeout(popTimer); var f = after; after = null; if (f) setTimeout(f, 0); }
  function run(fn) { doClose(fn); }
  window.addEventListener('popstate', function () { if (isOpen && !(history.state && history.state.hzDoor)) visualClose(); flush(); });
  scr.addEventListener('click', function () { doClose(); });

  /* drag: the door and the open drawer follow the finger; the Back swipe is not touched */
  var x0 = null, c0 = 0, moved = 0, fromDoor = false, grabbed = false;
  dw.addEventListener('pointerdown', function (e) {
    fromDoor = !!e.target.closest('.hzd-door');
    if (!fromDoor && cur <= 0) return;
    x0 = e.clientX; c0 = cur; moved = 0; grabbed = false;
  });
  dw.addEventListener('pointermove', function (e) {
    if (x0 === null) return; var dx = e.clientX - x0; moved = Math.max(moved, Math.abs(dx));
    if (moved < 6) return;
    if (!grabbed) {   // capture only once it is a real drag, so a plain tap on a tile still clicks the tile
      grabbed = true; dw.classList.add('drag');
      try { dw.setPointerCapture(e.pointerId); } catch (er) { /* no capture */ }
    }
    paint(c0 - dx);
  });
  function end() {
    if (x0 === null) return; x0 = null; dw.classList.remove('drag');
    if (moved < 6) { if (fromDoor) { cur < W * 0.5 ? doOpen() : doClose(); } }
    else if (cur > W * 0.4) doOpen(); else if (isOpen) doClose(); else paint(0);
  }
  dw.addEventListener('pointerup', end); dw.addEventListener('pointercancel', end);
  window.addEventListener('resize', function () { paint(isOpen ? dw.offsetWidth : 0); });

  paint(0);
  window.HorizonDoor = { open: doOpen, close: function () { doClose(); }, isOpen: function () { return isOpen; } };
})();
