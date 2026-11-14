/* HORIZON V1.56.0 · header v2.
   1) Provider pill (status dot, provider logo, name). Tap = the AI sheet. horizon_door.js moves it into the header.
   2) "Set API key" tab on the AI sheet. It opens the key box inside the AI sheet.
   The provider data comes from window.HzPick / window.HzProviders, set by pkPaintBtn() in index.html. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var $ = function (id) { return document.getElementById(id); };

  function svgUse(sym, cls, vb) {
    var s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', vb || '0 0 24 24'); s.setAttribute('aria-hidden', 'true');
    if (cls) s.setAttribute('class', cls);
    var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + sym); s.appendChild(u);
    return s;
  }
  function el(tag, cls, txt) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (txt != null) e.textContent = txt;
    return e;
  }

  /* ---------- 1) provider pill ---------- */
  var header = document.querySelector('.app-header');
  var row = el('div', 'hz-prow'), pill = el('button', 'hz-ppill');
  pill.type = 'button'; pill.id = 'hzPill';
  pill.setAttribute('aria-haspopup', 'dialog');
  row.appendChild(pill);
  if (header && header.parentNode) header.parentNode.insertBefore(row, header.nextSibling);

  function paintPill() {
    var p = window.HzPick;
    if (!p) return;
    pill.classList.toggle('no-key', !p.ready);
    pill.replaceChildren();
    pill.appendChild(el('i', 'hz-st'));
    pill.appendChild(svgUse(p.icon, 'hz-lg'));
    pill.appendChild(el('span', 'hz-nm', p.name));
    /* V1.67.9: provider name only. The model shows on the reply. */
    pill.appendChild(svgUse('i-chev-d', 'hz-cv'));
    var lbl = 'Choose AI provider and model. Now: ' + p.name + (p.model ? ', ' + p.model : '') + (p.ready ? '' : '. No API key yet');
    pill.setAttribute('aria-label', lbl); pill.title = lbl;
  }
  pill.addEventListener('click', function () {
    var b = $('pickBtn');
    if (b) b.click();
  });

  /* ---------- 2) Set API key tab on the AI sheet ---------- */
  var top = document.querySelector('#pkSheet .pk-top'), closeBtn = $('pkClose');
  if (top && closeBtn) {
    var tab = el('button', 'pk-keytab'); tab.type = 'button'; tab.id = 'pkKeyTab';
    tab.appendChild(svgUse('i-key')); tab.appendChild(el('span', '', 'Set API key'));
    tab.setAttribute('aria-label', 'Set API key');
    tab.addEventListener('click', function () {
      /* V1.67.1: the key box is inside the AI sheet now (model step), so the tab jumps there instead of leaving for Settings */
      var id = window.HzPick && window.HzPick.id;
      if (window.HzPickKey) window.HzPickKey(id);
      else if (window.HzOpenKeys) window.HzOpenKeys(id);
    });
    top.insertBefore(tab, closeBtn);
    /* the key tab belongs on the provider list, not inside a model list */
    var back = $('pkBack');
    if (back) new MutationObserver(function () { tab.hidden = !back.hidden; }).observe(back, { attributes: true, attributeFilter: ['hidden'] });
  }

  /* privacy note on the key cards page */
  (function () {
    var body = document.querySelector('.tab-body[data-tab="providers"]');
    if (!body || body.querySelector('.hz-safe-note')) return;
    var n = el('div', 'hz-safe-note', 'Keys stay on this phone. They are only sent to the provider you pick.');
    body.insertBefore(n, body.firstChild);
  })();

  /* ---------- sync ---------- */
  function sync() { paintPill(); }
  document.addEventListener('hz:pick', sync);
  sync();
})();
