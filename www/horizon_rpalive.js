/* V1.99.104 · right panel "alive" pass (additive). Adds an icon chip to every Menu row and live status pills for
   API keys, Web and Vault. Reads state only (localStorage + HorizonVault.isLocked); changes nothing. */
(function () {
  'use strict';
  var home = document.getElementById('settingsHome'), panel = document.getElementById('rightPanel');
  if (!home || !panel) return;
  var ICON = { chats: 'i-chat', promptmem: 'i-brain', archive: 'i-folder', providers: 'i-key', web: 'i-globe', permissions: 'i-eye', personalisation: 'i-sliders', vault: 'i-vault', security: 'i-shield' };
  var PILL = { providers: 1, web: 1, vault: 1 };
  var NS = 'http://www.w3.org/2000/svg';
  function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsKeys() { var o = []; try { for (var i = 0; i < localStorage.length; i++) o.push(localStorage.key(i)); } catch (e) { } return o; }
  function keyOf(row) { return row.dataset.tab || (row.id === 'hzLeftGh' ? 'github' : row.id === 'hzDockRow' ? 'about' : ''); }
  function svg(id) {
    var s = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use');
    s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
  }
  function dress() {
    var rows = home.querySelectorAll(':scope > .set-row');
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]; if (row.classList.contains('rpa')) continue;
      var k = keyOf(row); if (!k) continue;
      var id = ICON[k], old = row.querySelector(':scope > .set-ic use');
      if (!id && old) id = (old.getAttribute('href') || '').replace('#', '');
      if (!id) continue;
      var chip = document.createElement('span'); chip.className = 'rpa-chip'; chip.appendChild(svg(id));
      row.insertBefore(chip, row.firstChild);
      if (PILL[k]) { var p = document.createElement('span'); p.className = 'rpa-st'; p.hidden = true; p.dataset.pill = k; row.insertBefore(p, row.querySelector(':scope > .set-chev')); }
      row.dataset.rpa = k; row.style.setProperty('--rpa-i', i); row.classList.add('rpa');
    }
  }
  function setPill(k, text, cls) {
    var p = home.querySelector('.rpa-st[data-pill="' + k + '"]'); if (!p) return;
    if (!text) { p.hidden = true; return; }
    p.hidden = false; p.textContent = text; p.className = 'rpa-st' + (cls ? ' ' + cls : '');
  }
  function update() {
    var keys = lsKeys(), n = 0, live = false;
    keys.forEach(function (k) { if (k.indexOf('horizon_key_') === 0 && ls(k)) n++; });
    setPill('providers', n ? n + (n === 1 ? ' key' : ' keys') : 'No keys', n ? '' : 'is-off');
    var master = ls('horizon_web_master') !== '0';
    keys.forEach(function (k) { if (k.indexOf('horizon_webkey_') === 0 && ls(k) && ls('horizon_webon_' + k.slice(15)) !== '0') live = true; });
    if (!master) setPill('web', 'Web off', 'is-off'); else if (live) setPill('web', 'Web on', 'is-live'); else setPill('web', 'No key', 'is-off');
    var V = window.HorizonVault;
    if (V && typeof V.isLocked === 'function') { var lk = V.isLocked(); setPill('vault', lk ? 'Locked' : 'Open', lk ? '' : 'is-live'); } else setPill('vault', '');
  }
  function all() { dress(); update(); }
  all();
  if (window.MutationObserver) {
    new MutationObserver(all).observe(home, { childList: true });
    new MutationObserver(update).observe(home, { attributes: true, attributeFilter: ['hidden'] });
    new MutationObserver(update).observe(panel, { attributes: true, attributeFilter: ['class'] });
  }
  window.addEventListener('storage', update);
  window.HorizonRpAlive = { refresh: all };
})();
