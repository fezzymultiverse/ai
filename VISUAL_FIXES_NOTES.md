# Visual fixes on top of V1.99.116 (no version bump, web assets only, no APK rebuild)

- RADIO: while radio is tuning/playing, the music player no longer rewrites the lock-screen/notification metadata (horizon_music.js); radio sets its own the moment tuning starts (horizon_radio.js).
- WEATHER: always expanded, fold chevron hidden, saved "folded" state ignored (horizon_dash.js, horizon_layout.css). Clear-day / part-day tint changed from amber (read as brown on dark) to cool cyan-violet.
- LYRICS ON GREY: every lyric line state now uses dark ink on the Grey theme (horizon_layout.css).
- VISUALISER: swirl rotates about 1.7x faster while music plays; idle screensaver keeps its slow speed (horizon_swirl.js, horizon_rpidle.js).
- LYRICS STANDBY: new look (karaoke ghost lines, spinning record, floating notes) instead of the bars (index.html, horizon_layout.css).
- Tests: 285 pass, the same 4 fail as on V1.99.116. NOT tested on a phone.
- NOT built: YouTube video with subtitles in the lyrics panel.

## WATCH (added after the first fixes)
- New [[yt.watch: words or VIDEO_ID]] AI tag: the video plays in the media unit of the Widgets panel (view only, no fullscreen, tap = pause/play, X = close). Music and radio pause; the video closes if either starts.
- Subtitles show on the lyrics screen, synced to the video. They come from YouTube's own subtitle track for that video (manual track preferred, auto-generated marked AUTO). No track = it says so; nothing is made up. Not all videos have one, and YouTube can refuse the subtitle download.
- Files: www/horizon_watch.js (new), horizon_ytdirect.js (captions), index.html (tag + tool), horizon_toolpolicy.js, horizon_layout.css, tests/watch-v117.test.cjs.
- NOT tested on a phone: stream playback and the live subtitle download depend on YouTube answering.
