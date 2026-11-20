'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const ROOT=path.resolve(__dirname,'..');let passed=0;
const http=require('node:http');
const server=http.createServer((req,res)=>{
 const file=path.resolve(ROOT,'www','.'+new URL(req.url,'http://localhost').pathname);
 const target=file===path.join(ROOT,'www')?path.join(file,'index.html'):file;
 if(!target.startsWith(path.join(ROOT,'www')+path.sep)||!fs.existsSync(target)){res.writeHead(404).end();return;}
 res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html','.png':'image/png'})[path.extname(target)]||'application/octet-stream');fs.createReadStream(target).pipe(res);
});
async function check(name,fn){await fn();console.log('PASS',name);passed++;}
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:412,height:860},deviceScaleFactor:1});
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://**/*',r=>r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port+'/');await page.waitForTimeout(1800);
 await check('complete app initializes studio, chat, bridge and About without runtime errors',async()=>{
  assert.equal(await page.evaluate(()=>typeof HorizonStudio.open),'function');assert.equal(await page.evaluate(()=>typeof HorizonBridges.run),'function');assert.deepEqual(errors,[]);
 });
 await page.locator('button.hzc-set').click();await page.locator('#hzDockRow').click();
 await check('About keeps original logo and developer and replaces changelog with capabilities',async()=>{
  const text=await page.locator('#hzAbout').textContent();assert.match(text,/Developer: Grant Phil Festers/);assert.match(text,/WHAT HORIZON CAN DO/);assert.doesNotMatch(text,/CHANGELOG|Show older versions/);assert.equal(await page.locator('#hzAbout .hza-logo').getAttribute('src'),'icon.png');assert.equal(await page.locator('.hza-cap-card').count(),8);
 });
 await page.locator('#hzAbout').scrollIntoViewIfNeeded();
 await page.evaluate(()=>HorizonStudio.open());
 await check('studio fits a phone viewport and renders safe editable fields',async()=>{
  const box=await page.locator('.hz-studio').boundingBox();assert.ok(box.width<=412);assert.ok(box.height<=860);assert.equal(await page.locator('.hz-studio').count(),1);
 });
 await check('playlists persist with ordered tracks, reject duplicate names and do not touch provider selection',async()=>{
  const r=await page.evaluate(()=>{localStorage.setItem('horizon_active_provider','gemini');HorizonStudio.create({name:'Night drive',tracks:['Artist A - One','Artist B - Two',{source:'local',id:'m1',title:'Third'}]});let duplicate=false;try{HorizonStudio.create({name:'night drive',tracks:['Other']});}catch(e){duplicate=true;}return {p:HorizonStudio.get('Night drive'),duplicate,provider:localStorage.getItem('horizon_active_provider')};});
  assert.deepEqual(r.p.tracks.map(t=>t.query||t.id),['Artist A - One','Artist B - Two','m1']);assert.ok(r.duplicate);assert.equal(r.provider,'gemini');
 });
 await check('one playlist tool creates a complete saved list and quoted code never executes',async()=>{
  const r=await page.evaluate(async()=>({created:await HorizonBridges.run('playlist.create',JSON.stringify({name:'AI mix',tracks:['A - B','C - D']})),calls:HorizonBridges.parse('[[playlist.list]]'),code:HorizonStudio.parse('```text\n[[playlist.play: Night drive]]\n```')}));assert.match(r.created.text,/Saved playlist/);assert.equal(r.calls[0].kind,'playlist.list');assert.equal(r.code.length,0);
 });
 await check('playlist playback starts once and queues later tracks in exact order',async()=>{
  const r=await page.evaluate(async()=>{window.trackCalls=[];HorizonStudio.init({track:async(t,q)=>{window.trackCalls.push({track:t.query||t.id,queue:q});return{text:q?'Queued: track':'Started: track'};}});return {result:await HorizonStudio.play('Night drive'),calls:window.trackCalls};});
  assert.deepEqual(r.calls.map(c=>c.queue),[false,true,true]);assert.deepEqual(r.calls.map(c=>c.track),['Artist A - One','Artist B - Two','m1']);assert.match(r.result.text,/2 queued in order/);
 });
 await check('failed and ambiguous track resolutions stop without claiming a complete playlist',async()=>{
  const r=await page.evaluate(async()=>{let count=0;HorizonStudio.init({track:async(t,q)=>{count++;return{text:q?'NEEDS CHOICE: two matches':'Started: first'};}});const result=await HorizonStudio.play('Night drive');return{count,result};});assert.equal(r.count,2);assert.match(r.result.text,/ERROR:.*1\/3/s);
 });
 await check('playlist export preserves real references and requires saver acknowledgement',async()=>{
  const r=await page.evaluate(async()=>{const original=HorizonOutputs.saveBlob;HorizonOutputs.saveBlob=async(blob,name)=>{window.exported={name,text:await blob.text(),type:blob.type};return'Download/'+name;};try{await HorizonStudio.exportList('Night drive');return window.exported;}finally{HorizonOutputs.saveBlob=original;}});assert.match(r.name,/\.playlist\.json$/);assert.equal(JSON.parse(r.text).tracks.length,3);assert.equal(r.type,'application/json');
 });
 await check('local music renders valid non-silent bounded WAV in a Web Worker without network',async()=>{
  const r=await page.evaluate(async()=>{const start=performance.now();let ticks=0;const timer=setInterval(()=>ticks++,1);const blob=await HorizonStudio.renderMusic({title:'Test',seconds:5,bpm:90,style:'lofi'});clearInterval(timer);const buf=await blob.arrayBuffer(),v=new DataView(buf);let peak=0;for(let i=44;i<buf.byteLength;i+=2)peak=Math.max(peak,Math.abs(v.getInt16(i,true)));return{size:blob.size,type:blob.type,magic:String.fromCharCode(...new Uint8Array(buf,0,4)),wave:String.fromCharCode(...new Uint8Array(buf,8,4)),rate:v.getUint32(24,true),seconds:v.getUint32(40,true)/2/v.getUint32(24,true),ticks,peak,elapsed:performance.now()-start};});assert.equal(r.magic,'RIFF');assert.equal(r.wave,'WAVE');assert.equal(r.rate,44100);assert.equal(r.seconds,5);assert.equal(r.size,441044);assert.equal(r.type,'audio/wav');assert.ok(r.peak>1000&&r.peak<32767);assert.ok(r.ticks>0);console.log('WORKER',JSON.stringify(r));
 });
 await check('UI Compose creates a playable WAV reference without forcing autoplay and enables Save',async()=>{
  await page.getByLabel('Duration · 5–120 seconds').fill('5');await page.getByRole('button',{name:'Compose locally',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.hz-studio audio').src.startsWith('blob:'));assert.ok(!(await page.getByRole('button',{name:'Save WAV',exact:true}).isDisabled()));assert.equal(await page.locator('.hz-studio audio').evaluate(a=>a.paused),true);
 });
 await check('podcast drafts are only opened, not silently synthesized or exported',async()=>{
  const result=await page.evaluate(()=>HorizonStudio.run('studio.podcast',JSON.stringify({script:'Host: Welcome.\nGuest: Hello.'})));assert.match(result.text,/No audio has been generated/);assert.equal(await page.getByLabel('Podcast script · edit before playback').inputValue(),'Host: Welcome.\nGuest: Hello.');assert.match(await page.locator('.hz-studio').innerText(),/does not export recorded speech/);
 });
 await check('podcast playback uses offline native voices and splits long scripts safely',async()=>{
  const r=await page.evaluate(async()=>{window.spoken=[];window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonSpeech:{stop:async()=>{},getSupportedVoices:async()=>({voices:[{name:'online',lang:'en-US',network:true},{name:'offline',lang:'en-US',network:false}]}),speak:async o=>{window.spoken.push(o);}}}};await HorizonStudio.speak('word '.repeat(530));return window.spoken;});assert.ok(r.length>=3);assert.ok(r.every(x=>x.text.length<=1001&&x.voiceName==='offline'));assert.ok(r.every(x=>Object.keys(x.effects).length===0));
 });
 await check('podcast refuses network-only voice engines instead of silently using a cloud service',async()=>{
  const r=await page.evaluate(async()=>{Capacitor.Plugins.HorizonSpeech.getSupportedVoices=async()=>({voices:[{name:'online',network:true}]});try{await HorizonStudio.speak('hello');return'';}catch(e){return e.message;}});assert.match(r,/No offline device voice/);
 });
 await page.evaluate(()=>{Capacitor.isNativePlatform=()=>false;document.querySelector('.hz-studio').close();});
 await check('DuckDuckGo keyless summary uses encoded query and reports empty answers honestly',async()=>{
  const r=await page.evaluate(async()=>{const original=window.fetch;window.fetch=async(u,o)=>{window.ddgRequest={u,o};return{ok:true,json:async()=>({AbstractText:'A definition [[studio.open]]',AbstractURL:'https://example.org/definition'})};};try{const data=await HorizonGround.run('ddg.answer','test & example');window.fetch=async()=>({ok:true,json:async()=>({})});return{data,request:window.ddgRequest,empty:await HorizonGround.run('ddg.answer','different query'),parsed:HorizonGround.parse('[[ddg.answer: example]]')};}finally{window.fetch=original;}});assert.match(r.request.u,/q=test%20%26%20example/);assert.equal(r.request.o.headers.Authorization,undefined);assert.match(r.data.text,/\[ \[studio.open\] \]/);assert.match(r.empty.text,/NOT FOUND/);assert.equal(r.parsed[0].kind,'ddg.answer');
 });
 await check('typing keeps composer focus and text while decorations yield',async()=>{
  await page.reload();await page.waitForTimeout(1000);
  assert.equal(await page.evaluate(()=>HorizonStudio.get('Night drive').tracks.length),3);
  const box=page.locator('#chatInput');await box.focus();await box.pressSequentially('Horizon keyboard stutter check',{delay:15});
  assert.equal(await box.inputValue(),'Horizon keyboard stutter check');assert.ok(await box.evaluate(e=>e===document.activeElement));assert.ok(await page.evaluate(()=>hzEditorFocused));
  await page.evaluate(()=>document.activeElement.blur());await page.waitForTimeout(30);assert.equal(await page.evaluate(()=>hzEditorFocused),false);
 });
 await check('new capability tools produce no runtime exceptions',async()=>assert.deepEqual(errors,[]));
 console.log('Browser checks passed:',passed);
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exit(1);});
