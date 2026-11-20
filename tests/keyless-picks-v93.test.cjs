'use strict';
// V1.99.93: user-researched additions; manual pick only, a swapped model is refused.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
function load(){const root={};const ctx={window:root,self:root,globalThis:root};ctx.root=root;vm.createContext(ctx);for(const f of ['www/horizon_model_inventory.js','www/horizon_model_policy.js'])vm.runInContext(read(f),ctx);return root;}
test('BlockRun and LLM7 seeds carry the added models',()=>{const I=load().HorizonModelInventory;
  assert.ok(I.verified.blockrun.includes('cohere/north-mini-code'));
  for(const m of ['DeepSeek-V4.1-Flash','Inkling-Small']){assert.ok(I.verified.llm7.includes(m));assert.ok(I.candidates.llm7.includes(m));}
  assert.ok(I.verified.llm7.includes('gpt-oss:20b'));});
test('no automatic walking or fallback for these providers; swapped model is refused',()=>{
  const P=load().HorizonModelPolicy,reg={blockrun:{name:'BlockRun',defaultModel:'x',headers:()=>({}),walkOnCapacity:true},llm7:{name:'LLM7',defaultModel:'x',headers:()=>({}),modelWalk:true}};
  P.configure(reg);for(const k of ['blockrun','llm7']){assert.equal(reg[k].modelWalk,false);assert.equal(reg[k].walkOnCapacity,false);}
  assert.throws(()=>P.assertModel('blockrun','cohere/north-mini-code','nvidia/nemotron-3-super-120b'),/substitution refused/);
});
test('LLM7 DeepSeek V4.1 does not get the R1 blurb',()=>{const h=read('www/index.html');
  assert.ok(h.indexOf("has(/deepseek-v4/)")<h.indexOf("prov === 'llm7' && has(/deepseek/)"));assert.ok(h.includes("has(/inkling/)"));});
