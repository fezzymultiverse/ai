'use strict';
// Real Chromium, real application. No live accounts or native audio required.
// Run with Playwright installed and serve repo root. HORIZON_URL may override the URL.
const {chromium}=require('playwright'), assert=require('node:assert/strict'), fs=require('node:fs'),path=require('node:path');
const OUT=path.join(__dirname,'artifacts-v42');fs.mkdirSync(OUT,{recursive:true});
const ME={id:'HZ-ME',name:'Me'},contacts=[{id:'HZ-A',name:'Alice'},{id:'HZ-B',name:'A much longer contact name for alignment'},{id:'HZ-C',name:'Bob'}];
const sync={me:ME,people:[ME,...contacts],contacts,requests:[],invitations:[],blocked:[],rooms:[]};
(async()=>{const browser=await chromium.launch({headless:true,args:['--no-sandbox']});let rows=[],errors=[];
try{for(const theme of ['dark','grey'])for(const width of [320,393,768]){
 const ctx=await browser.newContext({viewport:{width,height:852}});await ctx.addInitScript(({theme,ME,contacts})=>{localStorage.setItem('horizon_soul_v','999');localStorage.setItem('horizon_theme',theme);localStorage.setItem('horizon_people_v1',JSON.stringify({token:'fixture',me:ME,savedContacts:{[ME.id]:contacts},mig197:true}));},{theme,ME,contacts});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.route('**/people-api/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(r.request().url().includes('/sync')?sync:{ok:true})}));
 await p.goto(process.env.HORIZON_URL||'http://127.0.0.1:8134/www/index.html');await p.waitForTimeout(650);
 await p.locator('.hzc-set').click();await p.waitForTimeout(450);
 const dock=await p.evaluate(()=>[...document.querySelectorAll('#hzDock .hz-app')].filter(e=>e.getBoundingClientRect().width).map(e=>({text:e.querySelector('span').innerText,top:e.getBoundingClientRect().top,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right})));
 assert.equal(dock.length,6);assert.deepEqual(dock.map(x=>x.text),['Terminal','Lens','YouTube','Stats','Downloads','RSS']);assert.ok(dock.every(x=>Math.abs(x.top-dock[0].top)<1));assert.ok(dock[5].right<=width+1,JSON.stringify({theme,width,dock}));assert.ok(dock[4].left>dock[3].left&&dock[5].left>dock[4].left);
 if(width===393)await p.screenshot({path:path.join(OUT,`right-${theme}.png`)});
 await p.locator('#hzDlRow').click();await p.waitForTimeout(100);assert.equal(await p.locator('#hzDownloadsView').isVisible(),true);await p.locator('#hzExtensionMin').click();await p.waitForTimeout(200);
 await p.locator('#hzDock [data-addon="stats"]').click();await p.waitForTimeout(150);
 assert.equal(await p.locator('.hzs-card .hzs-icon').count(),20);assert.equal(await p.locator('.hzs-access input[role="switch"]').count(),4);assert.equal(await p.locator('.hzs-overview .hzs-card').count(),4);
 await p.locator('#hzsAllowLive').uncheck();assert.match(await p.locator('#hzsStatus').textContent(),/paused/);await p.locator('#hzsAllowLive').check();assert.doesNotMatch(await p.locator('#hzsStatus').textContent(),/· paused/);
 assert.equal(await p.locator('#hzStatsView').evaluate(e=>e.scrollWidth>e.clientWidth+1),false);
 if(width===393)await p.screenshot({path:path.join(OUT,`stats-${theme}.png`)});
 await p.locator('#hzExtensionMin').click();await p.waitForTimeout(100);await p.locator('#rightPanel [data-close]').click();await p.waitForTimeout(250);
 // Use a real, silent PCM WAV fixture through the browser audio pipeline (not native Edge speech).
 const playback=await p.evaluate(async()=>{
  const rate=8000,seconds=5,dataBytes=rate*seconds*2,buf=new ArrayBuffer(44+dataBytes),v=new DataView(buf);
  const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,36+dataBytes,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,rate,true);v.setUint32(28,rate*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,dataBytes,true);
  window.__wavUrl=URL.createObjectURL(new Blob([buf],{type:'audio/wav'}));return HorizonMusic.playRemote({id:'browser-test',title:'Silent browser audio fixture',url:window.__wavUrl,dur:5});
 });assert.equal(playback.ok,true);await p.waitForTimeout(100);
 assert.equal(await p.locator('.hzc-set').getAttribute('data-media'),'live');
 const anim=await p.locator('.hzc-set').evaluate(e=>getComputedStyle(e).animationName);assert.notEqual(anim,'none');
 await p.evaluate(()=>{HorizonMusic.pauseNow();URL.revokeObjectURL(window.__wavUrl);});await p.waitForTimeout(100);assert.equal(await p.locator('.hzc-set').getAttribute('data-media'),null);
 // Lyrics-only activity wiring uses a DOM state fixture; no live lyric service is contacted.
 await p.evaluate(()=>{const box=document.createElement('div');box.id='test-lyric-state';box.className='hzly-box is-playing';document.querySelector('#hzRpLyrics').appendChild(box);});await p.waitForTimeout(100);assert.equal(await p.locator('.hzc-set').getAttribute('data-media'),'live');
 await p.evaluate(()=>document.querySelector('#test-lyric-state').remove());await p.waitForTimeout(100);assert.equal(await p.locator('.hzc-set').getAttribute('data-media'),null);
 await p.locator('#menuBtn').evaluate(e=>e.click());await p.waitForTimeout(200);
 assert.equal(await p.locator('#leftPanel .acc-row').count(),4);assert.equal(await p.locator('#leftPanel .acc-row > .acc-bubble').count(),2);assert.equal(await p.locator('#leftPanel .acc-row .set-text p').count(),0);
 for(const e of await p.locator('#leftPanel .acc-row h3').all())assert.equal(await e.evaluate(n=>getComputedStyle(n).color),theme==='grey'?'rgb(7, 86, 108)':'rgb(0, 229, 255)');
 if(width===393)await p.screenshot({path:path.join(OUT,`left-${theme}.png`)});
 await p.locator('.hzd-date').click();await p.waitForTimeout(100);assert.equal(await p.locator('.hzc-shade').isVisible(),true);
 assert.equal(await p.locator('.hzc-close').evaluate(e=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}),true);
 await p.locator('.hzc-text').fill('Calendar test');await p.locator('.hzc-rchk').uncheck();await p.locator('.hzc-add').click();assert.match(await p.locator('.hzc-list').textContent(),/Calendar test/);
 if(width===393)await p.screenshot({path:path.join(OUT,`calendar-${theme}.png`)});
 await p.keyboard.press('Escape');await p.waitForTimeout(150);assert.equal(await p.locator('.hzc-shade').isVisible(),false);assert.equal(await p.locator('#leftPanel').evaluate(e=>e.classList.contains('open')),true);
 await p.locator('#leftPanel [data-close]').click();await p.waitForTimeout(200);
 await p.evaluate(()=>HorizonPeople.open());await p.waitForTimeout(150);await p.locator('.hzp-tab').filter({hasText:'Synced contacts'}).click();await p.waitForTimeout(100);
 const contactDetail=p.locator('.hzp-dd').filter({hasText:'Contacts ·'}).first();await contactDetail.evaluate(e=>{e.open=true;});
 const aiDetail=p.locator('.hzp-dd').filter({hasText:'AI to include'}).first();await aiDetail.evaluate(e=>{e.open=true;});
 const positions=await p.locator('.hzp-dd .hzp-pickrow > input[type="checkbox"]').evaluateAll(a=>a.map(e=>({x:e.getBoundingClientRect().x,w:e.getBoundingClientRect().width})));
 assert.equal(positions.length,3);assert.ok(positions.every(e=>Math.abs(e.x-positions[0].x)<1&&e.w===22));
 const aiPos=await p.locator('.hzp-dd .hzp-ai > input[type="checkbox"]').first().evaluate(e=>e.getBoundingClientRect().x);assert.ok(Math.abs(aiPos-positions[0].x)<1);
 await p.locator('.hzp-dd .hzp-pickrow > input[type="checkbox"]').first().check();assert.equal(await p.locator('.hzp-dd .hzp-pickrow > input[type="checkbox"]').first().isChecked(),true);
 if(width===393)await p.screenshot({path:path.join(OUT,`contacts-${theme}.png`)});
 rows.push({theme,width,result:'pass',checks:['five tiles, downloads opens','20 stat icons, four controls, no overflow','real browser WAV playback pulses header; pause stops; lyric-state fixture also pulses','cyan title-only left navigation','calendar above panel, save and dismiss','contact and AI checkbox rail aligned']});await ctx.close();
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(OUT,'browser-results.json'),JSON.stringify({rows,errors},null,2));console.log(JSON.stringify({runs:rows.length,errors,results:rows},null,2));
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
