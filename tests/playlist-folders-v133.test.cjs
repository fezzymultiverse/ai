// V1.99.133: playlist folders, play-before-download, playlist.add / playlist.delete, prompt guidance (node:vm, mocked host).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const www = f => fs.readFileSync(path.join(__dirname, '..', 'www', f), 'utf8');
function boot() {
  const store = {};
  const W = { localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, HorizonOutputs: null };
  W.window = W; W.document = { currentScript: null, createElement: () => ({}) }; W.location = { href: 'file:///www/' };
  W.URL = URL; W.Blob = Blob; W.console = console;
  vm.createContext(W); vm.runInContext(www('horizon_studio.js'), W);
  return W;
}
test('download saves into Horizon/<playlist> with numbered files', async () => {
  const W = boot(), S = W.HorizonStudio, calls = [];
  S.init({ get: async (q, o) => { calls.push([q, o]); return { text: 'SAVED (verified): ' + q }; }, track: async () => ({ text: 'Started: x' }), rescan: async () => {} });
  S.create({ name: 'Night: drive?', tracks: ['A - One', 'B - Two'] });
  const r = await S.download('Night: drive?');
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].folder, 'Horizon/Night_ drive_');
  assert.equal(calls[0][1].prefix, '01 - ');
  assert.equal(calls[1][1].prefix, '02 - ');
  assert.match(r.text, /2\/2 tracks on the phone, in the folder Download\/Horizon\/Night_ drive_/);
});
test('create with play+download plays FIRST, then downloads', async () => {
  const W = boot(), S = W.HorizonStudio, order = [];
  S.init({ get: async () => { order.push('get'); return { text: 'SAVED x' }; }, track: async () => { order.push('track'); return { text: 'Started: x' }; }, rescan: async () => {} });
  const r = await S.run('playlist.create', JSON.stringify({ name: 'Mix', play: true, download: true, tracks: ['A - One', 'B - Two'] }));
  assert.deepEqual(order, ['track', 'track', 'get', 'get']);
  assert.match(r.text, /Saved playlist "Mix"/); assert.match(r.text, /Started playlist/); assert.match(r.text, /Download\/Horizon\/Mix/);
});
test('playlist.add appends without duplicates, delete removes only the list', async () => {
  const W = boot(), S = W.HorizonStudio;
  S.init({ get: async () => ({ text: 'SAVED' }), track: async () => ({ text: 'Started' }) });
  await S.run('playlist.create', JSON.stringify({ name: 'Mix', tracks: ['A - One'] }));
  const a = await S.run('playlist.add', JSON.stringify({ name: 'mix', tracks: ['A - One', 'B - Two', 'C - Three'] }));
  assert.match(a.text, /Added 2 track\(s\)/); assert.equal(S.get('Mix').tracks.length, 3);
  const d = await S.run('playlist.delete', 'Mix'); assert.match(d.text, /Deleted playlist/); assert.match(d.text, /NOT deleted/);
  assert.match((await S.run('playlist.list', '')).text, /No saved playlists/);
  assert.match((await S.run('playlist.delete', 'Mix')).text, /^ERROR: Playlist not found/);
});
test('parse recognises add and delete tags', () => {
  const S = boot().HorizonStudio;
  assert.equal(S.parse('[[playlist.add: {"name":"x","tracks":["a - b"]}]]')[0].kind, 'playlist.add');
  assert.equal(S.parse('[[playlist.delete: x]]')[0].kind, 'playlist.delete');
});
test('prompts steer the AI to playlist.create, and the old hand-queue advice is gone', () => {
  const s = www('horizon_studio.js'), t = www('horizon_toolpolicy.js'), h = www('index.html');
  assert.match(s, /YOU choose 8-15 real/); assert.match(s, /Download\/Horizon\/<playlist name>/);
  assert.doesNotMatch(t, /queue the rest in order with yt\.queue/); assert.doesNotMatch(t, /Native playlists use search and queue/);
  assert.doesNotMatch(h, /PLAYLISTS: search the tracks natively/);
});
test('wiring: folder reaches the native saver', () => {
  const h = www('index.html'), k = fs.readFileSync(path.join(__dirname, '..', 'android-native/app/HorizonAIPlugin.kt'), 'utf8');
  assert.match(h, /get: \(q, o\) => ytGetTool\(q, o\)/); assert.match(h, /folder: \(d && d\.folder\) \|\| undefined/);
  assert.match(h, /if \(opts && opts\.folder\) d\.folder/); assert.match(h, /\(prog && prog\.prefix\)/);
  assert.match(k, /call\.getString\("folder"\)/); assert.match(k, /DIRECTORY_DOWNLOADS \+ "\/" \+ sub/);
});
