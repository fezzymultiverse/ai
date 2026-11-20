'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const W = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
test('V118: a failed start keeps the card open with the reason and a RETRY button', () => {
  const w = W('horizon_watch.js');
  assert.ok(w.includes('showFail('), 'showFail used');
  assert.ok(w.includes('COULD NOT PLAY'));
  assert.ok(w.includes('hzw-retry'));
  assert.ok(/player error ' \+ code/.test(w), 'MediaError code is reported');
  assert.ok(!/if \(!r\.ok\) \{ setStatus\(r\.why \|\| 'Could not play'\); if \(!\/tap the picture\/\.test\(r\.why \|\| ''\)\) \{ stop\(\); \}/.test(w), 'old instant-close is gone');
  assert.ok(W('horizon_layout.css').includes('.hzw-retry'));
});
test('V118: yt.watch tries up to 3 routes like yt.play and reports each', () => {
  const i = W('index.html'), a = i.indexOf('async function ytWatchTool'), b = i.indexOf('async function imgSearchTool');
  const seg = i.slice(a, b);
  assert.ok(/attempt < 3/.test(seg));
  assert.ok(seg.includes('skip.push(via)'));
  assert.ok(seg.includes('retry: again'));
  assert.ok(seg.includes('Do not claim it played'));
});
test('V118: watch module behaves in a fake DOM (fail keeps card, retry fires, X closes)', () => {
  const mk = () => { const el = { hidden: false, style: {}, children: [], _h: {}, classList: { s: new Set(), add(c) { this.s.add(c); }, remove(c) { this.s.delete(c); }, toggle(c, f) { f ? this.s.add(c) : this.s.delete(c); }, contains(c) { return this.s.has(c); } },
    setAttribute(k,v) { this[k]=v; }, appendChild(c) { this.children.push(c); }, replaceChildren() {}, addEventListener(t, f) { (this._h[t] = this._h[t] || []).push(f); }, removeEventListener() {}, removeAttribute() {}, load() {}, pause() {}, play() { return Promise.resolve(); }, textContent: '', set innerHTML(h) { this._ih = h; }, get innerHTML() { return this._ih; }, _q: {} };
    el.querySelector = sel => (el._q[sel] = el._q[sel] || mk()); return el; };
  const media = mk(); const made = [];
  global.window = global; global.document = { getElementById: id => id === 'hzRpMedia' ? media : null, createElement: () => { const e = mk(); made.push(e); return e; } };
  global.URL = { createObjectURL() { return 'blob:x'; }, revokeObjectURL() {} };
  delete require.cache[require.resolve('../www/horizon_watch.js')];
  require('../www/horizon_watch.js');
  const vcard = made[0], v = vcard._q['video'];
  // make the <video> fire an error as soon as a src is set
  v.load = function () { setTimeout(() => { v.error = { code: 4, message: 'bad' }; (v._h.error || []).forEach(f => f()); }, 0); };
  let retried = 0;
  return global.HorizonWatch.play({ id: 'abcdefghijk', title: 'T', url: 'https://x/y', via: 'try 1 vr', retry: () => { retried++; } }).then(r => {
    assert.strictEqual(r.ok, false);
    assert.ok(/player error 4 \(source not supported\)/.test(r.why), r.why);
    assert.strictEqual(vcard.hidden, false, 'card stays open');
    const st = vcard._q['.hzw-st'], rb = vcard._q['.hzw-retry'];
    assert.ok(/COULD NOT PLAY/.test(st.textContent));
    assert.strictEqual(rb.hidden, false, 'retry visible');
    rb._h.click[0]({ stopPropagation() {} });
    assert.strictEqual(retried, 1);
    assert.ok(/try 1 vr direct: player error 4/.test(global.HorizonWatch.report()));
    vcard._q['.hzw-x']._h.click[0]({ stopPropagation() {} });
    assert.strictEqual(vcard.hidden, true, 'X closes');
  });
});
