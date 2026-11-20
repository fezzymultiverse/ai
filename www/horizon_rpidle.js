/* HORIZON V1.99.43 · media-unit idle screensaver.
 * When nothing is playing and no lyrics are open, the media area of the right Settings panel shows a living wallpaper
 * (slow aurora, drifting stars, soft grid) with a waveform visualisation, the HORIZON mark and the time.
 * It is drawn from nothing (no audio is read). It sleeps whenever the panel is closed, the page is hidden, the area is not idle,
 * or the keyboard is open, and runs at about 30 fps. Reduced-motion users get one still frame. It never plays or opens anything. */
(function () {
  'use strict';
  var media = document.getElementById('hzRpMedia'), panel = document.getElementById('leftPanel');
  if (!media || !panel || document.getElementById('hzRpIdle')) return;
  var root = document.documentElement;
  var card = document.createElement('div');
  card.className = 'hz-rpm-card hz-rpm-idle'; card.id = 'hzRpIdle';
  card.setAttribute('role', 'img'); card.setAttribute('aria-label', 'Idle screensaver: waveform visualisation');
  var cv = document.createElement('canvas'); cv.className = 'hz-rpi-cv'; card.appendChild(cv);
  var tag = document.createElement('div'); tag.className = 'hz-rpi-tag';
  tag.innerHTML = '<b>HORIZON</b><span class="hz-rpi-time"></span><em>Idle · the AI can play a song for you</em>';
  card.appendChild(tag);
  media.insertBefore(card, media.firstChild);
  var timeEl = card.querySelector('.hz-rpi-time');
  var ctx = null, W = 0, H = 0, dpr = 1, raf = 0, lastT = 0, stars = [], reduce = false, lastClock = '';
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (_) { reduce = false; }
  function rgb() {
    var v = '0,229,255';
    try { v = (getComputedStyle(root).getPropertyValue('--accent-rgb') || v).trim() || v; } catch (_) { /* default */ }
    return v;
  }
  function light() { return root.getAttribute('data-theme') === 'grey'; }
  function size() {
    var r = card.getBoundingClientRect(); if (!r.width || !r.height) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.round(r.width), h = Math.round(r.height);
    if (w === W && h === H && ctx) return true;
    W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    ctx = cv.getContext('2d'); if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = []; var n = Math.max(18, Math.round(W * H / 5200));
    for (var i = 0; i < n; i++) stars.push({ x: Math.random() * W, y: Math.random() * H * .62, r: Math.random() * 1.1 + .25, p: Math.random() * 6.28, s: Math.random() * .8 + .3 });
    return true;
  }
  function idle() { return media.classList.contains('is-idle'); }
  function awake() {
    return idle() && !document.hidden && panel.classList.contains('open') && !media.hidden &&
      !root.classList.contains('hz-kb-open') && !root.classList.contains('hz-kb-moving');
  }
  function draw(t) {
    if (!ctx) return;
    var c = rgb(), lt = light(), s = t / 1000;
    var g = ctx.createLinearGradient(0, 0, 0, H);
    if (lt) { g.addColorStop(0, '#eef2f6'); g.addColorStop(1, '#cfd6de'); } else { g.addColorStop(0, '#04070d'); g.addColorStop(.55, '#0a1020'); g.addColorStop(1, '#10091c'); }
    ctx.globalCompositeOperation = 'source-over'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* aurora: three soft drifting blobs */
    var blobs = [[c, .34, .0, .9], ['255,43,214', .66, 1.9, .75], ['120,90,255', .5, 3.7, .6]];
    for (var b = 0; b < blobs.length; b++) {
      var bx = W * (blobs[b][1] + .22 * Math.sin(s * .21 + blobs[b][2])), by = H * (.38 + .12 * Math.cos(s * .17 + blobs[b][2] * 1.3));
      var rad = Math.max(W, H) * .52 * blobs[b][3];
      var rg = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
      rg.addColorStop(0, 'rgba(' + blobs[b][0] + ',' + (lt ? .26 : .3) + ')'); rg.addColorStop(1, 'rgba(' + blobs[b][0] + ',0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    /* perspective grid floor */
    var hor = H * .64; ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(' + c + ',' + (lt ? .16 : .13) + ')';
    ctx.beginPath();
    for (var k = -8; k <= 8; k++) { ctx.moveTo(W / 2 + k * W * .03, hor); ctx.lineTo(W / 2 + k * W * .17, H); }
    var off = (s * .35) % 1;
    for (var j = 0; j < 7; j++) { var f = (j + off) / 7, y = hor + (H - hor) * f * f; ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();
    /* stars */
    if (!lt) for (var i = 0; i < stars.length; i++) {
      var st = stars[i], a = .25 + .55 * (.5 + .5 * Math.sin(s * st.s + st.p));
      ctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(st.x, st.y, st.r, 0, 6.2832); ctx.fill();
    }
    /* waveform: mirrored bars + two glowing ribbons, all synthesised */
    var mid = H * .62, bars = Math.max(24, Math.min(64, Math.round(W / 6))), bw = W / bars;
    ctx.globalCompositeOperation = lt ? 'source-over' : 'lighter';
    for (var n = 0; n < bars; n++) {
      var x = n / bars, env = Math.pow(Math.sin(Math.PI * x), .8);
      var v = .5 + .5 * Math.sin(s * 1.9 + n * .46) * Math.sin(s * .7 + n * .13 + 1.2);
      v = (.12 + .88 * v * v) * env; var h = v * H * .24 + 2;
      var bg = ctx.createLinearGradient(0, mid - h, 0, mid + h);
      bg.addColorStop(0, 'rgba(' + c + ',.95)'); bg.addColorStop(.5, 'rgba(255,255,255,' + (lt ? .5 : .85) + ')'); bg.addColorStop(1, 'rgba(255,43,214,.9)');
      ctx.fillStyle = bg; var bx2 = n * bw + bw * .22;
      ctx.fillRect(bx2, mid - h, Math.max(1.5, bw * .56), h * 2);
    }
    /* V1.99.104: swirl + pulse (slow breathing); the old two ribbons stay as the fallback */
    if (window.HorizonSwirl) { ctx.globalCompositeOperation = 'source-over'; HorizonSwirl.draw(ctx, W, H, t, { live: true, energy: .45 + .2 * Math.sin(s * .8), pulse: .5 * Math.pow(.5 + .5 * Math.sin(s * 1.3), 2), bpm: 52, speed: 1, rgb: c, light: lt, mid: mid, span: .26 }); }
    else {
    for (var r = 0; r < 2; r++) {
      ctx.beginPath();
      for (var q = 0; q <= 60; q++) {
        var px = q / 60 * W, e2 = Math.sin(Math.PI * q / 60);
        var py = mid + Math.sin(q * .27 + s * (1.4 + r * .6) + r * 2) * H * .12 * e2 + Math.sin(q * .09 - s * .8) * H * .05 * e2;
        if (q) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.lineWidth = r ? 1.2 : 2; ctx.strokeStyle = r ? 'rgba(255,43,214,.75)' : 'rgba(' + c + ',.9)';
      ctx.shadowColor = r ? 'rgba(255,43,214,.9)' : 'rgba(' + c + ',.9)'; ctx.shadowBlur = 10; ctx.stroke(); ctx.shadowBlur = 0;
    }
    }
    ctx.globalCompositeOperation = 'source-over';
    /* vignette */
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * .35, W / 2, H / 2, Math.max(W, H) * .75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, lt ? 'rgba(120,130,145,.28)' : 'rgba(0,0,0,.5)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }
  function clock() {
    var d = new Date(), t = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
    if (t !== lastClock) { lastClock = t; timeEl.textContent = t; }
  }
  function frame(t) {
    raf = 0; if (!awake()) return;
    if (t - lastT >= 33 && size()) { lastT = t; draw(t); clock(); }
    raf = requestAnimationFrame(frame);
  }
  function wake() {
    if (raf) return;
    if (!awake()) return;
    if (!size()) { setTimeout(wake, 300); return; }
    if (reduce) { draw(4000); clock(); return; }
    raf = requestAnimationFrame(frame);
  }
  function sleep() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
  function check() { if (awake()) wake(); else sleep(); }
  try { new MutationObserver(check).observe(panel, { attributes: true, attributeFilter: ['class'] }); } catch (_) { /* no observer */ }
  try { new MutationObserver(check).observe(media, { attributes: true, attributeFilter: ['class', 'hidden'] }); } catch (_) { /* no observer */ }
  try { new MutationObserver(check).observe(root, { attributes: true, attributeFilter: ['class', 'data-theme', 'data-accent'] }); } catch (_) { /* no observer */ }
  document.addEventListener('visibilitychange', check);
  window.addEventListener('resize', function () { W = 0; check(); });
  check();
})();
