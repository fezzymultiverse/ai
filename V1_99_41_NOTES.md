# Horizon V1.99.41 — music cluster, Settings tile pulse, smaller + menu

- Right panel: the music player and the waveform are now ONE card (waveform sits inside the player card, progress line on its bottom edge). Lyrics card unchanged.
- Chat screen: the now-playing strip (#mpNow) is hidden with CSS, so no music player shows on the chat screen. The player is in the right panel; the Music tab still has the full controls. (JS still updates the strip in the background, so nothing else breaks.)
- Settings tile pulse: V1.99.39 marked only the hidden #settingsBtn, so nothing visibly moved. The mark now goes on the visible top-right tile (.hzc-set), re-applied every tick. While music plays or lyrics are open the tile vibrates, glows, wobbles its icon and sends out cyan and pink wave rings. Reduced-motion users get a static glow. Paused while the keyboard is open.
- + menu: now a bottom sheet that is as tall as its tiles (max 82% of the screen or 680 px, then it scrolls) instead of a full-screen sheet. Tile text and sizes are unchanged.
- Files: www/index.html, www/horizon_rpmedia.js, www/horizon_app.css (appended block), www/horizon_about.js, tests/front-header.test.cjs.
- Checked: predeliver 101 pass, 0 fail. Headless Chromium at 393x780: tile animation names active, strip display none, waveform inside the player card, + menu top at 140 of 780.
- NOT tested: real playback on the phone (the render faked the "playing" state), and the grey theme.
