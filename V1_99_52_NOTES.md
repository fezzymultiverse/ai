# Horizon V1.99.52 - RSS: search by name + real service icons

Includes everything in V1.99.51 (heartbeat) and V1.99.50 (RSS Feeds tile).
Changed: www/horizon_rss.js, www/horizon_rss.css, www/index.html (rss css/js cache-bust 1.99.52), www/horizon_about.js (changelog), tests/rss.browser.cjs

## Search by name (RSS Feeds > ＋)
Type a name. Source chips: All, YouTube, GitHub, Reddit, Websites, Starter. Or type "yt mrbeast", "gh termux", "reddit termux".
- YouTube: searches channels on youtube.com, feed = the channel's own videos.xml
- GitHub: api.github.com repo search (releases feed, falls back to commits if no releases) + user search (public activity feed)
- Reddit: subreddit search, feed = r/name/.rss
- Websites: Feedly's public feed search (any blog/news/podcast site)
- Every result is fetched and parsed BEFORE it is shown: you see item count and latest post. Feeds that will not open are hidden and counted ("1 result hidden"). Nothing is guessed.
- A source that is blocked or rate limited is named under the results ("Not reachable: Reddit ...").
- Pasting a YouTube channel or playlist link, or an @handle, gives the feed directly. Links, user/repo and r/name work as before.

## Icons
Emoji in the name wins. Otherwise YouTube and GitHub show their logos; every other feed shows the site's real icon (letter on the feed colour until it loads). Saved feeds from V1.99.50 get icons automatically.
Privacy: site icons come from Google's favicon service (only the feed's domain is sent) or from Feedly for website results.

## Tested
tests/rss.browser.cjs (real Chromium, 3 themes, fixtures for every source): name search across all five sources, dead channel hidden, empty-releases repo falls back to commits, chips and prefixes, YouTube link, icons loaded, persistence.

## NOT verified (no internet in the build sandbox)
The live endpoints themselves (YouTube results page layout, GitHub/Reddit/Feedly API shapes) were built from how they answered before and tested against fixtures, not the real services. YouTube changes its page often; Reddit may refuse some requests. If one source fails you will see its name and the reason on screen, and the other sources still work.
