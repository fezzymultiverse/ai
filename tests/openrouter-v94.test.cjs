'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const OR=["meta-llama/llama-3.3-70b-instruct:free", "deepseek/deepseek-chat-v3.1:free", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3.5-lightning:free", "nvidia/nemotron-3.5-super-vl:free", "recursive/flint-v1.0:free", "xingchen-agi/xing4.0-29b-a4b:free", "baidu/ernie-5.5-flash-preview:free", "cohere/north-mini-code:free", "dots-studio/dots-3-note-preview:free", "google/gemma-4-26b-a4b-it:free", "google/gemma-4-31b-it:free", "liquid/lfm-2.5-2.6b:free", "liquid/lfm-3-1.7b:free"];
function load(){const root={};const ctx={window:root,self:root,globalThis:root};ctx.root=root;vm.createContext(ctx);for(const f of ['www/horizon_model_inventory.js','www/horizon_model_policy.js'])vm.runInContext(read(f),ctx);return root;}
test('OpenRouter picker seed is exactly the 15 given free models, no router',()=>{const r=load(),I=r.HorizonModelInventory;
  assert.deepEqual(Array.from(I.verified.openrouter),OR);assert.ok(I.verified.openrouter.every(m=>/:free$/.test(m)&&!/^openrouter\//.test(m)));
  const reg={openrouter:{name:'OpenRouter',defaultModel:'meta-llama/llama-3.3-70b-instruct:free',headers:()=>({})}};r.HorizonModelPolicy.configure(reg);
  assert.deepEqual(Array.from(reg.openrouter.fallbackModels),OR);assert.equal(reg.openrouter.defaultModel,OR[0]);assert.equal(reg.openrouter.modelWalk,false);});
test('index.html OpenRouter seed matches and starts on Llama 3.3 70B free (when index.html defines an OpenRouter provider)',()=>{const h=read('www/index.html');
  if(!/^\s{12}openrouter: \{/m.test(h))return; /* V1.99.136: index.html defines no OpenRouter provider block; the seed is still guarded by the inventory test above */
  assert.ok(h.includes("defaultModel: 'meta-llama/llama-3.3-70b-instruct:free',\n                fallbackModels: ["+OR.map(x=>"'"+x+"'").join(', ')+"]"));});
