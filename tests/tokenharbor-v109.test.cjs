'use strict';
// V1.99.109 Token Harbor: free routes only. Source-level checks, no network.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function policy() { const s = { window: null, URL, Set, Map, Date, console, Response, setTimeout: fn => setTimeout(fn, 0), clearTimeout }; s.window = s; vm.createContext(s); vm.runInContext(rd('www/horizon_model_inventory.js') + '\n' + rd('www/horizon_model_policy.js'), s); return s; }
const FREE = ['deepseek-v4-flash:free', 'deepseek-v4.1-flash:free', 'mimo-v2.6-flash:free'];
test('only :free routes are selectable, paid ids are dropped', () => {
  const s = policy(), P = s.HorizonModelPolicy;
  assert.deepEqual(plain(P.select('tokenharbor', { data: ['deepseek-v4-flash', 'claude-opus-5', 'glm-5.3', 'deepseek-v4-flash:free', 'mimo-v2.6-flash:free'].map(id => ({ id })) })), ['deepseek-v4-flash:free', 'mimo-v2.6-flash:free']);
  assert.deepEqual(plain(s.HorizonModelInventory.verified.tokenharbor), FREE);
  assert.deepEqual(plain(s.HorizonModelInventory.candidates.tokenharbor), FREE);
});
test('a :free route may be answered with its base model name, nothing else', () => {
  const P = policy().HorizonModelPolicy;
  assert.doesNotThrow(() => P.assertModel('tokenharbor', 'deepseek-v4-flash:free', 'deepseek-v4-flash'));
  assert.throws(() => P.assertModel('tokenharbor', 'deepseek-v4-flash:free', 'claude-opus-5'), /substitution refused/);
  assert.throws(() => P.assertModel('typhoon', 'a:free', 'a'), /substitution refused/);
});
test('wiring: card, key prefix, native host', () => {
  const h = rd('www/index.html');
  assert.match(h, /PROVIDERS\.tokenharbor = oaiGateway\(\{name:'Token Harbor'/); assert.match(h, /base:'https:\/\/tokenharbor\.ai\/v1'/); assert.match(h, /id="i-b-tokenharbor"/);
  assert.match(rd('www/horizon_key_import.js'), /thk_live_/);
  assert.match(rd('android-native/app/HorizonAIPlugin.kt'), /"tokenharbor\.ai"/);
  assert.match(rd('android-native/app/HorizonCheckinPlugin.kt'), /"tokenharbor" to "https:\/\/tokenharbor\.ai\/v1\/chat\/completions"/);
});
