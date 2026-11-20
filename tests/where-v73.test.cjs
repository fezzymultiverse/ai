// V1.99.73: where-you-are tracker, six-tile row, map card size, radio card removed, header shift, pulse, visualiser. Static checks + vm unit tests, plain Node.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = read('www/index.html'), css = read('www/horizon_app.css'), mcss = read('www/horizon_maps.css'), maps = read('www/horizon_maps.js');
const loc = read('www/horizon_locate.js'), pol = read('www/horizon_toolpolicy.js'), viz = read('www/horizon_viz.js');

function load() {
    const store = {};
    const s = { document: { readyState: 'complete', querySelector: () => null, addEventListener() {}, hidden: false, createElement: () => ({}) }, navigator: { onLine: true },
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
        fetch: () => Promise.reject(new Error('offline')), setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {}, Date, Math, console, Intl, Promise, JSON, parseFloat, isFinite, String, Number, Object, Array };
    s.window = s; vm.createContext(s); vm.runInContext(loc, s);
    return { s, store };
}

test('chat map card is back to the full-width 230px card (no 86% / 330px / 310px override)', () => {
    assert.ok(!/\.hzm-wrap\{[^}]*width:86%/.test(mcss) && !/max-width:330px/.test(mcss) && !/height:310px/.test(mcss));
    assert.match(mcss, /\.hzm-map\{height:230px/);
});
test('the Radio card under Chats is gone but the radio widget and its API stay', () => {
    assert.ok(!html.includes('id="bRadioOpen"'));
    assert.match(html, /id="hzRadio"/);
    assert.match(read('www/horizon_radio.js'), /open: openSheet/);
});
test('right panel: six tiles in one row in the asked order, card sits under them', () => {
    assert.match(css, /html\.hzf-on #rightPanel #hzDock \.hz-dock-grid \{ grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
    const order = ['maps', 'stats', 'rss', 'lens', 'music', 'downloads'];
    assert.match(css, /\[data-addon="music"\] \{ display: flex !important; order: 5; \}/);
    assert.match(css, /\[data-addon="downloads"\] \{ order: 6; \}/);
    assert.match(css, /\[data-addon="youtube"\],\s*html\.hzf-on #rightPanel #hzDock \.hz-dock-grid > \.hz-app-term \{ display: none !important; \}/);
    order.forEach(id => assert.ok(css.includes('[data-addon="' + id + '"] { order:') || id === 'music' || id === 'downloads'));
    // V1.99.75: the card lives at the top of the Maps window, not in the right panel
    assert.match(html, /<div id="hzMapsView" hidden><section class="hzw" id="hzWhere"/);
    assert.ok(!/const wh = \$\('#hzWhere'\)/.test(html));
    assert.match(html, /horizon_locate\.js\?v=1\.99\.75/);
});
test('the AI is told where he is, and the tracker is wired into maps', () => {
    assert.match(pol, /HorizonWhere\.block\(!!o\.lite\)/);
    assert.match(maps, /function whereBias\(\)/);
    assert.match(maps, /resolve\(q, bias \|\| whereBias\(\)\)/);
    assert.match(maps, /location_bias_scale=0\.5/);
    assert.match(maps, /farNote\(b, p\[1\]\)/);
});
test('tracker: GPS + IP + name build a place; a far IP is reported as VPN/carrier; GPS wins', () => {
    const { s } = load(), W = s.HorizonWhere;
    const w = W._t.build({ lat: -33.9158, lon: 18.6121, acc: 12.4 }, { ip: '1.2.3.4', isp: 'Net', lat: -26.2, lon: 28.0, city: 'Johannesburg', region: 'Gauteng', tz: 'Africa/Johannesburg' },
        { road: 'Main Rd', suburb: 'Ravensmead', city: 'Cape Town', region: 'Western Cape', country: 'South Africa', cc: 'za', postcode: '7493' });
    assert.equal(w.src, 'GPS'); assert.equal(w.place, 'Ravensmead, Cape Town'); assert.match(w.note, /VPN|carrier/); assert.equal(w.suburb, 'Ravensmead');
});
test('tracker: IP only never invents a street or suburb', () => {
    const { s } = load(), W = s.HorizonWhere;
    const w = W._t.build(null, { ip: '1.2.3.4', isp: 'Net', lat: -33.92, lon: 18.42, city: 'Cape Town', region: 'Western Cape', country: 'South Africa', cc: 'ZA', postal: '8000' }, { road: 'Some St', suburb: 'Guess', city: 'Cape Town', region: 'Western Cape', country: 'South Africa' });
    assert.equal(w.src, 'IP'); assert.equal(w.suburb, ''); assert.equal(w.road, ''); assert.equal(w.place, 'Cape Town'); assert.match(w.note, /city level/);
});
test('tracker: block() before a fix never guesses; the switch turns it off', () => {
    const { s, store } = load(), W = s.HorizonWhere;
    assert.match(W.block(false), /not resolved yet[\s\S]*Never guess/);
    store.horizon_where_ai = '0';
    assert.match(W.block(false), /switched "AI knows where I am" off/);
    assert.equal(W.bias(), null);
});
test('header brand shifts toward the screen centre, pulse is slow and visible, visualiser is the Aurora Spectrum', () => {
    assert.match(css, /\.hzf-brand \{ transform: translateX\(calc\(-1 \* clamp\(8px, calc\(50vw - 161px\), 26px\)\)\)/);
    assert.match(css, /@keyframes hzPulseOut \{ 0% \{ transform: scale\(1\); opacity: \.9; \} 70%[^}]*\} 100% \{ transform: scale\(1\.62\)/);
    assert.match(css, /animation: hzPulseOut 2\.6s ease-out infinite/);
    assert.ok(!/hzRpTile \.4s/.test(css.slice(css.indexOf('Horizon V1.99.73'))), 'no shake in the V73 block');
    assert.match(viz, /AURORA SPECTRUM/); assert.match(viz, /function ribbon\(/);
});
