const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const www = path.join(__dirname, '..', 'www');
globalThis.window = globalThis;
require(path.join(www, 'horizon_model_inventory.js'));
require(path.join(www, 'horizon_model_policy.js'));
const M = globalThis.HorizonModelPolicy;
const p = { name: 'Demo', defaultModel: 'good-model', headers: k => ({ Authorization: 'Bearer ' + k }), chatUrl: 'https://x/chat', fallbackModels: ['good-model', 'other-model'] };
const mk = map => async (url, opt) => { const m = JSON.parse(opt.body).model; const r = map[m] || { s: 200 };
  return { ok: r.s === 200, status: r.s, json: async () => r.s === 200 ? { model: m, choices: [{ message: { content: 'OK' } }] } : { error: { message: r.msg || 'nope' } } }; };
test('V158: backup key test passes when the selected model is down but another answers', async () => {
  const r = await M.checkKey('demo', p, 'k', mk({ 'bad-model': { s: 404 } }), 'bad-model');
  assert.equal(r.t, 'LIVE');
});
test('V158: a rejected key is still REJECTED, no extra probes rescue it', async () => {
  const r = await M.checkKey('demo', p, 'k', mk({ 'bad-model': { s: 401, msg: 'invalid key' }, 'good-model': { s: 200 } }), 'bad-model');
  assert.equal(r.t, 'REJECTED');
});
test('V158: when every model fails it is still ERROR; 402 is LIMITED', async () => {
  assert.equal((await M.checkKey('demo', p, 'k', mk({ 'bad-model': { s: 404 }, 'good-model': { s: 404 }, 'other-model': { s: 404 } }), 'bad-model')).t, 'ERROR');
  assert.equal((await M.checkKey('demo', p, 'k', mk({ 'bad-model': { s: 402 } }), 'bad-model')).t, 'LIMITED');
});
test('V158: WhatsApp and check-in cards are mounted beside #daemonCard, never inside it', () => {
  for (const f of ['horizon_wabot.js', 'horizon_checkin.js']) {
    const s = fs.readFileSync(path.join(www, f), 'utf8');
    assert.ok(/insertBefore\(card/.test(s), f + ' must insert as a sibling');
    assert.ok(s.indexOf('insertBefore(card') < s.indexOf('host.appendChild(card)'), f + ' sibling insert must come first; append is only the fallback');
  }
});
