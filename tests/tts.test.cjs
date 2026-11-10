const {test}=require('node:test');const assert=require('node:assert/strict');const vm=require('node:vm');const fs=require('node:fs');
function setup(opts={}){
const listeners=new Map(),store=new Map(Object.entries(opts.saved||{})),calls=[],synths=[],plays=[];
const speech={setEngine:async()=>({engine:''}),getSupportedVoices:async()=>({voices:[]}),stop:async()=>{calls.push('stop');if(speech.pending){speech.pending.reject(new Error('Speech cancelled'));speech.pending=null;}},addListener:async(type,fn)=>{listeners.set(type,fn);return{remove:async()=>listeners.delete(type)};},speak:async o=>{calls.push('speak');listeners.get('speechStart')?.({id:o.utteranceId});},playAudio:async o=>{plays.push(o);calls.push('playAudio');listeners.get('speechStart')?.({id:o.utteranceId});},pauseAudio:async()=>{calls.push('pauseAudio')},resumeAudio:async()=>{calls.push('resumeAudio')}};
let installed=opts.installed||[];
const voice={status:async()=>({bundled:!opts.missing}),packs:async()=>({installed}),download:async a=>{installed=[...installed,a.id];return{ok:true}},load:async a=>{calls.push('load:'+a.pack);return{ready:true}},synth:async a=>{synths.push(a);calls.push('synth:'+a.pack+':'+a.sid);return{wav:Buffer.alloc(144,1).toString('base64')}}};
const root={fetch:opts.fetch,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>{if(opts.blockWrites)throw Error('quota');store.set(k,v)}},addEventListener:()=>{},atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64')};
const ctx={window:root,setTimeout,clearTimeout,Blob,Uint8Array,DataView,ArrayBuffer,Promise,console};vm.runInNewContext(fs.readFileSync(require.resolve('../www/horizon_tts.js'),'utf8'),ctx);
root.HorizonTTS.init({native:true,plug:n=>n==='HorizonSpeech'?speech:n==='HorizonVoice'?voice:null,keys:()=>opts.keys||[]});
return{T:root.HorizonTTS,calls,speech,voice,store,listeners,synths,plays};
}
test('first run picks Android standard instead of blocking on model loading',async()=>{const{T,calls}=setup();assert.equal(T.settings().engine,'standard');assert.equal(await T.speak('one','Hello.'),true);assert.ok(calls.includes('speak'));});
test('missing built-in pack falls back immediately for replies',async()=>{const{T,calls}=setup({missing:true});T.set('engine','kokoro');assert.equal(await T.speak('two','Hello.'),true);assert.ok(calls.includes('speak'));assert.equal(calls.includes('playAudio'),false);});
test('built-in audio uses native WAV playback, not locked WebView audio',async()=>{const{T,calls}=setup();T.set('engine','kokoro');assert.equal(await T.speak('three','Hello there.'),true);assert.ok(calls.includes('playAudio'),JSON.stringify({calls,status:T.status()}));});
test('strict voice test reports missing pack instead of silently changing engine',async()=>{const{T,calls}=setup({missing:true});T.set('engine','kokoro');assert.equal(await T.test(),false);assert.equal(calls.includes('speak'),false);});
test('native WAV stop does not restart through Web Audio',async()=>{const{T,calls,speech}=setup();T.set('engine','kokoro');speech.playAudio=o=>new Promise((resolve,reject)=>{speech.pending={resolve,reject};calls.push('playAudio');});const run=T.speak('four','Hello.');for(let i=0;!speech.pending&&i<100;i++)await new Promise(r=>setTimeout(r,1));assert.ok(speech.pending,JSON.stringify(T.status()));T.stop();assert.equal(await run,false);assert.equal(calls.filter(x=>x==='playAudio').length,1);assert.equal(T.status().state,'idle');});
test('pause and resume use native WAV controls',async()=>{const{T,calls,speech,listeners}=setup();T.set('engine','kokoro');speech.playAudio=o=>new Promise((resolve,reject)=>{speech.pending={resolve,reject};listeners.get('speechStart')?.({id:o.utteranceId});});const run=T.speak('five','Hello.');for(let i=0;!speech.pending&&i<100;i++)await new Promise(r=>setTimeout(r,1));assert.ok(speech.pending,JSON.stringify(T.status()));T.pause();T.resume();assert.ok(calls.includes('pauseAudio'));assert.ok(calls.includes('resumeAudio'));speech.pending.resolve();speech.pending=null;assert.equal(await run,true);});

