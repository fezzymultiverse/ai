const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
require('../www/horizon_key_import.js');
const K=global.HorizonKeyImport;
const MK=['Zx9yWv8uTs7rQp6o','Nm5lKj4iHg3fEd2c'].join('');
const key=['Ab9cd7Ef5Gh3Jk1L','m2Np4Qr6St8Uv0Wx'].join('');
test('scraper labels in JSON/env/markdown/HTML are extracted without executing markup',()=>{
 for(const note of ['FIRECRAWL_API_KEY="fc-'+key+'"','{"firecrawl":"fc-'+key+'"}','<div><b>Firecrawl</b>: <code>fc-'+key+'</code></div>','**Firecrawl**: `fc-'+key+'`'])assert.deepEqual(K.extract(note).items,[{provider:'firecrawl',key:'fc-'+key}]);
});
test('all four scraper labels share canonical parser and ScraperBee alias',()=>{
 for(const [name,id] of [['SerpAPI','serpapi'],['ScrapingBee','scrapingbee'],['ScraperBee','scrapingbee'],['Browserless','browserless']])assert.equal(K.extract(name+': '+key).items[0].provider,id);
});
test('browserless token environment variable is recognised',()=>assert.equal(K.extract('BROWSERLESS_TOKEN='+key).items[0].provider,'browserless'));
test('messy scraper note deduplicates across formats and rejects conflicting owner',()=>{
 const note='Firecrawl: fc-'+key+'\n{"firecrawl":"fc-'+key+'"}\nSerpAPI: gsk_'+key;
 const r=K.extract(note);assert.equal(r.items.length,1);assert.ok(r.rejected);
});
test('HTML headings can precede a key in the next block',()=>assert.equal(K.extract('<div>SerpAPI</div><div>'+key+'</div>').items[0].provider,'serpapi'));
test('a labelled URL is not imported as an unprefixed secret',()=>assert.equal(K.extract('Browserless: https://example.com/'+key).items.length,0));
test('zero-width paste artifacts and curly quotes do not corrupt scraper tokens',()=>assert.equal(K.extract('Firecrawl: “fc-'+key.slice(0,10)+'\u200b'+key.slice(10)+'”').items[0].key,'fc-'+key));
test('a standalone opaque key never guesses its service',()=>assert.equal(K.extract(key).items.length,0));
test('placeholder scraper keys are refused',()=>assert.equal(K.extract('SerpAPI: your_api_key_goes_here').items.length,0));
function harness(methods={}) {
 const handlers={},events=[],calls=[];
 const tm={status:async()=>({enabled:true,aiEnabled:true,permission:true,installed:true}),execute:async a=>{calls.push(a);return{jobId:'job-1'};},result:async()=>({status:'complete',exitCode:0,stdout:'ok'}),...methods};
 const document={readyState:'loading',hidden:false,addEventListener(){},querySelectorAll(){return[];},getElementById(){return null;}};
 const window={Capacitor:{isNativePlatform:()=>true,Plugins:{HorizonTermux:tm}},addEventListener(n,fn){handlers[n]=fn;},dispatchEvent(e){events.push(e.detail);}};
 class CustomEvent {constructor(type,o){this.type=type;this.detail=o.detail;}}
 vm.runInNewContext(fs.readFileSync(path.join(root,'www/horizon_bridges.js'),'utf8'),{window,document,CustomEvent,Promise,Date,setTimeout,clearTimeout});
 return{api:window.HorizonBridges,handlers,events,calls};
}
test('manual and AI commands share exactly one bridge owner',async()=>{const h=harness();await h.api.refresh();await h.api.termux('printf manual',100,false);await h.api.run('termux.run','printf ai');assert.deepEqual(h.calls.map(x=>x.fromAI),[false,true]);assert.equal(h.events.filter(x=>x.phase==='complete').length,2);assert.equal(h.api.busy(),false);});
test('concurrent submission is refused before a second native call',async()=>{
 let release;const h=harness({result:()=>new Promise(r=>release=r)});const first=h.api.termux('sleep 1',10000,false);await new Promise(r=>setImmediate(r));
 await assert.rejects(h.api.termux('duplicate',100,false),/still pending/);assert.equal(h.calls.length,1);release({status:'complete',exitCode:0,stdout:'done'});await first;assert.equal(h.api.busy(),false);
});
test('approval rejection releases lock and surfaces one error',async()=>{const h=harness({execute:async()=>{throw new Error('User declined');}});await assert.rejects(h.api.termux('no',100,false),/declined/);assert.equal(h.api.busy(),false);assert.equal(h.events.filter(x=>x.phase==='error').length,1);});
test('unknown completion holds lock until a late result arrives',async()=>{const h=harness();await assert.rejects(h.api.termux('sleep 10',-1,false),/may still be running/);assert.equal(h.api.busy(),true);await assert.rejects(h.api.termux('again',100,false),/still pending/);h.handlers['horizon-termux-result']({detail:{id:'job-1',exitCode:0,stdout:'late'}});assert.equal(h.api.busy(),false);assert.equal(h.events.at(-1).phase,'recovered');});
test('AI download capability instructions describe supported tools truthfully',async()=>{const h=harness();await h.api.refresh();const text=h.api.block();assert.match(text,/Music, video, playlists and ordinary file downloads work with yt-dlp/);assert.match(text,/Every result starts with exit N/);});
test('obsolete native shell implementation and AI route are removed',()=>{const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');assert.ok(!fs.existsSync(path.join(root,'www/horizon_shell.js')));assert.ok(!html.includes('Horizon.Shell'));const main=fs.readFileSync(path.join(root,'resources/android/java/MainActivity.java'),'utf8');assert.ok(!main.includes('registerPlugin(HorizonShellPlugin'));});
test('all application JavaScript parses',()=>{for(const name of fs.readdirSync(path.join(root,'www')).filter(x=>x.endsWith('.js')))new vm.Script(fs.readFileSync(path.join(root,'www',name),'utf8'),{filename:name});});
test('release migration never clears user databases or starts reload loops',()=>{const s=fs.readFileSync(path.join(root,'www/horizon_release.js'),'utf8');assert.ok(!s.includes('localStorage.clear'));assert.ok(!s.includes('indexedDB.deleteDatabase'));assert.ok(!s.includes('location.reload'));assert.ok(s.includes('horizon_asset_release'));});
test('terminal helper has event-based mounting and no document-wide observer',()=>{const s=fs.readFileSync(path.join(root,'www/horizon_termai.js'),'utf8');assert.match(s,/horizon-terminal-ready/);assert.ok(!s.includes('new MutationObserver'));});
test('laser has no permanent idle interval and respects motion settings',()=>{const s=fs.readFileSync(path.join(root,'www/horizon_laser.js'),'utf8');assert.ok(!s.includes('setInterval'));assert.match(s,/prefers-reduced-motion/);assert.match(s,/document.hidden/);});
test('one canonical stylesheet replaces the old layout patch files',()=>{assert.deepEqual(fs.readdirSync(path.join(root,'www')).filter(x=>x.endsWith('.css')),['horizon_app.css']);const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');assert.equal((html.match(/rel="stylesheet"/g)||[]).length,1);});
test('two key note boxes (Providers = AI keys, Web Scraping = scraper keys) share one extractor and one key store',()=>{const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');assert.ok(!html.includes('id="hzKeyNote"'));assert.match(html,/id: 'hzKeyImporter'/);assert.match(html,/id: 'hzWebKeyImporter'/);assert.match(html,/function makeKeyImporter/);assert.match(html,/saveImportedAiKey/);assert.match(html,/saveImportedWebKey/);assert.match(html,/xKeys\(id\)\.concat\(key\)/);assert.match(html,/xWebKeys\(id\)/);});
test('oversized opaque token is rejected whole rather than imported in chunks',()=>{assert.equal(K.extract('SerpAPI: '+key.repeat(260)).items.length,0);});
test('mixed AI and scraper notes retain exact provider routing',()=>{assert.deepEqual(K.extract('Groq: gsk_'+key+'\nFirecrawl: fc-'+key).items.map(x=>x.provider),['groq','firecrawl']);});

// ---- V1.93.25: the extractor must place keys right and never invent them ----
const G='gsk_Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789ab', FC='fc-0a1b2c3d4e5f0a1b2c3d4e5f0a1b2c3d4e5f';
test('model names, file names and hyphenated words are never taken as keys',()=>{
 for(const note of ['Mistral model: mistral-small-latest-2506-instruct','Mistral config: settings_backup_final_v2.json','Cohere: command-a-03-2025-preview-large','Groq default is llama-3.3-70b-versatile'])assert.deepEqual(K.extract(note).items,[],note);
});
test('a key-sized run with odd characters is rejected whole, not cut into a shorter key',()=>{
 assert.deepEqual(K.extract('Mistral: '+MK+'/extra!stuff?').items,[]);
 assert.equal(K.extract('LLM7: ab12+cd34/ef56=gh78~ij90').items[0].key,'ab12+cd34/ef56=gh78~ij90');
});
test('the same key under two providers is dropped from both',()=>{
 const r=K.extract('Mistral: '+MK+'\nCohere: '+MK+'');
 assert.deepEqual(r.items,[]);assert.equal(r.ambiguous.length,1);
});
test('unlabelled keys without a unique prefix are never guessed',()=>assert.deepEqual(K.extract(''+MK+'').items,[]));
test('a key with a unique prefix under the wrong label is refused, not moved',()=>assert.deepEqual(K.extract('Groq: '+FC).items,[]));
test('Cloudflare and OVH labels place keys where they belong, and a GitHub token is filed under no provider (GitHub Models is retired)',()=>{
 assert.deepEqual(K.extract('GitHub Models token: ghp_Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789').items,[]);
 assert.equal(K.extract('Cloudflare: 0123456789abcdef0123456789abcdef:Ab3dEfGh1jKlMnOpQrStUvWxYz').items[0].provider,'cloudflare');
 assert.equal(K.extract('OVH token: eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.abcDEF123.xyz789').items[0].provider,'ovh');
});
test('backup keys: two keys for one provider are both kept, in order',()=>{
 const r=K.extract('Groq: '+G+'\nGroq backup: gsk_ZZZZ1111yyyy2222XXXX3333wwww4444');
 assert.deepEqual(r.items.map(x=>x.provider),['groq','groq']);
});
test('scope keeps each box to its own list and reports the rest',()=>{
 const note='Groq: '+G+'\nFirecrawl: '+FC;
 const w=K.extract(note,{scope:'web'}),a=K.extract(note,{scope:'ai'});
 assert.deepEqual(w.items.map(x=>x.provider),['firecrawl']);assert.deepEqual(w.elsewhere.map(x=>x.provider),['groq']);
 assert.deepEqual(a.items.map(x=>x.provider),['groq']);assert.deepEqual(a.elsewhere.map(x=>x.provider),['firecrawl']);
});
test('ch.at is a keyless provider wired through the app, the native allowlist and the fallback path',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 assert.match(html,/PROVIDERS\.chatat = oaiGateway/);assert.match(html,/id="i-b-chatat"/);assert.match(html,/keyless: true,\s*modelsOptional: true/);
 assert.match(fs.readFileSync(path.join(root,'www/horizon_browser.js'),'utf8'),/id === 'chatat'/);
 assert.match(fs.readFileSync(path.join(root,'resources/android/java/HorizonAIPlugin.kt'),'utf8'),/"ch\.at"/);
 assert.match(fs.readFileSync(path.join(root,'resources/android/java/HorizonCheckinPlugin.kt'),'utf8'),/"chatat" to "https:\/\/ch\.at\/v1\/chat\/completions"/);
});
test('BlockRun is a keyless provider wired through the app, the native allowlist and the fallback path',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 assert.match(html,/PROVIDERS\.blockrun = oaiGateway/);assert.match(html,/id="i-b-blockrun"/);assert.match(html,/base: 'https:\/\/blockrun\.ai\/api\/v1',[\s\S]{0,120}keyless: true/);
 assert.match(fs.readFileSync(path.join(root,'www/horizon_browser.js'),'utf8'),/id === 'blockrun'/);
 assert.match(fs.readFileSync(path.join(root,'resources/android/java/HorizonAIPlugin.kt'),'utf8'),/"blockrun\.ai"/);
 assert.match(fs.readFileSync(path.join(root,'resources/android/java/HorizonCheckinPlugin.kt'),'utf8'),/"blockrun" to "https:\/\/blockrun\.ai\/api\/v1\/chat\/completions"/);
});
test('Double-tap select is loaded after the message menu and never touches links, buttons or code headers',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 const a=html.indexOf('horizon_msgmenu.js'),b=html.indexOf('horizon_dtsel.js');
 assert.ok(a>0&&b>a,'horizon_dtsel.js must load after horizon_msgmenu.js');
 const js=fs.readFileSync(path.join(root,'www/horizon_dtsel.js'),'utf8');
 assert.match(js,/var SKIP = 'a, button, input, textarea, select, \.code-head/);
 assert.match(js,/window\.HorizonDtSel = \{/);
 assert.match(js,/mem\.stage === 1/);
 assert.match(fs.readFileSync(path.join(root,'www/horizon_app.css'),'utf8'),/\.hz-dtpill \{/);
});
test('VLM Run and AI Horde are keyless providers wired through the app, the native allowlist and the fallback path',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 assert.match(html,/PROVIDERS\.vlmrun = oaiGateway/);assert.match(html,/PROVIDERS\.aihorde = oaiGateway/);
 assert.match(html,/id="i-b-vlmrun"/);assert.match(html,/id="i-b-aihorde"/);
 assert.match(html,/base: 'https:\/\/gateway\.vlm\.run\/v1\/openai',[\s\S]{0,160}keyless: true/);
 assert.match(html,/base: 'https:\/\/oai\.aihorde\.net\/v1',[\s\S]{0,160}keyless: true/);
 assert.match(html,/PROVIDERS\.aihorde\.headers = \(\) => \(\{ Authorization: 'Bearer 0000000000' \}\)/);
 assert.match(html,/PROVIDERS\.vlmrun\.headers = \(\) => \(\{\}\)/);
 const br=fs.readFileSync(path.join(root,'www/horizon_browser.js'),'utf8');
 assert.match(br,/id === 'vlmrun'/);assert.match(br,/id === 'aihorde'/);
 const kt=fs.readFileSync(path.join(root,'resources/android/java/HorizonAIPlugin.kt'),'utf8');
 assert.match(kt,/"gateway\.vlm\.run"/);assert.match(kt,/"oai\.aihorde\.net"/);
 const ci=fs.readFileSync(path.join(root,'resources/android/java/HorizonCheckinPlugin.kt'),'utf8');
 assert.match(ci,/"vlmrun" to "https:\/\/gateway\.vlm\.run\/v1\/openai\/chat\/completions"/);
 assert.match(ci,/"aihorde" to "https:\/\/oai\.aihorde\.net\/v1\/chat\/completions"/);
 assert.match(ci,/"aihorde" -> if \(key\.isBlank\(\) \|\| key == "free"\) "0000000000" else key/);
});
test('BlockRun skips a model that answers free capacity exhausted and lists only billing_mode free models',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 assert.match(html,/walkOnCapacity: true/);assert.match(html,/free model capacity exhausted\|FREE_MODEL_FAILED/);assert.match(html,/m\.billing_mode \? \/free\/i/);
});
test('Requesty keys with + / = ~ are accepted on the card',()=>{
 const rq='sk-Ab3dEfGh1jKlMn+OpQrSt/UvWxYz0123456789==';
 assert.equal(K.validate('requesty',rq),'');
 assert.notEqual(K.validate('groq',rq),'');
 assert.match(K.validate('requesty','short'),/complete API key/);
});
test('paid providers (Claude, ChatGPT, DeepSeek, Grok) are wired, manual-only and never auto-hopped',()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');
 for(const id of ['claude','openai','deepseek','xai']){
  assert.match(html,new RegExp('PROVIDERS\\.'+id+' = oaiGateway'));assert.match(html,new RegExp('PROVIDERS\\.'+id+'\\.manualOnly = true'));
  assert.match(html,new RegExp('id="i-b-'+id+'"'));assert.match(html,new RegExp("'card-"+id+"'"));
  assert.match(fs.readFileSync(path.join(root,'www/horizon_usage.js'),'utf8'),new RegExp(id+": '#"));
 }
 assert.match(html,/protocol: 'anthropic',\s*placeholder: 'sk-ant-/);
 assert.match(html,/PROVIDERS\.openai\.tokenParam = 'max_completion_tokens'/);
 const kt=fs.readFileSync(path.join(root,'resources/android/java/HorizonAIPlugin.kt'),'utf8');
 assert.match(kt,/"api\.gonkarouter\.io", "api\.anthropic\.com" ->/);
 assert.match(fs.readFileSync(path.join(root,'www/horizon_browser.js'),'utf8'),/id === 'claude' \|\| id === 'openai' \|\| id === 'deepseek' \|\| id === 'xai'/);
 // no paid provider is offered to background check-ins (they would spend money unattended)
 const ck=fs.readFileSync(path.join(root,'resources/android/java/HorizonCheckinPlugin.kt'),'utf8');
 for(const id of ['claude','openai','deepseek','xai']) assert.ok(!new RegExp('"'+id+'" to').test(ck));
});
test('key shapes: each paid key is filed under its own provider only',()=>{
 const A='sk-ant-api03-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789';
 const X='xai-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789ab';
 const D='sk-'+'0123456789abcdef'.repeat(2);
 const O='sk-proj-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789_-Ab';
 assert.equal(K.identify(A),'claude');assert.equal(K.identify(X),'xai');assert.equal(K.identify(D),'deepseek');assert.equal(K.identify(O),'openai');
 assert.equal(K.identify('sk-or-v1-Ab3dEfGh1jKlMnOpQrStUvWxYz0123456789'),'openrouter');
 for(const [prov,key] of [['claude',A],['xai',X],['deepseek',D],['openai',O]]) assert.equal(K.validate(prov,key),'');
 assert.match(K.validate('openai',A),/belongs to claude/);
 const r=K.extract('Anthropic: '+A+'\nOpenAI: '+O+'\nDeepSeek: '+D+'\nGrok: '+X,{scope:'ai'});
 assert.deepEqual(r.items.map(x=>x.provider).sort(),['claude','deepseek','openai','xai']);
});
