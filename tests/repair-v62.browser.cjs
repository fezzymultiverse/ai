'use strict';
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const OUT=path.join(__dirname,'results-v62');fs.mkdirSync(OUT,{recursive:true});
const results=[], errors=[];
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:412,height:915}});
 await ctx.addInitScript(()=>{
  localStorage.setItem('horizon_soul_v','999');localStorage.setItem('horizon_active_provider','ovh');localStorage.setItem('horizon_model_ovh','gpt-oss-20b');
  localStorage.setItem('horizon_rss_v1',JSON.stringify({feeds:[{id:'f1',name:'Dev news',url:'https://news.example.test/rss',on:true,max:10,tab:'Dev',color:'#00e5ff'}],tabs:['Dev']}));
 });
 let failure='', sent=[],routeRequests=0, poiQueries=[];
 const json=(route,data,status=200)=>route.fulfill({status,headers:{'content-type':'application/json','access-control-allow-origin':'*'},body:JSON.stringify(data)});
 await ctx.route('https://**/*',async route=>{
  const u=new URL(route.request().url()),body=route.request().postData()||'';
  if(u.hostname==='news.example.test')return route.fulfill({headers:{'access-control-allow-origin':'*','content-type':'application/xml'},body:'<rss version="2.0"><channel><title>Dev news</title><item><title>Horizon release</title><link>https://news.example.test/post</link><description>New route alternatives and navigation controls.</description><pubDate>Mon, 16 Nov 2026 02:00:00 GMT</pubDate></item></channel></rss>'});
  if(u.hostname==='routing.openstreetmap.de'){
   routeRequests++;const pairs=u.pathname.split('/').pop().split(';').map(x=>x.split(',').map(Number));const a=pairs[0],b=pairs[1];
   const make=(delta,i)=>({distance:400+i*80,duration:120+i*30,geometry:{coordinates:[a,[a[0]+delta,b[1]],b]},legs:[{steps:[{distance:200,maneuver:{type:'depart'},name:'First Road'},{distance:200,maneuver:{type:'turn',modifier:'right'},name:'Second Road'},{distance:0,maneuver:{type:'arrive'},name:''}]}]});
   return json(route,{code:'Ok',routes:[make(0,0),make(.0002,1),make(-.0002,2)]});
  }
  if(/overpass/.test(u.hostname)){poiQueries.push(body);return json(route,{elements:[{type:'node',id:1,lat:0.0004,lon:0.0001,tags:{name:'Test Garage',amenity:'fuel'}}]});}
  if(/\/models/.test(u.pathname)){
   if(u.hostname==='ai-gateway.kilo.ai')return json(route,{data:[{id:'kilo-auto/free'},{id:'safe/model:free'},{id:'expensive/paid'}]});
   return json(route,{data:[{id:'gpt-oss-20b'},{id:'@cf/meta/llama-3.1-8b-instruct'}]});
  }
  if(/chat\/completions/.test(u.pathname)){
   const data=JSON.parse(body);sent.push({host:u.hostname,model:data.model,authorization:route.request().headers().authorization||'',messages:data.messages});
   if(failure==='ovh'&&u.hostname.includes('ovh.net'))return json(route,{error:{message:'Unavailable'}},503);
   if(failure==='cf-model'&&u.hostname==='api.cloudflare.com'&&data.model!=='@cf/meta/llama-3.1-8b-instruct')return json(route,{errors:[{message:'Model not supported'}]},403);
   return json(route,{model:data.model,choices:[{message:{content:'Fixture reply: Horizon navigation controls are available.'},finish_reason:'stop'}],usage:{prompt_tokens:20,completion_tokens:10}});
  }
  if(/\.png/.test(u.pathname))return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==','base64')});
  return json(route,{},404);
 });
 const page=await ctx.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(process.env.HORIZON_URL||'http://127.0.0.1:8134/www/index.html');await page.waitForTimeout(1200);
  await page.waitForFunction(()=>window.HorizonAskAI&&window.HorizonMaps&&window.HorizonRss);
  await page.locator('.hzc-set').click().catch(()=>{});await page.waitForTimeout(350);
  const initial=await page.evaluate(()=>({version:HzAbout&&HzAbout.version,feeds:HorizonRss.feeds().length,contract:HorizonToolPolicy.block({lite:true})}));
  assert.equal(initial.feeds,1);assert.match(initial.contract,/rss.read/);assert.match(initial.contract,/map.route/);results.push('App boot and shared lite/full map/RSS tool contract');
  let reply=await page.evaluate(()=>HorizonAskAI([{role:'user',text:'hello'}],{prov:'ovh'}));assert.match(reply,/Fixture reply/);assert.equal(sent.at(-1).authorization,'');results.push('OVH direct anonymous request');
  reply=await page.evaluate(()=>HorizonAskAI([{role:'user',text:'hello'}],{prov:'kilo',model:'expensive/paid'}));assert.match(reply,/Fixture reply/);assert.equal(sent.at(-1).host,'ai-gateway.kilo.ai');assert.ok(sent.at(-1).model==='kilo-auto/free'||sent.at(-1).model.endsWith(':free'));assert.equal(sent.at(-1).authorization,'');results.push('Kilo corrected host, no fake auth, paid-model rejection');
  failure='ovh';const before=sent.length;reply=await page.evaluate(()=>HorizonAskAI([{role:'user',text:'fallback test'}],{prov:'ovh'}));assert.match(reply,/Kilo Gateway/);assert.equal(sent[before].host,'oai.endpoints.kepler.ai.cloud.ovh.net');assert.equal(sent[before+1].host,'ai-gateway.kilo.ai');failure='';results.push('503 fast free-only provider fallback with truthful footer');
  await page.evaluate(()=>{
    window.__nativeRequests=[];window.Capacitor={isNativePlatform:()=>true,Plugins:{CapacitorHttp:{request:async o=>{__nativeRequests.push(o);return {status:200,data:{ok:true}};}},HorizonAI:{request:async()=>{throw Error('Unsupported AI endpoint');}}}};
  });
  const native=await page.evaluate(async()=>({body:await (await HorizonNet.request('https://g4f.space/api/groq/models',{method:'GET'})).json(),call:__nativeRequests[0]}));assert.equal(native.body.ok,true);assert.equal(native.call.disableRedirects,true);assert.equal(native.call.connectTimeout,6000);results.push('Scoped CapacitorHttp transport avoids legacy HorizonAI allowlist');
  assert.equal(await page.evaluate(()=>HorizonNet.accepts('https://g4f.space.evil.example/api/groq/models')),false);assert.equal(await page.evaluate(()=>HorizonNet.accepts('http://192.168.1.1/v1/models')),false);results.push('Exact-host transport policy rejects lookalike and arbitrary LAN hosts');
  await page.evaluate(()=>{window.Capacitor={isNativePlatform:()=>false,Plugins:{}};});
  const rss=await page.evaluate(()=>HorizonRss.run('rss.read','Dev news | 5'));assert.equal(rss.items.length,1);assert.match(rss.text,/NOT full articles/);assert.equal(rss.items[0].url,'https://news.example.test/post');results.push('RSS read returns refreshed excerpts with real source URLs');
  await page.locator('#hzRssRow').click();await page.waitForTimeout(200);await page.getByRole('button',{name:'AI digest',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hzRssView').innerText.includes('Fixture reply'));assert.ok(await page.getByRole('button',{name:'Read aloud',exact:true}).count());await page.screenshot({path:path.join(OUT,'rss-digest.png'),fullPage:true});results.push('RSS AI digest button and read-aloud UI');
  await page.evaluate(()=>{
   HorizonAddons.open('maps');
   window.__gps={lat:0,lon:0,accuracy:8};window.__spoken=[];
   window.HzGeo.get=async()=>({lat:__gps.lat,lon:__gps.lon,acc:__gps.accuracy});
   navigator.geolocation.getCurrentPosition=ok=>ok({coords:{latitude:__gps.lat,longitude:__gps.lon,accuracy:__gps.accuracy}});
   window.HorizonTTS.speak=async(id,text)=>{__spoken.push(text);return true;};window.HorizonTTS.stop=()=>{};
   HorizonMaps.show();
  });await page.waitForFunction(()=>window.L&&document.querySelector('#hzMapsView .leaflet-container'));
  await page.locator('#hzmFrom').fill('0, 0');await page.locator('#hzmTo').fill('0.002, 0.002');await page.locator('#hzMapsView .hzm-form .hzm-btn.pri').click();await page.waitForFunction(()=>document.querySelectorAll('#hzMapsView .hzm-alternatives button').length===3);
  assert.equal(await page.locator('#hzMapsView .hzm-alternatives button').count(),3);await page.locator('#hzMapsView .hzm-alternatives button').nth(1).click();assert.equal(await page.locator('#hzMapsView .hzm-alternatives button').nth(1).getAttribute('aria-pressed'),'true');results.push('Three route alternatives rendered and user-selectable');
  await page.getByRole('button',{name:'▶ Start',exact:true}).last().click();await page.waitForFunction(()=>document.querySelector('#hzMapsView .hzm-nav').textContent.includes('left'));
  assert.ok(await page.locator('.hzm-current').count());assert.ok((await page.evaluate(()=>__spoken)).length);results.push('Start follows fresh GPS, highlights current step and speaks through HorizonTTS');
  await page.evaluate(()=>{__gps.accuracy=140;});await page.waitForFunction(()=>document.querySelector('#hzMapsView .hzm-nav').textContent.includes('accuracy'),null,{timeout:6500});results.push('Poor GPS accuracy pauses turn guidance');
  const routesBefore=routeRequests;await page.evaluate(()=>{__gps={lat:.02,lon:.02,accuracy:8};});await page.waitForFunction(()=>document.querySelector('#hzMapsView .hzm-title').textContent.includes('My location'),null,{timeout:16000});assert.ok(routeRequests>routesBefore);results.push('Three off-route fixes trigger recalculation from fresh position');
  await page.waitForTimeout(3300); await page.screenshot({path:path.join(OUT,'navigation.png'),fullPage:true});
  await page.getByRole('button',{name:'■ Stop',exact:true}).last().click();assert.equal(await page.locator('#hzMapsView .hzm-nav').textContent(),'');results.push('Stop releases navigation state');
  await page.locator('.hzm-pois select').selectOption('Fuel / garages');await page.getByRole('button',{name:'Explore nearby',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#hzMapsView .hzm-title').textContent==='Fuel / garages');assert.match(decodeURIComponent(poiQueries.at(-1)),/car_repair/);assert.ok(await page.locator('.leaflet-marker-icon').count());results.push('Overpass nearby categories return markers with Directions here actions');
  const mapResult=await page.evaluate(()=>HorizonMaps.run('map.route','0, 0 | 0.002, 0.002 | walk'));assert.match(mapResult.text,/live map card/);assert.ok(await page.locator('#chatMessages .hzm-wrap').count());results.push('AI map.route embeds route map in chat');
  assert.deepEqual(errors,[]);results.push('No uncaught application JavaScript errors during integration scenarios');
  fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({ok:true,results,errors,routeRequests,providerRequests:sent.map(({messages,...rest})=>rest)},null,2));console.log(JSON.stringify({ok:true,results},null,2));
 }catch(e){await page.screenshot({path:path.join(OUT,'failure.png'),fullPage:true});fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({ok:false,results,errors,error:e.stack},null,2));throw e;}
 finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
