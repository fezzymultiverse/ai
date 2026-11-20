const fs=require('fs'),vm=require('vm'),path=require('path');
const src=fs.readFileSync(process.argv[2]||path.join(__dirname,'..','www','horizon_net.js'),'utf8');   // runs under `node --test` (no argv) and by hand (path)
function load(cap){const w={Capacitor:cap,URL,Response,AbortController,setTimeout,clearTimeout,fetch:async()=>new Response('{"via":"fetch"}',{status:200}),console};w.window=w;vm.runInNewContext(src,w);return w.HorizonNet;}
let fail=0;const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m);if(!c)fail++;};
(async()=>{
 const seen=[];
 const http={request:async s=>{seen.push(s);
   if(s.url.includes('m=204'))return{status:204,data:'',headers:{}};
   if(s.url.includes('m=boom'))throw new Error('Cleartext HTTP traffic to 127.0.0.1 not permitted');
   if(s.url.includes('m=obj'))return{status:200,data:{a:1},headers:{'Content-Type':'application/json'}};
   return{status:429,data:'{"error":"rate"}',headers:{'content-type':'application/json'}};}};
 const N=load({isNativePlatform:()=>true,Plugins:{CapacitorHttp:http}});
 ok(N.accepts('https://ai-gateway.kilo.ai/api/v1/chat/completions'),'kilo accepted');
 ok(!N.accepts('https://evil.example/v1/chat/completions'),'unknown host rejected');
 ok(!N.accepts('http://127.0.0.1:1338/v1/models'),'wrong loopback port rejected');
 ok(N.accepts('http://127.0.0.1:1337/v1/models'),'loopback 1337 accepted');
 let r=await N.request('https://ch.at/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer free'},body:'{"x":1}'});
 ok(r.status===429&&(await r.json()).error==='rate','non-2xx status + body pass through');
 ok(seen[0].data&&seen[0].data.x===1&&!('Authorization' in seen[0].headers)&&seen[0].disableRedirects===true&&seen[0].method==='POST','json body parsed, fake auth stripped, redirects off');
 r=await N.request('https://ch.at/v1/models?m=204',{});ok(r.status===204&&(await r.text())==='','204 builds a Response without throwing (old code threw)');
 ok(!('data' in seen[1]),'GET sends no data');
 r=await N.request('https://ch.at/v1/models?m=obj',{});ok((await r.json()).a===1,'object data re-serialised');
 try{await N.request('http://127.0.0.1:1337/v1/models?m=boom',{});ok(false,'should throw');}catch(e){ok(/blocked plain HTTP/.test(e.message)&&e.network===true,'cleartext error explained: '+e.message.slice(0,50));}
 const F=load({isNativePlatform:()=>false});
 r=await F.request('https://ch.at/v1/models',{});ok((await r.json()).via==='fetch','browser falls back to fetch');
 // plugin only reachable through registerPlugin
 let regCalls=0;const G=load({isNativePlatform:()=>true,Plugins:{},registerPlugin:n=>{regCalls++;return http;}});
 r=await G.request('https://ch.at/v1/models?m=obj',{});ok(regCalls===1&&(await r.json()).a===1,'registerPlugin fallback used once');
 console.log(fail?'FAILED '+fail:'ALL PASS');process.exit(fail?1:0);
})();
