'use strict';
// V1.99.115 static checks: Groq (Free plan) provider restored, Vault "Detect keys" and duplicate warnings.
const assert = require('assert'), fs = require('fs'), path = require('path');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const idx = read('www/index.html'), vault = read('www/horizon_vault.js'), net = read('www/horizon_net.js'),
  pol = read('www/horizon_model_policy.js'), ki = read('www/horizon_key_import.js'), kt = read('android-native/app/HorizonAIPlugin.kt');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', n, '-', name); };

t('groq provider is defined with its own icon, endpoints and gsk_ key check', () => {
  assert.ok(/\n\s+groq: \{\n\s+name: 'Groq',/.test(idx));
  assert.ok(idx.includes('id="i-b-groq"'));
  assert.ok(idx.includes("https://api.groq.com/openai/v1/chat/completions"));
  assert.ok(idx.includes("https://api.groq.com/openai/v1/models"));
  assert.ok(idx.includes("A Groq key starts with gsk_."));
});
t('startup cleanup no longer wipes groq keys', () => {
  const m = idx.match(/\['together', 'sambanova'[^\]]*\]\.forEach/);
  assert.ok(m && !/'groq'/.test(m[0]));
});
t('card description and model descriptions exist for groq', () => {
  assert.ok(idx.includes("'card-groq':"));
  assert.ok(idx.includes("if (prov === 'groq') {"));
});
t('transport policy and Android host list accept api.groq.com on the OpenAI paths only', () => {
  assert.ok(net.includes("'api.groq.com': /^\\/openai\\/v1\\/(models|chat\\/completions)\\/?$/"));
  assert.ok(kt.includes('"api.groq.com"'));
  const vm = require('vm');
  const code = net.replace(/^[\s\S]*?var paths = \{/, 'var paths = {').split('function accepts')[0] + '\nthis.__paths = paths;';
  const ctx = {}; vm.runInNewContext(code, ctx);
  assert.ok(ctx.__paths['api.groq.com'].test('/openai/v1/chat/completions'));
  assert.ok(!ctx.__paths['api.groq.com'].test('/openai/v1/audio/transcriptions'));
});
t('model policy lists chat models only and states the billing note', () => {
  assert.ok(pol.includes("if(pid==='groq')return !/whisper|tts|orpheus|playai|guard|safeguard|compound|embed|moderation/i"));
  assert.ok(pol.includes("pid==='groq')p.billingNote="));
});
t('key import claims gsk_ keys for groq only', () => {
  const sandbox = {}; new Function('root', ki)(sandbox);
  const K = sandbox.HorizonKeyImport || sandbox.HorizonKeys || Object.values(sandbox)[0];
  assert.ok(ki.includes("return 'groq'") && ki.includes("groq: 'groq'"));
});
t('vault has Detect keys, duplicate detection by value, and the host hook', () => {
  assert.ok(vault.includes('id="vtDetect"'));
  assert.ok(vault.includes('function dupGroups()') && vault.includes('function dupOf(it)') && vault.includes('async function runDetect()'));
  assert.ok(/normKey\(x\.value\) === k/.test(vault), 'duplicates compare the key value, not the title');
  assert.ok(idx.includes('addAiKey: (id, key) => saveImportedAiKey(id, key)'));
});
t('detect never deletes a Vault item or a provider key', () => {
  const seg = vault.slice(vault.indexOf('// ---------- Detect keys (V1.99.115)'), vault.indexOf('function itemEl(it)'));
  assert.ok(!/items\.splice|items\s*=\s*items\.filter|lsDel|eraseAll|\.delete\(/.test(seg));
});
console.log('1..' + n);
