// V1.99.55: chat box spacing + message alignment. Static checks, plain Node (no browser).
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const www = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
const css = www('horizon_app.css'), html = www('index.html'), about = www('horizon_about.js');
const block = css.slice(css.lastIndexOf('V1.99.55 · CHAT BOX'));

test('the V1.99.55 block is the LAST thing in the stylesheet so it wins the cascade', () => {
    assert.ok(css.lastIndexOf('V1.99.55 · CHAT BOX') > css.lastIndexOf('V1.99.41 ====='), 'after V1.99.41');
    assert.equal(css.slice(css.lastIndexOf('V1.99.55 · CHAT BOX')).indexOf('/* ===== V1.'), -1, 'no later block after it');
});
test('chat box padding is restored, also when the Options pill is present (group/people chats)', () => {
    assert.match(block, /\.chat-input-area\.hz-has-options\s*\{[^}]*padding:\s*var\(--hz-in-top\)[^}]*!important/s);
    assert.match(block, /--hz-in-top:\s*12px/);
    assert.match(block, /\.composer > \.chat-input-area > textarea\s*\{[^}]*padding:\s*8px 6px 6px 8px/s);
});
test('the old zero top padding rule still exists but is overridden by equal-specificity !important later', () => {
    assert.match(css, /\.chat-input-area\.hz-has-options \{ padding-top: 0 !important; \}/);
    assert.ok(css.lastIndexOf('.chat-input-area.hz-has-options {\n  padding: var(--hz-in-top)') > css.lastIndexOf('.chat-input-area.hz-has-options { padding-top: 0 !important; }'));
});
test('group colour rail: text is padded off the rail and the double rail is removed', () => {
    assert.match(block, /#chatMessages\.hz-grp \.message\.ai\[data-prov\] \.bubble\s*\{\s*padding-left:\s*var\(--hz-rail-gap\)/);
    assert.match(block, /#chatMessages\.hz-grp > \.message\.ai\[data-prov\]\s*\{\s*border-inline-start:\s*0/);
});
test('message list and chat box share one gutter', () => {
    assert.match(block, /\.chat-scroll\s*\{\s*padding-left:\s*var\(--hz-gut\)/);
    assert.match(block, /\.composer\s*\{\s*padding-left:\s*var\(--hz-gut\)/);
});
test('stylesheet is cache-busted and the version is bumped', () => {
    assert.match(html, /horizon_app\.css\?v=1\.99\.\d+/);
    assert.match(about, /var VERSION = 'V1\.99\.(?:5[5-9]|[6-9]\d|1\d\d)'/);
    // V1.99.136: horizon_about.js no longer carries a per-version changelog list (it shows VERSION only), so there is no 'V1.99.55' entry to check.
});
test('braces in the new CSS block are balanced', () => {
    assert.equal((block.match(/\{/g) || []).length, (block.match(/\}/g) || []).length);
});
