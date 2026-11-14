'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www', 'index.html'), 'utf8');
const kt = fs.readFileSync(path.join(root, 'resources', 'android', 'java', 'HorizonAIPlugin.kt'), 'utf8');

const setLine = (kt.match(/host !in setOf\(([^)]*)\)/) || [])[1] || '';
const allowed = new Set((setLine.match(/"([^"]+)"/g) || []).map(s => s.slice(1, -1)));

test('native allowlist was parsed', () => {
  assert.ok(allowed.size >= 6, 'allowlist should hold the original six hosts or more');
});

test('gateway providers are allowed by the native bridge', () => {
  for (const host of ['api.anyapi.ai', 'api.routeway.ai', 'api.gonkarouter.io', 'router.requesty.ai', 'api.kilo.ai', 'oai.endpoints.kepler.ai.cloud.ovh.net', 'ch.at', 'blockrun.ai', 'gateway.vlm.run', 'oai.aihorde.net', 'api.anthropic.com', 'api.openai.com', 'api.deepseek.com', 'api.x.ai']) {
    assert.ok(allowed.has(host), host + ' missing from HorizonAIPlugin.kt allowlist');
  }
});

test('every https base URL used by oaiGateway is allowed natively', () => {
  const bases = [...html.matchAll(/base:\s*'https:\/\/([^/']+)/g)].map(m => m[1]);
  assert.ok(bases.length >= 3, 'expected gateway base URLs in index.html');
  for (const host of bases) assert.ok(allowed.has(host), host + ' is used by a provider but blocked natively');
});

test('original hosts are still allowed', () => {
  for (const host of ['generativelanguage.googleapis.com', 'api.groq.com', 'api.cohere.com', 'api.mistral.ai', 'openrouter.ai', 'text.pollinations.ai']) {
    assert.ok(allowed.has(host), host + ' was removed');
  }
});
