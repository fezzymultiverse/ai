'use strict';
// V1.99.27 native Edge TTS. App side runs in node:vm against a mock HorizonEdgeVoice plugin; the Kotlin side gets static checks
// (protocol markers present, no files, no Termux). No browser, no network, no Android needed.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const EDGE_SRC = read('www/horizon_edge_tts.js');
const TTS_SRC = read('www/horizon_tts.js');
const KT_DIR = 'android-native/com/festers/horizon/edge';
const KT = ['EdgeProtocol.kt', 'EdgeTtsClient.kt', 'EdgeAudioPipe.kt', 'HorizonEdgeVoicePlugin.kt', 'EdgeGec.kt'];

function mkStore() { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), _m: m }; }
function load(extra) {
  const win = Object.assign({ localStorage: mkStore(), setTimeout, clearTimeout, console }, extra || {});
  win.window = win; win.globalThis = win; win.navigator = { language: 'en-US' };
  vm.createContext(win);
  vm.runInContext(TTS_SRC, win, { filename: 'horizon_tts.js' });
  vm.runInContext(EDGE_SRC, win, { filename: 'horizon_edge_tts.js' });
  return win;
}
// Mock of the Kotlin plugin: records calls, lets the test push "edgeVoice" events.
function mockPlugin() {
  const m = { calls: [], listeners: [], speakArgs: null };
  m.addListener = async (name, fn) => { m.calls.push('addListener:' + name); m.listeners.push(fn); return { remove() {} }; };
  m.speak = async args => { m.calls.push('speak'); m.speakArgs = args; };
  m.stop = async () => { m.calls.push('stop'); };
  m.pause = async () => { m.calls.push('pause'); };
  m.resume = async () => { m.calls.push('resume'); };
  m.emit = ev => m.listeners.forEach(fn => fn(Object.assign({ id: m.speakArgs && m.speakArgs.id }, ev)));
  return m;
}
const withPlugin = p => ({ Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true, Plugins: { HorizonEdgeVoice: p } } });
const tick = () => new Promise(r => setImmediate(r));
function job(over) {
  return Object.assign({ text: 'Hello there. General Kenobi.', prov: 'groq', voice: '', cancelled: () => false, waitResume: () => Promise.resolve(),
    chunk: (t) => [t], onPlaying() {} }, over || {});
}

test('voice names are sanitised and fall back per provider, then to the default', () => {
  const E = load().HorizonEdgeTTS;
  assert.strictEqual(E.sanitizeVoice('en-GB-RyanNeural'), 'en-GB-RyanNeural');
  assert.strictEqual(E.sanitizeVoice('en-US; rm -rf ~'), '');
  assert.strictEqual(E.sanitizeVoice(''), '');
  assert.strictEqual(E.voiceFor('groq'), 'en-US-AriaNeural');
  E.setDefault('en-ZA-LeahNeural');
  assert.strictEqual(E.voiceFor('groq'), 'en-ZA-LeahNeural');
  E.setVoice('groq', 'en-GB-RyanNeural');
  assert.strictEqual(E.voiceFor('groq'), 'en-GB-RyanNeural');
  assert.strictEqual(E.voiceFor('gemini'), 'en-ZA-LeahNeural');
  E.setVoice('groq', '');
  assert.strictEqual(E.voiceFor('groq'), 'en-ZA-LeahNeural');
  assert.strictEqual(E.setDefault('bad voice!'), 'en-US-AriaNeural');
});

test('Speed slider maps to a percent rate, clamped', () => {
  const w = load(), E = w.HorizonEdgeTTS;
  assert.strictEqual(E.ratePct(), 0);
  w.HorizonTTS.set('rate', 1.25); assert.strictEqual(E.ratePct(), 25);
  w.HorizonTTS.set('rate', 0.5); assert.strictEqual(E.ratePct(), -50);
  w.HorizonTTS.set('rate', 2); assert.strictEqual(E.ratePct(), 100);
});

test('wants(): needs the native plugin, the switch, and honours the failure cooldown', () => {
  const none = load().HorizonEdgeTTS;
  none.setEnabled(true);
  assert.strictEqual(none.wants({}), false, 'no plugin = Android voice');
  assert.strictEqual(none.wants({ forceEdge: true }), false, 'even the Test button needs the plugin');
  const E = load(withPlugin(mockPlugin())).HorizonEdgeTTS;
  assert.strictEqual(E.wants({}), false, 'off by default');
  E.setEnabled(true);
  assert.strictEqual(E.wants({}), true);
  E.failed(new Error('x'));
  assert.strictEqual(E.wants({}), false);
  assert.strictEqual(E.wants({ forceEdge: true }), true);
  E.setEnabled(true);
  assert.strictEqual(E.wants({}), true, 'flipping the switch clears the cooldown');
  const web = load({ Capacitor: { isNativePlatform: () => false, Plugins: { HorizonEdgeVoice: mockPlugin() } } }).HorizonEdgeTTS;
  web.setEnabled(true);
  assert.strictEqual(web.wants({}), false, 'browser preview never uses the native plugin');
});

