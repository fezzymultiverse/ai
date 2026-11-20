'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
globalThis.window=undefined;require('../www/horizon_key_import.js');
const K=globalThis.HorizonKeyImport;
const SK='sk-CsCZHY70VBei8rwZkKTfDDGTMHs1dmsaa7Xk9QpL2wRtYuI3';
test('a bare sk- key is accepted by Typhoon, Agnes, GonkaRouter and Zro (no "belongs to openai")',()=>{
  for(const id of ['typhoon','agnes','gonka','zro','gonkabroker','ollama'])assert.equal(K.validate(id,SK),'');
  assert.equal(K.validate('typhoon','sk-'+'0123456789abcdef'.repeat(2)),'');
});
test('prefixed keys still refuse the wrong provider',()=>{
  assert.match(K.validate('typhoon','thk_live_abcdefghijklmnopqrstuvwxyz'),/belongs to tokenharbor/);
  assert.match(K.validate('cohere','AIzaSyA1234567890abcdefghijklmnop'),/belongs to gemini/);
});
test('a labelled sk- key is placed under its label; an unlabelled one is placed nowhere',()=>{
  assert.deepEqual(K.extract('typhoon: '+SK).items,[{provider:'typhoon',key:SK}]);
  assert.equal(K.extract(SK).items.length,0);
});
test('Claude, ChatGPT, DeepSeek and xAI are gone from the app; Groq (Free plan) came back in V1.99.115',()=>{
  const h=read('www/index.html');
  for(const id of ['claude','openai','deepseek','xai'])assert.equal(h.includes('PROVIDERS.'+id+' ='),false);
  assert.equal(/^\s{12}groq: \{/m.test(h),true,'groq provider is defined again');
  for(const id of ['claude','openai','deepseek','xai'])assert.ok(h.includes("'"+id+"'"),'wipe list keeps '+id);
  assert.equal(/\['together', 'sambanova'[^\]]*\]\.forEach/.exec(h)[0].includes("'groq'"),false,'groq keys are no longer wiped at startup');
  const k=read('android-native/app/HorizonAIPlugin.kt');
  for(const host of ['api.anthropic.com','api.openai.com','api.deepseek.com','api.x.ai'])assert.equal(k.includes(host),false);
  assert.equal(k.includes('api.groq.com'),true);
});
