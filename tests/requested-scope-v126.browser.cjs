'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const {chromium}=require('playwright'),web=path.resolve(__dirname,'../www');
test('requested fixes: real chat commands, in-chat call lifecycle, contacts row and native artifact downloads',{timeout:60000},async()=>{
 const server=http.createServer((req,res)=>{let file=path.resolve(web,'.'+new URL(req.url,'http://x').pathname);if(file===web)file=path.join(web,'index.html');if(!file.startsWith(web+'/')||!fs.existsSync(file)||!fs.statSync(file).isFile())return res.writeHead(404).end();res.setHeader('content-type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:430,height:880}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(()=>{
   window.testCalls=[];window.testControls=[];window.testDownloads=[];window.testState={calls:[],muted:false,speaker:false};window.testNotice=[];
   const alice={id:'101',name:'Alice',number:'+27110000000'};
   const contacts={
    search:async({name})=>({rows:name==='Nobody'?[]:name==='Alex'?[{id:'201',name:'Alex A',number:'+27210000000'},{id:'202',name:'Alex B',number:'+27210000001'}]:[alice]}),
    duplicates:async()=>({rows:[]}),consumeDialRequest:async()=>({number:''}),
    callState:async()=>window.testState,
    addListener:async(event,fn)=>{window.testEmit=fn;return{remove(){}};},
    dial:async args=>{window.testCalls.push(args);if(window.testReject)throw Error('Default phone approval declined. No call was placed.');window.testState={calls:[{id:'native-'+window.testCalls.length,number:args.number,state:'dialing'}],muted:false,speaker:false};window.testEmit(window.testState);return{requested:true};},
    control:async args=>{window.testControls.push(args);if(args.action==='hangup'){window.testState={calls:[{id:args.id,state:'ended'}]};window.testEmit(window.testState);window.testState={calls:[]};}else{window.testState.muted=args.action==='mute'?!window.testState.muted:window.testState.muted;window.testState.speaker=args.action==='speaker'?!window.testState.speaker:window.testState.speaker;window.testEmit(window.testState);}return{};}
   };
   window.Capacitor={isNativePlatform:()=>true,getPlatform:()=> 'android',Plugins:{HorizonContacts:contacts,HorizonOutput:{download:async a=>{window.testDownloads.push(a);return{saved:true,location:'Download',name:a.name};}}}};
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);await page.waitForFunction(()=>window.__ember?.ready&&window.HorizonForge);
  assert.equal(await page.locator('.hzf-badge').count(),0);
  assert.equal(await page.locator('#hzgContactsRow').evaluate(n=>n.previousElementSibling.id),'hzgDock');
  const send=async t=>{await page.locator('#chatInput').fill(t);await page.locator('#sendBtn').click();};
  await send('Call Alice');await page.waitForFunction(()=>window.testCalls.length===1);
  const first=page.getByRole('article',{name:'Calling Card'}).first();await first.getByText('Calling…',{exact:true}).waitFor();
  assert.deepEqual(await page.evaluate(()=>testCalls),[{id:'101',number:'+27110000000'}]);
  await page.evaluate(()=>{testState.calls[0].state='active';testEmit(testState);});await first.getByText('Connected',{exact:true}).waitFor();
  await first.getByRole('button',{name:'Mute',exact:true}).click();await first.getByRole('button',{name:'Unmute',exact:true}).waitFor();
  await first.getByRole('button',{name:'Speaker',exact:true}).click();await first.getByRole('button',{name:'Speaker off',exact:true}).waitFor();
  await first.getByRole('button',{name:'End call',exact:true}).click();await first.getByText('Call ended',{exact:true}).waitFor();
  await send('Call Alex');const choice=page.getByRole('article',{name:'Calling Card'}).last();await choice.getByRole('button',{name:'Alex B · +27210000001',exact:true}).waitFor();assert.equal(await page.evaluate(()=>testCalls.length),1);
  await choice.getByRole('button',{name:'Alex B · +27210000001',exact:true}).click();await page.waitForFunction(()=>testCalls.length===2);await choice.getByRole('button',{name:'End call',exact:true}).click();
  await send('Call Nobody');await page.getByRole('article',{name:'Calling Card'}).last().getByText('Contact not found',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>testCalls.length),2);
  await page.evaluate(()=>{window.testReject=true;});await send('Call Alice');await page.getByRole('article',{name:'Calling Card'}).last().getByText('Default phone approval declined. No call was placed.',{exact:true}).waitFor();
  const files=await page.evaluate(async()=>{
   const csv=HorizonOutputs.build({type:'csv',content:'Name,Note\nAlice,"quoted, text"'});
   const out=[];
   out.push(await HorizonOutputs.saveBlob(csv,'test.csv'));
   out.push(await HorizonOutputs.saveBlob(new Blob(['%PDF-1.7'],{type:'application/pdf'}),'test.pdf'));
   out.push(await HorizonOutputs.saveBlob(new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'}),'test.png'));
   out.push(await HorizonForge.saveBlob(new Blob(['<svg/>'],{type:'image/svg+xml'}),'test.svg'));
   const a=HorizonOutputs.card({type:'csv',title:'save-as.csv',content:'[["Name"],["Alice"]]'});document.body.append(a);[...a.querySelectorAll('button')].find(b=>b.textContent==='Save as').click();
   return out;
  });
  assert.deepEqual(files,['Download/test.csv','Download/test.pdf','Download/test.png','Download/test.svg']);
  await page.waitForFunction(()=>testDownloads.length===5);const downloads=await page.evaluate(()=>testDownloads);assert.equal(downloads.at(-1).name,'save-as.csv');assert.equal(Buffer.from(downloads[0].data,'base64').toString(),'\ufeff"Name","Note"\r\n"Alice","quoted, text"\r\n');
  await page.evaluate(()=>{HorizonFlushChats();});await page.reload();await page.waitForFunction(()=>window.__ember?.ready);assert.equal(await page.evaluate(()=>testCalls.length),0);assert.ok(await page.getByRole('article',{name:'Calling Card'}).count()>=4);
  assert.deepEqual(errors,[]);
 }finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
});
