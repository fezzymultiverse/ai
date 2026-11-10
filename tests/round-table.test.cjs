'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('V1.93.5 alarm notification cannot be swiped away', () => {
    const k = read('resources/android/java/HorizonAlarmService.kt');
    assert.match(k, /setDeleteIntent\(act\(ACT_REPOST/);
    assert.match(k, /FLAG_NO_CLEAR/);
    assert.match(k, /keepShown/);
    assert.match(k, /ui\.removeCallbacks\(keepShown\)/);   // stopped alarms must not re-post
});

test('V1.93.6 round table is wired into the group round', () => {
    const h = read('www/index.html');
    assert.match(h, /horizon_round\.js\?v=1\.93\.6/);
    assert.match(h, /HzRound\.start\(chat, targets\)/);
    assert.match(h, /HzRound\.end\(rtok\)/);
    assert.match(h, /function skipSlowTurn/);
    assert.match(h, /e && e\.skipped/);
    assert.match(h, /gRole/);
});

test('V1.93.6 round strip logic: slow after 30 s, skip, end', () => {
    let now = 1000, tickFn = null, slow = [], skips = 0;
    const mk = () => {
        const n = { children: [], className: '', dataset: {}, hidden: false, style: {}, listeners: {}, textContent: '', value: '',
            classList: { toggle() {} }, setAttribute() {}, appendChild(c) { n.children.push(c); return c; }, replaceChildren(...c) { n.children = c; },
            addEventListener(t, f) { n.listeners[t] = f; }, insertBefore(c) { n.children.push(c); }, set parentNode(v) {}, get parentNode() { return n; } };
        return n;
    };
    const anchor = mk();
    global.document = { createElement: mk, createElementNS: mk, querySelector: () => anchor, getElementById: () => null, addEventListener() {} };
    global.Event = function () {}; global.requestAnimationFrame = f => { f(); return 1; };
    global.setInterval = f => { tickFn = f; return 7; }; global.clearInterval = () => { tickFn = null; }; global.setTimeout = () => 0;
    const realNow = Date.now; Date.now = () => now;
    global.window = global;
    delete require.cache[require.resolve('../www/horizon_round.js')];
    require('../www/horizon_round.js');
    const chat = { id: 'c1', group: { members: [{ id: 'a' }, { id: 'b' }] } };
    HzRound.init({ input: { value: '', focus() {} }, current: () => chat, providers: () => [{ id: 'a', name: 'A', icon: 'i' }, { id: 'b', name: 'B', icon: 'i' }],
        skip: () => { skips++; }, onSlow: (id) => slow.push(id) });
    const tok = HzRound.start(chat, [{ id: 'a' }, { id: 'b' }]);
    HzRound.set('a', 'think');
    now += 29000; tickFn(); assert.deepStrictEqual(slow, []);
    now += 2000; tickFn(); assert.deepStrictEqual(slow, ['a']);
    now += 5000; tickFn(); assert.deepStrictEqual(slow, ['a']);   // told once, not every second
    HzRound.set('a', 'skip'); HzRound.set('b', 'think'); HzRound.set('b', 'done');
    HzRound.end(tok + 5);   // a stale round must not end the live one
    HzRound.end(tok);
    Date.now = realNow;
});

test('V1.93.6 background hold wakes the page and chat visuals are wired', () => {
    const svc = read('resources/android/java/HorizonAIService.kt'), act = read('resources/android/java/MainActivity.java'), h = read('www/index.html'), c = read('www/horizon_app.css');
    assert.match(svc, /MainActivity\.keepPageRunning\(\)/);
    assert.match(svc, /removeCallbacks\(keepPage\)/);
    assert.match(act, /public static void keepPageRunning/);
    assert.match(h, /hzFreshReply/);
    assert.match(c, /hz-grp \.message\.ai\[data-prov\]/);
    assert.match(c, /prefers-reduced-motion[^}]*hz-new/);
});
