# Horizon V1.99.38 — + menu no longer truncates

- Implemented and tested (Chromium render at 360x640, 393x780, 412x915): every tool tile in the + menu now shows its full name and full description. No "..." and no 2-line clamp.
- Cause: tiles were fixed at 40px high with ellipsis, and the grid rows were being squeezed by the full-height overlay (`grid-auto-rows` now `max-content`).
- The menu still covers the whole screen above the chat and scrolls when taller than the phone; the People / Add chat strip stays pinned at the bottom.
- Changed: www/horizon_app.css (appended block, additive), www/index.html (cache-bust + WEB_VERSION), www/horizon_about.js (VERSION + changelog), tests/front-header.test.cjs (cache-bust assertion).
- scripts/predeliver.sh: node --check on all JS, 101 tests pass, 0 fail.
