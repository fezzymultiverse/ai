// V1.99.135: Horizon Eyes (functions extracted from index.html between EYES-BEGIN/EYES-END and run with mocks).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const src = html.split('// EYES-BEGIN')[1].split('// EYES-END')[0].replace('const EYES_HELPERS = false;', 'const EYES_HELPERS = true;');
function boot(opts) {
  const calls = [], ls = Object.assign({}, opts.ls || {});
  const mk = (id, name, keyless, reply) => ({ name, keyless, defaultModel: 'm-' + id, chat: async (k, m, msgs) => { calls.push(id); if (reply instanceof Error) throw reply; return reply; } });
  const PROVIDERS = { chatat: mk('chatat', 'ch.at', true, 'text only'), groq: mk('groq', 'Groq', false, opts.groq), pollinations: mk('pollinations', 'Pollinations', true, opts.poll) };
  const ctx = { PROVIDERS, PROVIDER_IDS: Object.keys(PROVIDERS), state: { models: {}, active: 'chatat' }, lsGet: k => ls[k] || null,
    canSeeImages: id => id === 'groq' || id === 'pollinations', keyOf: id => (id === 'groq' && opts.key !== false ? 'KEY' : ''), window: {}, setTimeout, clearTimeout, Promise, String, Map };
  vm.createContext(ctx); vm.runInContext(src + ';this.api={eyesFix,eyesSources};', ctx);
  return { api: ctx.api, PROVIDERS, calls };
}
const GOOD = 'A screenshot of a settings screen. Text reads: Downloads, Permissions, File access ON. A red error banner at the top.';
test('text-only model gets a real description, imgs removed, honesty label added', async () => {
  const t = boot({ groq: GOOD, poll: 'x' }), msgs = [{ role: 'user', text: 'what is this?', imgs: [{ mime: 'image/png', b64: 'A'.repeat(200) }] }];
  const via = await t.api.eyesFix(msgs, t.PROVIDERS.chatat, 'gpt-4o', 'what is this?');
  assert.match(via, /^Groq/); assert.equal(msgs[0].imgs, undefined);
  assert.match(msgs[0].text, /read for you by Groq/); assert.match(msgs[0].text, /File access ON/); assert.match(msgs[0].text, /never invent details/);
});
test('falls to the next vision provider when the first fails', async () => {
  const t = boot({ groq: new Error('429'), poll: GOOD }), msgs = [{ role: 'user', text: 'q', imgs: [{ mime: 'image/png', b64: 'B'.repeat(200) }] }];
  const via = await t.api.eyesFix(msgs, t.PROVIDERS.chatat, 'gpt-4o', 'q');
  assert.match(via, /^Pollinations/); assert.deepEqual(t.calls, ['groq', 'pollinations']);
});
test('no vision provider ready: pictures are left untouched', async () => {
  const t = boot({ groq: GOOD, poll: GOOD, key: false, ls: { horizon_eyes: '0' } }), msgs = [{ role: 'user', text: 'q', imgs: [{ mime: 'image/png', b64: 'C'.repeat(200) }] }];
  assert.equal(await t.api.eyesFix(msgs, t.PROVIDERS.chatat, 'gpt-4o', 'q'), null); assert.equal(msgs[0].imgs.length, 1); assert.equal(t.calls.length, 0);
});
test('a vision-capable active model is left alone, and the same picture is described once (cache)', async () => {
  const t = boot({ groq: GOOD, poll: GOOD }), a = [{ role: 'user', text: 'q', imgs: [{ mime: 'image/png', b64: 'D'.repeat(200) }] }];
  assert.equal(await t.api.eyesFix(a, t.PROVIDERS.groq, 'm', 'q'), null); assert.equal(a[0].imgs.length, 1);
  await t.api.eyesFix(a, t.PROVIDERS.chatat, 'gpt-4o', 'q');
  const b = [{ role: 'user', text: 'again', imgs: [{ mime: 'image/png', b64: 'D'.repeat(200) }] }];
  await t.api.eyesFix(b, t.PROVIDERS.chatat, 'gpt-4o', 'again'); assert.equal(t.calls.length, 1);
});
test('wiring: hooked in runTurn before the model is asked, and the send notice no longer says Groq only', () => {
  assert.match(html, /eyesFix\(base, p, model/); assert.match(html, /so \$\{PROVIDERS\[eyes\[0\]\]\.name\} will read it/);
});

test('V146/V147: as shipped, helpers are OFF: no provider is called; with no on-phone reader the pictures are stripped with a note', async () => {
  const off = html.split('// EYES-BEGIN')[1].split('// EYES-END')[0];
  assert.ok(off.includes('const EYES_HELPERS = false;'));
  const calls = [];
  const PROVIDERS = { chatat: { name: 'ch.at', keyless: true, defaultModel: 'm', chat: async () => { calls.push('chatat'); return 'x'; } }, pollinations: { name: 'Pollinations', keyless: true, defaultModel: 'm', chat: async () => { calls.push('poll'); return GOOD; } } };
  const ctx = { PROVIDERS, PROVIDER_IDS: Object.keys(PROVIDERS), state: { models: {}, active: 'chatat' }, lsGet: () => null, canSeeImages: id => id === 'pollinations', keyOf: () => '', window: {}, setTimeout, clearTimeout, Promise, String, Map };
  vm.createContext(ctx); vm.runInContext(off + ';this.api={eyesFix,eyesSources};', ctx);
  assert.equal(ctx.api.eyesSources('chatat').length, 0);
  const msgs = [{ role: 'user', text: 'what is this', imgs: [{ mime: 'image/png', b64: 'AAAA' }] }];
  const r = await ctx.api.eyesFix(msgs, PROVIDERS.chatat, 'm', 'what is this', 'c1');
  assert.equal(r, null); assert.equal(calls.length, 0); assert.equal(msgs[0].imgs, undefined); assert.match(msgs[0].text, /cannot see pictures and the on-phone reader could not read them/);
});
