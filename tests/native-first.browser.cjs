// Browser integration with mocked providers/native services; never downloads real media or calls paid APIs.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const reportDir = path.join(__dirname, 'results-v47');
fs.mkdirSync(reportDir,{recursive:true});
const rows=[];
const hook=`window.__nf = {
  state, prompt: getSystemPrompt, lite: getLitePrompt, code: buildCodeBlock, yt: runYtTool,
  fixture(text) { newTurn(); const chat={id:'native-first-fixture',title:'Tool test',messages:[{role:'user',text,ts:Date.now()}],yt:true,web:true,gh:false}; state.chats=state.chats.filter(c=>c.id!==chat.id).concat(chat);state.currentId=chat.id;return chat; },
  provider(id,model) {newTurn(); const p=PROVIDERS[id];state.models[id]=model||p.defaultModel;state.modelLists[id]=[state.models[id]];liveCtx={prov:id,model:state.models[id]}; return p.chat('test-key-not-real',state.models[id],[{role:'user',text:'Reply OK'}]);},
  turn(chat,p){return runTurn(chat,p,'test','mock','');}, web(on){state.webMaster=on;state.webKeys.serpapi=on?'test-key':'';state.webOn.serpapi=on;},
};`;
const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://localhost');
  const f=path.resolve(root,'.'+decodeURIComponent(u.pathname));
  if(!f.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try {
    let body=fs.readFileSync(f);
    const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.json':'application/json'}[path.extname(f)]||'application/octet-stream';
    if(u.pathname==='/www/index.html') body=body.toString().replace('        window.Store = {',hook+'\n        window.Store = {');
    res.writeHead(200,{'content-type':mime});res.end(body);
  }catch(e){res.writeHead(404).end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:393,height:852}});
  const errors=[],captured=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
    const req=route.request(),u=new URL(req.url());
    if(u.origin===base)return route.continue();
    if(req.method()==='POST') {
      let body;try{body=req.postDataJSON();}catch(e){body={};}
      captured.push({url:req.url(),body});
      const payload={choices:[{message:{content:'OK'},delta:{content:'OK'},finish_reason:'stop'}],candidates:[{content:{parts:[{text:'OK'}]},finishReason:'STOP'}],message:{content:[{type:'text',text:'OK'}]},content:[{type:'text',text:'OK'}],stop_reason:'end_turn'};
      const stream=/streamGenerateContent/.test(req.url())||body.stream===true;
      return route.fulfill({status:200,contentType:stream?'text/event-stream':'application/json',body:stream?'data: '+JSON.stringify(payload)+'\n\ndata: [DONE]\n\n':JSON.stringify(payload)});
    }
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({data:[],models:[],results:[],status:'offline fixture'})});
  });
  try {
    await page.goto(base+'/www/index.html',{waitUntil:'load'});
    await page.waitForFunction(()=>window.__nf && window.HorizonTermAI);
    assert.deepEqual(errors,[]); rows.push({test:'Full app boots without JavaScript runtime errors',pass:true});
    const prompts=await page.evaluate(()=>{__nf.fixture('Native tools');return {full:__nf.prompt(),lite:__nf.lite()};});
    for(const [mode,prompt] of Object.entries(prompts)) {
      for(const s of ['HORIZON NATIVE-FIRST','[[yt.search:','[[yt.queue:','[[alarm.set:','[[calendar.add:','[[lyrics.show]]','fenced bash']) assert.ok(prompt.includes(s),mode+' '+s);
    }
    rows.push({test:'Full and lite prompts contain complete native tool contracts',pass:true,liteChars:prompts.lite.length,fullChars:prompts.full.length});
    for(const id of ['gemini','groq','cohere','mistral','openrouter','pollinations','chatat','blockrun','aihorde']) {
      const outcome=await page.evaluate(async id=>{try{return {out:await __nf.provider(id)}}catch(e){return {error:e.message}}},id);
      if(outcome.error) throw Error(id+': '+outcome.error);
      assert.equal(outcome.out,'OK',id);
      const req=captured.at(-1), b=req.body;
      const sys=b.systemInstruction?b.systemInstruction.parts.map(x=>x.text).join(''):b.system||(b.messages||[]).find(x=>x.role==='system')?.content;
      assert.ok(typeof sys==='string'&&sys.includes('HORIZON NATIVE-FIRST'),id+' sends contract');
      assert.ok(sys.includes('[[alarm.set:'),id+' scheduling schema');
      rows.push({test:`Provider ${id} sends native contract in actual request payload`,pass:true});
    }
    const run=await page.evaluate(async()=>{
      let calls=0; const orig=HorizonBridges.termux;
      HorizonBridges.termux=async cmd=>{calls++;return {exitCode:0,stdout:'REAL MOCK RESULT: '+cmd,stderr:''};};
      const n=__nf.code('free -h','bash');document.body.appendChild(n);
      const before=calls; n.querySelector('.code-run').click();
      await new Promise(r=>setTimeout(r,0));
      const r={before,after:calls,out:n.querySelector('.code-run-result').textContent};n.remove();HorizonBridges.termux=orig;return r;
    });
    assert.equal(run.before,0);assert.equal(run.after,1);assert.match(run.out,/exit 0[\s\S]*REAL MOCK RESULT: free -h/);
    rows.push({test:'Main-chat bash fence waits for RUN and shows actual result',pass:true});
    const schedule=await page.evaluate(async()=>{
      const calls=[];window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonAlarm:{schedule:async args=>{calls.push(args);return {ok:true};}}}};
      const chat=__nf.fixture('Wake me up April 12 2099 at 7:30');
      const history=[];let n=0;
      const p={name:'Mock',chat:async(k,m,h)=>{history.push(h);return n++===0?'[[alarm.set: 2099-04-12 | 07:30 | Wake]]':'Wake alarm set for 12 April 2099 at 07:30 local time.';}};
      const r=await __nf.turn(chat,p);return {calls,raw:r.raw,feedback:history[1].at(-1).text};
    });
    assert.equal(schedule.calls.length,1);assert.equal(schedule.calls[0].mode,'alarm');assert.match(schedule.feedback,/Native wake alarm scheduled/);assert.match(schedule.raw,/07:30/);
    rows.push({test:'alarm.set completes through real chat tool loop with native result feedback',pass:true});
    const webGuard=await page.evaluate(async()=>{
      __nf.web(true);const chat=__nf.fixture('Show me the lyrics');let n=0;const history=[];
      const r=await __nf.turn(chat,{name:'Mock',chat:async(k,m,h)=>{history.push(h);return n++===0?'[[web.search: test song lyrics]]':'Use the native lyric widget.';}});
      __nf.web(false);return {raw:r.raw,result:history[1].at(-1).text};
    });
    assert.match(webGuard.result,/Web was NOT called/);rows.push({test:'Music/lyrics web-scraping attempt is blocked and routed back to native tools',pass:true});
    const queue=await page.evaluate(async()=>{
      const orig=HzYtDirect.audio;HzYtDirect.audio=async()=>({url:'https://example.invalid/audio',title:'Queued fixture',artist:'Fixture'});
      const before=HorizonMusic.nowInfo();const r=await __nf.yt('yt.queue','abcdefghijk | Fixture');
      HzYtDirect.audio=orig;return {before,after:HorizonMusic.nowInfo(),r};
    });
    assert.deepEqual(queue.before,queue.after);assert.match(queue.r.text,/Queued next/);
    rows.push({test:'yt.queue routes through existing music player without interrupting playback',pass:true});
    // The terminal assistant also renders a manual RUN card; no command executes on generation.
    const terminal=await page.evaluate(async()=>{
      HorizonTerminal.open();HorizonTermAI.open();
      let commands=0;window.__nfTermOriginal=HorizonBridges.termux;HorizonBridges.termux=async()=>{commands++;window.__nfTermCommands=commands;return {exitCode:0,stdout:'terminal result',stderr:''};};
      window.HorizonAskAI=async()=> '```bash\nfree -h\n```';
      document.querySelector('.hza-ta').value='Check RAM';document.querySelector('.hza-go').click();
      await new Promise(r=>setTimeout(r,80));return {before:commands,card:document.querySelector('.hza-code').textContent};
    });
    assert.equal(terminal.before,0);assert.match(terminal.card,/RUN/);
    await page.getByRole('button',{name:'Run this block in Termux',exact:true}).click();
    await page.waitForFunction(()=>window.__nfTermCommands===1);
    assert.match(await page.locator('.hza-log').innerText(),/terminal result/);
    rows.push({test:'Terminal AI waits for RUN and stores actual output in its conversation',pass:true});
    assert.deepEqual(errors,[]);rows.push({test:'No runtime errors across integrated tests',pass:true});
    console.log(JSON.stringify(rows,null,2));
  }catch(e){rows.push({test:'Browser integration',pass:false,error:e.stack,runtimeErrors:errors});throw e;}
  finally {fs.writeFileSync(path.join(reportDir,'browser-results.json'),JSON.stringify(rows,null,2));await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
