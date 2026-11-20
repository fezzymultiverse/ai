'use strict';
// V1.99.102 plus menu clean-up + Gemini ears on the media player. Real Chromium, real app, local test streams, Gemini mocked (no internet needed).
// Run: node tests/ears-v102.browser.cjs   (env HZ_CHROMIUM = path to a chromium binary, optional)
const { chromium } = require('playwright'), assert = require('node:assert/strict');
const http = require('node:http'), path = require('node:path');

function wav(sec) {
  const sr = 8000, n = sr * sec, b = Buffer.alloc(44 + n);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr, 28); b.writeUInt16LE(1, 32); b.writeUInt16LE(8, 34); b.write('data', 36); b.writeUInt32LE(n, 40);
  for (let i = 0; i < n; i++) b[44 + i] = 128 + Math.round(70 * Math.sin(i * 0.21) + 40 * Math.sin(i * 0.9));
  return b;
}
const WAV = wav(120);
const srv = http.createServer((q, r) => {
  const cors = q.url.startsWith('/cors/'), hdr = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'none' };
  if (cors) hdr['Access-Control-Allow-Origin'] = '*';
  r.writeHead(200, Object.assign(hdr, { 'Content-Length': WAV.length })); r.end(WAV);
});

(async () => {
  await new Promise(ok => srv.listen(0, '127.0.0.1', ok));
  const port = srv.address().port, root = path.resolve(__dirname, '..');
  const opts = { headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] };
  if (process.env.HZ_CHROMIUM) opts.executablePath = process.env.HZ_CHROMIUM;
  const browser = await chromium.launch(opts), errors = [], results = [];
  const ok = (name) => { results.push(name); console.log('PASS ' + name); };
  const gemini = [];
  async function open(cors) {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 } });
    const st = { name: 'Test FM', url: `http://127.0.0.1:${port}/${cors ? 'cors' : 'nocors'}/tone.wav`, f: { band: 'FM', v: 99.5 }, country: 'South Africa', tags: 'test · tone' };
    await ctx.route('https://generativelanguage.googleapis.com/**', async route => {
      gemini.push(JSON.parse(route.request().postData() || '{}'));
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Steady tone, pure sine, no vocals.' }] } }] }) });
    });
    await ctx.addInitScript(({ st }) => {
      localStorage.setItem('horizon_soul_v', '999'); localStorage.setItem('horizon_radio_v1', JSON.stringify({ fav: [st], vol: 0.2 }));
      localStorage.setItem('horizon_ears_hear', '1'); localStorage.setItem('horizon_key_gemini', 'TESTKEY');
    }, { st });
    const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); p.on('dialog', d => d.accept());   // the privacy confirm before sending to Gemini
    await p.goto('file://' + path.join(root, 'www/index.html')); await p.waitForTimeout(1500);
    await p.evaluate(() => document.getElementById('leftPanel').classList.add('open')); await p.waitForTimeout(700);
    return { ctx, p };
  }
  try {
    // ---- 1. plus menu: Web, GitHub and Music rows are gone, menu still opens and closes clean ----
    { const { ctx, p } = await open(true);
      await p.evaluate(() => document.getElementById('leftPanel').classList.remove('open')); await p.waitForTimeout(500);
      await p.click('#webToggle'); await p.waitForTimeout(300);
      const m = await p.evaluate(() => ({ web: !!document.getElementById('tm-web'), gh: !!document.getElementById('tm-gh'), music: !!document.getElementById('tm-music'), open: !document.getElementById('toolMenu').hidden, label: document.getElementById('webToggle').getAttribute('aria-label'), strip: document.getElementById('hzStrip').hidden }));
      assert.equal(m.web, false); assert.equal(m.gh, false); assert.equal(m.music, false); ok('plus menu has no Web, GitHub or Music row');
      assert.equal(m.open, true); assert.equal(m.label, 'Chat tools'); assert.equal(m.strip, true); ok('menu opens, plus button label is plain, no tool chips');
      await p.click('.hz-tools-close'); await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => document.getElementById('toolMenu').hidden), true); ok('menu closes');
      await ctx.close(); }

    // ---- 2. music is always visible to the AI, nothing can hide it ----
    { const { ctx, p } = await open(true);
      await p.evaluate(() => { localStorage.setItem('horizon_music_ai', '0'); });
      const s = await p.evaluate(() => { HorizonMusic.setAi(false); return { sees: HorizonMusic.seesAi(), eye: document.querySelectorAll('.mp-eye').length, blk: HorizonToolPolicy.block({ web: true, webSearch: true, webScrape: true }) }; });
      assert.equal(s.sees, true); assert.equal(s.eye, 0); ok('music is always visible to the AI (old hide flag and setAi(false) cannot hide it)');
      assert.match(s.blk, /LOCAL MUSIC LIVE/); assert.match(s.blk, /PROMPT = PERMISSION \(WEB\)/); ok('tool contract: music live, web is prompt = permission');
      const off = await p.evaluate(() => HorizonToolPolicy.block({ web: false }));
      const webRow = off.split('\n\n').filter(x => /^WEB /.test(x))[0] || ''; assert.match(webRow, /no Web switch/); assert.doesNotMatch(webRow, /switch (?:it )?on|turn .* on/i); ok('without a scraper key the AI only mentions the key, never a switch');
      await ctx.close(); }

    // ---- 3. radio ears with a CORS station: records real audio and sends it to Gemini ----
    { const { ctx, p } = await open(true);
      await p.evaluate(() => HorizonRadio.run('radio.play', 'Test FM')); await p.waitForTimeout(1800);
      const cap = await p.evaluate(() => HorizonRadio.capture(5).then(c => { let pk = 0; for (let i = 0; i < c.pcm.length; i++) if (Math.abs(c.pcm[i]) > pk) pk = Math.abs(c.pcm[i]); return { n: c.pcm.length, rate: c.rate, secs: c.secs, pk }; }));
      assert.equal(cap.rate, 16000); assert.ok(cap.secs >= 4 && cap.secs <= 6, 'secs ' + cap.secs); assert.ok(cap.n > 16000 * 4); assert.ok(cap.pk > 0.05, 'peak ' + cap.pk); ok('HorizonRadio.capture returns about 5 s of real 16 kHz audio');
      // unit ear button opens the radio sheet while a station is on air
      await p.click('#hzUnitEar'); await p.waitForTimeout(300);
      const sh = await p.evaluate(() => ({ open: !document.getElementById('oaEars').hidden, stn: document.getElementById('oaeStn').textContent, chips: document.querySelectorAll('#oaeLen button').length, note: document.getElementById('oaeNote').textContent }));
      assert.equal(sh.open, true); assert.match(sh.stn, /Test FM/); assert.equal(sh.chips, 4); ok('unit ear button opens the radio ears sheet for the station on air');
      await p.click('#oaeLen [data-s="10"]'); await p.fill('#oaeQ', 'what is this?'); gemini.length = 0;
      await p.click('#oaeGo');
      await p.waitForFunction(() => /Steady tone/.test(document.getElementById('oaeLog').textContent), null, { timeout: 30000 });
      assert.equal(gemini.length, 1); const parts = gemini[0].contents[0].parts;
      assert.match(parts[0].text, /RADIO STATION: Test FM/); assert.match(parts[0].text, /An audio clip is attached/); assert.equal(parts[1].inlineData.mimeType, 'audio/wav'); assert.ok(parts[1].inlineData.data.length > 100000, 'audio is in the request');
      assert.match(gemini[0].systemInstruction.parts[0].text, /live radio station/); ok('Gemini gets the station details, a WAV clip and the radio instruction');
      const log = await p.evaluate(() => document.getElementById('oaeLog').textContent); assert.match(log, /He heard 10 s of Test FM/); ok('sheet shows the answer and how much he heard');
      await ctx.close(); }

    // ---- 4. radio ears with a no-CORS station: honest, no audio, still answers from the station details ----
    { const { ctx, p } = await open(false);
      await p.evaluate(() => HorizonRadio.run('radio.play', 'Test FM')); await p.waitForTimeout(1800);
      const err = await p.evaluate(() => HorizonRadio.capture(5).then(() => 'resolved', e => e.message)); assert.match(err, /does not let Horizon record/); ok('no-CORS station: capture refuses honestly');
      gemini.length = 0;
      const r = await p.evaluate(() => HorizonMusic.askRadio('what is this?', 10).then(x => ({ heard: x.heard, why: x.why, text: x.text })));
      assert.equal(r.heard, false); assert.match(r.why, /does not let Horizon record/); assert.equal(gemini[0].contents[0].parts.length, 1); assert.match(gemini[0].contents[0].parts[0].text, /No audio is attached/); ok('no-CORS station: Gemini is told no audio is attached, nothing is faked');
      await ctx.close(); }

    // ---- 5. no station on air: unit ear button hands over to the music ears (Play a song first) ----
    { const { ctx, p } = await open(true);
      const e = await p.evaluate(() => HorizonMusic.askRadio('x', 10).then(() => 'resolved', e => e.message)); assert.match(e, /No station is on air/); ok('askRadio with nothing on air says so');
      await ctx.close(); }

    assert.deepEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('\nALL ' + results.length + ' PASSED');
  } catch (e) { console.error('FAIL:', e.message); process.exitCode = 1; }
  finally { await browser.close(); srv.close(); }
})();
