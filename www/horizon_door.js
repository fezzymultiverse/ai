/* Canonical header ownership. Legacy drawer and reload-based layout switching removed. */
(function () {
  'use strict';
  var root = document.documentElement;
  var header = document.querySelector('.app-header');
  try { localStorage.removeItem('horizon_door'); } catch (_) { /* no storage */ }
  if (!header) return;

  var $ = function (id) { return document.getElementById(id); };

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

  /* The edge drawer is gone. Menu, Settings, Browser and Group chat are header buttons (horizon_v2.js). */
})();
