'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../www'),out=path.resolve(__dirname,'../NOTIFICATION-FIX-VALIDATION');
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!f.startsWith(root+path.sep))return res.writeHead(403).end();fs.readFile(f,(e,b)=>{if(e)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(f)]||'application/octet-stream'});res.end(b);});});
(async()=>{fs.mkdirSync(out,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});const errors=[],checks=[],payloads=[];
try{
 const page=await browser.newPage({viewport:{width:412,height:915}});page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',async r=>{
   if(r.request().url().startsWith('http://127.0.0.1:'))return r.continue();
   if(r.request().url()==='https://api.groq.com/openai/v1/chat/completions'){
     payloads.push(r.request().postDataJSON());return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({choices:[{message:{content:'Preview test response.'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:4}})});
   }
   return r.abort();
 });
 await page.addInitScript(()=>{
   localStorage.setItem('horizon_active_provider','groq');localStorage.setItem('horizon_key_groq','gsk_mock_for_local_test_only_123456789012345');localStorage.setItem('horizon_model_groq','llama-3.3-70b-versatile');localStorage.setItem('horizon_models_groq',JSON.stringify(['llama-3.3-70b-versatile']));localStorage.setItem('horizon_think_on','0');localStorage.setItem('horizon_web_master','0');localStorage.setItem('horizon_mem_auto','0');
 });
 await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});await page.waitForTimeout(200);
 await page.evaluate(async()=>{
   window.__waSettings={access:true,connected:true,notifications:true,personal:false,business:true,toasts:true,aiSee:true,aiRecent:true,askDraft:true,alerts:true};
   window.__waMessages=[{id:'customer-1',sender:'Customer',text:'Can you confirm the Friday booking?',time:Date.now(),business:true}];window.__waOpen=null;window.__waCalls=[];
   window.__waPlugin={status:async()=>({...window.__waSettings}),recent:async()=>{await new Promise(r=>setTimeout(r,40));return{messages:window.__waMessages};},previews:async()=>({messages:window.__waMessages}),consumeOpen:async()=>{const m=window.__waOpen;window.__waOpen=null;return{message:m};},configure:async cfg=>Object.assign(window.__waSettings,cfg),drafts:async()=>({results:[],pending:false}),clear:async()=>{window.__waMessages=[];},sync:async()=>{window.__waCalls.push('sync');},openAccess:async()=>{window.__waCalls.push('access');}};
   const perms={requestNotifications:async()=>{window.__waCalls.push('permission');return{enabled:false};},openNotificationSettings:async()=>{window.__waCalls.push('settings');}};
   window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonWhatsApp:window.__waPlugin,HorizonPerms:perms}};
   await HorizonWhatsAppFeature.prepare();
 });
 assert.match(await page.evaluate(()=>HorizonWhatsAppFeature.guide()),/Friday booking/);checks.push('Business preview text is ready for the first AI request without opening Permissions');
 // Exercise the actual provider entry point and inspect the outbound prompt, with transport mocked locally.
 page.once('dialog',d=>d.accept());
 await page.evaluate(()=>HorizonFeatureHost.send('Summarise my latest WhatsApp Business preview.'));
 if(!payloads.length)console.log('SEND_DIAGNOSTIC',await page.evaluate(()=>({chat:document.getElementById('chatMessages').textContent,toasts:document.getElementById('hzToasts')?.textContent,active:localStorage.getItem('horizon_active_provider')})));
 assert.equal(payloads.length,1);const sys=payloads[0].messages[0].content;assert.match(sys,/Friday booking/);assert.match(sys,/newest previews without a pin/);assert.doesNotMatch(sys,/sharing with the AI is OFF/);checks.push('Real Groq send path waits for delayed native previews; outbound system prompt contains the permitted message');
 await page.locator('#settingsBtn').evaluate(e=>e.click());await page.locator('#settingsHome [data-tab="permissions"]').click();
 assert.match(await page.locator('#hzWaFeatureStatus').textContent(),/latest previews ON/);
 await page.getByRole('button',{name:'Show captured previews · ☝ Pin',exact:true}).click();
 await page.getByRole('button',{name:/☝ Pin · Customer — Can you confirm/}).click();
 assert.equal(await page.locator('#hzWaPinned').count(),1);assert.match(await page.evaluate(()=>HorizonWhatsAppFeature.block()),/Friday booking/);checks.push('Missed hand popup is recoverable through Show captured previews and pins into the current chat');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(async()=>{window.__waSettings.business=false;await HorizonWhatsAppFeature.prepare();});assert.equal(await page.evaluate(()=>HorizonWhatsAppFeature.block()),'');checks.push('Disabling Business source blocks an already pinned preview from AI context');
 await page.evaluate(async()=>{window.__waSettings.business=true;window.__waSettings.aiRecent=false;await HorizonWhatsAppFeature.prepare();});
 assert.match(await page.evaluate(()=>HorizonWhatsAppFeature.block()),/Friday booking/);assert.match(await page.evaluate(()=>HorizonWhatsAppFeature.guide()),/CAN read the pinned preview/);checks.push('Pinned-only mode reads the pinned preview without requiring latest-preview sharing');
 await page.getByRole('button',{name:'Check / reconnect notification access',exact:true}).click();await page.waitForFunction(()=>window.__waCalls.includes('sync'));checks.push('Reconnect button invokes the native listener recovery method');
 await page.evaluate(async()=>{window.__waSettings.notifications=false;await HorizonWhatsAppFeature.refresh();});
 await page.getByRole('switch',{name:'Allow notifications',exact:true}).click();await page.waitForFunction(()=>window.__waCalls.includes('settings'));assert.equal(await page.evaluate(()=>window.__waCalls.filter(x=>x==='permission').length),1);checks.push('Denied Android notification prompt opens system notification settings rather than silently doing nothing');
 // Background notification tap must work even with in-app popup preference OFF.
 await page.evaluate(async()=>{HorizonWhatsAppFeature.clear();window.__waSettings.toasts=false;window.__waOpen=window.__waMessages[0];window.dispatchEvent(new Event('horizon-resume'));});
 await page.waitForSelector('.hz-wa-editor[open]');assert.equal(await page.locator('#hzWaPinned').count(),1);checks.push('Explicit Horizon notification tap opens and pins its preview even when toast popups are disabled');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(async()=>{HorizonWhatsAppFeature.clear();window.__waSettings.toasts=true;window.__waSettings.aiSee=false;window.__waSettings.aiRecent=false;window.__waMessages=[{id:'missed-2',sender:'Customer Two',text:'A message received while Horizon was hidden.',time:Date.now(),business:true}];window.dispatchEvent(new Event('horizon-resume'));});
 const toast=page.locator('#hzToasts .hz-wa-toast').filter({hasText:'Customer Two'});await toast.waitFor();assert.match(await toast.textContent(),/☝ Pin/);assert.equal(await page.evaluate(()=>HorizonWhatsAppFeature.block()),'');checks.push('Resuming recovers unseen captured preview and its hand action without granting AI access');
 // Close the settings overlay, then test the recovered hand at multiple phone widths.
 await page.locator('#settingsBackBtn').click();await page.locator('#settingsBtn').evaluate(e=>e.click());
 for(const width of [320,412]){await page.setViewportSize({width,height:915});const rect=await toast.boundingBox();assert.ok(rect.x>=-1&&rect.x+rect.width<=width+1);}
 await page.setViewportSize({width:412,height:915});await page.screenshot({path:path.join(out,'recovered-hand-popup.png')});
 await toast.click();assert.equal(await page.locator('#hzWaPinned').count(),1);assert.equal(await page.evaluate(()=>HorizonWhatsAppFeature.block()),'');checks.push('Recovered hand remains tappable at 320/412px; pinning does not bypass AI consent');
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await page.evaluate(()=>window.dispatchEvent(new Event('horizon-lock')));assert.equal(await page.locator('#hzWaPinned').count(),0);assert.equal(await page.locator('#hzWaCaptured').count(),0);assert.equal(await page.evaluate(()=>HorizonWhatsAppFeature.block()),'');checks.push('Lock event removes preview UI and AI cache');
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'notification-browser.json'),JSON.stringify({checks,errors,scope:'Mobile viewport Chromium; Android notification listener and provider HTTP mocked. No physical-device WhatsApp delivery or live provider inference.'},null,2));console.log(JSON.stringify({checks,errors},null,2));
}finally{await browser.close();server.close();}})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
