'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const root = path.join(__dirname, '..'), read = p => fs.readFileSync(path.join(root, p), 'utf8');
const zip = require('../www/vendor/fflate-0.8.2.min.js');
function load() {
  const s = { Blob, URL, URLSearchParams, document: { addEventListener() {} }, fflate: zip, addEventListener() {} }; s.window = s;
  vm.createContext(s);
  for (const name of ['horizon_outputs','horizon_pdf','horizon_contacts','horizon_poll_image']) vm.runInContext(read(`www/${name}.js`), s);
  return s;
}
test('artifact parser recognizes Office formats without changing legacy PDF parsing', () => {
  const {HorizonPDF, HorizonOutputs} = load();
  const {items} = HorizonPDF.parse('<artifact type="xlsx" title="../Budget.txt">[["Category"],["Rent"]]</artifact>\n<artifact type="document" title="Essay"># Old format</artifact>');
  assert.equal(items[0].title, 'Budget.xlsx'); assert.equal(items[0].type, 'xlsx'); assert.equal(items[1].type, 'pdf');
  assert.equal(HorizonOutputs.kind('Make an Excel tracker'), 'xlsx');
  assert.equal(HorizonOutputs.kind('Please create a .docx report'), 'docx');
  assert.equal(HorizonOutputs.kind('How do I export CSV?'), '');
  assert.equal(HorizonOutputs.kind('Move test.csv into /storage/a'), '');
  const open = HorizonPDF.parse('<artifact type="csv" title="cut.csv">[[1]]').items[0];
  assert.throws(() => HorizonOutputs.build(open), /cut off/);
});

test('exports standard Office ZIP packages and Excel data types', async () => {
  const H = load().HorizonOutputs;
  const unpack = async a => zip.unzipSync(new Uint8Array(await H.build(a).arrayBuffer()));
  const doc = await unpack({type:'docx', content:'# A & B\nSecond paragraph 👍'});
  assert.match(zip.strFromU8(doc['word/document.xml']), /A &amp; B/);
  assert.match(zip.strFromU8(doc['_rels/.rels']), /word\/document.xml/);
  const xls = await unpack({type:'xlsx', content:'[["Name",2026,true,null,"=1+1"],["Fezzy"]]'});
  const sheet = zip.strFromU8(xls['xl/worksheets/sheet1.xml']);
  assert.match(sheet, /<c r="B1"><v>2026<\/v>/);
  assert.match(sheet, /<c r="C1" t="b"><v>1<\/v>/);
  assert.match(sheet, /<c r="E1" t="inlineStr"><is><t xml:space="preserve">=1\+1/);
  assert.doesNotMatch(sheet, /<f>/);
  assert.throws(() => H.build({type:'csv',content:'[[{}]]'}), /Invalid table/);
});

test('CSV uses standard quoting and protects formula-like strings', async () => {
  const H = load().HorizonOutputs;
  const out = await H.build({type:'csv',content:JSON.stringify([['name','cost'],['A, "B"',58],[' =1+1', true]])}).text();
  assert.equal(out, `"name","cost"\r\n"A, ""B""","58"\r\n"' =1+1","true"\r\n`);
});

test('contact commands resolve names/numbers and use explicit Android role approval', () => {
  const H = load().HorizonContacts;
  assert.equal(H.command('Call Thabo Mokoena').name, 'Thabo Mokoena');
  assert.equal(H.command('Could you call Dee?').name, 'Dee');
  assert.equal(H.command('Clear duplicate contacts').duplicates, true);
  assert.equal(H.command('Do not call Dee'), null);
  assert.equal(H.command('Call +27825551234').number, '+27825551234');
  const java = read('android-native/app/HorizonContactsPlugin.java');
  assert.doesNotMatch(java, /createRequestRoleIntent/);assert.match(java, /handedOff/);
  assert.match(java, /telecom\.placeCall/);
  assert.doesNotMatch(java, /setPositiveButton\("Call"|ACTION_DIAL|ACTION_CALL/);
  assert.match(java, /setPositiveButton\("Link"[\s\S]*TYPE_KEEP_TOGETHER/);
  assert.doesNotMatch(java, /ContentProviderOperation\.newDelete/);
});

test('Pollinations uses the unified image endpoint without credentials in URLs', () => {
  const H = load().HorizonPollImage;
  const url = new URL(H.urlFor('cat & bird / #', 42));
  assert.equal(url.origin, 'https://gen.pollinations.ai');
  assert.equal(url.pathname, '/image/cat%20%26%20bird%20%2F%20%23');
  assert.equal(url.searchParams.get('seed'), '42');
  assert.equal(url.searchParams.has('key'), false);
});
