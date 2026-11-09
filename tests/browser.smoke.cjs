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
  const errors = [], checks = [];
  try {
    const page = await browser.newPage({viewport:{width:412,height:915},deviceScaleFactor:1});
    page.on('pageerror', e => errors.push(e.stack || e.message));
    // No external inference, TTS, or third-party network is needed for the UI smoke test.
    await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:') ? route.continue() : route.abort());
    await page.goto('http://127.0.0.1:' + server.address().port, {waitUntil:'load'});
    await page.waitForTimeout(500);
    assert.deepEqual(errors, []); checks.push('boot has no uncaught JavaScript errors');
    assert.equal(await page.locator('#rightPanel [data-tab="permissions"]').count(),0); checks.push('Permissions no longer lives in Settings');
    await page.evaluate(() => window.HorizonTerminal.openSettings());
    await page.waitForTimeout(400);
    assert.equal(await page.locator('#hzTerm #hzTerminalPermissions').count(),1);
    assert.ok(await page.locator('#hzTerminalPermissions').isVisible());
    assert.ok(await page.locator('#hzWaCard').isVisible());
    assert.ok(await page.locator('#hzTermuxAiToggle').isVisible());
    checks.push('single moved permissions tree visible inside standalone Terminal');
    await page.evaluate(() => window.HorizonTerminal.openSettings());
    assert.equal(await page.locator('#hzTerm #permList').count(),1);
    const controls = await page.locator('#hzTerminalPermissions').boundingBox();
    assert.ok(controls.height > 150 && controls.width <= 412); checks.push('Terminal controls fit mobile viewport');
    await page.screenshot({path:path.join(reportDir,'terminal-controls.png')});
    await page.locator('.hzt-controls').click();
    assert.ok(await page.locator('.hzt-input').isVisible());
    await page.locator('.hzt-input').fill('echo safe');
    assert.equal(await page.locator('.hzt-input').inputValue(),'echo safe'); checks.push('Terminal input usable after controls close');
    await page.evaluate(() => window.HorizonTerminal.exit());
    await page.waitForTimeout(300);
    await page.locator('#settingsBtn').evaluate(b => b.click());
    await page.waitForTimeout(350);
    assert.ok(await page.locator('#hzDock .hz-contacts-open').isVisible());
    const tile = await page.locator('#hzDock .hz-contacts-open').boundingBox();
    const dock = await page.locator('#hzDock .hz-dock-grid').boundingBox();
    assert.ok(tile.x + tile.width > dock.x + dock.width * .9); checks.push('Contacts tile occupies rightmost dock column');
    await page.screenshot({path:path.join(reportDir,'settings-contacts.png')});
    await page.locator('#hzDock .hz-contacts-open').click();
    assert.ok(await page.locator('#hzContacts').isVisible());
    await page.getByRole('button',{name:'Close',exact:true}).last().click(); checks.push('Contacts dialog opens and closes');
    await page.locator('#rightPanel [data-tab="personalisation"][role="tab"]').click();
    if (!(await page.locator('#ttsEngine').isVisible())) await page.locator('#ttsCard > .settings-row-header').click();
    await page.locator('#ttsEngine').selectOption('gcloud');
    assert.ok(await page.locator('#ttsCloudConfig').isVisible());
    await page.locator('#ttsCloudKey').fill('AIzaSyntheticKeyOnlyForLocalUITest012345');
    await page.locator('#ttsCloudSave').click();
    assert.equal(await page.locator('#ttsCloudKey').inputValue(),''); checks.push('Cloud TTS key masked, saved locally, field cleared');
    await page.evaluate(() => { localStorage.removeItem('horizon_tts_gcloud_key'); window.HorizonTTS.set('engine','standard'); });
    // Native mocks exercise actual JS routing, without pretending an Android send occurred.
    await page.evaluate(() => {
      window.__bridgeCalls = [];
      window.Capacitor = {isNativePlatform:() => true, Plugins:{
        HorizonWhatsApp:{status:async()=>({personal:true,replies:true,contacts:true,access:true,alerts:true}),
          contacts:async()=>({contacts:[{id:'7',name:'Ada Test',phone:'+12025550123'}],hasMore:false,nextOffset:1}),
          sendToContact:async a=>{window.__bridgeCalls.push(a);return{submitted:true};}}
      }};
    });
    await page.evaluate(() => window.HorizonContacts.open());
    await page.getByRole('button',{name:'Ada Test +12025550123'}).click();
    await page.screenshot({path:path.join(reportDir,'contacts-card-fixture.png')});
    await page.getByRole('button',{name:'Use contact in AI chat'}).click();
    const sent = await page.evaluate(() => window.HorizonBridges.run('whatsapp.send','selected | test body | with pipe | business'));
    assert.match(sent.text,/in background/);
    assert.deepEqual(await page.evaluate(() => window.__bridgeCalls[0]),{contactId:'7',text:'test body | with pipe',business:true});
    checks.push('selected contact card reaches background send route without WhatsApp navigation');
    await page.locator('#newChatBtn').evaluate(b=>b.click());
    assert.equal(await page.evaluate(() => window.HorizonContacts.selected()),null); checks.push('new chat clears selected recipient');
    // Music and group windows use their original handlers and assets.
    await page.evaluate(() => document.querySelector('[data-addon="music"]').click());
    await page.waitForTimeout(350);
    assert.ok(await page.locator('#hzMusicView').isVisible()); checks.push('music extension still opens');
    await page.evaluate(() => { if(window.HorizonAddons) window.HorizonAddons.close(); document.getElementById('groupBtn').click(); });
    await page.waitForTimeout(300);
    assert.ok(await page.getByRole('dialog',{name:'Group chat',exact:true}).isVisible());
    checks.push('group chat configuration sheet still opens');
    await page.locator('.hz-gchat .hgp-x').click();
    await page.locator('#chatInput').focus();
    await page.locator('#chatInput').fill('Keyboard regression · 999');
    await page.evaluate(() => window.hzKbNative(false, false));
    await page.waitForTimeout(120);
    assert.equal(await page.evaluate(() => document.activeElement.id), 'chatInput');
    assert.equal(await page.locator('#chatInput').inputValue(), 'Keyboard regression · 999');
    checks.push('late keyboard-hidden event preserves editor focus and typed text');
    await page.locator('#chatInput').blur();
    for (const width of [320,768]) {
      await page.setViewportSize({width,height:915});
      await page.evaluate(() => window.HorizonTerminal.openSettings());
      await page.waitForTimeout(250);
      const rect = await page.locator('#hzTerminalPermissions').boundingBox();
      assert.ok(rect.width <= width + 1 && rect.height > 100);
      await page.locator('.hzt-control-nav button').filter({hasText:'WhatsApp'}).click();
      assert.ok(await page.locator('#hzWaCard').isVisible());
      await page.evaluate(() => window.HorizonTerminal.exit());
      await page.waitForTimeout(200);
    }
    checks.push('Terminal controls and section navigation fit 320px and 768px layouts');
    assert.deepEqual(errors, []);
    fs.writeFileSync(path.join(reportDir,'browser-results.json'),JSON.stringify({checks,errors,androidDeviceTested:false},null,2));
    console.log(JSON.stringify({checks,errors},null,2));
  } finally { await browser.close(); server.close(); }
})().catch(e=>{ console.error(e); server.close(); process.exitCode=1; });
