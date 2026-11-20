# Horizon V1.99.53 - LIVE PULSE on the pink Settings tile

Includes V1.99.52 (RSS search by name + icons) and V1.99.51 (heartbeat).
Changed: www/horizon_app.css (appended block), www/index.html (css cache-bust 1.99.53), www/horizon_about.js (changelog), tests/heartbeat.browser.cjs

## What you see while music plays or lyrics are open
- Rainbow rim chasing around the tile edge (one lap every 1.1 s).
- One colour cycle (2.4 s): pink, red, yellow, green, cyan, violet. It drives the border, the icon, the glow and the shock ring together.
- Heartbeat kick and shake stays, stronger: about 2 px shake and 3 degrees tilt, scale up to 1.24.
- Moves through transform / filter / opacity only, so lite mode cannot remove it.

## Why it only "turned pink" before (most likely)
The old rule said: if the phone asks for reduced motion (Android "Remove animations", battery saver), show a steady glow and no movement. That is exactly a tile that turns pink and does not move. This tile now ignores that setting on purpose. To make it respect the setting again, delete the V1.99.53 block at the end of horizon_app.css.

## Tested
Real Chromium with reduced-motion switched ON: 5 animations run, rim and colours change between frames (screenshots checked: pink, orange and green frames, rim visible). tests/heartbeat.browser.cjs passes; predeliver all tests pass.

## NOT verified
Frame rate and strength on the Honor X5b in daylight. The pulse follows play/pause, not the loudness of the song; a beat-matched pulse is a separate job. If it is too strong: the numbers are in the V1.99.53 hzHeart and hzRimSpin blocks.
