/* HORIZON V1.85.0 · V14 typing indicator styles. Picks how the waiting animation looks in the thinking bubble:
   dots (default), Laser, orbiting diamond, terminal cursor. Stored on this phone only (horizon_ind). The look itself is CSS (horizon_ind.css),
   keyed on html[data-ind]. */
(function () {
  'use strict';
  var KEY = 'horizon_ind', OK = { dots: 1, laser: 1, orbit: 1, cursor: 1 };
  var NAMES = { dots: 'Dots', laser: 'Laser', orbit: 'Orbiting diamond', cursor: 'Terminal cursor' };
  function rd() { try { var v = localStorage.getItem(KEY); return OK[v] ? v : 'dots'; } catch (e) { return 'dots'; } }
  function wr(v) { try { localStorage.setItem(KEY, v); } catch (e) { /* storage blocked */ } }
  function paint() {
    var cur = rd();
    document.documentElement.setAttribute('data-ind', cur);
    var opts = document.querySelectorAll('#indMenu [data-ind-opt]');
    for (var i = 0; i < opts.length; i++) opts[i].setAttribute('aria-checked', String(opts[i].getAttribute('data-ind-opt') === cur));
    var s = document.getElementById('indStatus');
    if (s) s.textContent = 'Waiting animation: ' + NAMES[cur];
  }
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-ind-opt]');
    if (!b) return;
    var v = b.getAttribute('data-ind-opt');
    if (!OK[v]) return;
    wr(v); paint();
  });
  paint();
})();
