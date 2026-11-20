'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');const read=f=>fs.readFileSync(path.join(root,f),'utf8');
function ctx(files,extra={}){const c={console,URL,Response,Request,AbortController,setTimeout:fn=>{fn();return 0;},clearTimeout(){},...extra};c.window=c;c.globalThis=c;vm.createContext(c);for(const f of files)vm.runInContext(read('www/'+f),c);return c;}
function policy(){return ctx(['horizon_model_inventory.js','horizon_model_policy.js']).HorizonModelPolicy;}
const response=(status,data)=>({status,ok:status>=200&&status<300,json:async()=>data});
const provider=()=>({name:'Fixture',modelsUrl:'https://fixture.test/models',chatUrl:'https://fixture.test/chat',headers:()=>({}),fallbackModels:['one','two'],defaultModel:'one'});
test('validation transport accepts all existing credential-provider hosts with scoped paths only',()=>{
 const n=ctx(['horizon_net.js']).HorizonNet;
 const urls=['https://api.mistral.ai/v1/models','https://api.cohere.com/v2/chat','https://openrouter.ai/api/v1/auth/key','https://api.routeway.ai/v1/models','https://router.requesty.ai/v1/models','https://api.z.ai/api/paas/v4/chat/completions','https://api.aionlabs.ai/v1/models','https://api.opentyphoon.ai/v1/models','https://tokenharbor.ai/v1/chat/completions','https://zro.moonmath.ai/v1/models','https://apihub.agnes-ai.com/v1/models','https://api.gonkarouter.io/v1/models','https://proxy.gonkabroker.com/v1/messages','https://ollama.com/v1/models','https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent'];
 for(const u of urls)assert.equal(n.accepts(u),true,u);
 for(const u of ['https://api.mistral.ai.evil.test/v1/models','https://api.mistral.ai/v1/billing','https://evil@api.mistral.ai/v1/models','http://api.mistral.ai/v1/models','https://api.mistral.ai:8443/v1/models'])assert.equal(n.accepts(u),false,u);
});
test('Mistral credential probing has a real endpoint after configure',()=>{const p=provider();policy().configure({mistral:p});assert.equal(p.chatUrl,'https://api.mistral.ai/v1/chat/completions');});
test('key-save discovery stops after first verified response, explicit refresh still audits catalogue',async()=>{
 const p=policy();let probes=0;const f=async(u)=>u.endsWith('models')?response(200,{data:[{id:'one'},{id:'two'}]}):(probes++,response(200,{choices:[{message:{content:'OK'}}]}));
 assert.equal((await p.discover('fixture',provider(),'synthetic',f,null,{firstSuccess:true})).length,2);assert.equal(probes,1); // V1.99.141: one test reply, full catalogue kept
 probes=0;assert.equal((await p.discover('fixture',provider(),'synthetic',f)).length,2);assert.equal(probes,2);
});
test('a missing models endpoint does not reject credentials when a documented model responds',async()=>{
 const p=policy();const f=async(u)=>u.endsWith('models')?response(404,{}):response(200,{choices:[{message:{content:'OK'}}]});assert.equal((await p.discover('fixture',provider(),'synthetic',f,null,{firstSuccess:true}))[0],'one');
});
test('model-specific forbidden access is not classified as an invalid secret',()=>{const p=policy();assert.equal(p.classify({status:403,detail:'user_model_access_denied'}),'other');assert.equal(p.classify({status:401}),'auth');});
test('OpenRouter positive health requires an authenticated key record, not arbitrary HTTP 200',async()=>{const p=policy();assert.equal((await p.checkKey('openrouter',provider(),'synthetic',async()=>response(200,{error:{message:'bad'}}))).c,'bad');assert.equal((await p.checkKey('openrouter',provider(),'synthetic',async()=>response(200,{data:{}}))).c,'live');});
test('positive verification persists as a fingerprint, expires, and is overridden by failure',()=>{
 const storage={};const c=ctx(['horizon_keyhealth.js'],{localStorage:{getItem:k=>storage[k]||null,setItem:(k,v)=>storage[k]=v},addEventListener(){}});const h=c.HorizonKeyHealth,k='SyntheticSecret0123456789+';
 h.mark('ai','fixture',k,'live');assert.equal(h.verified('ai','fixture',k),true);assert.equal(JSON.stringify(storage).includes(k),false);
 h.mark('ai','fixture',k,'limited',{quiet:true});assert.equal(h.verified('ai','fixture',k),false);
 h.mark('ai','fixture',k,'live');const entries=JSON.parse(storage.horizon_keyhealth_v1_verified);entries[h.fp(k)].t=1;storage.horizon_keyhealth_v1_verified=JSON.stringify(entries);assert.equal(h.verified('ai','fixture',k),false);
});
test('opaque base64 tokens are not rejected before the provider can validate them',()=>{const h=ctx(['horizon_key_import.js']).HorizonKeyImport;for(const id of ['cohere','mistral','gonka','agnes'])assert.equal(h.validate(id,'Abcde12345+Abcde12345/Abcde12345='),'');});
function files(){return ctx(['horizon_files.js'],{document:{readyState:'loading',addEventListener(){},querySelector(){return null;},dispatchEvent(){}},addEventListener(){},localStorage:{getItem(){return null;},setItem(){}},CustomEvent:function(){},Event:function(){}}).HorizonFiles;}
test('AI cannot permanently delete; Trash needs userConfirmed',async()=>{const f=files();for(const a of ['delete','remove']){assert.throws(()=>f._t.planOps(JSON.stringify({ops:[{action:a,path:'/a',reason:'forbidden'}]})));assert.equal((await f._t.call('HorizonFiles',a,{})).code,'OPERATION_DENIED');}assert.doesNotThrow(()=>f._t.planOps(JSON.stringify({ops:[{action:'moveToTrash',path:'/a',reason:'user asked'}]})));assert.equal((await f._t.call('HorizonFiles','moveToTrash',{path:'/a'})).code,'OPERATION_DENIED');assert.equal((await f._t.call('HorizonFiles','moveToTrash',{path:'/a',userConfirmed:false})).code,'OPERATION_DENIED');});
test('file-completion guard does not hijack unrelated PDF/music generation',async()=>{const f=files();for(const text of ['Make a PDF about music','Create a playlist','Remove the background']){await f.begin(text,text);assert.equal(f.mutationRequested(),false);assert.equal(f.finalize('Normal response'),'Normal response');}await f.begin('Rename my files in the folder','file');assert.equal(f.mutationRequested(),true);assert.match(f.finalize('Done'),/No file changes were confirmed/);});
test('native file bridge blocks trash and checks move postconditions without changing overwrite policy',()=>{const j=read('android-native/app/HorizonFilesPlugin.java');const trash=j.slice(j.indexOf('@PluginMethod public void moveToTrash'),j.indexOf('@PluginMethod public void undo'));assert.match(trash,/throw new HorizonFilesState.Fault\("OPERATION_DENIED"/);assert.match(j,/source.exists\(\) \|\| !destination.exists\(\)/);assert.doesNotMatch(j,/\.delete\s*\(/);});
test('empty-library music.play reaches the existing YouTube fallback contract',()=>{assert.ok(read('www/horizon_music.js').includes("if (!lib.length && kind === 'music.play') return { text: 'ERROR: nothing in the library matches"));});
test('V144: Horizon Worker providers test at most one model even on an explicit refresh',async()=>{
 const p=policy();let probes=0;const f=async(u)=>u.endsWith('models')?response(200,{data:[{id:'a'},{id:'b'},{id:'c'}]}):(probes++,response(200,{choices:[{message:{content:'OK'}}]}));
 for(const id of ['hzworker']){probes=0;const out=await p.discover(id,provider(),'synthetic',f);assert.equal(probes,1,id);assert.equal(out.length,3,id);}
});
test('V146: Gemini keeps its own sight, no helper provider reads pictures, a picture is only sent with its own message',()=>{
 const h=read('www/index.html');
 assert.ok(/const canSeeImages = \(prov, model\) => prov === 'gemini' \|\|/.test(h));
 assert.ok(h.includes('const EYES_HELPERS = false;'));
 assert.ok(h.includes("hasAtt && i === lastAtt && i === win.length - 1 ? HorizonAttach.images(m.att) : []"));
});
