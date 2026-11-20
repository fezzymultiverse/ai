// V1.99.136: Horizon Eyes 2 (horizon_eyes.js: pixel measurement, zoom, exact colour, follow-up questions, UI tools) + index.html wiring.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const html = read('www/index.html');

// A tiny fake canvas: every drawImage paints the whole canvas one colour; remembers the crop rectangle.
function boot(opts) {
  opts = opts || {};
  const ls = Object.assign({}, opts.ls || {}), asks = [];
  const fillRGBA = opts.rgba || [255, 212, 0, 255];
  const mkCanvas = () => { const c = { width: 0, height: 0, last: null,
    getContext() { return { imageSmoothingQuality: '', drawImage(im, ...a) { c.last = a; }, getImageData(x, y, w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let i = 0; i < w * h; i++) d.set(fillRGBA, i * 4); return { data: d, width: w, height: h }; } }; },
    toDataURL() { return 'data:image/jpeg;base64,CROPPED'; } }; return c; };
  class Image { set src(v) { this.naturalWidth = 400; this.naturalHeight = 300; this.width = 400; this.height = 300; setTimeout(() => this.onload && this.onload(), 0); } }
  const sb = { window: {}, localStorage: { getItem: k => (k in ls ? ls[k] : null), setItem: (k, v) => { ls[k] = v; } }, document: { createElement: () => mkCanvas() }, Image, setTimeout, Promise, Map, Uint8ClampedArray, console };
  sb.window.HorizonLens = opts.lens || undefined;
  vm.createContext(sb); vm.runInContext(read('www/horizon_eyes.js'), sb);
  const E = sb.window.HorizonEyes;
  E.init({ ask: async (g, prompt, min) => { asks.push({ g, prompt }); return opts.noAsk ? null : { text: opts.reply || 'The banner reads: Download failed.', via: 'Groq (m)' }; }, chatId: () => 'c1', canSee: () => !!opts.sighted, ready: () => true, native: opts.native || null });   // V147: ready = a vision reader is switched on (helpers), the path these tests cover
  return { E, asks, ls, sb };
}
const PIC = { mime: 'image/png', b64: 'QUJD'.repeat(40) };

