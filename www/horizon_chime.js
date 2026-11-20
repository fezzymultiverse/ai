/* V1.99.161: in-app chime. Plays a short two-tone beep through WebAudio when an alert fires while Horizon is open,
 * so a silent Android notification channel never means a silent alert. Off switch: localStorage horizon_chime = '0'. */
(function () {
    'use strict';
    var ctx = null;
    function enabled() { try { return localStorage.getItem('horizon_chime') !== '0'; } catch (_) { return true; } }
    function chime(strong) {
        if (!enabled()) return;
        try {
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            ctx = ctx || new AC(); if (ctx.state === 'suspended') ctx.resume();
            var notes = strong ? [988, 740, 988] : [784, 1047], t = ctx.currentTime;
            notes.forEach(function (f, i) {
                var o = ctx.createOscillator(), g = ctx.createGain();
                o.type = 'sine'; o.frequency.value = f;
                g.gain.setValueAtTime(0.0001, t + i * 0.16);
                g.gain.exponentialRampToValueAtTime(0.35, t + i * 0.16 + 0.02);
                g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.15);
                o.connect(g); g.connect(ctx.destination); o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.16);
            });
        } catch (_) { /* a chime must never break an alert */ }
    }
    window.HzChime = chime;
})();
