'use strict';
// npm install --no-save playwright && npx playwright install --with-deps chromium
// Start www via a local HTTP server; HORIZON_URL defaults to http://127.0.0.1:8765/.
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const BASE=process.env.HORIZON_URL||'http://127.0.0.1:8765/';
const OUT=process.env.HORIZON_TEST_OUT||path.join(__dirname,'artifacts-v36');fs.mkdirSync(OUT,{recursive:true});
const results=[];let browser;
async function check(name,fn){try{await fn();results.push({name,pass:true});console.log('PASS',name);}catch(e){results.push({name,pass:false,error:e.message});console.error('FAIL',name,e.message);}}
async function fresh(width=390,theme='grey'){
 const context=await browser.newContext({viewport:{width,height:844},deviceScaleFactor:1,geolocation:{latitude:-26.2041,longitude:28.0473},permissions:['geolocation']});
 await context.addInitScript(t=>{localStorage.setItem('horizon_theme',t==='grey'?'grey':'cyan');window.__statsIPCalls=[];const original=window.fetch;window.fetch=function(url,opts){if(/ipwho\.is|ipapi\.co/.test(String(url))&&new Error().stack.includes('horizon_stats.js'))__statsIPCalls.push(String(url));return original.call(this,url,opts);};},theme);
 const page=await context.newPage();page.errors=[];page.external=[];
 page.on('pageerror',e=>page.errors.push(e.message));
 await page.route('**/*',r=>{if(r.request().url().startsWith(BASE)||r.request().url().startsWith('data:'))return r.continue();page.external.push(r.request().url());return r.abort();});
 await page.goto(BASE);await page.waitForTimeout(650);return page;
}
async function contrast(page,selector){return page.$eval(selector,e=>{
 const rgb=s=>(s.match(/[\d.]+/g)||[]).map(Number),c=getComputedStyle(e),fg=rgb(c.color);let n=e,bg;
 while(n){const color=rgb(getComputedStyle(n).backgroundColor);if(color.length===3||color[3]>=.99){bg=color;break;}n=n.parentElement;}bg=bg||[255,255,255];
 const L=a=>a.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
 return (Math.max(L(fg),L(bg))+.05)/(Math.min(L(fg),L(bg))+.05);
 });}
