'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const code=fs.readFileSync(path.join(__dirname,'../www/horizon_bridges.js'),'utf8');
function fixture(){
 const bus=new EventTarget(),events=[],inputs=[],scheduled=[],intervals=[];
 const plugin={status:async()=>({enabled:true,installed:true,permission:true}),executeLive:async o=>{events.push(o);return {jobId:'test-job'};},liveInput:async d=>{inputs.push(d);},liveKill:async()=>{},result:async()=>({status:'submitted'})};
 const c={console,Date,Promise,JSON,Math,CustomEvent,Event,localStorage:{getItem:()=>null},Capacitor:{isNativePlatform:()=>true,Plugins:{HorizonTermux:plugin}},document:{hidden:false,readyState:'loading',addEventListener(){},getElementById(){return null;}},addEventListener:bus.addEventListener.bind(bus),dispatchEvent:bus.dispatchEvent.bind(bus),setTimeout:(fn,ms)=>{scheduled.push({fn,ms});return scheduled.length;},clearTimeout(){},setInterval:(fn,ms)=>{intervals.push({fn,ms});return intervals.length;},clearInterval(){}};
 c.window=c;vm.createContext(c);vm.runInContext(code,c);
 const send=(id,ev)=>bus.dispatchEvent(new CustomEvent('horizon-termux-live',{detail:{id,ev}}));
 return {c,plugin,events,inputs,scheduled,intervals,send};
}
const tick=()=>new Promise(r=>setImmediate(r));
test('bridge preserves original multiline command and sends stdin; manual runs have no forced cutoff',async()=>{
 const f=fixture(),command="printf '%s\\n' 'a b'\n# exact paste\ntrue\n";
 const pending=f.c.HorizonBridges.termux(command,600000,false,{cwd:'/real folder'});await tick();
 assert.equal(f.events[0].cmd,command);assert.equal(f.events[0].cwd,'/real folder');assert.equal(f.events[0].trace,false);assert.equal(f.scheduled.some(x=>x.ms===600000),false);
 await f.c.HorizonBridges.input('日本語 secret\n');assert.equal(f.inputs[0].text,'日本語 secret\n');
 f.send('test-job',[{t:'O',d:'X'.repeat(100000)+'TAIL'},{t:'C',d:'/next folder'},{t:'X',d:'7'}]);const result=await pending;
 assert.equal(result.exitCode,7);assert.equal(result.cwd,'/next folder');assert.equal(result.stdout.length,100004);assert.equal(f.c.HorizonBridges.busy(),false);
});
test('early live frames are retained until executeLive resolves; concurrent commands are refused',async()=>{
 const f=fixture();let release;f.plugin.executeLive=()=>new Promise(r=>{release=r;});const pending=f.c.HorizonBridges.termux('echo early');
 await assert.rejects(f.c.HorizonBridges.termux('echo second'),/still pending/);
 f.send('early-job',[{t:'O',d:'early bytes\n'},{t:'C',d:'/cwd'},{t:'X',d:'0'}]);release({jobId:'early-job'});
 const result=await pending;assert.equal(result.stdout,'early bytes\n');assert.equal(result.exitCode,0);assert.equal(f.c.HorizonBridges.busy(),false);
});