test('downloaded voice survives stale JS pack cache on cold start',async()=>{
 const {T,calls}=setup({missing:true,installed:['piper-lessac-low'],saved:{horizon_tts_engine:'kokoro',horizon_tts_kokoro_voice:'pp_lessac_low'}});
 assert.equal(await T.speak('cold','Hello.',{strict:true}),true);
 assert.ok(calls.includes('load:piper-lessac-low'));assert.ok(calls.includes('synth:piper-lessac-low:0'));assert.ok(calls.includes('playAudio'));assert.ok(!calls.includes('load:builtin'));
});
test('download selects the completed voice and invalidates old loader state',async()=>{
 const {T,calls}=setup();await T.packs.download('piper-ryan-low');
 assert.equal(T.settings().engine,'kokoro');assert.equal(T.settings().kvoice,'pp_ryan_low');
 assert.equal(await T.speak('newpack','Hello.',{strict:true}),true);assert.ok(calls.includes('synth:piper-ryan-low:0'));
});
test('switching downloaded packs loads correct pack and speaker each time',async()=>{
 const {T,calls}=setup({installed:['piper-lessac-low','piper-ryan-low']});await T.packs.refresh();T.set('engine','kokoro');
 T.set('kvoice','pp_lessac_low');await T.speak('a','Hello.',{strict:true});T.set('kvoice','pp_ryan_low');await T.speak('b','Hello.',{strict:true});
 assert.ok(calls.includes('synth:piper-lessac-low:0'));assert.ok(calls.includes('synth:piper-ryan-low:0'));
});
test('downloaded group voice stays inside its own pack',async()=>{
 const {T}=setup({installed:['piper-lessac-low']});await T.packs.refresh();T.set('engine','kokoro');T.set('kvoice','pp_lessac_low');
 assert.equal(T.voiceFor(9).kokoro,'pp_lessac_low');
});
test('Google Cloud Standard uses dedicated header key and native WAV playback with fixture audio',async()=>{
 let request;const {T,calls,store}=setup({saved:{horizon_tts_gcloud_key:'restricted-cloud-key-fixture'},fetch:async(url,options)=>{request={url,options};return{ok:true,json:async()=>({audioContent:Buffer.alloc(144,1).toString('base64')})}}});
 T.set('engine','gcloud');assert.equal(await T.speak('cloud','Hello.',{strict:true}),true,JSON.stringify(T.status()));
 assert.equal(request.url,'https://texttospeech.googleapis.com/v1/text:synthesize');assert.equal(request.options.headers['x-goog-api-key'],'restricted-cloud-key-fixture');
 const body=JSON.parse(request.options.body);assert.equal(body.voice.name,'en-US-Standard-C');assert.equal(body.audioConfig.audioEncoding,'LINEAR16');assert.ok(calls.includes('playAudio'));assert.ok(JSON.parse(store.get('horizon_tts_gcloud_usage')).chars>0);
});
test('Google Cloud never borrows a Gemini key implicitly',async()=>{
 let count=0;const {T}=setup({keys:['AQ.synthetic-gemini-key-fixture'],fetch:async()=>{count++;throw Error('must not fetch')}});T.set('engine','gcloud');
 assert.equal(await T.speak('no-key','Hello.',{strict:true}),false);assert.equal(count,0);
});
test('Cloud local cap fails closed before any HTTP request',async()=>{
 let count=0;const {T}=setup({saved:{horizon_tts_gcloud_key:'fixture',horizon_tts_gcloud_usage:JSON.stringify({month:new Date().toISOString().slice(0,7),chars:4000000})},fetch:async()=>{count++;}});T.set('engine','gcloud');
 assert.equal(await T.speak('cap','Hello.',{strict:true}),false);assert.equal(count,0);
});
test('Cloud HTTP failure falls back to Android for normal replies',async()=>{
 const {T,calls}=setup({saved:{horizon_tts_gcloud_key:'fixture'},fetch:async()=>({ok:false,status:403})});T.set('engine','gcloud');
 assert.equal(await T.speak('fallback','Hello.'),true);assert.ok(calls.includes('speak'));
});

