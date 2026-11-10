'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../www'),reportDir=path.resolve(__dirname,'../validation');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream'});res.end(b);});});
(async()=>{
 fs.mkdirSync(reportDir,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});const checks=[],errors=[];
 try{
  const page=await browser.newPage({viewport:{width:412,height:915}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await page.addInitScript(()=>{localStorage.setItem('horizon_tts_engine','kokoro');localStorage.setItem('horizon_tts_gcloud_key','obsolete-key');});
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.locator('#settingsBtn').evaluate(b=>b.click());await page.locator('#settingsHome [data-tab="personalisation"]').click();await page.locator('#ttsCard > .settings-row-header').click();
  assert.equal(await page.locator('#ttsCard input[type="range"]').count(),17);assert.equal(await page.locator('#ttsPreset option').count(),21);assert.equal(await page.locator('#ttsCloudConfig,#ttsHd,#ttsNat,#ttsLib').count(),0);checks.push('seventeen controls, twenty presets plus Custom, no old TTS provider or download UI');
  assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_tts_engine')),'standard');assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_tts_gcloud_key')),null);checks.push('legacy engine and Cloud TTS key migrate safely');
  await page.evaluate(()=>{
   window.__voiceCalls=[];window.__voiceEvents=new Map();
   const speech={getSupportedVoices:async()=>({voices:[{name:'en-local',lang:'en-US',network:false}]}),getEngines:async()=>({default:'android.default'}),addListener:async(k,fn)=>{window.__voiceEvents.set(k,fn);return{remove:async()=>window.__voiceEvents.delete(k)};},stop:async()=>{if(window.__finishVoice){window.__finishVoice.reject(Error('Speech cancelled'));window.__finishVoice=null;}},speak:args=>{window.__voiceCalls.push(args);window.__voiceEvents.get('speechStart')?.({id:args.utteranceId});return new Promise((resolve,reject)=>{window.__finishVoice={resolve,reject}});},pauseAudio:async()=>{window.__voicePaused=true;},resumeAudio:async()=>{window.__voicePaused=false;}};
   window.HorizonTTS.init({native:true,plug:n=>n==='HorizonSpeech'?speech:null});
  });
  for(const id of await page.evaluate(()=>window.HorizonTTS.presets.map(p=>p.id))){
   await page.locator('#ttsPreset').selectOption(id);await page.locator('#ttsTest').click();
   await page.waitForFunction(()=>!!window.__finishVoice);
   const detail=await page.evaluate(()=>({last:window.__voiceCalls.at(-1),s:window.HorizonTTS.settings(),state:window.HorizonTTS.status().state}));
   assert.equal(detail.last.rate,detail.s.rate);assert.equal(detail.last.pitch,detail.s.pitch);assert.equal(detail.last.effects.robot,detail.s.robot);assert.equal(detail.state,'playing');
   await page.evaluate(()=>{window.__finishVoice.resolve();window.__finishVoice=null;});await page.waitForFunction(()=>window.HorizonTTS.status().state==='idle');
  }
  checks.push('all twenty presets drive the native speech bridge and complete with real-start events (mock Android bridge)');
  await page.locator('#ttsPreset').selectOption('ghost');await page.locator('#ttsTest').click();await page.waitForFunction(()=>!!window.__finishVoice);
  await page.evaluate(()=>window.HorizonTTS.pause());await page.waitForFunction(()=>window.__voicePaused===true);await page.evaluate(()=>window.HorizonTTS.resume());await page.waitForFunction(()=>window.__voicePaused===false);
  await page.locator('#ttsTest').click();await page.waitForFunction(()=>window.HorizonTTS.status().state==='idle');checks.push('effects pause, resume and stop use native bridge without provider fallback');
  await page.locator('#ttsEqGroup > summary').click();
  await page.locator('#ttsFx_bass').evaluate(e=>{e.value='7';e.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('#ttsPreset').inputValue(),'custom');assert.equal(await page.evaluate(()=>window.HorizonTTS.settings().bass),7);checks.push('live EQ adjustment switches to Custom and persists');
  await page.locator('#ttsCard details').evaluateAll(nodes=>nodes.forEach(d=>d.open=true));
  for(const width of [320,412,768]){await page.setViewportSize({width,height:915});const bad=await page.locator('#ttsCard input[type="range"],#ttsPreset').evaluateAll(nodes=>nodes.filter(e=>{const r=e.getBoundingClientRect();return r.width===0||r.left<0||r.right>innerWidth+1;}).map(e=>e.id));assert.deepEqual(bad,[]);}
  checks.push('voice controls fit 320, 412 and 768px widths');
  await page.setViewportSize({width:412,height:915});await page.locator('#ttsStudio').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(reportDir,'android-voice-studio.png')});
  await page.locator('#ttsFxReset').click();assert.equal(await page.evaluate(()=>window.HorizonTTS.hasEffects()),false);assert.equal(await page.locator('#ttsPreset').inputValue(),'neutral');checks.push('reset clears every effect and returns to direct Android speech');
  assert.deepEqual(errors,[]);const report={checks,errors,androidDeviceTested:false,nativeSpeechMocked:true};fs.writeFileSync(path.join(reportDir,'voice-studio-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
