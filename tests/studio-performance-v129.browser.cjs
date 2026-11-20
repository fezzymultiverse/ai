'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=n=>fs.readFileSync(path.join(__dirname,'../www',n),'utf8');
(async()=>{
 const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
 try{
  const p=await browser.newPage({viewport:{width:412,height:860}});
  await p.setContent('<style>.hz-viz{width:320px;height:130px}#hzRpWave{width:320px;height:130px}</style><div id="leftPanel" class="panel open"><div id="hzRpWave"></div></div><div id="rightPanel"></div><div id="mpMini" class="playing"></div><textarea id="chatInput"></textarea>');
  await p.evaluate(()=>{const raf=window.requestAnimationFrame;window.framesRequested=0;window.requestAnimationFrame=fn=>{window.framesRequested++;return raf(fn);};});
  await p.addScriptTag({content:read('horizon_viz.js')});await p.waitForTimeout(180);
  const first=await p.evaluate(()=>window.framesRequested);assert.ok(first>2);
  await p.evaluate(()=>{window.hzEditorFocused=true;});await p.waitForTimeout(80);
  const before=await p.evaluate(()=>window.framesRequested);await p.waitForTimeout(220);const after=await p.evaluate(()=>window.framesRequested);
  assert.equal(after,before,'active waveform RAF must stop during typing');
  await p.evaluate(()=>{window.hzEditorFocused=false;window.dispatchEvent(new Event('hz-editor-settled'));});await p.waitForTimeout(120);const resumed=await p.evaluate(()=>window.framesRequested);assert.ok(resumed>after);
  console.log('PASS waveform runs before focus, stops while editing, resumes after blur',JSON.stringify({first,before,after,resumed}));
  // Use a fresh page to isolate viewer observer work from the visualizer.
  const q=await browser.newPage();await q.setContent('<div id="clock"></div>');
  await q.evaluate(()=>{const all=document.querySelectorAll.bind(document);window.codeScans=0;document.querySelectorAll=function(selector){if(String(selector).startsWith('.code-block'))window.codeScans++;return all(selector);};});
  await q.addScriptTag({content:read('horizon_htmlview.js')});const scans=await q.evaluate(()=>window.codeScans);
  await q.evaluate(async()=>{for(let i=0;i<20;i++){document.getElementById('clock').textContent=String(i);await new Promise(r=>setTimeout(r,12));}});await q.waitForTimeout(180);
  assert.equal(await q.evaluate(()=>window.codeScans),scans);
  await q.evaluate(()=>{const b=document.createElement('div');b.className='code-block';b.innerHTML='<div class="code-head"><button class="code-copy">Copy</button></div><pre><code>plain text</code></pre>';document.body.append(b);});await q.waitForTimeout(200);assert.ok(await q.evaluate(()=>window.codeScans)>scans);
  console.log('PASS clock/streaming text triggers no global code scans; new code blocks still decorate');
  console.log('Focused performance checks passed: 2');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
