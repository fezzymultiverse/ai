'use strict';
// V1.99.51 heartbeat on the pink Settings tile. Real Chromium, real app. Serve repo root: python3 -m http.server 8134
const { chromium } = require('playwright'), assert = require('node:assert/strict');
(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] }); const errors = [];
  try {
    for (const theme of ['dark', 'neon', 'grey']) {
      const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
      await ctx.addInitScript(({ theme }) => { localStorage.setItem('horizon_soul_v', '999'); localStorage.setItem('horizon_theme', theme); }, { theme });
      const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message));
      await p.goto(process.env.HORIZON_URL || 'http://127.0.0.1:8134/www/index.html'); await p.waitForTimeout(700);
      // idle: nothing beats
      assert.equal(await p.evaluate(() => document.querySelector('.hzc-set').getAnimations({ subtree: true }).length), 0, 'no animation while idle');
      await p.evaluate(() => document.getElementById('mpMini').classList.add('playing')); await p.waitForTimeout(1500);
      const names = await p.evaluate(() => document.querySelector('.hzc-set').getAnimations({ subtree: true }).map(a => a.animationName).sort());
      assert.deepEqual(names, ['hzHeart', 'hzHeartGlow', 'hzHeartIcon', 'hzHeartRingA', 'hzHue', 'hzRimSpin']);
      const at = ms => p.evaluate(ms => {
        const t = document.querySelector('.hzc-set'); t.getAnimations({ subtree: true }).forEach(a => { a.pause(); a.currentTime = ms; });
        const m = new DOMMatrix(getComputedStyle(t).transform);
        return { s: Math.hypot(m.a, m.b), a: +getComputedStyle(t, '::before').opacity, b: +getComputedStyle(t, '::after').opacity, bs: getComputedStyle(t).boxShadow, f: getComputedStyle(t).filter, lite: document.documentElement.classList.contains('hz-lite') };
      }, ms);
      const rest = await at(0), lub = await at(76), gap = await at(152), dub = await at(304), quiet = await at(760);
      assert.ok(lub.s > 1.15, 'LUB kicks the body out'); assert.ok(gap.s < 1, 'it contracts between beats');
      assert.ok(dub.s > 1.08 && dub.s < lub.s, 'DUB is a second, softer beat');
      assert.ok(Math.abs(rest.s - 1) < .001 && Math.abs(quiet.s - 1) < .001, 'it rests between heartbeats');
      assert.ok(lub.b > .5 && rest.b === 0, 'the shock ring rolls out on the LUB'); assert.equal(lub.a, 1, 'the rainbow rim is always on while playing');
      assert.notEqual(lub.f, rest.f, 'glow flares on the beat (filter glow works in lite mode too)');
      assert.notEqual(lub.f, 'none'); if (!lub.lite) assert.notEqual(lub.bs, rest.bs, 'box-shadow glow flares too when lite mode is off');
      await ctx.close();
    }
  } finally { await browser.close(); }
  assert.deepEqual(errors, []); console.log('heartbeat.browser: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
