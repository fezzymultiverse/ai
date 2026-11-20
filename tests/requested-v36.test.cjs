'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
function harness(plugin, extra={}) {
  const storage = new Map();
  const w = {console, setTimeout, clearTimeout, AbortController, localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,String(v)),removeItem:k=>storage.delete(k)}, ...extra};
  if (plugin) w.Capacitor = {isNativePlatform:()=>true,isPluginAvailable:()=>true,Plugins:{HorizonEdgeVoice:plugin}};
  w.window=w;w.globalThis=w;vm.createContext(w);vm.runInContext(source('horizon_edge_tts.js'),w);return w;
}
const tick = ()=>new Promise(r=>setImmediate(r));
test('V36: testing each provider explicitly forwards its selected voice',()=>{
  const calls=[], w=harness({});w.HorizonTTS={stop(){},toggle(...args){calls.push(args);}};
  const E=w.HorizonEdgeTTS;
  E.setVoice('cohere','en-ZA-LukeNeural');E.testVoice('cohere');E.testVoice('gemini','en-GB-SoniaNeural');
  assert.equal(calls[0][2].voice,'en-ZA-LukeNeural');assert.equal(calls[0][2].prov,'cohere');assert.equal(calls[1][2].voice,'en-GB-SoniaNeural');assert.equal(calls[1][2].forceEdge,true);
  assert.ok(E.providers.length>=15);
});
test('V36: explicit voice crosses HorizonTTS wrapper unchanged',async()=>{
  const w=harness(null);vm.runInContext(source('horizon_tts.js'),w);
  let passed;w.HorizonTTS.registerEdge({wants:()=>true,stop(){},async play(j){passed=j;},setPaused(){}});
  await w.HorizonTTS.speak('explicit','Hello',{forceEdge:true,prov:'openai',voice:'en-AU-WilliamNeural'});
  assert.equal(passed.voice,'en-AU-WilliamNeural');assert.equal(passed.prov,'openai');
});
test('V36: slow Edge startup stops native audio and rejects for Android fallback',async()=>{
  let deadline, stopped=0, handler;
  const p={addListener:async(_,fn)=>{handler=fn;},speak:async()=>{},stop:async()=>{stopped++;}};
  const w=harness(p,{setTimeout:(fn,ms)=>{if(ms===30000)deadline=fn;return 1;},clearTimeout(){}});
  const done=w.HorizonEdgeTTS.play({text:'Hello',prov:'groq',chunk:t=>[t],cancelled:()=>false,waitResume:async()=>{}});
  await tick();await tick();assert.equal(typeof handler,'function');assert.equal(typeof deadline,'function');
  const rejected=assert.rejects(done,/within 30 seconds/);deadline();await rejected;assert.equal(stopped,1);
});
test('V36: native catalogue is validated, deduplicated and retains array identity',async()=>{
  const p={listVoices:async()=>({voices:[{ShortName:'fr-FR-DeniseNeural',FriendlyName:'Denise',Locale:'fr-FR'},{ShortName:'fr-FR-DeniseNeural'},{ShortName:'invalid <script>'}]})};
  const E=harness(p).HorizonEdgeTTS, original=E.voices;await E.refreshVoices();assert.equal(E.voices,original);assert.equal(E.voices.length,1);assert.equal(E.voices[0].id,'fr-FR-DeniseNeural');
});
test('V36: catalogue failure preserves built-in voices',async()=>{
  const E=harness({listVoices:async()=>{throw Error('offline');}}).HorizonEdgeTTS,n=E.voices.length;
  await assert.rejects(E.refreshVoices(),/offline/);assert.equal(E.voices.length,n);
});
test('V36: native speech source uses prompt stream preparation and bounded catalogue requests',()=>{
  const k=fs.readFileSync(path.join(__dirname,'../android-native/com/festers/horizon/edge/HorizonEdgeVoicePlugin.kt'),'utf8');
  assert.match(k,/setContinueLoadingCheckIntervalBytes\(4096\)/);assert.match(k,/callTimeout\(10, TimeUnit.SECONDS\)/);
});
test('V36: cleanup never uses localStorage.clear or external filesystem deletion',()=>{
  const js=source('horizon_stats.js'), kt=fs.readFileSync(path.join(__dirname,'../android-native/com/festers/horizon/stats/HorizonStatsPlugin.kt'),'utf8');
  assert.doesNotMatch(js,/localStorage\.clear\(/);assert.match(js,/horizon-transient-/);assert.match(js,/root\.confirm\(/);
  assert.match(kt,/context\.cacheDir\.canonicalPath/);assert.match(kt,/call\.getString\("token"\) != scanToken/);assert.match(kt,/f\.lastModified\(\) == c\.modified/);assert.match(kt,/am\.isMusicActive/);
  assert.doesNotMatch(kt,/getExternalStorageDirectory\(|QUERY_ALL_PACKAGES.*uses-permission/);
});
test('V36: event timeline labels observations, not fabricated private thoughts',()=>{
  const html=source('index.html');assert.match(html,/Activity timeline ·/);assert.match(html,/Repeated event ×/);assert.match(html,/Request in progress; no result received yet/);assert.doesNotMatch(html,/Working out the answer/);
});
