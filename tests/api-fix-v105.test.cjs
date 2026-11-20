const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path'),vm=require('vm');
function load(){const ctx={window:{},setTimeout:(f)=>{f();return 0;},clearTimeout(){},console,URL};ctx.globalThis=ctx;vm.createContext(ctx);
 for(const f of ['horizon_model_inventory.js','horizon_model_policy.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../www',f),'utf8'),ctx);
 return ctx.window.HorizonModelPolicy||ctx.HorizonModelPolicy;}
const P=load();
const resp=(status,body)=>({ok:status>=200&&status<300,status,json:async()=>body});
const prov=(o)=>Object.assign({name:'T',headers:k=>({Authorization:'Bearer '+k}),chatUrl:'https://x/y',modelsUrl:'https://x/m',fallbackModels:['m1','m2'],defaultModel:'m1'},o||{});
const ok={choices:[{message:{content:'OK'}}]};
test('free.ai qwen3-8b served by Qwen3-30B is accepted, a different family is refused',()=>{
 P.assertModel('freeai','qwen3-8b','Qwen/Qwen3-30B-A3B-Instruct');
 assert.throws(()=>P.assertModel('freeai','qwen3-8b','llama-3-8b'),/substitution/);
 assert.throws(()=>P.assertModel('groq','qwen3-8b','Qwen/Qwen3-30B-A3B-Instruct'),/substitution/);
});
test('rate-limited everywhere gives a soft error and stops after two 429s',async()=>{
 let n=0;const f=async(u)=>{if(/\/m$/.test(u))return resp(200,{data:[{id:'a'},{id:'b'},{id:'c'},{id:'d'}]});n++;return resp(429,{});};
 await assert.rejects(()=>P.discover('xx',prov(),'k',f),e=>e.soft===true&&/rate-limited/.test(e.why));
 assert.equal(n,2);
});
test('401 on probe stops at once and is a hard key rejection',async()=>{
 let n=0;const f=async(u)=>{if(/\/m$/.test(u))return resp(200,{data:[{id:'a'},{id:'b'}]});n++;return resp(401,{error:{message:'bad key'}});};
 await assert.rejects(()=>P.discover('xx',prov(),'k',f),e=>e.hard===true&&!e.soft&&e.status===401);
 assert.equal(n,1);
});
test('catalogue 401 on a modelsOptional provider falls through to the probe (Agnes case)',async()=>{
 const f=async(u)=>{if(/\/m$/.test(u))return resp(401,{});return resp(200,ok);};
 const out=await P.discover('agnes',prov({modelsOptional:true,fallbackModels:['agnes-3.0-flash']}),'k',f);
 assert.ok(Array.from(out).includes('agnes-3.0-flash'));
});
test('catalogue timeout does not block a key that answers',async()=>{
 const f=async(u)=>{if(/\/m$/.test(u)){const e=new Error('Request timed out');throw e;}return resp(200,ok);};
 const out=await P.discover('xx',prov(),'k',f);assert.ok(out.length>=1);
});
test('checkKey: OpenRouter uses the cheap auth endpoint',async()=>{
 const seen=[];const f=async(u)=>{seen.push(u);return resp(200,{data:{}});};
 const r=await P.checkKey('openrouter',prov(),'k',f,'m');assert.equal(r.c,'live');assert.equal(seen.length,1);assert.match(seen[0],/auth\/key$/);
 const bad=await P.checkKey('openrouter',prov(),'k',async()=>resp(401,{}));assert.equal(bad.t,'REJECTED');
});
