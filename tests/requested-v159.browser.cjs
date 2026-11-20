const test = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require("node:fs");
const js = file => path.join(__dirname, '..', 'www', file);
async function fixture(body, run) {
 const browser = await chromium.launch({args:['--no-sandbox']});
 try {
  const page = await browser.newPage();
  await page.route('http://horizon.invalid/**', route => route.fulfill({contentType:'text/html',body}));
  await page.goto('http://horizon.invalid/');
  await run(page);
 } finally { await browser.close(); }
}
const A='/storage/emulated/0/Pictures', B='/storage/emulated/0/Download';
test('RSS reads eight feeds, isolates a provider failure, and resolves a YouTube handle', () => fixture('<div id="hzRssView" hidden></div>', async p => {
 await p.evaluate(() => {
  const feeds=Array.from({length:9},(_,i)=>({id:'f'+i,name:'Feed '+i,url:'https://feed.invalid/'+i,on:true,max:10}));
  localStorage.setItem('horizon_rss_v1',JSON.stringify({feeds}));
  const response=(title)=>'<rss version="2.0"><channel><title>'+title+'</title><item><title>'+title+'</title><link>https://site.invalid/</link></item><item><title>Another</title><link>https://site.invalid/story</link></item></channel></rss>';
  window.Capacitor={isNativePlatform:()=>true,Plugins:{CapacitorHttp:{get:async ({url})=>{
   if(url.includes('youtube.com/@')) return {status:200,data:'{"externalId": "UCaaaaaaaaaaaaaaaaaaaaaa"}'};
   if(url.includes('youtube.com/feeds')) return {status:200,data:response('Video Channel')};
   if(url.includes('itunes.apple.com')) return {status:200,data:{results:[{collectionName:'News Podcast',feedUrl:'https://pod.invalid/feed'}]}};
   if(url.endsWith('/8')) return {status:403,data:''};
   return {status:200,data:response(url.split('/').pop())};
  }}}};
 });
 await p.addScriptTag({path:js('horizon_rss.js')});
 const r=await p.evaluate(()=>HorizonRss.run('rss.read','all | 8'));
 assert.equal(new Set(r.items.map(x=>x.feed)).size,8);
 assert.match(r.text,/9 matching enabled feeds checked.*Feed 8/);
 assert.match((await p.evaluate(()=>HorizonRss.discover('@video')))[0].url,/channel_id=UCa/);
 assert.equal((await p.evaluate(()=>HorizonRss.search('news','podcast')))[0].name,'News Podcast');
}));
test('Library playlist uses local metadata and renders the full list and a play button', () => fixture('<main></main>',async p=>{
 await p.addScriptTag({content:fs.readFileSync(js('horizon_studio.js'), 'utf8').replace("D.currentScript ? D.currentScript.src : location.href", "location.href")});
 const r=await p.evaluate(async()=>{
  const calls=[]; window.HorizonMusic={playlistLibrary:async term=>{calls.push(term);return [{id:'m1',title:'A',artist:'Artist'},{id:'m2',title:'B',artist:'Artist'}];}};
  HorizonStudio.init({track:async t=>({text:'Started: '+t.title})});
  const it=HorizonStudio.libraryIntent('Create a 2 track playlist called "My mix" from my music library matching Artist');
  const result=await HorizonStudio.libraryPlaylist(it); document.querySelector('main').append(HorizonStudio.playlistCard(result.item));
  return {calls, playlist:HorizonStudio.get('My mix')};
 });
 assert.deepEqual(r.calls,['Artist']); assert.deepEqual(r.playlist.tracks.map(t=>[t.source,t.id]),[['local','m1'],['local','m2']]);
 assert.equal(await p.getByRole('listitem').count(),2); await p.getByRole('button',{name:'Play playlist'}).click();
 await p.getByRole('status').getByText(/first track playing/).waitFor();
}));
test('WhatsApp commands separate draft and approved reply, with truthful receipts', () => fixture('<main></main>',async p=>{
 await p.evaluate(()=>{window.calls=[]; window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonWaBot:{openDraft:async a=>{calls.push(a);return {opened:true};},replyInBackground:async a=>{calls.push(a);return {submitted:a.text!=='cancel'};}}}};});
 await p.addScriptTag({path:js('horizon_wabot.js')});
 const r=await p.evaluate(async()=>({draft:await HorizonWaBot.manual(HorizonWaBot.command('Send a WhatsApp message to +27 82 123 4567: Hi: there')),reply:await HorizonWaBot.manual(HorizonWaBot.command('WhatsApp reply to Alex: Thanks')),cancel:await HorizonWaBot.manual(HorizonWaBot.command('WhatsApp reply to Alex: cancel')),calls}));
 assert.match(r.draft,/Nothing was sent automatically/); assert.match(r.reply,/Delivery is not confirmed/); assert.match(r.cancel,/Cancelled/);
 assert.deepEqual(r.calls[0],{number:'27821234567',text:'Hi: there'});assert.deepEqual(r.calls[1],{contact:'Alex',text:'Thanks'});
}));
test('File chat moves to a directory and deletion requires a separate checked approval', () => fixture('<div id="hzTerminalPermissions"></div><div id="chatMessages"></div>',async p=>{
 await p.evaluate(({A,B})=>{
  window.calls=[]; window.reads=0;
  window.Capacitor={Plugins:{HorizonFilesAccess:{folders:async()=>({ok:true,folders:[A,B].map(path=>({path,exists:true}))}),status:async()=>({ok:true,enabled:true}),beginMessage:async()=>({ok:true}),declareScope:async d=>({ok:true,scopeRoots:d.scopeRoots}),history:async()=>{reads++;return {ok:true,entries:[]};},managers:async()=>({ok:true,apps:[]})},HorizonFiles:{stat:async d=>({ok:true,mime:d.path===B?'vnd.android.document/directory':'audio/mp4'}),move:async d=>{calls.push(d);return {ok:true,path:d.to};},moveToTrash:async d=>{calls.push(d);return {ok:true,path:d.path};}}}};
 },{A,B});
 await p.addScriptTag({path:js('horizon_files.js')});
 await p.waitForSelector('#hzf-manager');
 assert.equal(await p.getByRole('button',{name:'Open Trash',exact:true}).count(),0);
 async function start(command,id){await p.evaluate(async ({command,id})=>{await HorizonFiles.begin(command,id);window.result='';HorizonFiles.direct(HorizonFiles.directIntent(command)).then(r=>{window.result=r;});},{command,id});}
 await start(`Move "${A}/song.mp4" to "${B}/"`,'1');
 assert.equal(await p.evaluate(()=>calls.length),0);
 await p.getByRole('button',{name:'Apply',exact:true}).last().click();
 await p.waitForFunction(()=>result.includes('1 of 1'));
 assert.equal((await p.evaluate(()=>calls[0])).to,B+'/song.mp4');
 await start(`Delete "${A}/song.mp4"`,'2');
 await p.getByRole('button',{name:'Apply…',exact:true}).last().click();
 assert.equal(await p.evaluate(()=>calls.length),1);
 await p.getByRole('button',{name:'Keep all, run the rest'}).click();
 await p.waitForFunction(()=>result.includes('1 kept'));
 assert.equal(await p.evaluate(()=>calls.length),1);
 await start(`Delete "${A}/song.mp4"`,'3');
 await p.getByRole('button',{name:'Apply…',exact:true}).last().click();
 await p.locator('.hzf-plan').last().getByRole('checkbox').check();
 await p.locator('.hzf-plan').last().getByRole('button',{name:'Move ticked to Trash'}).click();
 await p.waitForFunction(()=>result.includes('1 moved to Trash'));
 assert.equal((await p.evaluate(()=>calls[1])).userConfirmed,true);
}));
test('YouTube music and queue use a single video element and resolve each track just in time',()=>fixture('<div id="mpNow"></div><div id="mpStreamBox" hidden><video id="mpStreamVideo"></video><span role="status"></span><a></a></div>',async p=>{
 await p.evaluate(()=>{
  window.streams=[]; window.mediaPlays=[];
  Object.defineProperty(HTMLMediaElement.prototype,'paused',{get(){return !this._playing;}});
  HTMLMediaElement.prototype.play=function(){this._playing=true;mediaPlays.push(this.tagName);this.dispatchEvent(new Event('play'));this.dispatchEvent(new Event('playing'));return Promise.resolve();};
  HTMLMediaElement.prototype.pause=function(){this._playing=false;this.dispatchEvent(new Event('pause'));};
  HTMLMediaElement.prototype.load=function(){};
 });
 await p.addScriptTag({path:js('horizon_native_audio.js')}); await p.addScriptTag({path:js('horizon_music.js')});
 const r=await p.evaluate(async()=>{
  await HorizonMusic.init({videoStream:async id=>{streams.push(id);return {url:'https://video.invalid/'+id,title:'Video '+id};}});
  const first=await HorizonMusic.playRemote({id:'abcdefghijk'});
  HorizonMusic.queueRemote({id:'lmnopqrstuv'},true); return {first,streams:streams.slice(),mediaPlays:mediaPlays.slice()};
 });
 assert.equal(r.first.ok,true); assert.deepEqual(r.streams,['abcdefghijk']); assert.deepEqual(r.mediaPlays,['VIDEO']);
 assert.equal(await p.locator('#mpStreamBox').isVisible(),true);
 await p.evaluate(()=>document.querySelector('video').dispatchEvent(new Event('ended')));
 await p.waitForFunction(()=>streams.length===2 && mediaPlays.length===2);
 assert.deepEqual(await p.evaluate(()=>mediaPlays),['VIDEO','VIDEO']);
}));
test('Maps switches real Leaflet layers and remembers satellite selection',()=>fixture('<div id="hzMapsView" style="width:760px"></div>',async p=>{
 const tiles=[];
 await p.route(/\/(?:tile|MapServer)\//, r=>{tiles.push(r.request().url()); return r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==','base64')});});
 await p.addStyleTag({path:js('vendor/leaflet/leaflet.css')});
 await p.addStyleTag({path:js('horizon_maps.css')});
 await p.addScriptTag({path:js('vendor/leaflet/leaflet.js')});
 await p.addScriptTag({path:js('horizon_maps.js')});
 await p.evaluate(()=>HorizonMaps.show());
 await p.locator('.leaflet-control-scale').waitFor();
 await p.getByRole('button',{name:'Satellite view'}).click();
 assert.equal(await p.getByRole('button',{name:'Street view'}).count(),1);
 assert.match(await p.locator('.leaflet-control-attribution').textContent(),/Esri/);
 assert.equal(await p.evaluate(()=>JSON.parse(localStorage.getItem('horizon_maps_v1')).tiles),'satellite');
 assert.ok(tiles.some(u=>u.includes('World_Imagery')));
 await p.getByRole('button',{name:'Street view'}).click();
 assert.match(await p.locator('.leaflet-control-attribution').textContent(),/OpenStreetMap/);
}));
test('Notification tone UI reports silent channels and makes repair opt-in',()=>fixture('<main class="tab-body" data-tab="personalisation"></main>',async p=>{
 await p.evaluate(()=>{window.repairs=0;window.Capacitor={Plugins:{HorizonAI:{toneList:async()=>({tones:[]}),notifyTest:async()=>({shown:true}),notifyStatus:async()=>({volume:0,sound:false}),notifyRepairSound:async()=>{repairs++;}}}};});
 await p.addScriptTag({path:js('horizon_tones.js')});
 await p.getByRole('button',{name:'Send a test pop-up'}).click();
 await p.locator('#toneStatus').getByText(/notification volume is at zero/).waitFor();
 await p.getByRole('button',{name:'Reset sound channels'}).click();
 assert.equal(await p.evaluate(()=>repairs),0);
 p.once('dialog',d=>d.accept());
 await p.getByRole('button',{name:'Reset sound channels'}).click();
 await p.locator('#toneStatus').getByText(/Sound channels reset/).waitFor();
 assert.equal(await p.evaluate(()=>repairs),1);
}));
test('Actual chat composer creates a local playlist without an AI key and restores its card',async()=>{
 const browser=await chromium.launch({args:['--no-sandbox']});
 try {
  const page=await browser.newPage();
  await page.route('http://horizon.invalid/**',async route=>{
   const target=path.join(__dirname,'..','www',new URL(route.request().url()).pathname);
   if (!fs.existsSync(target) || !fs.statSync(target).isFile()) return route.fulfill({status:404,body:''});
   return route.fulfill({path:target});
  });
  await page.goto('http://horizon.invalid/index.html');
  await page.evaluate(()=>{HorizonMusic.playlistLibrary=async()=>[{id:'m1',title:'Library test track',artist:'Local'}];});
  await page.locator('#chatInput').fill('Create a playlist called "Saved mix" from my library');
  await page.locator('#sendBtn').click();
  await page.getByRole('region',{name:'Library playlist'}).getByText('Library test track',{exact:false}).waitFor();
  await page.waitForFunction(()=>Object.keys(localStorage).some(k=>(localStorage.getItem(k)||'').includes('libraryPlaylist')));
  await page.reload();
  await page.getByRole('region',{name:'Library playlist'}).getByText('Library test track',{exact:false}).waitFor();
 } finally {await browser.close();}
});
