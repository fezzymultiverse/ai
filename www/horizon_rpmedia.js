/* HORIZON V1.99.43 · right-panel AI media cluster.
 * The player (with its waveform) and the lyrics widget sit in the right Settings panel, empty, until the AI plays a song
 * ([[music.play]]) or opens the lyrics ([[lyrics.show]]). This file only watches them: while music plays or lyrics are open it
 * marks the cluster live and makes the top-right Settings tile pulse with wavy vibrations so Fezzy knows where the sound is.
 * V1.99.41: the mark now goes on the tile that is actually on screen (.hzc-set). Before, it only went on the hidden #settingsBtn,
 * so nothing was seen to move. It is re-applied every tick because the tile is built after this script loads.
 * V1.99.43: also marks the cluster .is-idle when nothing plays and no lyrics box is open, so the idle screensaver (horizon_rpidle.js) shows.
 * It never plays, pauses or opens anything itself. */
(function () {
  'use strict';
  var root = document.documentElement, last = '';
  function playing() { var m = document.getElementById('mpMini'); if (m && m.classList.contains('playing')) return true; try { return !!(window.HorizonOnAir && HorizonOnAir.live()); } catch (_) { return false; } }
  function lyrics() { return !!document.querySelector('#hzRpLyrics .hzly-box.is-playing:not([hidden])'); }
  function mark(on) {
    var list = document.querySelectorAll('#settingsBtn, .hzc-set');
    for (var i = 0; i < list.length; i++) {
      var t = list[i], has = t.getAttribute('data-media') === 'live';
      if (on && !has) t.setAttribute('data-media', 'live');
      else if (!on && t.hasAttribute('data-media')) t.removeAttribute('data-media');
    }
  }
  function tick() {
    if (document.hidden) return;
    var p = playing(), l = lyrics(), w = !!document.querySelector('#hzRpMedia.is-watch'), on = p || l || w, key = (p ? 'p' : '') + (l ? 'l' : '') + (w ? 'w' : '');
    if (key !== last) {
      last = key;
      root.classList.toggle('hz-ai-media', on);
      var rm = document.getElementById('hzRpMedia');
      if (rm) { rm.classList.toggle('is-live', on); rm.classList.toggle('is-music', p); rm.classList.toggle('is-lyrics', l); }
    }
    mark(on);
    var rmi = document.getElementById('hzRpMedia');
    if (rmi) { var open = !!document.querySelector('#hzRpLyrics .hzly-box:not([hidden])'); rmi.classList.toggle('is-idle', !on && !open && !w); }
    document.querySelectorAll('.hzc-set').forEach(function (t) { t.setAttribute('aria-label', on ? 'Settings · music playing' : 'Settings'); });
  }
  var observed = false;
  function watch() {
    if (observed) return; var m = document.getElementById('hzRpMedia'); if (!m) return; observed = true;
    new MutationObserver(tick).observe(m, {subtree:true, childList:true, attributes:true, attributeFilter:['class','hidden']});
  }
  watch(); document.addEventListener('DOMContentLoaded', watch);
  setInterval(tick, 600);
  document.addEventListener('visibilitychange', tick);
  tick();
})();
