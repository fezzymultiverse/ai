// V1.99.33: provider pill shows the model in the middle; in a group chat it follows whoever answers next. Static checks, plain Node.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const v2 = read('www/horizon_v2.js'), us = read('www/horizon_usage.js'), css = read('www/horizon_app.css');

test('pill: idle shows the model in the middle, busy keeps the live step', () => {
  assert.match(v2, /if \(busy\) stepText\(\);\s*else \{/);
  assert.match(v2, /nv = mdl \? \(grpNow && gn && gn\.group \? 'next \\u00b7 ' : ''\) \+ mdl : ''/);
  assert.match(css, /\.hzc-md \{ display: block !important; flex: 1 1 0;[^}]*text-align: center/);
});
test('group chat: the pill names the next speaker in the rotation, or the live one', () => {
  assert.match(us, /if \(running\) lastSpk = live\.id;/);
  assert.match(us, /spk = running \? live\.id : ids\[\(spkIdx >= 0 \? spkIdx \+ 1 : 0\) % ids\.length\]/);
  assert.match(us, /window\.HzNow = \{ group: true/);
  assert.match(us, /'idle', spk, window\.HzNow\.model, window\.HzNow\.status, lastGroupError\]\.join/);
  assert.match(v2, /grpNow && gn && gn\.group \? gn\.name/);
});
test('rotation logic: next after the last speaker wraps around', () => {
  const next = (ids, last, running, live) => { const i = ids.indexOf(last); return running ? live : ids[(i >= 0 ? i + 1 : 0) % ids.length]; };
  assert.strictEqual(next(['a', 'b', 'c'], null, false), 'a');
  assert.strictEqual(next(['a', 'b', 'c'], 'a', false), 'b');
  assert.strictEqual(next(['a', 'b', 'c'], 'c', false), 'a');
  assert.strictEqual(next(['a', 'b', 'c'], 'a', true, 'b'), 'b');
});
