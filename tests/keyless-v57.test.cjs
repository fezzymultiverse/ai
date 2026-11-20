// V1.99.57: two more keyless AIs (G4F Groq, G4F Ollama). Static + pure-function checks, plain Node.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const html = R('www/index.html'), br = R('www/horizon_browser.js');
const IDS = {
  g4flocal: ['http://127.0.0.1:1337/v1', 'deepseek-r1'],
};

for (const id of Object.keys(IDS)) {
  test(id + ': keyless provider with the right base, default model, no auth header', () => {
    const i = html.indexOf('PROVIDERS.' + id + ' = oaiGateway({');
    assert.ok(i > 0, 'defined');
    const blk = html.slice(i, html.indexOf('});', i));
    assert.ok(blk.includes("base: '" + IDS[id][0] + "'"));
    assert.ok(blk.includes('keyless: true') && blk.includes('modelsOptional: true') && blk.includes('modelWalk: true'));
    assert.ok(blk.includes("defaultModel: '" + IDS[id][1] + "'"));
    assert.ok(html.includes('PROVIDERS.' + id + '.headers = () => ({});'), 'sends no Authorization header');
    assert.ok(html.includes('PROVIDERS.' + id + '.wrongKey = () => \'\';'));
    assert.ok(html.includes('id="i-b-' + id + '"'), 'icon symbol');
    assert.ok(html.includes("'card-" + id + "'"), 'card tooltip');
    assert.ok(html.includes("prov === '" + id + "'"), 'model description');
  });
  test(id + ': registered in browser tool, usage colours and voice lists', () => {
    assert.ok(br.includes("id === '" + id + "'"));
    assert.ok(R('www/horizon_usage.js').includes(id + ':'));
    assert.ok(R('www/horizon_edge_tts.js').includes("['" + id + "'"));
    assert.ok(R('scripts/edge_kit.sh').includes("['" + id + "'"));
  });
  test(id + ': parseModels takes OpenAI-style, plain-array and string lists and falls back when empty', () => {
    const m = new RegExp('PROVIDERS\\.' + id + '\\.parseModels = (d => \\{.*?\\});\\n').exec(html);
    assert.ok(m, 'parseModels found');
    const parse = new Function('return ' + m[1])();
    if (id === 'bridgenode') {
      assert.deepEqual(parse({ data: [{ id: 'paid-x', free: false }, { id: 'free-b', free: true }, { id: 'free-a', free: true }] }), ['free-a', 'free-b']);
    } else if (id === 'g4fgemini') {
      assert.deepEqual(parse({ data: [{ id: 'models/gemini-2.5-pro' }, { id: 'models/gemini-2.5-flash' }, { id: 'models/embedding-001' }, { id: 'models/gemini-live-x' }] }), ['gemini-2.5-flash', 'gemini-2.5-pro']);
    } else {
      assert.deepEqual(parse({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }] }), ['a', 'b']);
      assert.deepEqual(parse(['z', 'y']), ['y', 'z']);
      assert.deepEqual(parse({ data: [{ id: 'whisper-large' }, { id: 'text-embedding-x' }, { id: 'real-model' }] }), ['real-model']);
    }
    assert.deepEqual(parse({}), [IDS[id][1]]);
    assert.deepEqual(parse(null), [IDS[id][1]]);
  });
}
test('both sit in the keyless group (keyless flag is carried by oaiGateway)', () => {
  assert.ok(/keyless: !!cfg\.keyless/.test(html));
});
test('version and capability overview replace the historical changelog', () => {
  const a = R('www/horizon_about.js');
  assert.match(a, /var VERSION = 'V1\.99\.(?:5[789]|[6-9]\d|1\d\d)'/);
  assert.ok(a.includes('WHAT HORIZON CAN DO'));
  assert.ok(a.includes('Developer: Grant Phil Festers'));
  assert.ok(!a.includes("sec('CHANGELOG')"));
});
test('V1.99.59: LLM7.io lists DeepSeek R1 keyless in its built-in models', () => {
  const html = R('www/index.html');
  const i = html.indexOf('PROVIDERS.llm7 = oaiGateway(');
  const line = html.slice(i, html.indexOf('\n', i));
  assert.ok(line.includes("'deepseek-r1-0528'") && line.includes("'deepseek-r1'"));
  assert.ok(line.includes('optionalKey:true') && line.includes('modelWalk:true'));
  assert.ok(html.includes("prov === 'llm7' && has(/deepseek/)"));
  // Historical release notes intentionally replaced by current capabilities in V1.99.129.
});
test('V1.99.62: OVH starts on verified lighter GPT-OSS and G4F Local is registered', () => {
  const html = R('www/index.html');
  const i = html.indexOf('PROVIDERS.ovh = oaiGateway(');
  assert.ok(html.slice(i, i + 700).includes("defaultModel: 'gpt-oss-20b'"));
  assert.ok(R('www/horizon_browser.js').includes("d: 'Qwen3.5-397B-A17B'"));
  // Provider behavior is checked above; About is no longer a release-history archive.
});
test('V1.99.63: the dead providers stay removed (HTTP 402 / 404 / 401 in the live audit)', () => {
  const net = R('www/horizon_net.js');
  ['g4fnvidia', 'g4fgemini', 'g4fpoll', 'bridgenode', 'g4fgroq', 'g4follama', 'vlmrun'].forEach(id => assert.ok(!html.includes('PROVIDERS.' + id + ' = '), id + ' provider is gone'));
  ['g4f.space', 'bridgenode.cc', 'gateway.vlm.run'].forEach(h => assert.ok(!net.includes(h) && !R('android-native/app/HorizonAIPlugin.kt').includes(h), h + ' is not in any native HTTP allowlist'));
});
