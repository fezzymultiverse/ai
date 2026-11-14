/* Download-panel regressions. Requires Node 22+ and jsdom (npm install --no-save jsdom).
 * Run from the project root: node tests/download-regression.cjs
 * Tests execute the real Downloads section with a mocked native bridge, not a device. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const html = fs.readFileSync(path.join(__dirname, '../www/index.html'), 'utf8');
// Syntax-check ALL inline scripts, not just the changed section.
let scripts=0;
for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
  if (/\bsrc\s*=|application\/json|application\/ld\+json/i.test(m[1])) continue;
  new (require('node:vm').Script)(m[2]); scripts++;
}
console.log(`PASS: ${scripts} complete inline scripts parse`);
const section = html.slice(html.indexOf('const DL={'), html.indexOf('/* ---------- Security Console:', html.indexOf('const DL={')));
let checks=0;
function ok(label, fn) { fn(); checks++; console.log('PASS:', label); }
(async()=>{
 const dom = new JSDOM('<div id="rail"><button class="rb" data-p="dl"></button></div><div id="dbody"></div>', {runScripts:'outside-only',url:'https://localhost/'});
 const w=dom.window;
 let jobs=[],saves=[],listeners={},calls=[],intervals=[],toasts=[];
 let saveResult={ok:true,info:'Saved'}, pendingSave;
 const bridge={
  downloadJobs:async()=>{calls.push('query');return {jobs:structuredClone(jobs)}},
  addListener:async(name,fn)=>{calls.push('listen');listeners[name]=fn;return {remove(){}}},
  dlConfig:async()=>{}, dlResumeNet:async()=>{calls.push('resume');return {n:0}},
  saveDownload:async({id})=>{saves.push(id);return pendingSave?pendingSave:saveResult},
  dlStart:async()=>({ok:true}),dlPause:async()=>({ok:true}),dlResume:async()=>({ok:true}),
  dlClear:async()=>({n:0}),dlCancel:async()=>({ok:true}),openDownload:async()=>({ok:true}),saveDownloadAs:async()=>({ok:true})
 };
 w.BRIDGE=bridge;w.NOTICES=toasts;w.TIMERS=intervals;
 w.eval(`const NAT=true,S={dlAuto:true,dlWifi:false};let panel='dl',cur=1,H=[];
 const FBW=()=>BRIDGE,$=(s,e=document)=>e.querySelector(s),$$=(s,e=document)=>[...e.querySelectorAll(s)];
 const esc=s=>String(s).replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[c]));
 const fSize=n=>n+' B',toast=s=>NOTICES.push(s),LS={set(){}},confirmBox=async()=>true;
 const closePanel=()=>{},dlManager=()=>{},openInternal=()=>{},nav=()=>{},curTab=()=>({}),copyText=()=>{},dlNotifOnce=()=>{};
 const setTimeout=()=>0,setInterval=fn=>TIMERS.push(fn);
 ${section}
 window.test={DL,DLAUTO,dlInit,dlRefresh,dlAutoSave,dlOnEvent,dlLine,dlBtns,dlRow,renderDl,
 setAuto:v=>S.dlAuto=v,setPanel:v=>panel=v};`);
 const t=w.test;
 const flush=async()=>{await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r))};
 const base={id:1,name:'sample.pdf',state:'downloading',status:'downloading',bytes:50,total:100,progress:50,speed:10,kept:false,saved:false,url:'https://example.test/sample.pdf'};
 jobs=[base];await t.dlInit();
 ok('native listener is installed before the first job snapshot',()=>assert(calls.indexOf('listen')<calls.indexOf('query')));
 ok('drawer has a fallback progress refresh',()=>assert.equal(intervals.length,1));
 t.renderDl();await flush();
 ok('live progress bar displays 50%',()=>assert.equal(w.document.querySelector('[data-dlb]').style.width,'50%'));
 const input=w.document.querySelector('#dlu');input.value='https://example.test/unfinished';input.focus();input.setSelectionRange(8,12);
 t.dlOnEvent({...base,state:'paused',status:'paused'});jobs=[{...base,state:'paused',status:'paused'}];await flush();
 ok('state changes preserve a pasted URL and keyboard focus',()=>{const x=w.document.querySelector('#dlu');assert.equal(x.value,'https://example.test/unfinished');assert.equal(w.document.activeElement,x);assert.equal(x.selectionStart,8);assert.equal(x.selectionEnd,12)});
 t.setAuto(false);
 const done={...base,state:'completed',status:'completed',bytes:100,progress:100,kept:true};jobs=[done];t.dlOnEvent(done);await flush();
 ok('completion renders all three file actions',()=>['open','save','saveas'].forEach(a=>assert(w.document.querySelector(`[data-dla="${a}"]`))));
 const saved={...done,saved:true,path:'Downloads/sample.pdf'};jobs=[saved];t.dlOnEvent(saved);await flush();
 ok('same-state save event refreshes the existing action label',()=>assert.equal(w.document.querySelector('[data-dla="save"]').textContent,'Saved to Downloads'));
 jobs=[{...saved,name:'renamed.pdf',mime:'application/pdf',path:'Downloads/renamed.pdf'}];
 ok('refresh detects metadata-only changes',()=>{});assert.equal(await t.dlRefresh(),true);assert.equal(await t.dlRefresh(),false);
 ok('public-only files are not described as also retained in the browser',()=>{assert(t.dlLine({...saved,kept:false}).startsWith('Saved in '));assert(!t.dlLine({...saved,kept:false}).includes('In the browser'))});
 ok('unknown-length downloads show an indeterminate bar',()=>assert(t.dlRow({...base,total:-1}).includes('dlbar ind')));
 ok('completed zero-byte files still render Open and Save As',()=>assert(t.dlBtns({...done,bytes:0,total:0}).includes('data-dla="saveas"')));
 t.setPanel(null);t.setAuto(true);saves.length=0;
 const auto={...done,id:2,saved:false};t.dlAutoSave(auto,null);t.dlAutoSave(auto,null);await flush();
 ok('duplicate completion events trigger only one automatic save',()=>assert.equal(saves.filter(x=>x===2).length,1));
 saveResult={ok:false,desc:'Storage full'};t.dlAutoSave({...done,id:3},null);await flush();
 ok('failed automatic saves release their in-flight guard',()=>assert.equal(t.DLAUTO.has(3),false));
 saveResult={ok:true};saves.length=0;jobs=[{...done,id:4}];await t.dlRefresh();await flush();
 ok('completion missed by the event listener is recovered from a snapshot',()=>assert(saves.includes(4)));
 t.setAuto(false);saves.length=0;t.dlAutoSave({...done,id:5},null);await flush();
 ok('disabled auto-save setting is respected',()=>assert.equal(saves.length,0));
 t.dlOnEvent({...done,id:4,state:'removed'});
 ok('removed jobs disappear from the list',()=>assert(!t.DL.jobs.some(x=>x.id===4)));
 // Verify only download code changed in the shipped HTML via a separate archive comparison.
 console.log(`All ${checks} panel checks passed (native bridge mocked).`);
 dom.window.close();
})().catch(e=>{console.error(e);process.exitCode=1});
