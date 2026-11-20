'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const W = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
test('subtitle parser reads json3 and XML tracks and ignores empties', () => {
  global.window = global; global.localStorage = { getItem() { return null; }, setItem() {} };
  delete require.cache[require.resolve('../www/horizon_ytdirect.js')];
  require('../www/horizon_ytdirect.js');
  const j = JSON.stringify({ events: [{ tStartMs: 1000, dDurationMs: 2000, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] }, { tStartMs: 500 }] });
  assert.deepStrictEqual(global.HzYtDirect._parseCues(j), [{ s: 1, e: 3, t: 'Hello world' }]);
  assert.strictEqual(global.HzYtDirect._parseCues('<text start="2" dur="1">A &amp; B</text>')[0].t, 'A & B');
  assert.deepStrictEqual(global.HzYtDirect._parseCues(''), []);
});
test('yt.watch is wired: tag verb, runner, prompt, policy, script, styles', () => {
  const idx = W('index.html');
  assert.ok(/get\|watch\|pick\):/.test(idx), 'YT_SRC verb');
  assert.ok(idx.includes("kind === 'yt.watch'"), 'runYtTool branch');
  assert.ok(idx.includes('[[yt.watch:'), 'AI prompt');
  assert.ok(idx.includes('horizon_watch.js'), 'script tag');
  assert.ok(W('horizon_toolpolicy.js').includes('yt.watch'), 'tool policy');
  assert.ok(W('horizon_layout.css').includes('#hzRpMedia.is-watch'), 'layout rules');
});
test('V120: viewer uses full area, native controls and honest in-picture captions', () => {
  const w = W('horizon_watch.js');
  assert.ok(w.includes('<video controls playsinline'));
  assert.ok(w.includes('controls:1,fs:0')); // V1.99.121: expand/fullscreen removed on purpose
  assert.ok(w.includes("scard.hidden = true"));
  assert.ok(/object-fit:\s*(?:contain|cover)/.test(w + W('horizon_layout.css'))); // V1.99.122: video fills the widget (cover)
  assert.ok(w.includes('controlslist="nofullscreen')); assert.ok(!/allowfullscreen/.test(w));
  assert.ok(w.includes('No subtitles for this video'));
});
