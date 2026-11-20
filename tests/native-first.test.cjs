// V1.99.47: deterministic tool contracts/routing, no external accounts or phone required.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, 'www', name), 'utf8');
const html = read('index.html');
function context(extra = {}) {
  const store = new Map();
  const c = { console, setTimeout, clearTimeout, setInterval, clearInterval, Date, URL, navigator: {}, document: { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, readyState: 'loading' }, addEventListener() {}, dispatchEvent() {}, localStorage: { getItem: k => store.get(k) ?? null, setItem: (k,v) => store.set(k,String(v)) }, ...extra };
  c.window = c; vm.createContext(c); return { c, store };
}
function load(c, name) { vm.runInContext(read(name), c, { filename: name }); }
function fn(name) {
  const a = html.indexOf('        ' + (html.includes('        async function ' + name + '(') ? 'async ' : '') + 'function ' + name + '(');
  assert.notEqual(a, -1, name);
  return html.slice(a, html.indexOf('\n        }', a) + '\n        }'.length);
}
function policy(extra = {}) {
  const {c, store} = context({ HorizonMusic: { seesAi: () => true, block: () => 'Library: 3 songs.\nNOW PLAYING (playing): Test Song - Artist' }, HorizonLyrics: {}, HorizonDash: {}, HorizonBridges: {state: () => ({termux: {enabled:true,permission:true,aiEnabled:true}})}, ...extra });
  load(c, 'horizon_toolpolicy.js'); return {c,store};
}
for (const lite of [false, true]) test(`native-first contract is complete (${lite ? 'lite/keyless' : 'full'})`, () => {
  const {c} = policy(); const out = c.HorizonToolPolicy.block({lite,yt:true,files:true,web:true,webSearch:true,webScrape:true});
  for (const word of ['GOLDEN RULE','NewPipe','yt.search','yt.play','yt.queue','yt.download','music.queue','lyrics.show','alarm.set','calendar.add','img.search','img.save','get.url','web.search','web.scrape','RUN','free -h','top -b -n 1','yt-dlp -x --audio-format mp3']) assert.ok(out.includes(word), word);
  assert.match(out, /untrusted data/);
  assert.match(out, /4K/);
  if(lite) { assert.ok(out.length < 6000, `compact contract is ${out.length} chars`); assert.match(out,/NOW PLAYING.*Test Song/); }
});
test('disabled tool schemas are not advertised as live; native permissions independent of Web', () => {
  const {c} = policy({HorizonMusic: {seesAi: () => false}});
  const out = c.HorizonToolPolicy.block({lite:true,yt:false,files:false,web:false});
  assert.match(out,/YOUTUBE OFF/); assert.match(out,/FILE ACCESS OFF/); assert.match(out,/LOCAL MUSIC HIDDEN/);
  assert.ok(!out.includes('[[yt.search:')); assert.ok(!out.includes('[[img.save:'));
  assert.match(out,/\[\[alarm.set:/); assert.match(out,/\[\[lyrics.show\]\]/);
});
test('only real Web operations are advertised to lite models', () => {
  const {c} = policy(); const out=c.HorizonToolPolicy.block({lite:true,web:true,webScrape:true});
  assert.ok(out.includes('[[web.scrape:')); assert.ok(!out.includes('[[web.search:'));
});
test('shared full/lite prompt builders inject the contract without truncating schemas', () => {
  const {c} = policy();
  Object.assign(c, { lsGet: () => '', eyesSys: '', LITE_SOUL: 'You are HORIZON (test persona).', LS:{persona:'ps',prefs:'p',filesOn:'f'}, chatYtOn: () => true, enabledWeb: () => [], liveCtx:{prov:'pollinations'}, groupBlock: () => '', getPersona: () => 'Persona', memoryBlock: () => '', toolsBlock: () => 'Web off', ytBlock: () => '', ghBlock: () => '', pdfBlock: () => '', state:{thinkOn:false} });
  c.HorizonLyrics.block = () => ''; c.HorizonMusic.block = () => ''; c.HorizonBridges.block = () => ''; c.HorizonDash.block = () => '';
  for (const name of ['nativeToolContract','liteSoul','personaHold','getLitePrompt','getSystemPrompt']) vm.runInContext(fn(name),c);
  assert.match(c.getLitePrompt(), /HORIZON NATIVE-FIRST/); assert.match(c.getSystemPrompt(), /HORIZON NATIVE-FIRST/);
  assert.match(c.getLitePrompt(), /\[\[alarm.set:/); assert.match(c.getLitePrompt(), /\[\[yt.queue:/);
  assert.ok(!/cut\(Horizon(?:Music|Lyrics|Bridges)\.block/.test(html));
});
test('all provider protocols retain shared prompts without model walking', () => {
  assert.match(html,/body\.systemInstruction = \{parts:\[\{text:getSystemPrompt\(\)/);
  assert.match(html,/const promptForModel = \(\) => .*getLitePrompt\(\) : getSystemPrompt\(\)/);
  assert.match(html,/const sys = promptForModel\(\)/);
  assert.match(html,/body\.system = sys/);
  assert.match(html,/messages: \[\{ role: 'system', content: sys \}\]/);
  assert.ok(html.indexOf('horizon_toolpolicy.js') < html.indexOf('const PROVIDERS'));
});
test('native-action Web guard blocks actions, not research or scraper programming', () => {
  const {c} = policy();
  for(const s of ['Play Bohemian Rhapsody','Please play my playlist','Show me the lyrics','Download this audio','Save the song','Wake me up at 7','Set an alarm at 8']) assert.equal(c.HorizonToolPolicy.requiresNative(s),true,s);
  for(const s of ['Research the history of this song','Find music industry news','Scrape this public article','Write a script to scrape music metadata']) assert.equal(c.HorizonToolPolicy.requiresNative(s),false,s);
  assert.match(html,/Web was NOT called/);
});
test('NewPipe search uses native first and never silently starts Termux', async () => {
  const order=[]; const {c}=context({NATIVE:true,plug: () => ({search: async () => {order.push('newpipe');return {items:[{id:'abcdefghijk'}]};}}),ytTryDirect: async () => {order.push('app');return {items:[]};},ytFail: () => new Error('native failed')});
  vm.runInContext(fn('ytSearch'),c); const r=await c.ytSearch('song'); assert.equal(r.items[0].id,'abcdefghijk'); assert.deepEqual(order,['newpipe']);
  c.plug = () => ({search: async () => {throw Error('extractor failure');}}); c.ytTryDirect=async()=>null;
  await assert.rejects(c.ytSearch('song'),/native failed/);
  assert.ok(!/ytTermuxSearch|HorizonBridges\.youtube(?:Search|Download)/.test(html));
});
test('old automatic Termux fallback implementations were removed, not duplicated', () => {
  const b=read('horizon_bridges.js'); assert.ok(!/function youtube(?:Download|Search)/.test(b));
  assert.match(b,/kind === 'termux.run'.*not executed/);
  assert.ok(!read('horizon_termai.js').includes('st.run'));
  assert.match(read('horizon_runlog.js'),/top -b -n 1/);
});
test('native queue appends without playing, and uses the existing player', () => {
  class Audio { constructor(){this.paused=true;this.currentTime=0;} addEventListener(){} removeEventListener(){} play(){throw Error('queue must NOT call play');} }
  const {c}=context({Audio}); load(c,'horizon_music.js');
  assert.equal(typeof c.HorizonMusic.queueRemote,'function');
  const r=c.HorizonMusic.queueRemote({id:'abcdefghijk',title:'Queued Song',url:'https://example.invalid/audio'});
  assert.equal(r.ok,true); assert.equal(r.title,'Queued Song'); assert.equal(c.HorizonMusic.nowInfo(),null);
  assert.match(c.HorizonMusic.block(),/Library: 1 songs/);
  assert.match(html,/kind === 'yt.play' \|\| kind === 'yt.queue'/);
});
function dash(options={}) {
  const calls=[]; const {c,store}=context();
  if(options.plugin!==false) c.Capacitor={Plugins:{HorizonAlarm:{schedule: async args => {calls.push(args); if(options.throw) throw Error('unavailable'); return options.result || {ok:true};}}}};
  if(options.notify) c.__testHost={notify(){}, notice(){}};
  if(options.blockStorage) c.localStorage.setItem=()=>{throw Error('full');};
  vm.runInContext(read('horizon_dash.js').replace('var H = null;', 'var H = window.__testHost || null;'),c);
  return {c,store,calls};
}
test('alarm.set and calendar.add parse correctly; fenced examples do not execute',()=>{
  const {c}=dash(); const d=c.HorizonDash;
  const calls=d.parse('[[alarm.set: 2099-04-12 | 07:30 | Wake]]\n[[calendar.add: 2099-04-12 | 15:00 | Meeting | remind]]');
  assert.equal(calls.length,2); assert.equal(calls[0].kind,'alarm.set'); assert.equal(calls[1].kind,'calendar.add');
  assert.equal(d.parse('```text\n[[alarm.set: 2099-04-12 | 07:30 | Example]]\n```').length,0);
});
test('wake alarm waits for native confirmation and returns exact local date/time',async()=>{
  const {c,store,calls}=dash(); const r=await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake me');
  assert.match(r.text,/Native wake alarm scheduled: 2099-04-12 07:30 local phone time/);
  assert.equal(calls.length,1); assert.equal(calls[0].mode,'alarm');
  assert.equal(JSON.parse(store.get('horizon_dash_notes')).length,1);
});
test('calendar reminders use remind mode, plain events do not schedule a native notification',async()=>{
  const {c,calls}=dash();
  const r=await c.HorizonDash.run('calendar.add','2099-04-12 | 15:00 | Meeting | remind');
  assert.match(r.text,/Native reminder scheduled/); assert.equal(calls[0].mode,'remind');
  const p=await c.HorizonDash.run('calendar.add','2099-04-13 | - | Day note');
  assert.match(p.text,/Added to Horizon calendar/); assert.equal(calls.length,1);
});
test('retry is idempotent: same calendar row and Android id',async()=>{
  const {c,store,calls}=dash();
  await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  assert.equal(JSON.parse(store.get('horizon_dash_notes')).length,1); assert.equal(calls[0].id,calls[1].id);
});
test('calendar/alarm mode conflict is reported instead of pretending an existing note is an alarm',async()=>{
  const {c,calls}=dash();
  await c.HorizonDash.run('calendar.add','2099-04-12 | 07:30 | Wake');
  const r=await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  assert.match(r.text,/ERROR: a different item already exists/); assert.equal(calls.length,0);
});
for(const arg of ['2099-02-30 | 07:30 | Wake','2099-04-12 | 25:00 | Wake','2099-04-12 | - | Wake','2099-04-12 | 07:30 |','2020-01-01 | 07:30 | Wake','2099-04-12 | 07:30 | Wake | alarm']) test('invalid alarm is not persisted: '+arg,async()=>{
  const {c,store,calls}=dash(); const r=await c.HorizonDash.run('alarm.set',arg);
  assert.match(r.text,/^ERROR:/); assert.equal(calls.length,0); assert.ok(!store.has('horizon_dash_notes'));
});
test('native refusal, missing native service, and inexact timing are never fake success',async()=>{
  const no=dash({result:{ok:false}}); assert.match((await no.c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake')).text,/NOT confirmed/);
  const missing=dash({plugin:false}); assert.match((await missing.c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake')).text,/NOT confirmed/);
  const inexact=dash({result:{ok:true,exact:false}}); assert.match((await inexact.c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake')).text,/Exact timing is not allowed/);
});
test('notification-only fallback is explicitly labelled, never a native wake alarm',async()=>{
  const {c}=dash({plugin:false,notify:true}); const r=await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  assert.match(r.text,/Notification-only fallback.*NOT a native wake alarm/);
});
test('blocked storage cannot claim scheduling success',async()=>{
  const {c,calls}=dash({blockStorage:true}); const r=await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  assert.match(r.text,/storage rejected/); assert.equal(calls.length,0);
});
test('main and terminal chat use manual RUN controls and real results',()=>{
  assert.match(html,/fam === 'bash'/); assert.match(html,/run\.textContent = 'RUN'/); assert.match(html,/HorizonBridges\.termux\(raw, 600000, true\)/);
  const t=read('horizon_termai.js'); assert.match(t,/tap RUN/); assert.match(t,/st\.hist\.push\(\{ role: 'user', text: msg \}\)/);
  assert.ok(!/await runBlock\(first\.code\)/.test(t));
});

test('real Termux results are scoped to one chat and labelled reference-only', () => {
  const {c}=policy();
  c.HorizonToolPolicy.recordRun('chat-one','free -h','exit 0\nactual-output');
  assert.match(c.HorizonToolPolicy.block({chatId:'chat-one'}),/LAST USER-RUN TERMUX RESULT[\s\S]*actual-output/);
  assert.ok(!c.HorizonToolPolicy.block({chatId:'chat-two'}).includes('actual-output'));
  assert.match(c.HorizonToolPolicy.block({chatId:'chat-one'}),/Reference only, not a new request/);
});
test('failed native alarms are not advertised as active in upcoming prompt state', async () => {
  const {c,store}=dash({result:{ok:false}});
  await c.HorizonDash.run('alarm.set','2099-04-12 | 07:30 | Wake');
  assert.equal(JSON.parse(store.get('horizon_dash_notes'))[0].delivery,'failed');
  // The production upcoming-state formatter must preserve this distinction.
  assert.match(read('horizon_dash.js'),/native scheduling NOT confirmed/);
});
