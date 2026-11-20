// V1.99.35: grey theme defines --text and --bg (they were never defined, so tiles, header and People text kept dark-theme colours). Static checks.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const css = fs.readFileSync(path.join(__dirname, '..', 'www/horizon_app.css'), 'utf8');
test('grey theme defines --text (dark text) and --bg (light header)', () => {
  assert.match(css, /html\[data-theme="grey"\] \{ --text: var\(--text-main\); --bg: var\(--bg-color\); \}/);
  assert.match(css, /html\[data-theme="grey"\]\.hzf-on \.app-header\.hzf \{ background: #dde0e5/);
});
test('grey theme: the 5 header tiles and the group dropdown have readable text', () => {
  assert.match(css, /html\[data-theme="grey"\] \.hzf-tile \{ background: #eceef1; color: #15181c; \}/);
  assert.match(css, /html\[data-theme="grey"\] #hzfTile_vault \{ --hzf-c: #8a7300; \}/);
  assert.match(css, /html\[data-theme="grey"\] \.hzp-sb \{ color: #3d454e; \}/);
});
test('dark theme is untouched: --text / --bg only defined under grey', () => {
  const defs = css.match(/[{;\s]--(text|bg)\s*:/g) || [];
  assert.strictEqual(defs.length, 2);
});
