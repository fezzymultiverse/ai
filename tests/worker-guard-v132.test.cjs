'use strict';
// V1.99.132: Horizon Worker neuron guard (app side, node:vm) and the Android file-move fix (static checks on the Java source).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function guard() {
  const html = read('www/index.html');
  const a = html.indexOf('const HZW_RATES'), b = html.indexOf('Object.defineProperty(PROVIDERS.hzworker');
  assert.ok(a > 0 && b > a, 'guard block present');
  const store = new Map();
  const ctx = { window: {}, lsGet: k => store.has(k) ? store.get(k) : null, lsSet: (k, v) => store.set(k, v), Date, JSON, Math, Number, String };
  vm.createContext(ctx);
  vm.runInContext(html.slice(a, b) + '\n;this.api = { hzwRate, hzwCost, hzwRead, hzwAdd, HZW_LIMIT, HZW_RATES };', ctx);
  return { api: ctx.api, store, win: ctx.window };
}

test('V132: rates match Cloudflare published neurons per million tokens, unknown models priced as the most expensive', () => {
  const { api } = guard();
  assert.deepStrictEqual(Array.from(api.hzwRate('@cf/meta/llama-3.3-70b-instruct-fp8-fast')), [26668, 204805]);
  assert.deepStrictEqual(Array.from(api.hzwRate('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b')), [45170, 443756]);
  assert.deepStrictEqual(Array.from(api.hzwRate('@cf/meta/llama-3.1-8b-instruct-fp8')), [13778, 26128]);
  assert.deepStrictEqual(Array.from(api.hzwRate('@cf/some/new-model')), [60000, 443756]);
  assert.strictEqual(Object.keys(api.HZW_RATES).length, 12, 'every model in the hzworker list is priced');
});

test('V132: every hzworker model in the inventory has a rate', () => {
  const inv = read('www/horizon_model_inventory.js');
  const block = /"hzworker":\s*\[([\s\S]*?)\]/.exec(inv)[1];
  const ids = block.match(/"@cf\/[^"]+"/g).map(x => x.slice(1, -1));
  const { api } = guard();
  ids.forEach(id => assert.ok(api.HZW_RATES[id.replace(/^@cf\/[^/]+\//, '')], 'missing rate for ' + id));
});

test('V132: worst case of one heavy call is large, a light model stays small', () => {
  const { api } = guard();
  const heavy = api.hzwCost('@cf/deepseek-ai/deepseek-r1-distill-qwen-32b', 8000, 4096);
  const light = api.hzwCost('@cf/meta/llama-3.1-8b-instruct-fp8', 2500, 2048);
  assert.ok(heavy > 2000 && heavy < 2400, 'r1 distill ~2,180 neurons, got ' + heavy);
  assert.ok(light < 100, 'lite prompt on 8b under 100 neurons worst case, got ' + light);
});

test('V132: the daily counter adds up and starts fresh on a new UTC day', () => {
  const { api, store } = guard();
  api.hzwAdd(120); api.hzwAdd(30.5);
  assert.strictEqual(api.hzwRead().n, 150.5);
  store.set('horizon_hzw_neurons_v157', JSON.stringify({ day: '2000-01-01', by: { '': 9999 } }));   // V1.99.157: counts are kept per Worker link
  assert.strictEqual(api.hzwRead().n, 0, 'yesterday does not count');
  api.hzwAdd(2500);
  const g = guard(); g.api.hzwAdd(2500);
  assert.strictEqual(g.win.HorizonWorkerBudget.used(), 2500);
  assert.strictEqual(g.win.HorizonWorkerBudget.left(), 7500);
});

test('V132: wiring in index.html (guard before send, cost after, timeouts counted, lite prompt, lower output cap)', () => {
  const html = read('www/index.html');
  assert.match(html, /if \(HZW_IDS\.includes\(pid\)\) \{\s*hzwTokIn = Math\.ceil/);
  assert.match(html, /if \(hzwWorst > hzwLeft\) throw new Error\(PROVIDERS\[pid\]\.name \+ ': this call could cost/);
  assert.ok(html.indexOf('hzwWorst > hzwLeft') < html.indexOf('HzUsage.begin(pid, model)', html.indexOf('hzwWorst > hzwLeft')), 'guard runs before the request starts');
  assert.match(html, /if \(HZW_IDS\.includes\(pid\)\) hzwAdd\(hzwCost\(model, real \?/);
  assert.match(html, /e\.stopped \|\| e\.status === 504 \|\| \/timed out\/i\.test/);
  assert.ok(html.includes("name === 'AI Horde' || /^Horizon Worker( [23])?$/.test(name) ||"));
  assert.match(html, /mkHzw = nm => \{ const pv = oaiGateway\(\{name:nm,maxTokens:2048,/);
  assert.ok(html.includes("PROVIDERS.hzworker = mkHzw('Horizon Worker');"));   // V1.99.157: Worker 2 and 3 are folded into this one
});

test('V132: file moves no longer call Files.getFileStore (it throws AccessDeniedException on Android)', () => {
  const j = read('android-native/app/HorizonFilesPlugin.java');
  assert.doesNotMatch(j.replace(/\/\/.*$/gm, ''), /getFileStore/);
  assert.match(j, /private static boolean sameVolume\(File a, File b\)/);
  assert.match(j, /android\.system\.Os\.stat\(a\.getPath\(\)\)\.st_dev == android\.system\.Os\.stat\(b\.getPath\(\)\)\.st_dev/);
  assert.strictEqual((j.match(/sameVolume\(source, destination\.getParentFile\(\)\)/g) || []).length, 2, 'move and undo-restore both use it');
  assert.match(read('android-native/app/HorizonFilesState.java'), /error == 18 \? "CROSS_VOLUME"/, 'the kernel EXDEV check still guards real cross-volume moves');
});

test('V157: every Worker link keeps its own neuron counter, and no link means the main link', () => {
  const html = read('www/index.html');
  const a = html.indexOf('const HZW_RATES'), b = html.indexOf("Object.defineProperty(PROVIDERS.hzworker, 'billingNote'");
  const store = new Map();
  const ctx = { window: {}, lsGet: k => store.has(k) ? store.get(k) : null, lsSet: (k, v) => store.set(k, v), hzwRoot: k => { const m = /^(https:\/\/[a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)/i.exec(String(k || '')); return m ? m[1].toLowerCase() : ''; }, Date, JSON, Math, Number, String };
  vm.createContext(ctx);
  vm.runInContext(html.slice(a, b) + '\n;this.api = { hzwRead, hzwAdd };', ctx);
  store.set('horizon_key_hzworker', 'https://one.me.workers.dev');
  ctx.api.hzwAdd(100); ctx.api.hzwAdd(40, 'https://two.me.workers.dev/v1');
  assert.strictEqual(ctx.api.hzwRead().n, 100, 'main link');
  assert.strictEqual(ctx.api.hzwRead('https://one.me.workers.dev').n, 100);
  assert.strictEqual(ctx.api.hzwRead('https://two.me.workers.dev').n, 40, 'a path on the address is the same link');
  assert.ok(store.has('horizon_hzw_neurons_v157') && !store.has('horizon_hzw2_neurons'));
});
