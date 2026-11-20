'use strict';
// Native integration UI fixture only: no Microsoft request or phone speaker certification.
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({headless:true,args:['--no-sandbox']});try{const p=await b.newPage({viewport:{width:393,height:852}});await p.goto(process.env.HORIZON_URL||'http://127.0.0.1:8134/www/index.html');await p.waitForTimeout(400);await p.evaluate(()=>{
 let fn;window.__edgeCalls=[];
 window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='HorizonEdgeVoice',addListener:(name,event,cb)=>{fn=cb;return Promise.resolve({remove(){}});},nativePromise:async(name,method,args)=>{
  window.__edgeCalls.push(method);
  if(method==='status')return{available:true,version:'fixture'};
  if(method==='listVoices')return{voices:[{ShortName:'en-ZA-LeahNeural',FriendlyName:'Leah',Locale:'en-ZA'}]};
  if(method==='speak'){setTimeout(()=>fn({id:args.id,event:'playing'}),20);setTimeout(()=>fn({id:args.id,event:'ended'}),200);return{};}
  return{};
 }};
});
 await p.locator('#settingsBtn').evaluate(e=>e.click());await p.locator('#settingsHome [data-tab="personal"]').count().then(async n=>{if(n)await p.locator('#settingsHome [data-tab="personal"]').click();else await p.locator('#settingsHome .set-row').filter({hasText:'PERSONALISATION'}).click();});
 if(await p.locator('#ttsCard').evaluate(e=>e.classList.contains('collapsed')))await p.locator('#ttsCard > .settings-row-header').click();
 await p.locator('#ttsEdgeGroup').evaluate(e=>{e.open=true;});
 await p.locator('#ttsEdgeProbe').click();await p.waitForFunction(()=>document.getElementById('ttsEdgeStatus').textContent.includes('Native Edge connected'));
 await p.locator('#ttsEdgeRefresh').click();assert.match(await p.locator('#ttsEdgeCatalogueStatus').textContent(),/1 voices/);
 await p.locator('#ttsEdgeGroup button').filter({hasText:/^Test Edge voice$/}).click();await p.waitForFunction(()=>document.getElementById('ttsEdgeStatus').textContent.includes('Edge test complete'));
 const calls=await p.evaluate(()=>window.__edgeCalls);for(const m of ['status','listVoices','speak'])assert.ok(calls.includes(m));
 console.log('PASS: nativePromise fixture → native check, catalogue refresh, test voice playback events and completion UI. No real native audio tested.');
}finally{await b.close();}})().catch(e=>{console.error(e);process.exit(1)});
