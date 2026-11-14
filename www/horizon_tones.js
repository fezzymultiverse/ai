/* HORIZON V1.93.29 · Notification tones. A Settings > Personalisation card that lets each kind of notification
   (AI replies, check-ins, calendar reminders) use its own sound: the phone default, silent, or any notification sound
   the phone already has. Android only: the card is added when the native HorizonAI plugin answers, and never appears in a browser.
   The choice is kept natively (see HorizonNotify.kt); this file only paints and calls toneList, toneSet, tonePreview, notifyTest. */
(function () {
  'use strict';
  var CATS = [
    { id: 'alert', name: 'AI replies', sub: 'Horizon finished a reply while you were away' },
    { id: 'checkin', name: 'Check-ins', sub: 'Horizon messages you on its own' },
    { id: 'remind', name: 'Reminders', sub: 'Calendar reminders on the minute' }
  ];
  var state = { tones: [], alert: 'default', checkin: 'default', remind: 'default' };
  var openCat = '', card = null, statusEl = null, listEl = null, catsEl = null, loaded = false;

  function plugin() {
    var C = window.Capacitor;
    return C && C.Plugins && C.Plugins.HorizonAI ? C.Plugins.HorizonAI : null;
  }
  function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
  function say(t) { if (statusEl) statusEl.textContent = t; }
  function nameOf(tone) {
    if (tone === 'default') return 'Phone default';
    if (tone === 'silent') return 'Silent';
    for (var i = 0; i < state.tones.length; i++) if (state.tones[i].uri === tone) return state.tones[i].title;
    return 'Custom sound';
  }
  function catOf(id) { for (var i = 0; i < CATS.length; i++) if (CATS[i].id === id) return CATS[i]; return null; }

  function paintCats() {
    catsEl.replaceChildren();
    CATS.forEach(function (c) {
      var b = el('button', 'hzt-cat' + (openCat === c.id ? ' on' : ''));
      b.type = 'button'; b.setAttribute('data-cat', c.id); b.setAttribute('aria-expanded', String(openCat === c.id));
      var tx = el('span', 'hzt-tx');
      tx.appendChild(el('b', null, c.name));
      tx.appendChild(el('small', null, nameOf(state[c.id])));
      b.appendChild(tx);
      b.appendChild(el('span', 'hzt-go', openCat === c.id ? 'Close' : 'Change'));
      catsEl.appendChild(b);
    });
  }

  function paintList() {
    listEl.replaceChildren();
    listEl.hidden = !openCat;
    if (!openCat) return;
    var cat = catOf(openCat);
    listEl.setAttribute('aria-label', cat.name + ' tone');
    listEl.appendChild(el('p', 'hzt-h', cat.name + ': ' + cat.sub));
    var rows = [{ tone: 'default', title: 'Phone default' }, { tone: 'silent', title: 'Silent' }];
    state.tones.forEach(function (t) { rows.push({ tone: t.uri, title: t.title }); });
    rows.forEach(function (r) {
      var b = el('button', 'hzt-opt', r.title);
      b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('data-tone', r.tone);
      b.setAttribute('aria-checked', String(state[openCat] === r.tone));
      listEl.appendChild(b);
    });
  }

  function paint() { paintCats(); paintList(); }

  function pick(tone) {
    var p = plugin(), cat = openCat;
    if (!p || !cat) return;
    p.toneSet({ cat: cat, tone: tone }).then(function () {
      state[cat] = tone;
      paint();
      say(catOf(cat).name + ': ' + nameOf(tone));
      if (tone !== 'silent') { try { p.tonePreview({ tone: tone }); } catch (e) { /* preview is a courtesy */ } }
    }).catch(function (e) { say((e && e.message) || 'That tone could not be saved.'); });
  }

  function onClick(e) {
    var t = e.target;
    var cb = t.closest ? t.closest('.hzt-cat') : null;
    if (cb) {
      var id = cb.getAttribute('data-cat');
      openCat = openCat === id ? '' : id;
      paint();
      return;
    }
    var ob = t.closest ? t.closest('.hzt-opt') : null;
    if (ob) { pick(ob.getAttribute('data-tone')); return; }
    var tb = t.closest ? t.closest('#hztTest') : null;
    if (tb) {
      var p = plugin();
      if (!p) return;
      p.notifyTest({}).then(function (r) { say(r && r.shown ? 'Test sent. Switch to your home screen to hear it.' : 'Notifications are off for Horizon.'); })
        .catch(function (x) { say((x && x.message) || 'The test did not work.'); });
    }
  }

  function load() {
    var p = plugin();
    if (!p) return;
    p.toneList({}).then(function (r) {
      r = r || {};
      state.tones = Array.isArray(r.tones) ? r.tones : [];
      state.alert = r.alert || 'default'; state.checkin = r.checkin || 'default'; state.remind = r.remind || 'default';
      loaded = true; paint();
      say(state.tones.length ? 'Pick a sound for each kind of notification' : 'This phone did not list its sounds. Default and Silent still work.');
    }).catch(function () { say('Update the Android app to change notification tones.'); });
  }

  function build() {
    if (card || !plugin()) return;
    var panel = document.querySelector('.tab-body[data-tab="personalisation"]');
    if (!panel) return;
    card = el('section', 'provider-card'); card.id = 'toneCard';
    var head = el('div', 'settings-row-header'), content = el('div', 'settings-row-content');
    var h3 = el('h3');
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#i-bell'); svg.appendChild(use);
    h3.appendChild(svg); h3.appendChild(document.createTextNode(' Notification tones'));
    statusEl = el('p', null, 'Loading the sounds on this phone');
    statusEl.id = 'toneStatus';
    content.appendChild(h3); content.appendChild(statusEl); head.appendChild(content); card.appendChild(head);
    catsEl = el('div', 'hzt-cats');
    listEl = el('div', 'hzt-list'); listEl.setAttribute('role', 'radiogroup'); listEl.hidden = true;
    card.appendChild(catsEl); card.appendChild(listEl);
    card.appendChild(el('p', 'hint', 'Tap a sound to hear it. Silent still shows the notification, it just makes no noise. Sounds come from your phone.'));
    var row = el('div', 'hzo-row'), tb = el('button', 'use-btn', 'Send a test pop-up');
    tb.type = 'button'; tb.id = 'hztTest'; row.appendChild(tb); card.appendChild(row);
    card.addEventListener('click', onClick);
    panel.appendChild(card);
    paint();
    load();
  }

  function boot() {
    build();
    if (card) return;
    // The native bridge can be ready a moment after the page: try again when Personalisation is opened.
    document.addEventListener('click', function again(e) {
      var b = e.target.closest ? e.target.closest('[data-tab="personalisation"]') : null;
      if (!b) return;
      build();
      if (card) document.removeEventListener('click', again);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
  window.HzTones = { reload: function () { if (card) load(); }, loaded: function () { return loaded; } };
})();
