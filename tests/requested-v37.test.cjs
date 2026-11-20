'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
test('V37: overlay containers leave the clipped chat layout and use a viewport',()=>{
 assert.match(read('www/index.html'),/\[overlay, leftPanel, rightPanel\].forEach\(el => document.body.appendChild\(el\)\)/);
 assert.match(read('www/horizon_app.css'),/body > \.panel \{ position:fixed!important/);
});
test('V37: queued People context reaches provider history rather than being a decorative label',()=>{
 const html=read('www/index.html');assert.match(html,/runTurn\(chat, p, key, model, text\)/);
 assert.match(html,/isPeopleChat\(chat\) && turnPrompt \? \[\{role:'user', text:turnPrompt\}\]/);
 assert.match(html,/const question = String\(text \|\| ''\).split\('\\n\\n\[Room context, for you only\]'/);
});
test('V37: room context is not silently cut to 700 characters or 40 messages',()=>{
 const js=read('www/horizon_people.js'),prompt=js.slice(js.indexOf('function awarePrompt('),js.indexOf('function guestOn('));
 assert.doesNotMatch(prompt,/slice\(0, 700\)|slice\(-40\)/);
});
test('V37: one reply-first decision per group round',()=>{
 const html=read('www/index.html'),body=html.slice(html.indexOf('async function runTargetsRound('),html.indexOf('// V1.61.0: DEBATE'));
 assert.equal((body.match(/HorizonPeople.beforeAI\(chat\)/g)||[]).length,1);
 assert.ok(body.indexOf('HorizonPeople.beforeAI(chat)')<body.indexOf('for (let i = 0; i < targets.length; i++)'));
});
test('V37: pause, permission state, full snapshot and sample table are actual controls',()=>{
 const js=read('www/horizon_stats.js');assert.match(js,/hzsInterval/);assert.match(js,/schemaVersion: 2/);assert.match(js,/browser: browserSnapshot\(\)/);assert.match(js,/permissions\.query\(\{name:name\}\)/);assert.match(js,/if \(!opened \|\| paused \|\| doc.hidden\) return/);assert.doesNotMatch(js,/10 extra dashboard additions/);
});
test('V37: native cleanup is locked, token checked and restricted to a canonical transient directory',()=>{
 const kt=read('android-native/com/festers/horizon/stats/HorizonStatsPlugin.kt');
 assert.match(kt,/synchronized\(cacheLock\)/);assert.match(kt,/File\(context.cacheDir, "horizon-transient"\)/);assert.match(kt,/SystemClock.elapsedRealtime\(\) - scanAt > 300000/);assert.match(kt,/f\.lastModified\(\) == c\.modified/);assert.match(kt,/call\.getBoolean\("details", false\) == true/);
});
test('V37: regression gate no longer makes tests non-blocking',()=>{
 const script=read('scripts/predeliver.sh');assert.doesNotMatch(script,/bash scripts\/ci_bypass_tests\.sh/);assert.match(script,/exit 1/);
});
