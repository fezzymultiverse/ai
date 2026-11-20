'use strict';
// Host browser verification with mocked Android bridges. Never a claim of device verification.
const test = require('node:test'), assert = require('node:assert/strict'), path = require('node:path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
test('file UI: permission, picker, plan gating, sequential Apply, live History, Undo, Retreat and same Maps dispatch', async () => {
 const browser = await chromium.launch({ headless:true, args:['--no-sandbox'] });
 try {
  const page=await browser.newPage({viewport:{width:430,height:920}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://horizon.local/**',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><html><body style="background:#08121b;color:#caffff"><header></header><main><div id="chatMessages"></div><div id="hzTerminalPermissions"></div></main></body></html>'}));
  await page.goto('http://horizon.local/');
  await page.evaluate(()=>{
   window.mock={enabled:false,granted:false,requested:0,entries:[],calls:[],counter:0,delay:0};
   const m=window.mock;
   const mutation=async(action,data)=>{m.calls.push({action,data});if(m.delay)await new Promise(r=>setTimeout(r,m.delay));const path=data.to||data.path||'/storage/emulated/0/Pictures/result';const id=String(++m.counter);m.entries.push({id,time:Date.now(),action,from:data.from||data.path||'',to:path,reason:data.reason||'',status:'completed'});return {ok:true,path,entryId:id};};
   window.Capacitor={Plugins:{HorizonFilesAccess:{
    status:async()=>{const revoked=m.enabled&&!m.granted;if(revoked)m.enabled=false;return {ok:true,enabled:m.enabled,granted:m.granted,revoked};},
    setEnabled:async d=>({ok:true,enabled:m.enabled=d.enabled&&m.granted}),requestAccess:async()=>{m.requested++;return {ok:true};},
    beginMessage:async d=>{m.context=d;m.scopes=[];m.retreat=false;return {ok:true};},declareScope:async d=>{m.scopes=d.scopeRoots;return {ok:true,scopeRoots:m.scopes};},
    retreat:async()=>{m.retreat=true;return {ok:true};},history:async()=>({ok:true,entries:m.entries}),
    managers:async()=>({ok:true,apps:[{packageName:'example.conduint',label:'Conduint'},{packageName:'example.manager',label:'Another file manager'}],preferred:'example.conduint'}),
    openFolder:async d=>{m.open=d;return {ok:true};}
   },HorizonFiles:{list:async d=>{m.lastList=d;return {ok:true,entries:[]};},stat:async()=>({ok:true,name:'photo.jpg'}),
    makeFolder:d=>mutation('makeFolder',d),move:d=>mutation('move',d),rename:d=>mutation('rename',d),moveToTrash:d=>mutation('moveToTrash',d),
    undo:async d=>{const row=m.entries.find(x=>x.id===d.entryId);row.status='undone';return {ok:true,path:row.from};}
   }}};
  });
  await page.addStyleTag({path:path.join(root,'www/horizon_files.css')});
  await page.addScriptTag({path:path.join(root,'www/horizon_files.js')});
  await page.addScriptTag({path:path.join(root,'www/horizon_dash.js')});
  await page.waitForSelector('#hzf-manager');
  assert.equal(await page.locator('.hzf-badge').isHidden(),true);
  assert.equal(await page.locator('#hzf-manager').inputValue(),'example.conduint');
  assert.equal(await page.evaluate(async()=>JSON.parse((await HorizonDash.run('files.list','/anything')).text).code),'PERMISSION_DENIED');
  await page.evaluate(()=>HorizonFiles.enable());assert.equal(await page.evaluate(()=>mock.requested),1);
  await page.evaluate(()=>window.dispatchEvent(new Event('horizon-resume')));await page.waitForTimeout(40);
  assert.equal(await page.evaluate(()=>HorizonFiles.isOn()),false);
  await page.evaluate(async()=>{mock.granted=true;await HorizonFiles.enable();await HorizonFiles.begin('Sort Pictures, leave Screenshots alone','u1');await HorizonFiles.run('files.scope','["/storage/emulated/0/Pictures"]');});
  assert.equal(await page.locator('.hzf-badge').isVisible(),true);
  const parsed=await page.evaluate(()=>HorizonDash.parse('[[files.scope: ["/storage/emulated/0/Pictures"]]] [[map.show: town]] [[files.list: /storage/emulated/0/Pictures]]'));
  assert.deepEqual(parsed.map(c=>c.kind),['files.scope','map.show','files.list']);
  const ops=[{action:'move',from:'/storage/emulated/0/Pictures/a.jpg',to:'/storage/emulated/0/Pictures/Places/a.jpg',reason:'<img src=x onerror="window.injected=true">'},{action:'rename',path:'/storage/emulated/0/Pictures/b.jpg',newName:'b-new.jpg',reason:'Clear name'}];
  await page.evaluate(ops=>{window.planResult=null;HorizonDash.run('files.plan',JSON.stringify({ops})).then(r=>window.planResult=JSON.parse(r.text));},ops);
  await page.waitForSelector('.hzf-plan');assert.equal(await page.evaluate(()=>mock.calls.length),0);
  assert.equal(await page.locator('.hzf-plan img').count(),0);assert.equal(await page.evaluate(()=>!!window.injected),false);
  assert.match(await page.locator('.hzf-scope').textContent(),/Pictures/);
  await page.locator('.hzf-plan').last().getByRole('button',{name:'Cancel',exact:true}).click();
  await page.waitForFunction(()=>window.planResult);assert.equal(await page.evaluate(()=>planResult.code),'CANCELLED');assert.equal(await page.evaluate(()=>mock.calls.length),0);
  await page.evaluate(async()=>{await HorizonFiles.begin('Apply the requested Pictures move and rename','u2');await HorizonFiles.run('files.scope','["/storage/emulated/0/Pictures"]');});
  await page.evaluate(ops=>{window.planResult=null;HorizonDash.run('files.plan',JSON.stringify({ops})).then(r=>window.planResult=JSON.parse(r.text));},ops);
  await page.locator('.hzf-plan').last().getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>window.planResult);assert.equal(await page.evaluate(()=>planResult.ok),true);assert.equal(await page.evaluate(()=>mock.calls.length),2);
  assert.equal(await page.locator('.hzf-history-row').count(),2);assert.equal(await page.locator('.hzf-history-row').first().getByRole('button',{name:'Undo',exact:true}).count(),1);
  await page.locator('.hzf-history-row').first().getByRole('button',{name:'Undo',exact:true}).click();
  await page.waitForFunction(()=>mock.entries.some(r=>r.status==='undone'));
  await page.locator('.hzf-history-row').first().getByRole('button',{name:'Open results',exact:true}).click();assert.equal(await page.evaluate(()=>mock.open.packageName),'example.conduint');
  // Retreat during an in-flight operation: only that operation may finish; the rest must be RETREATED.
  await page.evaluate(ops=>{mock.calls=[];mock.delay=150;window.planResult=null;HorizonDash.run('files.plan',JSON.stringify({ops:ops.concat(ops)})).then(r=>window.planResult=JSON.parse(r.text));},ops);
  await page.locator('.hzf-plan').last().getByRole('button',{name:'Apply',exact:true}).click();
  await page.waitForFunction(()=>mock.calls.length===1);
  await page.locator('.hzf-plan').last().getByRole('button',{name:'Retreat',exact:true}).click();
  await page.waitForFunction(()=>window.planResult);assert.equal(await page.evaluate(()=>planResult.code),'RETREATED');assert.equal(await page.evaluate(()=>mock.calls.length),1);
  assert.equal(await page.evaluate(()=>planResult.results.filter(r=>r.result.code==='RETREATED').length),3);
  await page.evaluate(()=>{mock.granted=false;window.dispatchEvent(new Event('horizon-resume'));});
  await page.waitForFunction(()=>!HorizonFiles.isOn());assert.equal(await page.locator('.hzf-badge').isHidden(),true);
  assert.equal(errors.length,0,errors.join('\n'));
 } finally {await browser.close();}
});
