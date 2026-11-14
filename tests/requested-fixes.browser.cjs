const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..','www');
const results=[];
const server=http.createServer((req,res)=>{
 const name=decodeURIComponent(req.url.split('?')[0]);const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,body)=>{if(err){res.writeHead(404).end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png'})[path.extname(file)]||'application/octet-stream');res.end(body);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:412,height:915}}),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'load'});
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#hzCheckinSettings').count(),1);
  assert.equal(await page.locator('#hzCheckinToggle').isChecked(),false);
  assert.equal(await page.locator('#hzCheckinToggle').isDisabled(),true);
  results.push('check-in is opt-in/off, with one settings section; web-only mode is disabled');
  await page.evaluate(()=>{
   window.__calls=[];window.__xss=false;
   window.Capacitor={isNativePlatform:()=>true,Plugins:{
    HorizonTermux:{status:async()=>({enabled:true}),resolveApproval:async x=>{window.__calls.push({kind:'approval',...x});}}
   }};
  });
  await page.evaluate(async()=>{await HorizonBridges.refresh();await HorizonBridges.inbox();});
  const input=page.locator('.hzb-inbox textarea');
  assert.equal(await input.count(),1);
  const style=await input.evaluate(el=>{const s=getComputedStyle(el);return{color:s.color,bg:s.backgroundColor,fill:s.webkitTextFillColor};});
  assert.deepEqual(style,{color:'rgb(255, 255, 255)',bg:'rgb(7, 94, 84)',fill:'rgb(255, 255, 255)'});
  assert.equal(await page.locator('.hzb-inbox img').count(),0);assert.equal(await page.evaluate(()=>window.__xss),false);
  assert.match(await page.locator('.hzb-inbox').innerText(),/No active reply action/);
  await input.fill('exact reply | keep pipe');await page.locator('.hzb-inbox').getByRole('button',{name:'Send reply',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__calls[0]),{kind:'reply',id:'m1',text:'exact reply | keep pipe'});
  assert.equal(await input.inputValue(),'');
  await page.locator('.hzb-inbox').getByRole('button',{name:'Close',exact:true}).click();
  results.push('inbox displays white text on dark green, renders previews as text, shows expired action status, and sends exact reply');
  const payload={token:'test-token-1',title:'Termux review',command:'printf "<img src=x onerror=window.__xss=true>"',warning:'<script>window.__xss=true</script>'};
  await page.evaluate(d=>window.dispatchEvent(new CustomEvent('horizon-termux-approval',{detail:d})),payload);
  assert.equal(await page.locator('.hzb-approval img,.hzb-approval script').count(),0);
  assert.equal(await page.locator('.hzb-approval pre').textContent(),payload.command);
  assert.equal(await page.locator('.hzb-approval button').first().evaluate(el=>el===document.activeElement),true);
  await page.locator('.hzb-approval').getByRole('button',{name:'Cancel',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__calls.at(-1)),{kind:'approval',token:payload.token,approved:false});
  payload.token='test-token-2';await page.evaluate(d=>window.dispatchEvent(new CustomEvent('horizon-termux-approval',{detail:d})),payload);
  await page.locator('.hzb-approval').getByRole('button',{name:'Run',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>window.__calls.at(-1)),{kind:'approval',token:payload.token,approved:true});
  assert.equal(await page.locator('.hzb-approval').count(),0);assert.equal(await page.evaluate(()=>window.__xss),false);
  payload.token='test-token-3';await page.evaluate(d=>window.dispatchEvent(new CustomEvent('horizon-termux-approval',{detail:d})),payload);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));delete document.hidden;});
  assert.deepEqual(await page.evaluate(()=>window.__calls.at(-1)),{kind:'approval',token:payload.token,approved:false});
  results.push('Termux command and warnings cannot inject HTML; Cancel, Run and background dismissal acknowledge only the native token');
  assert.deepEqual(errors,[]);
  const settings=await browser.newPage();await settings.setContent('<section id="daemonCard"></section>');
  await settings.evaluate(()=>{
   window.__configured=[];window.__snapshot={provider:'gemini',model:'test-model',key:'synthetic-local-test-key',history:[{role:'user',text:'test-only'}]};
   window.HorizonCheckinSnapshot=()=>JSON.parse(JSON.stringify(window.__snapshot));
   window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonCheckin:{status:async()=>({enabled:false,hours:4,notifications:true}),configure:async x=>window.__configured.push(x)},HorizonPerms:{requestNotifications:async()=>({granted:true})}}};
  });
  await settings.addScriptTag({path:path.join(root,'horizon_checkin.js')});await settings.waitForTimeout(100);
  settings.once('dialog',d=>d.dismiss());await settings.locator('#hzCheckinToggle').click();
  assert.equal(await settings.locator('#hzCheckinToggle').isChecked(),false);assert.equal(await settings.evaluate(()=>window.__configured.length),0);
  settings.once('dialog',d=>d.accept());await settings.locator('#hzCheckinToggle').check();
  await settings.waitForFunction(()=>window.__configured.length===1);
  assert.equal(await settings.evaluate(()=>window.__configured[0].enabled),true);
  await settings.locator('#hzCheckinHours').selectOption('8');await settings.waitForFunction(()=>window.__configured.length===2);
  assert.equal(await settings.evaluate(()=>window.__configured[1].hours),8);
  await settings.evaluate(()=>{window.__snapshot.history[0].text='refreshed';window.HorizonCheckin.scheduleSync();});
  await settings.waitForFunction(()=>window.__configured.length===3);
  await settings.locator('#hzCheckinToggle').uncheck();await settings.waitForFunction(()=>window.__configured.at(-1).enabled===false);
  assert.deepEqual(await settings.evaluate(()=>window.__configured.at(-1)),{enabled:false});
  results.push('check-in consent decline makes no request; enable, interval change, snapshot refresh and disable use the native worker bridge');
  console.log(JSON.stringify({checks:results,errors,androidDeviceTested:false,nativeBridgesMocked:true},null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
