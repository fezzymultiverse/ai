'use strict';
// V1.99.50 RSS Feeds tile; V1.99.52 adds search by name + service icons. Real Chromium, real application, every feed URL answered by a fixture (no live network).
// Run with Playwright installed and serve the repo root: python3 -m http.server 8134 ; node tests/rss.browser.cjs
// HORIZON_URL may override the URL.
const { chromium } = require('playwright'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const OUT = path.join(__dirname, 'artifacts-rss'); fs.mkdirSync(OUT, { recursive: true });

const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Release notes from termux-app</title>
<entry><title>v0.119.0</title><link rel="alternate" type="text/html" href="https://github.com/termux/termux-app/releases/tag/v0.119.0"/><updated>2026-11-10T10:00:00Z</updated><content type="html">&lt;p&gt;Fixes &lt;b&gt;crash&lt;/b&gt; on start&lt;/p&gt;</content></entry>
<entry><title>v0.118.3</title><link rel="alternate" href="https://github.com/termux/termux-app/releases/tag/v0.118.3"/><updated>2026-09-01T10:00:00Z</updated><summary>older</summary></entry></feed>`;
const RSS = `<?xml version="1.0"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Dev Blog</title>
<item><title>Newest post</title><link>https://blog.example.com/new</link><pubDate>Mon, 16 Nov 2026 01:00:00 GMT</pubDate><description>&lt;b&gt;Bold&lt;/b&gt; intro text</description></item>
<item><title>&lt;img src=x onerror=window.__pwned=1&gt;Evil &amp;amp; title</title><link>javascript:window.__pwned=2</link><pubDate>Sun, 15 Nov 2026 01:00:00 GMT</pubDate><description>&lt;script&gt;window.__pwned=3&lt;/script&gt;safe text</description></item>
<item><title>Old post</title><link>https://blog.example.com/old</link><pubDate>Mon, 01 Jun 2026 01:00:00 GMT</pubDate><content:encoded>&lt;p&gt;Long body&lt;/p&gt;</content:encoded></item></channel></rss>`;
const RDF = `<?xml version="1.0"?><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>RDF Feed</title></channel><item><title>RDF item</title><link>https://rdf.example.com/1</link><dc:date>2026-11-12T00:00:00Z</dc:date></item></rdf:RDF>`;
const HTML_WITH_FEED = `<html><head><link rel="alternate" type="application/rss+xml" title="x" href="/feeds/all.rss"><link rel="stylesheet" href="/a.css"></head><body>hi</body></html>`;
const HTML_PLAIN = `<html><head><title>No feed here</title></head><body>hello</body></html>`;

const FIX = {
  'https://github.com/termux/termux-app/releases.atom': ATOM,
  'https://blog.example.com/feeds/all.rss': RSS,
  'https://blog.example.com/': HTML_WITH_FEED,
  'https://plain.example.com/': HTML_PLAIN,
  'https://probe.example.com/': HTML_PLAIN,
  'https://probe.example.com/atom.xml': ATOM,
  'https://rdf.example.com/rss': RDF,
  'https://news.ycombinator.com/rss': RSS
};

const UC1 = 'UC' + 'a'.repeat(22), UC2 = 'UC' + 'b'.repeat(22);
const YT_HTML = `<script>var ytInitialData = {"contents":[{"channelRenderer":{"channelId":"${UC1}","title":{"simpleText":"Fezzy Beats"},"navigationEndpoint":{"browseEndpoint":{"canonicalBaseUrl":"/@fezzybeats"}},"videoCountText":{"simpleText":"12 videos"}}},{"channelRenderer":{"channelId":"${UC2}","title":{"simpleText":"Dead Channel"}}}]};</script>`;
const EMPTY_ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>empty</title></feed>`;
const GH_REPOS = JSON.stringify({ items: [{ full_name: 'fezzy/horizon', stargazers_count: 1500, description: 'AI chat app' }, { full_name: 'fezzy/empty', stargazers_count: 3 }] });
const GH_USERS = JSON.stringify({ items: [{ login: 'fezzy' }] });
const RD = JSON.stringify({ data: { children: [{ data: { display_name: 'fezzyfans', subscribers: 4200 } }] } });
const FEEDLY = JSON.stringify({ results: [{ feedId: 'feed/https://fezzy.example.com/rss', title: 'Fezzy Blog', website: 'https://fezzy.example.com', subscribers: 2300, iconUrl: 'https://fezzy.example.com/icon.png' }] });
const FIXP = [
  ['https://www.youtube.com/results?search_query=fezzy', YT_HTML],
  ['https://www.youtube.com/feeds/videos.xml?channel_id=' + UC1, ATOM],
  ['https://api.github.com/search/repositories?q=fezzy', GH_REPOS],
  ['https://api.github.com/search/users?q=fezzy', GH_USERS],
  ['https://github.com/fezzy/horizon/releases.atom', ATOM],
  ['https://github.com/fezzy/empty/releases.atom', EMPTY_ATOM],
  ['https://github.com/fezzy/empty/commits.atom', ATOM],
  ['https://github.com/fezzy.atom', ATOM],
  ['https://www.reddit.com/subreddits/search.json?q=fezzy', RD],
  ['https://www.reddit.com/r/fezzyfans/.rss', RSS],
  ['https://cloud.feedly.com/v3/search/feeds?query=fezzy', FEEDLY],
  ['https://fezzy.example.com/rss', RSS]
];

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const errors = [], seenUrls = [];
  try {
    for (const theme of ['dark', 'neon', 'grey']) {
      const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 1 });
      await ctx.addInitScript(({ theme }) => { localStorage.setItem('horizon_soul_v', '999'); localStorage.setItem('horizon_theme', theme); }, { theme });
      await ctx.route(/^https:\/\/(?!fonts)[^/]+\/.*/, route => {
        const req = route.request(), url = req.url();
        if (/127\.0\.0\.1/.test(url)) return route.continue();
        const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
        if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
        seenUrls.push(url);
        if (/\/s2\/favicons|\/icon\.png/.test(url)) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'image/png' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64') });
        const body = FIX[url] != null ? FIX[url] : (FIXP.find(([k]) => url.startsWith(k)) || [])[1];
        if (body == null) return route.fulfill({ status: 404, headers: cors, body: 'nope' });
        return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'text/xml' }, body });
      });
      const p = await ctx.newPage();
      p.on('pageerror', e => errors.push(theme + ': ' + e.message));
      await p.goto(process.env.HORIZON_URL || 'http://127.0.0.1:8134/www/index.html'); await p.waitForTimeout(650);
      await p.locator('.hzc-set').click(); await p.waitForTimeout(450);

      // tile is in the dock, same row as Downloads, and opens the view
      const dock = await p.evaluate(() => [...document.querySelectorAll('#hzDock .hz-app')].filter(e => e.getBoundingClientRect().width).map(e => ({ t: e.querySelector('span').innerText, top: e.getBoundingClientRect().top, right: e.getBoundingClientRect().right })));
      assert.deepEqual(dock.map(x => x.t), ['Terminal', 'Lens', 'YouTube', 'Stats', 'Downloads', 'RSS']);
      assert.ok(dock.every(x => Math.abs(x.top - dock[0].top) < 1) && dock[5].right <= 394);
      await p.locator('#hzRssRow').click(); await p.waitForTimeout(250);
      assert.equal(await p.locator('#hzRssView').isVisible(), true);
      assert.equal(await p.locator('#hzDownloadsView').isVisible(), false);
      assert.match(await p.locator('#hzExtensionTitle').innerText(), /RSS Feeds/);
      // first run: add panel + starter list, nothing fetched yet
      assert.ok(await p.locator('.rx-panel h3', { hasText: 'Add a feed' }).count());
      assert.ok((await p.locator('.rx-resrow').count()) >= 20, 'starter list shows');

      const find = async q => { await p.locator('.rx-line .rx-in').first().fill(q); await p.locator('.rx-btn.pri', { hasText: /^Find/ }).click(); await p.waitForFunction(() => { const b = document.querySelector('.rx-line .rx-btn.pri'); return b && !/Finding/.test(b.innerText); }); await p.waitForTimeout(150); };
      const note = () => p.locator('.rx-note').innerText().catch(() => '');
      const addMsg = () => p.evaluate(() => (document.querySelector('.rx-note') || {}).innerText || '');

      // typed name that is not in the starter list: honest message, nothing invented
      await find('zzzznothing'); assert.match(await addMsg(), /Nothing came back|No feed found/);
      // starter-list filter by name
      await find('hacker'); assert.equal(await p.locator('.rx-resrow strong', { hasText: 'Hacker News' }).count(), 1);

      // V1.99.52 search BY NAME across real sources; every result is fetched first, dead ones are hidden, never guessed
      await find('fezzy');
      const names = await p.locator('.rx-resrow strong').allInnerTexts();
      for (const n of ['Fezzy Beats', 'fezzy/horizon releases', 'fezzy/empty commits', 'fezzy (activity)', 'r/fezzyfans', 'Fezzy Blog']) assert.ok(names.includes(n), 'name search found ' + n + ' in ' + names.join('|'));
      assert.ok(!names.includes('Dead Channel') && !names.includes('fezzy/empty releases'), 'unreachable feeds are not offered');
      assert.match(await p.locator('.rx-resrow', { hasText: 'fezzy/horizon releases' }).locator('small').innerText(), /2 items, latest/);
      assert.match(await p.locator('.rx-panel').innerText(), /1 result hidden/);
      assert.ok(await p.locator('.rx-resrow .rx-circle.svc-youtube svg').count() >= 1, 'YouTube logo');
      assert.ok(await p.locator('.rx-resrow .rx-circle.svc-github svg use').count() >= 3, 'GitHub logo');
      await p.waitForTimeout(400);
      assert.ok(await p.locator('.rx-resrow .rx-circle.img .rx-img').count() >= 2, 'real site icons load into the circle (websites, subreddits)');
      assert.ok(seenUrls.some(u => /google\.com\/s2\/favicons\?domain=reddit\.com/.test(u)) && seenUrls.includes('https://fezzy.example.com/icon.png'), 'Feedly icon and a favicon were requested');
      // one source only, by chip and by typed prefix
      await p.locator('.rx-srcs .rx-chip', { hasText: 'Reddit' }).click(); await p.waitForFunction(() => { const b = document.querySelector('.rx-line .rx-btn.pri'); return b && !/Finding/.test(b.innerText); });
      assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['r/fezzyfans']);
      await p.locator('.rx-srcs .rx-chip', { hasText: 'All' }).click(); await p.waitForTimeout(50);
      await find('yt fezzy'); assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['Fezzy Beats']);
      await find('gh fezzy'); assert.ok((await p.locator('.rx-resrow strong').allInnerTexts()).every(n => /fezzy/.test(n)));
      // YouTube links give the feed directly, no guessing
      await find('https://www.youtube.com/channel/' + UC1); assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['YouTube channel']);
      await p.locator('.rx-srcs .rx-chip', { hasText: 'All' }).click(); await p.waitForTimeout(50);
      // user/repo -> releases + commits, no fetch needed to offer them
      await find('termux/termux-app');
      assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['termux/termux-app releases', 'termux/termux-app commits']);
      // r/ shortcut
      await find('r/termux'); assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['r/termux']);
      // site link -> feed auto-detected from <link rel=alternate>
      await find('https://blog.example.com/'); assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['Dev Blog']);
      // site with no alternate: probes common paths and finds /atom.xml
      await find('probe.example.com'); assert.deepEqual(await p.locator('.rx-resrow strong').allInnerTexts(), ['Release notes from termux-app']);
      assert.ok(seenUrls.includes('https://probe.example.com/feed') && seenUrls.includes('https://probe.example.com/atom.xml'));
      // site with no feed anywhere: clear message, no result rows
      await find('https://plain.example.com/'); assert.match(await addMsg(), /No feed found/);
      assert.equal(await p.locator('.rx-resrow').count() >= 20, true, 'falls back to the starter list');

      // add GitHub releases with a name, a new tab and a colour
      await find('termux/termux-app');
      await p.locator('.rx-two .rx-in').nth(0).fill('Termux');
      await p.locator('.rx-two .rx-in').nth(1).fill('Dev');
      await p.locator('.rx-sw').nth(2).click();
      await p.locator('.rx-resrow .rx-btn.pri').first().click(); await p.waitForTimeout(500);
      // add the RSS blog through site auto-detect
      await p.locator('.rx-btn', { hasText: '＋' }).click(); await p.waitForTimeout(100);
      await p.locator('.rx-btn', { hasText: '＋' }).click(); await p.waitForTimeout(100);
      await find('https://blog.example.com/');
      await p.locator('.rx-two .rx-in').nth(1).fill('News');
      await p.locator('.rx-resrow .rx-btn.pri').first().click(); await p.waitForTimeout(500);
      // close the add panel
      await p.locator('.rx-acts .rx-btn', { hasText: '＋' }).click(); await p.waitForTimeout(400);

      // icons + merged list, newest first, untrusted text stays text
      assert.deepEqual(await p.locator('.rx-ic small').allInnerTexts(), ['All', 'Termux', 'Dev Blog']);
      assert.equal(await p.locator('.rx-ic .rx-circle.svc-github svg use').count(), 1, 'a GitHub feed shows the GitHub logo');
      assert.equal(await p.locator('.rx-ic .rx-circle', { hasText: 'D' }).count() >= 1, true, 'a plain site shows its letter until its icon loads');
      assert.deepEqual(await p.locator('.rx-tabs .rx-chip').allInnerTexts(), ['All', 'Dev', 'News']);
      const titles = await p.locator('.rx-item strong').allInnerTexts();
      assert.equal(titles[0], 'Newest post'); assert.ok(titles.includes('v0.119.0'));
      assert.equal(await p.locator('.rx-item img, .rx-item script').count(), 0);
      assert.ok(titles.includes('Evil & title'), 'tags are stripped from titles and entities decoded, nothing runs');
      assert.equal(await p.evaluate(() => window.__pwned), undefined);
      assert.match(await p.locator('.rx-item', { hasText: 'v0.119.0' }).locator('.rx-desc').innerText(), /^Fixes crash on start$/);
      // javascript: link is dropped: tapping does not open or throw
      await p.locator('.rx-item', { hasText: 'Evil' }).click();
      // tab filter and icon filter
      await p.locator('.rx-tabs .rx-chip', { hasText: 'Dev' }).click(); await p.waitForTimeout(100);
      assert.deepEqual(await p.locator('.rx-item small').allInnerTexts().then(a => a.map(s => s.split(' · ')[0])), ['Termux', 'Termux']);
      await p.locator('.rx-tabs .rx-chip', { hasText: 'All' }).click();
      await p.locator('.rx-ic', { hasText: 'Dev Blog' }).click(); await p.waitForTimeout(100);
      assert.ok((await p.locator('.rx-item small').allInnerTexts()).every(s => s.startsWith('Dev Blog')));
      // read mark
      const popup = p.waitForEvent('popup', { timeout: 2000 }).catch(() => null);
      await p.locator('.rx-item', { hasText: 'Newest post' }).click(); const pg = await popup; if (pg) await pg.close();
      assert.ok(await p.locator('.rx-item.seen', { hasText: 'Newest post' }).count());
      await p.locator('.rx-ic', { hasText: 'All' }).click();
      await p.screenshot({ path: path.join(OUT, `rss-list-${theme}.png`) });

      // edit: rename, count, tab, move, off, remove (two taps)
      await p.locator('.rx-acts .rx-btn', { hasText: '✎' }).click(); await p.waitForTimeout(150);
      assert.equal(await p.locator('.rx-erow').count(), 2);
      await p.locator('.rx-erow').nth(1).locator('input[aria-label="Feed name"]').fill('Blog X'); await p.locator('.rx-erow').nth(1).locator('input[aria-label="Feed name"]').blur(); await p.waitForTimeout(300);
      await p.locator('.rx-erow').nth(1).locator('select').selectOption('5'); await p.waitForTimeout(250);
      await p.locator('.rx-erow').nth(1).locator('.rx-btn', { hasText: '▲' }).click(); await p.waitForTimeout(150);
      assert.equal(await p.locator('.rx-erow').first().locator('input[aria-label="Feed name"]').inputValue(), 'Blog X');
      await p.screenshot({ path: path.join(OUT, `rss-edit-${theme}.png`) });
      await p.locator('.rx-erow').first().locator('.rx-btn', { hasText: /^On$/ }).click(); await p.waitForTimeout(150);
      assert.ok(await p.locator('.rx-erow.off').count());
      await p.locator('.rx-erow').first().locator('.rx-btn.bad').click(); await p.waitForTimeout(100);
      assert.equal(await p.locator('.rx-erow').count(), 2, 'first tap only asks Sure?');
      assert.equal(await p.locator('.rx-erow').first().locator('.rx-btn.bad').innerText(), 'Sure?');
      await p.locator('.rx-erow').first().locator('.rx-btn.bad').click(); await p.waitForTimeout(200);
      assert.equal(await p.locator('.rx-erow').count(), 1);
      await p.locator('.rx-acts .rx-btn', { hasText: '✎' }).click(); await p.waitForTimeout(150);

      // persistence: reload, the saved feed and its cached items are there at once
      await p.reload(); await p.waitForTimeout(650);
      const saved = await p.evaluate(() => JSON.parse(localStorage.getItem('horizon_rss_v1')));
      assert.equal(saved.feeds.length, 1); assert.equal(saved.feeds[0].name, 'Termux'); assert.equal(saved.feeds[0].tab, 'Dev');
      await p.locator('.hzc-set').click(); await p.waitForTimeout(450);
      await p.locator('#hzRssRow').click(); await p.waitForTimeout(150);
      assert.ok((await p.locator('.rx-item').count()) >= 1, 'cached items paint immediately');
      await ctx.close();
    }
    // parser unit checks on the real page code
    const ctx = await browser.newContext(); const p = await ctx.newPage();
    await p.goto(process.env.HORIZON_URL || 'http://127.0.0.1:8134/www/index.html'); await p.waitForTimeout(500);
    const r = await p.evaluate(({ RSS, ATOM, RDF }) => {
      const out = {};
      try { out.rss = window.HorizonRss.parse(RSS); out.atom = window.HorizonRss.parse(ATOM); out.rdf = window.HorizonRss.parse(RDF); } catch (e) { out.err = e.message; }
      try { window.HorizonRss.parse('<html><body>x</body></html>'); out.html = 'parsed'; } catch (e) { out.html = e.message; }
      try { window.HorizonRss.parse('<rss><channel><item>'); out.broken = 'parsed'; } catch (e) { out.broken = e.message; }
      return out;
    }, { RSS, ATOM, RDF });
    assert.equal(r.err, undefined, r.err);
    assert.equal(r.rss.title, 'Dev Blog'); assert.equal(r.rss.items.length, 3); assert.equal(r.rss.items[1].link, '');
    assert.equal(r.atom.items[0].link, 'https://github.com/termux/termux-app/releases/tag/v0.119.0');
    assert.equal(r.rdf.title, 'RDF Feed'); assert.equal(r.rdf.items[0].link, 'https://rdf.example.com/1'); assert.ok(r.rdf.items[0].ts > 0);
    assert.equal(r.html, 'Not a feed'); assert.equal(r.broken, 'Not a feed');
    await ctx.close();
  } finally { await browser.close(); }
  assert.deepEqual(errors, [], 'no page errors');
  console.log('rss.browser: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
