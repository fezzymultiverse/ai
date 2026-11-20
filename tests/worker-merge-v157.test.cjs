'use strict';
// V1.99.157: Horizon Worker 2 and 3 folded into one Horizon Worker with backup links; the paste box picks up Cloudflare API credentials and Worker links.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
require('../www/horizon_key_import.js');
const K = globalThis.HorizonKeyImport;
const ACCT = '0123456789abcdef0123456789abcdef', TOK = 'abcDEF123456abcDEF123456abcDEF123456xyz9';
const pick = note => K.extract(note).items.map(i => i.provider + ' ' + i.key);

test('V157: one Horizon Worker provider, no Worker 2 or 3 left; Cloudflare API provider still there', () => {
  const html = read('www/index.html');
  assert.ok(html.includes("PROVIDERS.hzworker = mkHzw('Horizon Worker');"));
  assert.ok(!/PROVIDERS\.hzworker[23]\s*=/.test(html));
  assert.ok(html.includes("const HZW_IDS = ['hzworker'];"));
  assert.ok(html.includes("PROVIDERS.cloudflare = oaiGateway({name:'Cloudflare Workers AI'"));
  assert.ok(!/"hzworker[23]"/.test(read('www/horizon_model_inventory.js')));
});

test('V157: the migration moves Worker 2 and 3 addresses into the backup slots and clears the old slots', () => {
  const html = read('www/index.html');
  assert.match(html, /const OLD = \['hzworker2', 'hzworker3'\];/);
  assert.match(html, /'xai', 'hzworker2', 'hzworker3'\]\.forEach\(rid =>/, 'old slots are cleared');
  assert.ok(html.indexOf("const OLD = ['hzworker2', 'hzworker3'];") < html.indexOf("'xai', 'hzworker2', 'hzworker3']"), 'read first, then clear');
});

test('V157: paste box picks up a Worker link with or without a label, however it is spelled', () => {
  assert.deepStrictEqual(pick('Cloudflare Worker: https://horizon-worker.fezzy.workers.dev/'), ['hzworker https://horizon-worker.fezzy.workers.dev']);
  assert.deepStrictEqual(pick('Cloudfare worker https://hz.fezzy.workers.dev/v1'), ['hzworker https://hz.fezzy.workers.dev']);
  assert.deepStrictEqual(pick('Cloudfair Worker = HZ.Fezzy.workers.dev/v1/chat/completions'), ['hzworker https://hz.fezzy.workers.dev']);
  assert.deepStrictEqual(pick('https://a1.fezzy.workers.dev\nhttps://b2.fezzy.workers.dev'), ['hzworker https://a1.fezzy.workers.dev', 'hzworker https://b2.fezzy.workers.dev']);
  assert.deepStrictEqual(pick('{"cloudflare":"https://j.me.workers.dev"}'), ['hzworker https://j.me.workers.dev']);
  assert.deepStrictEqual(pick('https://a.b.c.workers.dev'), [], 'not a Worker address');
  assert.strictEqual(K.validate('hzworker', 'https://x.me.workers.dev/v1'), '');
});

test('V157: paste box picks up Cloudflare API credentials joined or written on separate lines', () => {
  const joined = ['cloudflare ' + ACCT + ':' + TOK];
  assert.deepStrictEqual(pick('Cloudflare: ' + ACCT + ':' + TOK), joined);
  assert.deepStrictEqual(pick('Cloudfair account id: ' + ACCT + '\nCloudfair API token: ' + TOK), joined);
  assert.deepStrictEqual(pick('Cloudflare\nAccount ID: ' + ACCT + '\nAPI token: ' + TOK), joined);
  assert.deepStrictEqual(pick('Cloudfare token: ' + TOK + '\nCloudfare account: ' + ACCT), joined);
  const both = pick('Cloudflare Workers AI: ' + ACCT + ':' + TOK + '\nCloudflare Worker: https://x.fezzy.workers.dev');
  assert.deepStrictEqual(both.sort(), ['cloudflare ' + ACCT + ':' + TOK, 'hzworker https://x.fezzy.workers.dev'].sort(), 'API card text stays the API, the Worker link is the Worker');
  const r = K.extract('cloudflare account id: ' + ACCT);
  assert.strictEqual(r.items.length, 0); assert.strictEqual(r.rejected, 1, 'an Account ID alone is not a key');
});

test('V157: other providers are not disturbed by the new labels', () => {
  const g = 'AIzaSyA1234567890abcdefghijklmnopqrstuv';
  assert.deepStrictEqual(pick('gemini: ' + g + '\nworker https://w.me.workers.dev').sort(), ['gemini ' + g, 'hzworker https://w.me.workers.dev'].sort());
});