test('play(): one speak() call with all chunks, playing then ended resolves true', async () => {
  const p = mockPlugin(), w = load(withPlugin(p)), E = w.HorizonEdgeTTS;
  let playing = 0;
  const done = E.play(job({ voice: 'en-GB-RyanNeural', chunk: () => ['One.', 'Two.'], onPlaying() { playing++; } }));
  await tick(); await tick();
  assert.deepStrictEqual(p.calls.filter(c => c === 'speak'), ['speak']);
  assert.deepStrictEqual(p.speakArgs.chunks, ['One.', 'Two.']);
  assert.strictEqual(p.speakArgs.voice, 'en-GB-RyanNeural');
  assert.strictEqual(p.speakArgs.ratePct, 0);
  assert.match(p.speakArgs.id, /^edge_\d+_\d+$/);
  p.emit({ event: 'playing', started: true }); p.emit({ event: 'playing', started: true });
  assert.strictEqual(playing, 1, 'onPlaying fires once');
  p.emit({ event: 'ended', started: true });
  assert.strictEqual(await done, true);
});

test('play(): provider voice is used when the job has none; events of other ids are ignored', async () => {
  const p = mockPlugin(), E = load(withPlugin(p)).HorizonEdgeTTS;
  E.setVoice('groq', 'en-AU-NatashaNeural');
  const done = E.play(job({ prov: 'groq' }));
  await tick(); await tick();
  assert.strictEqual(p.speakArgs.voice, 'en-AU-NatashaNeural');
  p.listeners.forEach(fn => fn({ id: 'someone-else', event: 'ended' }));
  let settled = false; done.then(() => { settled = true; });
  await tick(); assert.strictEqual(settled, false);
  p.emit({ event: 'ended' });
  assert.strictEqual(await done, true);
});

test('play(): failure before any sound rejects (HorizonTTS then uses the Android voice)', async () => {
  const p = mockPlugin(), E = load(withPlugin(p)).HorizonEdgeTTS;
  const done = E.play(job());
  await tick(); await tick();
  p.emit({ event: 'error', message: 'Edge voice refused the connection (HTTP 403)', started: false });
  await assert.rejects(done, /HTTP 403/);
});

test('play(): failure after sound started ends quietly (no second read) and starts the cooldown', async () => {
  const p = mockPlugin(), E = load(withPlugin(p)).HorizonEdgeTTS;
  E.setEnabled(true);
  const done = E.play(job());
  await tick(); await tick();
  p.emit({ event: 'playing', started: true });
  p.emit({ event: 'error', message: 'Edge voice connection closed early', started: true });
  assert.strictEqual(await done, true);
  assert.strictEqual(E.wants({}), false);
});

test('play(): speak() rejection (plugin not registered natively) rejects', async () => {
  const p = mockPlugin(); p.speak = async () => { throw new Error('"HorizonEdgeVoice" plugin is not implemented on android'); };
  const E = load(withPlugin(p)).HorizonEdgeTTS;
  await assert.rejects(E.play(job()), /not implemented/);
});

test('stop() resolves play() false and stops the plugin; pause/resume are forwarded', async () => {
  const p = mockPlugin(), E = load(withPlugin(p)).HorizonEdgeTTS;
  const done = E.play(job());
  await tick(); await tick();
  E.setPaused(true); E.setPaused(false);
  E.stop();
  assert.strictEqual(await done, false);
  await tick();
  assert.deepStrictEqual(p.calls.filter(c => /^(pause|resume|stop)$/.test(c)), ['pause', 'resume', 'stop']);
  E.stop();   // nothing playing: no extra native call
  await tick();
  assert.strictEqual(p.calls.filter(c => c === 'stop').length, 1);
});

test('HorizonTTS routes to Edge when it wants the reply, and reports playing then idle', async () => {
  const w = load(), T = w.HorizonTTS, seen = [];
  let got = null;
  T.registerEdge({ wants: () => true, stop() {}, setPaused() {}, failed() {}, async play(j) { got = j; j.onPlaying(); return true; } });
  T.onState(s => seen.push(s.state + ':' + s.engine));
  const ok = await T.speak('m1', 'Hello there. **Bold** text.', { prov: 'groq', slot: 2 });
  assert.strictEqual(ok, true);
  assert.strictEqual(got.prov, 'groq');
  assert.ok(got.text.length > 0 && typeof got.chunk === 'function' && typeof got.waitResume === 'function');
  assert.deepStrictEqual(seen, ['loading:native', 'playing:edge', 'idle:']);
});

test('HorizonTTS falls through to the Android voice when Edge fails (never silent, never stuck)', async () => {
  const w = load(), T = w.HorizonTTS, seen = [];
  let failedWith = '';
  T.registerEdge({ wants: () => true, stop() {}, setPaused() {}, failed(e) { failedWith = e.message; }, async play() { throw new Error('Edge voice timed out'); } });
  T.onState(s => seen.push(s.state + ':' + (s.note || s.error || '')));
  const ok = await T.speak('m2', 'Hello there.', { prov: 'groq' });
  assert.strictEqual(ok, false);
  assert.strictEqual(failedWith, 'Edge voice timed out');
  assert.ok(seen.some(s => /Edge voice failed \(Edge voice timed out\)/.test(s)), seen.join(' | '));
  assert.ok(seen.some(s => /^error:Android TTS is available/.test(s)), 'Android path still runs');
  assert.strictEqual(T.status().state, 'idle');
});

