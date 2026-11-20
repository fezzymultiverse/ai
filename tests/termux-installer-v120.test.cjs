'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),cp=require('node:child_process');
const root=path.resolve(__dirname,'..');
test('native installer ships the missing PTY runtime and refuses missing or outdated runtime',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'hz-v120-'));
 function put(f,text){const p=path.join(tmp,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,text);}
 function run(...args){return cp.spawnSync('bash',[path.join(root,'scripts/install_native.sh'),...args],{encoding:'utf8',timeout:30000});}
 try{
  put('build.gradle',"buildscript {\n repositories { google(); mavenCentral() }\n dependencies {\n classpath 'com.android.tools.build:gradle:8.7.2'\n }\n}\nallprojects { repositories { google(); mavenCentral() } }\n");
  put('app/build.gradle',"apply plugin: 'com.android.application'\nandroid {\n namespace 'com.example.horizon'\n compileSdk 35\n defaultConfig { minSdk 24 }\n}\ndependencies {\n implementation project(':capacitor-android')\n}\n");
  put('app/capacitor.build.gradle','android { compileOptions { sourceCompatibility JavaVersion.VERSION_21; targetCompatibility JavaVersion.VERSION_21 } }\n');
  put('app/src/main/AndroidManifest.xml','<?xml version="1.0"?><manifest xmlns:android="http://schemas.android.com/apk/res/android">\n<application android:label="Test">\n</application>\n</manifest>\n');
  const install=run(tmp,'--apply');assert.equal(install.status,0,install.stdout+install.stderr);
  const runtime=path.join(tmp,'app/src/main/res/raw/horizon_live.sh');assert.deepEqual(fs.readFileSync(runtime),fs.readFileSync(path.join(root,'android-native/res/raw/horizon_live.sh')));
  const check=run('--check',tmp);assert.equal(check.status,0,check.stdout+check.stderr);
  fs.appendFileSync(runtime,'\n# changed\n');const stale=run('--check',tmp);assert.notEqual(stale.status,0);assert.match(stale.stderr,/outdated Termux live transport/);
  fs.unlinkSync(runtime);const missing=run('--check',tmp);assert.notEqual(missing.status,0);assert.match(missing.stderr,/Termux live transport/);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
