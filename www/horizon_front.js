/* HORIZON V1.99.26 · front header. Three pinned rows, nothing in them scrolls:
   1) Menu (left) · HORIZON + Strategy Over Impulse (centre) · Settings (right)
   2) the provider pill, full width
   3) tiles: Termux, Group, GitHub (logo only), Vault, Music   (V1.99.71: Browser moved up next to the Menu tile, Termux took its slot)
   It only MOVES the existing elements and clicks the existing handlers, so every old behaviour keeps working.
   The GitHub row, the Vault row and the Music tile are hidden in the panels (CSS); their code stays so the tiles can open them.
   If anything it needs is missing it does nothing and the old header stays as it was. */
(function () {
  'use strict';
  var root = document.documentElement, header = document.querySelector('.app-header');
  if (!header || header.classList.contains('hzf') || !root.classList.contains('hzd-on')) return;
  var chip = header.querySelector('.chip-logo'), h1 = header.querySelector('.brand h1'), sub = header.querySelector('.hz-sub');
  var set = header.querySelector('.hzc-set'), top = header.querySelector('.hzd-top');
  if (!chip || !h1 || !set || !top) return;

  function el(tag, cls) { var n = document.createElement(tag); if (cls) n.className = cls; return n; }
  function tap(sel) { try { var b = typeof sel === 'string' ? document.querySelector(sel) : sel; if (b) b.click(); } catch (e) { /* a tile never throws */ } }
  function openApp(id) {
    if (window.HorizonAddons && typeof window.HorizonAddons.open === 'function') { try { window.HorizonAddons.open(id); return; } catch (e) { /* fall back to the old tile */ } }
    tap('.hz-app[data-addon="' + id + '"]');
  }
  var ICON = {
    browser: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/></svg>',
    group: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5.2a3 3 0 0 1 0 5.6M18 14.3c1.7.8 3 2.7 3 5.7"/></svg>',
    github: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.295-1.552 3.3-1.23 3.3-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>',
    vault: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><circle cx="12" cy="15.5" r="1.2" fill="currentColor"/></svg>',
    music: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V6l11-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/></svg>',
    term: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 9l3 3-3 3M13 15h4"/></svg>'
  };
  /* V1.99.71: Browser is now a small tile in the top row, right next to the Menu tile. */
  function hbtn(id, label, act) {
    var b = el('button', 'hzf-hb'); b.type = 'button'; b.id = 'hzfTile_' + id; b.setAttribute('aria-label', label); b.title = label;
    b.innerHTML = ICON[id]; b.addEventListener('click', act); return b;
  }
  function tile(id, label, act, iconOnly) {
    var b = el('button', 'hzf-tile' + (iconOnly ? ' hzf-logo' : '')); b.type = 'button'; b.id = 'hzfTile_' + id; b.setAttribute('aria-label', label);
    b.innerHTML = ICON[id] + (iconOnly ? '' : '<span>' + label + '</span>');
    b.addEventListener('click', act); return b;
  }
  var tiles = el('nav', 'hzf-tiles'); tiles.setAttribute('aria-label', 'Tools');
  /* V1.99.71: the Termux tile takes the old Browser slot. data-term-open is handled by horizon_terminal.js, so no click handler is needed here. */
  var termTile = tile('term', 'Termux', function () { /* opened by the data-term-open handler in horizon_terminal.js */ });
  termTile.setAttribute('data-term-open', ''); termTile.setAttribute('aria-label', 'Open Termux terminal');
  tiles.appendChild(termTile);
  var browserBtn = hbtn('browser', 'Browser', function () { tap('#hzbOpen'); });
  tiles.appendChild(tile('group', 'Group', function () { tap('#groupBtn'); }));
  tiles.appendChild(tile('github', 'GitHub', function () { openApp('github'); }, true));
  tiles.appendChild(tile('vault', 'Vault', function () { tap('#settingsBtn'); setTimeout(function () { tap('.set-row.set-vault'); }, 140); }));
  tiles.appendChild(tile('music', 'Music', function () { openApp('music'); }));

  var brand = el('div', 'hzf-brand'); brand.appendChild(h1); if (sub) brand.appendChild(sub);
  chip.classList.add('hzf-menu'); set.classList.add('hzf-set');
  header.classList.add('hzf');
  header.appendChild(chip); header.appendChild(browserBtn); header.appendChild(brand); header.appendChild(set); header.appendChild(top); header.appendChild(tiles);
  // The current header has its own Browser/Group tiles; discard replaced duplicates only.
  header.querySelectorAll(':scope > .hzc-sq:not(.hzc-set)').forEach(function (b) { b.remove(); });
  root.classList.add('hzf-on');
})();
