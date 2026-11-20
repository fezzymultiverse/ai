'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),html=read('www/index.html');
function setup(response){
 const calls=[],s={console,Response,setTimeout,clearTimeout,Set,Map,Date,curTurn:{cancelled:false},turnCheck:()=>{},state:{models:{},keys:{},modelLists:{cloudflare:['@cf/meta/llama-3.1-8b-instruct-fp8','@cf/deepseek-ai/not-real']}},PROVIDERS:{},PROVIDER_IDS:['cloudflare'],docMode:'',isLiteTarget:()=>false,getSystemPrompt:()=>'test',getLitePrompt:()=>'test',noteUsage:()=>{},noteCut:()=>{},timed:p=>p,lsSet:()=>{},LS:{model:id=>id},notice:()=>{},setLoading:()=>{},errorText:async r=>{const j=await r.json();return j.errors?.[0]?.message||j.error?.message||'error';},aiFetch:async(url,o)=>{calls.push({url,...o});return response(url,o,calls);}};
 s.window=s;vm.createContext(s);
 vm.runInContext(read('www/horizon_model_inventory.js')+'\n'+read('www/horizon_model_policy.js'),s);
 const a=html.indexOf('        const oaiGateway = cfg => ({'),b=html.indexOf('        PROVIDERS.routeway =',a);
 vm.runInContext(html.slice(a,b)+';this.make=oaiGateway;',s);
 const c=html.indexOf('        const cfParts ='),d=html.indexOf('        // V1.93.3: SambaNova and NVIDIA NIM removed.',c);
 vm.runInContext(html.slice(c,d),s);return {p:s.PROVIDERS.cloudflare,s,calls};
}
const answer=()=>new Response(JSON.stringify({model:'@cf/meta/llama-3.1-8b-instruct-fp8',choices:[{message:{content:'Hello'},finish_reason:'stop'}]}),{status:200});
test('Cloudflare account path, token split and exact selected model',async()=>{
 const {p,calls}=setup(()=>answer());const acct='a'.repeat(32),token='T'.repeat(30);
 assert.equal(p.wrongKey('bad').includes('Account ID'),true);
 assert.equal(await p.chat(acct+':'+token,p.defaultModel,[]),'Hello');
 assert.equal(calls.length,1);const sent=calls[0],body=JSON.parse(sent.body);
 assert.equal(sent.url,'https://api.cloudflare.com/client/v4/accounts/'+acct+'/ai/v1/chat/completions');
 assert.equal(sent.headers.Authorization,'Bearer '+token);assert.equal(body.model,p.defaultModel);assert.equal(body.options.rejectIfBusy,true);
});
test('Cloudflare model-specific 403 never tries another model',async()=>{
 const {p,calls,s}=setup(()=>new Response(JSON.stringify({errors:[{message:'Model is not supported'}]}),{status:403}));
 await assert.rejects(()=>p.chat('b'.repeat(32)+':'+'Q'.repeat(25),p.defaultModel,[]),/HTTP 403/);
 assert.equal(calls.length,1);assert.equal(s.state.models.cloudflare,undefined);
});
test('Cloudflare permission 403 is actionable without retry or model walk',async()=>{
 const {p,calls}=setup(()=>new Response(JSON.stringify({errors:[{message:'Authentication token permission denied'}]}),{status:403}));
 await assert.rejects(()=>p.chat('b'.repeat(32)+':'+'Q'.repeat(25),p.defaultModel,[]),/Workers AI permission/);assert.equal(calls.length,1);
});
test('Cloudflare invalid credential format causes no request',async()=>{
 const {p,calls}=setup(()=>answer());await assert.rejects(()=>p.chat('free',p.defaultModel,[]),/Account ID/);assert.equal(calls.length,0);
});
test('Unknown selected model is rejected before any network request',async()=>{
 const {p,calls}=setup(()=>answer());await assert.rejects(()=>p.chat('b'.repeat(32)+':'+'Q'.repeat(25),'@cf/not-in-the-list',[]),/Nothing was switched/);assert.equal(calls.length,0);
});
test('Scoped transport accepts documented APIs but rejects credentials, arbitrary ports and host tricks',()=>{
 const s={window:null,URL,Response,setTimeout,clearTimeout,AbortController};s.window=s;vm.createContext(s);vm.runInContext(read('www/horizon_net.js'),s);
 for(const u of ['https://ch.at/v1/models','http://127.0.0.1:1337/v1/chat/completions','https://ai-gateway.kilo.ai/api/v1/models'])assert.equal(s.HorizonNet.accepts(u),true,u);
 for(const u of ['https://ch.at.evil.org/v1/models','https://ch.at:9000/v1/models','http://ch.at/v1/models','https://u:p@ch.at/v1/models','http://10.0.0.1/v1/models','https://ch.at/api/admin','https://g4f.space/api/groq/models'])assert.equal(s.HorizonNet.accepts(u),false,u);
});
test('Navigation segment projection measures perpendicular distance and along-route progress',()=>{
 const s={window:null,document:{getElementById:()=>null,querySelector:()=>null},localStorage:{getItem:()=>null,setItem:()=>{}},setTimeout,clearTimeout};s.window=s;vm.createContext(s);vm.runInContext(read('www/horizon_maps.js'),s);
 const p=s.HorizonMaps._t.projectRoute({lat:.0001,lon:.0005},[[0,0],[0,.001],[.001,.001]]);assert.ok(p.distance>10&&p.distance<12);assert.ok(p.along>54&&p.along<57);assert.equal(s.HorizonMaps._t.poiCategory('robotics'),'Robotics / electronics');
});
test('RSS tags are parsed by the same chat dispatcher and excluded from fenced examples',()=>{
 const s={window:null,document:{getElementById:()=>null,querySelector:()=>null},setTimeout,clearTimeout,localStorage:{getItem:()=>null,setItem:()=>{}},Date,console};s.window=s;vm.createContext(s);vm.runInContext(read('www/horizon_dash.js'),s);
 assert.equal(s.HorizonDash.parse('[[rss.read: all | 10]]')[0].kind,'rss.read');assert.equal(s.HorizonDash.parse('```text\n[[rss.read: all]]\n```').length,0);
});
test('No public Nominatim requests and no generated payment negotiation',()=>{
 const maps=read('www/horizon_maps.js'),net=read('www/horizon_net.js');assert.match(maps,/if \(autocomplete\) throw e;/,'Nominatim is a backup for real searches only, never type-ahead (V1.99.68)');assert.ok(!net.includes('X-PAYMENT'));assert.match(html,/const autoOn = \(\) => false/);assert.ok(!html.includes('for (const other of RESCUE_ORDER)'));
});
