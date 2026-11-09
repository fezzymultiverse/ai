/* Release migration: obsolete layout preferences only. Chats, keys, Vault and audio stay intact. */
(function () {
  'use strict';
  var release = '1.89.0';
  window.HorizonRelease = release;
  try {
    ['horizon_door', 'hzShellOn'].forEach(function (key) { localStorage.removeItem(key); });
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
  function visibility() { document.documentElement.classList.toggle('hz-app-background', document.hidden); }
  document.addEventListener('visibilitychange', visibility);
  visibility();
})();
