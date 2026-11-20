// V1.99.134: small-model scaffold + escalation wiring (node:vm, mocked ask/host).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
function boot() {
  const store = {}; const W = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  W.window = W; W.document = { currentScript: null, createElement: () => ({}) }; W.location = { href: 'file:///www/' }; W.URL = URL; W.Blob = Blob; W.console = console;
  vm.createContext(W); vm.runInContext(www('horizon_studio.js'), W); return W.HorizonStudio;
}
test('intent: make/play/download flags and count', () => {
  const S = boot();
  const a = S.playlistIntent('make me a juice wrld playlist and download it'); assert.equal(a.play, false); assert.equal(a.download, true); assert.equal(a.count, 10);
  const b = S.playlistIntent('play and download a 12 songs gym playlist'); assert.equal(b.play, true); assert.equal(b.download, true); assert.equal(b.count, 12);
  assert.equal(S.playlistIntent('make me a lofi playlist').play, true);
  assert.equal(S.playlistIntent('delete my playlist Night drive'), null);
  assert.equal(S.playlistIntent('what is a playlist'), null);
});
test('parseSongs cleans numbering, bullets, bold, chatter and dupes', () => {
  const S = boot();
  const r = S.parseSongs('Sure! Here are some:\n1. **Juice WRLD - Lucid Dreams**\n2) Juice WRLD – Robbery (Official Video)\n- "Eminem - Lose Yourself"\n3. juice wrld - lucid dreams\nHope you like them');
  assert.equal(JSON.stringify(r), JSON.stringify(['Juice WRLD - Lucid Dreams', 'Juice WRLD - Robbery', 'Eminem - Lose Yourself']));
});
test('scaffold: retries with a narrower prompt, then builds, plays and saves into a folder', async () => {
  const S = boot(), order = [], asks = [], folders = [];
  S.init({ get: async (q, o) => { order.push('get'); folders.push(o.folder); return { text: 'SAVED ' + q }; }, track: async () => { order.push('track'); return { text: 'Started: x' }; }, rescan: async () => {} });
  const ask = async (m) => { asks.push(m[0].text); return asks.length === 1 ? {text: 'I cannot do that', via: ''} : {text: 'Aa Band - One\nBb Band - Two\nCc Band - Three\nDd Band - Four', via: 'Big (70b)'}; };
  const r = await S.scaffold('make me a chill playlist, play and keep them', ask);
  assert.equal(asks.length, 2); assert.match(asks[1], /exactly 10 lines/);
  assert.equal(r.kind, 'playlist.create'); assert.match(r.text, /Download\/Horizon\/Chill/); assert.match(r.text, /came from Big \(70b\)/);
  assert.equal(order.join(), 'track,track,track,track,get,get,get,get'); assert.equal(folders[0], 'Horizon/Chill');
});
test('scaffold gives up (null) when the model cannot name 4 songs, so chat flow runs', async () => {
  const S = boot(); S.init({}); assert.equal(await S.scaffold('make me a rock playlist', async () => ({text: 'no', via: ''})), null);
});
test('wiring: escalation tries stronger providers first, chat provider last; Worker excluded', () => {
  const h = www('index.html');
  assert.match(h, /async function escalatedAsk/); assert.ok(h.includes("Horizon Worker( [23])?$/.test(q.name)")); assert.match(h, /return \{ text: String\(await fallback\(msgs\)/);
  assert.match(h, /nativePre\(liveCtx && liveCtx\.prov, chat, m => p\.chat\(key, model, m\)\)/); assert.match(h, /horizon_escalate/);
});
