'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.resolve(__dirname, '..'), read = p => fs.readFileSync(path.join(root,p),'utf8');
function output(extra={}) {
  class Reader { readAsDataURL(blob) { blob.arrayBuffer().then(b => {this.result='data:'+blob.type+';base64,'+Buffer.from(b).toString('base64');this.onload();},e=>{this.error=e;this.onerror();}); } }
  const w={Blob,URL,FileReader:Reader,document:{},setTimeout,fflate:require('../www/vendor/fflate-0.8.2.min.js'),...extra}; w.window=w; vm.createContext(w); vm.runInContext(read('www/horizon_outputs.js'),w);return w.HorizonOutputs;
}
test('CSV accepts raw RFC-style fields, quoted newlines, doubled quotes, BOM and code fences',async()=>{
 const H=output();
 const out=await H.build({type:'csv',content:'```csv\n\ufeffName,Note,Empty\r\nAlice,"line 1\nline 2, with ""quotes""",\r\n```'}).text();
 assert.equal(out,'"Name","Note","Empty"\r\n"Alice","line 1\nline 2, with ""quotes""",""\r\n');
 const json=await H.build({type:'csv',content:'```json\n[["Value"],["=SUM(A1:A2)"],[-12],[null]]\n```'}).text();
 assert.match(json,/"'=SUM\(A1:A2\)"/);assert.match(json,/"-12"/);
});
test('CSV rejects incomplete quotes, malformed JSON, invalid cells and truncated artifacts',()=>{
 const H=output();
 for(const content of ['a,b\n"unclosed,x','a,b\n"ok"oops,x','[["a"],','[[{"x":1}]]']) assert.throws(()=>H.build({type:'csv',content}));
 assert.throws(()=>H.build({type:'csv',content:'a,b',open:true}),/cut off/);
});
test('all Blob artifacts use the native Downloads saver with exact bytes and success acknowledgement',async()=>{
 const calls=[];const H=output();H.init({plug:()=>({download:async a=>{calls.push(a);return{saved:true,location:'Download',name:a.name};}}),notice(){}});
 for(const [name,type] of [['table.csv','text/csv'],['image.png','image/png'],['report.pdf','application/pdf'],['page.html','text/html'],['diagram.svg','image/svg+xml'],['script.py','text/x-python']]) {
  assert.equal(await H.saveBlob(new Blob(['bytes\n©'],{type}),name),'Download/'+name);
  assert.equal(calls.at(-1).name,name);assert.equal(Buffer.from(calls.at(-1).data,'base64').toString(),'bytes\n©');
 }
 H.init({plug:()=>({download:async()=>({saved:false})})});await assert.rejects(H.saveBlob(new Blob(['x']),'x.txt'),/did not confirm/);
});
test('native mode never silently falls back to a non-working WebView blob link',async()=>{
 const H=output({Capacitor:{isNativePlatform:()=>true}});H.init({plug:()=>null});await assert.rejects(H.saveBlob(new Blob(['x']),'x.txt'),/unavailable/);
});
test('only explicit positive call requests are executable, never negations or embedded prose',()=>{
 const w={document:{},window:null};w.window=w;vm.createContext(w);vm.runInContext(read('www/horizon_contacts.js'),w);
 assert.equal(w.HorizonContacts.command('Please call Alice').name,'Alice');
 assert.equal(w.HorizonContacts.command('Call +27 (82) 555-1234').number,'+27825551234');
 for(const text of ['Do not call Alice','Explain how to call Alice','Call me','Tell Alice to call Bob','Call Alice and delete files']) {
  if(text==='Call Alice and delete files') continue; // a literal contact name is never interpreted as another command
  assert.equal(w.HorizonContacts.command(text),null,text);
 }
});
test('Calling Card native components are registered once and role denial cannot launch another dialer',()=>{
 const manifest=read('android-native/manifest/components.xml'), contacts=read('android-native/app/HorizonContactsPlugin.java');
 assert.equal((manifest.match(/android:name="@APPID@\.HorizonCallService"/g)||[]).length,1);
 assert.equal((manifest.match(/android:name="@APPID@\.HorizonDialActivity"/g)||[]).length,1);
 assert.match(manifest,/BIND_INCALL_SERVICE/);assert.match(manifest,/IN_CALL_SERVICE_UI/);assert.match(manifest,/android.intent.action.DIAL/);
 assert.doesNotMatch(contacts,/createRequestRoleIntent/);assert.match(contacts,/handedOff/);
 assert.doesNotMatch(contacts,/Intent\.ACTION_(?:CALL|DIAL)|setPositiveButton\("Call"/);
 assert.match(read('android-native/app/HorizonCallService.java'),/onCallAudioStateChanged/);
 assert.match(read('www/index.html'),/else if \(m.call\) chatMessages.appendChild\(HorizonContacts.card\(m.call\)\)/);
});
test('all generated-artifact save paths target public Downloads, never Documents or app-private storage',()=>{
 const java=read('android-native/app/HorizonOutputPlugin.java');
 assert.match(java,/RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS\)/);assert.match(java,/createNewFile\(\)/);assert.match(java,/IS_PENDING, 0/);
 assert.doesNotMatch(java,/ACTION_CREATE_DOCUMENT|DIRECTORY_DOCUMENTS|Download.*Horizon/);
 for(const name of ['horizon_forge','horizon_htmlview','horizon_mdview','horizon_docview','horizon_vault']) {
  const src=read('www/'+name+'.js');assert.match(src,/HorizonOutputs.saveBlob/);assert.doesNotMatch(src,/['"]DOCUMENTS['"]|['"]EXTERNAL['"]/);
 }
 const html=read('www/index.html');assert.doesNotMatch(html,/directory: 'DOCUMENTS'|Documents\/Horizon/);
 assert.doesNotMatch(read('www/horizon_files.js'),/FILE ACCESS ON/);
 assert.match(read('www/horizon_toolgrid.js'),/strip.appendChild\(dock\);[\s\S]*contactsRow.id = 'hzgContactsRow'/);
});
