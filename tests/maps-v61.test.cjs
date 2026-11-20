const test = require('node:test'); const assert = require('node:assert'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function load() {
  const sandbox = { window: {}, document: { getElementById() { return null; }, querySelector() { return null; } }, localStorage: { getItem() { return null; }, setItem() {} }, setTimeout, clearTimeout, console };
  sandbox.window = sandbox; vm.createContext(sandbox); vm.runInContext(R('www/horizon_maps.js'), sandbox);
  return sandbox.HorizonMaps;
}
test('modes normalise', () => {
  const t = load()._t;
  assert.strictEqual(t.normMode('walking'), 'walk'); assert.strictEqual(t.normMode('Bus'), 'transit'); assert.strictEqual(t.normMode('cycling'), 'bike');
  assert.strictEqual(t.normMode('uber'), 'taxi'); assert.strictEqual(t.normMode(''), 'car'); assert.strictEqual(t.normMode('xyz'), 'car');
});
test('distance and time formatting', () => {
  const t = load()._t;
  assert.strictEqual(t.fmtDist(480), '480 m'); assert.strictEqual(t.fmtDist(1530), '1.5 km'); assert.strictEqual(t.fmtDist(24000), '24 km');
  assert.strictEqual(t.fmtDur(20), '<1 min'); assert.strictEqual(t.fmtDur(1500), '25 min'); assert.strictEqual(t.fmtDur(5400), '1 h 30 min'); assert.strictEqual(t.fmtDur(7200), '2 h');
});
test('haversine Cape Town to Stellenbosch is about 40 km', () => {
  const d = load()._t.haversine({ lat: -33.9249, lon: 18.4241 }, { lat: -33.9321, lon: 18.8602 });
  assert.ok(d > 38000 && d < 42000, String(d));
});
test('polyline6 decode matches a known encoding', () => {
  const t = load()._t;
  // Encode locally with the same algorithm, then decode.
  function enc(pts, f) { let la = 0, lo = 0, o = ''; const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let s = ''; while (v >= 32) { s += String.fromCharCode((32 | (v & 31)) + 63); v >>= 5; } return s + String.fromCharCode(v + 63); };
    pts.forEach(p => { const a = Math.round(p[0] * f), b = Math.round(p[1] * f); o += e(a - la) + e(b - lo); la = a; lo = b; }); return o; }
  const pts = [[-33.9249, 18.4241], [-33.93, 18.43], [-33.95, 18.5]];
  const out = t.decodePoly(enc(pts, 1e6), 6);
  out.forEach((p, i) => { assert.ok(Math.abs(p[0] - pts[i][0]) < 1e-6 && Math.abs(p[1] - pts[i][1]) < 1e-6); });
});
test('lat,lon and here parsing', () => {
  const t = load()._t;
  assert.deepStrictEqual(JSON.parse(JSON.stringify(t.parseLatLon('-33.9, 18.5'))).lat, -33.9);
  assert.strictEqual(t.parseLatLon('Cape Town'), null); assert.strictEqual(t.parseLatLon('99, 10'), null);
  assert.ok(t.isHere('Here') && t.isHere('my location') && !t.isHere('here street'));
});
test('step text reads naturally', () => {
  const t = load()._t;
  assert.strictEqual(t.stepText({ maneuver: { type: 'turn', modifier: 'left' }, name: 'Main Rd' }), 'Turn left onto Main Rd');
  assert.strictEqual(t.stepText({ maneuver: { type: 'arrive' } }), 'Arrive at your destination');
  assert.strictEqual(t.stepText({ maneuver: { type: 'roundabout', exit: 2 }, name: 'N1' }), 'Take the roundabout, exit 2 onto N1');
});
test('nearest stop', () => {
  const t = load()._t; const r = t.nearest([{ lat: 1, lon: 1, name: 'far' }, { lat: 0.001, lon: 0.001, name: 'near' }], { lat: 0, lon: 0 });
  assert.strictEqual(r.stop.name, 'near');
});
test('wiring: tags, dash routing, policy, dock, addon, version', () => {
  const m = load();
  const re = new RegExp(m.SRC, 'gi'); const hits = []; let x; const sample = '[[map.route: here | Cape Town Station | walk]] and [[map.near: pharmacy | here]] [[map.here: now]]';
  while ((x = re.exec(sample))) hits.push(x[1]);
  assert.deepStrictEqual(hits, ['map.route', 'map.near', 'map.here']);
  assert.ok(R('www/horizon_dash.js').includes('map\\\\.(?:route|show|near|here)') && R('www/horizon_dash.js').includes('HorizonMaps.run'));
  assert.ok(R('www/horizon_toolpolicy.js').includes('HorizonMaps.block()'));
  const html = R('www/index.html');
  assert.ok(/horizon_maps\.js\?v=1\.99\.\d+/.test(html) && /horizon_maps\.css\?v=1\.99\.\d+/.test(html) && html.includes('id="hzMapsView"'));
  assert.strictEqual((html.match(/data-addon="maps"/g) || []).length, 2);
  assert.ok(R('www/horizon_addons.js').includes("mode === 'maps'"));
  assert.ok(/var VERSION = 'V1\.99\.(?:6[2-9]|[7-9]\d|1\d\d)'/.test(R('www/horizon_about.js')) && R('www/horizon_about.js').includes('Everyday tools'));
});
test('run(): off switch and bad args never touch the network', async () => {
  const m = load();
  const bad = await m.run('map.route', 'only one');
  assert.ok(/^ERROR/.test(bad.text));
  m.setOn(false);
  const off = await m.run('map.route', 'a | b | car');
  assert.ok(/switched off/.test(off.text));
  assert.ok(/MAPS OFF/.test(m.block()));
});
