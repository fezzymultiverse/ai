'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const code=fs.readFileSync(path.join(root,'www/horizon_whatsapp_feature.js'),'utf8');
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function setup(extra={}){
  const settings={access:true,connected:true,personal:false,business:true,aiSee:true,aiRecent:true,toasts:true,...extra};
  const events={};const messages=[{id:'business-1',sender:'Customer',text:'Please confirm my booking.',business:true,time:Date.now()}];
  const plugin={status:async()=>({...settings}),recent:async()=>({messages})};
  const window={Capacitor:{isNativePlatform:()=>true,Plugins:{HorizonWhatsApp:plugin}},addEventListener:(n,f)=>{events[n]=f;}};
  const document={readyState:'loading',hidden:false,addEventListener:()=>{},querySelectorAll:()=>[],getElementById:()=>null};
  const context={window,document,Map,Set,Date,JSON,Promise,setTimeout,clearTimeout,setInterval,clearInterval,console};
  vm.runInNewContext(code,context);
  return {feature:window.HorizonWhatsAppFeature,settings,plugin,messages,events,window,context};
}
test('unverified initial state is unknown, not a false claim that the switch is OFF',()=>{
 const {feature}=setup();assert.match(feature.guide(),/could not be verified/);assert.doesNotMatch(feature.guide(),/sharing with the AI is OFF/);
});
test('prepare awaits native status and delayed recent preview data before prompt generation',async()=>{
 const {feature,plugin,messages}=setup();let complete=false;
 plugin.recent=async()=>{await delay(25);complete=true;return{messages};};
 await feature.prepare();assert.equal(complete,true);assert.match(feature.guide(),/Customer/);assert.match(feature.guide(),/Please confirm my booking/);assert.doesNotMatch(feature.guide(),/sharing with the AI is OFF/);
});
test('overlapping refresh and send share one complete preflight rather than returning stale state',async()=>{
 const {feature,plugin,messages}=setup();let calls=0;
 plugin.status=async()=>{calls++;await delay(20);return{access:true,personal:false,business:true,aiSee:true,aiRecent:true};};
 plugin.recent=async()=>{await delay(20);return{messages};};
 await Promise.all([feature.refresh(),feature.prepare(),feature.prepare()]);assert.equal(calls,1);assert.match(feature.guide(),/Please confirm my booking/);
});
test('turning latest-preview sharing off removes previously cached text without an app restart',async()=>{
 const {feature,settings}=setup();await feature.prepare();assert.match(feature.guide(),/Customer/);
 settings.aiRecent=false;await feature.prepare();assert.doesNotMatch(feature.guide(),/Customer|Please confirm my booking/);assert.equal(feature.block(),'');
});
test('revoking AI sharing blocks all cached preview content immediately on next preflight',async()=>{
 const {feature,settings}=setup();await feature.prepare();settings.aiSee=false;await feature.prepare();assert.match(feature.guide(),/sharing with the AI is OFF/);assert.doesNotMatch(feature.guide(),/Customer/);assert.equal(feature.block(),'');
});
test('native status failure fails closed while allowing unrelated AI chat to continue',async()=>{
 const {feature,plugin}=setup();await feature.prepare();plugin.status=async()=>{throw Error('bridge disconnected');};
 await feature.prepare();assert.match(feature.guide(),/could not be verified/);assert.doesNotMatch(feature.guide(),/Customer/);assert.equal(feature.block(),'');
});
test('empty captures are described as empty, never as a disabled switch',async()=>{
 const {feature,messages}=setup();messages.length=0;await feature.prepare();assert.match(feature.guide(),/sharing is ON, but no captured previews/);assert.doesNotMatch(feature.guide(),/sharing with the AI is OFF/);
});
test('a recent-preview load failure is reported honestly, without stale content or a false OFF',async()=>{
 const {feature,plugin}=setup();await feature.prepare();plugin.recent=async()=>{throw Error('could not decrypt');};await feature.prepare();assert.match(feature.guide(),/sharing is ON but loading the previews failed/);assert.doesNotMatch(feature.guide(),/Customer/);
});
test('disabled source and expired rows cannot leak from the native preview result',async()=>{
 const {feature,messages}=setup();messages.push({sender:'UnselectedPersonal',text:'PRIVATE',business:false,time:Date.now()},{sender:'ExpiredCustomer',text:'OLD',business:true,time:Date.now()-86400001});
 await feature.prepare();assert.match(feature.guide(),/Customer/);assert.doesNotMatch(feature.guide(),/UnselectedPersonal|ExpiredCustomer|PRIVATE|OLD/);
});
test('clearing or locking during an in-flight preview read cannot repopulate the AI cache',async()=>{
 const {feature,plugin,messages}=setup();let release,started;
 const ready=new Promise(r=>{started=r;});plugin.recent=()=>new Promise(r=>{release=()=>r({messages});started();});
 const pending=feature.refresh();await ready;feature.clear();release();await pending;assert.doesNotMatch(feature.guide(),/Please confirm my booking/);
});
test('revoking Android listener access strips recent previews from future AI context',async()=>{
 const {feature,settings}=setup();await feature.prepare();settings.access=false;await feature.prepare();assert.match(feature.guide(),/notification access is not granted/);assert.doesNotMatch(feature.guide(),/Customer/);
});
test('every registered foreground provider is wrapped in awaited preview preflight',async()=>{
 const html=fs.readFileSync(path.join(root,'www/index.html'),'utf8');const start=html.indexOf('        const PROVIDER_IDS = Object.keys(PROVIDERS);');const end=html.indexOf('\n        //',start+60);
 // Select only the new registry and wrapper, not later account migrations.
 const fragment=html.slice(start,html.indexOf('\n        });',start)+'\n        });'.length);
 const order=[],PROVIDERS={gemini:{chat:async()=>{order.push('gemini');return'G';}},groq:{chat:async()=>{order.push('groq');return'Q';}}};
 const feature={prepare:async()=>{await delay(5);order.push('prepared');}};
 vm.runInNewContext(fragment,{PROVIDERS,window:{HorizonWhatsAppFeature:feature},HorizonWhatsAppFeature:feature});
 assert.equal(await PROVIDERS.gemini.chat(),'G');assert.equal(await PROVIDERS.groq.chat(),'Q');assert.deepEqual(order,['prepared','gemini','prepared','groq']);
});
test('native replay reads only active notifications after connection and keeps non-message filters',()=>{
 const kt=fs.readFileSync(path.join(root,'resources/android/java/HorizonWhatsAppPlugin.kt'),'utf8');
 for(const token of ['listener.activeNotifications','if(!connected)return','override fun onListenerConnected','fun previews(call:PluginCall)','fun sync(call:PluginCall)','Notification.FLAG_ONGOING_EVENT','Notification.FLAG_GROUP_SUMMARY','Notification.CATEGORY_CALL'])assert.ok(kt.includes(token),token);
 assert.ok(!kt.includes('if(msg==null&&!hasReply)return@execute'));
});
