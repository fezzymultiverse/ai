const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const html=read('www/index.html');
function piece(a,b){return html.slice(html.indexOf(a),html.indexOf(b,html.indexOf(a)));}

test('thought visibility rejects hidden ancestors and CSS-hidden modules',()=>{
 let el=null;
 const context={document:{getElementById:()=>el},getComputedStyle:e=>e.css};
 vm.runInNewContext(piece('        function thoughtViewVisible(', '        function thoughtAnalyse('),context);
 assert.equal(context.thoughtViewVisible('mpNow'),false);
 el={closest:()=>true,getClientRects:()=>[{}],css:{display:'block',visibility:'visible'}};
 assert.equal(context.thoughtViewVisible('mpNow'),false);
 el.closest=()=>false;el.getClientRects=()=>[];assert.equal(context.thoughtViewVisible('mpNow'),false);
 el.getClientRects=()=>[{}];el.css.display='none';assert.equal(context.thoughtViewVisible('mpNow'),false);
 el.css.display='block';el.css.visibility='hidden';assert.equal(context.thoughtViewVisible('mpNow'),false);
 el.css.visibility='visible';assert.equal(context.thoughtViewVisible('mpNow'),true);
});

function downloads(rows, active=[]) {
 function node(){return{children:[],style:{},handlers:{},setAttribute(){},appendChild(n){this.children.push(n)},replaceChildren(){this.children=[]},addEventListener(k,f){this.handlers[k]=f}};}
 const nodes={dlTray:node(),dlBody:node(),dlSummary:node()};
 const context={state:{downloads:rows},document:{createElement:node},$:s=>nodes[s.slice(1)],icon:node,dlSave:()=>{},notice:()=>{},fmtMB:()=>'',dlActive:new Set(active),DL_PARALLEL:2,started:[],runDownload:d=>context.started.push(d.id)};
 vm.runInNewContext(piece('        function renderTray()', '        function setTrayOpen(')+'\n'+piece('        function pumpQueue()', '        async function queueDownload('),context);
 context.renderTray();
 return{context,nodes,click(i){let stopped=false,prevented=false;nodes.dlBody.children[i].children[0].children[2].handlers.click({stopPropagation(){stopped=true},preventDefault(){prevented=true}});return{stopped,prevented}}};
}
test('download X removes completed and queued rows, stopping parent events',()=>{
 const h=downloads([{id:'a',status:'done'},{id:'b',status:'queued'}]);
 assert.deepEqual(h.click(1),{stopped:true,prevented:true});
 assert.equal(h.context.state.downloads.length,1);assert.equal(h.context.state.downloads[0].id,'a');assert.deepEqual(h.context.started,[]);
});
test('dismissing a running download does not release its concurrency slot',()=>{
 const a={id:'a',status:'running'},b={id:'b',status:'running'},c={id:'c',status:'queued'};
 const h=downloads([a,b,c],[a,b]);h.click(0);
 assert.equal(h.context.state.downloads.length,2);assert.equal(a.dismissed,true);assert.equal(h.context.dlActive.size,2);assert.deepEqual(h.context.started,[]);
 h.context.dlActive.delete(a);h.context.pumpQueue();assert.deepEqual(h.context.started,['c']);
});
test('tray removal handles restored numeric and string ids consistently',()=>{
 const h=downloads([{id:7,status:'done'},{id:'7',status:'error'}]);h.click(0);assert.equal(h.context.state.downloads.length,0);assert.equal(h.nodes.dlTray.hidden,true);
});
test('check-in snapshot is bounded text-only, not the system prompt or tool context',()=>{
 const history=Array.from({length:20},()=>({role:'user',text:'a'.repeat(1000),imgs:[{b64:'private'}]}));
 const window={};const context={window,state:{active:'gemini',models:{gemini:'test'}},PROVIDERS:{gemini:{name:'Gemini'}},keyOf:()=> 'test-key',currentChat:()=>({messages:history})};
 vm.runInNewContext(piece('        window.HorizonCheckinSnapshot =', '        window.HorizonAskAI ='),context);
 const snapshot=window.HorizonCheckinSnapshot();assert.equal(snapshot.history.length,12);assert.equal(snapshot.history[0].text.length,600);assert.deepEqual(Object.keys(snapshot.history[0]),['role','text']);
 window.HzLock={locked:()=>true};context.HzLock=window.HzLock;assert.throws(()=>window.HorizonCheckinSnapshot(),/Unlock/);
});
test('check-in worker is opt-in, encrypted and persists messages without opening apps',()=>{
 const s=read('resources/android/java/HorizonCheckinPlugin.kt');
 for(const token of ['WorkManager','getBoolean("enabled", false)','AndroidKeyStore','AES/GCM/NoPadding','cancelUniqueWork','NetworkType.CONNECTED','setRequiresBatteryNotLow(true)','instanceFollowRedirects = false','readTextBounded(131072)','ExistingPeriodicWorkPolicy.KEEP','7 * 86400000L','VISIBILITY_PRIVATE'])assert.ok(s.includes(token),token);
 assert.ok(!s.includes('startActivity('));assert.match(s,/dispatchToJs\("horizon-checkin", "\{\}"\)/);assert.match(s,/putString\("pending", HorizonCheckins.seal/);
});
test('native approvals are one-shot, command-bound and expire; HTML uses text nodes',()=>{
 const s=read('resources/android/java/HorizonTermuxPlugin.kt'),js=read('www/horizon_bridges.js');
 for(const token of ['UUID.randomUUID()','approvals.remove(token)','120000L','pending.run()','approvalHandler.removeCallbacks','HorizonLockPlugin.locked'])assert.ok(s.includes(token),token);
 assert.ok(!s.includes('AlertDialog.Builder'));assert.ok(js.includes("node('pre', '', d.command || '')"));assert.ok(js.includes('closeApproval(false)'));assert.ok(js.includes('document.hidden'));
});
test('Accessibility messaging fallback stays removed',()=>{assert.ok(!fs.existsSync(path.join(root,'resources/android/java/HorizonWhatsAppAccessibility.kt')));assert.ok(!read('scripts/apply-bridges.py').includes('BIND_ACCESSIBILITY_SERVICE'));});
test('background credentials retain backup guards',()=>{for(const file of ['horizon_bridge_backup.xml','horizon_bridge_extraction.xml'])assert.match(read('resources/android/res/xml/'+file),/horizon_checkin.xml/);});