(async()=>{
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 for(const width of [320,390,430,1280])for(const theme of ['grey','neon'])await check(`${width}px ${theme}: header, model and Stats layout`,async()=>{
  const p=await fresh(width,theme);
  assert.equal(p.errors.length,0,p.errors.join('; '));assert.ok((await p.locator('.hzc-md').textContent()).trim());
  const bounds=await p.locator('.app-header').boundingBox();assert.ok(bounds.x>=-1&&bounds.x+bounds.width<=width+1);
  if(theme==='grey'){
   assert.ok(await contrast(p,'.hzf-brand h1')>=4.5,'HORIZON contrast');assert.ok(await contrast(p,'.starter b')>=4.5,'starter title contrast');assert.ok(await contrast(p,'.starter small')>=4.5,'starter detail contrast');assert.ok(await contrast(p,'.hzc-md')>=4.5,'model contrast');
  }
  if(width===390)await p.screenshot({path:path.join(OUT,`header-${theme}.png`)});
  await p.locator('.hzc-set').click();
  const yt=p.locator('#hzDock [data-addon="youtube"]'),stats=p.locator('#hzDock [data-addon="stats"]');
  await stats.scrollIntoViewIfNeeded();const a=await yt.boundingBox(),b=await stats.boundingBox();assert.ok(a&&b&&Math.abs(a.y-b.y)<3,'Stats sits next to YouTube');
  if(width===390&&theme==='grey')await p.screenshot({path:path.join(OUT,'settings-grey.png')});
  // Existing horizon_dash.js performs its own scheduled lookup; untouched legacy behavior is outside the new Stats module's scope.
  const ipBefore=await p.evaluate(()=>__statsIPCalls.length);
  await stats.click();await p.waitForTimeout(200);assert.equal(await p.locator('#hzStatsView').isVisible(),true);assert.equal(await p.locator('.hzs-card').count(),20);
  assert.equal(await p.locator('#hzYouTubeView').isVisible(),false);
  const overflow=await p.$eval('#hzStatsView',e=>e.scrollWidth>e.clientWidth+1);assert.equal(overflow,false,'dashboard horizontal overflow');
  assert.equal(await p.evaluate(()=>__statsIPCalls.length),ipBefore,'Stats itself performs no lookup before the user taps Network lookup');
  if(width===390||width===1280)await p.screenshot({path:path.join(OUT,`stats-${theme}-${width}.png`)});
  assert.equal(p.errors.length,0,p.errors.join('; '));await p.context().close();
 });
 await check('group pill: active model, live tokens, next speaker, rate limits and wrap',async()=>{
  const p=await fresh();await p.evaluate(()=>{
   const bar=document.querySelector('.hz-gpbar');bar.hidden=false;const btn=document.createElement('button');btn.className='hgp-i hz-group-i hzp-gopt';btn.textContent='Options';bar.appendChild(btn);
   const providers={gemini:{name:'Gemini'},groq:{name:'Groq'},mistral:{name:'Mistral'}};
   HzUsage.bind({ids:Object.keys(providers),providers,hasKey:()=>true,active:()=> 'gemini',model:id=>({gemini:'gemini-fixture',groq:'llama-fixture',mistral:'mistral-fixture'}[id]),group:()=>Object.keys(providers),openDash(){}});
  });
  assert.equal(await p.locator('.hzc-nm').textContent(),'Gemini');assert.doesNotMatch(await p.locator('#hzBadge').textContent(),/Options/);
  await p.evaluate(()=>HzUsage.begin('groq','actual-live-model'));await p.waitForTimeout(75);
  assert.equal(await p.locator('.hzc-nm').textContent(),'Groq');assert.equal((await p.locator('button.hgp-i').textContent()).trim(),'Options');assert.match(await p.locator('.hzc-md').textContent(),/actual-live-model/);
  await p.evaluate(()=>HzUsage.tokens(123,45));await p.waitForTimeout(75);assert.match(await p.locator('.hzc-st').textContent(),/↑123 ↓45/);assert.equal((await p.locator('button.hgp-i').textContent()).trim(),'Options');
  await p.evaluate(()=>HzUsage.end('groq','actual-live-model',{ok:true,i:123,o:45,ms:280,est:false}));await p.waitForTimeout(75);
  assert.equal(await p.locator('.hzc-nm').textContent(),'Mistral');
  await p.evaluate(()=>{HzUsage.begin('mistral','mistral-fixture');HzUsage.end('mistral','mistral-fixture',{ok:false,status:429,err:'rate limit',ms:80});});await p.waitForTimeout(75);
  assert.equal(await p.locator('.hzc-nm').textContent(),'Gemini');assert.match(await p.locator('.hzc-st').textContent(),/rate.limit/i);
  assert.equal(await p.locator('.hzc-cap').evaluate(e=>e.classList.contains('rate-limited')),true);
  await p.screenshot({path:path.join(OUT,'group-rate-limit-grey.png')});await p.context().close();
 });
 await check('Stats opt-in public-IP lookup and GPS display',async()=>{
  const p=await fresh();await p.evaluate(()=>HorizonAddons.open('stats'));
  await p.route('https://ipwho.is/',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({success:true,ip:'203.0.113.10',city:'Fixture City',country:'Fixture Country',latitude:1,longitude:2,connection:{isp:'Fixture ISP',asn:64500}})}));
  p.on('dialog',d=>d.accept());await p.locator('#hzsLookup').click();await p.waitForTimeout(150);
  assert.match(await p.locator('#hzs-ip').textContent(),/203.0.113.10/);assert.match(await p.locator('#hzs-place').textContent(),/Fixture ISP/);
  await p.locator('#hzsLocate').click();await p.waitForTimeout(250);assert.match(await p.locator('#hzs-gps').textContent(),/-26.204100, 28.047300/);
  await p.context().close();
 });
 await check('Stats cache scan/confirm deletes only dedicated transient buckets',async()=>{
  const p=await fresh();await p.evaluate(async()=>{HorizonAddons.open('stats');localStorage.setItem('horizon_test_chat','keep');await caches.open('horizon-transient-fixture');await caches.open('unrelated-cache-fixture');});
  p.on('dialog',d=>d.accept());await p.locator('#hzsScan').click();await p.waitForTimeout(100);assert.equal(await p.locator('#hzsCleanConfirm').isVisible(),true);
  await p.locator('#hzsCleanConfirm').click();await p.waitForTimeout(150);
  const data=await p.evaluate(async()=>({chat:localStorage.getItem('horizon_test_chat'),names:await caches.keys()}));assert.equal(data.chat,'keep');assert.equal(data.names.includes('horizon-transient-fixture'),false);assert.equal(data.names.includes('unrelated-cache-fixture'),true);
  await p.locator('#hzsOrphans').click();await p.waitForFunction(()=>document.getElementById('hzsCleanPlan').textContent.includes('needs native access'));assert.match(await p.locator('#hzsCleanPlan').textContent(),/needs native access/);await p.context().close();
 });
 await check('Stats native-bridge fixture maps sensor fields without changing providers',async()=>{
  const p=await fresh();await p.evaluate(()=>{
   window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='HorizonStats',Plugins:{HorizonStats:{snapshot:async()=>({batteryPct:71,batteryTempC:31.2,ramTotal:8000000000,ramAvailable:3000000000,cpuCores:8,processCpuPct:2.3,ssid:'FixtureWiFi',vpn:true,cellTower:'LTE fixture · CI 123',uptimeMs:100000,appRuntimeMs:5000,apps:[{name:'Horizon fixture',ramBytes:50000000,codeBytes:9000000}]})}}};HorizonAddons.open('stats');
  });await p.waitForTimeout(100);
  assert.match(await p.locator('#hzs-temperature').textContent(),/31.2/);assert.match(await p.locator('#hzs-wifi').textContent(),/FixtureWiFi/);assert.match(await p.locator('#hzs-vpn').textContent(),/VPN active/);assert.match(await p.locator('#hzs-tower').textContent(),/CI 123/);assert.match(await p.locator('#hzsApps').textContent(),/Horizon fixture/);
  await p.context().close();
 });
 await check('Edge settings: per-provider Test buttons and searchable fresh catalogue',async()=>{
  const p=await fresh();
  await p.evaluate(()=>{
   window.__tested=[];window.Capacitor={isNativePlatform:()=>true,isPluginAvailable:n=>n==='HorizonEdgeVoice',Plugins:{HorizonEdgeVoice:{listVoices:async()=>({voices:[{ShortName:'fr-FR-DeniseNeural',FriendlyName:'Denise · French',Locale:'fr-FR'},{ShortName:'en-ZA-LeahNeural',FriendlyName:'Leah · South Africa',Locale:'en-ZA'}]})}}};
   window.HorizonTTS={stop(){},toggle(id,text,opts){__tested.push(opts);}};
  });
  assert.ok(await p.locator('[data-edge-test]').count()>=20);
  await p.evaluate(()=>{document.getElementById('ttsEdge_groq').value='en-GB-RyanNeural';document.querySelector('[data-edge-test="groq"]').click();document.getElementById('ttsEdge_gemini').value='en-ZA-LeahNeural';document.querySelector('[data-edge-test="gemini"]').click();});
  const tested=await p.evaluate(()=>__tested);assert.equal(tested[0].voice,'en-GB-RyanNeural');assert.equal(tested[1].voice,'en-ZA-LeahNeural');
  await p.evaluate(()=>document.getElementById('ttsEdgeRefresh').click());await p.waitForTimeout(100);
  assert.match(await p.locator('#ttsEdgeCatalogueStatus').textContent(),/2 voices/);
  await p.evaluate(()=>{const e=document.getElementById('ttsEdgeSearch');e.value='French';e.dispatchEvent(new Event('input'));});
  const visible=await p.locator('#ttsEdgeDef').evaluate(s=>[...s.options].filter(o=>!o.hidden).map(o=>o.textContent));assert.ok(visible.some(t=>t.includes('French')));assert.ok(!visible.some(t=>t.includes('South Africa')));
  assert.equal(p.errors.length,0,p.errors.join('; '));await p.context().close();
 });
 await browser.close();const failed=results.filter(r=>!r.pass);fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({passed:results.length-failed.length,failed:failed.length,results},null,2));console.log(`${results.length-failed.length}/${results.length} browser scenarios passed`);if(failed.length)process.exitCode=1;
})().catch(async e=>{console.error(e);if(browser)await browser.close();process.exitCode=1});
