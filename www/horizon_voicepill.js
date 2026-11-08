/* Horizon V1.43.1: VOICE pill animation, driven from JavaScript.
   The wave and the pulse used to be CSS animations, and Android's "remove animations" / reduce-motion setting switches those off,
   so the pill sat there doing nothing. Same fix as the now-playing waveform: JS sets the bar heights and the glow every frame,
   which no motion setting can switch off. Playing = moving bars + pulsing ring. Loading = shimmering line + pulsing ring. Idle = flat line. */
(function () {
    'use strict';
    var pill = document.getElementById('hzVoice');
    if (!pill) return;
    var wave = pill.querySelector('.hzv-wave');
    var bars = [].slice.call(pill.querySelectorAll('.hzv-wave i'));
    var raf = 0;

    function mode() { return pill.classList.contains('paused') ? 'paused' : pill.classList.contains('playing') ? 'playing' : pill.classList.contains('loading') ? 'loading' : 'idle'; }
    function rest() {
        bars.forEach(function (b) { b.style.transform = ''; b.style.opacity = ''; });
        if (wave) wave.style.removeProperty('--hzv-line');
        pill.style.boxShadow = '';
    }
    function ring(t) {
        var p = (t % 1.4) / 1.4;
        pill.style.boxShadow = '0 0 0 ' + (p * 7).toFixed(2) + 'px rgba(var(--accent-rgb),' + (0.4 * (1 - p)).toFixed(3) + ')';
    }
    function frame(ms) {
        raf = 0;
        var m = mode();
        if (m === 'idle' || m === 'paused') { rest(); return; }       // V1.64.0: paused = flat, still
        var t = ms / 1000;
        ring(t);
        if (m === 'playing') {
            // a slow swell like phrases of speech, with each bar moving at its own speed
            var env = Math.max(0.3, Math.abs(0.55 + 0.45 * Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1)));
            for (var i = 0; i < bars.length; i++) {
                var v = 0.5 + 0.5 * Math.sin(t * (5.5 + (i % 5) * 1.3) + i * 1.7);
                bars[i].style.opacity = '1';
                bars[i].style.transform = 'scaleY(' + (0.12 + 0.88 * v * env).toFixed(3) + ')';
            }
            if (wave) wave.style.setProperty('--hzv-line', '0');
        } else {
            for (var j = 0; j < bars.length; j++) { bars[j].style.opacity = '0'; bars[j].style.transform = 'scaleY(0)'; }
            if (wave) wave.style.setProperty('--hzv-line', (0.3 + 0.6 * Math.abs(Math.sin(t * Math.PI))).toFixed(3));
        }
        raf = requestAnimationFrame(frame);
    }
    function kick() { var m = mode(); if (!raf && m !== 'idle' && m !== 'paused') raf = requestAnimationFrame(frame); else if (m === 'idle' || m === 'paused') rest(); }

    if (window.MutationObserver) new MutationObserver(kick).observe(pill, { attributes: true, attributeFilter: ['class'] });
    kick();
})();
