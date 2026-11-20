# Horizon V1.99.51 - HEARTBEAT on the pink Settings tile

Includes everything in V1.99.50 (RSS Feeds tile + the V1.99.49 Edge installer merge).

Changed: www/horizon_app.css (appended block), www/index.html (css cache-bust v=1.99.51), www/horizon_about.js (changelog), tests/front-header.test.cjs (cache-bust version)
New: tests/heartbeat.browser.cjs

## Why it only changed colour before
Lite mode is switched on by default for phones with <=4 GB RAM or <=6 cores (horizon_release.js). It sets `box-shadow:none !important` on every element, and an !important value beats an animation. So on a budget phone the tile's glow animation never rendered; only the colour change did. The glow is now also animated through `filter: drop-shadow()`, which lite mode does not touch.

## What it does now (while music plays or lyrics are open)
One 0.95 s clock (about 63 beats per minute) drives everything, so it all lands together:
- LUB at 8 %: tile kicks to 1.19x with a rattle (translate and rotate jitter), glow flares to full.
- Contracts to 0.96x, then DUB at 34 %: second softer beat at 1.14x, glow flares again.
- Rests for the back half of the cycle, glow drops to a dim ember. A real heartbeat has silence in it; that is on purpose.
- Icon rattles and flares on each beat.
- Two shock rings roll out from the tile: ring A on the LUB, ring B on the DUB.
- Reduced-motion setting: steady pink glow, no motion.
- Keyboard open or moving: animations pause (existing rule still applies).

## Tested
tests/heartbeat.browser.cjs (real Chromium, real app, 3 themes, lite mode on): idle = no animation; playing = 5 animations; LUB scale 1.19, contraction 0.97, DUB 1.12, rest exactly 1.0; ring A on LUB, ring B on DUB; filter glow differs between peak and rest. All 12 unit tests and the RSS browser test pass.

## NOT verified
- Real device feel (frame rate on the Honor X5b, how the strength reads in daylight). Headless Chromium here only proves the values and timing. If it is too strong or too fast, the numbers are in the @keyframes hzHeart block: 0.95s is the cycle, 1.19 and 1.14 are the beat sizes.
- It reacts to play/pause, not to the actual loudness of the song. A beat-matched pulse (BPM or audio level) is a separate job.
