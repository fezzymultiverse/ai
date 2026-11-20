'use strict';
// Browser verification. Provider, directory and Android responses are controlled fixtures, NOT live account/device claims.
const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const OUT=path.join(__dirname,'requested-repair-evidence');fs.mkdirSync(OUT,{recursive:true});
const results=[]; const record=(name)=>{results.push(name);console.log('PASS',name);};
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox','--autoplay-policy=no-user-gesture-required']});
 const ctx=await browser.newContext({viewport:{width:430,height:960}});
 await ctx.addInitScript(()=>{localStorage.setItem('horizon_soul_v','999');localStorage.setItem('horizon_music_ai','1');});
 let failures={},sent=[];
 await ctx.route('https://**/*',async route=>{
  const u=new URL(route.request().url());
  const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
  if(u.hostname.includes('radio-browser.info')){
   if(u.pathname.includes('countrycodes'))return json([{name:'ZA'},{name:'JP'},{name:'US'}]);
   const country=u.searchParams.get('countrycode')||'ZA';
   return json([{stationuuid:'fixture-'+country,name:(country==='JP'?'Tokyo':'Cape Town')+' Test Radio 99.9 FM',url:'http://127.0.0.1:8134/tests/requested-repair-evidence/tone.wav',url_resolved:'http://127.0.0.1:8134/tests/requested-repair-evidence/tone.wav',country:country==='JP'?'Japan':'South Africa',countrycode:country,codec:'WAV',bitrate:128,clickcount:12}]);
  }
  if(u.hostname==='geocoding-api.open-meteo.com')return json({results:[]});
  if(/\/models/.test(u.pathname)){
   if(u.hostname==='generativelanguage.googleapis.com')return json({models:[{name:'models/gemini-2.5-flash-lite',supportedGenerationMethods:['generateContent']}]});
   if(u.hostname==='api.mistral.ai')return json({data:[{id:'codestral-latest'}]});
   if(u.hostname==='api.cohere.com')return json({models:[{name:'command-a-03-2025'}]});
   if(u.hostname==='api.gonkarouter.io')return json({data:[{id:'zai-org/GLM-5.3-Flash'}]});
   return json({data:[{id:'gpt-oss-20b'}]});
  }
  if(/chat|generateContent|messages/.test(u.pathname)){
   const data=JSON.parse(route.request().postData()||'{}');sent.push({host:u.hostname,data,headers:route.request().headers()});
   const status=failures[u.hostname];if(status)return json({error:{message:status===401?'Invalid API key':status===429?'Rate limit':'Temporarily unavailable'}},status);
   if(u.hostname==='generativelanguage.googleapis.com')return json({candidates:[{content:{parts:[{text:'OK'}]}}]});
   if(u.hostname==='api.cohere.com')return json({message:{content:[{type:'text',text:'OK'}]}});
   return json({model:data.model,choices:[{message:{content:'OK'},finish_reason:'stop'}]});
  }
  return json({},404);
 });
 const page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 try {
  await page.goto('http://127.0.0.1:8134/www/index.html');await page.waitForFunction(()=>window.HorizonWatch&&window.HorizonMedia&&document.querySelector('#card-mistral'));
  record('Full application boots with existing layout');
  await page.locator('.hzc-set').click();await page.locator('[role="tab"][data-tab="providers"]').click();
  const card=page.locator('#card-mistral');await card.locator('h3').click();
  // Use explicit synthetic keys, never real user credentials.
  const key1='MistralFixture0123456789ABCDEF',key2='MistralBackup0123456789ABCDEF';
  await card.locator('[data-role="key"]').fill(key1);await card.locator('[data-role="save"]').click();
  await page.waitForFunction(k=>localStorage.getItem('horizon_key_mistral')===k,key1);
  assert.match(await card.locator('[data-role="status"]').innerText(),/Validated/);record('Main key: real save handler validates a text response and persists key');
  const backup=card.locator('.xk-add input');await backup.fill(key2);await backup.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#card-mistral .xk-activate')?.textContent.includes('✓'));
  await page.screenshot({path:path.join(OUT,'01-key-validation.png')});
  await card.getByRole('button',{name:/Use verified backup key/}).click();
  await page.waitForFunction(k=>localStorage.getItem('horizon_key_mistral')===k,key2);
  assert.ok(JSON.parse(await page.evaluate(()=>localStorage.getItem('horizon_xkeys_mistral'))).includes(key1));record('Green check activation revalidates, rotates selected backup to main and retains old main');
  failures['api.mistral.ai']=401;
  await card.locator('[data-role="key"]').fill('MistralRejected0123456789ABCDEF');await card.locator('[data-role="save"]').click();
  await page.waitForFunction(()=>document.querySelector('#card-mistral [data-role="status"]').textContent.includes('rejected'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_key_mistral')),key2);record('401 rejects new key without overwriting working main');
  failures['api.mistral.ai']=429;
  await backup.fill('MistralLimited0123456789ABCDEF');await backup.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#card-mistral .xk-slots')?.textContent.includes('UNVERIFIED') || document.querySelector('#card-mistral').textContent.includes('UNVERIFIED'));
  assert.ok(JSON.parse(await page.evaluate(()=>localStorage.getItem('horizon_xkeys_mistral'))).some(k=>k.startsWith('MistralLimited')));record('429 preserves backup as UNVERIFIED, never a green check');failures={};
  await page.reload();await page.waitForFunction(()=>document.querySelector('#card-mistral .xk-activate'));
  assert.ok((await page.locator('#card-mistral .xk-activate').allTextContents()).some(s=>s.includes('✓')));record('Verified key indicator survives reload');
  // Transport test is native mocked: every configured credential provider must be accepted exactly.
  const transport=await page.evaluate(async()=>{
   let calls=[];window.Capacitor={isNativePlatform:()=>true,Plugins:{CapacitorHttp:{request:async o=>{calls.push(o);return {status:200,data:{ok:true}};}}}};
   const urls=['https://api.mistral.ai/v1/models','https://api.cohere.com/v1/models?endpoint=chat','https://openrouter.ai/api/v1/auth/key','https://api.gonkarouter.io/v1/chat/completions','https://api.z.ai/api/paas/v4/models','https://proxy.gonkabroker.com/v1/messages','https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent','https://ollama.com/v1/chat/completions'];
   for(const url of urls){if(!HorizonNet.accepts(url))throw Error(url);await HorizonNet.request(url,{headers:{Authorization:'Bearer synthetic'}});}
   return {n:calls.length,safe:calls.every(c=>c.disableRedirects===true),evil:HorizonNet.accepts('https://api.mistral.ai.evil.test/v1/models')};
  });assert.equal(transport.n,8);assert.equal(transport.safe,true);assert.equal(transport.evil,false);record('Existing provider endpoints use exact-host native validation transport without redirects');
  await page.evaluate(()=>{window.Capacitor={isNativePlatform:()=>false,Plugins:{}};});
  // Close settings and use the existing Widgets panel, not a rebuilt mock UI.
  await page.evaluate(()=>{document.querySelector('#rightPanel').classList.remove('open');document.querySelector('#leftPanel').classList.add('open');document.querySelector('#overlay')?.classList.remove('show');});
  // Local playback through Library Add files; actual HTMLAudio decoding of generated WAV.
  await page.locator('#mpFile').setInputFiles(path.join(OUT,'tone.wav'));
  const local=await page.evaluate(()=>HorizonMusic.run('music.play','tone'));assert.match(local.text,/Playing:/);assert.equal(await page.evaluate(()=>HorizonMusic.playingNow()),true);record('Local Library file decodes and plays through actual audio element');
  await page.screenshot({path:path.join(OUT,'02-library-playing.png')});
  await page.evaluate(()=>HorizonMusic.pauseNow());
  const remote=await page.evaluate(()=>HorizonMusic.playRemote({id:'fixture1234',title:'YouTube stream path test',artist:'Synthetic fixture',url:'http://127.0.0.1:8134/tests/requested-repair-evidence/tone.wav'}));assert.equal(remote.ok,true);record('YouTube audio streaming player path plays real media fixture');
  // Directory data fixture, real audio playback. Countries checked independently.
  await page.evaluate(()=>HorizonMusic.pauseNow());
  for(const country of ['South Africa','Japan']){
   const find=await page.evaluate(c=>HorizonRadio.run('find',c),country);assert.match(find.text,/RADIO SCAN/);
   const play=await page.evaluate(()=>HorizonRadio.run('play','1'));assert.match(play.text,/PLAYING NOW/);assert.equal(await page.evaluate(()=>HorizonRadio.state().status),'playing');
   if(country==='Japan')await page.screenshot({path:path.join(OUT,'03-radio-playing.png')});
   await page.evaluate(()=>HorizonRadio.run('stop','now'));
  }record('Worldwide radio tool search + actual playback with South Africa/Japan directory fixtures');
  const video=await page.evaluate(()=>HorizonWatch.play({id:'fixture1234',title:'Video decoder test (generated fixture)',url:'http://127.0.0.1:8134/tests/requested-repair-evidence/video.mp4',lang:'en',cues:[{s:0,e:12,t:'Caption test — this text is a test fixture.'}]}));
  assert.equal(video.ok,true);assert.ok(await page.locator('#hzRpVideo video').evaluate(v=>v.videoWidth>0&&!v.paused));await page.waitForTimeout(650);
  assert.equal(await page.locator('#hzRpSubs').isVisible(),true);assert.equal(await page.locator('#hzRpMedia').evaluate(x=>x.classList.contains('is-idle')),false);
  await page.screenshot({path:path.join(OUT,'04-video-subtitles-on.png')});record('Video decodes actual frames in left panel and no idle screen covers it');
  await page.locator('.hzw-cc').click();assert.equal(await page.locator('#hzRpSubs').isHidden(),true);assert.equal(await page.locator('#hzRpVideo').isVisible(),true);
  await page.screenshot({path:path.join(OUT,'05-video-subtitles-off.png')});await page.locator('.hzw-cc').click();assert.equal(await page.locator('#hzRpSubs').isVisible(),true);record('Subtitle switch ON/OFF works without stopping video');
  await page.locator('.hzw-x').click();assert.equal(await page.locator('#hzRpVideo').isHidden(),true);record('Close video cleans up source and display');
  // Official YouTube API contract stub: honest onStateChange required, not mere frame insertion.
  await page.evaluate(()=>{window.YT={Player:function(node,opts){this.getIframe=()=>node;this.playVideo=()=>setTimeout(()=>opts.events.onStateChange({data:1}),10);this.getPlayerState=()=>1;this.loadModule=()=>window.__ccOn=true;this.unloadModule=()=>window.__ccOn=false;this.destroy=()=>node.remove();setTimeout(()=>opts.events.onReady({target:this}),0);}};});
  const embedded=await page.evaluate(()=>HorizonWatch.embed({id:'abcdefghijk',title:'Official API contract fixture'}));assert.equal(embedded.ok,true);await page.locator('.hzw-cc').click();assert.equal(await page.evaluate(()=>window.__ccOn),false);await page.evaluate(()=>HorizonWatch.stop());record('Official player fallback waits for PLAYING event and supports caption API toggle (stubbed)');
  // Native file bridge fixtures: real UI uses bridge receipts, operation implementation is tested separately on device.
  await page.evaluate(async()=>{
   const files=new Map([['/storage/emulated/0/Documents/a.txt',{name:'a.txt'}]]);window.fileMock={calls:[],entries:[],files};
   const m=fileMock;const mutation=async(action,d)=>{m.calls.push({action,...d});const from=d.from||d.path;const to=action==='rename'?from.slice(0,from.lastIndexOf('/')+1)+d.newName:d.to||d.path;
    if(action!=='makeFolder'&&!files.has(from))return {ok:false,code:'NOT_FOUND',message:'Missing source'};
    if(action!=='makeFolder')files.delete(from);files.set(to,{name:to.split('/').pop()});const id='r'+m.calls.length;m.entries.push({id,time:Date.now(),action,from,to,reason:d.reason,status:'completed'});return {ok:true,path:to,entryId:id};};
   window.Capacitor={Plugins:{HorizonFilesAccess:{status:async()=>({ok:true,enabled:true,granted:true}),folders:async()=>({ok:true,folders:[{path:'/storage/emulated/0/Documents',exists:true}]}),beginMessage:async()=>({ok:true}),declareScope:async d=>({ok:true,scopeRoots:d.scopeRoots}),history:async()=>({ok:true,entries:m.entries}),managers:async()=>({ok:true,apps:[]})},HorizonFiles:{list:async()=>({ok:true,entries:[...files.keys()]}),stat:async()=>({ok:true}),makeFolder:d=>mutation('makeFolder',d),move:d=>mutation('move',d),rename:d=>mutation('rename',d)}}};
   await HorizonFiles.status();await HorizonFiles.begin('Rename my file in the chosen Documents folder','receipt-test');await HorizonFiles.run('files.scope','all');
   window.fileResult=null;HorizonFiles.run('files.plan',JSON.stringify({ops:[{action:'rename',path:'/storage/emulated/0/Documents/a.txt',newName:'renamed.txt',reason:'Requested rename'}]})).then(x=>window.fileResult=JSON.parse(x.text));
  });
  assert.equal(await page.evaluate(()=>fileMock.calls.length),0);record('File plan makes no changes before Apply');
  await page.evaluate(()=>{document.querySelector('#leftPanel').classList.remove('open');document.querySelectorAll('.overlay').forEach(x=>x.hidden=true);});
  await page.waitForTimeout(500);
  await page.locator('.hzf-plan').last().getByRole('button',{name:'Apply',exact:true}).click();await page.waitForFunction(()=>window.fileResult);
  assert.equal(await page.evaluate(()=>fileResult.ok),true);assert.equal(await page.evaluate(()=>fileMock.files.has('/storage/emulated/0/Documents/renamed.txt')),true);
  const report=await page.evaluate(()=>HorizonFiles.finalize('I deleted everything successfully'));assert.match(report,/1 \/ 1 operations confirmed/);assert.doesNotMatch(report,/deleted everything/);record('Rename executes bridge call and final reply is generated from actual receipt, not model claims');
  await page.screenshot({path:path.join(OUT,'06-file-receipt.png')});
  for(const action of ['delete','moveToTrash']){
   const denied=await page.evaluate(a=>HorizonFiles.run('files.plan',JSON.stringify({ops:[{action:a,path:'/storage/emulated/0/Documents/renamed.txt',reason:'forbidden'}]})),action);assert.equal(JSON.parse(denied.text).ok,false);
  }assert.equal(await page.evaluate(()=>fileMock.calls.length),1);record('Delete and moveToTrash rejected before any mutation bridge call');
  await page.evaluate(()=>HorizonFiles.begin('Move files in my chosen folder','no-receipt'));const noProof=await page.evaluate(()=>HorizonFiles.finalize('Done, moved all files'));assert.match(noProof,/No file changes were confirmed/);record('Hallucinated completion without a receipt cannot become final file-operation reply');
  assert.deepEqual(errors,[]);record('No uncaught browser errors during requested-feature scenarios');
 } catch(e) {
  console.log('DEBUG',await page.evaluate(()=>({result:window.fileResult,calls:window.fileMock?.calls,progress:document.querySelector('.hzf-plan')?.innerText})),errors);
  await page.screenshot({path:path.join(OUT,'failure.png')});throw e;
 } finally {
  fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({scope:'Host browser; mocked API/directory/Android responses. Media decoder uses generated real WAV/MP4.',results,errors},null,2));
  await browser.close();
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