test('colour names: yellow is yellow, and the measured hex is exact', () => {
  const { E } = boot(), t = E._t;
  assert.equal(t.nameColor(255, 212, 0), 'yellow'); assert.equal(t.nameColor(0, 0, 0), 'black'); assert.equal(t.nameColor(255, 255, 255), 'white');
  assert.equal(t.nameColor(30, 100, 255), 'blue'); assert.equal(t.nameColor(128, 128, 128), 'grey'); assert.equal(t.nameColor(220, 30, 30), 'red');
  assert.equal(t.nameColor(0, 200, 90), 'green'); assert.equal(t.nameColor(120, 70, 30), 'brown'); assert.equal(t.toHex(255, 212, 0), '#FFD400');
});
test('palette + 3x3 grid of a split picture: yellow on top, blue below', () => {
  const { E } = boot(), W = 30, H = 30, d = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d.set(y < 15 ? [255, 212, 0, 255] : [20, 60, 220, 255], (y * W + x) * 4);
  const txt = E._t.describeRGBA(d, W, H, { w: 800, h: 600, bytes: 5000 });
  assert.match(txt, /PIXEL MEASUREMENTS/); assert.match(txt, /size 800x600 px, landscape/);
  assert.match(txt, /palette: (?:yellow #FFD400 50%, blue #143CDC 50%|blue #143CDC 50%, yellow #FFD400 50%)/);
  assert.match(txt, /top-left: yellow #FFD400/); assert.match(txt, /bottom-right: blue #143CDC/);
});
test('transparent pixels are ignored by the palette', () => {
  const { E } = boot(), d = new Uint8ClampedArray(4 * 4); d.set([10, 200, 10, 255], 0); d.set([255, 0, 0, 0], 4); d.set([255, 0, 0, 0], 8); d.set([10, 200, 10, 255], 12);
  const p = E._t.paletteRect(d, 4, 0, 0, 4, 1, 3); assert.equal(p.total, 2); assert.equal(p.colors[0].name, 'green');
});
test('regions and points parse the ways a model will write them', () => {
  const { E } = boot(), r = E._t.parseRegion, p = E._t.parsePoint;
  assert.equal(r('top-left').x + r('top-left').y, 0); assert.ok(Math.abs(r('bottom right').x - 2 / 3) < 1e-9);
  assert.equal(r('Top Half').h, 0.5); assert.equal(r('upper left corner').label, 'top-left'); assert.equal(r('centre').label, 'center');
  const n = r('10, 60, 50, 25%'); assert.equal([n.x, n.y, n.w, n.h].map(v => Math.round(v * 100)).join(), '10,60,50,25');
  assert.equal(r('the moon'), null);
  const a = p('50%, 20%'); assert.equal(a.fx + ',' + a.fy, '0.5,0.2'); assert.ok(Math.abs(p('bottom-right').fx - 5 / 6) < 1e-9); assert.equal(p('nowhere'), null);
});
test('tag parser: all five tags, bare see.ui, fenced code ignored, max 3', () => {
  const { E } = boot();
  const c = E.parse('[[see.ask: 2 | what does it say?]] [[see.zoom: 1 | top-right | read it]] [[see.color: 1 | 50%,20%]] [[see.ui]] [[see.shot]]');
  assert.equal(c.length, 3); assert.equal(JSON.stringify(c.map(x => x.kind)), JSON.stringify(['see.ask', 'see.zoom', 'see.color'])); assert.ok(c.every(x => x.se === true));
  assert.equal(JSON.stringify(E.parse('[[see.ui]]').map(x => [x.kind, x.arg])), JSON.stringify([['see.ui', '']])); assert.equal(E.parse('[[see.shot]]')[0].kind, 'see.shot');
  assert.equal(E.parse('```\n[[see.ask: 1 | q]]\n```').length, 0); assert.equal(E.parse('[[see.nothing: 1]]').length, 0);
  assert.equal(E._t.splitPic('3 | hello').n, 3); assert.equal(E._t.splitPic('hello | there').n, 0);
  assert.ok(new RegExp(E.SRC, 'gi').test('x [[see.ui]] y'));
});
test('store: pictures keep their number, are capped at 8, and see.* on an empty chat says so', async () => {
  const { E } = boot();
  assert.match((await E.run('see.ask', 'q')).text, /^ERROR: there is no picture in this chat/); assert.match((await E.run('see.ask', '1 | q')).text, /no picture #1 in this chat\. Pictures available: none/);
  const a = E.register('c1', PIC, { via: 'G', desc: 'd' }), b = E.register('c1', { mime: 'image/png', b64: 'ZZZZ'.repeat(40) }, {});
  assert.equal(a, 1); assert.equal(b, 2); assert.equal(E.register('c1', PIC, {}), 1);
  for (let i = 0; i < 12; i++) E.register('c1', { mime: 'image/png', b64: ('Y' + i).repeat(60) }, {});
  assert.equal(E.count('c1'), 8); assert.equal(E.get('c1', 1), null);
  assert.match((await E.run('see.ask', '1 | q')).text, /no picture #1 in this chat\. Pictures available: #/);
  assert.equal(E.count('other'), 0);
});
test('see.ask sends the REAL picture and the question to the vision reader, and labels the answer as its reading', async () => {
  const t = boot(); t.E.register('c1', PIC, {});
  const r = await t.E.run('see.ask', '1 | What does the red banner say?');
  assert.equal(t.asks.length, 1); assert.equal(t.asks[0].g.b64, PIC.b64); assert.match(t.asks[0].prompt, /red banner/); assert.match(t.asks[0].prompt, /never guess/);
  assert.match(r.text, /PICTURE #1 \(read by Groq \(m\), a vision model: it can be wrong/); assert.match(r.text, /Download failed/);
  assert.match((await t.E.run('see.ask', '1')).text, /^ERROR: write the question/);
});
test('see.ask with no ready vision reader says so and never invents an answer', async () => {
  const t = boot({ noAsk: true }); t.E.register('c1', PIC, {});
  assert.match((await t.E.run('see.ask', '1 | q')).text, /^ERROR: no vision provider answered[\s\S]*Do not guess/);
});
test('see.zoom crops the right region, enlarges it, and attaches measured colours of that region', async () => {
  const t = boot(); t.E.register('c1', PIC, {});
  const r = await t.E.run('see.zoom', '1 | bottom-right | what is the price?');
  assert.equal(t.asks.length, 1); assert.equal(t.asks[0].g.b64, 'CROPPED'); assert.match(t.asks[0].prompt, /ZOOMED, enlarged crop \(bottom-right/); assert.match(t.asks[0].prompt, /price/);
  assert.match(r.text, /ZOOM bottom-right/); assert.match(r.text, /PIXEL MEASUREMENTS OF THIS REGION/); assert.match(r.text, /yellow #FFD400/);
  assert.match((await t.E.run('see.zoom', '1 | the moon')).text, /^ERROR: unknown region/);
});
test('see.color returns the measured pixel colour, several points at once', async () => {
  const t = boot(); t.E.register('c1', PIC, {});
  const r = await t.E.run('see.color', '1 | 50%,20%; bottom-left');
  assert.match(r.text, /EXACT PIXEL COLOURS \(measured by the app/); assert.match(r.text, /50%,20% \(pixel 200,60\): yellow #FFD400 rgb\(255,212,0\)/); assert.match(r.text, /bottom-left \(centre\)/);
  assert.equal(t.asks.length, 0, 'colour never goes through a vision model');
  assert.match((await t.E.run('see.color', '1 | somewhere odd')).text, /^ERROR: give a point/);
});
test('see.ui returns the live UI map, and refuses honestly when Lens is off or missing', async () => {
  let t = boot({ lens: { enabled: () => true, report: () => 'CHAT SCREEN:\n  button#send 44x44 px #FFD400 on #101010 contrast 12.4' } });
  assert.match((await t.E.run('see.ui', '')).text, /LIVE UI MAP[\s\S]*button#send 44x44/);
  t = boot({ lens: { enabled: () => false, report: () => 'x' } }); assert.match((await t.E.run('see.ui', '')).text, /^ERROR: the UI Lens is off[\s\S]*Do not guess/);
  t = boot(); assert.match((await t.E.run('see.ui', '')).text, /^ERROR: the UI Lens is not available/);
});
test('see.shot captures, registers the picture, reads it and measures it; refuses outside the app', async () => {
  const lens = { enabled: () => true, shot: async () => ({ mime: 'image/jpeg', b64: 'U0hPVA=='.repeat(30) }), report: () => '' };
  let t = boot({ lens, native: () => 1, reply: 'Settings screen. A red banner: Download failed.' });
  const r = await t.E.run('see.shot', '');
  assert.match(r.text, /PICTURE #1 = a fresh screenshot/); assert.match(r.text, /Download failed/); assert.match(r.text, /PIXEL MEASUREMENTS/); assert.match(r.text, /see\.zoom: 1/); assert.equal(t.E.count('c1'), 1);
  t = boot({ lens }); assert.match((await t.E.run('see.shot', '')).text, /only work inside the Android app/);
});
test('kill switch: tools refuse and the prompt block disappears', async () => {
  const t = boot({ ls: { horizon_eyes_tools: '0' } });
  assert.match((await t.E.run('see.ui', '')).text, /switched off/); assert.equal(t.E.block(false, 'c1'), '');
});
test('prompt block: text-only model gets all tools; a sighted model only the UI map; lite is short', () => {
  let t = boot({ native: () => 1 }); t.E.register('c1', PIC, {}); const full = t.E.block(false, 'c1');   // V147: the long manual is gone; with a picture in the chat the short block names every tool
  ['[[see.ask: n', '[[see.zoom: n', '[[see.find: n', '[[see.color: n', '[[see.ui]]', '[[see.shot]]', 'cannot see pictures', 'Never invent'].forEach(s => assert.ok(full.includes(s), s));
  assert.ok(full.length < 1500, 'compact: ' + full.length);
  const lite = t.E.block(true, 'c1'); assert.ok(lite.length <= full.length && lite.includes('[[see.zoom: n') && lite.includes('[[see.color: n'));
  assert.ok(boot({ native: () => 1 }).E.block(false, 'empty').length < 400, 'no picture in the chat: only the UI tools are mentioned');
  t = boot({ sighted: true }); const s = t.E.block(false, 'c1'); assert.ok(s.includes('[[see.ui]]') && !s.includes('[[see.zoom')); assert.equal(t.E.block(true, 'c1'), '');
});

test('wiring in index.html: module, tool loop, strip, prompt guard, Lens screenshot for text-only models', () => {
  assert.match(html, /<script src="horizon_eyes\.js\?v=1\.99\.\d+"><\/script>/);
  assert.ok(html.indexOf('horizon_eyes.js') > html.indexOf('horizon_ground.js') && html.indexOf('horizon_eyes.js') < html.indexOf('horizon_studio.js'));
  assert.match(html, /const seCalls = \(window\.HorizonEyes && HorizonEyes\.isOn\(\)/); assert.match(html, /concat\(daCalls, grCalls, seCalls\)/);
  assert.match(html, /if \(c\.se\) \{[\s\S]*HorizonEyes\.run\(c\.kind, c\.arg, chat\.id\)/);
  assert.match(html, /HorizonEyes\.SRC : '\(\?!x\)x', 'gi'\)/);
  assert.match(html, /function getSystemPrompt\(\) \{\n\s+if \(eyesSys\) return eyesSys;/); assert.match(html, /function getLitePrompt\(\) \{\n\s+if \(eyesSys\) return eyesSys;/);
  assert.match(html, /canSee: \(\) => canSeeImages\(state\.active, state\.models\[state\.active\]\) \|\| eyesSources\(state\.active\)\.length > 0/);
  assert.match(html, /eyesFix\(base, p, model, qn\.split\('\\n\\n\['\)\[0\], chat\.id\)/);
  assert.match(html, /prov === 'groq' && \/llama-4\|scout/);
  assert.match(read('www/horizon_toolpolicy.js'), /HorizonEyes\.block\(!!o\.lite, o\.chatId\)/);
  assert.match(read('www/horizon_lens.js'), /HORIZON EYES \(for models that cannot see\)/);
});
test('the vision read gets the tiny image-reader prompt, set only for the synchronous call and then cleared', async () => {
  const src = html.split('// EYES-BEGIN')[1].split('// EYES-END')[0].replace('const EYES_HELPERS = false;', 'const EYES_HELPERS = true;'); let seen = null, after = null;
  const PROVIDERS = { groq: { name: 'Groq', defaultModel: 'm', chat: async function () { seen = ctx.eyesSysProbe(); return 'A long enough description of the picture.'; } } };
  const ctx = { PROVIDERS, PROVIDER_IDS: ['groq'], state: { models: {}, active: 'chatat' }, lsGet: () => null, canSeeImages: () => true, keyOf: () => 'K', window: {}, setTimeout, clearTimeout, Promise, String, Map };
  vm.createContext(ctx); vm.runInContext(src + ';this.eyesSysProbe=()=>eyesSys;this.api={eyesAsk};', ctx);
  const r = await ctx.api.eyesAsk({ mime: 'image/png', b64: 'A'.repeat(100) }, 'q', 'chatat', 20); after = ctx.eyesSysProbe();
  assert.match(seen, /precise image reader/); assert.equal(after, ''); assert.match(r.via, /^Groq/);
});
test('eyesFix + module together: description, measured facts, picture number and the look-again hint reach the text-only model; same picture keeps #1', async () => {
  const t = boot(); const src = html.split('// EYES-BEGIN')[1].split('// EYES-END')[0].replace('const EYES_HELPERS = false;', 'const EYES_HELPERS = true;'); let calls = 0;
  const mk = (n, name, kl, f) => ({ name, keyless: kl, defaultModel: 'm', chat: async () => { calls++; return f; } });
  const PROVIDERS = { chatat: mk(0, 'ch.at', true, 'x'), groq: mk(1, 'Groq', false, 'A settings screen. Red banner at the top: Download failed. Toggle File access is ON.') };
  const ctx = { PROVIDERS, PROVIDER_IDS: ['chatat', 'groq'], state: { models: {}, active: 'chatat', currentId: 'cX' }, lsGet: () => null, canSeeImages: id => id === 'groq', keyOf: id => (id === 'groq' ? 'K' : ''), window: { HorizonEyes: t.E }, HorizonEyes: t.E, setTimeout, clearTimeout, Promise, String, Map };
  vm.createContext(ctx); vm.runInContext(src + ';this.api={eyesFix};', ctx);
  const msgs = [{ role: 'user', text: 'what is this?', imgs: [PIC] }];
  const via = await ctx.api.eyesFix(msgs, PROVIDERS.chatat, 'gpt-4o', 'what is this?', 'cX');
  assert.match(via, /^Groq/); assert.equal(msgs[0].imgs, undefined);
  assert.match(msgs[0].text, /\[PICTURE #1 - read for you by Groq/); assert.match(msgs[0].text, /\[\[see\.ask: n \| question\]\]/); assert.match(msgs[0].text, /Download failed/);
  assert.match(msgs[0].text, /PIXEL MEASUREMENTS[\s\S]*yellow #FFD400/); assert.equal(t.E.count('cX'), 1);
  const again = [{ role: 'user', text: 'and now?', imgs: [PIC] }]; await ctx.api.eyesFix(again, PROVIDERS.chatat, 'gpt-4o', 'and now?', 'cX');
  assert.match(again[0].text, /\[PICTURE #1 /); assert.equal(calls, 1, 'described once (cache)'); assert.equal(t.E.count('cX'), 1);
});
