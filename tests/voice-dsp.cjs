'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(os.tmpdir(),'horizon-voice-dsp-'));
try{
 const source=fs.readFileSync(path.join(root,'resources/android/java/HorizonVoiceDsp.java'),'utf8').replace('package __APPID__;','package test.voice;');
 const dsp=path.join(dir,'HorizonVoiceDsp.java');fs.writeFileSync(dsp,source);
 let r=cp.spawnSync('javac',['--release','17','-d',dir,dsp,path.join(__dirname,'HorizonVoiceDspTest.java')],{encoding:'utf8'});
 if(r.error)throw r.error;if(r.status!==0)throw Error(r.stdout+r.stderr);
 r=cp.spawnSync('java',['-cp',dir,'test.voice.HorizonVoiceDspTest'],{encoding:'utf8'});
 process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)process.exitCode=r.status;
}finally{fs.rmSync(dir,{recursive:true,force:true});}
