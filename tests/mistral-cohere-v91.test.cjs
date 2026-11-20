'use strict';
// V1.99.91: Mistral and Cohere pickers hold exactly the models that passed the user's probe.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const M=['codestral-2508','codestral-latest','ministral-14b-2512','ministral-14b-latest','ministral-3b-2512','ministral-3b-latest','ministral-8b-2512','ministral-8b-latest','voxtral-small-2507','voxtral-small-latest'];
const C=['c4ai-aya-expanse-32b','c4ai-aya-vision-32b','command-a-03-2025','command-a-plus-05-2026','command-a-translate-08-2025','command-a-vision-07-2025','command-r-08-2024','command-r-plus-08-2024','command-r7b-12-2024','command-r7b-arabic-02-2025'];
function load(){const root={};const ctx={window:root,self:root,globalThis:root};ctx.root=root;vm.createContext(ctx);for(const f of ['www/horizon_model_inventory.js','www/horizon_model_policy.js'])vm.runInContext(read(f),ctx);return root;}
test('verified seeds are exactly the probe winners',()=>{const I=load().HorizonModelInventory;assert.deepEqual(Array.from(I.verified.mistral),M);assert.deepEqual(Array.from(I.verified.cohere),C);});
test('refresh filter keeps winners and drops the 429/403/400/000 ones',()=>{
  const P=load().HorizonModelPolicy;
  const bad=['mistral-medium-latest','mistral-small-latest','magistral-small-latest','labs-leanstral-1-5','mistral-moderation-2603','voxtral-mini-latest','voxtral-mini-tts-latest'];
  assert.deepEqual(Array.from(P.select('mistral',{data:M.concat(bad).map(id=>({id}))})).sort(),M.slice().sort());
  const badC=['command-a-reasoning-08-2025','cohere-transcribe-03-2026','tiny-aya-earth','north-mini-code-1.0'];
  assert.deepEqual(Array.from(P.select('cohere',{models:C.concat(badC).map(name=>({name}))})).sort(),C.slice().sort());
});
test('index.html seeds match',()=>{const h=read('www/index.html');
  assert.ok(h.includes('fallbackModels: ['+M.map(x=>"'"+x+"'").join(', ')+']'));assert.ok(h.includes('fallbackModels: ['+C.map(x=>"'"+x+"'").join(', ')+']'));
  assert.ok(h.includes("defaultModel: 'codestral-latest'")&&h.includes("defaultModel: 'command-a-03-2025'"));});
