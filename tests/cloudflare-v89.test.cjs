'use strict';
// V1.99.89: Cloudflare lists exactly the 19 user-verified models, no fallback; LoRA chat models are allowed.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const WIN=['@cf/openai/gpt-oss-120b','@cf/google/gemma-2b-it-lora','@cf/meta/llama-3.2-3b-instruct','@cf/meta/llama-3.1-8b-instruct-fp8','@cf/meta/llama-3.2-1b-instruct','@cf/meta/llama-3.3-70b-instruct-fp8-fast','@cf/ibm-granite/granite-4.0-h-micro','@cf/qwen/qwen2.5-coder-32b-instruct','@cf/nvidia/nemotron-3-120b-a12b','@cf/aisingapore/gemma-sea-lion-v4-27b-it','@cf/qwen/qwen3-30b-a3b-fp8','@cf/google/gemma-7b-it-lora','@cf/google/gemma-4-26b-a4b-it','@cf/mistralai/mistral-small-3.1-24b-instruct','@cf/daily-co/phonellm-mini-alpha-2','@cf/qwen/qwen3.8-27b','@cf/moondream/moondream3.1-9B-A2B','@cf/meta/llama-4-scout-17b-16e-instruct','@cf/qwen/qwq-32b'];
function load(){const root={};const ctx={window:root,self:root,globalThis:root};ctx.root=root;vm.createContext(ctx);
  for(const f of ['www/horizon_model_inventory.js','www/horizon_model_policy.js'])vm.runInContext(read(f),ctx);return root;}
test('verified.cloudflare is exactly the 19 winners, in order',()=>{
  const r=load();assert.deepEqual(Array.from(r.HorizonModelInventory.verified.cloudflare),WIN);
});
test('index.html fallbackModels and safeModels carry the same 19 and default is 8B fp8',()=>{
  const h=read('www/index.html');
  const cf=h.slice(h.indexOf('PROVIDERS.cloudflare = oaiGateway('),h.indexOf('PROVIDERS.cloudflare.split'));
  assert.ok(cf.includes("defaultModel:'@cf/meta/llama-3.1-8b-instruct-fp8'"));
  for(const m of WIN)assert.ok(cf.split("'"+m+"'").length>=3,m); // appears in fallbackModels and safeModels
});
test('LoRA Gemma chat models pass the Cloudflare catalogue filter; paid ones still blocked',()=>{
  const r=load(),P=r.HorizonModelPolicy||r.HorizonPolicy;assert.ok(P&&P.select);
  const got=Array.from(P.select('cloudflare',{result:WIN.map(name=>({name})).concat([{name:'@cf/zai-org/glm-5.3'}])}));
  assert.deepEqual(got.sort(),WIN.slice().sort());
});
test('picker seed has no retry chain',()=>{
  const r=load(),P=r.HorizonModelPolicy||r.HorizonPolicy,reg={cloudflare:{name:'CF',defaultModel:'@cf/meta/llama-3.1-8b-instruct-fp8',headers:()=>({})}};
  P.configure(reg);assert.equal(reg.cloudflare.modelWalk,false);assert.equal(reg.cloudflare.defaultModel,'@cf/meta/llama-3.1-8b-instruct-fp8');assert.equal(reg.cloudflare.fallbackModels.length,19);
});
