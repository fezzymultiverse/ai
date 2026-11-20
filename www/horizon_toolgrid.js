/* HORIZON V1.99.25 · the bottom strip of the Tools menu now holds People + Horizon ID on the left and an Add chat button on the far right
   (multicolour ring). The old tap-and-hold hint pill is gone. Hold or tap a tile and its description opens
   inside the same strip, above the People row; Make PDF sits in the row while PDF is on. horizon_people.js fills #hzgDockL / #hzgDockR.
   HORIZON V1.99.14 · tools that are ON glow neon green (#2bff88, same as the "i"), OFF is white with black text.
   V1.58.5 · Tools menu as a grid.
   The + menu shows every tool at once as tiles: Generators (Avatars, Memes, Visuals), then Think and look, Fetch, Make and Remember.
   Tap a tile to switch it (the existing switch code runs untouched). Hold a tile to read its description and status in the strip at the
   bottom. The strip also repeats a tool's missing-item chips (keys and so on) and shows Make PDF while PDF is on.
   The layout itself is CSS scoped to #toolMenu.hzg. The List view chip in the menu header removes that class and brings the old list
   back; the choice is remembered on this phone. */
(function () {
  'use strict';
  var KEY = 'horizon_toolgrid';   // 'list' = the old list; anything else = the grid
  var menu = document.getElementById('toolMenu');
  if (!menu) return;
  var HOLD_MS = 450, MOVE_PX = 10;
  var strip = null, info$ = null, dockPdf = null, sel = null, held = false, timer = 0, sx = 0, sy = 0;

  function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function isGrid() { return menu.classList.contains('hzg'); }
  function tileOf(t) { return t && t.closest ? t.closest('#toolMenu .tm-row, #toolMenu .hzcr-tool') : null; }

  /* ---------------------------------------------------------------- what a tile says */
  function info(tile) {
    var isRow = tile.classList.contains('tm-row'), title = '', desc = '', note = '';
    if (isRow) {
      var h = tile.querySelector('h4');
      title = h ? h.textContent : '';
      tile.querySelectorAll('.tm-text > p').forEach(function (p) {
        if (p.classList.contains('tm-note')) note = p.textContent.trim();
        else if (!desc) desc = p.textContent.trim();
      });
    } else {
      var l = tile.querySelector('.hzcr-tool-l'), d = tile.querySelector('.hzcr-tool-d');
      title = l ? l.textContent : '';
      desc = d ? d.textContent.trim() : '';
    }
    return { title: title, desc: desc, note: note, isRow: isRow };
  }
  function pdfOn() {
    var row = document.getElementById('tm-pdf'), pb = document.getElementById('pdfBtn');
    return !!(row && pb && row.classList.contains('is-on'));
  }
  function pressPdf(e) { e.stopPropagation(); var pb = document.getElementById('pdfBtn'); if (pb) pb.click(); }   // the real pill does the work
  function addPdf() {
    if (!pdfOn()) return;
    var b = el('button', 'hzg-go', 'Make PDF'); b.type = 'button';
    b.addEventListener('click', pressPdf);
    info$.appendChild(b);
  }
  function syncDock() {   // the row copy of Make PDF shows while PDF is on, unless the description above already carries one
    if (dockPdf) dockPdf.hidden = !(pdfOn() && !info$.querySelector('.hzg-go'));
  }
  function idle() {
    if (!strip) return;
    info$.replaceChildren(); info$.hidden = true;
    syncDock();
  }
  function show(tile, mode) {   // mode 'hold' = description + status, 'tap' = status (or the description when there is none)
    if (!strip) return;
    var i = info(tile);
    info$.replaceChildren(); info$.hidden = false;
    info$.appendChild(el('b', null, i.title));
    var txt = mode === 'tap' ? (i.note || i.desc) : (i.note ? (i.desc ? i.desc + ' ' : '') + i.note : i.desc);
    info$.appendChild(el('span', 'hzg-d-t', txt));
    if (i.isRow) {
      // missing-item chips (keys and so on): the copies press the real chips, which stay in the tile
      tile.querySelectorAll('.tm-chk .tm-c').forEach(function (c) {
        var isBtn = c.tagName === 'BUTTON';
        var m = el(isBtn ? 'button' : 'span', c.className, c.textContent);
        if (isBtn) { m.type = 'button'; m.addEventListener('click', function (e) { e.stopPropagation(); c.click(); }); }
        info$.appendChild(m);
      });
    }
    if (tile.id === 'tm-pdf') addPdf();
    syncDock();
  }
  function afterTap(t) {
    sel = t;
    setTimeout(function () { if (sel === t) show(t, 'tap'); }, 160);   // the switch code repaints the status first
    setTimeout(function () { if (sel === t) show(t, 'tap'); }, 700);   // slower switches (prompts, lookups) settle later
  }

  /* ---------------------------------------------------------------- hold to read, tap to switch */
  function cancel() { if (timer) { clearTimeout(timer); timer = 0; } }
  menu.addEventListener('pointerdown', function (e) {
    held = false; cancel();
    if (!isGrid()) return;
    var t = tileOf(e.target);
    if (!t) return;
    sx = e.clientX; sy = e.clientY;
    timer = setTimeout(function () {
      timer = 0; held = true; sel = t; show(t, 'hold');
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (x) { /* no vibration */ }
    }, HOLD_MS);
  }, { passive: true });
  menu.addEventListener('pointermove', function (e) {
    if (timer && (Math.abs(e.clientX - sx) > MOVE_PX || Math.abs(e.clientY - sy) > MOVE_PX)) cancel();
  }, { passive: true });
  menu.addEventListener('pointerup', cancel, { passive: true });
  menu.addEventListener('pointercancel', cancel, { passive: true });
  menu.addEventListener('contextmenu', function (e) { if (isGrid() && tileOf(e.target)) e.preventDefault(); });
  // capture phase: runs before the tile's own handler, so a hold never also flips the switch
  menu.addEventListener('click', function (e) {
    if (!isGrid()) return;
    if (held) { held = false; e.stopPropagation(); e.preventDefault(); return; }
    var t = tileOf(e.target);
    if (t && t.classList.contains('tm-row')) afterTap(t);
  }, true);
  menu.addEventListener('keydown', function (e) {
    if (!isGrid() || (e.key !== 'Enter' && e.key !== ' ')) return;
    var t = tileOf(e.target);
    if (t && t.classList.contains('tm-row')) afterTap(t);
  }, true);

  /* ---------------------------------------------------------------- short description under each tile name (V1.92.3) */
  var SHORT = {
    'tm-web': 'Search the web and read pages.',
    'tm-gh': 'The AI reads the repos you pulled.',
    'tm-music': 'The AI sees and controls the player.'
  };
  Object.keys(SHORT).forEach(function (id) {
    var row = document.getElementById(id), tx = row && row.querySelector('.tm-text');
    if (tx && !tx.querySelector('.hzg-sd')) tx.appendChild(el('span', 'hzg-sd', SHORT[id]));
  });

  /* ---------------------------------------------------------------- V1.99.13 neon green when on */
  (function () {
    if (document.getElementById('hzgGreenStyle')) return;
    var st = document.createElement('style'); st.id = 'hzgGreenStyle'; st.textContent = '#toolMenu .tm-row.is-on{border-color:#2bff88!important;background:rgba(43,255,136,.10)!important;box-shadow:0 0 12px rgba(43,255,136,.45),inset 0 0 0 1px rgba(43,255,136,.35)!important}#toolMenu .tm-row.is-on h4{color:#2bff88!important;text-shadow:0 0 8px rgba(43,255,136,.55)}#toolMenu .tm-row.is-off{background:#fff!important;border-color:#cbd5e1!important;box-shadow:none!important}#toolMenu .tm-row.is-off .tm-text,#toolMenu .tm-row.is-off .tm-text *{color:#000!important;opacity:1!important;text-shadow:none!important}#toolMenu .tm-row.is-off svg{color:#000}html[data-theme="grey"] #toolMenu .tm-row.is-on .tm-text,html[data-theme="grey"] #toolMenu .tm-row.is-on .tm-text *{color:#000!important;text-shadow:none!important}';
    (document.head || document.documentElement).appendChild(st);
  })();

  /* ---------------------------------------------------------------- grid / list chip */
  /* V1.99.124 · the Grid view / List view chip is removed. The menu is always the grid. */
  function setMode(grid) {
    menu.classList.toggle('hzg', grid);
    wr(KEY, 'grid');
    if (grid) idle();
  }
  /* V1.99.25 · the strip = description area (hidden until you hold or tap a tile) + the dock row: [People][Horizon ID] .... [Make PDF][+ Add chat].
     horizon_people.js puts its own buttons into #hzgDockL and #hzgDockR (it finds them by id), so People keeps all its logic untouched. */
  strip = el('div', 'hzg-detail'); strip.id = 'hzgDetail';
  info$ = el('div', 'hzg-info'); info$.id = 'hzgInfo'; info$.hidden = true; info$.setAttribute('role', 'status'); info$.setAttribute('aria-live', 'polite');
  /* V1.99.124 · approved permissions (every switch in Settings > Permissions that is ON) are listed above People. */
  var permBox = el('div', 'hzg-perms'); permBox.id = 'hzgPerms'; permBox.hidden = true; permBox.setAttribute('aria-label', 'Approved permissions');
  var permSig = '';
  function paintPerms() {
    var hp = window.HzPerms, list = hp && hp.list, st = hp && hp.state, names = [];
    if (list && st) list.forEach(function (p) { if (st[p.id] === true) names.push(p.name); });
    var sig = names.join('|');
    if (sig === permSig) return;
    permSig = sig; permBox.replaceChildren();
    if (!names.length) { permBox.hidden = true; return; }
    permBox.appendChild(el('b', 'hzg-perms-t', 'Permissions'));
    var wrap = el('div', 'hzg-perms-l');
    names.forEach(function (n) { wrap.appendChild(el('span', 'hzg-perm-chip', n)); });
    permBox.appendChild(wrap); permBox.hidden = false;
  }
  function refreshPerms() { try { if (window.HzPerms) window.HzPerms.refresh(); } catch (e) { /* status read failed; keep last list */ } paintPerms(); setTimeout(paintPerms, 400); setTimeout(paintPerms, 1500); }
  var dock = el('div', 'hzg-dock'); dock.id = 'hzgDock';
  var dockL = el('div', 'hzg-dock-l'); dockL.id = 'hzgDockL';
  var dockR = el('div', 'hzg-dock-r'); dockR.id = 'hzgDockR';
  /* V1.99.34: no Make PDF in the dock row. It only appears in the description area when you hold the PDF tile. */
  dock.appendChild(dockL); dock.appendChild(dockR);
  strip.appendChild(info$); strip.appendChild(permBox); strip.appendChild(dock);
  var contactsRow = el('div', 'hzg-dock'); contactsRow.id = 'hzgContactsRow';
  var contactsBtn = el('button', 'hzp-launch-btn', 'Contacts'); contactsBtn.type = 'button';
  contactsBtn.id = 'contactsBtn'; contactsBtn.setAttribute('aria-label', 'Contacts');
  contactsBtn.onclick = function () { if (window.HorizonContacts) window.HorizonContacts.open(); };
  contactsRow.appendChild(contactsBtn); strip.appendChild(contactsRow);
  menu.appendChild(strip);
  paintPerms();
  (function () {
    var pl = document.getElementById('permList');
    if (pl && window.MutationObserver) new MutationObserver(paintPerms).observe(pl, { subtree: true, attributes: true, attributeFilter: ['class'] });
  })();
  try { if (window.HorizonPeople && window.HorizonPeople.dock) window.HorizonPeople.dock(); } catch (e) { /* People mounts itself when it starts */ }
  setMode(rd(KEY) !== 'list');

  // every time the menu opens or closes the strip starts fresh (this also refreshes the Make PDF button)
  if (window.MutationObserver) {
    new MutationObserver(function () { sel = null; held = false; cancel(); idle(); if (!menu.hidden) refreshPerms(); }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  }
})();

/* HORIZON V1.99.13 · the top-right Settings tile (#settingsBtn) is the same size as the top-left Menu tile (#menuBtn).
   It measures the Menu tile and copies width, height, corner radius and icon size, so the two stay matched on every screen. */
(function () {
  'use strict';
  var a = document.getElementById('menuBtn'), b = document.getElementById('settingsBtn');
  if (!a || !b) return;
  function sync() {
    try {
      var r = a.getBoundingClientRect(); if (!r.width || !r.height) return;
      var cs = window.getComputedStyle(a), w = Math.round(r.width) + 'px', h = Math.round(r.height) + 'px';
      ['width', 'minWidth', 'maxWidth'].forEach(function (k) { b.style[k] = w; });
      ['height', 'minHeight', 'maxHeight'].forEach(function (k) { b.style[k] = h; });
      b.style.flex = '0 0 auto'; b.style.borderRadius = cs.borderRadius;
      var ia = a.querySelector('svg'), ib = b.querySelector('svg');
      if (ia && ib) { var ir = ia.getBoundingClientRect(); if (ir.width) { ib.style.width = Math.round(ir.width) + 'px'; ib.style.height = Math.round(ir.height) + 'px'; } }
    } catch (e) { /* cosmetic only */ }
  }
  sync();
  try { if (window.ResizeObserver) new ResizeObserver(sync).observe(a); } catch (e) { /* optional */ }
  window.addEventListener('resize', sync);
  window.addEventListener('load', sync);
})();
