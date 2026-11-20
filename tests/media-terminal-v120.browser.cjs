'use strict';
// Deterministic host-browser tests. Native Android APIs and YouTube transport are MOCKS.
const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), path=require('node:path'), http=require('node:http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'../www'), evidence=path.join(__dirname,'results-v120');
let server,browser,origin;
test.before(async()=>{
 fs.mkdirSync(evidence,{recursive:true});
 server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)&&file!==root){res.writeHead(403).end();return;}let f=file===root+path.sep||file===root?path.join(root,'index.html'):file;try{res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':f.endsWith('.css')?'text/css':f.endsWith('.png')?'image/png':'text/html');res.end(fs.readFileSync(f));}catch{res.writeHead(404).end();}}).listen(0,'127.0.0.1');await new Promise(r=>server.on('listening',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
});
test.after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
async function page(){const p=await browser.newPage({viewport:{width:430,height:932}});await p.route('**/*',r=>r.request().url().startsWith(origin)?r.continue():r.abort());return p;}
async function js(p,f){await p.addScriptTag({path:path.join(root,f)});}
test('full app opens; radio is above metadata/music and video owns the entire media area',async()=>{
 const p=await page(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto(origin,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1200);
 await p.evaluate(()=>{document.getElementById('leftPanel').classList.add('open');document.getElementById('hzWidgets').hidden=false;});await p.waitForTimeout(500);
 const initial=await p.evaluate(()=>{const t=document.querySelector('[data-face="radio"]').getBoundingClientRect(),m=document.querySelector('[data-face="music"]').getBoundingClientRect();return {tuner:getComputedStyle(document.querySelector('[data-face="radio"]')).display,above:t.bottom<=m.top+2,radio:!!window.HorizonRadio};});
 assert.equal(initial.radio,true);assert.notEqual(initial.tuner,'none');assert.equal(initial.above,true);
 await p.screenshot({path:path.join(evidence,'radio-above-music.png')});
 await p.evaluate(()=>{
   window.YT={Player:function(node,o){const iframe=document.createElement('iframe');node.replaceWith(iframe);this.getIframe=()=>iframe;this.getPlayerState=()=>1;this.loadModule=()=>{};this.unloadModule=()=>{};this.destroy=()=>iframe.remove();this.playVideo=()=>o.events.onStateChange({data:1});this.pauseVideo=()=>{};window.testYtOptions=o;queueMicrotask(()=>o.events.onReady({target:this}));}};
 });
 const result=await p.evaluate(()=>HorizonWatch.embed({id:'abcdefghijk',title:'Video layout test'}));assert.equal(result.ok,true);await p.waitForTimeout(850);
 const video=await p.evaluate(()=>{const media=document.getElementById('hzRpMedia'),v=document.getElementById('hzRpVideo');return {lyr:getComputedStyle(document.getElementById('hzRpLyrics')).display,subs:getComputedStyle(document.getElementById('hzRpSubs')).display,tuner:document.querySelector('[data-face="radio"]').hidden,media:media.getBoundingClientRect().height,video:v.getBoundingClientRect().height,controls:testYtOptions.playerVars.controls,fullscreen:testYtOptions.playerVars.fs,allow:v.querySelector('iframe').getAttribute('allow')};});
 assert.equal(video.lyr,'none');assert.equal(video.subs,'none');assert.equal(video.tuner,true);assert.ok(video.video>=video.media-3,JSON.stringify(video));assert.equal(video.controls,1);assert.equal(video.fullscreen,1);assert.match(video.allow,/fullscreen/);
 await p.screenshot({path:path.join(evidence,'full-video-layout.png')});await p.evaluate(()=>HorizonWatch.stop());await p.waitForTimeout(850);assert.equal(await p.locator('[data-face="radio"]').evaluate(n=>n.hidden),false);assert.deepEqual(errors,[]);await p.close();
});
test('local playback refreshes actual metadata and automatically opens matched lyrics',async()=>{
 const p=await page();await p.goto(origin+'/cordova.js');
 await p.setContent('<html><head></head><body><div id="mpMini"></div><section class="panel open"><div id="hzRpLyrics"></div></section></body></html>');
 await p.evaluate(()=>{
  window.metaCalls=0;window.lyricUrls=[];
  window.Capacitor={Plugins:{HorizonMedia:{metadata:async()=>{window.metaCalls++;return {title:'Refreshed Song',artist:'Correct Artist',album:'Actual Album',durationMs:'120000'};}}}};
  window.HorizonAudio=()=>{const a=new EventTarget();a.paused=true;a.currentTime=0;a.duration=120;a.play=()=>{a.paused=false;queueMicrotask(()=>{a.dispatchEvent(new Event('play'));a.currentTime=.3;a.dispatchEvent(new Event('timeupdate'));});return Promise.resolve();};a.pause=()=>{a.paused=true;a.dispatchEvent(new Event('pause'));};return a;};
  window.fetch=async(url)=>{lyricUrls.push(String(url));return {ok:true,status:200,json:async()=>[{artistName:'Correct Artist',trackName:'Refreshed Song',duration:120,syncedLyrics:'[00:00.00]Test opening line\n[00:03.00]Another test line\n[00:06.00]A third line\n[00:10.00]Fourth line'}]};};
 });
 await js(p,'horizon_music.js');await js(p,'horizon_lyrics.js');
 await p.evaluate(async()=>{await HorizonMusic.init({lsGet:()=>null,lsSet(){},notice(){},onChange(){},nativeScan:async()=>({tracks:[{id:123,title:'Old Name',artist:'Unknown artist',path:'/music/test.mp3',music:true,duration:120000}]}),srcFor:p=>p});await HorizonMusic.scan();await HorizonMusic.run('music.play','m123');});
 await p.waitForFunction(()=>HorizonMusic.nowInfo()?.title==='Refreshed Song'&&HorizonLyrics.isOpen());await p.waitForTimeout(300);
 const state=await p.evaluate(()=>({info:HorizonMusic.nowInfo(),metaCalls,urls:lyricUrls,visible:!document.querySelector('.hzly-box').hidden,text:document.querySelector('.hzly-box').textContent}));assert.equal(state.metaCalls,1);assert.equal(state.info.artist,'Correct Artist');assert.equal(state.info.album,'Actual Album');assert.equal(state.visible,true);assert.ok(state.urls.some(x=>/Refreshed|Refreshed%20Song/.test(x)));assert.match(state.text,/Test opening line/);await p.close();
});
test('terminal preserves chunked ANSI/UTF-8 and sends hidden stdin instead of starting another command',async()=>{
 const p=await page();await p.goto(origin+'/cordova.js');await p.setContent('<html><head></head><body></body></html>');
 await p.evaluate(()=>{window.sentInput=[];window.HorizonBridges={busy:()=>true,liveCapable:()=>true,input:async t=>sentInput.push(t),refresh:async()=>{},kill:async()=>true};});await js(p,'horizon_runlog.js');await js(p,'horizon_terminal.js');await p.evaluate(()=>HorizonTerminal.open());
 await p.evaluate(()=>{
  const e=d=>window.dispatchEvent(new CustomEvent('horizon-run',{detail:d}));e({phase:'start',command:'read -r value'});e({phase:'chunk',text:'\x1b[3'});e({phase:'chunk',text:'1m日本語 🎵\x1b[0m\n12345\rOK\x1b[K\n'});
 });
 await p.locator('.hzt-input').fill('private password');await p.locator('.hzt-in').evaluate(f=>f.dispatchEvent(new Event('submit',{cancelable:true,bubbles:true})));assert.deepEqual(await p.evaluate(()=>sentInput),['private password\n']);
 assert.equal(await p.locator('.hzt-input').getAttribute('data-input-hidden'),'true');
 let text=await p.locator('.hzt-out').innerText();assert.match(text,/日本語 🎵/);assert.match(text,/\nOK(?:\n|$)/);assert.doesNotMatch(text,/private password|\[31m/);
 await p.evaluate(()=>window.dispatchEvent(new CustomEvent('horizon-run',{detail:{phase:'end',result:{exitCode:0,ms:100,cwd:'/tmp'}}})));assert.equal(await p.locator('.hzt-input').getAttribute('data-input-hidden'),'false');await p.close();
});
