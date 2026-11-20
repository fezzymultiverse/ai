'use strict';
// V1.99.54: scripts/edge_kit.sh carries every Edge file, restores missing ones byte for byte, and checks an android/ project.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const KIT = path.join(root, 'scripts', 'edge_kit.sh');
const run = (args, cwd) => spawnSync('bash', [KIT].concat(args), { cwd: cwd || root, encoding: 'utf8' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'edgekit-'));

test('kit lists the 5 Kotlin files, installer, JS and docs', () => {
    const l = run(['--list']).stdout.split('\n').filter(Boolean);
    ['EdgeAudioPipe', 'EdgeGec', 'EdgeProtocol', 'EdgeTtsClient', 'HorizonEdgeVoicePlugin'].forEach(n => assert.ok(l.includes('android-native/com/festers/horizon/edge/' + n + '.kt'), n));
    ['scripts/install_edge.sh', 'www/horizon_edge_tts.js', 'EDGE_VOICE_SETUP.md', 'scripts/ci/gitlab-edge-snippet.yml', 'scripts/ci/github-edge-snippet.yml'].forEach(f => assert.ok(l.includes(f), f));
});
test('restore into an empty folder is byte-identical to the repo copies and never overwrites without --force', () => {
    const d = tmp();
    const r = run([d]);
    assert.strictEqual(r.status, 0, r.stderr);
    run(['--list']).stdout.split('\n').filter(Boolean).forEach(f => assert.ok(fs.readFileSync(path.join(d, f)).equals(fs.readFileSync(path.join(root, f))), 'identical ' + f));
    const gec = path.join(d, 'android-native/com/festers/horizon/edge/EdgeGec.kt');
    fs.writeFileSync(gec, 'mine');
    const r2 = run([d]);
    assert.match(r2.stdout, /differs\s+android-native\/com\/festers\/horizon\/edge\/EdgeGec\.kt/);
    assert.strictEqual(fs.readFileSync(gec, 'utf8'), 'mine');
    run([d, '--force']);
    assert.ok(fs.readFileSync(gec).equals(fs.readFileSync(path.join(root, 'android-native/com/festers/horizon/edge/EdgeGec.kt'))));
    assert.ok(fs.readdirSync(path.dirname(gec)).some(n => /^EdgeGec\.kt\.bak-/.test(n)), 'old copy kept');
});
test('--check fails on an android project without the plugin, passes after --install', () => {
    const d = tmp();
    const a = path.join(d, 'android');
    fs.mkdirSync(path.join(a, 'app/src/main/java/com/x'), { recursive: true });
    fs.writeFileSync(path.join(a, 'app/src/main/AndroidManifest.xml'), '<?xml version="1.0"?>\n<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n<application/>\n</manifest>\n');
    fs.writeFileSync(path.join(a, 'app/src/main/java/com/x/MainActivity.java'), 'package com.x;\nimport com.getcapacitor.BridgeActivity;\npublic class MainActivity extends BridgeActivity {}\n');
    fs.writeFileSync(path.join(a, 'build.gradle'), "buildscript {\n dependencies {\n  classpath 'com.android.tools.build:gradle:8.7.2'\n }\n}\n");
    fs.writeFileSync(path.join(a, 'app/build.gradle'), "apply plugin: 'com.android.application'\nandroid {\n}\ndependencies {\n}\n");
    run([d]);   // restore the kit files into the fake repo
    const bad = run(['--check', a]);
    assert.strictEqual(bad.status, 1);
    assert.match(bad.stdout, /FAIL\s+EdgeGec\.kt is missing/);
    const ok = run(['--install', a, d]);
    assert.strictEqual(ok.status, 0, ok.stdout + ok.stderr);
    assert.match(ok.stdout, /EDGE PLUGIN PRESENT/);
    const act = fs.readFileSync(path.join(a, 'app/src/main/java/com/x/MainActivity.java'), 'utf8');
    assert.ok(act.indexOf('registerPlugin') < act.indexOf('super.onCreate'));
});
