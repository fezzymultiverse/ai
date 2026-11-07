/* HORIZON V1.56.0 · header v2.
   1) Provider pill under the header (status dot, provider logo, name, model). Tap = the AI sheet.
   2) "Set API key" tab on the AI sheet. It opens Settings > API providers on the right card.
   3) SNOOZE screen: moon, robot with a 💤 on its head, provider logos, tagline. Tap anywhere to wake.
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
    if (p.model) pill.appendChild(el('span', 'hz-md', p.model));
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
      if (window.HzOpenKeys) window.HzOpenKeys(window.HzPick && window.HzPick.id);
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

  /* ---------- 3) snooze screen ---------- */
  var MOON = 'M20 14.5A8 8 0 1 1 9.5 4a6.2 6.2 0 0 0 10.5 10.5z';
  var snz = el('div', 'hz-snz'); snz.id = 'hzSnz';
  snz.setAttribute('role', 'button'); snz.setAttribute('tabindex', '0');
  snz.setAttribute('aria-label', 'Horizon is offline. Tap anywhere to wake');

  var stars = el('div', 'hz-stars'); stars.setAttribute('aria-hidden', 'true');
  for (var i = 0; i < 26; i++) {
    var st = document.createElement('i');
    st.style.left = (Math.random() * 100).toFixed(1) + '%';
    st.style.top = (Math.random() * 100).toFixed(1) + '%';
    st.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
    stars.appendChild(st);
  }
  snz.appendChild(stars);

  var moon = el('div', 'hz-snz-moon');
  var ms = document.createElementNS(NS, 'svg'); ms.setAttribute('viewBox', '0 0 24 24'); ms.setAttribute('aria-hidden', 'true');
  var mp = document.createElementNS(NS, 'path'); mp.setAttribute('d', MOON); ms.appendChild(mp); moon.appendChild(ms);
  snz.appendChild(moon);

  var bot = el('div', 'hz-snz-bot');
  bot.appendChild(svgUse('i-robot', '', '0 0 64 64'));
  var zz = el('span', 'zzr', '💤'); zz.setAttribute('aria-hidden', 'true'); bot.appendChild(zz);
  snz.appendChild(bot);

  var prov = el('div', 'hz-snz-prov'); prov.setAttribute('role', 'group'); prov.setAttribute('aria-label', 'AI providers');
  snz.appendChild(prov);
  snz.appendChild(el('h2', '', 'HORIZON OFFLINE'));
  snz.appendChild(el('div', 'tg', 'Strategy Over Impulse'));
  var stt = el('div', 'stt');
  [['Network'], ['Permissions']].forEach(function (a) {
    var s = el('span', '', a[0] + ' '); s.appendChild(el('b', '', 'OFF')); stt.appendChild(s);
  });
  snz.appendChild(stt);
  var wake = el('button', 'wake', 'TAP TO WAKE'); wake.type = 'button'; snz.appendChild(wake);
  document.body.appendChild(snz);

  function paintProv() {
    var list = window.HzProviders || [], act = window.HzPick && window.HzPick.id;
    prov.replaceChildren();
    list.forEach(function (p) {
      var s = svgUse(p.icon, p.id === act ? 'on' : '');
      var t = document.createElementNS(NS, 'title'); t.textContent = p.name; s.insertBefore(t, s.firstChild);
      prov.appendChild(s);
    });
  }

  function wakeUp(e) {
    if (e) e.preventDefault();
    var b = $('snoozeBtn');
    if (b && !b.disabled) b.click();
  }
  snz.addEventListener('click', wakeUp);
  snz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') wakeUp(e); });

  /* ---------- sync ---------- */
  function sync() { paintPill(); paintProv(); }
  document.addEventListener('hz:pick', sync);
  sync();
})();