test('Cloud spending fails closed if usage cannot be persisted',async()=>{
 let requests=0;const {T}=setup({blockWrites:true,saved:{horizon_tts_engine:'gcloud',horizon_tts_gcloud_key:'fixture'},fetch:async()=>{requests++;}});
 assert.equal(await T.speak('storage','Hello.',{strict:true}),false);assert.equal(requests,0);
});

// ---- V1.93.0 HD voice
test('HD voice: one call downloads Kokoro, selects Heart and turns the HD engine on',async()=>{
 const {T}=setup();assert.equal(T.hd.installed(),false);assert.equal(T.hd.pack,'kokoro');
 await T.hd.get();assert.equal(T.hd.installed(),true);assert.equal(T.hd.active(),true);
 assert.equal(T.settings().engine,'kokoro');assert.equal(T.settings().kvoice,'kk_af_heart');
 assert.match(T.describe(),/^HD voice \(Heart \u00b7 US female \u00b7 Kokoro, offline\)$/);
});
test('HD voice: hd.use() picks a Kokoro voice again after another engine was chosen, and keeps a Kokoro voice already picked',async()=>{
 const {T}=setup({installed:['kokoro'],saved:{horizon_tts_engine:'standard',horizon_tts_kokoro_voice:'kk_bf_emma'}});await T.packs.refresh();
 assert.equal(T.hd.active(),false);assert.equal(T.hd.use(),true);assert.equal(T.hd.active(),true);assert.equal(T.settings().kvoice,'kk_bf_emma');
 const c=setup();assert.equal(c.T.hd.use(),false);
});
test('HD voice: all 28 Kokoro voices are listed once, best first, with the speaker ids of kokoro-multi-lang-v1_0',async()=>{
 const {T}=setup({installed:['kokoro']});await T.packs.refresh();
 const v=T.cloud.kokoro.voices.filter(x=>x.pack==='kokoro');assert.equal(v.length,28);
 assert.equal(new Set(v.map(x=>x.id)).size,28);assert.equal(JSON.stringify(v.map(x=>x.sid).sort((a,b)=>a-b)),JSON.stringify(Array.from({length:28},(_,i)=>i)));
 assert.equal(v[0].id,'kk_af_heart');assert.equal(v[0].sid,3);
 const sid=id=>v.find(x=>x.id===id).sid;
 assert.equal(sid('kk_af_alloy'),0);assert.equal(sid('kk_am_adam'),11);assert.equal(sid('kk_bf_alice'),20);assert.equal(sid('kk_bm_daniel'),24);assert.equal(sid('kk_bm_lewis'),27);assert.equal(sid('kk_am_michael'),16);assert.equal(sid('kk_bf_emma'),21);
});
test('on-phone voices make the speed inside the model and play at 1x, pitch stays a playback control',async()=>{
 const {T,synths,plays}=setup({installed:['piper-lessac-low'],saved:{horizon_tts_engine:'kokoro',horizon_tts_kokoro_voice:'pp_lessac_low',horizon_tts_rate:'1.5',horizon_tts_pitch:'1.2'}});
 await T.packs.refresh();assert.equal(await T.speak('rate','Hello there.',{strict:true}),true);
 assert.equal(synths[0].speed,1.5);assert.equal(plays[0].rate,1);assert.equal(plays[0].pitch,1.2);
});
test('on-phone voice speed is clamped to the model range',async()=>{
 const {T,synths}=setup({saved:{horizon_tts_engine:'kokoro',horizon_tts_rate:'2'}});await T.speak('clamp','Hello.',{strict:true});assert.equal(synths[0].speed,2);
});
test('the first piece of an on-phone voice is short so sound starts sooner, the rest stays whole',async()=>{
 const long='This is the first sentence of the reply and it is fairly long. Here comes the second sentence which is also quite long indeed. And a third one follows it closely behind.';
 const {T,synths}=setup({saved:{horizon_tts_engine:'kokoro'}});assert.equal(await T.speak('ff',long,{strict:true}),true);
 assert.ok(synths.length>=2,JSON.stringify(synths.map(x=>x.text)));assert.ok(synths[0].text.length<=90,synths[0].text);
 assert.equal(synths.map(x=>x.text).join(' ').replace(/\s+/g,' '),long);
});
