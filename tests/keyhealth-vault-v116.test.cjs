'use strict';
// V1.99.116 static + unit checks: BAD key indicator (key health) and Vault export.
const assert = require('assert'), fs = require('fs'), path = require('path'), vm = require('vm');
const read = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const idx = read('www/index.html'), vault = read('www/horizon_vault.js'), kh = read('www/horizon_keyhealth.js'), css = read('www/horizon_app.css');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok', n, '-', name); };

function loadKH() {
  const store = {};
  const ctx = { window: null, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  ctx.window = ctx; ctx.addEventListener = () => {};
  ctx.__now = Date.now(); ctx.Date = { now: () => ctx.__now };
  vm.runInNewContext(kh, ctx);
  return { KH: ctx.HorizonKeyHealth, store, ctx };
}

t('key health module loads before the page script and is cache-busted', () => {
  assert.ok(idx.includes('<script src="horizon_keyhealth.js?v=1.99.116"></script>'));
  assert.ok(idx.indexOf('horizon_keyhealth.js') < idx.indexOf('horizon_vault.js'));
});
t('a 401 marks BAD, a later success clears it, nothing stores the raw key', () => {
  const { KH, store } = loadKH();
  const key = 'gsk_SECRETKEYVALUE1234567890abcd';
  KH.setNotifier(() => {});
  KH.mark('ai', 'groq', key, 'bad', { name: 'Groq', msg: 'Invalid API Key', status: 401 });
  assert.strictEqual(KH.isBad(key), true);
  assert.strictEqual(KH.badCount(), 1);
  assert.ok(!JSON.stringify(store).includes('SECRETKEYVALUE'), 'raw key must never be stored');
  KH.mark('ai', 'groq', key, 'live');
  assert.strictEqual(KH.isBad(key), false);
});
t('a soft limit never downgrades a BAD flag; limited fades after 6 hours', () => {
  const { KH, ctx } = loadKH();
  const key = 'abcdefghijklmnop1234';
  KH.mark('ai', 'x', key, 'bad', { quiet: true, status: 403 });
  KH.mark('ai', 'x', key, 'limited', { quiet: true });
  assert.strictEqual(KH.getByValue(key).s, 'bad');
  const k2 = 'zzzzzzzzzzzzzzzz9999';
  KH.mark('ai', 'x', k2, 'limited', { quiet: true });
  assert.strictEqual(KH.getByValue(k2).s, 'limited');
  ctx.__now += 7 * 3600 * 1000;
  assert.strictEqual(KH.getByValue(k2), null);
});
t('classify: 401/403 and "invalid key" are BAD, 429/402/quota are limited, network noise is nothing', () => {
  const { KH } = loadKH();
  assert.strictEqual(KH.classify({ status: 401 }), 'bad');
  assert.strictEqual(KH.classify({ status: 403 }), 'bad');
  assert.strictEqual(KH.classify({ message: 'API key not valid. Please pass a valid API key.' }), 'bad');
  assert.strictEqual(KH.classify({ status: 429 }), 'limited');
  assert.strictEqual(KH.classify({ message: 'Quota exceeded' }), 'limited');
  assert.strictEqual(KH.classify({ message: 'Failed to fetch' }), '');
  assert.strictEqual(KH.classify({ status: 500, message: 'boom' }), '');
  assert.strictEqual(KH.classify({ status: 401, stopped: true }), '');
});
t('chat wrapper flags rejected keys and clears them on success; keyless providers are skipped', () => {
  assert.ok(idx.includes("HorizonKeyHealth.mark('ai', pid, key, 'live')"));
  assert.ok(idx.includes("HorizonKeyHealth.mark('ai', pid, key, cls, { name: this.name"));
  assert.ok(/key !== 'free' && !\(this\.keyless\)/.test(idx));
});
t('scraper rotation puts a BAD key last (never drops it), flags failures and tells the user', () => {
  assert.ok(idx.includes('keys0.filter(k => !KHw.isBad(k)).concat(keys0.filter(k => KHw.isBad(k)))'));
  assert.ok(idx.includes("KHw.mark('scrape', id, keys[ki], cls"));
  assert.ok(idx.includes('Horizon is rotating to the next key'));
});
t('provider card has a BAD banner, slot rows show persisted health, Test all feeds the same flags', () => {
  assert.ok(idx.includes('data-role="keybad"'));
  assert.ok(idx.includes('function paintKeyBad(id)'));
  assert.ok(idx.includes("'BAD KEY \\u00b7 '"));
  assert.ok(idx.includes("r.c === 'bad' && r.t === 'REJECTED'"));
  assert.ok(idx.includes('PROVIDER_IDS.forEach(paintKeyBad)'));
  assert.ok(css.includes('.hz-keybad') && css.includes('.set-row.set-vault.has-badkey::after'));
});
t('re-validating a key clears its old BAD flag; nothing is auto-removed', () => {
  assert.ok(idx.includes("HorizonKeyHealth.mark('ai', id, key, 'live');   // V1.99.116"));
  const seg = idx.slice(idx.indexOf('function paintKeyBad'), idx.indexOf('// --- Provider cards ---'));
  assert.ok(!/removeKey|lsDel|saveList|setXWebKeys/.test(seg), 'the indicator must not delete anything');
  assert.ok(!/lsDel|items\s*=\s*items\.filter/.test(kh));
});
t('Vault shows BAD badges, a Bad filter and counts', () => {
  assert.ok(vault.includes("'BAD KEY'") && vault.includes("filter === 'bad'") && vault.includes('function isBadItem'));
  assert.ok(vault.includes('Delete this item when you are ready.'));
  assert.ok(css.includes('.vt-badge.bad') && css.includes('.vt-item.is-bad'));
});
t('Vault export: button, panel, three formats, three scopes, two-tap confirm, locked = hidden', () => {
  assert.ok(vault.includes('id="vtExport"') && vault.includes("id = 'vtExportPanel'"));
  ['json', 'txt', 'env'].forEach(f => assert.ok(vault.includes("v: '" + f + "'")));
  ['all', 'notes', 'keys'].forEach(f => assert.ok(vault.includes("v: '" + f + "'")));
  assert.ok(vault.includes('Tap again to save the file') && vault.includes('plain text'));
  assert.ok(/if \(locked\) \{[^}]*vtExportPanel/.test(vault));
  assert.ok(vault.includes("HorizonOutputs.saveBlob"));
  assert.ok(!vault.includes("Documents/Horizon/") && !/['"]DOCUMENTS['"]/.test(vault), 'Vault exports use the shared Downloads-only saver');
});
t('every changed JS file parses', () => {
  ['www/horizon_vault.js', 'www/horizon_keyhealth.js'].forEach(f => new vm.Script(read(f), { filename: f }));
});
