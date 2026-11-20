/* V1.93.9 · Personalisation: Android display settings: native size/rate requests plus app text-size presets. */
(function () {
  'use strict';
  var KEY_HZ = 'hz_refresh', KEY_UI = 'hz_ui_preset';
  function applyPreset() { document.documentElement.dataset.hzUi = lsg(KEY_UI) || ''; }
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
      mark(sizeCard, 'size:' + (lsg(KEY_UI) || (big ? 'big' : 'normal')));
      var bb = sizeCard.list.querySelector('[data-hz-display-opt="size:big"]');
      var nb = sizeCard.list.querySelector('[data-hz-display-opt="size:normal"]');
      if (!p) {
        sizeCard.status.textContent = 'Needs the Android app. A browser keeps its own zoom.';
        setDisabled(bb, true); setDisabled(nb, true);
        sizeCard.list.querySelectorAll('button').forEach(function(b){setDisabled(b,true);});
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
        var modes = Array.isArray(info.supported) ? info.supported.map(Number) : [];
        rateCard.status.textContent = 'Running at ' + info.current + ' Hz now.' + (modes.length ? ' Screen modes: ' + modes.join(', ') + ' Hz.' : ' Display modes unavailable.');
        rateCard.list.querySelectorAll('button').forEach(function (b) {
          var hz = Number(b.dataset.hzDisplayOpt.split(':')[1]);
          if (!hz) return;
          var ok = modes.some(function(rate){return Math.abs(rate-hz)<1;});
          if (hz === 120) setDisabled(b, !ok);
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
    if (val === 'compact' || val === 'comfort') { lss(KEY_UI,val); applyPreset(); paint(); return; }
    var big = val === 'big';
    if (!info) throw new Error('Display information is not available on this build.');
    if (big === (info.pct > 100)) { lss(KEY_UI,''); applyPreset(); paint(); return; }
    if (big && (!info || info.bigPct <= 100)) throw new Error('Your screen is already at the narrowest width that fits.');
    if (!window.confirm('Horizon will redraw its screen to apply the ' + (big ? 'bigger' : 'normal') + ' size. Your chats and settings are kept. Continue?')) return;
    busy = true;
    try { await p.setUiSize({ big: big }); lss(KEY_UI,''); applyPreset(); await refresh(); } finally { busy = false; }
  }
  async function applyRate(hz, quiet) {
    var p = plugin();
    if (!p) throw new Error('Open Horizon in the Android app to change the refresh rate.');
    var r = await p.setRate({ hz: hz });
    if (hz === 120 && !(r && r.exact)) throw new Error('The Android display bridge did not accept 120 Hz. Your previous preference was kept.');
    if (!quiet) {
      if (!hz) say('Auto: Android chooses the rate.');
      else if (r && r.exact) say('Asked for ' + hz + ' Hz.');
      else say('This screen has no ' + hz + ' Hz mode, so Android picked ' + ((r && r.chosen) || 'the closest') + ' Hz.');
    }
    return r;
  }
  async function pickRate(val) {
    var hz = Number(val) || 0;
    if (hz === 120 && !(info && Array.isArray(info.supported) && info.supported.some(function(rate){return Math.abs(Number(rate)-120)<1;}))) throw new Error('120 Hz is not available on this display.');
    await applyRate(hz, false);
    lss(KEY_HZ, String(hz));
    await refresh();
  }
  function mount() {
    var panel = document.querySelector('.tab-body[data-tab="personalisation"]');
    if (!panel || document.getElementById('hzSizeCard')) return;
    sizeCard = card('hzSizeCard', 'Screen size', 'Choose an app text preset or a native display size.');
    sizeCard.list.append(
      option('size', 'compact', 'Compact', 'Smaller chat and settings text', pickSize),
      option('size', 'comfort', 'Comfort', 'Larger chat and settings text', pickSize),
      option('size', 'normal', 'Normal', 'The usual size', pickSize),
      option('size', 'big', 'Bigger', 'Larger, and it still fits your screen', pickSize)
    );
    rateCard = card('hzRateCard', 'Refresh rate', 'How many times a second the screen redraws.');
    rateCard.list.append(
      option('rate', '0', 'Auto', 'Android chooses, and saves battery', pickRate),
      option('rate', '30', '30 Hz', 'Easiest on battery and heat', pickRate),
      option('rate', '60', '60 Hz', 'Smooth and balanced', pickRate),
      option('rate', '90', '90 Hz', 'High refresh rate', pickRate),
      option('rate', '120', '120 Hz', 'Requires a compatible display and Android bridge', pickRate)
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
  if (plugin()) applyPreset();
  window.HorizonDisplay = { refresh: refresh, mount: mount };
  window.addEventListener('horizon-resume', reapply);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) reapply(); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { mount(); reapply(); });
  else { mount(); reapply(); }
})();
