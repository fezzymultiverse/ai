'use strict';
// V1.99.107 Typhoon provider: wiring checks (source level, no network).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const plain = x => JSON.parse(JSON.stringify(x));
const root = path.resolve(__dirname, '..'), rd = f => fs.readFileSync(path.join(root, f), 'utf8');
test('Typhoon is defined, with the verified chat model only', () => {
  const h = rd('www/index.html');
  assert.match(h, /PROVIDERS\.typhoon = oaiGateway\(\{name:'Typhoon'/);
  assert.match(h, /base:'https:\/\/api\.opentyphoon\.ai\/v1'/);
  assert.match(h, /defaultModel:'typhoon-v2\.5-30b-a3b-instruct'/);
  assert.match(h, /id="i-b-typhoon"/);
  const win = {}; vm.runInNewContext(rd('www/horizon_model_inventory.js'), { window: win }); 
  assert.deepEqual(plain(win.HorizonModelInventory.verified.typhoon), ['typhoon-v2.5-30b-a3b-instruct']);
});
test('policy keeps chat models and drops OCR / ASR', () => {
  const win = {}; vm.runInNewContext(rd('www/horizon_model_inventory.js'), { window: win });
  const ctx = { window: win, self: win, globalThis: win }; win.window = win;
  vm.runInNewContext(rd('www/horizon_model_policy.js'), Object.assign(ctx, win));
  const P = win.HorizonModelPolicy || ctx.HorizonModelPolicy;
  const ids = ['typhoon-v2.5-30b-a3b-instruct', 'typhoon-ocr', 'typhoon-ocr-v1.5', 'typhoon-ocr-v2', 'typhoon-ocr-preview', 'typhoon-asr-realtime', 'typhoon-isan-asr-realtime', 'typhoon-asr-edge'];
  assert.deepEqual(plain(P.select('typhoon', { data: ids.map(id => ({ id })) })), ['typhoon-v2.5-30b-a3b-instruct']);
});
test('key import knows Typhoon, Android allows the host', () => {
  assert.match(rd('www/horizon_key_import.js'), /typhoon: 'typhoon'/);
  assert.match(rd('android-native/app/HorizonAIPlugin.kt'), /"api\.opentyphoon\.ai"/);
  assert.match(rd('android-native/app/HorizonCheckinPlugin.kt'), /"typhoon" to "https:\/\/api\.opentyphoon\.ai\/v1\/chat\/completions"/);
});
