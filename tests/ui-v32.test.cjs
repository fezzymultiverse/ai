// V1.99.32: tool tiles black/white with green/red dots, Make PDF stands out, header tile neon colours, Leave group. Static checks, plain Node.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const css = read('www/horizon_app.css'), ppl = read('www/horizon_people.js');

test('tool tiles: on = black with green dot, off = white with red dot', () => {
  assert.match(css, /\.tm-row\.is-on, #toolMenu\.hzg \.tm-row\[aria-checked="true"\] \{ background: #000 !important/);
  assert.match(css, /\.tm-row\.is-off:not\(\[aria-checked="true"\]\) \{ background: #fff !important/);
  assert.match(css, /\.tm-row\.is-on::after[^}]*#22c55e/);
  assert.match(css, /\.tm-row\.is-off:not\(\[aria-checked="true"\]\)::after \{ background: #ef4444/);
});
test('Make PDF is gone from the dock row (V1.99.34)', () => {
  assert.ok(!/hzg-dock-pdf/.test(css));
  assert.ok(!/hzg-dock-pdf/.test(read('www/horizon_toolgrid.js')));
});
test('header tiles: Browser blue, Group pink, Vault yellow, Music dark green; GitHub untouched', () => {
  assert.match(css, /#hzfTile_browser \{ --hzf-c: #1f8bff; \}/);
  assert.match(css, /#hzfTile_group \{ --hzf-c: #ff2bd6; \}/);
  assert.match(css, /#hzfTile_vault \{ --hzf-c: #ffee00; \}/);
  assert.match(css, /#hzfTile_music \{ --hzf-c: #00b83f; \}/);
  assert.ok(!/hzfTile_github/.test(css));
});
test('Leave group: clears the group, hides the pill, and adding anyone brings it back', () => {
  assert.match(ppl, /hzp-gleave/);
  assert.match(ppl, /sel\.contacts = \[\]; sel\.ai = \[\]; sel\.off = true/);
  assert.match(ppl, /if \(config\.token && !selections\(\)\.off\) pillRow\.append\(groupPill/);
  assert.match(ppl, /if \(on\) selections\(\)\.off = false/);
  assert.match(ppl, /gFocus, !!selections\(\)\.off\]/);
});
