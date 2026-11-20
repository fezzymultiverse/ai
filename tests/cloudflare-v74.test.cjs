'use strict';
// V1.99.74: Cloudflare shows the full Workers AI catalogue again (DeepSeek and more); workflow installs the native plugins.
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8'),html=read('www/index.html'),wf=read('.github/workflows/build-apk.yml');
test('Cloudflare built-in list carries DeepSeek R1, GPT-OSS, Qwen, Llama 4',()=>{
  const line=html.split('\n').find(l=>l.includes('PROVIDERS.cloudflare.safeModels ='));assert.ok(line);
  for(const m of ['gpt-oss-120b','qwq-32b','qwen2.5-coder-32b-instruct','llama-4-scout','llama-3.3-70b','llama-3.1-8b-instruct-fp8'])assert.ok(line.includes(m),m);
});
test('Cloudflare live catalogue is no longer cut to the safe list',()=>{
  assert.ok(!/live = live\.filter\(m => this\.safeModels\.includes\(m\)\)/.test(html));
  assert.ok(!/\(state\.modelLists\[pidLive\] \|\| \[\]\)\.filter\(m => this\.safeModels\.includes\(m\)\)/.test(html));
  assert.ok(html.includes("horizon_cf_models_74"));
});
test('Workflow installs native plugins and Edge before Gradle and checks them in the APK',()=>{
  const a=wf.indexOf('install_native.sh android --apply'),b=wf.indexOf('install_edge.sh android --apply'),g=wf.indexOf('./gradlew assembleRelease');
  assert.ok(a>0&&b>a&&g>b);
  assert.ok(wf.includes('edge_kit.sh --check android'));
  assert.ok(/HorizonEdgeVoicePlugin EdgeTtsClient EdgeGec/.test(wf));
});
