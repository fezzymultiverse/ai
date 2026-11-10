/* Release migration: obsolete layout preferences only. Chats, keys, Vault and audio stay intact. */
(function () {
  'use strict';
  var release = '1.92.3';
  window.HorizonRelease = release;
  try {
    ['horizon_door', 'hzShellOn', 'horizon_yt_instances', 'horizon_yt_discovered', 'horizon_yt_good'].forEach(function (key) { localStorage.removeItem(key); });
    // No clear(), no reload loop and no deletion of IndexedDB/private user data.
    if (localStorage.getItem('horizon_asset_release') !== release) {
      localStorage.setItem('horizon_asset_release', release);
      if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
        navigator.serviceWorker.getRegistrations().then(function (rows) {
          rows.forEach(function (row) {
            var script = row.active && row.active.scriptURL || row.waiting && row.waiting.scriptURL || '';
            if (/\/(?:horizon[-_]sw|service-worker|sw)\.js(?:[?#]|$)/.test(script)) row.unregister().catch(function () {});
          });
        }).catch(function () {});
      }
      if (window.caches) window.caches.keys().then(function (names) {
        return Promise.all(names.filter(function (name) { return /^horizon[-_:]/i.test(name); }).map(function (name) { return window.caches.delete(name); }));
      }).catch(function () {});
    }
  } catch (_) { /* Private mode/storage unavailable: bundled, versioned assets still work. */ }
  // V1.92.0 Lite mode: phones with <=4 GB RAM or <=6 cores drop glow shadows and blur (the costly paints). Override: localStorage hzLite = '0' (off) or '1' (on).
  try { var lite = localStorage.getItem('hzLite'); if (lite == null) lite = ((navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 6)) ? '1' : '0'; document.documentElement.classList.toggle('hz-lite', lite === '1'); } catch (_) { /* storage unavailable */ }
  function visibility() { document.documentElement.classList.toggle('hz-app-background', document.hidden); }
  document.addEventListener('visibilitychange', visibility);
  visibility();
})();
