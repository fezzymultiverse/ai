/* HORIZON V1.38.0 · typing guard. Sets window.hzTyping while the message box has focus and keys are
   landing, so background timers (wave animation, UI sweep) back off instead of competing with the
   keyboard on slower phones. It never touches what you type. */
(function () {
  'use strict';
  var box = document.getElementById('chatInput');
  if (!box) return;
  var t = 0;
  window.hzTyping = false;
  var de = document.documentElement;
  // V1.93.7: while keys are landing the html tag carries hz-typing, and the glowing pulse animations (live AI rings,
  // the stop button, the network button, thinking dots) pause. They repaint on every frame and compete with the keyboard.
  function on() { window.hzTyping = true; if (!de.classList.contains('hz-typing')) de.classList.add('hz-typing'); clearTimeout(t); t = setTimeout(off, 1500); }
  function off() { window.hzTyping = false; de.classList.remove('hz-typing'); clearTimeout(t); }
  box.addEventListener('input', on, { passive: true });
  box.addEventListener('keydown', on, { passive: true });
  box.addEventListener('compositionupdate', on, { passive: true });
  box.addEventListener('blur', off, { passive: true });
})();
