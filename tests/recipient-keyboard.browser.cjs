'use strict';
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../www'),reports=path.resolve(__dirname,'../requested-validation');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}fs.readFile(file,(e,b)=>{if(e){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(b);});});
(async()=>{
 fs.mkdirSync(reports,{recursive:true});await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});const checks=[],errors=[];
 try{
  const page=await browser.newPage({viewport:{width:412,height:915}});page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});await page.waitForTimeout(150);
  await page.evaluate(async()=>{window.__xss=false;window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonWhatsApp:{status:async()=>({personal:true,toasts:true,aiSee:true}),consumeOpen:async()=>({}),drafts:async()=>({results:[],pending:false})}}};await HorizonWhatsAppFeature.refresh();});
  await page.evaluate(()=>window.dispatchEvent(new CustomEvent('horizon-whatsapp',{detail:{id:'xss-preview',sender:'Friend <img src=x onerror=window.__xss=true>',text:'A private message',time:Date.now()}})));
  await page.locator('#hzToasts button').filter({hasText:'☝ Pin'}).click();
  assert.equal(await page.locator('.hz-wa-editor img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),false);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  for(const width of [320,412,768]){await page.setViewportSize({width,height:915});const rect=await page.locator('#hzWaPinned').boundingBox();assert.ok(rect.x>=0&&rect.x+rect.width<=width+1);}
  checks.push('pinned notification sender is escaped and responsive; no Contacts messenger is loaded');
  await page.locator('#hzWaPinned button').last().click();assert.equal(await page.evaluate(()=>HorizonWhatsAppFeature.block()),'');checks.push('Unpin clears the private preview from AI context');
  await page.reload({waitUntil:'load'});await page.waitForTimeout(300);
  const input=page.locator('#chatInput');await input.focus();await page.keyboard.type('Typing remains responsive. ');assert.equal(await input.inputValue(),'Typing remains responsive. ');
  await page.evaluate(()=>{const box=document.getElementById('chatInput');box.dispatchEvent(new CompositionEvent('compositionstart'));box.value+='IME composition';box.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));window.hzKbNative(false,false);});
  await page.waitForTimeout(100);assert.equal(await input.evaluate(e=>e===document.activeElement),true);assert.equal(await input.inputValue(),'Typing remains responsive. IME composition');
  await page.evaluate(()=>document.getElementById('chatInput').dispatchEvent(new CompositionEvent('compositionend')));await page.waitForTimeout(50);assert.ok(await input.evaluate(e=>e.offsetHeight>0));checks.push('composition survives delayed keyboard-hidden events without blur, lost text or a hidden editor');
  await page.clock.install();
  for(let i=0;i<11;i++){await page.evaluate(()=>window.hzKbNative(true,true));await page.clock.runFor(100);}
  await page.clock.runFor(200);assert.equal(await page.evaluate(()=>window.hzKbBusy),false);checks.push('repeated native keyboard-start signals cannot indefinitely extend the busy watchdog');
  await page.evaluate(()=>{window.__fakeVh=700;Object.defineProperty(window.visualViewport,'height',{configurable:true,get:()=>window.__fakeVh});});
  for(let i=0;i<18;i++){await page.evaluate(()=>{window.__fakeVh-=3;window.hzKbCheck();});await page.clock.runFor(100);}
  await page.clock.runFor(250);assert.equal(await page.evaluate(()=>window.hzKbBusy),false);await page.evaluate(()=>delete window.visualViewport.height);checks.push('continuous resize events recover instead of keeping the keyboard guard stuck');
  await page.clock.resume();await input.focus();await page.keyboard.type(' 999');assert.match(await input.inputValue(),/IME composition 999$/);checks.push('typing still accepts input after watchdog recovery');
  assert.deepEqual(errors,[]);const report={checks,errors,androidDeviceTested:false,previewBridgeMocked:true,keyboardSignalsSimulated:true};fs.writeFileSync(path.join(reports,'recipient-keyboard-browser.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
