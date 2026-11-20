# V1.99.69 - RSS "Your Feed" redesign (changed: www/horizon_rss.js, www/horizon_rss.css)

- Header: big "Your Feed" title + "Last Update" stamp, with a + button and a three-dots button.
- Three dots become a minus: every feed icon shows a red minus, tap it to remove that feed. An Undo bar shows for 8 seconds. Tap the minus in the header when done.
- Icon row: round platform icon with the platform name under it. Tap one to see only that feed, tap again for all.
- Rows: small source icon + name on the left, date on the right ("02 Nov"), big title, small thumbnail on the right when the feed has a picture.
- + opens ONE search box: name or website (YouTube, GitHub, Reddit, blogs, feed links, user/repo, r/subreddit). The starter/preset list is gone.
- Refresh, AI digest and Edit feeds (rename, reorder, on/off, tabs) sit in a small row under the header. Tabs only show if you have made some.
- Items fetched before this version have no pictures until the next refresh.
- Not run on a device from the build sandbox (no network); picture and icon loading needs internet.
