'use strict';
// V1.99.138 static wiring checks (the behaviour is covered in tests/v138.browser.cjs).
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const idx = R('www/index.html');
test('yt.pick: tag verb, runner, loading label, prompt, script, host, restore hook', () => {
  assert.ok(/get\|watch\|pick\):/.test(idx), 'YT_SRC verb');
  assert.ok(idx.includes("kind === 'yt.pick'"), 'runYtTool branch');
  assert.ok(idx.includes('async function ytPickTool'), 'ytPickTool');
  assert.ok(idx.includes('window.HorizonYtPickHost'), 'host');
  assert.ok(idx.includes('[[yt.pick:'), 'prompt bullet');
  assert.ok(/DOWNLOAD[^']*saves a file; PLAY[^']*only streams/.test(idx), 'play vs download rule in the prompt');
  assert.ok(idx.includes('horizon_ytpick.js?v=1.99.138'), 'script tag');
  assert.ok(idx.includes('HorizonYtPick.restore('), 'restore hook');
});
test('speed: Thinking off by default, Gemini budgets capped, Groq reasoning effort limited, Gemini not an Eyes reader', () => {
  assert.ok(idx.includes("thinkOn: lsGet(LS.think) === '1'"));
  assert.ok(!/thinkingBudget: \/pro\/\.test\(m\) \? 32768/.test(idx));
  assert.ok(/gpt-oss\/i\.test\(model\)\) body\.reasoning_effort/.test(idx));
  assert.ok(idx.includes("const order = ['groq', 'mistral', 'openrouter', 'cohere', 'pollinations'];"));
});
test('files: Trash is reversible and confirmation-gated in JS and in Java; no permanent delete anywhere', () => {
  const js = R('www/horizon_files.js'), java = R('android-native/app/HorizonFilesPlugin.java');
  assert.ok(/data\.userConfirmed === true/.test(js));
  assert.ok(/args\.userConfirmed = true/.test(js) && /w\.approved && w\.approved\[i\]/.test(js));
  const trash = java.slice(java.indexOf('@PluginMethod public void moveToTrash'), java.indexOf('@PluginMethod public void undo'));
  assert.match(trash, /getBoolean\("userConfirmed", false\)/);
  assert.match(trash, /"moveToTrash", true, null/);
  assert.doesNotMatch(java, /\.delete\s*\(/);
  assert.doesNotMatch(js, /\.delete\s*\(\s*\)/);
});
