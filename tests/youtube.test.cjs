'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
test('dead public Piped/Invidious layer is gone from the app', () => {
  assert.ok(!/pipedapi|YT_DEFAULT_INSTANCES|ytRace|ytDiscover|horizon_yt_instances/.test(html));
  assert.ok(!/Piped \/ Invidious sources/.test(html));
});
test('yt.download accepts a video kind and the download runner honours it', () => {
  assert.match(html, /queueDownload\(ref, hint, kindArg\)/);
  assert.match(html, /HorizonYouTube\.download\(d\.vid, d\.kind === 'video' \? 'video' : 'audio', d, true\)/);
  assert.match(html, /\[\[yt\.download: VIDEO_ID \| Title \| video\]\]/);
});
test('Termux AI know-how carries exact yt-dlp recipes', () => {
  const ctx = { window: {}, localStorage: { getItem: () => '' } }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'www/horizon_runlog.js'), 'utf8'), ctx);
  const k = ctx.window.HorizonRunLog.knowHow();
  ['yt-dlp -x --audio-format mp3', 'bv*[height<=720]+ba/b[height<=720]', '--playlist-end 25', 'pip install --upgrade yt-dlp', 'player_client=android,web', 'ytsearch5:'].forEach(s => assert.ok(k.includes(s), 'missing: ' + s));
});
test('yt-dlp search fallback is exported and validates ids', () => {
  const b = fs.readFileSync(path.join(root, 'www/horizon_bridges.js'), 'utf8');
  assert.match(b, /youtubeSearch: youtubeSearch/); assert.match(b, /\^\[\\w-\]\{11\}\$/);
});
test('stale storage keys are cleaned on release', () => {
  const s = fs.readFileSync(path.join(root, 'www/horizon_release.js'), 'utf8');
  ['horizon_yt_instances', 'horizon_yt_discovered', 'horizon_yt_good'].forEach(k => assert.ok(s.includes(k)));
});
