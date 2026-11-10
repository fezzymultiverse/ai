/* Optional local-browser comparison. Not a measurement of Android/Termux device performance. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const baseline=process.env.HORIZON_BASELINE_WWW;
if(!baseline){console.error('Set HORIZON_BASELINE_WWW to an extracted previous www directory.');process.exit(1);}
const roots={before:path.resolve(baseline),after:path.resolve(__dirname,'../www')};
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');const [variant,...parts]=u.pathname.slice(1).split('/');
 if(!roots[variant])return res.writeHead(404).end();
 const file=path.resolve(roots[variant],parts.join('/')||'index.html');if(!file.startsWith(roots[variant]+path.sep))return res.writeHead(403).end();
 fs.readFile(file,(e,b)=>{if(e)return res.writeHead(404).end();res.writeHead(200,{'Content-Type':{'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(b);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({args:['--no-sandbox']});const runs={before:[],after:[]};
 try{
  for(let i=0;i<5;i++)for(const v of i%2?['after','before']:['before','after']){
   const c=await browser.newContext({viewport:{width:412,height:915}});const p=await c.newPage();
   await p.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1:')?r.continue():r.abort());
   const cdp=await c.newCDPSession(p);await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await p.goto('http://127.0.0.1:'+server.address().port+'/'+v+'/',{waitUntil:'load'});await p.waitForTimeout(250);
   runs[v].push(await p.evaluate(()=>{const n=performance.getEntriesByType('navigation')[0],rs=performance.getEntriesByType('resource');return{domContentLoadedMs:Math.round(n.domContentLoadedEventEnd),loadMs:Math.round(n.loadEventEnd),stylesheetRequests:rs.filter(x=>/\.css(?:\?|$)/.test(x.name)).length,resourceCount:rs.length};}));await c.close();
  }
  const median=(xs)=>[...xs].sort((a,b)=>a-b)[Math.floor(xs.length/2)];
  const summary=Object.fromEntries(Object.entries(runs).map(([name,rows])=>[name,Object.fromEntries(Object.keys(rows[0]).map(k=>[k,median(rows.map(r=>r[k]))]))]));
  const result={scope:'Local Chromium, 412x915, 4x CPU throttle, five fresh contexts per build, alternating order, external services blocked. NOT Android/device speed or live API latency.',summary,runs};
  fs.mkdirSync(path.resolve(__dirname,'../validation'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../validation/performance-comparison.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
