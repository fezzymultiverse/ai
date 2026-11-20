/* HORIZON V1.99.100 · media unit.
 * One screen in the left Widgets panel for BOTH the music player and Horizon Radio.
 *   - MUSIC / RADIO switch picks which face is on screen. The idle screensaver, waveform and lyrics stay on the Music face;
 *     the radio dial and station list stay on the Radio face. Both engines are untouched.
 *   - When the AI (or you) starts a song the unit flips to MUSIC; when a station starts playing it flips to RADIO.
 *   - AI LINK line shows the last media command the AI ran ([[music.*]], [[radio.*]]) and whether it worked.
 *   - window.HorizonMedia: face(), now(), radio(kind,arg), music(kind,arg). Same tools the AI already uses, one door.
 * It never plays or stops anything by itself. Face choice is remembered on this device. */
(function () {
  'use strict';
  var unit = document.getElementById('hzUnit');
  if (!unit) return;
  var KEY = 'horizon_unit_face';
  var btns = unit.querySelectorAll('[data-face-btn]');
  var faces = unit.querySelectorAll('[data-face]');
  var led = document.getElementById('hzUnitLed'), ledT = document.getElementById('hzUnitLedT'), logEl = document.getElementById('hzUnitLog');
  var face = 'music', lastP = false, lastR = false, hooked = 0;

  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { /* storage off */ } return null; }
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

  function setFace(f, save) {
    if (f !== 'music' && f !== 'radio') return;
    face = f;
    for (var i = 0; i < btns.length; i++) {
      var on = btns[i].getAttribute('data-face-btn') === f;
      btns[i].classList.toggle('on', on); btns[i].setAttribute('aria-selected', on ? 'true' : 'false');
    }
    for (var j = 0; j < faces.length; j++) faces[j].hidden = faces[j].getAttribute('data-face') !== f;
    if (save !== false) ls(KEY, f);
    try { window.dispatchEvent(new Event('resize')); } catch (e) { /* old webview */ }   // radio + waveform re-measure
  }
  var earBtn = document.getElementById('hzUnitEar');
  if (earBtn) earBtn.addEventListener('click', function () {   // V1.99.102: Gemini ears for whatever is on the screen
    try {
      if (window.HorizonOnAir && HorizonOnAir.live()) HorizonOnAir.ears();
      else if (window.HorizonMusic && HorizonMusic.openEars) HorizonMusic.openEars();
    } catch (e) { /* each engine reports its own failures */ }
  });
  for (var b = 0; b < btns.length; b++) (function (bt) { bt.addEventListener('click', function () { setFace(bt.getAttribute('data-face-btn')); }); })(btns[b]);

  function log(t, bad) {
    if (!logEl) return;
    logEl.textContent = 'AI › ' + clip(t, 90);
    logEl.style.color = bad ? '#ff5a5a' : '';
    logEl.classList.remove('flash'); void logEl.offsetWidth; logEl.classList.add('flash');
  }
  function mpPlaying() { var m = document.getElementById('mpMini'); return !!(m && m.classList.contains('playing')); }
  function mpTitle() { var b = document.querySelector('#mpMini .mp-mini-t b'); return b ? clip(b.textContent, 40) : ''; }
  function radioState() { try { return (window.HorizonRadio && HorizonRadio.state) ? HorizonRadio.state() : null; } catch (e) { return null; } }

  function tick() {
    if (document.hidden || window.hzTyping || window.hzKbBusy || window.hzEditorFocused) return;
    var p = mpPlaying(), r = radioState(), rp = !!(r && r.status === 'playing'), video = !!(window.HorizonWatch && HorizonWatch.active());
    if (video && face !== 'music') setFace('music', false);
    if (rp && !lastR) setFace('music', false);   // V1.99.101: radio plays on the shared screen; the RADIO tab is the tuner
    else if (p && !lastP) setFace('music', false);
    lastP = p; lastR = rp;
    var txt = 'STANDBY', on = false;
    if (video) { txt = 'VIDEO'; on = true; }
    else if (rp && (face === 'radio' || !p)) { txt = 'RADIO · ' + clip(r.station && r.station.name, 18); on = true; }
    else if (p) { txt = 'PLAYING · ' + (mpTitle() || 'MUSIC'); on = true; }
    else if (r && r.status === 'loading') { txt = 'TUNING…'; on = true; }
    if (ledT.textContent !== txt) ledT.textContent = txt;
    led.classList.toggle('on', on);
  }

  /* log the AI's media tool calls without changing what they do */
  function wrap(obj, label) {
    if (!obj || typeof obj.run !== 'function' || obj.run.__hzu) return false;
    var f = obj.run;
    var w = function () {
      var a = arguments, kind = String(a[0] || ''), arg = a[1] ? ' ' + clip(a[1], 40) : '';
      log(kind.indexOf('.') > -1 ? kind + arg : label + '.' + kind + arg);
      var res = f.apply(this, a);
      if (res && typeof res.then === 'function') res.then(function (r) {
        var tx = r && r.text ? String(r.text) : '';
        if (/^ERROR/i.test(tx)) log(clip(tx.replace(/^ERROR:?\s*/i, ''), 80), true);
        else if (tx) log('✓ ' + clip(tx, 80));
      }, function () { /* the engine reports its own failures */ });
      return res;
    };
    w.__hzu = true; obj.run = w; return true;
  }
  function hook() {
    var ok = 0;
    if (wrap(window.HorizonRadio, 'radio')) ok++;
    if (wrap(window.HorizonMusic, 'music')) ok++;
    hooked += ok;
    return (window.HorizonRadio && window.HorizonRadio.run.__hzu) && (window.HorizonMusic && window.HorizonMusic.run && window.HorizonMusic.run.__hzu);
  }
  var tries = 0, ht = setInterval(function () { if (hook() || ++tries > 20) clearInterval(ht); }, 500);

  window.HorizonMedia = {
    face: setFace,
    now: function () { var r = radioState(); return { face: face, music: mpPlaying() ? mpTitle() : '', radio: r && r.status === 'playing' && r.station ? r.station.name : '' }; },
    radio: function (kind, arg) { return window.HorizonRadio ? HorizonRadio.run(kind, arg) : Promise.resolve({ text: 'ERROR: radio is not ready.' }); },
    music: function (kind, arg) { return window.HorizonMusic ? HorizonMusic.run(kind, arg) : Promise.resolve({ text: 'ERROR: the music player is not ready.' }); }
  };

  setFace('music', false);   // V1.99.103: no MUSIC/RADIO toggle. Radio plays on the shared screen, the AI starts it.
  setInterval(tick, 700);
  setTimeout(tick, 400);
})();
