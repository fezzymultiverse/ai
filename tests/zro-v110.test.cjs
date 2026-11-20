'use strict';
// V1.99.110 Zro (MoonMath): Flash models only. Source-level checks, no network.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function policy() { const s = { window: null, URL, Set, Map, Date, console, Response, setTimeout: fn => setTimeout(fn, 0), clearTimeout }; s.window = s; vm.createContext(s); vm.runInContext(rd('www/horizon_model_inventory.js') + '\n' + rd('www/horizon_model_policy.js'), s); return s; }
test('only the Flash families are selectable, the zro/ aliases and other ids are dropped', () => {
  const s = policy(), P = s.HorizonModelPolicy;
  const listed = ['deepseek-v4-flash-0731', 'zro/deepseek-v4-flash-0731', 'zro/deepseek-v4.1-flash', 'deepseek-v4.1-flash', 'claude-opus-5', 'deepseek-v4-pro'].map(id => ({ id }));
  assert.deepEqual(plain(P.select('zro', { data: listed })).sort(), ['deepseek-v4-flash-0731', 'deepseek-v4.1-flash']);
  assert.deepEqual(plain(s.HorizonModelInventory.verified.zro), ['deepseek-v4.1-flash']);
  assert.deepEqual(plain(s.HorizonModelInventory.candidates.zro), ['deepseek-v4.1-flash', 'deepseek-v4-flash-0731']);
});
test('probe body gives the reasoning model room, other providers keep 256', () => {
  const P = policy().HorizonModelPolicy;
  assert.equal(P.bodyFor('zro', 'deepseek-v4.1-flash').max_tokens, 1024);
  assert.equal(P.bodyFor('groq', 'x').max_tokens, 256);
});
test('a substituted model name is still refused', () => {
  const P = policy().HorizonModelPolicy;
  assert.doesNotThrow(() => P.assertModel('zro', 'deepseek-v4.1-flash', 'deepseek-v4.1-flash'));
  assert.throws(() => P.assertModel('zro', 'deepseek-v4.1-flash', 'claude-opus-5'), /substitution refused/);
});
test('wiring: card, icon, native host, key import label', () => {
  const h = rd('www/index.html');
  assert.match(h, /PROVIDERS\.zro = oaiGateway\(\{name:'Zro \(MoonMath\)'/); assert.match(h, /base:'https:\/\/zro\.moonmath\.ai\/v1'/);
  assert.match(h, /id="i-b-zro"/); assert.match(h, /maxTokens:2048/);
  assert.match(rd('www/horizon_key_import.js'), /zro: 'zro'/);
  assert.match(rd('android-native/app/HorizonAIPlugin.kt'), /"zro\.moonmath\.ai"/);
  assert.match(rd('android-native/app/HorizonCheckinPlugin.kt'), /"zro" to "https:\/\/zro\.moonmath\.ai\/v1\/chat\/completions"/);
});
test('no API key is stored in the source', () => {
  for (const f of ['www/index.html', 'www/horizon_model_policy.js', 'www/horizon_model_inventory.js', 'www/horizon_key_import.js']) assert.doesNotMatch(rd(f), /\bsk-[A-Za-z0-9]{20,}/);
});
