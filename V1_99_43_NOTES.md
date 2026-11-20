# Horizon V1.99.43 — right panel layout + idle screensaver

- Right panel: the player + lyrics cluster now sits directly above the APPS tiles. Settings rows share the free height evenly (54px floor, so nothing is squashed).
- While music plays or lyrics are open, rows drop their description line so the player and lyrics get the room. Lyrics S / M / L are now the full 124 / 184 / 260 px (the old 30vh cap is gone). The panel scrolls if L is chosen on a short phone; the tiles stay pinned.
- Idle screensaver (new www/horizon_rpidle.js): when nothing plays and no lyrics are open, the empty player + lyrics cards are replaced by a living wallpaper (aurora, stars, perspective grid) with a synthesised waveform, HORIZON mark and clock. Dark and grey themes. Sleeps when the panel is closed, the page is hidden or the keyboard is open; ~30 fps; reduced-motion gets one still frame. Reads no audio.
- Files: www/index.html, www/horizon_rpmedia.js, www/horizon_rpidle.js (new), www/horizon_app.css (appended block), www/horizon_about.js, tests/front-header.test.cjs, tests/edge-tts.test.cjs (cache-bust only).
- Checked: predeliver 110 pass, 0 fail. Headless Chromium 393x780: idle = no overflow, widgets end exactly at the tiles; playing state faked via the player's playing class.
- NOT tested: real playback on the phone, grey theme visually, very short screens with lyrics on L.
