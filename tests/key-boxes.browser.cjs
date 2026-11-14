// V1.93.25: ch.at card + icon, the two paste boxes, scraper backup keys and key failover, driven through the real page.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'www');
const reportDir = process.env.HORIZON_REPORT_DIR || path.resolve(__dirname, '..', 'validation');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404).end(); return; }
    const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime}); res.end(b); });
});
(async () => {
  fs.mkdirSync(reportDir, { recursive: true });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [], checks = [];
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 1 });
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('dialog', d => d.accept());   // the "Send to <AI>?" no-training confirm must be accepted or the send stops
    await page.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:') ? r.continue() : r.abort());
    await page.addInitScript(() => { try { localStorage.setItem('horizon_active_provider', 'pollinations'); } catch (e) {} });
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    assert.deepEqual(errors, []); checks.push('boot has no uncaught JavaScript errors');
    assert.deepEqual(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); }), []);
    checks.push('all DOM IDs unique (the new box and ch.at card add none twice)');

    // ---- ch.at card + icon
    await page.locator('#settingsBtn').evaluate(b => b.click()); await page.waitForTimeout(250);
    await page.locator('#settingsHome [data-tab="providers"]').click();
    const chat = await page.evaluate(() => { const c = [...document.querySelectorAll('#providerList .provider-card')].find(x => /ch\.at/i.test(x.textContent)); if (!c) return null;
      return { icon: !!c.querySelector('use[href="#i-b-chatat"]'), keyHidden: getComputedStyle(c.querySelector('.key-field')).display === 'none', text: c.textContent.replace(/\s+/g, ' ').slice(0, 300) }; });
    assert.ok(chat, 'ch.at card missing'); assert.ok(chat.icon, 'ch.at card has no chatat icon'); assert.ok(chat.keyHidden, 'ch.at must not show a key box');
    assert.match(chat.text, /Free/);
    checks.push('ch.at card renders with its own icon, no key field, marked Free');
    assert.ok(await page.evaluate(() => { const u = document.querySelector('symbol#i-b-chatat'); return !!u && u.querySelectorAll('path,rect').length >= 3; }));
    checks.push('i-b-chatat SVG symbol is defined');

    // ---- AI box: model names are not keys; scraper key is left for the other box
    const G = 'gsk_Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789ab', FC = 'fc-0a1b2c3d4e5f0a1b2c3d4e5f0a1b2c3d4e5f';
    if (!(await page.locator('#hzAiKeyNote').isVisible())) await page.locator('#hzKeyImporter > .settings-row-header').click();
    await page.locator('#hzAiKeyNote').fill('Mistral model: mistral-small-latest-2506-instruct\nMistral config: settings_backup_final_v2.json\nGroq: ' + G + '\nFirecrawl: ' + FC);
    await page.locator('#hzAiKeyExtract').click();
    assert.equal(await page.locator('#hzAiKeyResults input[type="checkbox"]').count(), 1);
    const aiText = await page.locator('#hzAiKeyResults').textContent();
    assert.match(aiText, /Groq/); assert.match(aiText, /Firecrawl/); assert.match(aiText, /Web Scraping/);
    assert.ok(!aiText.includes(G) && !aiText.includes(FC) && !/mistral-small/i.test(aiText));
    assert.equal(await page.evaluate(() => localStorage.getItem('horizon_key_groq')), null);
    checks.push('AI box finds only the Groq key, never the model/file names, masks it, saves nothing at extract time, and points the Firecrawl key to Web Scraping');
    await page.locator('#hzAiKeyClear').click();

    // ---- Web box: main + backup, masked, verified before storing
    await page.locator('#settingsBackBtn').click();
    await page.locator('#settingsHome [data-tab="web"]').click();
    if (!(await page.locator('#hzWebKeyNote').isVisible())) await page.locator('#hzWebKeyImporter > .settings-row-header').click();
    const K1 = 'fc-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk', K2 = 'fc-Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp', BAD = 'fc-Bad0Bad1Bad2Bad3Bad4Bad5Bad6Bad';
    const seen = [];
    await page.route('https://api.firecrawl.dev/v2/team/credit-usage', r => { const k = (r.request().headers().authorization || '').replace('Bearer ', ''); seen.push(k);
      return r.fulfill(k === BAD ? { status: 401, contentType: 'application/json', body: '{"error":"bad key"}' } : { status: 200, contentType: 'application/json', body: '{"success":true,"data":{}}' }); });
    await page.locator('#hzWebKeyNote').fill('Firecrawl: ' + K1 + '\nFirecrawl backup: ' + K2 + '\nFirecrawl old: ' + BAD + '\nGroq: ' + G);
    await page.locator('#hzWebKeyExtract').click();
    assert.equal(await page.locator('#hzWebKeyResults input[type="checkbox"]').count(), 3);
    const wt = await page.locator('#hzWebKeyResults').textContent();
    assert.match(wt, /belong in the Providers box/); assert.ok(!wt.includes(K1) && !wt.includes(K2));
    await page.locator('#hzWebKeySave').click();
    await page.waitForFunction(() => document.querySelector('#hzWebKeySave').disabled === false, null, { timeout: 20000 });
    const st = await page.evaluate(() => ({ main: localStorage.getItem('horizon_webkey_firecrawl'), xs: JSON.parse(localStorage.getItem('horizon_xwkeys_firecrawl') || '[]') }));
    assert.equal(st.main, K1); assert.deepEqual(st.xs, [K2]);
    assert.ok(!st.xs.includes(BAD) && st.main !== BAD, 'a key the service rejected must never be stored');
    checks.push('web box: first verified key becomes main, second becomes a backup, the rejected key is stored nowhere, AI key left alone');
    const slots = await page.locator('#hzWebBackups').textContent();
    assert.match(slots, /Main · ••••j0Kk/); assert.match(slots, /Backup 1 · ••••q0Pp/); assert.ok(!slots.includes(K1));
    checks.push('saved keys and backups list shows masked main + backup');
    await page.locator('#hzWebKeyNote').fill('Firecrawl: ' + K2); await page.locator('#hzWebKeyExtract').click();
    assert.match(await page.locator('#hzWebKeyResults').textContent(), /already saved/);
    checks.push('pasting a key that is already saved says so and does not duplicate it');
    await page.screenshot({ path: path.join(reportDir, 'web-backup-keys.png') });

    // ---- failover through a real chat turn: main -> 402, backup -> page text
    const auth = [];
    await page.route('https://api.firecrawl.dev/v2/scrape', r => { const k = (r.request().headers().authorization || '').replace('Bearer ', ''); auth.push(k);
      return r.fulfill(k === K1 ? { status: 402, contentType: 'application/json', body: '{"error":"Insufficient credits"}' } : { status: 200, contentType: 'application/json', body: '{"data":{"markdown":"# Example page text from backup"}}' }); });
    let polls = 0;
    await page.route('https://text.pollinations.ai/**', r => { polls++; const body = polls === 1 ? '[[web.scrape: https://example.com]]' : 'FAILOVER-DONE: ' + (r.request().postData() || '').includes('Example page text from backup');
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { role: 'assistant', content: body }, finish_reason: 'stop' }] }) }); });
    await page.evaluate(() => { const rp = document.querySelector('#rightPanel'); if (rp.classList.contains('open')) document.querySelector('#rightTrigger').click(); });
    await page.waitForFunction(() => !document.querySelector('#rightPanel').classList.contains('open'), null, { timeout: 5000 });
    await page.locator('#chatInput').click(); await page.locator('#chatInput').fill('read example.com'); await page.waitForTimeout(300);
    await page.locator('#sendBtn').click(); await page.waitForTimeout(300);
    await page.waitForFunction(() => /FAILOVER-DONE: (true|false)/.test(document.body.textContent), null, { timeout: 30000 });   // replies type out letter by letter: wait for the last word
    assert.deepEqual(auth, [K1, K2]);
    assert.match(await page.evaluate(() => document.body.textContent), /FAILOVER-DONE: true/);
    checks.push('end to end: main key got HTTP 402, the backup key was tried next, and its page text reached the AI');
    assert.deepEqual(errors, []);
    await page.screenshot({ path: path.join(reportDir, 'failover-chat.png') });
  } finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ checks, errors }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
