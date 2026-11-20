// Horizon People chat-first browser test, rebuilt for the V1.99.25 DOM.
// Real Chromium, real www/index.html, mocked People API (no network, no account).
// Flow: signed-in boot -> group pill -> contact -> chat opens -> Options shows -> Tools dock holds People + Add chat.
// Run:  node tests/people-chatfirst.browser.cjs
// Env:  HORIZON_URL (serve it yourself instead of file://), CHROME_PATH (custom Chromium), WAIT_MS (per-step timeout, default 15000)
// Exit 0 = pass, 1 = fail. Every wait names itself, so a failure says WHAT it was waiting for.
'use strict';
const path = require('node:path'), assert = require('node:assert/strict');

function loadPlaywright() {
    const tries = ['playwright', 'playwright-core', '/opt/npm-tools/node_modules/playwright'];
    for (const t of tries) { try { return require(t); } catch (_) { /* try next */ } }
    console.error('FAIL: playwright is not installed. Run: npm i -D playwright && npx playwright install chromium');
    process.exit(1);
}
const { chromium } = loadPlaywright();

const WAIT = Number(process.env.WAIT_MS) || 15000;
const URL_ = process.env.HORIZON_URL || 'file://' + path.join(__dirname, '..', 'www', 'index.html');
const ME = { id: 'HZ-ME', name: 'Me' }, ALICE = { id: 'HZ-A', name: 'Alice' };
const ROOM = { id: 'r1', title: 'Alice', members: [ME.id, ALICE.id], pending: [], group: false, owner: ME.id, messages: [] };
const SYNC = { me: ME, people: [ME, ALICE], contacts: [ALICE], requests: [], invitations: [], blocked: [], rooms: [ROOM] };

// shared in-page helper: true only when the element exists AND takes up screen space
const VISIBLE_SRC = `(sel) => { const e = document.querySelector(sel); if (!e) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; }`;

async function until(page, what, pred, arg) {
    try { await page.waitForFunction(pred, arg, { timeout: WAIT }); }
    catch (e) { throw new Error('Timed out after ' + WAIT + 'ms waiting for: ' + what + '\n' + (await diagnose(page))); }
}
async function diagnose(page) {
    try {
        return 'DOM now: ' + JSON.stringify(await page.evaluate((src) => {
            const vis = eval(src);
            return { gpill: vis('.hzp-gpill'), plus: vis('.hzp-chip.plus'), gpop: vis('.hzp-gpop'), launch: vis('.hzp-launch'), options: vis('.chat-input-area .hzp-opt'), peopleBtn: vis('#peopleBtn'), toolMenu: vis('#toolMenu'), panel: vis('.hzp-panel'), chips: [...document.querySelectorAll('.hzp-chip')].map(e => e.textContent.trim()) };
        }, VISIBLE_SRC));
    } catch (_) { return 'DOM now: (page not readable)'; }
}

(async () => {
    const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--no-sandbox', '--allow-file-access-from-files'] });
    const errors = [], calls = [];
    let step = 'start';
    try {
        const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
        await ctx.addInitScript((cfg) => { try { localStorage.setItem('horizon_people_v1', JSON.stringify(cfg)); } catch (_) {} },
            { token: 't', me: ME, savedContacts: { [ME.id]: [ALICE] }, mig197: true });
        const page = await ctx.newPage();
        page.on('pageerror', e => errors.push(e.message));
        await page.route('**/people-api/**', r => {
            const route = r.request().url().split('people-api/')[1].split('?')[0]; calls.push(route);
            r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(route === 'room' ? { room: ROOM } : route === 'sync' ? SYNC : {}) });
        });
        await page.goto(URL_);

        step = '1 boot: top row shows the group pill and the + chip';
        await until(page, 'the group pill (.hzp-gpill) and + chip (.hzp-chip.plus) on the top row', (src) => { const v = eval(src); return v('.hzp-gpill') && v('.hzp-chip.plus'); }, VISIBLE_SRC);
        assert.ok(calls.includes('sync'), 'the app asked the People API to sync');
        assert.equal(await page.evaluate((src) => eval(src)('.hzp-launch'), VISIBLE_SRC), false, 'no chat-bar row on a normal (non-people) chat');

        step = '2 group pill opens the contacts dropdown with Alice in it';
        await page.click('.hzp-gpill');
        await until(page, 'the contacts dropdown (.hzp-gpop) listing Alice', () => { const p = document.querySelector('.hzp-gpop'); return !!p && p.getBoundingClientRect().height > 0 && /Alice/.test(p.innerText); });

        step = '3 tapping Alice goes straight into her chat (no AI, no setup)';
        await page.locator('.hzp-gpop .hzp-gc-main', { hasText: 'Alice' }).first().click();
        await until(page, 'the dropdown to close', () => !document.querySelector('.hzp-gpop'));
        await until(page, 'the chat-bar row (.hzp-launch) with the Options pill (.hzp-opt) to show in Alice\u2019s chat', (src) => { const v = eval(src); return v('.chat-input-area .hzp-opt'); }, VISIBLE_SRC);
        assert.match((await page.locator('.chat-input-area .hzp-opt').innerText()).trim(), /options/i, 'the pill reads Options');

        step = '4 Tools menu holds People (no + Add chat) in the dock';
        await page.click('#webToggle');
        await until(page, 'the Tools menu (#toolMenu) to open', (src) => eval(src)('#toolMenu'), VISIBLE_SRC);
        await until(page, '#peopleBtn visible inside #hzgDockL and no #peopleAddBtn', (src) => {
            const v = eval(src), p = document.getElementById('peopleBtn');
            return v('#peopleBtn') && !document.getElementById('peopleAddBtn') && !!p.closest('#hzgDockL');
        }, VISIBLE_SRC);

        step = '5 People in the dock opens the People panel';
        await page.click('#peopleBtn');
        await until(page, 'the People panel (.hzp-panel) to open', (src) => eval(src)('.hzp-panel'), VISIBLE_SRC);

        assert.deepEqual(errors, [], 'no uncaught page errors during the flow:\n' + errors.join('\n'));
        console.log('PASS people-chatfirst: 5 steps, ' + calls.length + ' mocked API calls, 0 page errors');
    } catch (e) {
        console.error('FAIL at step ' + step + '\n' + (e && e.message ? e.message : e));
        if (errors.length) console.error('Page errors:\n' + errors.join('\n'));
        process.exitCode = 1;
    } finally { await browser.close(); }
})();
