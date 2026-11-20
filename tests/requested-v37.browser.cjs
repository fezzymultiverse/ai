'use strict';
// Real Chromium on shipped application. External services blocked; provider and native fixtures are labelled.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const BASE=process.env.HORIZON_URL||'http://127.0.0.1:8765/';
const OUT=path.join(__dirname,'artifacts-v37');fs.mkdirSync(OUT,{recursive:true});
let browser,lastPage;const results=[];
async function check(name,fn){if(process.env.FILTER&&!name.includes(process.env.FILTER))return;try{await fn();results.push({name,pass:true});console.log('PASS',name)}catch(e){results.push({name,pass:false,error:e.stack});console.log('FAIL',name,e.message);if(lastPage&&!lastPage.isClosed()){console.log('DIAGNOSTIC',JSON.stringify({errors:lastPage.errors,requests:lastPage.requests,relay:lastPage.relay,state:await lastPage.evaluate(()=>({chat:window.HzMsg&&HzMsg.chat(),text:document.body.innerText.slice(-2400)}))}));await lastPage.screenshot({path:path.join(OUT,'failure.png')});}}}
async function fresh(width=390,theme='grey',chat=null,hooks=false,transport=false){
 hooks=hooks||!!chat;
 const ctx=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1});
 await ctx.addInitScript(({theme,chat,transport})=>{localStorage.setItem('horizon_theme',theme==='grey'?'grey':'cyan');if(transport){localStorage.setItem('horizon_key_gemini','fixture-not-real');localStorage.setItem('horizon_key_groq','fixture-not-real');localStorage.setItem('horizon_active_provider','gemini');localStorage.setItem('horizon_autoread','0');localStorage.setItem('horizon_type_speed','instant');}if(chat){localStorage.setItem('horizon_chats',JSON.stringify([chat]));localStorage.setItem('horizon_last_chat',chat.id);if(chat.people)localStorage.setItem('horizon_people_v1',JSON.stringify({token:'fixture-token',me:{id:'ME',name:'Me'},mig197:true,mig1919:true,mig199:true,replyFirst:false}));}},{theme,chat,transport});
 const p=await ctx.newPage();lastPage=p;p.errors=[];p.calls=[];p.requests=[];p.relay=[];p.providerDelay=0;
 p.on('pageerror',e=>p.errors.push(e.message));
 if(transport)p.on('dialog',d=>d.accept());
 await p.route('**/*',async r=>{
  const url=r.request().url();p.calls.push(url);
  if(transport && url.includes('generativelanguage.googleapis.com')) {
   if(r.request().method()==='POST') {
    p.requests.push(r.request().postDataJSON());if(p.providerDelay)await new Promise(resolve=>setTimeout(resolve,p.providerDelay));
    const payload={candidates:[{content:{parts:[{text:'Fixture AI reply.'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:25,candidatesTokenCount:5}};
    return r.fulfill({contentType:'text/event-stream',body:'data: '+JSON.stringify(payload)+'\n\n'});
   }
   return r.fulfill({contentType:'application/json',body:JSON.stringify({models:[{name:'models/gemini-2.5-flash',supportedGenerationMethods:['generateContent']}]})});
  }
  if(chat&&chat.people&&url.includes('/people-api/')) {
   if(url.includes('/message')){p.relay.push(r.request().postDataJSON());return r.fulfill({contentType:'application/json',body:JSON.stringify({message:{id:'relay-'+p.relay.length}})});}

   const me={id:'ME',name:'Me'}, room={id:'room-fixture',title:'Alice fixture',members:['ME','ALICE'],owner:'ME',pending:[],group:false,messages:[]};
   return r.fulfill({contentType:'application/json',body:JSON.stringify(url.includes('/sync')?{me,people:[{id:'ALICE',name:'Alice'}],contacts:[],requests:[],invitations:[],blocked:[],rooms:[room]}:{ok:true})});
  }
  if(hooks&&url.includes('/horizon_people.js')){
   let js=fs.readFileSync(path.join(__dirname,'../www/horizon_people.js'),'utf8');
   js=js.replace(/\}\)\(\);\s*$/,`window.__peopleTest={getHost:()=>host,ingest,shouldAnswer,drainAI,awarePrompt,applyRule};})();`);
   return r.fulfill({contentType:'application/javascript',body:js});
  }
  return url.startsWith(BASE)||url.startsWith('data:')?r.continue():r.abort();
 });
 await p.goto(BASE);await p.waitForTimeout(450);return p;
}
async function close(p){assert.deepEqual(p.errors,[],'No page errors');await p.context().close();}
async function contrast(p,sel){return p.$eval(sel,e=>{
 const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),c=getComputedStyle(e),fg=rgb(c.color);let n=e,bg;
 while(n){const a=rgb(getComputedStyle(n).backgroundColor);if(a.length===3||a[3]>=.99){bg=a;break}n=n.parentElement}bg=bg||[255,255,255];
 const L=a=>a.slice(0,3).map(v=>(v/=255)<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 return (Math.max(L(fg),L(bg))+.05)/(Math.min(L(fg),L(bg))+.05);
})}
const aiChat={id:'fixture-ai',title:'Group fixture',created:1,updated:1,messages:[],group:{members:[{id:'gemini'},{id:'groq'}]}};
const personChat={id:'fixture-person',title:'Alice fixture',created:1,updated:1,messages:[],people:{room:'room-fixture',account:'ME',joined:true,ai:false,aiMembers:[],timing:'each'}};
async function setupPeople(p,{timing='each',ai=true,paused=false,auto=true}={}){
 await p.evaluate(({timing,ai,paused,auto})=>{
  const H=__peopleTest.getHost(),c=H.current();
  Object.assign(c.people,{timing,ai,aiMembers:ai?['gemini']:[],aiOwner:null,paused,auto,aiOff:false,round:[]});
  window.__answers=[];window.__release=null;window.__hold=false;window.__fail=false;window.__transportBusy=false;
  H.busy=()=>__transportBusy;
  H.providers=()=>[{id:'gemini',name:'Gemini',ready:true},{id:'groq',name:'Groq',ready:true}];
  H.ai=async(c,text)=>{__transportBusy=true;__answers.push({text,ai:c.people.ai,members:[...c.people.aiMembers],guest:!!c.people.guest});try{if(__hold)await new Promise(r=>__release=r);if(__fail)throw Error('fixture provider failure')}finally{__transportBusy=false}};
  const original=window.fetch;let seq=0;
  window.fetch=async(url,opts)=>String(url).includes('people-api/message')?{ok:true,status:200,json:async()=>({message:{id:'local-'+ ++seq}})}:original(url,opts);
  window.__fixtureRoom={id:'room-fixture',title:'Alice fixture',members:['ME','ALICE'],pending:[],owner:'ME',group:false,messages:[]};
  window.__sync=(messages=[])=>{__fixtureRoom.messages=messages;__peopleTest.ingest({me:{id:'ME',name:'Me'},people:[{id:'ALICE',name:'Alice'}],contacts:[],requests:[],invitations:[],blocked:[],rooms:[__fixtureRoom]},{});};
  __sync();
 },{timing,ai,paused,auto});
}
(async()=>{
 browser=await chromium.launch({args:['--no-sandbox']});
 for(const w of [320,390,430,768,1280])for(const theme of ['grey','neon'])await check(`${w}px ${theme}: full-height side panels, tools, single-row dock and readable states`,async()=>{
  const p=await fresh(w,theme);
  await p.locator('.hzc-set').click();await p.waitForTimeout(350);
  const r=await p.locator('#rightPanel').boundingBox();assert.ok(Math.abs(r.y)<1&&Math.abs(r.height-844)<2&&Math.abs(r.width-w)<2);
  const positions=await p.locator('#hzDock .hz-dock-grid .hz-app:visible').evaluateAll(els=>els.map(e=>e.getBoundingClientRect().y));assert.ok(positions.length>=4&&Math.max(...positions)-Math.min(...positions)<2,'Dock tiles share one row');
  assert.ok(await p.locator('#rightPanel [data-close]').isVisible());
  if(w===390)await p.screenshot({path:path.join(OUT,`settings-${theme}.png`)});
  await p.locator('#rightPanel [data-close]').click();await p.waitForTimeout(350);
  await p.locator('.hzf-menu').click();await p.waitForTimeout(350);const l=await p.locator('#leftPanel').boundingBox();assert.ok(l.y===0&&l.height===844,'Menu fills viewport');
  await p.keyboard.press('Escape');await p.waitForTimeout(350);
  await p.locator('#webToggle').click();await p.waitForTimeout(150);
  const t=await p.locator('#toolMenu').boundingBox();assert.ok(t.y===0&&t.height===844&&t.width===w,'Tools fill viewport');
  assert.equal(await p.$eval('#toolMenu',e=>e.scrollWidth>e.clientWidth+1),false,'No horizontal clipping');
  // Force both live switch states, including aria state, without triggering external features.
  await p.evaluate(()=>{for(const [id,on]of [['tm-web',true],['tm-yt',false]]){const e=document.getElementById(id);e.classList.toggle('is-on',on);e.classList.toggle('is-off',!on);e.setAttribute('aria-checked',String(on));}});
  if(theme==='grey')for(const sel of ['#tm-web h4','#tm-web .tm-text > p','#tm-yt h4','#tm-yt .tm-text > p'])assert.ok(await contrast(p,sel)>=4.5,sel+' contrast');
  if(w===390)await p.screenshot({path:path.join(OUT,`tools-${theme}.png`)});
  await p.locator('.hz-tools-close').click();assert.equal(await p.locator('#toolMenu').isVisible(),false);
  assert.equal(await p.evaluate(()=>document.activeElement.id),'webToggle','Focus restored');
  await close(p);
 });
 for(const [name,chat,button]of [['Peer to peer',personChat,'.hzp-opt'],['Group AI',aiChat,'.hgp-i']])await check(`${name}: independent compact Options inside top-right of chat box`,async()=>{
  const p=await fresh(390,'grey',chat);await p.waitForTimeout(700);
  assert.equal(await p.locator('.chat-input-area').getAttribute('hidden'),null,'Composer never inherits the obsolete launch row hidden flag');
  const e=p.locator('.chat-input-area > '+button);assert.equal(await e.count(),1);assert.equal((await e.innerText()).trim(),'Options');assert.ok(await e.isVisible());
  const box=await p.locator('.chat-input-area').boundingBox(),pill=await e.boundingBox();assert.ok(pill.height<=32&&pill.width<=100);assert.ok(pill.y>=box.y&&pill.y<box.y+15&&pill.x+pill.width<=box.x+box.width&&pill.x+pill.width>box.x+box.width-20);
  assert.equal(await p.locator('.chat-input-area > '+(button==='.hgp-i'?'.hzp-opt':'.hgp-i')+':visible').count(),0);
  await p.screenshot({path:path.join(OUT,name==='Peer to peer'?'peer-corner-grey.png':'group-corner-grey.png')});
  await e.click();assert.equal(await p.locator(name==='Peer to peer'?'.hzp-sheet':'.hgp-menu').isVisible(),true,'Correct separate settings handler');
  await p.screenshot({path:path.join(OUT,name==='Peer to peer'?'peer-options-grey.png':'group-options-grey.png')});await close(p);
 });
 await check('Stats: all ten additions operational, native fixture charts and privacy export',async()=>{
  const p=await fresh();await p.evaluate(()=>{window.__snapshots=0;window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='HorizonStats',Plugins:{HorizonStats:{snapshot:async o=>{__snapshots++;return{batteryPct:72,charging:false,ramTotal:8000000000,ramAvailable:3000000000,thermalStatus:'Light',powerSaver:true,device:'Fixture phone',locationGranted:false,networkType:'Wi-Fi',processRamBytes:70000000};},requestDetails:async()=>({locationGranted:false})}}};HorizonAddons.open('stats')});
  await p.waitForTimeout(120);assert.equal(await p.locator('.hzs-card').count(),20);assert.equal(await p.locator('summary',{hasText:'10 extra dashboard additions'}).count(),0);
  for(const [id,txt]of [['battery','72%'],['thermal','Light'],['device','Fixture phone'],['screen','390'],['locale','']])assert.ok((await p.locator('#hzs-'+id).innerText()).includes(txt));
  assert.equal(await p.locator('#hzsChart polyline').count(),2);assert.ok(await p.locator('#hzsSamples tr').count()>=1);
  assert.match(await p.locator('#hzs-permissions').innerText(),/geolocation|not exposed/);
  await p.locator('#hzsPause').click();const before=await p.evaluate(()=>__snapshots);await p.waitForTimeout(3200);assert.equal(await p.evaluate(()=>__snapshots),before,'Paused sampler does not run');
  await p.evaluate(()=>{HorizonStats.hide();HorizonStats.show()});await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__snapshots),before,'Pause survives close/reopen');
  await p.locator('#hzsRefresh').click();await p.waitForTimeout(80);assert.equal(await p.evaluate(()=>__snapshots),before+1,'Manual refresh works paused');
  await p.locator('#hzsInterval').selectOption('10000');await p.locator('#hzsPause').click();await p.waitForTimeout(80);assert.ok(await p.evaluate(()=>__snapshots)>before+1);assert.match(await p.locator('#hzsStatus').innerText(),/every 10s/);
  p.on('dialog',d=>d.accept());const download=p.waitForEvent('download');await p.locator('#hzsExport').click();const file=await (await download).path();const data=JSON.parse(fs.readFileSync(file));assert.equal(data.schemaVersion,2);assert.equal(data.native.batteryPct,72);assert.equal(data.browser.viewport.width,390);assert.ok(data.permissions);assert.ok(data.samples.length);assert.ok(!JSON.stringify(data).includes('horizon_key_'));
  await p.locator('#hzsPermissions').click();await p.waitForTimeout(100);assert.match(await p.locator('#hzsStatus').innerText(),/permission denied/);
  await p.screenshot({path:path.join(OUT,'stats-fixture-grey.png')});await p.$eval('#hzExtensionBody',e=>e.scrollTop=0);await p.screenshot({path:path.join(OUT,'stats-overview-fixture-grey.png')});await close(p);
 });
 await check('Stats: browser unknowns, privacy cancellation and safe cleanup boundaries',async()=>{
  const p=await fresh();await p.evaluate(async()=>{HorizonAddons.open('stats');localStorage.setItem('horizon_fixture_chat','preserve');await caches.open('horizon-transient-fixture37');await caches.open('other-cache37')});await p.waitForTimeout(100);
  p.on('dialog',d=>d.dismiss());const before=p.calls.filter(u=>u.includes('ipwho.is')).length;await p.locator('#hzsLookup').click();await p.waitForTimeout(100);assert.equal(p.calls.filter(u=>u.includes('ipwho.is')).length,before,'Declined lookup makes no request');
  await p.locator('#hzsScan').click();await p.waitForTimeout(100);assert.ok(await p.locator('#hzsCleanConfirm').isVisible());await p.locator('#hzsCleanConfirm').click();assert.ok((await p.evaluate(()=>caches.keys())).includes('horizon-transient-fixture37'),'Declined cleanup preserves data');
  p.removeAllListeners('dialog');p.on('dialog',d=>d.accept());await p.locator('#hzsCleanConfirm').click();await p.waitForTimeout(100);const state=await p.evaluate(async()=>({names:await caches.keys(),chat:localStorage.getItem('horizon_fixture_chat')}));assert.equal(state.chat,'preserve');assert.ok(state.names.includes('other-cache37'));assert.ok(!state.names.includes('horizon-transient-fixture37'));
  await p.locator('#hzsOrphans').click();await p.waitForTimeout(100);assert.match(await p.locator('#hzsCleanPlan').innerText(),/needs native access/);
  await p.screenshot({path:path.join(OUT,'stats-browser-grey.png')});await close(p);
 });
 await check('Peer tags: one shot only, no auto follow-up, next tag works, restored even after failure',async()=>{
  const p=await fresh(390,'grey',personChat,true);await setupPeople(p,{ai:false});
  await p.evaluate(()=>HorizonPeople.send('@gemini first question',false));await p.waitForFunction(()=>__answers.length===1&&!__peopleTest.getHost().current().people.guest);
  assert.equal(await p.evaluate(()=>__answers[0].guest),true);assert.equal(await p.evaluate(()=>__peopleTest.getHost().current().people.ai),false);
  await p.evaluate(()=>HorizonPeople.send('plain human message',false));await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__answers.length),1);
  await p.evaluate(()=>{__fail=true;return HorizonPeople.send('@groq second question',false)});await p.waitForFunction(()=>__answers.length===2&&!__peopleTest.getHost().current().people.guest);
  assert.match(await p.evaluate(()=>__answers[1].text),/^@groq/);assert.equal(await p.evaluate(()=>__peopleTest.getHost().current().people.ai),false);
  await p.evaluate(()=>HorizonPeople.send('still human only',false));await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__answers.length),2);await close(p);
 });
 await check('Each-message mode: remote and local messages queue FIFO while provider is busy',async()=>{
  const p=await fresh(390,'grey',personChat,true);await setupPeople(p);
  await p.evaluate(()=>{__hold=true;__sync([{id:'r1',sender:'ALICE',kind:'human',text:'one',ts:Date.now()}])});await p.waitForFunction(()=>__answers.length===1);
  await p.evaluate(()=>{__sync([{id:'r1',sender:'ALICE',kind:'human',text:'one',ts:Date.now()},{id:'r2',sender:'ALICE',kind:'human',text:'two',ts:Date.now()},{id:'r3',sender:'ALICE',kind:'human',text:'three',ts:Date.now()}]);return HorizonPeople.send('four',false)});
  assert.equal(await p.evaluate(()=>__answers.length),1);await p.evaluate(()=>{__hold=false;__release()});await p.waitForFunction(()=>__answers.length===4);
  assert.deepEqual(await p.evaluate(()=>__answers.map(a=>a.text.split('\n')[0])),['one','two','three','four']);await close(p);
 });
 await check('All-users mode: wait for distinct members, one answer per round, repeated sync is idempotent',async()=>{
  const p=await fresh(390,'grey',personChat,true);await setupPeople(p,{timing:'all'});
  await p.evaluate(()=>{__sync([{id:'a',sender:'ALICE',kind:'human',text:'Alice one',ts:Date.now()},{id:'b',sender:'ALICE',kind:'human',text:'Alice again',ts:Date.now()}]);});await p.waitForTimeout(150);assert.equal(await p.evaluate(()=>__answers.length),0);
  await p.evaluate(()=>HorizonPeople.send('Me one',false));await p.waitForFunction(()=>__answers.length===1);assert.match(await p.evaluate(()=>__answers[0].text),/Everyone has now sent/);
  await p.evaluate(()=>__sync(__fixtureRoom.messages));await p.waitForTimeout(120);assert.equal(await p.evaluate(()=>__answers.length),1,'No duplicates from repeated relay sync');
  await p.evaluate(()=>HorizonPeople.send('Me two',false));await p.waitForTimeout(120);assert.equal(await p.evaluate(()=>__answers.length),1);
  await p.evaluate(()=>__sync([...__fixtureRoom.messages,{id:'c',sender:'ALICE',kind:'human',text:'Alice two',ts:Date.now()}]));await p.waitForFunction(()=>__answers.length===2);await close(p);
 });
 await check('Tagged turn does not count toward all-users auto round; unkeyed tag never calls fallback AI',async()=>{
  const p=await fresh(390,'grey',personChat,true);await setupPeople(p,{timing:'all'});
  await p.evaluate(()=>__sync([{id:'a',sender:'ALICE',kind:'human',text:'Alice one',ts:Date.now()}]));await p.evaluate(()=>HorizonPeople.send('@groq tagged guest',false));await p.waitForFunction(()=>__answers.length===1&&!__peopleTest.getHost().current().people.guest);
  await p.evaluate(()=>HorizonPeople.send('Me automatic round',false));await p.waitForFunction(()=>__answers.length===2);
  await p.evaluate(()=>{__peopleTest.getHost().providers=()=>[{id:'gemini',name:'Gemini',ready:true},{id:'groq',name:'Groq',ready:false}];return HorizonPeople.send('@groq missing key',false)});await p.waitForTimeout(200);assert.equal(await p.evaluate(()=>__answers.length),2);await close(p);
 });
 await check('Real request pipeline: tagged prompt reaches provider and AI reply reaches relay',async()=>{
  const chat=JSON.parse(JSON.stringify(personChat)),p=await fresh(390,'grey',chat,false,true);
  await p.locator('#chatInput').fill('@gemini hello everyone');await p.locator('#sendBtn').click();
  await p.waitForFunction(()=>HzMsg.chat().messages.some(m=>m.role==='ai'),null,{timeout:15000});
  assert.equal(p.requests.length,1,'One provider request');const contents=p.requests[0].contents.map(c=>c.parts.map(p=>p.text||'').join('')).join('\n');
  assert.match(contents,/\[Room context, for you only\]/);assert.match(contents,/@gemini hello everyone/);assert.match(contents,/In the room:/);
  await p.waitForFunction(()=>!HzMsg.busy()&&!__peopleTest.getHost().current().people.guest);assert.equal(await p.evaluate(()=>HzMsg.chat().people.ai),false,'Guest restored immediately');
  assert.equal(p.relay.filter(m=>m.kind==='ai').length,1,'Shared AI reply published exactly once');
  await p.locator('#chatInput').fill('human follow-up');await p.locator('#sendBtn').click();await p.waitForTimeout(250);assert.equal(p.requests.length,1,'No untagged provider follow-up');
  await p.screenshot({path:path.join(OUT,'peer-chat-grey.png')});await close(p);
 });
 await check('Real request pipeline: send while provider is busy, no overwrite, each exact prompt retained',async()=>{
  const chat=JSON.parse(JSON.stringify(personChat));Object.assign(chat.people,{ai:true,aiMembers:['gemini'],aiOwner:'ME',auto:true,timing:'each'});
  const p=await fresh(390,'grey',chat,false,true);p.providerDelay=500;
  await p.locator('#chatInput').fill('first actual turn');await p.locator('#sendBtn').click();await p.waitForFunction(()=>HzMsg.busy());
  await p.locator('#chatInput').fill('second actual turn');await p.locator('#sendBtn').click();
  await p.waitForFunction(()=>HzMsg.chat().messages.filter(m=>m.role==='ai').length===2,null,{timeout:20000});
  assert.equal(p.requests.length,2);assert.match(p.requests[0].contents[0].parts[0].text,/^first actual turn/);assert.match(p.requests[1].contents[0].parts[0].text,/^second actual turn/);
  assert.equal(await p.evaluate(()=>HzMsg.chat().messages.filter(m=>m.role==='user').length),2);await close(p);
 });
 await browser.close();const failed=results.filter(x=>!x.pass);fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({passed:results.length-failed.length,failed:failed.length,results},null,2));console.log(`${results.length-failed.length}/${results.length} scenarios passed`);if(failed.length)process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
