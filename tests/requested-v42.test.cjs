'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),os=require('node:os'),cp=require('node:child_process');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
const tick=()=>new Promise(r=>setImmediate(r));
function engine(C,extra={}){const store=new Map(),w={console,AbortController,setTimeout,clearTimeout,Capacitor:C,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)},...extra};w.window=w;vm.createContext(w);vm.runInContext(read('www/horizon_edge_tts.js'),w);return w;}
function job(){return{text:'Test',prov:'groq',chunk:t=>[t],cancelled:()=>false,waitResume:async()=>{},onPlaying(){}};}
test('V42: unbundled Capacitor bridge can synthesize through nativePromise without registerPlugin',async()=>{
 const calls=[];let listener,spoken;const C={isNativePlatform:()=>true,isPluginAvailable:()=>true,addListener:(name,event,fn)=>{listener=fn;return Promise.resolve({remove(){}});},nativePromise:async(name,method,args)=>{calls.push([name,method,args]);if(method==='speak')spoken=args;}};
 const E=engine(C).HorizonEdgeTTS;E.setEnabled(true);assert.equal(E.wants(),true);const promise=E.play(job());await tick();listener({id:spoken.id,event:'playing'});listener({id:spoken.id,event:'ended'});assert.equal(await promise,true);assert.equal(calls[0][0],'HorizonEdgeVoice');assert.equal(calls[0][1],'speak');
});
test('V42: unbundled native catalogue works and retains voice IDs',async()=>{
 const C={isNativePlatform:()=>true,addListener(){},nativePromise:async(_,method)=>{assert.equal(method,'listVoices');return{voices:[{ShortName:'en-ZA-LeahNeural',FriendlyName:'Leah',Locale:'en-ZA'}]};}};
 const E=engine(C).HorizonEdgeTTS;await E.refreshVoices();assert.equal(E.voices[0].id,'en-ZA-LeahNeural');
});
test('V42: stalled event listener times out instead of hanging speech forever',async()=>{
 let expire;const P={addListener:()=>new Promise(()=>{})};const w=engine({isNativePlatform:()=>true,Plugins:{HorizonEdgeVoice:P}},{setTimeout:(fn,ms)=>{assert.equal(ms,8000);expire=fn;return 1;},clearTimeout(){}});
 const done=w.HorizonEdgeTTS.play(job());await tick();const reject=assert.rejects(done,/event listener/);expire();await reject;
});
test('V42: stalled voice catalogue times out and keeps built-in voices',async()=>{
 let expire;const P={listVoices:()=>new Promise(()=>{})};const E=engine({isNativePlatform:()=>true,Plugins:{HorizonEdgeVoice:P}},{setTimeout:(fn,ms)=>{assert.equal(ms,25000);expire=fn;return 1;},clearTimeout(){}}).HorizonEdgeTTS;
 const n=E.voices.length,done=E.refreshVoices();const reject=assert.rejects(done,/catalogue timed out/);expire();await reject;assert.equal(E.voices.length,n);
});
test('V42: missing Android plugin is explicit, not a silently blocked browser fetch',async()=>{
 const E=engine({isNativePlatform:()=>true,isPluginAvailable:()=>false}).HorizonEdgeTTS;assert.equal(E.wants({forceEdge:true}),false);await assert.rejects(E.refreshVoices(),/missing.*rebuild the APK/);
});
test('V42: visible media tile observes playback instead of treating idle lyrics as playing',()=>{
 const js=read('www/horizon_rpmedia.js');assert.match(js,/MutationObserver\(tick\)/);assert.match(js,/hzly-box\.is-playing/);assert.doesNotMatch(js,/HorizonLyrics\.isOpen\(\)/);assert.match(js,/#settingsBtn, \.hzc-set/);
});
test('V42: native catalogue clock retry, readiness method and modal stacking fix are present',()=>{
 const k=read('android-native/com/festers/horizon/edge/HorizonEdgeVoicePlugin.kt');assert.match(k,/fun status\(call: PluginCall\)/);assert.match(k,/for \(attempt in 0\.\.1\)/);assert.match(k,/response\.headers\.getDate\("Date"\)/);assert.match(k,/EdgeProtocol\.secMsGec\(skew\)/);assert.match(read('www/horizon_app.css'),/body > \.hzc-shade \{ z-index:10080!important/);
});
for(const ext of ['java','kt'])test('V42: Edge installer dry-run, registration, backups and idempotence ('+ext+')',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'horizon-edge-')),main=path.join(root,'app/src/main'),java=path.join(main,'java/com/example');fs.mkdirSync(java,{recursive:true});
 const activity=path.join(java,'MainActivity.'+ext),manifest=path.join(main,'AndroidManifest.xml'),gradle=path.join(root,'app/build.gradle'+(ext==='kt'?'.kts':''));
 fs.writeFileSync(activity,ext==='java'?'package com.example; import com.getcapacitor.BridgeActivity; public class MainActivity extends BridgeActivity {}':'package com.example\nimport com.getcapacitor.BridgeActivity\nclass MainActivity : BridgeActivity() {}');
 fs.writeFileSync(manifest,'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application/></manifest>');fs.writeFileSync(gradle,'// Kotlin already configured by fixture host\n');
 const script=path.join(__dirname,'../scripts/install_edge.py');const before=fs.readFileSync(activity,'utf8');cp.execFileSync('python3',[script,root]);assert.equal(fs.readFileSync(activity,'utf8'),before);
 cp.execFileSync('python3',[script,root,'--apply']);const first=fs.readFileSync(activity,'utf8');assert.match(first,/registerPlugin\(com\.festers\.horizon\.edge\.HorizonEdgeVoicePlugin/);assert.ok(first.indexOf('registerPlugin')<first.indexOf('super.onCreate'));
 assert.equal(fs.readdirSync(path.join(main,'java/com/festers/horizon/edge')).length,5);assert.ok(fs.existsSync(activity+'.edge-backup'));cp.execFileSync('python3',[script,root,'--apply']);assert.equal(fs.readFileSync(activity,'utf8'),first);assert.equal((fs.readFileSync(gradle,'utf8').match(/okhttp:4\.12\.0/g)||[]).length,1);fs.rmSync(root,{recursive:true,force:true});
});
