// V1.99.26: front header = Menu | HORIZON | Settings, pill, tiles (Browser, Group, GitHub logo, Vault, Music). Static checks, plain Node.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const www = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
const html = www('index.html'), js = www('horizon_front.js'), css = www('horizon_app.css');

test('front script is loaded after horizon_v2.js and is syntactically safe to bail out', () => {
    assert.ok(html.indexOf('horizon_front.js') > html.indexOf('horizon_v2.js'), 'loads after the script that builds the header');
    assert.match(js, /if \(!chip \|\| !h1 \|\| !set \|\| !top\) return;/, 'does nothing if the old header pieces are missing');
});
test('tiles are in the asked order and open the existing handlers', () => {
    const order = ["var termTile = tile('term'", "tiles.appendChild(tile('group'", "tiles.appendChild(tile('github'", "tiles.appendChild(tile('vault'", "tiles.appendChild(tile('music'"].map(k => js.indexOf(k));
    assert.ok(order.every(i => i > 0) && order.every((v, i, a) => !i || v > a[i - 1]), 'Termux, Group, GitHub, Vault, Music (Browser moved to the header in V1.99.71)');
    assert.match(js, /#hzbOpen/); assert.match(js, /#groupBtn/); assert.match(js, /set-row\.set-vault/);
    assert.match(js, /tile\('github', 'GitHub', function \(\) \{ openApp\('github'\); \}, true\)/, 'GitHub is logo only');
});
test('right panel: GitHub row, Vault row and Music tile are hidden, not deleted', () => {
    assert.match(css, /#hzLeftGh,html\.hzf-on \.settings-home \.set-row\.set-vault,html\.hzf-on #hzDock \.hz-dock-grid>\.hz-app\[data-addon="music"\]\{display:none!important\}/);
    assert.match(html, /id="hzLeftGh"/); assert.match(html, /set-row set-vault/);
});
test('header is a pinned three-row grid and the stylesheet is cache-busted', () => {
    assert.match(css, /grid-template-areas:"menu brand set" "pill pill pill" "tiles tiles tiles"/);
    assert.match(html, /horizon_app\.css\?v=1\.99\.\d+/);
});
