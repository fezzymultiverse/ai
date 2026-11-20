'use strict';
// V1.99.147 on-phone reader in real Chromium: bundled Tesseract reads a generated screenshot (light and dark mode), finds white text on a coloured
// button, zooms, answers see.ask / see.find with NO provider, and makes no network request outside the app's own origin while it reads.
// Run: node tests/sight-v147.browser.cjs   (env HZ_CHROMIUM = path to a chromium binary, optional)
const { chromium } = require('playwright'), assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path'), fs = require('node:fs');
const root = path.resolve(__dirname, '..', 'www');
const mime = f => f.endsWith('.js') || f.endsWith('.mjs') ? 'text/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.gz') ? 'application/gzip' : f.endsWith('.png') ? 'image/png' : 'text/html';
const srv = http.createServer((q, r) => {
  const f = path.join(root, decodeURIComponent(q.url.split('?')[0]).replace(/^\/+$/, '/index.html'));
  fs.readFile(f.endsWith(path.sep) ? f + 'index.html' : f, (e, b) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'Content-Type': mime(f) }); r.end(b); } });
});
(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const opts = { headless: true, args: ['--no-sandbox'] }; if (process.env.HZ_CHROMIUM) opts.executablePath = process.env.HZ_CHROMIUM;
  const br = await chromium.launch(opts), pg = await br.newPage({ viewport: { width: 412, height: 860 } });
  const errs = []; pg.on('pageerror', e => errs.push(String(e && e.message || e)));
  await pg.goto('http://127.0.0.1:' + srv.address().port + '/index.html'); await pg.waitForTimeout(1500);
  assert.equal(await pg.evaluate(() => typeof window.HorizonSight + ':' + HorizonSight.version + ':' + HorizonSight.available()), 'object:1.99.147:true');
  const outside = []; pg.on('request', r => { const u = new URL(r.url()); if (!/^(?:127\.0\.0\.1|localhost|ipapi\.co|get\.geojs\.io|ipinfo\.io)$/.test(u.hostname) && u.protocol !== 'data:' && u.protocol !== 'blob:') outside.push(r.url()); });

  const out = await pg.evaluate(async () => {
    function shot(dark) {
      const c = document.createElement('canvas'); c.width = 540; c.height = 1000; const x = c.getContext('2d');
      x.fillStyle = dark ? '#121212' : '#ffffff'; x.fillRect(0, 0, 540, 1000);
      x.fillStyle = dark ? '#eeeeee' : '#111111'; x.font = 'bold 34px sans-serif'; x.fillText('Settings', 30, 60);
      x.font = '24px sans-serif'; x.fillText('Dark mode is ON for Horizon', 30, 150); x.fillText('Battery 87% remaining', 30, 200);
      x.fillStyle = '#1E3CDC'; x.fillRect(30, 400, 200, 60); x.fillStyle = '#ffffff'; x.font = 'bold 26px sans-serif'; x.fillText('Send', 85, 440);
      x.fillStyle = dark ? '#eeeeee' : '#111111'; x.font = '22px sans-serif'; x.fillText('Home', 40, 960); x.fillText('Search', 220, 960); x.fillText('Library', 420, 960);
      return { mime: 'image/png', b64: c.toDataURL('image/png').split(',')[1] };
    }
    function photo() {   // no text at all: smooth gradients and noise-like blobs
      const c = document.createElement('canvas'); c.width = 600; c.height = 400; const x = c.getContext('2d');
      const gr = x.createLinearGradient(0, 0, 600, 400); gr.addColorStop(0, '#2b6cb0'); gr.addColorStop(0.5, '#f6ad55'); gr.addColorStop(1, '#2f855a'); x.fillStyle = gr; x.fillRect(0, 0, 600, 400);
      for (let i = 0; i < 140; i++) { x.fillStyle = 'rgba(' + ((i * 53) % 255) + ',' + ((i * 97) % 255) + ',' + ((i * 31) % 255) + ',0.35)'; x.beginPath(); x.arc((i * 71) % 600, (i * 43) % 400, 6 + (i % 23), 0, 7); x.fill(); }
      return { mime: 'image/png', b64: c.toDataURL('image/png').split(',')[1] };
    }
    HorizonEyes.init({ chatId: () => 'cc', canSee: () => false, ready: () => false });   // helpers OFF: no vision provider can answer
    const r = {};
    const light = shot(false), dark = shot(true);
    const t0 = Date.now(); r.light = await HorizonEyes.readLocal(light); r.lightMs = Date.now() - t0;
    r.dark = await HorizonEyes.readLocal(dark);
    r.photo = await HorizonEyes.readLocal(photo());
    const n = HorizonEyes.register('cc', light, { via: 'x' });
    r.find = (await HorizonEyes.run('see.find', n + ' | send')).text;
    r.findMissing = (await HorizonEyes.run('see.find', n + ' | warranty')).text;
    r.zoom = (await HorizonEyes.run('see.zoom', n + ' | bottom | which tabs are there?')).text;
    r.ask = (await HorizonEyes.run('see.ask', n + ' | what is the battery level?')).text;
    r.color = (await HorizonEyes.run('see.color', n + ' | 15%,43%')).text;
    r.block = HorizonEyes.block(false, 'cc');
    r.status = HorizonSight.status();
    HorizonSight.stop();
    r.afterStop = HorizonSight.status().warm;
    return r;
  });

  for (const k of ['light', 'dark']) {
    const t = out[k].text;
    assert.match(t, /ON-PHONE READING/, k); assert.match(t, /Settings/, k); assert.match(t, /Dark mode is ON for Horizon/i, k); assert.match(t, /Battery 87% remaining/, k);
    assert.match(t, /Home\s+\|\s+Search\s+\|\s+Library/, k + ': the tab bar is one row');
    assert.match(t, /\] Send\b/, k + ': white text on a coloured button is read');
    assert.match(t, /PIXEL MEASUREMENTS/, k); assert.match(t, /LIMITS: this reader finds and reads TEXT/, k); assert.ok(!/\[\[/.test(t), 'no tag can leak out of a picture');
    assert.equal(out[k].via, 'the on-phone reader');
  }
  assert.match(out.dark.text, /light-on-dark picture, read inverted/);
  assert.match(out.photo.text, /TEXT FOUND: none/); assert.match(out.photo.text, /cannot recognise objects/); assert.match(out.photo.text, /lots of fine detail|mix of flat areas/);
  assert.match(out.find, /FOUND "send"[\s\S]*"Send" \[middle left\][\s\S]*background (?:blue|dark blue) #[0-9A-F]{6}[\s\S]*text about (?:white|light grey)/i);
  assert.match(out.findMissing, /were NOT found[\s\S]*Do not claim/);
  assert.match(out.zoom, /RE-READ ON THIS PHONE[\s\S]*Home\s+\|\s+Search\s+\|\s+Library/); assert.match(out.zoom, /PIXEL MEASUREMENTS OF THIS REGION/);
  assert.match(out.ask, /read ON THIS PHONE[\s\S]*ROWS THAT MATCH YOUR QUESTION:[\s\S]*Battery 87% remaining/);
  assert.match(out.color, /blue #1E3CDC/i);
  assert.match(out.block, /^EYES: you cannot see pictures\./); assert.ok(out.block.length < 1500, 'prompt block is compact: ' + out.block.length);
  assert.equal(out.status.available, true); assert.equal(out.afterStop, false, 'the worker is released on stop');
  assert.deepEqual(outside, [], 'nothing left the app while reading: ' + outside.join(', '));
  const hard = errs.filter(e => !/Capacitor|native|Failed to fetch|NetworkError|CORS|ResizeObserver/i.test(e)); assert.deepEqual(hard, [], 'no page errors: ' + hard.join(' | '));
  await br.close(); srv.close(); console.log('sight-v147 browser: OK (first read ' + out.lightMs + ' ms)');
})().catch(e => { console.error(e); process.exit(1); });
