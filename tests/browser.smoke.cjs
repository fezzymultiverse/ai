const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..', 'www');
const reportDir = process.env.HORIZON_REPORT_DIR || path.resolve(__dirname, '..', 'validation');
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(req.url.split('?')[0]);
  const file = path.join(root, name === '/' ? 'index.html' : name);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
  fs.readFile(file, (error, bytes) => {
    if (error) { res.writeHead(404).end(); return; }
    const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.png':'image/png'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type': mime}); res.end(bytes);
  });
});
(async () => {
  fs.mkdirSync(reportDir, {recursive:true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const errors = [], checks = [], missing = [];
  try {
    const page = await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1});
    page.on('pageerror', e => errors.push(e.stack || e.message));
    page.on('response', r => {if(r.status()===404 && r.url().startsWith('http://127.0.0.1:'))missing.push(r.url());});
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.addInitScript(() => {localStorage.setItem('horizon_door','old-layout');localStorage.setItem('hzShellOn','1');});
    const started=Date.now();
    await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil:'load'});
    await page.waitForTimeout(500);
    assert.deepEqual(errors, []); checks.push('boot has no uncaught JavaScript errors');
    assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_door')),null);
    assert.equal(await page.evaluate(()=>localStorage.getItem('hzShellOn')),null);checks.push('old layout and duplicate shell preferences removed without erasing data');
    assert.deepEqual(await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((x,i)=>ids.indexOf(x)!==i);}),[]);checks.push('all live DOM IDs are unique at startup');
    assert.equal(await page.locator('#hzTermuxCard').count(),0);checks.push('Termux controls are lazy, not built in Permissions at startup');
    await page.locator('#settingsBtn').evaluate(b => b.click()); await page.waitForTimeout(250);
    for(const width of [320,412,768]){
      await page.setViewportSize({width,height:915});
      const rects=await page.locator('#hzDock .hz-dock-grid > .hz-app').evaluateAll(rows=>rows.map(e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height};}));
      assert.equal(rects.length,5); assert.ok(rects.every(r=>Math.abs(r.y-rects[0].y)<1));assert.ok(rects.every(r=>r.w>30));
    }
    await page.setViewportSize({width:412,height:915});checks.push('five right-panel app tiles share a single row at 320, 412 and 768px');
    await page.screenshot({path:path.join(reportDir,'settings-five-tiles.png')});
    await page.locator('#settingsHome [data-tab="permissions"]').click();
    assert.ok(await page.locator('#hzWaCard').isVisible());
    assert.equal(await page.locator('#hzTerminalPermissions #nativeCheckCard').count(),1);
    assert.equal(await page.locator('#hzTerminalPermissions #hzTermuxCard').count(),0);
    assert.equal(await page.locator('#hzShellCard').count(),0);
    assert.equal(await page.locator('#hzWaCard [data-hzb-wa="personal"]').count(),1);
    assert.equal(await page.locator('#hzWaCard [data-hzb-wa="business"]').count(),1);
    checks.push('Permissions owns Device/native check and independent WhatsApp sources, no shell or Termux controls');
    await page.screenshot({path:path.join(reportDir,'permissions.png')});
    await page.locator('#settingsBackBtn').click();
    await page.locator('#settingsHome [data-tab="web"]').click();
    if(!(await page.locator('#hzWebKeyNote').isVisible()))await page.locator('#hzWebKeyImporter > .settings-row-header').click();
    const key='fc-Ab9cd7Ef5Gh3Jk1Lm2Np4Qr6St8Uv0Wx';
    await page.locator('#hzWebKeyNote').fill('<div><b>Firecrawl</b>: <code>'+key+'</code></div>\nFirecrawl: '+key+'\nSerpAPI: gsk_WrongOwnerAb9cd7Ef5Gh3Jk1Lm2Np4');
    await page.locator('#hzWebKeyExtract').click();
    assert.equal(await page.locator('#hzWebKeyResults input[type="checkbox"]').count(),1);
    assert.ok(!(await page.locator('#hzWebKeyResults').textContent()).includes(key));
    assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_webkey_firecrawl')),null);
    checks.push('messy key paste is deduplicated, owner-checked, masked and never saved during extraction');
    let validations=0;
    await page.route('https://api.firecrawl.dev/v2/team/credit-usage',r=>{validations++;return r.fulfill({status:503,contentType:'application/json',body:'{"error":"temporarily unavailable"}'});});
    await page.locator('#hzWebKeySave').click();
    await page.waitForFunction(()=>document.querySelector('#hzWebKeySave').disabled===false);
    assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_webkey_firecrawl')),null);
    assert.ok((await page.locator('#hzWebKeyNote').inputValue()).includes(key));
    checks.push('503 verification failure does not save a key or erase pasted notes');
    await page.unroute('https://api.firecrawl.dev/v2/team/credit-usage');
    await page.route('https://api.firecrawl.dev/v2/team/credit-usage',r=>{validations++;return r.fulfill({status:200,contentType:'application/json',body:'{"success":true,"data":{}}'});});
    await page.locator('#hzWebKeySave').click(); await page.waitForFunction(()=>localStorage.getItem('horizon_webkey_firecrawl'));
    assert.equal(validations,2);assert.equal(await page.evaluate(()=>localStorage.getItem('horizon_webkey_firecrawl')),key);
    assert.ok((await page.locator('#hzWebKeyNote').inputValue()).length>0);checks.push('verified key uses existing provider store; mixed/failed note is retained');
    await page.locator('#hzWebKeyClear').click();
    await page.screenshot({path:path.join(reportDir,'web-key-extractor.png')});
    await page.locator('#settingsBackBtn').click();
    await page.locator('#hzDock [data-term-open]').click();await page.waitForTimeout(400);
    assert.equal(await page.locator('#hzTerm #hzTerminalOptions').count(),1);
    assert.equal(await page.locator('#hzTerm #hzTerminalPermissions').count(),0);
    await page.locator('.hzt-controls').click();
    assert.ok(await page.locator('#hzTermuxAiToggle').isVisible());
    assert.equal(await page.locator('#hzTermuxCard textarea').count(),0);
    assert.equal(await page.locator('#hzTerm .hzt-input').count(),1);
    assert.equal(await page.locator('#hzTerm #hzWaCard').count(),0);
    checks.push('big Terminal owns one prompt and Termux-only Controls/Options, no duplicate small shell');
    await page.screenshot({path:path.join(reportDir,'terminal-options.png')});
    await page.locator('.hzt-controls').click();
    await page.locator('.hzt-input').fill('printf preview');await page.locator('.hzt-input').press('Enter');
    assert.match(await page.locator('.hzt-out').textContent(),/Browser preview cannot execute commands/);checks.push('browser preview does not fake shell execution');
    await page.evaluate(()=>{
      window.__terminalCalls=[];
      window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonTermux:{
        status:async()=>({enabled:true,aiEnabled:true,permission:true,installed:true}),
        execute:async a=>{window.__terminalCalls.push(a);return{jobId:'mock-job-'+window.__terminalCalls.length};},
        result:async()=>({status:'complete',exitCode:0,stdout:'native bridge mock output\n__HZCWD__/data/data/com.termux/files/home\n'})
      }}};
    });
    await page.locator('.hzt-input').fill('printf actual'); await page.locator('.hzt-input').press('Enter');
    await page.waitForFunction(()=>window.__terminalCalls.length===1);
    await page.waitForFunction(()=>document.querySelector('.hzt-out').textContent.includes('[exit 0]'));
    assert.match(await page.locator('.hzt-out').textContent(),/native bridge mock output/);
    const ai=await page.evaluate(async()=>{await window.HorizonBridges.refresh();return window.HorizonBridges.run('termux.run','printf ai');});
    assert.match(ai.text,/exit 0/);assert.deepEqual(await page.evaluate(()=>window.__terminalCalls.map(x=>x.fromAI)),[false,true]);
    checks.push('manual and AI command routing both hit the same mocked native Termux bridge');
    await page.evaluate(()=>window.HorizonTerminal.openSettings());
    assert.equal(await page.locator('#hzTermuxCard').count(),1);assert.equal(await page.locator('#hzTerm').count(),1);checks.push('reopening terminal/settings does not duplicate controls');
    await page.screenshot({path:path.join(reportDir,'unified-terminal.png')});
    await page.evaluate(()=>window.HorizonTerminal.exit());await page.waitForTimeout(250);
    await page.locator('#settingsBtn').evaluate(b=>b.click());await page.waitForTimeout(200);
    await page.locator('#hzDock .hz-contacts-open').click();assert.ok(await page.locator('#hzContacts').isVisible());
    await page.getByRole('button',{name:'Close',exact:true}).last().click();checks.push('existing Contacts dialog still opens and closes');
    await page.locator('#settingsHome [data-tab="personalisation"]').click();
    if(!(await page.locator('#ttsPreset').isVisible()))await page.locator('#ttsCard > .settings-row-header').click();
    assert.equal(await page.locator('#ttsCloudConfig,#ttsHd,#ttsNat').count(),0);
    assert.equal(await page.locator('#ttsPreset option').count(),21);
    assert.equal(await page.locator('#ttsCard input[type="range"]').count(),17);
    await page.locator('#ttsPreset').selectOption('robot');
    assert.equal(await page.evaluate(()=>window.HorizonTTS.settings().robot),80);
    await page.locator('#ttsFxReset').click();
    assert.equal(await page.evaluate(()=>window.HorizonTTS.hasEffects()),false);
    checks.push('Android-only voice studio has seventeen controls, twenty presets, functioning selection/reset and no cloud/model UI');
    await page.evaluate(()=>{
      window.__bridgeCalls=[];
      window.Capacitor={isNativePlatform:()=>true,Plugins:{HorizonWhatsApp:{
        status:async()=>({personal:true,replies:true,contacts:true,access:true,alerts:true}),
        contacts:async()=>({contacts:[{id:'7',name:'Ada Test',phone:'+12025550123'}],hasMore:false,nextOffset:1}),
        sendToContact:async a=>{window.__bridgeCalls.push(a);return{submitted:true};}
      }}};
    });
    await page.evaluate(()=>window.HorizonContacts.open());await page.getByRole('button',{name:'Ada Test +12025550123'}).click();
    await page.getByRole('button',{name:'Use contact in AI chat'}).click();
    const sent=await page.evaluate(()=>window.HorizonBridges.run('whatsapp.send','selected | test body | with pipe | business'));
    assert.match(sent.text,/in background/);assert.deepEqual(await page.evaluate(()=>window.__bridgeCalls[0]),{contactId:'7',text:'test body | with pipe',business:true});
    checks.push('WhatsApp selected contact route preserves background send, business source and exact body');
    await page.locator('#newChatBtn').evaluate(b=>b.click());assert.equal(await page.evaluate(()=>window.HorizonContacts.selected()),null);checks.push('new chat still clears selected recipient');
    await page.evaluate(()=>document.querySelector('[data-addon="music"]').click());await page.waitForTimeout(250);
    assert.ok(await page.locator('#hzMusicView').isVisible());checks.push('original Music extension still opens');
    await page.evaluate(()=>{window.HorizonAddons.close();document.getElementById('groupBtn').click();});await page.waitForTimeout(200);
    assert.ok(await page.getByRole('dialog',{name:'Group chat',exact:true}).isVisible());await page.locator('.hz-gchat .hgp-x').click();checks.push('original Group chat configuration still opens');
    await page.locator('#chatInput').fill('Keyboard regression · 999');await page.locator('#chatInput').focus();
    await page.evaluate(()=>window.hzKbNative(false,false));await page.waitForTimeout(120);
    assert.equal(await page.evaluate(()=>document.activeElement.id),'chatInput');assert.equal(await page.locator('#chatInput').inputValue(),'Keyboard regression · 999');checks.push('late keyboard-hidden event preserves typed text and focus');
    await page.evaluate(()=>{
      const chat=document.getElementById('chatMessages');chat.innerHTML='<div class="message ai"><div class="message-meta">Horizon · now</div><div class="bubble"><p>Clean structure. One terminal. 999.</p><pre><code>printf "Horizon"</code></pre><table><thead><tr><th>Module</th><th>Owner</th></tr></thead><tbody><tr><td>Device + WhatsApp</td><td>Permissions</td></tr><tr><td>Commands</td><td>Terminal</td></tr></tbody></table></div></div>';
    });
    const visual=await page.evaluate(()=>({rail:getComputedStyle(document.querySelector('#chatMessages .message.ai')).borderInlineStartWidth,dots:getComputedStyle(document.getElementById('chatScroll')).backgroundImage,code:getComputedStyle(document.querySelector('#chatMessages pre')).borderRadius}));
    assert.equal(visual.rail,'2px');assert.match(visual.dots,/radial-gradient/);assert.equal(visual.code,'12px');checks.push('all three lightweight chat visuals render on existing message DOM');
    await page.locator('#chatInput').blur();await page.screenshot({path:path.join(reportDir,'chat-visuals.png')});
    await page.evaluate(()=>document.documentElement.setAttribute('data-theme','grey'));
    await page.screenshot({path:path.join(reportDir,'chat-visuals-grey.png')});
    for(const width of [320,768]){
      await page.setViewportSize({width,height:915});await page.evaluate(()=>window.HorizonTerminal.openSettings());await page.waitForTimeout(200);
      const rect=await page.locator('#hzTerminalOptions').boundingBox();assert.ok(rect.width<=width+1 && rect.height>100);
      await page.evaluate(()=>window.HorizonTerminal.exit());await page.waitForTimeout(200);
    }
    checks.push('Termux options fit narrow and wide layouts');
    assert.deepEqual(errors,[]);assert.deepEqual(missing,[]);
    const report={checks,errors,missing,elapsedMs:Date.now()-started,androidDeviceTested:false,nativeCommandsMocked:true};
    fs.writeFileSync(path.join(reportDir,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  } catch(error) {
    fs.writeFileSync(path.join(reportDir,'browser-failure.json'),JSON.stringify({checks,errors,missing,error:String(error.stack)},null,2));throw error;
  } finally {await browser.close();server.close();}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
