/* HORIZON V1.40.0 · Plus menu checks. HzPlus.paint({ rowId: [[ok, label, fixFn?], ...] }, bannerText)
   Draws live check chips under each tool row (green tick = ready, red cross = needs attention, tap to fix)
   and a summary in the menu header. */
(function () {
  'use strict';
  var lastKey = '';
  function chip(c) {
    var b = document.createElement(c[2] && !c[0] ? 'button' : 'span');
    if (b.tagName === 'BUTTON') b.type = 'button';
    b.className = 'tm-c ' + (c[0] ? 'ok' : 'no');
    b.textContent = (c[0] ? '\u2713 ' : '\u2717 ') + c[1];
    if (c[2] && !c[0]) b.addEventListener('click', function (e) { e.stopPropagation(); try { c[2](); } catch (x) { /* ignore */ } });
    return b;
  }
  function paint(map, banner) {
    var menu = document.getElementById('toolMenu');
    if (!menu) return;
    var key = JSON.stringify([banner || '', Object.keys(map).map(function (k) { return k + ':' + map[k].map(function (c) { return c[0] ? 1 : 0; }).join(''); })]);
    if (key === lastKey) return;
    lastKey = key;
    var bad = 0;
    Object.keys(map).forEach(function (id) {
      var row = document.getElementById('tm-' + id);
      if (!row) return;
      var host = row.querySelector('.tm-text');
      if (!host) return;
      var line = host.querySelector('.tm-chk');
      if (!line) { line = document.createElement('div'); line.className = 'tm-chk'; var pill = host.querySelector('.tm-pill'); if (pill) host.insertBefore(line, pill); else host.appendChild(line); }
      line.replaceChildren();
      var miss = 0;
      map[id].forEach(function (c) { if (!c[0]) miss++; line.appendChild(chip(c)); });
      row.classList.toggle('needs', miss > 0);
      if (miss) bad++;
    });
    var head = menu.querySelector('.tm-head');
    if (head) {
      var sum = head.querySelector('.tm-sum');
      if (!sum) { sum = document.createElement('em'); sum.className = 'tm-sum'; head.appendChild(sum); }
      sum.className = 'tm-sum' + (bad || banner ? ' warn' : '');
      sum.textContent = banner || (bad ? bad + ' need attention' : 'All checks pass');
    }
  }
  window.HzPlus = { paint: paint };
})();
