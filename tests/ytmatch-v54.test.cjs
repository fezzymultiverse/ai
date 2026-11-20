'use strict';
// V1.99.54: exact-song matching, verified save, native-first intent, no silent fallback.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'www', 'index.html'), 'utf8');
const a = html.indexOf('const YT_NOISE_Q');
const b = html.indexOf('// Runs the intent for real BEFORE');
assert.ok(a > 0 && b > a, 'yt block markers present');
const code = html.slice(a, b);

function build(env) {
    env = env || {};
    const f = new Function('env', `
        const state = env.state || { downloads: [] };
        const LS = { filesOn: 'filesOn' };
        const lsGet = k => (env.ls && env.ls[k]) || null;
        const fmtDur = s => s + 's';
        const shortTxt = (s, n) => String(s).slice(0, n);
        const ytSearch = env.ytSearch || (async () => ({ via: 't', items: [] }));
        const queueDownload = env.queueDownload || (async () => ({ text: 'Queued' }));
        const ytPlayTool = env.ytPlayTool || (async () => ({ text: 'Started: x' }));
        ${code}
        return { ytRank, ytSure, ytDirectId, nativeIntent, ytGetTool, ytAutoPlay, ytSaveAndWait };
    `);
    return f(env);
}
const T = (title, artist, dur, id) => ({ title, artist, dur, id: id || ('id' + Math.random().toString(36).slice(2, 11)) });

