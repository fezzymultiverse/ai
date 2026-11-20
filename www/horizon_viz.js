/* HORIZON V1.99.46 (V1.99.73: Aurora Spectrum; V1.99.103: smoother Pulse Spectrum; V1.99.104: swirl + pulse, moves with lyrics) · music visualiser.
 * A canvas spectrum that replaces the plain bar strip in the right-panel player card and in the Music tab player card.
 * What it draws: 56 glowing mirrored bars (accent cyan > violet > pink), falling peak caps, a soft reflection, a kick pulse behind the bars,
 * sparks that fly up on the beat, and a glowing baseline. Bass bars hit on the kick, mids on the snare, highs shimmer on the hats.
 * The motion is synthesised from the clock (the phone plays audio natively, so there is no stream to read, and hooking the player
 * could mute it). Each song gets its own tempo from its title so two songs do not look the same.
 * It runs only while a song plays and the card is on screen, about 40 fps. Reduced-motion users get one still frame. It never plays or opens anything. */
(function () {
  'use strict';
  var root = document.documentElement, panel = document.getElementById('rightPanel');
  var HOSTS = [['hzRpWave', 'rp'], ['mpCard', 'mc']];
  var vizes = [], raf = 0, lastT = 0, reduce = false, rgbCache = '0,229,255', rgbAt = 0, lastTitle = '', bpm = 118;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { reduce = false; }

  /* V1.99.101: the player moved to the left Widgets panel in V1.99.100, so 'rp' visibility follows the panel the card is in. */
  function onAir() { try { return !!(window.HorizonOnAir && HorizonOnAir.live()); } catch (_) { return false; } }
  function lyricsLive() { return !!document.querySelector('#hzRpLyrics .hzly-box.is-playing:not([hidden])'); }   /* V1.99.104: the wave moves while lyrics play too */
  function playing() { return !!document.querySelector('#mpMini.playing, #mpNow.playing') || onAir() || lyricsLive(); }
  function light() { return root.getAttribute('data-theme') === 'grey'; }
  function accent(now) {
    if (now - rgbAt > 1500) { rgbAt = now; try { rgbCache = (getComputedStyle(root).getPropertyValue('--accent-rgb') || rgbCache).trim() || rgbCache; } catch (_) { /* keep */ } }
    return rgbCache;
  }
  function hash(str) { var h = 7; for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; }
  function titleNow() { if (onAir()) { try { return HorizonOnAir.title(); } catch (_) { /* fall through */ } } var b = document.querySelector('#mpMini .mp-mini-t b, #mpCard .mp-card-title, #mpNow b'); return b ? (b.textContent || '') : ''; }
  function tempo() { var t = titleNow(); if (t !== lastTitle) { lastTitle = t; bpm = 96 + (hash(t) % 37); } }
  function fr(x) { return x - Math.floor(x); }
  function noise(a, b) { return fr(Math.sin(a * 127.1 + b * 311.7) * 43758.5453); }

  function mount() {
    HOSTS.forEach(function (h) {
      var host = document.getElementById(h[0]); if (!host) return;
      if (host.querySelector('.hz-viz')) return;
      var cv = document.createElement('canvas'); cv.className = 'hz-viz hz-viz-' + h[1]; cv.setAttribute('aria-hidden', 'true');
      host.classList.add('has-viz');
      host.appendChild(cv);
      vizes.push({ cv: cv, ctx: null, W: 0, H: 0, dpr: 1, host: host, n: 56, val: [], peak: [], pv: [], sparks: [], lastBeat: -1, kind: h[1] });
    });
    vizes = vizes.filter(function (v) { return document.body.contains(v.cv); });
  }
  function visible(v) {
    if (!document.body.contains(v.cv)) return false;
    if (v.kind === 'rp') { var pn = v.host && v.host.closest ? v.host.closest('.panel') : null; if ((pn || panel) && !(pn || panel).classList.contains('open')) return false; }
    var r = v.cv.getBoundingClientRect(); return r.width > 4 && r.height > 4;
  }
  function size(v) {
    var r = v.cv.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1), w = Math.round(r.width), h = Math.round(r.height);
    if (v.ctx && w === v.W && h === v.H) return true;
    v.W = w; v.H = h; v.dpr = dpr; v.cv.width = Math.round(w * dpr); v.cv.height = Math.round(h * dpr);
    v.ctx = v.cv.getContext('2d'); if (!v.ctx) return false; v.ctx.setTransform(dpr, 0, 0, dpr, 0, 0); return true;
  }
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, Math.abs(h) / 2); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function level(i, n, t, bt) {
    var x = i / (n - 1), beat = bt % 1, kick = Math.exp(-beat * 5.2);
    var bar = Math.floor(bt) % 4, snare = (bar === 1 || bar === 3) ? Math.exp(-beat * 7) : 0;
    var hat = Math.exp(-fr(bt * 2) * 10), sub = Math.exp(-x * 4.2);
    var lfo = .5 + .5 * Math.sin(t * .9 + x * 6.2), wob = .5 + .5 * Math.sin(t * 2.3 + i * .7);
    var v = .04 + .05 * wob;
    v += kick * sub * 1.35;
    v += kick * .35 * Math.exp(-Math.pow((x - .2) / .12, 2));
    v += snare * 1.0 * Math.exp(-Math.pow((x - .46) / .14, 2));
    v += (.34 * lfo + .22 * wob) * Math.exp(-Math.pow((x - .35) / .2, 2)) * (.45 + .55 * kick + .3 * snare);
    v += hat * (.35 + .65 * noise(i, Math.floor(t * 24))) * .7 * Math.max(0, (x - .55) / .45);
    v += .1 * noise(i, Math.floor(t * 30)) * (.3 + x);
    return Math.max(.05, Math.min(1, v));
  }
  /* V1.99.73: AURORA SPECTRUM. Bars grow from the centre line (bass in the middle, highs at both edges) and mirror up and down,
     so the whole card is used and it reads like the cover glow of a player. Behind the bars three soft ribbons flow with the same energy,
     every beat sends a ring out from the centre, and sparks lift off the bar tops. Same clock-driven motion as before (no stream to read). */
  function ribbon(c, v, W, mid, maxH, s, r, rgb, lt) {
    var pts = 26, half = v.val.length, cx = W / 2, xs = [], tops = [], i;
    for (i = 0; i <= pts; i++) {
      var x = W * i / pts, d = Math.abs(x - cx) / cx, f = d * (half - 1), k0 = Math.floor(f), k1 = Math.min(half - 1, k0 + 1), fr0 = f - k0;
      var e = (v.val[k0] || 0) * (1 - fr0) + (v.val[k1] || 0) * fr0;
      var flow = .55 + .45 * Math.sin(s * (.8 + r * .45) + x * .022 * (r + 1) + r * 2.1);
      xs.push(x); tops.push(Math.max(1.5, e * maxH * (1 - r * .2) * flow));
    }
    var col = r === 0 ? 'rgb(' + rgb + ')' : r === 1 ? '#a78bfa' : '#ff2bd6';
    c.beginPath(); c.moveTo(xs[0], mid - tops[0]);
    for (i = 1; i <= pts; i++) { var mx = (xs[i - 1] + xs[i]) / 2, my = (mid - tops[i - 1] + mid - tops[i]) / 2; c.quadraticCurveTo(xs[i - 1], mid - tops[i - 1], mx, my); }
    c.lineTo(xs[pts], mid - tops[pts]);
    for (i = pts; i >= 1; i--) { var bx = (xs[i - 1] + xs[i]) / 2, by = (mid + tops[i - 1] + mid + tops[i]) / 2; c.quadraticCurveTo(xs[i], mid + tops[i], bx, by); }
    c.lineTo(xs[0], mid + tops[0]); c.closePath();
    c.globalAlpha = lt ? .12 : .16; c.fillStyle = col; c.fill();
    c.globalAlpha = lt ? .45 : .55; c.lineWidth = 1; c.strokeStyle = col; c.stroke();
    c.globalAlpha = 1;
  }
  /* V1.99.103: PULSE SPECTRUM. Smoother and more high-tech: levels ease in and out (no jumpy bars, no peak caps), a spatial blur joins neighbouring bars
     into one flowing shape, the whole scene breathes on the kick (grid floor, glow, ribbons), and two glowing sine ribbons run across the card like the
     idle screensaver. Same clock-driven motion as before (no stream to read), or the real radio signal when a station allows it. */
  function draw(v, t, live, now) {
    var c = v.ctx, W = v.W, H = v.H, lt = light(), rgb = accent(now), s = t / 1000, bt = s * bpm / 60;
    var half = 30, cx = W / 2, mid = H * .5, maxH = H * .4, bw = cx / half, i, sum = 0;
    c.clearRect(0, 0, W, H);
    var beat = bt % 1, kick = live ? Math.exp(-beat * 4.2) : 0;
    v.pulse = (v.pulse || 0); v.pulse += (kick - v.pulse) * (kick > v.pulse ? .3 : .08);
    var pl = v.pulse;
    var rb = (live && v.kind === 'rp' && onAir()) ? HorizonOnAir.bins(half) : null;
    for (i = 0; i < half; i++) {
      var tg = rb ? rb[i] : live ? level(i, half, s, bt) : .1 + .05 * Math.sin(i * .5 + s * .6);
      var pv = v.val[i] || 0; pv += (tg - pv) * (tg > pv ? .3 : .09); v.val[i] = pv;
    }
    var sm = v.sm || (v.sm = []);
    for (i = 0; i < half; i++) { var a0 = v.val[Math.max(0, i - 1)], a1 = v.val[i], a2 = v.val[Math.min(half - 1, i + 1)]; sm[i] = (a0 + a1 * 2 + a2) / 4; sum += sm[i]; }
    var energy = sum / half;
    c.globalCompositeOperation = 'source-over';
    /* glow behind everything, breathing with the kick */
    c.save(); c.translate(cx, mid); c.scale(1, Math.min(.75, H / W * 1.7));
    var gl = c.createRadialGradient(0, 0, 0, 0, 0, W * .55);
    gl.addColorStop(0, 'rgba(' + rgb + ',' + ((lt ? .1 : .1) + .26 * pl).toFixed(3) + ')'); gl.addColorStop(.55, 'rgba(255,43,214,' + (.03 + .1 * pl).toFixed(3) + ')'); gl.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(0, 0, W * .55, 0, 6.2832); c.fill(); c.restore();
    /* perspective grid floor, scrolling, brighter on the kick */
    var hor = mid + H * .1; c.lineWidth = 1; c.strokeStyle = 'rgba(' + rgb + ',' + ((lt ? .14 : .1) + .16 * pl).toFixed(3) + ')';
    c.beginPath();
    for (i = -8; i <= 8; i++) { c.moveTo(cx + i * W * .03, hor); c.lineTo(cx + i * W * .17, H); }
    var off = (s * .35) % 1;
    for (i = 0; i < 6; i++) { var f = (i + off) / 6, yy = hor + (H - hor) * f * f; c.moveTo(0, yy); c.lineTo(W, yy); }
    c.stroke();
    c.globalCompositeOperation = lt ? 'source-over' : 'lighter';
    /* beat ring leaving the centre */
    if (live) {
      c.save(); c.translate(cx, mid); c.scale(1, Math.min(.5, H / W * 1.3));
      c.globalAlpha = Math.max(0, (1 - beat) * .26); c.lineWidth = 1.6; c.strokeStyle = 'rgb(' + rgb + ')';
      c.beginPath(); c.arc(0, 0, beat * W * .5, 0, 6.2832); c.stroke(); c.restore(); c.globalAlpha = 1;
    }
    /* mirrored bars (bass in the centre), thin, cyan > white > pink like the idle screen */
    var gb = c.createLinearGradient(0, mid - maxH, 0, mid + maxH);
    gb.addColorStop(0, 'rgba(' + rgb + ',.95)'); gb.addColorStop(.5, lt ? 'rgba(40,60,110,.9)' : 'rgba(255,255,255,.9)'); gb.addColorStop(1, 'rgba(255,43,214,.92)');
    var w = Math.max(1.8, bw * .5), scale = 1 + .16 * pl;
    for (i = 0; i < half; i++) {
      var env = .55 + .45 * Math.cos(i / half * 1.45), h = Math.max(2, sm[i] * maxH * env * scale), off2 = i * bw + bw * .5;
      for (var sd = -1; sd <= 1; sd += 2) {
        var x = cx + sd * off2 - w / 2;
        if (live) { c.globalAlpha = .13; c.fillStyle = gb; rr(c, x - 2, mid - h - 2, w + 4, h * 2 + 4, 5); c.fill(); }
        c.globalAlpha = 1; c.fillStyle = gb; rr(c, x, mid - h, w, h * 2, w / 2); c.fill();
      }
    }
    c.globalAlpha = 1;
    /* V1.99.104: swirl + pulse (shared module); the old two sine ribbons stay as the fallback if horizon_swirl.js is missing */
    if (window.HorizonSwirl) { c.globalCompositeOperation = 'source-over'; HorizonSwirl.draw(c, W, H, t, { live: live, energy: Math.min(1, energy * 1.6 + .1), pulse: pl, bpm: bpm, rgb: rgb, light: lt, mid: mid, span: .3 }); }
    else {
    var amp = H * (.05 + .13 * energy + .07 * pl);
    for (var r = 0; r < 2; r++) {
      c.beginPath();
      for (var q = 0; q <= 70; q++) {
        var px = q / 70 * W, e2 = Math.sin(Math.PI * q / 70);
        var py = mid + Math.sin(q * .27 + s * (1.4 + r * .6) + r * 2) * amp * e2 + Math.sin(q * .09 - s * .8) * amp * .4 * e2;
        if (q) c.lineTo(px, py); else c.moveTo(px, py);
      }
      c.lineWidth = r ? 1.2 : 2; c.strokeStyle = r ? 'rgba(255,43,214,.8)' : 'rgba(' + rgb + ',.95)';
      c.shadowColor = r ? 'rgba(255,43,214,.9)' : 'rgba(' + rgb + ',.9)'; c.shadowBlur = lt ? 0 : 9; c.stroke(); c.shadowBlur = 0;
    }
    }
    /* centre line */
    c.globalCompositeOperation = 'source-over';
    var bl = c.createLinearGradient(0, 0, W, 0);
    bl.addColorStop(0, 'rgba(255,43,214,0)'); bl.addColorStop(.5, 'rgba(255,255,255,' + (live ? .4 + .4 * pl : .25).toFixed(2) + ')'); bl.addColorStop(1, 'rgba(255,43,214,0)');
    c.fillStyle = bl; c.fillRect(0, mid - .6, W, 1.2);
  }
  function frame(now) {
    raf = 0;
    if (document.hidden || window.hzTyping || window.hzKbBusy || window.hzEditorFocused) return;
    var live = playing(); if (!live) { rest(); return; }
    tempo();
    var any = false;
    if (now - lastT >= 24) {
      lastT = now;
      for (var k = 0; k < vizes.length; k++) { var v = vizes[k]; if (!visible(v) || !size(v)) continue; any = true; draw(v, now, true, now); }
    } else any = true;
    if (any) raf = requestAnimationFrame(frame);
  }
  function rest() {
    for (var k = 0; k < vizes.length; k++) { var v = vizes[k]; if (visible(v) && size(v)) { v.sparks.length = 0; draw(v, 0, false, Date.now()); } }
  }
  function start() {
    if (raf || document.hidden || window.hzTyping || window.hzKbBusy || window.hzEditorFocused) return;
    if (reduce) { for (var k = 0; k < vizes.length; k++) { var v = vizes[k]; if (visible(v) && size(v)) draw(v, 5200, true, Date.now()); } return; }
    if (document.hidden || root.classList.contains('hz-kb-open') || root.classList.contains('hz-kb-moving')) return;
    raf = requestAnimationFrame(frame);
  }
  function check() { if (document.hidden || window.hzTyping || window.hzKbBusy || window.hzEditorFocused) return; mount(); if (playing()) start(); else { if (raf) { cancelAnimationFrame(raf); raf = 0; } rest(); } }
  setInterval(check, 700);
  window.addEventListener('hz-kb-settled', check);
  window.addEventListener('hz-editor-settled', check);
  document.addEventListener('visibilitychange', check);
  window.addEventListener('resize', function () { vizes.forEach(function (v) { v.W = 0; }); check(); });
  try { if (panel) new MutationObserver(check).observe(panel, { attributes: true, attributeFilter: ['class'] }); } catch (_) { /* optional */ }
  try { var lpn = document.getElementById('leftPanel'); if (lpn) new MutationObserver(check).observe(lpn, { attributes: true, attributeFilter: ['class'] }); } catch (_) { /* optional */ }
  check();
})();
