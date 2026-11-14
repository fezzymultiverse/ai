'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.resolve(__dirname,'../www/horizon_ytdirect.js'),'utf8');
const start=source.indexOf('    async function fetchBlob('),end=source.indexOf('    const diag',start);
function run(responses){let calls=0;const ctx={Blob,Number,timed:p=>p,fetch:async()=>responses[calls++]};vm.runInNewContext(source.slice(start,end)+';globalThis.download=fetchBlob;',ctx);return {download:ctx.download,calls:()=>calls};}
function response(status,text,headers={}){return {status,headers:{get:k=>headers[k]||''},blob:async()=>new Blob([text])};}
test('complete YouTube range produces exact bytes',async()=>{const r=run([response(206,'hello',{'content-range':'bytes 0-4/5'})]);const blob=await r.download('https://fixture.invalid/media','UA',5);assert.equal(await blob.text(),'hello');});
test('short/truncated byte range fails rather than saving a corrupt file',async()=>{const r=run([response(206,'abc',{'content-range':'bytes 0-4/5'})]);await assert.rejects(r.download('https://fixture.invalid/media','UA',5),/Incomplete/);});
test('missing and out-of-order content ranges are refused',async()=>{for(const range of ['', 'bytes 10-14/15']){const r=run([response(206,'hello',{'content-range':range})]);await assert.rejects(r.download('https://fixture.invalid/media','UA',15),/out-of-order/);}});
test('ignored Range 200 returns full file once, not duplicate parts',async()=>{const r=run([response(206,'ab',{'content-range':'bytes 0-1/5'}),response(200,'hello',{'content-length':'5'})]);const blob=await r.download('https://fixture.invalid/media','UA',5);assert.equal(await blob.text(),'hello');assert.equal(r.calls(),2);});
test('truncated full-body response is not accepted',async()=>{const r=run([response(200,'abc',{'content-length':'10'})]);await assert.rejects(r.download('https://fixture.invalid/media','UA',10),/Incomplete/);});
test('loop cap cannot return a partial file as success',async()=>{const fixtures=Array.from({length:200},(_,i)=>response(206,'x',{'content-range':`bytes ${i}-${i}/201`}));const r=run(fixtures);await assert.rejects(r.download('https://fixture.invalid/media','UA',201),/incomplete|limit/);assert.equal(r.calls(),200);});
test('empty and HTTP-failed media responses fail honestly',async()=>{for(const fixture of [response(200,''),response(403,'denied')]){const r=run([fixture]);await assert.rejects(r.download('https://fixture.invalid/media','UA',0),/empty|HTTP 403/);}});