test('exact song beats cover, live, remix, sped up and karaoke', () => {
    const { ytRank, ytSure } = build();
    const items = [
        T('Blinding Lights (Live at the AMAs)', 'The Weeknd', 240, 'AAAAAAAAAA1'),
        T('Blinding Lights - Karaoke Version', 'Sing King', 200, 'AAAAAAAAAA2'),
        T('The Weeknd - Blinding Lights (Official Audio)', 'The Weeknd', 202, 'AAAAAAAAAA3'),
        T('Blinding Lights sped up', 'DJ x', 150, 'AAAAAAAAAA4'),
        T('Blinding Lights (Remix)', 'Someone', 210, 'AAAAAAAAAA5'),
        T('Blinding Lights cover', 'Guitar Dude', 190, 'AAAAAAAAAA6')
    ];
    const r = ytRank('The Weeknd - Blinding Lights', items);
    assert.strictEqual(r[0].it.id, 'AAAAAAAAAA3');
    assert.ok(ytSure(r));
});
test('asking for a live version allows the live upload', () => {
    const { ytRank } = build();
    const items = [T('Blinding Lights', 'The Weeknd', 200, 'BBBBBBBBBB1'), T('Blinding Lights (Live)', 'The Weeknd', 240, 'BBBBBBBBBB2')];
    assert.strictEqual(ytRank('blinding lights live', items)[0].it.id, 'BBBBBBBBBB2');
});
test('a wrong song is not "sure"', () => {
    const { ytRank, ytSure } = build();
    const r = ytRank('Obscure Band - Quiet Rooms', [T('Loud Cars', 'Other Band', 200, 'CCCCCCCCCC1'), T('Completely different', 'Nobody', 180, 'CCCCCCCCCC2')]);
    assert.strictEqual(ytSure(r), false);
});
test('topic channel and official audio are preferred', () => {
    const { ytRank } = build();
    const r = ytRank('Drake God\'s Plan', [T('God\'s Plan (Lyrics)', 'Lyric Channel', 200, 'DDDDDDDDDD1'), T('God\'s Plan', 'Drake - Topic', 199, 'DDDDDDDDDD2')]);
    assert.strictEqual(r[0].it.id, 'DDDDDDDDDD2');
});
test('an 11-letter word is not a video id, a real id and a url are', () => {
    const { ytDirectId } = build();
    assert.strictEqual(ytDirectId('Radioactive'), '');
    assert.strictEqual(ytDirectId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.strictEqual(ytDirectId('https://youtu.be/dQw4w9WgXcQ?t=3'), 'dQw4w9WgXcQ');
    assert.strictEqual(ytDirectId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=x'), 'dQw4w9WgXcQ');
    assert.strictEqual(ytDirectId('Blinding Lights'), '');
});
test('intent: plain play and download requests are read, vague ones are left to the AI', () => {
    const { nativeIntent } = build();
    assert.deepStrictEqual(nativeIntent('play Blinding Lights by The Weeknd'), { kind: 'play', q: 'Blinding Lights by The Weeknd' });
    assert.deepStrictEqual(nativeIntent('hey bro can you play "Drake - God\'s Plan" please'), { kind: 'play', q: 'Drake - God\'s Plan' });
    assert.strictEqual(nativeIntent('play something chill'), null);
    assert.strictEqual(nativeIntent('play some music'), null);
    assert.strictEqual(nativeIntent('play the radio'), null);
    assert.strictEqual(nativeIntent('play the guitar solo explanation'), null);
    assert.strictEqual(nativeIntent('play X and show lyrics'), null);
    const d = nativeIntent('download the song Blinding Lights by The Weeknd from youtube');
    assert.strictEqual(d.kind, 'get'); assert.strictEqual(d.q, 'Blinding Lights by The Weeknd'); assert.strictEqual(d.video, false);
    assert.strictEqual(nativeIntent('download this repo zip'), null);
    assert.strictEqual(nativeIntent('download the video Rick Astley Never Gonna Give You Up').video, true);
    assert.strictEqual(nativeIntent('download a picture of a cat'), null);
});
test('yt.get downloads only a confident match and reports the real SAVED result', async () => {
    const dl = { id: 1, vid: 'AAAAAAAAAA3', kind: 'audio', status: 'queued', ts: Date.now(), path: '', bytes: 0 };
    const env = {
        state: { downloads: [] },
        ytSearch: async () => ({ via: 'test', items: [T('Blinding Lights', 'Cover Guy (cover)', 200, 'AAAAAAAAAA1'), T('The Weeknd - Blinding Lights (Official Audio)', 'The Weeknd', 202, 'AAAAAAAAAA3')] }),
        queueDownload: async (vid) => { env.state.downloads.unshift(dl); setTimeout(() => { dl.status = 'done'; dl.path = 'Music/Horizon/x.m4a'; dl.bytes = 4194304; }, 50); return { text: 'Queued' }; }
    };
    const { ytGetTool } = build(env);
    const r = await ytGetTool('The Weeknd - Blinding Lights');
    assert.match(r.text, /^SAVED \(verified/);
    assert.match(r.text, /Music\/Horizon\/x\.m4a/);
});
test('yt.get never downloads when nothing matches (NEEDS CHOICE)', async () => {
    let queued = 0;
    const env = { state: { downloads: [] }, ytSearch: async () => ({ via: 't', items: [T('Totally Unrelated', 'Somebody', 200, 'EEEEEEEEEE1')] }), queueDownload: async () => { queued++; return { text: 'Queued' }; } };
    const { ytGetTool } = build(env);
    const r = await ytGetTool('Obscure Band - Quiet Rooms');
    assert.match(r.text, /^NEEDS CHOICE/);
    assert.strictEqual(queued, 0);
});
test('a failed download is retried once and then reported as ERROR, never as queued', async () => {
    let n = 0;
    const env = { state: { downloads: [] }, queueDownload: async () => { n++; const d = { id: n, vid: 'dQw4w9WgXcQ', kind: 'audio', status: 'error', err: 'refused', ts: Date.now() }; env.state.downloads.unshift(d); return { text: 'Queued' }; } };
    const { ytGetTool } = build(env);
    const r = await ytGetTool('dQw4w9WgXcQ | Never Gonna Give You Up');
    assert.match(r.text, /^ERROR: the download failed twice/);
    assert.strictEqual(n, 2);
});
test('manual-only policy removes automatic fallback and never re-points the active AI', () => {
    assert.match(html, /const AUTO_KEY = 'horizon_autoswitch_v2';/);
    assert.match(html, /const autoOn = \(\) => false;/);
    assert.ok(!html.includes('for (const other of RESCUE_ORDER)'));
    assert.ok(!html.includes("model = 'openrouter/free'"));
    assert.ok(!/if \(state\.active === pid\) \{ try \{ setActive\(other\)/.test(html), 'setActive(other) is gone');
});