test('Edge off or not wanted: HorizonTTS behaves exactly as before', async () => {
  const w = load(), T = w.HorizonTTS;
  let called = false;
  T.registerEdge({ wants: () => false, stop() {}, setPaused() {}, failed() {}, async play() { called = true; return true; } });
  await T.speak('m3', 'Hello there.');
  assert.strictEqual(called, false);
  T.registerEdge(null);
  await T.speak('m4', 'Hello there.');
});

test('Termux is gone from the Edge path (JS, Kotlin, scripts)', () => {
  assert.ok(!/termux/i.test(EDGE_SRC), 'horizon_edge_tts.js must not mention Termux');
  assert.ok(!fs.existsSync(path.join(root, 'scripts/horizon_edge_tts.sh')), 'Termux script is removed');
  for (const f of KT) assert.ok(!/termux|edge-tts\b/i.test(read(KT_DIR + '/' + f).replace(/edge-tts CLI|edge-tts-pump/g, '')), f);
  assert.ok(!/SCRIPT_B64|buildSpeakCommand|HorizonTermux|\/sdcard/.test(EDGE_SRC));
});

test('Kotlin side: real Edge endpoint + protocol markers, streamed from memory, no files', () => {
  for (const f of KT) assert.ok(fs.existsSync(path.join(root, KT_DIR, f)), f + ' exists');
  const proto = read(KT_DIR + '/EdgeProtocol.kt'), client = read(KT_DIR + '/EdgeTtsClient.kt'), pipe = read(KT_DIR + '/EdgeAudioPipe.kt'), plug = read(KT_DIR + '/HorizonEdgeVoicePlugin.kt');
  assert.match(proto, /wss:\/\/speech\.platform\.bing\.com\/consumer\/speech\/synthesize\/readaloud\/edge\/v1/);
  assert.match(proto, /6A5AA1D4EAFF4E9FB37E23D68491D6F4/);
  assert.match(proto, /EdgeGec\.token/); assert.match(proto, /"2-"/); assert.match(proto, /11_644_473_600L/); assert.match(proto, /ticks % 300L/);
  assert.match(proto, /Path:speech\.config/); assert.match(proto, /Path:ssml/); assert.match(proto, /audio-24khz-48kbitrate-mono-mp3/);
  assert.match(proto, /Path:audio/);
  assert.match(client, /Sec-MS-GEC=/); assert.match(client, /Sec-MS-GEC-Version=" \+ EdgeProtocol\.gecVersionParam/); assert.match(client, /Origin/); assert.match(client, /newWebSocket/);
  assert.match(client, /Path:turn\.end/); assert.match(client, /403/);
  assert.match(pipe, /BaseDataSource/); assert.match(pipe, /LENGTH_UNSET/);
  assert.match(plug, /@CapacitorPlugin\(name = "HorizonEdgeVoice"\)/); assert.match(plug, /ExoPlayer/); assert.match(plug, /ProgressiveMediaSource/);
  assert.match(plug, /notifyListeners\("edgeVoice"/);
  for (const m of ['speak', 'stop', 'pause', 'resume', 'state']) assert.match(plug, new RegExp('@PluginMethod\\s+fun ' + m + '\\('));
  for (const [f, src] of [['proto', proto], ['client', client], ['pipe', pipe], ['plugin', plug]])
    assert.ok(!/FileOutputStream|createTempFile|cacheDir|filesDir|File\(|MediaPlayer\(|ServerSocket|127\.0\.0\.1|localhost/.test(src), f + ': no temp files, no loopback server');
  // the JS names must match the Kotlin names
  assert.match(EDGE_SRC, /PLUGIN = 'HorizonEdgeVoice'/); assert.match(EDGE_SRC, /addListener\('edgeVoice'/);
});

test('Kotlin side: balanced braces and parentheses in every file (cheap syntax tripwire, no kotlinc here)', () => {
  for (const f of KT) {
    const src = read(KT_DIR + '/' + f).replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])'/g, '""').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    for (const [o, c] of [['{', '}'], ['(', ')'], ['[', ']']]) assert.strictEqual(src.split(o).length, src.split(c).length, f + ' ' + o + c);
  }
});

test('wiring: script tag, provider passed from speaker button and auto-read', () => {
  const html = read('www/index.html'), ar = read('www/horizon_autoread.js');
  assert.ok(html.indexOf('horizon_tts.js') < html.indexOf('horizon_edge_tts.js'), 'edge module loads after horizon_tts.js');
  assert.match(html, /horizon_edge_tts\.js\?v=1\.99\.\d+/);
  assert.match(html, /T\.toggle\(id, text, \{ slot:[^}]*prov: pv \|\| '' \}\)/);
  assert.match(ar, /slot: job\.slot, prov: job\.prov/);
  assert.match(ar, /prov: \(m && m\.prov\) \|\| ''/);
});
