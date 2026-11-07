/* HORIZON V1.38.0 · header theme pill. Light / Dark / Cyan in one tap.
   It clicks the real Theme option in Settings, so saving, the status-bar colour and everything else
   stays in one place. The pill only mirrors the current theme. */
(function () {
  'use strict';
  var pill = document.getElementById('hzThemePill');
  if (!pill) return;
  var btns = Array.prototype.slice.call(pill.querySelectorAll('[data-pill-theme]'));

  function current() {
    var t = document.documentElement.getAttribute('data-theme');
    return t === 'dark' || t === 'neon' ? t : 'light';
  }
  function paint() {
    var cur = current();
    btns.forEach(function (b) { b.setAttribute('aria-checked', String(b.getAttribute('data-pill-theme') === cur)); });
  }
  function pick(t) {
    var opt = document.querySelector('#themeMenu [data-theme-opt="' + t + '"]');
    if (opt) { opt.click(); }
    else {
      // Settings not built yet: set it directly so the tap still works.
      try { localStorage.setItem('horizon_theme', t); } catch (e) { /* storage full */ }
      if (t === 'light') document.documentElement.removeAttribute('data-theme');
      else document.documentElement.setAttribute('data-theme', t);
    }
    paint();
  }
  btns.forEach(function (b) { b.addEventListener('click', function () { pick(b.getAttribute('data-pill-theme')); }); });
  try { new MutationObserver(paint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] }); } catch (e) { /* no observer */ }
  // the row belongs to the Settings home view only: hide it while a section is open
  var row = document.getElementById('hzThemeRow'), home = document.getElementById('settingsHome');
  function syncRow() { if (row && home) row.hidden = home.hidden; }
  if (row && home) { try { new MutationObserver(syncRow).observe(home, { attributes: true, attributeFilter: ['hidden'] }); } catch (e) { /* no observer */ } syncRow(); }
  paint();
})();
