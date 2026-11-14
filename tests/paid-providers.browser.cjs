// V1.93.27: the four paid provider cards render, and a chat turn sends the right request shape to each (mocked network).
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'www');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (e, b) => { if (e) { res.writeHead(404).end(); return; }
    const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime}); res.end(b); });
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [], checks = [], seen = {};
  try {
    const page = await browser.newPage({ viewport: { width: 412, height: 915 } });
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('dialog', d => d.accept());
    await page.route('**/*', r => r.request().url().startsWith('http://127.0.0.1:') ? r.continue() : r.abort());
    const KEYS = { claude: 'sk-ant-api03-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789', openai: 'sk-proj-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789', deepseek: 'sk-' + '0123456789abcdef'.repeat(2), xai: 'xai-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789ab' };
    await page.addInitScript(k => { try { for (const id in k) localStorage.setItem('horizon_key_' + id, k[id]); if (!localStorage.getItem('horizon_active_provider')) localStorage.setItem('horizon_active_provider', 'claude'); } catch (e) {} }, KEYS);
    const answer = (id, text) => ({ status: 200, contentType: 'application/json', body: JSON.stringify(id === 'claude' ? { content: [{ type: 'text', text }], stop_reason: 'end_turn' } : { choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }] }) });
    for (const [id, pat] of [['claude', 'https://api.anthropic.com/v1/**'], ['openai', 'https://api.openai.com/v1/**'], ['deepseek', 'https://api.deepseek.com/**'], ['xai', 'https://api.x.ai/v1/**']]) {
      await page.route(pat, r => { const rq = r.request();
        if (rq.method() === 'POST') { seen[id] = { url: rq.url(), h: rq.headers(), b: JSON.parse(rq.postData() || '{}') }; return r.fulfill(answer(id, 'PAID-' + id + '-OK')); }
        return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ data: id === 'openai' ? [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o-audio-preview' }, { id: 'text-embedding-3-small' }, { id: 'gpt-4.1' }] : id === 'claude' ? [{ id: 'claude-haiku-5-5' }, { id: 'claude-sonnet-5-5' }] : id === 'xai' ? [{ id: 'grok-4-fast' }, { id: 'grok-2-image' }] : [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }) }); });
    }
    await page.goto('http://127.0.0.1:' + server.address().port, { waitUntil: 'load' });
    await page.waitForTimeout(500);
    assert.deepEqual(errors, []); checks.push('boot has no JavaScript errors');
    assert.deepEqual(await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(e => e.id); return ids.filter((x, i) => ids.indexOf(x) !== i); }), []); checks.push('all DOM IDs stay unique');
    await page.locator('#settingsBtn').evaluate(b => b.click()); await page.waitForTimeout(250);
    await page.locator('#settingsHome [data-tab="providers"]').click();
    const cards = await page.evaluate(() => ['Claude', 'ChatGPT', 'DeepSeek', 'Grok'].map(n => { const c = [...document.querySelectorAll('#providerList .provider-card')].find(x => (x.querySelector('h3,.provider-name,strong') || x).textContent.trim().startsWith(n)) || [...document.querySelectorAll('#providerList .provider-card')].find(x => x.textContent.includes(n)); return { n, has: !!c, icon: c ? !!c.querySelector('use[href^="#i-b-"]') : false }; }));
    for (const c of cards) { assert.ok(c.has, c.n + ' card missing'); assert.ok(c.icon, c.n + ' icon missing'); }
    checks.push('Claude, ChatGPT, DeepSeek and Grok cards render with icons');
    const order = await page.evaluate(() => { const kids = [...document.querySelectorAll('#providerList > .tier-head, #providerList > .provider-card')]; return kids.map(k => k.classList.contains('tier-head') ? 'H:' + k.firstChild.textContent : 'C:' + (((k.querySelector('[data-role="title"]') || {}).textContent || '').trim())).filter(x => x !== 'C:'); });
    const hf = order.indexOf('H:FREE TIER'), hp = order.indexOf('H:PAID TIER');
    assert.ok(hf >= 0 && hp > hf, 'Settings needs FREE TIER then PAID TIER headings');
    assert.deepEqual(order.slice(hp + 1), ['C:Claude', 'C:ChatGPT', 'C:DeepSeek', 'C:Grok (xAI)']);
    assert.ok(order.slice(hf + 1, hp).includes('C:Groq') && !order.slice(hf + 1, hp).some(x => /Claude|ChatGPT|DeepSeek|Grok \(xAI\)/.test(x)));
    checks.push('Settings: free providers sit under FREE TIER, the four paid ones under PAID TIER');
    {
      const hk = order.indexOf('H:KEYLESS');
      assert.ok(hk > hf && hk < hp, 'Settings needs a KEYLESS heading between FREE TIER and PAID TIER');
      const kl = order.slice(hk + 1, hp).map(x => x.replace(/^C:/, ''));
      assert.ok(kl.length >= 5, 'KEYLESS holds Pollinations, ch.at, Kilo, LLM7.io and OVHcloud');
      const sorted = kl.slice().sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
      assert.deepEqual(kl, sorted, 'KEYLESS cards are A to Z');
      assert.ok(!order.slice(hf + 1, hk).some(x => /Pollinations|ch\.at|Kilo|LLM7|OVH/i.test(x)), 'no keyless provider left under FREE TIER');
      checks.push('Settings: KEYLESS group sits between FREE TIER and PAID TIER, A to Z: ' + kl.join(', '));
    }
    await page.locator('#settingsBackBtn').click();
    await page.locator('#pickBtn').evaluate(b => b.click()); await page.waitForTimeout(200);
    const pk = await page.evaluate(() => [...document.querySelectorAll('#pkList > *')].map(k => k.classList.contains('pk-sec') ? 'H:' + k.textContent : 'R'));
    assert.equal(pk[0], 'H:FREE TIER'); assert.equal(pk.filter(x => x === 'H:PAID TIER').length, 1);
    assert.equal(pk.slice(pk.indexOf('H:PAID TIER') + 1).length, 4);
    checks.push('Choose an AI: FREE TIER first, then PAID TIER with the four paid rows');
    {
      const rows = await page.evaluate(() => [...document.querySelectorAll('#pkList > *')].map(k => k.classList.contains('pk-sec') ? 'H:' + k.textContent : 'R:' + ((k.querySelector('.pk-name,b,strong') || {}).textContent || k.textContent.slice(0, 20)).trim()));
      const a = rows.indexOf('H:KEYLESS'), b = rows.indexOf('H:PAID TIER');
      assert.ok(a > 0 && a < b, 'Choose an AI needs a KEYLESS heading between FREE TIER and PAID TIER');
      assert.equal(b - a - 1, 5, 'five keyless rows');
      const names = rows.slice(a + 1, b).map(x => x.replace(/^R:/, ''));
      checks.push('Choose an AI: KEYLESS group of 5 rows between the tiers: ' + names.join(' | '));
    }
    await page.keyboard.press('Escape'); await page.evaluate(() => { const o = document.querySelector('#pkSheet'); if (!o.hidden) document.querySelector('#pkClose, #pkSheet .pk-close')?.click(); });
    const want = { claude: 'https://api.anthropic.com/v1/messages', openai: 'https://api.openai.com/v1/chat/completions', deepseek: 'https://api.deepseek.com/chat/completions', xai: 'https://api.x.ai/v1/chat/completions' };
    for (const id of ['claude', 'openai', 'deepseek', 'xai']) {
      await page.evaluate(i => { try { localStorage.setItem('horizon_active_provider', i); } catch (e) {} }, id);
      await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(400);
      await page.locator('#chatInput').click(); await page.locator('#chatInput').fill('hello ' + id); await page.locator('#sendBtn').click();
      await page.waitForFunction(i => document.body.textContent.includes('PAID-' + i + '-OK'), id, { timeout: 20000 });
      const c = seen[id];
      assert.equal(c.url, want[id]);
      if (id === 'claude' || id === 'openai') assert.ok(!('temperature' in c.b), id + ' must not send temperature');   // DeepSeek and Grok accept it
      if (id === 'claude') {
        assert.equal(c.h['x-api-key'], KEYS.claude); assert.equal(c.h['anthropic-version'], '2023-06-01');
        assert.ok(typeof c.b.system === 'string' && c.b.system.length > 100 && c.b.messages[0].role === 'user' && c.b.max_tokens >= 1024);
        checks.push('Claude: POST /v1/messages with x-api-key, anthropic-version, system split out, no temperature, max_tokens set');
      } else {
        assert.equal(c.h.authorization, 'Bearer ' + KEYS[id]); assert.equal(c.b.messages[0].role, 'system');
        if (id === 'openai') assert.ok(!('max_tokens' in c.b), 'ChatGPT must not send max_tokens');
        checks.push(id + ': POST ' + want[id].replace('https://', '') + ' with Bearer key and the system message first');
      }
    }
    assert.deepEqual(errors, []);
  } finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ checks, errors }, null, 2));
})().catch(e => { console.error(e); process.exit(1); });
