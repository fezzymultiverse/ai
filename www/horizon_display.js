/* V1.93.9 · Personalisation: Screen size (Normal / Bigger) and Refresh rate (Auto / 30 / 60 / 90 Hz).
   Both need Android itself, so the work is done by the HorizonDisplay plugin; this file is only the two cards. */
(function () {
  'use strict';
  var KEY_HZ = 'hz_refresh';
  var info = null, sizeCard = null, rateCard = null, busy = false;
  function plugin() {
    var c = window.Capacitor;
    return (c && c.isNativePlatform && c.isNativePlatform() && c.Plugins && c.Plugins.HorizonDisplay) || null;
  }
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function node(t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
  function say(sub, bad) {
    if (window.HzToast) HzToast.show({ icon: 'i-spark', title: 'Personalisation', sub: sub, kind: bad ? 'bad' : '' });
  }
  function option(group, val, title, sub, onPick) {
    var b = node('button', 'theme-opt'), tx = node('span', 'to-tx');
    b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', 'false');
    b.dataset.hzDisplayOpt = group + ':' + val;
    tx.append(node('b', '', title), node('small', '', sub));
    b.appendChild(tx);
    b.addEventListener('click', function () {
      Promise.resolve().then(function () { return onPick(val); }).catch(function (e) { say(e && e.message ? e.message : String(e), true); });
    });
    return b;
  }
  function card(id, title, status) {
    var s = node('section', 'provider-card'), h = node('div', 'settings-row-header'), c = node('div', 'settings-row-content');
    s.id = id;
    var h3 = node('h3', '', title), p = node('p', '', status);
    p.id = id + 'Status';
    c.append(h3, p); h.appendChild(c); s.appendChild(h);
    var list = node('div', 'theme-list'); list.setAttribute('role', 'radiogroup'); list.setAttribute('aria-label', title);
    s.appendChild(list);
    return { el: s, list: list, status: p };
  }
  function mark(c, key) {
    c.list.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(b.dataset.hzDisplayOpt === key)); });
  }
  function setDisabled(b, off) { if (b) { b.setAttribute('aria-disabled', String(!!off)); } }
  function paint() {
    var p = plugin();
    if (sizeCard) {
      var big = info && info.pct > 100;
      mark(sizeCard, 'size:' + (big ? 'big' : 'normal'));
      var bb = sizeCard.list.querySelector('[data-hz-display-opt="size:big"]');
      var nb = sizeCard.list.querySelector('[data-hz-display-opt="size:normal"]');
      if (!p) {
        sizeCard.status.textContent = 'Needs the Android app. A browser keeps its own zoom.';
        setDisabled(bb, true); setDisabled(nb, true);
      } else if (info) {
        sizeCard.status.textContent = 'Your screen is ' + info.pxWide + ' px wide. Bigger makes everything larger and still fits.';
        nb.querySelector('small').textContent = info.normalDp + ' dp wide · the usual size';
        var can = info.bigPct > 100;
        bb.querySelector('small').textContent = can
          ? info.bigDp + ' dp wide · ' + (info.bigPct - 100) + '% larger, and nothing gets squeezed'
          : 'Your screen is already at the narrowest width that fits';
        setDisabled(bb, !can);
      }
    }
    if (rateCard) {
      var saved = Number(lsg(KEY_HZ) || 0);
      mark(rateCard, 'rate:' + saved);
      if (!p) {
        rateCard.status.textContent = 'Needs the Android app.';
        rateCard.list.querySelectorAll('button').forEach(function (b) { setDisabled(b, true); });
      } else if (info) {
        rateCard.status.textContent = 'Running at ' + info.current + ' Hz now. This screen offers ' + info.supported.join(', ') + ' Hz.';
        rateCard.list.querySelectorAll('button').forEach(function (b) {
          var hz = Number(b.dataset.hzDisplayOpt.split(':')[1]);
          if (!hz) return;
          var ok = info.supported.indexOf(hz) !== -1;
          b.querySelector('small').textContent = ok ? 'Offered by this screen' : 'Not a mode on this screen, Android picks the closest';
        });
      }
    }
  }
  async function refresh() {
    var p = plugin();
    if (p) { try { info = await p.info(); } catch (e) { info = null; } }
    paint();
  }
  async function pickSize(val) {
    var p = plugin();
    if (!p) throw new Error('Open Horizon in the Android app to change the size.');
    if (busy) return;
    var big = val === 'big';
    if (big === !!(info && info.pct > 100)) return;
    if (big && (!info || info.bigPct <= 100)) throw new Error('Your screen is already at the narrowest width that fits.');
    if (!window.confirm('Horizon will redraw its screen to apply the ' + (big ? 'bigger' : 'normal') + ' size. Your chats and settings are kept. Continue?')) return;
    busy = true;
    try { await p.setUiSize({ big: big }); } finally { busy = false; }
  }
  async function applyRate(hz, quiet) {
    var p = plugin();
    if (!p) throw new Error('Open Horizon in the Android app to change the refresh rate.');
    var r = await p.setRate({ hz: hz });
    if (!quiet) {
      if (!hz) say('Auto: Android chooses the rate.');
      else if (r && r.exact) say('Asked for ' + hz + ' Hz.');
      else say('This screen has no ' + hz + ' Hz mode, so Android picked ' + ((r && r.chosen) || 'the closest') + ' Hz.');
    }
    return r;
  }
  async function pickRate(val) {
    var hz = Number(val) || 0;
    await applyRate(hz, false);
    lss(KEY_HZ, String(hz));
    await refresh();
  }
  function mount() {
    var panel = document.querySelector('.tab-body[data-tab="personalisation"]');
    if (!panel || document.getElementById('hzSizeCard')) return;
    sizeCard = card('hzSizeCard', 'Screen size', 'Make everything bigger so it is easier to read and tap.');
    sizeCard.list.append(
      option('size', 'normal', 'Normal', 'The usual size', pickSize),
      option('size', 'big', 'Bigger', 'Larger, and it still fits your screen', pickSize)
    );
    rateCard = card('hzRateCard', 'Refresh rate', 'How many times a second the screen redraws.');
    rateCard.list.append(
      option('rate', '0', 'Auto', 'Android chooses, and saves battery', pickRate),
      option('rate', '30', '30 Hz', 'Easiest on battery and heat', pickRate),
      option('rate', '60', '60 Hz', 'Smooth and balanced', pickRate),
      option('rate', '90', '90 Hz', 'Smoothest, uses the most battery', pickRate)
    );
    var anchor = document.getElementById('themeCard');
    if (anchor && anchor.parentNode === panel) {
      anchor.insertAdjacentElement('afterend', sizeCard.el);
      sizeCard.el.insertAdjacentElement('afterend', rateCard.el);
    } else {
      panel.append(sizeCard.el, rateCard.el);
    }
    paint();
    refresh();
  }
  function reapply() {
    var hz = Number(lsg(KEY_HZ) || 0);
    if (hz > 0 && plugin()) applyRate(hz, true).catch(function () { /* the screen keeps its own rate */ });
  }
  window.HorizonDisplay = { refresh: refresh, mount: mount };
  window.addEventListener('horizon-resume', reapply);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reapply(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(); reapply(); });
  else { mount(); reapply(); }
})();
