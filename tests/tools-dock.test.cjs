// V1.99.25: Tools strip holds People + Horizon ID + Add chat; Options is a white pill with a cyan outline;
// header Settings tile matches the Menu tile and uses the sliders icon. Static checks, plain Node, no browser.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const www = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
const html = www('index.html'), grid = www('horizon_toolgrid.js'), people = www('horizon_people.js'), v2 = www('horizon_v2.js'), css = www('horizon_app.css');

test('Tools header no longer says "Purple is on, black is off"', () => {
    assert.ok(!/Purple is on, black is off/.test(html));
    assert.match(html, /<div class="tm-head"><b>Tools<\/b><\/div>/);
});

test('Tools strip: hint pill replaced by a People dock with left and right slots', () => {
    assert.ok(!/Hold one to read more/.test(grid), 'the read-more hint is gone');
    assert.match(grid, /id = 'hzgDockL'/);
    assert.match(grid, /id = 'hzgDockR'/);
    assert.match(grid, /HorizonPeople\.dock\(\)/, 'asks People to mount once the strip exists');
    assert.match(grid, /info\$\.hidden = false/, 'hold or tap still opens the description');
    assert.ok(!/hzg-dock-pdf/.test(grid), 'V1.99.34: Make PDF is not in the dock row');
});

test('People mounts into the dock, keeps a fallback, and has no Add chat plus', () => {
    assert.match(people, /function mountDock\(\)/);
    assert.match(people, /getElementById\('hzgDockL'\)/);
    assert.match(people, /getElementById\('hzgDockR'\)/);
    assert.doesNotMatch(people, /setAttribute\('aria-label', 'Add chat'\)/, 'the right-hand + is removed');
    assert.doesNotMatch(people, /plus\.className = 'hzp-chip plus'/, 'no + chip in the pill row');
    assert.match(people, /launch\.append\(launchBtn, launchSub, iBtn\)/, 'old row stays as the fallback');
    assert.match(people, /dock: mountDock/);
});

test('multicolour ring is applied to People inside the dock', () => {
    assert.match(people, /#hzgDock button\.hzp-launch-btn,#hzgDock button\.hzp-launch-add\{/);
    assert.match(people, /conic-gradient\(from var\(--hzp-a,0deg\),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff,#ff2d95\)/);
});

test('Options: white pill, black text, cyan outline, dropped lower', () => {
    assert.match(people, /background:#fff!important;color:#000!important;border:2px solid #00e5ff!important/);
    assert.match(people, /--hzp-pill-pull:28px/);
});

test('header: Settings tile same size as Menu with the sliders icon; provider pill smaller', () => {
    assert.ok(!/classList\.add\('vert'\)/.test(v2));
    assert.match(v2, /classList\.add\('hzc-set'\)/);
    assert.match(v2, /M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6/);
    assert.match(css, /\.hzc-sq\.hzc-set \{ width: 36px; height: 36px;/);
    assert.match(css, /\.hzd-top \.hzc-cap \{ height: 36px;/);
});
