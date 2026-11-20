'use strict';
// V1.99.138 host-browser checks with mocked Android bridges and a mocked YouTube host. This is NOT a device run.
// Run: PLAYWRIGHT_BROWSERS_PATH=... node --test tests/v138.browser.cjs
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const PAGE = '<!doctype html><html><body style="background:#08121b;color:#caffff"><header></header><main><div id="chatMessages"></div><div id="hzTerminalPermissions"></div></main></body></html>';
async function boot() {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 412, height: 860 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('http://horizon.local/**', r => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.goto('http://horizon.local/');
  return { browser, page, errors };
}
test('file plan: presentable card, Delete asks first, only ticked items go to Trash, unticked are kept', async () => {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate(() => {
      window.mock = { enabled: false, granted: true, calls: [], entries: [], counter: 0 }; const m = window.mock;
      const mutation = async (action, data) => { m.calls.push({ action, data }); const id = String(++m.counter); const to = action === 'moveToTrash' ? '/storage/emulated/0/Documents/Trash/' + data.path.split('/').pop() : (data.to || data.path); m.entries.push({ id, time: Date.now(), action, from: data.from || data.path || '', to, reason: data.reason || '', status: 'completed' }); return { ok: true, path: to, entryId: id }; };
      window.Capacitor = { Plugins: { HorizonFilesAccess: {
        status: async () => ({ ok: true, enabled: m.enabled, granted: m.granted }), setEnabled: async d => ({ ok: true, enabled: m.enabled = d.enabled && m.granted }), requestAccess: async () => ({ ok: true }),
        beginMessage: async () => ({ ok: true }), declareScope: async d => ({ ok: true, scopeRoots: d.scopeRoots }), retreat: async () => ({ ok: true }), history: async () => ({ ok: true, entries: m.entries }),
        managers: async () => ({ ok: true, apps: [], preferred: '' }), openFolder: async () => ({ ok: true }), folders: async () => ({ ok: true, folders: [] }) },
        HorizonFiles: { list: async () => ({ ok: true, entries: [] }), stat: async () => ({ ok: true }), makeFolder: d => mutation('makeFolder', d), move: d => mutation('move', d), rename: d => mutation('rename', d), moveToTrash: d => mutation('moveToTrash', d), undo: async () => ({ ok: true }) } } };
    });
    await page.addStyleTag({ path: path.join(root, 'www/horizon_files.css') });
    await page.addScriptTag({ path: path.join(root, 'www/horizon_files.js') });
    await page.addScriptTag({ path: path.join(root, 'www/horizon_dash.js') });
    await page.waitForSelector('#hzf-manager');
    await page.evaluate(async () => { await HorizonFiles.enable(); await HorizonFiles.begin('Clean up my Pictures folder and delete the blurry ones', 'v138a'); await HorizonFiles.run('files.scope', '["/storage/emulated/0/Pictures"]'); });
    const P = '/storage/emulated/0/Pictures/';
    const ops = []; for (let i = 1; i <= 6; i++) ops.push({ action: 'move', from: P + 'a' + i + '.jpg', to: P + 'Places/a' + i + '.jpg', reason: 'Group by place' });
    ops.push({ action: 'moveToTrash', path: P + 'blur1.jpg', reason: 'Blurry' }); ops.push({ action: 'moveToTrash', path: P + 'blur2.jpg', reason: 'Blurry' });
    await page.evaluate(o => { window.planResult = null; HorizonDash.run('files.plan', JSON.stringify({ ops: o })).then(r => window.planResult = JSON.parse(r.text)); }, ops);
    await page.waitForSelector('.hzf-plan');
    assert.match(await page.locator('.hzf-head').textContent(), /8 changes/);
    assert.equal(await page.locator('.hzf-chip.rm').count(), 1);
    assert.equal(await page.locator('.hzf-operations li:visible').count(), 6);   // first 6 only
    await page.getByRole('button', { name: 'Show all 8' }).click();
    assert.equal(await page.locator('.hzf-operations li:visible').count(), 8);
    assert.match(await page.locator('.hzf-warn').textContent(), /2 items would be deleted/);
    const plan = page.locator('.hzf-plan').last();
    await plan.getByRole('button', { name: 'Apply…', exact: true }).click();
    assert.equal(await page.locator('.hzf-confirm').isVisible(), true);
    assert.equal(await page.evaluate(() => mock.calls.length), 0);              // nothing runs before he decides
    assert.equal(await page.locator('.hzf-tick input:checked').count(), 0);     // nothing pre-ticked
    await page.locator('.hzf-tick input').first().check();                      // blur1 only
    await plan.getByRole('button', { name: 'Move ticked to Trash' }).click();
    await page.waitForFunction(() => window.planResult);
    const calls = await page.evaluate(() => mock.calls);
    assert.equal(calls.filter(c => c.action === 'move').length, 6);
    const trash = calls.filter(c => c.action === 'moveToTrash');
    assert.equal(trash.length, 1); assert.match(trash[0].data.path, /blur1\.jpg$/); assert.equal(trash[0].data.userConfirmed, true);
    const res = await page.evaluate(() => planResult.results.map(r => [r.action, r.result.ok, r.result.code || '']));
    assert.deepEqual(res[7], ['moveToTrash', false, 'KEPT']);
    assert.match(await page.evaluate(() => HorizonFiles.finalize('x')), /7 of 8 changes done · 1 moved to Trash.*1 kept/s);
    assert.equal(await page.locator('.hzf-bar.ok').count(), 1);
    // "Keep all, run the rest": no delete reaches the bridge
    await page.evaluate(async () => { mock.calls = []; await HorizonFiles.begin('Delete the blurry ones please', 'v138b'); await HorizonFiles.run('files.scope', '["/storage/emulated/0/Pictures"]'); });
    await page.evaluate(o => { window.planResult = null; HorizonDash.run('files.plan', JSON.stringify({ ops: o.slice(6) })).then(r => window.planResult = JSON.parse(r.text)); }, ops);
    await page.locator('.hzf-plan').last().getByRole('button', { name: 'Apply…', exact: true }).click();
    await page.locator('.hzf-plan').last().getByRole('button', { name: 'Keep all, run the rest' }).click();
    await page.waitForFunction(() => window.planResult);
    assert.equal(await page.evaluate(() => mock.calls.filter(c => c.action === 'moveToTrash').length), 0);
    // direct bridge call without the confirmation flag is refused in the app, never reaches the plugin
    assert.equal(await page.evaluate(async () => (await HorizonFiles._t.call('HorizonFiles', 'moveToTrash', { path: '/x' })).code), 'OPERATION_DENIED');
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('YouTube picker card: scrollable rows, Play and Download are separate, progress, paste link, link copy, restore', async () => {
  const { browser, page, errors } = await boot();
  try {
    await page.evaluate(() => {
      window.log = []; let pct = 0;
      window.HorizonYtPickHost = {
        parseId: x => { const m = /(?:youtu\.be\/|v=)([\w-]{11})/.exec(x) || /^([\w-]{11})$/.exec(x); return m ? m[1] : ''; },
        play: async (id, t) => { log.push(['play', id, t]); return { text: 'Started: ' + t }; },
        save: async (id, t, k) => { log.push(['save', id, t, k]); return { ok: true }; },
        status: (id, k) => { pct += 50; return pct >= 100 ? { status: 'done', pct: 100, path: 'Download/Horizon/x.m4a' } : { status: 'running', pct }; }
      };
    });
    await page.addScriptTag({ path: path.join(root, 'www/horizon_ytpick.js') });
    const items = []; for (let i = 0; i < 14; i++) items.push({ id: 'abcdefghi' + String(10 + i), title: 'Song ' + i, artist: 'Artist', dur: 200 + i });
    assert.equal(await page.evaluate(it => HorizonYtPick.show('lo-fi beats', it, 'chat1', 2), items), true);
    assert.equal(await page.locator('.hzyp-row').count(), 12);                   // capped at 12
    assert.equal(await page.locator('.hzyp-list').evaluate(e => getComputedStyle(e).overflowY), 'auto');
    const row = page.locator('.hzyp-row').first();
    await row.getByRole('button', { name: /Play/ }).click();
    await page.waitForFunction(() => log.some(l => l[0] === 'play'));
    assert.deepEqual(await page.evaluate(() => log.find(l => l[0] === 'play')), ['play', 'abcdefghi10', 'Song 0']);
    assert.equal(await page.evaluate(() => log.filter(l => l[0] === 'save').length), 0);   // Play never saves
    await row.getByRole('button', { name: /save the audio/i }).click();
    await page.waitForFunction(() => log.some(l => l[0] === 'save'));
    assert.deepEqual(await page.evaluate(() => log.find(l => l[0] === 'save')), ['save', 'abcdefghi10', 'Song 0', 'audio']);
    await row.locator('.hzyp-b.done').waitFor({ timeout: 5000 });
    assert.equal((await row.locator('.hzyp-b.done').textContent()), 'Saved ✓');
    // paste a link
    await page.locator('.hzyp-paste input').fill('https://youtu.be/dQw4w9WgXcQ');
    await page.locator('.hzyp-paste').getByRole('button', { name: /play this link/i }).click();
    await page.waitForFunction(() => log.some(l => l[0] === 'play' && l[1] === 'dQw4w9WgXcQ'));
    await page.locator('.hzyp-paste input').fill('not a link');
    await page.locator('.hzyp-paste').getByRole('button', { name: /play this link/i }).click();
    assert.match(await page.locator('.hzyp > .hzyp-msg').textContent(), /not a YouTube link/);
    // restore after the chat is redrawn: card returns right after message 2
    await page.evaluate(() => { const c = document.getElementById('chatMessages'); c.replaceChildren(); for (let i = 0; i < 3; i++) { const d = document.createElement('div'); d.className = 'msg'; d.textContent = 'm' + i; c.appendChild(d); } HorizonYtPick.restore('chat1', c, 0, 3); });
    assert.equal(await page.evaluate(() => [...document.getElementById('chatMessages').children].map(n => n.className.split(' ')[0]).join(',')), 'msg,msg,hzyp,msg');
    assert.equal(await page.evaluate(() => { const c = document.getElementById('chatMessages'); c.replaceChildren(); HorizonYtPick.restore('other-chat', c, 0, 0); return c.children.length; }), 0);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
