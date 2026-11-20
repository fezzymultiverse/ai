// V1.99.56: Mermaid/HTML document viewer + APIzone provider status. Static + pure-function checks, plain Node.
const test = require('node:test'), assert = require('node:assert'), fs = require('fs'), path = require('path');
const R = p => fs.readFileSync(path.join(__dirname, '..', p), 'utf8');
const between = (s, a, b) => { const i = s.indexOf(a), j = s.indexOf(b); assert.ok(i >= 0 && j > i, 'markers ' + a); return s.slice(i + a.length, j); };

const dv = R('www/horizon_docview.js');
const pure = between(dv, '/* DV:PURE:BEGIN */', '/* DV:PURE:END */');
const D = new Function(pure + '; return { MM_START, isMermaidText, mmTitle, baseName, dimsOf, fixSvg, mmKind };')();

test('mermaid detection: labelled, unlabelled and non-diagram blocks', () => {
  assert.equal(D.isMermaidText('mermaid', 'anything'), true);
  assert.equal(D.isMermaidText('MMD', ''), true);
  assert.equal(D.isMermaidText('', 'graph TD\nA-->B'), true);
  assert.equal(D.isMermaidText('', '%% note\nsequenceDiagram\nA->>B: hi'), true);
  assert.equal(D.isMermaidText('text', 'flowchart LR\nA-->B'), true);
  assert.equal(D.isMermaidText('', '---\ntitle: X\n---\nflowchart TD\nA-->B'), true);
  assert.equal(D.isMermaidText('js', 'graph TD'), false);
  assert.equal(D.isMermaidText('', 'hello world'), false);
  assert.equal(D.isMermaidText('', 'graphics are fun'), false);
});

test('titles and file names', () => {
  assert.equal(D.mmTitle('graph TD\nA-->B'), 'Flowchart');
  assert.equal(D.mmTitle('erDiagram\nA ||--o{ B : has'), 'ER diagram');
  assert.equal(D.mmTitle('---\ntitle: Login flow\n---\nflowchart TD\nA-->B'), 'Login flow');
  assert.equal(D.baseName('Login flow / v2?'), 'Login-flow-v2');
  assert.equal(D.baseName(''), 'diagram');
});

test('fixSvg: explicit size, namespace, background, no max-width style', () => {
  const svg = '<svg id="d" width="100%" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 412.5 300" style="max-width: 412.5px; background-color: white;"><g/></svg>';
  const r = D.fixSvg(svg, '#0d1117');
  assert.equal(r.w, 413); assert.equal(r.h, 300);
  assert.match(r.svg, /^<svg width="413" height="300" style="background-color:#0d1117"/);
  assert.ok(!/max-width/.test(r.svg));
  const bare = D.fixSvg('<svg viewBox="0 0 10 10"><g/></svg>', '#fff');
  assert.match(bare.svg, /xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.deepEqual(D.dimsOf('<svg></svg>'), { w: 800, h: 600 });
});

test('viewer wiring: script tag, css, sandboxed render, save formats, history, forge Open button', () => {
  const html = R('www/index.html');
  assert.ok(/horizon_docview\.js\?v=1\.99\.\d+/.test(html), 'script tag in index.html');
  assert.ok(html.indexOf('horizon_docview.js') > html.indexOf('horizon_htmlview.js'), 'after htmlview (needs HorizonHtmlView)');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'www/horizon_docview.css')));
  assert.match(dv, /sandbox', 'allow-scripts'/);
  assert.match(dv, /securityLevel:"strict"/);
  assert.match(dv, /'\.mmd'/); assert.match(dv, /'\.svg'/); assert.match(dv, /'\.png'/);
  assert.match(dv, /pushState\(\{ dvPrev: true \}/);
  assert.match(dv, /window\.HorizonHtmlView\.preview\(raw, t\)/);
  assert.match(dv, /hf-open/);
  assert.ok(!/innerHTML\s*=/.test(dv.replace(/f\.srcdoc[^\n]*/g, '')), 'no innerHTML on app DOM');
  assert.ok(fs.existsSync(path.join(__dirname, '..', 'www/vendor/forge/mermaid.min.js')), 'bundled mermaid present');
});

const us = R('www/horizon_usage.js');
const apzSrc = between(us, '/* APZ:BEGIN */', '/* APZ:END */');
const Z = new Function(apzSrc + '; return { apzList, apzState, apzFind, apzRows, apzMs, apzNorm };')();

test('APIzone: parses array, wrapped list and map shapes', () => {
  const arr = [{ slug: 'openai', name: 'OpenAI', status: 'operational', latency_ms: 312 }];
  assert.equal(Z.apzList(arr).length, 1);
  assert.equal(Z.apzList({ services: arr }).length, 1);
  assert.equal(Z.apzList({ data: arr }).length, 1);
  const m = Z.apzList({ services: { groq: { status: 'down' }, mistral: 'ok' } });
  assert.deepEqual(m.map(x => x.slug).sort(), ['groq', 'mistral']);
  assert.deepEqual(Z.apzList(null), []);
  assert.deepEqual(Z.apzList({}), []);
});

test('APIzone: status words map to UP / DEGRADED / DOWN, unknown stays unknown', () => {
  assert.equal(Z.apzState('operational').c, 'live');
  assert.equal(Z.apzState('UP').c, 'live');
  assert.equal(Z.apzState('degraded').c, 'warn');
  assert.equal(Z.apzState('partial_outage').c, 'warn');
  assert.equal(Z.apzState('major_outage').c, 'bad');
  assert.equal(Z.apzState('down').c, 'bad');
  assert.equal(Z.apzState({ indicator: 'none' }).c, 'live');
  assert.equal(Z.apzState('weird').c, 'off');
  assert.equal(Z.apzState(undefined).t, 'UNKNOWN');
});

test('APIzone: matches your AIs by id/name, skips the ones it does not monitor', () => {
  const list = [
    { slug: 'groq', name: 'Groq', status: 'up', latency_ms: 120 },
    { slug: 'mistral-ai', name: 'Mistral AI', status: 'degraded' },
    { slug: 'google-ai', name: 'Google AI', status: 'down' },
    { slug: 'stripe', name: 'Stripe', status: 'up' }
  ];
  const providers = { groq: { name: 'Groq' }, mistral: { name: 'Mistral' }, gemini: { name: 'Gemini' }, pollinations: { name: 'Pollinations' } };
  const rows = Z.apzRows(list, ['groq', 'mistral', 'gemini', 'pollinations'], providers);
  assert.deepEqual(rows.map(r => r.id), ['groq', 'mistral', 'gemini']);
  assert.equal(rows[0].ms, 120); assert.equal(rows[1].st.c, 'warn'); assert.equal(rows[2].st.c, 'bad');
});

test('APIzone: wired into the usage panel, 5 minute refresh, no key, own endpoint only', () => {
  assert.match(us, /fetchJSON\('https:\/\/apizone\.io\/api\/v1\/status'/);
  assert.match(us, /drawKeys\(host\); drawApz\(host\); drawNet\(host\)/);
  assert.match(us, /Date\.now\(\) - apz\.at > 300000/);
  assert.match(R('www/horizon_about.js'), /var VERSION = 'V1\.99\.(?:5[6-9]|[6-9]\d|1\d\d)'/);
});
