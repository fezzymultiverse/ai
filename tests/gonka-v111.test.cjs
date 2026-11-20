'use strict';
// V1.99.111 GonkaRouter is back. Source-level checks, no network.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
const rd = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function policy() { const s = { window: null, URL, Set, Map, Date, console, Response, setTimeout: fn => setTimeout(fn, 0), clearTimeout }; s.window = s; vm.createContext(s); vm.runInContext(rd('www/horizon_model_inventory.js') + '\n' + rd('www/horizon_model_policy.js'), s); return s; }
const THREE = ['zai-org/GLM-5.3-Flash', 'deepseek-ai/DeepSeek-V4-Flash-0731', 'MiniMaxAI/MiniMax-M2.7'];
test('only the three Gonka models are selectable', () => {
  const s = policy(), P = s.HorizonModelPolicy;
  const listed = THREE.concat(['moonshotai/Kimi-K3', 'Qwen/Qwen3.8-235B']).map(id => ({ id }));
  assert.deepEqual(plain(P.select('gonka', { data: listed })).sort(), THREE.slice().sort());
  assert.deepEqual(plain(s.HorizonModelInventory.verified.gonka), THREE);
  assert.deepEqual(plain(s.HorizonModelInventory.candidates.gonka), THREE);
  assert.equal(P.bodyFor('gonka', THREE[0]).max_tokens, 1024);
});
test('wiring: provider, icon, host, check-in, key labels, key no longer wiped', () => {
  const h = rd('www/index.html');
  assert.match(h, /PROVIDERS\.gonka = oaiGateway\(\{name:'GonkaRouter'/); assert.match(h, /base:'https:\/\/api\.gonkarouter\.io\/v1'/); assert.match(h, /id="i-b-gonka"/);
  assert.doesNotMatch(h, /'githubmodels', 'gonka', 'anyapi'\]/);
  assert.match(rd('www/horizon_key_import.js'), /gonkarouter: 'gonka'/);
  assert.match(rd('android-native/app/HorizonAIPlugin.kt'), /"api\.gonkarouter\.io"/);
  assert.match(rd('android-native/app/HorizonCheckinPlugin.kt'), /"gonka" to "https:\/\/api\.gonkarouter\.io\/v1\/chat\/completions"/);
});
test('Gonka Broker is untouched and still Anthropic-style', () => {
  const h = rd('www/index.html');
  assert.match(h, /PROVIDERS\.gonkabroker = oaiGateway\(/); assert.match(h, /protocol:'anthropic'/); assert.match(h, /proxy\.gonkabroker\.com\/v1/);
});
test('no API key in the source', () => {
  for (const f of ['www/index.html', 'www/horizon_model_policy.js', 'www/horizon_model_inventory.js', 'www/horizon_key_import.js']) assert.doesNotMatch(rd(f), /\bsk-[A-Za-z0-9]{20,}/);
});
