/* HORIZON V1.65.3 · reply speaker waveform.
   One loop moves the bars of whichever reply is being read. JavaScript sets the heights every frame, so no motion setting can switch it off.
   It starts when the voice state changes and stops by itself when nothing is playing. */
(function () {
  'use strict';
  var raf = 0;
  function frame(ms) {
    raf = 0;
    var waves = document.querySelectorAll('.speak-btn.playing:not(.paused) .spk-wave');
    if (!waves.length) return;
    var t = ms / 1000;
    var env = Math.max(0.3, Math.abs(0.55 + 0.45 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1)));
    for (var w = 0; w < waves.length; w++) {
      var bars = waves[w].children;
      for (var i = 0; i < bars.length; i++) {
        var v = 0.5 + 0.5 * Math.sin(t * (5.5 + (i % 5) * 1.3) + i * 1.7);
        bars[i].style.transform = 'scaleY(' + (0.2 + 0.8 * v * env).toFixed(3) + ')';
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  function hook() {
    if (window.HorizonTTS && typeof window.HorizonTTS.onState === 'function') { window.HorizonTTS.onState(kick); return true; }
    return false;
  }
  if (!hook()) window.addEventListener('load', hook);
})();
