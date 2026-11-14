'use strict';
// Optional connectivity check. Contacts public APIs; never includes keys or logs IP response values.
const fs=require('node:fs'),path=require('node:path');
const api=require('../www/horizon_public.js');
(async()=>{
 const results=await Promise.all([['weather','Cape Town, South Africa'],['news','open source'],['ip','self']].map(async([kind,arg])=>{const start=Date.now(),r=await api.run(kind,arg);return{kind,ok:!r.text.startsWith('ERROR:'),sourceCount:r.urls.length,elapsedMs:Date.now()-start,error:r.text.startsWith('ERROR:')?r.text:undefined};}));
 const modelEndpoints=await Promise.all(['https://api.llm7.io/v1/models','https://text.pollinations.ai/models'].map(async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(10000),redirect:'error'});const j=await r.json();const list=Array.isArray(j)?j:j.data||j.models||[];return{url,status:r.status,modelCount:Array.isArray(list)?list.length:0,chatGenerationTested:false};}catch(e){return{url,ok:false,error:e.message,chatGenerationTested:false};}}));
 const report={scope:'Live public-service connectivity from audit host, not physical Android or paid-provider account validation. No IP values retained.',results,modelEndpoints};
 fs.mkdirSync(path.resolve(__dirname,'../audit-results'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../audit-results/public-live.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
