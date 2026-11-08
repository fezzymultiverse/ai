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

  /* V1.67.0: the edge drawer is gone. Menu, Settings, Browser and Group chat are buttons in the header (horizon_v2.js). */
  window.HorizonDoor = { open: function () {}, close: function () {}, isOpen: function () { return false; } };
})();
