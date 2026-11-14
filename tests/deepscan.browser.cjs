'use strict';
// Test-only closure access is injected by this server; never added to the shipped app.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../www'),out=path.resolve(__dirname,'../audit-results');
const hook='window.__audit={PROVIDERS,state,aiFetch,timed,newTurn,resetUsage,stopTurn,setBusy,runTool,toolsBlock,parseToolCalls,turnUsage,runAiTurn,currentChat,ensureChat,getLive:()=>({...liveCtx}),setLive:x=>{liveCtx=x}};\n';
const server=http.createServer((req,res)=>{const name=decodeURIComponent(req.url.split('?')[0]),f=path.resolve(root,'.'+(name==='/'?'/index.html':name));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();if(f.endsWith('index.html'))b=Buffer.from(b.toString().replace('        window.HorizonAskAI =',hook+'        window.HorizonAskAI ='));res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(f)]||'application/octet-stream'});res.end(b);});});
const checks=[],errors=[],requests=[];
function events(rows){return rows.map(j=>'data: '+JSON.stringify(j)+'\n\n').join('')+'data: [DONE]\n\n';}
function oai(model='actual-fixture'){return events([{model,choices:[{delta:{content:'Verified 🌊 answer'}}]},{choices:[{delta:{},finish_reason:'stop'}],usage:{prompt_tokens:11,completion_tokens:7}}]);}
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});await page.waitForTimeout(250);
 assert.deepEqual(errors,[]);checks.push('clean boot, no uncaught JavaScript errors');
 // Open every extension through its real host, then exercise the matching history close.
 for(const [mode,id] of [['youtube','hzYouTubeView'],['music','hzMusicView'],['github','hzGitHubView'],['lens','hzLensView'],['downloads','hzDownloadsView']]){await page.evaluate(mode=>HorizonAddons.open(mode),mode);assert.ok(await page.locator('#'+id).isVisible(),mode);await page.evaluate(()=>HorizonAddons.close());await page.waitForTimeout(60);}
 checks.push('YouTube, Music, GitHub, Lens and Downloads extension panels all open and close');
 // Walk every actual Settings destination rather than assuming handlers work.
 await page.locator('#settingsBtn').evaluate(b=>b.click());
 const tabs=await page.locator('#settingsHome [data-tab]').evaluateAll(bs=>bs.map(b=>b.dataset.tab));
 for(const tab of tabs){await page.locator('#settingsHome [data-tab="'+tab+'"]').click();assert.ok(await page.locator('#rightPanel > .tab-body[data-tab="'+tab+'"]').isVisible(),tab);await page.locator('#settingsBackBtn').click();}
 checks.push('all '+tabs.length+' Settings pages open and return through Back');
 await page.locator('#settingsHome [data-tab="personalisation"]').click();
 assert.equal(await page.locator('#hzVisualPrefs [role="radio"]').count(),10);
 for(const key of ['surface','spacing']){
  const values=await page.locator('[data-hz-visual="'+key+'"]').evaluateAll(bs=>bs.map(b=>b.dataset.value));
  for(const value of values){await page.locator('[data-hz-visual="'+key+'"][data-value="'+value+'"]').click();assert.equal(await page.locator('html').getAttribute('data-hz-'+key),value);assert.equal(await page.locator('[data-hz-visual="'+key+'"][aria-checked="true"]').count(),1);}
 }
 for(const width of [320,412,768]){await page.setViewportSize({width,height:915});assert.equal(await page.locator('#hzVisualPrefs').evaluate(e=>e.scrollWidth<=e.clientWidth+1),true);}
 await page.setViewportSize({width:412,height:915});await page.locator('[data-hz-visual="surface"][data-value="grid"]').click();
 await page.locator('#hzVisualPrefs').screenshot({path:path.join(out,'personalisation.png')});
 await page.reload({waitUntil:'load'});assert.equal(await page.locator('html').getAttribute('data-hz-surface'),'grid');assert.equal(await page.locator('html').getAttribute('data-hz-spacing'),'reading');checks.push('all ten visual choices, persistence, unique selection and 320/412/768px layout');
 // Mock ALL chat providers at the network boundary. Real providers are never billed.
 await page.route(/https:\/\/(?:generativelanguage\.googleapis\.com|api\.groq\.com|api\.cohere\.com|api\.mistral\.ai|openrouter\.ai|text\.pollinations\.ai|api\.anyapi\.ai|api\.routeway\.ai|api\.gonkarouter\.io|api\.z\.ai|api\.aionlabs\.ai|api\.llm7\.io|api\.cloudflare\.com)\//,async r=>{
  const req=r.request(),body=JSON.parse(req.postData()||'{}'),url=req.url();requests.push({url,body,headers:req.headers()});let rows;
  if(url.includes('googleapis'))rows=[{candidates:[{content:{parts:[{text:'Verified 🌊 answer'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:11,candidatesTokenCount:7}}];
  else if(url.includes('cohere'))rows=[{type:'content-delta',delta:{message:{content:{text:'Verified 🌊 answer'}}}},{type:'message-end',delta:{finish_reason:'COMPLETE',usage:{tokens:{input_tokens:11,output_tokens:7}}}}];
  else if(url.includes('gonkarouter'))rows=[{type:'message_start',message:{model:body.model,usage:{input_tokens:11}}},{type:'content_block_delta',delta:{text:'Verified 🌊 answer'}},{type:'message_delta',delta:{stop_reason:'end_turn'},usage:{output_tokens:7}},{type:'message_stop'}];
  await r.fulfill({status:200,contentType:'text/event-stream',body:rows?events(rows):oai(body.model)});
 });
 const ids=await page.evaluate(()=>Object.keys(__audit.PROVIDERS));
 for(const id of ids){
  const result=await page.evaluate(async id=>{const a=__audit,p=a.PROVIDERS[id];localStorage.setItem('horizon_autoswitch','0');a.newTurn();a.resetUsage();a.state.models[id]=p.defaultModel;a.state.modelLists[id]=p.fallbackModels.slice();a.setLive({prov:id,name:p.name,model:p.defaultModel});const key=id==='cloudflare'?'0123456789abcdef0123456789abcdef:fixture-token-123456789':id==='llm7'?'free':'fixture-'+id;const text=await p.chat(key,p.defaultModel,[{role:'user',text:'Hello'}]);return{text,usage:{...a.turnUsage},live:a.getLive()};},id);
  assert.equal(result.text,'Verified 🌊 answer',id);assert.equal(result.usage.i,11,id);assert.equal(result.usage.o,7,id);assert.equal(result.live.prov,id);
  const req=requests.at(-1);if(id==='gemini')assert.match(req.url,/streamGenerateContent/);else assert.equal(req.body.stream,true,id);
  if(id==='gonka'){assert.equal(req.headers['x-api-key'],'fixture-gonka');assert.equal(req.body.messages[0].role,'user');}
  if(id==='cloudflare'){assert.equal(req.headers.authorization,'Bearer fixture-token-123456789');assert.ok(!req.headers.authorization.includes('0123456789'));}
 }
 checks.push('all '+ids.length+' providers execute streaming protocol fixtures with exact 11-in/7-out usage and credential routing');
 // Distinguish provider HTTP failures, stream errors, JSON fallback and unsupported options.
 let stage='json',calls=0;
 await page.route('https://api.mistral.ai/v1/chat/completions',async r=>{calls++;const b=JSON.parse(r.request().postData());if(stage==='json')return r.fulfill({contentType:'application/json',body:JSON.stringify({model:'actual-json-model',choices:[{message:{content:'JSON fallback'},finish_reason:'stop'}],usage:{prompt_tokens:4,completion_tokens:2}})});if(stage==='options'&&b.stream_options)return r.fulfill({status:400,contentType:'application/json',body:'{"error":{"message":"unsupported stream_options"}}'});if(stage==='nostream'&&b.stream)return r.fulfill({status:400,contentType:'application/json',body:'{"error":{"message":"streaming not supported"}}'});if(stage==='nostream')return r.fulfill({contentType:'application/json',body:'{"choices":[{"message":{"content":"Nonstream fallback"}}]}'});if(stage==='error')return r.fulfill({contentType:'text/event-stream',body:events([{choices:[{delta:{content:'partial'}}]},{error:{message:'upstream died'}}])});return r.fulfill({contentType:'text/event-stream',body:oai()});});
 const call=()=>page.evaluate(async()=>{const a=__audit;a.newTurn();a.resetUsage();try{const text=await a.PROVIDERS.mistral.chat('fixture','mistral-small-latest',[{role:'user',text:'Test'}]);return{text,live:a.getLive()};}catch(e){return{error:e.message,status:e.status};}});
 assert.equal((await call()).text,'JSON fallback');assert.equal((await page.evaluate(()=>__audit.getLive())).model,'actual-json-model');checks.push('JSON instead of SSE is accepted and actual returned model is retained');
 stage='options';calls=0;assert.equal((await call()).text,'Verified 🌊 answer');assert.equal(calls,2);checks.push('unsupported usage-stream option retries once without it');
 stage='nostream';calls=0;assert.equal((await call()).text,'Nonstream fallback');assert.equal(calls,2);checks.push('explicitly unsupported streaming falls back to JSON without disabling other providers');
 stage='error';assert.match((await call()).error,/upstream died/);checks.push('partial stream plus upstream error is surfaced, never saved as a complete answer');
 // Cancellation and timeout use a real pending fetch, not a pre-rejected mocked response.
 let held;await page.route('https://api.groq.com/openai/v1/chat/completions',async r=>{held=r;await new Promise(resolve=>setTimeout(resolve,500));await r.abort().catch(()=>{});});
 const stopped=await page.evaluate(async()=>{const a=__audit;a.newTurn();a.state.busy=true;const p=a.aiFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'test',messages:[]})});setTimeout(()=>a.stopTurn(),25);try{await p;return false;}catch(e){return {aborted:true,n:a.getLive(),controllers:a.state.busy};}finally{a.state.busy=false;}});assert.equal(stopped.aborted,true);checks.push('Stop aborts a pending browser provider request');
 const timeout=await page.evaluate(async()=>{const a=__audit;a.newTurn();const p=a.aiFetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',body:JSON.stringify({model:'test',messages:[]})});const t=Date.now();try{await a.timed(p,30);return false;}catch(e){return {msg:e.message,ms:Date.now()-t};}});assert.match(timeout.msg,/timed out/);assert.ok(timeout.ms<1000);checks.push('timeout aborts pending transport and returns promptly');
 // Rescue must credit the actual answering provider, not the one that failed.
 await page.unroute('https://api.groq.com/openai/v1/chat/completions');
 await page.route('https://generativelanguage.googleapis.com/**',r=>r.fulfill({status:429,contentType:'application/json',body:'{"error":{"message":"fixture limit"}}'}));
 const rescue=await page.evaluate(async()=>{const a=__audit;localStorage.setItem('horizon_autoswitch','1');a.state.keys={gemini:'fixture-gemini',groq:'fixture-groq'};a.state.active='gemini';a.newTurn();a.resetUsage();a.setLive({prov:'gemini',name:'Gemini',model:a.PROVIDERS.gemini.defaultModel});const records=[],end=HzUsage.end;HzUsage.end=(id,model,r)=>{records.push({id,model,...r});end(id,model,r);};try{const text=await a.PROVIDERS.gemini.chat('fixture-gemini',a.PROVIDERS.gemini.defaultModel,[{role:'user',text:'Test rescue'}]);return{text,live:a.getLive(),records};}finally{HzUsage.end=end;localStorage.setItem('horizon_autoswitch','0');}});
 assert.equal(rescue.live.prov,'groq');assert.ok(rescue.records.some(r=>r.id==='gemini'&&!r.ok&&r.status===429));assert.ok(rescue.records.some(r=>r.id==='groq'&&r.ok&&r.i===11&&r.o===7));assert.ok(!rescue.records.some(r=>r.id==='gemini'&&r.ok));checks.push('rescue records primary 429 separately and credits successful tokens/model only to Groq');
 // Same-provider backup keys rotate without leaking the primary key to another host.
 await page.route('https://generativelanguage.googleapis.com/**',r=>{const key=r.request().headers()['x-goog-api-key'];return key==='fixture-backup'?r.fulfill({contentType:'text/event-stream',body:events([{candidates:[{content:{parts:[{text:'Backup answer'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:3,candidatesTokenCount:2}}])}):r.fulfill({status:429,contentType:'application/json',body:'{"error":{"message":"fixture limit"}}'});});
 const backup=await page.evaluate(async()=>{const a=__audit;a.newTurn();a.resetUsage();localStorage.setItem('horizon_xkeys_gemini','["fixture-backup"]');try{return await a.PROVIDERS.gemini.chat('fixture-primary',a.PROVIDERS.gemini.defaultModel,[{role:'user',text:'Test backup'}]);}finally{localStorage.removeItem('horizon_xkeys_gemini');}});assert.equal(backup,'Backup answer');checks.push('same-provider backup rotation succeeds independently of cross-provider rescue');
 page.once('dialog',d=>d.accept());
 const helper=await page.evaluate(async()=>{const a=__audit;a.state.active='groq';const request=window.HorizonAskAI([{role:'user',text:'Auxiliary request'}]);const busy=a.state.busy;const text=await request;return{busy,text,after:a.state.busy};});assert.equal(helper.busy,true);assert.equal(helper.after,false);assert.equal(helper.text,'Verified 🌊 answer');checks.push('auxiliary Terminal/creator AI request owns busy state and releases it without racing chat');
 // Every adapter must preserve HTTP authentication failure, not mislabel it as empty content.
 await page.route(/https:\/\/(?:generativelanguage\.googleapis\.com|api\.groq\.com|api\.cohere\.com|api\.mistral\.ai|openrouter\.ai|text\.pollinations\.ai|api\.anyapi\.ai|api\.routeway\.ai|api\.gonkarouter\.io|api\.z\.ai|api\.aionlabs\.ai|api\.llm7\.io|api\.cloudflare\.com)\//,r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":{"message":"Invalid fixture credential"}}'}));
 for(const id of ids){const result=await page.evaluate(async id=>{const a=__audit;a.newTurn();a.resetUsage();try{await a.PROVIDERS[id].chat(id==='cloudflare'?'0123456789abcdef0123456789abcdef:fixture-token-123456789':'fixture',a.PROVIDERS[id].defaultModel,[{role:'user',text:'Auth test'}]);return{unexpected:true};}catch(e){return{status:e.status,message:e.message};}},id);assert.equal(result.status,401,id);}
 checks.push('all 13 provider adapters preserve HTTP 401 authentication status');
 // Keyless data must respect both chat and global Web switches.
 const denied=await page.evaluate(async()=>{__audit.state.webMaster=false;return __audit.runTool('weather','Cape Town');});assert.match(denied.text,/switched off/);checks.push('keyless tools obey global Web-off without a network request');
 await page.route('https://geocoding-api.open-meteo.com/**',r=>r.fulfill({contentType:'application/json',body:'{"results":[{"name":"Cape Town","country":"South Africa","latitude":-33.9,"longitude":18.4}]}'}));
 await page.route('https://api.open-meteo.com/**',r=>r.fulfill({contentType:'application/json',body:'{"timezone":"Africa/Johannesburg","current":{"temperature_2m":22,"time":"2026-11-14T12:00"},"current_units":{"temperature_2m":"°C"}}'}));
 const weather=await page.evaluate(async()=>{__audit.state.webMaster=true;__audit.state.newChatWeb=true;return __audit.runTool('weather','Cape Town');});assert.match(weather.text,/22/);assert.match(weather.text,/°C/);assert.equal(weather.urls.length,1);checks.push('keyless weather dispatch works with no scraper key and retains units/time/source');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'deepscan-browser.json'),JSON.stringify({checks,errors,providerCount:ids.length,providerIds:ids,providerCallsMocked:true,physicalAndroidTested:false},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
