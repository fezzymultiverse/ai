'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=n=>fs.readFileSync(path.join(root,'www',n),'utf8');
function studio(storage=new Map()) {
 const win={URL,Blob,setTimeout,clearTimeout,document:{currentScript:{src:'https://horizon.test/horizon_studio.js'}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)}};win.window=win;vm.createContext(win);vm.runInContext(read('horizon_studio.js'),win);return win.HorizonStudio;
}
test('V129: About preserves logo/developer, removes release-history DOM, and exposes scoped studio',()=>{
 const s=read('horizon_about.js'),html=read('index.html');assert.match(s,/img.src = 'icon.png'/);assert.match(s,/Developer: Grant Phil Festers/);assert.match(s,/independent, self-funded app/);assert.match(s,/WHAT HORIZON CAN DO/);assert.doesNotMatch(s,/var LOG =|sec\('CHANGELOG'\)/);assert.match(s,/Keyless instrumental studio/);assert.match(html,/horizon_studio.js\?v=1.99.\d+/);assert.match(s,/MP3 saved to Downloads/);assert.doesNotMatch(s,/Open Keyless Studio & Playlists/);
});
test('V129: playlist parser uses one JSON call and ignores fenced examples',()=>{
 const s=studio();assert.equal(s.parse('[[playlist.create: {"name":"Mix","tracks":["One","Two"]}]]')[0].kind,'playlist.create');assert.equal(s.parse('```text\n[[playlist.play: Mix]]\n```').length,0);assert.equal(s.parse('[[studio.open]]')[0].kind,'studio.open');
});
test('V129: playlist validation rejects empty/oversized lists, empty tracks and missing local ids',()=>{
 const s=studio();for(const def of [null,{}, {name:'x',tracks:[]},{name:'x',tracks:['  ']},{name:'x',tracks:Array(31).fill('x')},{name:'x',tracks:[{source:'local'}]}])assert.throws(()=>s.create(def));
});
test('V129: saved playlists survive a reload, preserve order and never overwrite by name',()=>{
 const storage=new Map(),s=studio(storage);s.create({name:'Order',tracks:['First','Second',{source:'local',id:'m3'}]});assert.deepEqual(Array.from(studio(storage).get('ORDER').tracks,t=>t.query||t.id),['First','Second','m3']);assert.throws(()=>s.create({name:'order',tracks:['Other']}),/already exists/);
});
test('V129: failed local storage writes do not report saved',async()=>{
 const s=studio();assert.match((await s.run('playlist.create','{"name":"Good","tracks":["Song"]}')).text,/Saved playlist/);assert.match((await s.run('playlist.create','not json')).text,/ERROR/);assert.throws(()=>s.get('missing'),/not found/);
});
test('V129: starting a playlist isolates its first confirmed track then appends in order',async()=>{
 const s=studio(),calls=[];s.create({name:'Mix',tracks:['First','Second','Third']});s.init({isolatePlaylist:()=>calls.push('isolate'),track:async(t,q)=>{calls.push((q?'queue:':'play:')+t.query);return{text:q?'Queued: track':'Playing: track'};}});const r=await s.play('Mix');assert.deepEqual(calls,['play:First','isolate','queue:Second','queue:Third']);assert.match(r.text,/2 queued/);
});
test('V129: playlist preparation is serialized and cancellation cannot enqueue remaining tracks',async()=>{
 const s=studio();s.create({name:'Mix',tracks:['One','Two']});let finish,calls=0;s.init({track:()=>{calls++;return new Promise(r=>{finish=r;});}});const first=s.play('Mix');await assert.rejects(s.play('Mix'),/already/);s.stopPlaylist();finish({text:'Started: first'});assert.match((await first).text,/CANCELLED/);assert.equal(calls,1);
});
test('V129: failed or ambiguous tracks do not result in false completion',async()=>{
 const s=studio();s.create({name:'Mix',tracks:['One','Two']});s.init({track:async()=>({text:'NEEDS CHOICE: Pick a track'})});assert.match((await s.play('Mix')).text,/ERROR:.*0\/2/);
});
test('V129: playlist names cannot be consumed by the simple song matcher and queue intent survives resolution',()=>{
 const html=read('index.html');assert.match(html,/lyrics\?\|playlist/);assert.match(html,/ytAutoPlay\(parts.join\(' '\).trim\(\), queueOnly\)/);assert.match(html,/ytPlayTool\(b.it.id \+ '\|' \+ b.it.title, !!queueOnly\)/);assert.match(read('horizon_music.js'),/function isolatePlaylist\(\)/);assert.match(read('horizon_music.js'),/queue.push\(t.id\); paintLib/);
});
test('V129: generation and downloads remain explicit, with no new remote generation credentials',()=>{
 const s=read('horizon_studio.js'),w=read('horizon_studio_worker.js');assert.doesNotMatch(s,/\bfetch\s*\(|XMLHttpRequest/);assert.doesNotMatch(w,/\bfetch\s*\(|XMLHttpRequest/);assert.match(s,/new Worker/);assert.match(s,/HorizonOutputs.saveBlob/);assert.match(s,/Nothing is saved yet/);assert.match(s,/v.network === false/);
});
test('V129: worker renders deterministic valid WAV bytes and bounds requested lengths',()=>{
 const run=opts=>{let out;const w={self:{postMessage:d=>{out=d;}}};vm.createContext(w);vm.runInContext(read('horizon_studio_worker.js'),w);w.self.onmessage({data:opts});return out;};
 const one=run({title:'A',style:'electronic',seconds:1,bpm:100}),two=run({title:'A',style:'electronic',seconds:1,bpm:100});assert.equal(one.seconds,5);const b=Buffer.from(one.buffer);assert.equal(b.toString('ascii',0,4),'RIFF');assert.equal(b.toString('ascii',8,12),'WAVE');assert.equal(b.readUInt32LE(24),44100);assert.equal(b.length,441044);assert.deepEqual(b,Buffer.from(two.buffer));
});
test('V129: decoration loops yield in every editor and viewer observers ignore streaming text',()=>{
 for(const file of ['horizon_viz.js','horizon_lyrics.js','horizon_htmlview.js','horizon_mdview.js','horizon_docview.js','horizon_people.js'])assert.match(read(file),/hzEditorFocused/,file);
 for(const file of ['horizon_htmlview.js','horizon_mdview.js','horizon_docview.js'])assert.match(read(file),/n.nodeType === 1 && \(n.matches/,file);
 assert.match(read('horizon_perf.js'),/wasEditing && !editing/);
});
