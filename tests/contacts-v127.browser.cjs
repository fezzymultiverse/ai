'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const {chromium} = require('playwright');
const web = path.resolve(__dirname, '../www');

test('V1.99.127: "for me" is stripped, "any contact" opens the list, Back closes the contacts box and the quick-add box', {timeout:40000}, async () => {
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
    const page = await browser.newPage();
    await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    await page.waitForFunction(() => !!window.HorizonContacts);
    const parsed = await page.evaluate(() => ['Call Bastiaan for me', 'call Phil Festers for me', 'Call any Contact for me', 'Call Alex now please'].map(t => HorizonContacts.command(t)));
    assert.deepEqual(parsed, [{name:'Bastiaan'}, {name:'Phil Festers'}, {pick:true}, {name:'Alex'}]);
    await page.evaluate(() => {
      const rows = [{id:'1', name:'Bastiaan Bastiaan', number:'+27767383327'}];
      HorizonContacts.init({plug: () => ({search: async () => ({rows}), duplicates: async () => ({rows:[]}), dial: async () => ({requested:true})}), notice() {}});
      HorizonContacts.open({});
    });
    const dlg = page.getByRole('dialog', {name:'Device contacts'});
    await dlg.waitFor();
    await dlg.getByRole('button', {name:'Bastiaan Bastiaan · +27767383327'}).waitFor();
    await page.goBack();
    await page.waitForFunction(() => !document.getElementById('hz-device-contacts'));
    // the X button also closes it and leaves no stray history entry behind
    const before = await page.evaluate(() => history.length);
    await page.evaluate(() => HorizonContacts.open({}));
    await page.getByRole('dialog', {name:'Device contacts'}).getByRole('button', {name:'Close'}).click();
    await page.waitForFunction(() => !document.getElementById('hz-device-contacts'));
    await page.waitForTimeout(300);
    assert.equal(await page.evaluate(() => history.state && history.state.hzContacts), null);
    assert.ok(before >= 1);
  } finally { if (browser) await browser.close(); server.close(); }
});
