'use strict';
// V1.99.117: the app icon is generated from assets/icon.svg and wired into the build.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

test('icon source and favicon exist', () => {
  assert.ok(read('assets/icon.svg').includes('<svg'));
  const png = fs.readFileSync(path.join(root, 'www/icon.png'));
  assert.strictEqual(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
});

test('apply-icons.sh covers every density, splash and refuses a blank render', () => {
  const s = read('scripts/apply-icons.sh');
  for (const d of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) assert.ok(s.includes(d));
  for (const n of ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png', 'splash.png', 'ic_launcher_background']) assert.ok(s.includes(n));
  assert.ok(s.includes('rendered blank'));
  assert.ok(s.includes('did not render'));
});

test('build runs apply-icons before the native install and keeps the old checks', () => {
  const s = read('scripts/apply-android.sh');
  assert.ok(s.indexOf('apply-icons.sh') > 0 && s.indexOf('apply-icons.sh') < s.indexOf('install_native.sh android --apply'));
  assert.ok(s.includes('bash scripts/install_native.sh --check android'));
  assert.ok(read('.github/workflows/build-apk.yml').includes('librsvg2-bin'));
});
