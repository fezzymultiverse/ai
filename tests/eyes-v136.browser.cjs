'use strict';
// V1.99.136 Horizon Eyes 2 in real Chromium: real canvas pixel measurement, zoom crop, exact colour, and the full app boots with the module loaded.
// Run: node tests/eyes-v136.browser.cjs   (env HZ_CHROMIUM = path to a chromium binary, optional)
const { chromium } = require('playwright'), assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '..', 'www');
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+$/, '/index.html'));
  fs.readFile(f.endsWith(path.sep) ? f + 'index.html' : f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : 'text/html' }); r.end(b); } });
});
(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const opts = { headless: true, args: ['--no-sandbox'] }; if (process.env.HZ_CHROMIUM) opts.executablePath = process.env.HZ_CHROMIUM;
  const br = await chromium.launch(opts), pg = await br.newPage({ viewport: { width: 412, height: 860 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e)));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await pg.waitForTimeout(1500);
  assert.equal(await pg.evaluate(() => typeof window.HorizonEyes + ':' + HorizonEyes.version), 'object:1.99.147');
  const out = await pg.evaluate(async () => {
    // 600x400 test picture: yellow top-left quarter band, blue elsewhere, a red dot at (90%,90%)
    const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
    x.fillStyle = '#1E3CDC'; x.fillRect(0, 0, 600, 400); x.fillStyle = '#FFD400'; x.fillRect(0, 0, 200, 133); x.fillStyle = '#E02020'; x.fillRect(520, 340, 60, 40);
    const g = { mime: 'image/png', b64: c.toDataURL('image/png').split(',')[1] };
    const asks = [];
    HorizonEyes.init({ ask: async (gg, prompt) => { asks.push({ len: gg.b64.length, prompt }); return { text: 'Reads: SALE 50% off.', via: 'Mock (m)' }; }, chatId: () => 'cc', canSee: () => false, ready: () => true });
    const facts = await HorizonEyes.analyze(g); const n = HorizonEyes.register('cc', g, {});
    const col = await HorizonEyes.run('see.color', n + ' | 5%,5%; 90%,90%; 70%,70%');
    const zoom = await HorizonEyes.run('see.zoom', n + ' | top-left | what is it?');
    const ask = await HorizonEyes.run('see.ask', n + ' | what text?');
    return { facts, col: col.text, zoom: zoom.text, ask: ask.text, asks };
  });
  assert.match(out.facts, /size 600x400 px, landscape/); assert.match(out.facts, /blue #1E3CDC/i); assert.match(out.facts, /top-left: yellow #FFD400/i); assert.match(out.facts, /bottom-right: (?:blue|red)/i);
  assert.match(out.col, /5%,5%[^\n]*yellow #FFD400 rgb\(255,212,0\)/); assert.match(out.col, /90%,90%[^\n]*red #E02020/i); assert.match(out.col, /70%,70%[^\n]*blue #1E3CDC/i);
  assert.match(out.zoom, /ZOOM top-left/); assert.match(out.zoom, /PIXEL MEASUREMENTS OF THIS REGION[\s\S]*yellow #FFD400 100%/i);
  assert.ok(out.asks[0].len > 100, 'the cropped picture really went to the reader'); assert.match(out.ask, /SALE 50% off/);
  const lensTxt = await pg.evaluate(async () => { HorizonLens.show(); await new Promise(r => setTimeout(r, 200)); const v = document.getElementById('hzLensView'); return v ? v.textContent : ''; });
  assert.match(lensTxt, /HORIZON EYES \(for models that cannot see\)/); assert.match(lensTxt, /WHEN THE AI LOOKS/);
  const hard = errs.filter(e => !/Capacitor|native|Failed to fetch|NetworkError|CORS|ResizeObserver/i.test(e)); assert.deepEqual(hard, [], 'no page errors: ' + hard.join(' | '));
  await br.close(); srv.close(); console.log('eyes-v136 browser: OK');
})().catch(e => { console.error(e); process.exit(1); });
