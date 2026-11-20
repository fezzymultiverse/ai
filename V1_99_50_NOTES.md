# Horizon V1.99.50 - RSS FEEDS tile (merged with V1.99.49 Edge installer)

Base: V1.99.48 full project + V1.99.49 overlay (install_edge.sh, CI snippet, edge-install test) merged. Nothing from either was dropped.

New: www/horizon_rss.js, www/horizon_rss.css, tests/rss.browser.cjs
Changed: www/index.html (css/script tags, #hzRssRow tile after Downloads, #hzRssView), www/horizon_addons.js (mode 'rss'), www/horizon_app.css (right-panel dock is 6 columns, labels shrink under 430px so no word breaks), www/horizon_about.js (changelog), tests/requested-v42.browser.cjs (6 tiles).

## What it does
- Tile "RSS" in the right-panel dock beside Downloads. Opens full screen like Downloads, titled RSS Feeds.
- Round icon per feed (first letter or emoji of the name, your colour). Tap one to see only that feed; star = all.
- Add (+): type a feed link, a website link (feed auto-detected from <link rel=alternate>, then /feed /rss /rss.xml /feed.xml /atom.xml /index.xml), user/repo (GitHub releases or commits), r/subreddit, or a name to filter the starter list (28 sources). A site with no feed shows "No feed found at that link." Nothing is guessed.
- Edit (pencil): rename, colour (tap the dot), tab, items per feed 5/10/20/30, On/Off, up/down, Remove (two taps), rename/remove tabs.
- Tabs: your own, created by typing a tab name on a feed. Removing a tab keeps its feeds.
- Refresh: opens fetch what is older than 15 min; the refresh button forces all. Last items are cached so it opens instantly and works offline. Tapping an article opens it and dims it as read.
- Parses RSS 2.0, RSS 1.0 (RDF) and Atom. Feed text is written with textContent only, tags stripped from titles and summaries, non-http(s) links dropped.
- Saved on this device only: horizon_rss_v1 (feeds, tabs, read marks), horizon_rss_cache_v1 (last items).

## Tested (real Chromium on the real index.html, fixtures for every feed URL)
- tests/rss.browser.cjs: tile in dock on one row, view opens, starter list, honest not-found, user/repo, r/, site auto-detect, path probing, no-feed message, add, merged newest-first list, icons, tabs, filters, read mark, XSS fixtures inert, edit (rename, count, move, off, two-tap remove), persistence after reload, parser on RSS/Atom/RDF/HTML/broken. 3 themes x 393px.
- Dock fits one row with no broken labels at 320/360/393/412/768 px in Dark, Neon, Grey.
- All 12 existing .test.cjs pass. install_edge.sh: bash -n OK, 20/20 checks. shellcheck is not installed here.

## NOT verified
- Live feeds: this build environment has no outbound network, so no real site was fetched. The 28 starter URLs are from memory and unchecked; a dead one shows its error on the feed icon and can be removed.
- Native fetch: relies on CapacitorHttp being enabled (horizon_ytdirect.js says it is). capacitor.config is not in the zip, so I could not confirm it. If it is off, feeds fail with "blocked or offline" (CORS) in the APK.
- Reddit often blocks non-browser clients; r/ feeds may return HTTP 403/429.
- No Gradle/APK build here. This change is web-only (www/): a web update is enough, no rebuild for RSS. The Edge voice plugin from 99_49 still needs the APK rebuild per its own notes.
