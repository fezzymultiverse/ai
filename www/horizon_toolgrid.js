/* HORIZON V1.58.5 · Tools menu as a grid.
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
  var HINT = 'Tap a tool to switch it. Hold one to read more.';
  var strip = null, modeBtn = null, sel = null, held = false, timer = 0, sx = 0, sy = 0;

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
  function addPdf() {
    var row = document.getElementById('tm-pdf'), pb = document.getElementById('pdfBtn');
    if (!row || !pb || !row.classList.contains('is-on')) return;
    var b = el('button', 'hzg-go', 'Make PDF'); b.type = 'button';
    b.addEventListener('click', function (e) { e.stopPropagation(); pb.click(); });   // the real pill does the work
    strip.appendChild(b);
  }
  function idle() {
    if (!strip) return;
    strip.replaceChildren();
    strip.appendChild(el('span', 'hzg-d-t', HINT));
    addPdf();
  }
  function show(tile, mode) {   // mode 'hold' = description + status, 'tap' = status (or the description when there is none)
    if (!strip) return;
    var i = info(tile);
    strip.replaceChildren();
    strip.appendChild(el('b', null, i.title));
    var txt = mode === 'tap' ? (i.note || i.desc) : (i.note ? (i.desc ? i.desc + ' ' : '') + i.note : i.desc);
    strip.appendChild(el('span', 'hzg-d-t', txt));
    if (i.isRow) {
      // missing-item chips (keys and so on): the copies press the real chips, which stay in the tile
      tile.querySelectorAll('.tm-chk .tm-c').forEach(function (c) {
        var isBtn = c.tagName === 'BUTTON';
        var m = el(isBtn ? 'button' : 'span', c.className, c.textContent);
        if (isBtn) { m.type = 'button'; m.addEventListener('click', function (e) { e.stopPropagation(); c.click(); }); }
        strip.appendChild(m);
      });
    }
    if (tile.id === 'tm-pdf') addPdf();
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

  /* ---------------------------------------------------------------- grid / list chip */
  function setMode(grid) {
    menu.classList.toggle('hzg', grid);
    wr(KEY, grid ? 'grid' : 'list');
    if (modeBtn) { modeBtn.textContent = grid ? 'List view' : 'Grid view'; modeBtn.setAttribute('aria-pressed', grid ? 'false' : 'true'); }
    if (grid) idle();
  }
  var head = menu.querySelector('.tm-head');
  if (head) {
    modeBtn = el('button', 'hzg-mode', ''); modeBtn.type = 'button';
    modeBtn.addEventListener('click', function (e) { e.stopPropagation(); setMode(!isGrid()); });
    head.appendChild(modeBtn);
  }
  strip = el('div', 'hzg-detail'); strip.id = 'hzgDetail'; strip.setAttribute('role', 'status'); strip.setAttribute('aria-live', 'polite');
  menu.appendChild(strip);
  setMode(rd(KEY) !== 'list');

  // every time the menu opens or closes the strip starts fresh (this also refreshes the Make PDF button)
  if (window.MutationObserver) {
    new MutationObserver(function () { sel = null; held = false; cancel(); idle(); }).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  }
})();
