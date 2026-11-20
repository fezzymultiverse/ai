'use strict';
// V1.99.90: free.ai added as a keyless-optional provider. Path is /v1/chat/ (docs), models are the two the user's probe saw answering with no key.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function load(files){const root={};const ctx={window:root,self:root,globalThis:root,URL,Response,setTimeout,clearTimeout};ctx.root=root;vm.createContext(ctx);for(const f of files)vm.runInContext(read(f),ctx);return root;}
test('net allowlist accepts free.ai chat and models, rejects other paths and hosts',()=>{
  const r=load(['www/horizon_net.js']);const ok=u=>r.HorizonNet.accepts(u);
  assert.ok(ok('https://api.free.ai/v1/chat/'));assert.ok(ok('https://api.free.ai/v1/chat'));assert.ok(ok('https://api.free.ai/v1/chat/completions'));assert.ok(ok('https://api.free.ai/v1/models'));
  assert.ok(!ok('https://api.free.ai/v1/image/generate/'));assert.ok(!ok('https://api.free.ai/v1/tts/'));assert.ok(!ok('http://api.free.ai/v1/chat/'));assert.ok(!ok('https://free.ai/v1/chat/'));assert.ok(!ok('https://api.free.ai:8443/v1/chat/'));
});
test('inventory seeds mistral and qwen3-8b; qwen7b is only a candidate; deepseek-r1-7b is left out',()=>{
  const r=load(['www/horizon_model_inventory.js']);const I=r.HorizonModelInventory;
  assert.deepEqual(Array.from(I.verified.freeai),['mistral','qwen3-8b']);
  assert.deepEqual(Array.from(I.candidates.freeai),['mistral','qwen3-8b','qwen7b']);
  assert.ok(!JSON.stringify(I).includes('deepseek-r1-7b'));
});
test('policy configure gives free.ai the verified seed, default mistral, no retry chain',()=>{
  const r=load(['www/horizon_model_inventory.js','www/horizon_model_policy.js']);const P=r.HorizonModelPolicy;
  const reg={freeai:{name:'free.ai',defaultModel:'mistral',headers:()=>({})}};P.configure(reg);
  assert.equal(reg.freeai.defaultModel,'mistral');assert.deepEqual(Array.from(reg.freeai.fallbackModels),['mistral','qwen3-8b']);
  assert.equal(reg.freeai.modelWalk,false);assert.match(reg.freeai.billingNote,/no key/i);
});
test('discover tests only the fixed free.ai candidates and never fetches the 568-model list',async()=>{
  const r=load(['www/horizon_model_inventory.js','www/horizon_model_policy.js']);const P=r.HorizonModelPolicy;
  const calls=[];const fetcher=async(u,o)=>{calls.push(u);return {ok:true,status:200,json:async()=>({model:JSON.parse(o.body).model,choices:[{message:{content:'OK'}}]})};};
  const p={name:'free.ai',modelsUrl:'https://api.free.ai/v1/models',chatUrl:'https://api.free.ai/v1/chat/',headers:()=>({})};
  const origSetTimeout=r.setTimeout; 
  const out=await Promise.race([P.discover('freeai',p,'',fetcher),new Promise((_,rej)=>setTimeout(()=>rej(new Error('slow')),15000))]);
  assert.ok(calls.every(u=>u==='https://api.free.ai/v1/chat/'),calls.join());assert.equal(calls.length,3);
  const list=Array.isArray(out)?out:(out.models||out.passed||[]);assert.ok(JSON.stringify(out).includes('qwen3-8b'));
});
test('index.html registers free.ai: optional key, /v1/chat/ path, icon symbol, picker blurb',()=>{
  const h=read('www/index.html');
  assert.match(h,/PROVIDERS\.freeai = oaiGateway\(\{name:'free\.ai'[^\n]*optionalKey:true/);
  assert.ok(h.includes("PROVIDERS.freeai.chatUrl = 'https://api.free.ai/v1/chat/';"));
  assert.ok(h.includes('id="i-b-freeai"'));assert.ok(h.includes("prov === 'freeai'"));
});
test('android allowlists carry api.free.ai; keyless blank key sends no real Bearer',()=>{
  assert.ok(read('android-native/app/HorizonAIPlugin.kt').includes('"api.free.ai"'));
  const k=read('android-native/app/HorizonCheckinPlugin.kt');
  assert.ok(k.includes('"freeai" to "https://api.free.ai/v1/chat/"'));assert.ok(k.includes('setOf("ovh", "kilo", "llm7", "freeai")'));
});
test('mlvoca stays registered with both models and its host path',()=>{
  const r=load(['www/horizon_model_inventory.js']);assert.deepEqual(Array.from(r.HorizonModelInventory.verified.mlvoca),['tinyllama','deepseek-r1:1.5b']);
  assert.ok(read('www/horizon_net.js').includes("'mlvoca.com'"));assert.ok(read('android-native/app/HorizonAIPlugin.kt').includes('"mlvoca.com"'));
});
