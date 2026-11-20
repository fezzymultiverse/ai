/* HORIZON V1.99.104 · swirl + pulse waveform (shared). Three twisting helix ribbons (front halves bright, back halves dim, so they read as
 * swirling around each other), a pulsing core, two rotating dashed orbits with particles, and a ring that leaves the core on the beat.
 * Used by the player wave (horizon_viz.js), the idle screensaver (horizon_rpidle.js) and the lyrics box wave (horizon_lyrics.js).
 * Each caller falls back to its own old drawing if this file is missing. Clock-driven (no audio is read). No shadowBlur: glow is a wide
 * faint stroke under a thin bright one, so it stays light on a phone. HorizonSwirl.draw(ctx, W, H, tMs, opts)
 * opts: live (bool), energy 0-1, pulse 0-1 (default: beat kick), bpm, rgb 'r,g,b', light (grey theme), mid (px), span (height share), alpha */
(function () {
  'use strict';
  var TAU = 6.2832, lastTxt = '', bpmC = 112;
  function hash(s) { var h = 7; for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
  function tempo() {
    try {
      var el = document.querySelector('#mpMini .mp-mini-t b, #mpCard .mp-card-title, #mpNow b, #hzRpLyrics .hzly-song'), t = el ? (el.textContent || '') : '';
      if (t !== lastTxt) { lastTxt = t; bpmC = t ? 96 + hash(t) % 37 : 112; }
    } catch (_) { /* keep */ }
    return bpmC;
  }
  function draw(c, W, H, t, o) {
    o = o || {};
    var s = t / 1000, live = o.live !== false, lt = !!o.light, rgb = o.rgb || '0,229,255', al = o.alpha == null ? 1 : o.alpha;
    var sp = o.speed != null ? o.speed : (live ? 3.4 : 1), sr = s * sp;
    var bpm = o.bpm || tempo(), beat = ((s * bpm / 60) % 1 + 1) % 1;
    var e = live ? (o.energy == null ? .55 : Math.max(.12, Math.min(1, o.energy))) : .1;
    var pl = o.pulse != null ? o.pulse : (live ? Math.exp(-beat * 4.4) : 0);
    var mid = o.mid != null ? o.mid : H * .5, A = H * (o.span || .3) * (.3 + .7 * e) * (1 + .3 * pl), cx = W / 2;
    var cols = [rgb, '255,43,214', '139,92,255'], i, k, r, sd;
    c.save(); c.globalCompositeOperation = lt ? 'source-over' : 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
    /* pulsing core */
    var R = Math.min(W, H * 2) * (.07 + .07 * pl + .03 * e), g = c.createRadialGradient(cx, mid, 0, cx, mid, R * 2.4);
    g.addColorStop(0, 'rgba(' + rgb + ',' + ((lt ? .2 : .34) * al * (.5 + .5 * e + .4 * pl)).toFixed(3) + ')');
    g.addColorStop(.5, 'rgba(255,43,214,' + (.12 * al * (.4 + pl)).toFixed(3) + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, mid, R * 2.4, 0, TAU); c.fill();
    /* beat ring */
    if (live) {
      c.globalAlpha = Math.max(0, (1 - beat) * .24 * al); c.lineWidth = 1.4; c.strokeStyle = 'rgb(' + rgb + ')';
      c.beginPath(); c.ellipse(cx, mid, 4 + beat * W * .46, 2 + beat * H * .4, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;
    }
    /* two rotating orbits with particles */
    for (k = 0; k < 2; k++) {
      var rx = W * (.15 + .07 * k + .04 * pl), ry = H * (.2 + .05 * k) * (.6 + .4 * e), rot = sr * (.45 + .3 * k) * (k ? -1 : 1);
      c.globalAlpha = (lt ? .45 : .5) * al; c.lineWidth = 1; c.strokeStyle = 'rgba(' + cols[k ? 1 : 0] + ',.9)';
      c.setLineDash([3, 7]); c.lineDashOffset = -sr * 26 * (k ? -1 : 1);
      c.beginPath(); c.ellipse(cx, mid, rx, ry, rot, 0, TAU); c.stroke(); c.setLineDash([]);
      c.globalAlpha = al; c.fillStyle = 'rgba(' + cols[k ? 1 : 0] + ',.95)';
      for (i = 0; i < 5; i++) {
        var an = sr * (1.1 + .5 * k) * (k ? -1 : 1) + i * TAU / 5, ex = rx * Math.cos(an), ey = ry * Math.sin(an);
        c.beginPath(); c.arc(cx + ex * Math.cos(rot) - ey * Math.sin(rot), mid + ex * Math.sin(rot) + ey * Math.cos(rot), 1.4 + 1.5 * pl, 0, TAU); c.fill();
      }
    }
    /* three twisting helix ribbons, two strands each; front halves thick and bright, back halves thin and dim */
    var N = Math.max(30, Math.min(64, Math.round(W / 7))), xs = [], ys = [], zs = [];
    for (r = 0; r < 3; r++) {
      for (sd = 0; sd < 2; sd++) {
        for (i = 0; i <= N; i++) {
          var env = Math.pow(Math.sin(Math.PI * i / N), .85);
          var th = i * .2 * (1 + .28 * r) + sr * (1.2 + .35 * r) + (sd ? Math.PI : 0) + r * 2.1 + .6 * Math.sin(s * .5 + i * .04);
          xs[i] = i / N * W; ys[i] = mid + Math.sin(th) * A * env * (1 - .12 * r); zs[i] = Math.cos(th);
        }
        var col = 'rgba(' + cols[r] + ',';
        for (var pass = 0; pass < 2; pass++) {
          var front = pass === 1, pen = false;
          c.beginPath();
          for (i = 0; i <= N; i++) {
            var ok = front ? zs[i] > 0 : zs[i] <= 0;
            if (ok) { if (pen) c.lineTo(xs[i], ys[i]); else { c.moveTo(xs[i], ys[i]); pen = true; } } else pen = false;
          }
          if (front) {
            if (!lt) { c.lineWidth = 6; c.strokeStyle = col + (.1 * al).toFixed(3) + ')'; c.stroke(); }
            c.lineWidth = 2.1; c.strokeStyle = col + ((lt ? .75 : .9) * al).toFixed(3) + ')'; c.stroke();
          } else { c.lineWidth = 1; c.strokeStyle = col + ((lt ? .3 : .26) * al).toFixed(3) + ')'; c.stroke(); }
        }
      }
    }
    c.restore();
  }
  window.HorizonSwirl = { draw: draw, tempo: tempo, VERSION: '1.99.123' };
})();
