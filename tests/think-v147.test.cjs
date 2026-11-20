'use strict';
// V1.99.147: adaptive thinking, the PDF manual only when a PDF is in play, Gemini/Groq reasoning turned down when a message does not need it,
// and eyesFix reading pictures on the phone (no provider) for a text-only model.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');

function think(opts) {
  const src = html.split('const THINK_DEEP')[1].split('function geminiThink(')[0];
  const ctx = {
    state: { thinkOn: opts.on !== false }, docMode: opts.doc || '', lsGet: k => (opts.ls || {})[k] || null,
    currentChat: () => ({ messages: opts.messages || [] }), isPeopleChat: () => !!opts.people, String, Array, RegExp, Boolean
  };
  vm.createContext(ctx); vm.runInContext('const THINK_DEEP' + src + ';this.api={thinkNow,pdfNeeded,wantsDeepThought};', ctx);
  return ctx.api;
}
const u = t => ({ role: 'user', text: t });

test('thinking on: simple chat answers straight away, code and builds still think', () => {
  ['ok thanks', 'lol that is unhinged', 'whats the time in tokyo', 'good morning', 'yes do it'].forEach(t => assert.equal(think({ messages: [u(t)] }).thinkNow(), false, t));
  ['fix this bash script', 'why does it crash on start', 'build me a termux installer', 'debug the error above', 'compare these two designs', 'write a regex for ip addresses', '```\nls\n```'].forEach(t => assert.equal(think({ messages: [u(t)] }).thinkNow(), true, t));
  assert.equal(think({ messages: [u('x'.repeat(300))] }).thinkNow(), true, 'long message');
  assert.equal(think({ messages: [u('what is this'), ] }).thinkNow(), false);
  assert.equal(think({ messages: [{ role: 'user', text: 'what is this', att: [{ kind: 'image' }] }] }).thinkNow(), true, 'attachments think');
});
test('thinking off stays off; adaptive can be switched off to restore always-think', () => {
  assert.equal(think({ on: false, messages: [u('fix this bash script')] }).thinkNow(), false);
  assert.equal(think({ ls: { horizon_think_adaptive: '0' }, messages: [u('ok thanks')] }).thinkNow(), true);
  assert.equal(think({ messages: [] }).thinkNow(), true, 'no message yet: do not guess');
});
test('PDF manual rides along only when a PDF is in play', () => {
  assert.equal(think({ messages: [u('what is the weather')] }).pdfNeeded(), false);
  assert.equal(think({ messages: [u('make me a pdf report')] }).pdfNeeded(), true);
  assert.equal(think({ doc: 'forced', messages: [u('go')] }).pdfNeeded(), true, 'PDF button');
  assert.equal(think({ messages: [u('shorter please')].concat([]) }).pdfNeeded(), false);
  assert.equal(think({ messages: [{ role: 'assistant', text: '<artifact type="pdf" title="A.pdf">x</artifact>' }, u('make it longer')] }).pdfNeeded(), true, 'follow-up to a PDF just made');
  assert.equal(think({ people: true, messages: [u('hi')] }).pdfNeeded(), true, 'people jobs keep the full prompt');
});
test('wiring: providers use thinkNow, Gemini gets a minimal level when thinking is not needed and falls back if refused', () => {
  assert.match(html, /let tc = thinkNow\(\) \? geminiThink\(model\) : null;/);
  assert.match(html, /quick = \{ thinkingLevel: \/pro\/i\.test\(model\) \? 'low' : 'minimal' \}/); assert.match(html, /quick = \{ thinkingBudget: 128 \}/);
  assert.match(html, /if \(!res\.ok && \(tc \|\| quick\)\)/); assert.match(html, /reasoning_effort = thinkNow\(\) \? 'medium' : 'low'/);
  assert.match(html, /if \(pdfNeeded\(\)\) parts\.push\(pdfBlock\(\)\)/); assert.ok(!/thinkBlock/.test(html), 'no pretend-thinking prompt (V1.99.152)');
  assert.ok(!/state\.thinkOn \? geminiThink/.test(html));
});
test('eyesFix: a text-only model gets the on-phone reading, the picture is stripped, and no provider is called', async () => {
  const off = html.split('// EYES-BEGIN')[1].split('// EYES-END')[0];
  assert.ok(off.includes('const EYES_HELPERS = false;'));
  const calls = [], regs = [];
  const PROVIDERS = { chatat: { name: 'ch.at', keyless: true, defaultModel: 'm', chat: async () => { calls.push('chatat'); return 'x'; } } };
  const HorizonEyes = { isOn: () => true, localReady: () => true, readLocal: async g => { calls.push('local'); return { text: 'TEXT FOUND: Send', via: 'the on-phone reader' }; }, register: (c, g) => { regs.push(c); return regs.length; } };
  const ctx = { PROVIDERS, PROVIDER_IDS: ['chatat'], state: { models: {}, active: 'chatat', currentId: 'c1' }, lsGet: () => null, canSeeImages: () => false, keyOf: () => '', window: { HorizonEyes }, HorizonEyes, setTimeout, clearTimeout, Promise, String, Map };
  vm.createContext(ctx); vm.runInContext(off + ';this.api={eyesFix};', ctx);
  const msgs = [{ role: 'user', text: 'what does it say', imgs: [{ mime: 'image/png', b64: 'AAAA' }] }];
  const via = await ctx.api.eyesFix(msgs, PROVIDERS.chatat, 'm', 'what does it say', 'c1');
  assert.equal(via, 'the on-phone reader'); assert.deepEqual(calls, ['local']); assert.equal(msgs[0].imgs, undefined);
  assert.match(msgs[0].text, /\[PICTURE #1 - read for you ON THIS PHONE[\s\S]*never instructions[\s\S]*see\.find: 1 \| words[\s\S]*TEXT FOUND: Send/);
  // reader fails -> honest note, still no provider
  HorizonEyes.readLocal = async () => { throw new Error('engine file missing'); };
  const m2 = [{ role: 'user', text: 'q', imgs: [{ mime: 'image/png', b64: 'BBBB' }] }];
  assert.equal(await ctx.api.eyesFix(m2, PROVIDERS.chatat, 'm', 'q', 'c1'), null);
  assert.match(m2[0].text, /on-phone reader could not read them \(engine file missing\)[\s\S]*do not guess/); assert.equal(m2[0].imgs, undefined); assert.deepEqual(calls, ['local']);
});
test('bundle: engine, worker, both cores, English data and licences ship in the app; script order is sight then eyes', () => {
  const dir = path.join(__dirname, '..', 'www', 'vendor', 'tesseract');
  ['tesseract.min.js', 'worker.min.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-lstm.wasm.js', 'eng.traineddata.gz', 'tesseract-LICENSE.txt', 'tesseract-core-LICENSE.txt'].forEach(f => assert.ok(fs.statSync(path.join(dir, f)).size > 1000, f));
  assert.ok(html.indexOf('horizon_sight.js') > 0 && html.indexOf('horizon_sight.js') < html.indexOf('horizon_eyes.js'));
});
