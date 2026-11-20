'use strict';
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const out=path.join(__dirname,'results-v87');fs.mkdirSync(out,{recursive:true});
const checks=[],errors=[],sent=[];let failure='',mismatch=false;
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 const ctx=await browser.newContext({viewport:{width:412,height:915}});
 await ctx.addInitScript(()=>{
  localStorage.setItem('horizon_soul_v','999');localStorage.setItem('hzLite','0');
  localStorage.setItem('horizon_active_provider','ovh');localStorage.setItem('horizon_model_ovh','gpt-oss-20b');
  localStorage.setItem('horizon_models_ovh',JSON.stringify(['gpt-oss-20b']));
  for(const id of ['groq','gemini','cohere','routeway','requesty','zai','aionlabs','cloudflare','openrouter'])localStorage.setItem('horizon_key_'+id,id==='cloudflare'?'a'.repeat(32)+':'+'T'.repeat(30):'fixture-key-not-a-real-secret');
  localStorage.setItem('horizon_verified_models_v87_cloudflare',JSON.stringify(['@cf/meta/llama-3.1-8b-instruct','@cf/openai/gpt-oss-20b']));
  localStorage.setItem('horizon_verified_models_v87_openrouter',JSON.stringify(['meta-llama/llama-3.3-70b-instruct:free']));
  localStorage.setItem('horizon_model_cloudflare','@cf/openai/gpt-oss-20b');
 });
 await ctx.route('https://**/*',async route=>{
  const req=route.request(),u=new URL(req.url());let b={};try{b=req.postDataJSON()||{};}catch(_){}
  if(req.method()!=='POST')return route.fulfill({status:404,contentType:'application/json',body:'{}'});
  sent.push({host:u.hostname,path:u.pathname,body:b,authorization:req.headers().authorization||''});
  if(failure===u.hostname)return route.fulfill({status:u.hostname==='api.cloudflare.com'?403:u.hostname==='openrouter.ai'?402:429,contentType:'application/json',body:JSON.stringify({error:{message:'Model unavailable or quota exhausted'},errors:[{message:'Model not supported'}]})});
  let model=b.model||decodeURIComponent(u.pathname.split('/').pop().split(':')[0]),d;
  if(mismatch)model='a-different-model';
  if(u.hostname==='generativelanguage.googleapis.com'){
   d={candidates:[{content:{parts:[{text:'Fixture OK'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3}};
   return route.fulfill({status:200,contentType:'text/event-stream',body:'data: '+JSON.stringify(d)+'\n\n'});
  }
  if(u.hostname==='api.cohere.com')d={model,message:{content:[{type:'text',text:'Fixture OK'}]},finish_reason:'COMPLETE'};
  else if(u.hostname==='mlvoca.com')d={model,response:'Fixture OK',done:true};
  else d={model,choices:[{message:{content:'Fixture OK'},delta:{content:'Fixture OK'},finish_reason:'stop'}],usage:{prompt_tokens:2,completion_tokens:3}};
  return route.fulfill({status:200,contentType:b.stream?'text/event-stream':'application/json',body:b.stream?'data: '+JSON.stringify(d)+'\n\ndata: [DONE]\n\n':JSON.stringify(d)});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(process.env.HORIZON_URL||'http://127.0.0.1:8134/www/index.html');await p.waitForFunction(()=>window.HorizonAskAI);await p.waitForTimeout(450);await p.evaluate(()=>{if(window.HzAbout)HzAbout.allow=()=>true;});
 const providers=await p.evaluate(()=>Object.entries(HorizonModelInventory.verified).filter(([,v])=>v.length).map(([id,v])=>({id,model:id==='ovh'?'gpt-oss-20b':v[0]})));
 for(const {id,model}of providers){const n=sent.length;const answer=await p.evaluate(({id,model})=>HorizonAskAI([{role:'user',text:'hello'}],{prov:id,model}),{id,model});assert.match(answer,/Fixture OK/);assert.equal(sent.length,n+1,id+' sends exactly one inference call');if(sent[n].body.model)assert.equal(sent[n].body.model,model);}
 checks.push('All seeded providers use one request and the exact manually selected model');
 for(const [id,host,model]of [['ovh','oai.endpoints.kepler.ai.cloud.ovh.net','gpt-oss-20b'],['cloudflare','api.cloudflare.com','@cf/openai/gpt-oss-20b'],['openrouter','openrouter.ai','meta-llama/llama-3.3-70b-instruct:free'],['llm7','api.llm7.io',providers.find(x=>x.id==='llm7').model]]){
  failure=host;const n=sent.length;const result=await p.evaluate(async({id,model})=>{try{return await HorizonAskAI([{role:'user',text:'test a failure'}],{prov:id,model});}catch(e){return {error:e.message};}},{id,model});
  assert.ok(result.error,id);assert.equal(sent.length,n+1,id+' does not call backup model/provider/key');assert.equal(sent[n].host,host);if(id==='openrouter')assert.equal(sent[n].body.provider.allow_fallbacks,false);
  failure='';
 }
 checks.push('429, 403, 402 and keyless failure never contact another provider/model/key');
 const cf=sent.find(x=>x.host==='api.cloudflare.com');assert.equal(cf.authorization,'Bearer '+'T'.repeat(30));assert.ok(cf.path.includes('/accounts/'+'a'.repeat(32)+'/ai/v1/chat/completions'));checks.push('Cloudflare sends Account ID in URL and API token only in Authorization');
 const coh=sent.find(x=>x.host==='api.cohere.com');assert.ok(Array.isArray(coh.body.messages));assert.ok(!Object.hasOwn(coh.body,'message'));checks.push('Cohere uses v2 chat messages array');
 for(const [id,model]of [['openrouter','openai/paid-model'],['mistral','mistral-large-latest'],['openrouter','openrouter/free'],['groq','nonexistent']]){
  const n=sent.length;const r=await p.evaluate(async({id,model})=>{try{return await HorizonAskAI([{role:'user',text:'never send this'}],{prov:id,model});}catch(e){return e.message;}},{id,model});assert.match(r,/verified free model|choose|selected model/i);assert.equal(sent.length,n);
 }
 checks.push('Paid-only providers, router aliases and unknown models are blocked before network I/O');
 const n=sent.length;const imageError=await p.evaluate(async()=>{try{await HorizonAskAI([{role:'user',text:'see this',imgs:[{mime:'image/png',b64:'AA=='}]}],{prov:'groq',model:'openai/gpt-oss-120b'});}catch(e){return e.message;}});assert.match(imageError,/Pick a vision model manually/);assert.equal(sent.length,n);checks.push('Groq image request cannot silently switch a text model to a vision model');
 mismatch=true;const rr=await p.evaluate(async()=>{try{await HorizonAskAI([{role:'user',text:'identity'}],{prov:'ovh',model:'gpt-oss-20b'});}catch(e){return e.message;}});assert.match(rr,/Model substitution refused/);mismatch=false;checks.push('Provider-reported model substitution is rejected');
 assert.equal(await p.evaluate(()=>localStorage.getItem('horizon_active_provider')),'ovh');assert.equal(await p.evaluate(()=>localStorage.getItem('horizon_model_ovh')),'gpt-oss-20b');assert.equal(await p.evaluate(()=>localStorage.getItem('horizon_model_cloudflare')),'@cf/openai/gpt-oss-20b');checks.push('Failures and legacy migrations preserve saved provider and model selections');
 const nn=sent.length;const vr=await p.evaluate(async()=>{try{await HorizonVoice.transcribe(new Blob(['x'],{type:'audio/webm'}));}catch(e){return e.message;}});assert.match(vr,/selected manually/);assert.equal(sent.length,nn);checks.push('Voice transcription never falls back to another provider');
 // Open only the existing Personalisation panel; no app debug hooks or modified application layout.
 await p.evaluate(()=>document.getElementById('settingsBtn').click());await p.evaluate(()=>document.querySelector('.set-row[data-tab="personalisation"]').click());
 await p.waitForTimeout(350);await p.evaluate(()=>{document.querySelector('#ttsCard .settings-row-header').click();document.querySelectorAll('#ttsCard details').forEach(x=>x.open=true);document.getElementById('ttsCard').scrollIntoView();});await p.waitForTimeout(150);
 const geometry=await p.evaluate(()=>Array.from(document.querySelectorAll('#ttsCard .hz-voice-group')).map(x=>{const r=x.getBoundingClientRect();return {id:x.id,x:r.x,y:r.y,width:r.width,height:r.height};}));
 assert.ok(geometry.length>=8);for(const g of geometry)assert.ok(g.width>100&&g.height>30,g.id+' is actually visible');for(let i=1;i<geometry.length;i++)assert.ok(geometry[i].y>=geometry[i-1].y+geometry[i-1].height-1,geometry[i].id+' is vertically stacked');
 const edge=await p.evaluate(()=>{const x=document.querySelector('#ttsEdgeGroup .hz-edge-provider'),sel=x.querySelector('select').getBoundingClientRect(),btn=x.querySelector('button').getBoundingClientRect();return {sel:sel.toJSON(),btn:btn.toJSON()};});assert.ok(edge.btn.y>=edge.sel.bottom);assert.ok(Math.abs(edge.sel.width-edge.btn.width)<1);checks.push('Every TTS group stacks vertically; Edge selectors and Test buttons are full-width and stacked');
 await p.screenshot({path:path.join(out,'tts-menu.png')});
 // Compare baseline layout at two phone widths using geometry outside the voice card.
 for(const width of [360,412]){
  const snapshots=[];
  for(const port of [8135,8134]){
   const pg=await ctx.newPage();await pg.setViewportSize({width,height:915});await pg.goto('http://127.0.0.1:'+port+'/www/index.html');await pg.waitForTimeout(300);
   snapshots.push(await pg.evaluate(()=>['.composer','.chat-input-area','#chatInput','#chatMessages','.hzc-bar'].map(sel=>{const e=document.querySelector(sel);if(!e)return {sel,missing:true};const r=e.getBoundingClientRect();return {sel,x:r.x,y:r.y,w:r.width,h:r.height};})));await pg.close();
  }
  assert.deepEqual(snapshots[1],snapshots[0]);checks.push('Original chat/header/composer geometry preserved at '+width+'px');
 }
 assert.deepEqual(errors,[]);checks.push('No uncaught JavaScript errors');
 fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({ok:true,checks,geometry,inferenceRequestCount:sent.length},null,2));console.log(JSON.stringify({ok:true,checks},null,2));await browser.close();
})().catch(e=>{fs.writeFileSync(path.join(out,'browser-results.json'),JSON.stringify({ok:false,checks,errors,error:e.stack},null,2));console.error(e);process.exit(1)});
