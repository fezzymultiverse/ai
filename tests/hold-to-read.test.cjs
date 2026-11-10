'use strict';
// V1.93.4: HOLD TO READ + queued Debate/Judge. Static guards so the fix cannot silently regress.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const www = path.join(__dirname, '..', 'www');
const read = f => fs.readFileSync(path.join(www, f), 'utf8');
const html = read('index.html');

test('horizon_hold.js loads before the group script and the main script', () => {
  const hold = html.indexOf('horizon_hold.js');
  assert.ok(hold > 0, 'horizon_hold.js is not loaded');
  assert.ok(hold < html.indexOf('horizon_group.js'), 'hold must load before group');
  assert.ok(hold < html.indexOf('<script>\n', html.indexOf('horizon_browser.js')), 'hold must load before the main script');
});

test('automatic scrolling asks HorizonHold first; only deliberate jumps force it', () => {
  const m = /const scrollBottom = force => \{[\s\S]*?\n        \};/.exec(html);
  assert.ok(m, 'scrollBottom must accept a force flag');
  assert.match(m[0], /HorizonHold/);
  assert.match(m[0], /blocked\(\)/);
  assert.match(m[0], /force !== true/);
  const forced = (html.match(/scrollBottom\(true\)/g) || []).length;
  assert.ok(forced >= 3, 'sending, debate and opening a chat must call scrollBottom(true), found ' + forced);
});

test('hold controller pauses on touch, selection and scroll-up, and exposes its API', () => {
  const s = read('horizon_hold.js');
  ['touchstart', 'touchend', 'touchcancel', 'selectionchange', 'wheel'].forEach(e => assert.ok(s.includes("'" + e + "'"), 'missing listener ' + e));
  ['blocked', 'pending', 'stick', 'suppressed'].forEach(k => assert.match(s, new RegExp(k + ':')));
  assert.match(s, /WATCHDOG/, 'a missed touchend must not freeze follow forever');
});

test('the scroll-to-bottom arrow resumes follow and shows while a scroll is held back', () => {
  const s = read('horizon_fab.js');
  assert.match(s, /HorizonHold\.stick\(\)/);
  assert.match(s, /HorizonHold\.pending\(\)/);
});

test('Debate and Judge queue while the AIs are answering instead of bouncing', () => {
  assert.match(html, /function whenIdle\(label, run\)/);
  assert.match(html, /whenIdle\('Debate'/);
  assert.match(html, /later: \(label, fn\) => whenIdle\(label, fn\)/);
  assert.match(html, /activeRounds\+\+/, 'a round counter stops a queued action firing between two AIs');
  assert.ok(!/Horizon is busy\. Try again in a moment\.', 'error'\); return false; \}\s*\n\s*const chat = currentChat\(\);\s*\n\s*if \(!chat \|\| !chat\.group/.test(html), 'the old busy bounce is back in debateRound');
  const g = read('horizon_group.js');
  assert.match(g, /host\.later\('Judge/);
  assert.match(g, /'@' \+ p\.id \+ ' Judge:/, 'Judge must tag by id');
  assert.ok(!/'@' \+ p\.name\.toLowerCase\(\)/.test(g), 'tag chips must not build @mentions from display names');
});
