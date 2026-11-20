'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
const web = path.resolve(__dirname, '../www');
const tiny = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO9l2MsAAAAASUVORK5CYII=', 'base64');

test('real app provides document preview/download, device contact UI and Pollinations image routing', {timeout:40000}, async () => {
  const server = http.createServer((req, res) => {
    const name = path.resolve(web, '.' + new URL(req.url, 'http://localhost').pathname);
    const file = name === web ? path.join(web, 'index.html') : name;
    if (!file.startsWith(web + '/') || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404).end(); return; }
    const mime = {'.html':'text/html', '.js':'application/javascript', '.css':'text/css'}[path.extname(file)] || 'application/octet-stream';
    res.writeHead(200, {'Content-Type':mime}); fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage({acceptDownloads:true});
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!window.HorizonForge);
    await page.evaluate(() => {
      const mount = document.createElement('div'); mount.id = 'fixture';
      mount.append(HorizonPDF.card(HorizonPDF.parse('<artifact type="xlsx" title="test.xlsx">[["Item","Cost"],["Fuel",100]]</artifact>').items[0]));
      document.body.prepend(mount);
    });
    await page.getByRole('button', {name:'Preview', exact:true}).click();
    assert.equal(await page.getByRole('cell', {name:'Fuel'}).count(),1);
    const downloading = page.waitForEvent('download');
    await page.getByRole('dialog', {name:'test.xlsx'}).getByRole('button', {name:'Download', exact:true}).click();
    assert.equal((await downloading).suggestedFilename(), 'test.xlsx');
    await page.getByRole('dialog', {name:'test.xlsx'}).getByRole('button', {name:'Close'}).click();
    await page.evaluate(() => {
      const rows = [{id:'101',name:'Alice',number:'+27110000000'},{id:'102',name:'Alice',number:'+27110000001'}];
      const actions = window.testContactActions = [];
      const p = {search: async () => ({rows}), duplicates: async () => ({rows:[[rows[0], {...rows[0],id:'103'}]]}), dial: async d => {actions.push(d); return {requested:true};}};
      HorizonContacts.init({plug: () => p, notice() {}});
      HorizonContacts.open(HorizonContacts.command('Call Alice'));
    });
    const contacts = page.getByRole('dialog', {name:'Device contacts'});
    await contacts.getByRole('button', {name:'Alice · +27110000001', exact:true}).click();
    assert.deepEqual(await page.evaluate(() => window.testContactActions), [{id:'102',number:'+27110000001'}]);
    let called = 0;
    await page.route('https://enter.pollinations.ai/api/device/code', r => r.fulfill({json:{device_code:'mock',user_code:'ABCD-1234',interval:5,expires_in:60}}));
    await page.route('https://enter.pollinations.ai/api/device/token', r => r.fulfill({json:{access_token:'mock-ephemeral-token'}}));
    await page.route('https://gen.pollinations.ai/image/**', async r => {
      called++;
      assert.equal(r.request().headers().authorization,'Bearer mock-ephemeral-token');
      assert.equal(new URL(r.request().url()).searchParams.has('key'),false);
      await r.fulfill({contentType:'image/png',body:Buffer.concat([tiny, Buffer.alloc(100)])});
    });
    const composer = page.locator('#chatInput');
    await composer.fill('/image a mountain sunrise');
    await page.locator('#sendBtn').click();
    await page.getByRole('button', {name:'Get authorization code'}).click();
    await page.locator('img[alt="a mountain sunrise"]').waitFor();
    await page.waitForFunction(() => document.querySelector('img[alt="a mountain sunrise"]').naturalWidth > 0);
    assert.equal(called,1);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('img[alt="a mountain sunrise"]')?.naturalWidth > 0);
    assert.equal(called,1);
  } finally { if (browser) await browser.close(); await new Promise(r => server.close(r)); }
});
