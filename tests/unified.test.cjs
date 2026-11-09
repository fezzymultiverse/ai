const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
require('../www/horizon_key_import.js');
const K=global.HorizonKeyImport;
const key='Ab9cd7Ef5Gh3Jk1Lm2Np4Qr6St8Uv0Wx';
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
test('one key note box handles AI and scraper keys without another store',()=>{const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');assert.ok(!html.includes('id="hzKeyNote"'));assert.equal((html.match(/id="hzWebKeyNote"/g)||[]).length,1);assert.match(html,/saveImportedAiKey/);assert.match(html,/xKeys\(id\)\.concat\(key\)/);});
test('oversized opaque token is rejected whole rather than imported in chunks',()=>{assert.equal(K.extract('SerpAPI: '+key.repeat(260)).items.length,0);});
test('mixed AI and scraper notes retain exact provider routing',()=>{assert.deepEqual(K.extract('Groq: gsk_'+key+'\nFirecrawl: fc-'+key).items.map(x=>x.provider),['groq','firecrawl']);});
