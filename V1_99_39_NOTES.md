# Horizon V1.99.39 — right-panel AI media cluster

- Right Settings panel: music player, waveform and lyrics widgets sit above the bottom app tiles as three separate cards in one cluster. Empty until the AI acts.
- AI-only: the player has no play/prev/next (display + Gemini ear + expand only); typing "show lyrics" no longer opens anything; only [[music.play]] and [[lyrics.show]] from the AI do.
- While music plays or lyrics are open the Settings button pulses with vibrating wave rings (horizon_rpmedia.js, reduced-motion safe).
- About & Updates moved from the bottom dock to a row under Downloads.
- Lyrics widget idles at 2 fps-ish (500 ms) while the right panel is closed.
- Files: index.html, horizon_music.js, horizon_lyrics.js, horizon_bojack.js, horizon_rpmedia.js (new), horizon_app.css, horizon_about.js, tests/lyrics.test.cjs, tests/front-header.test.cjs.
- predeliver.sh: 101 pass, 0 fail.
- Options pill (people/group chats) now sits directly above the chat box instead of inside it.
- Scroll-down circle (horizon_fab.js) now sits above the people/group pill row (3 in group, +) instead of on top of it.
- EDGE VOICES FIX: Microsoft rejects the old Sec-MS-GEC token since ~13 Oct 2026 (HTTP 403 on every voice). New android-native/.../EdgeGec.kt (v2 token, port of edge-tts 7.3.1 drm.py, LGPL, see android-native/NOTICE-gec.md); EdgeProtocol/EdgeTtsClient/plugin catalogue call updated. Compiled with kotlinc 2.0.21 and matched the Python reference on 62 timestamps incl. the published vector. NOT tested against the live service from here (network blocked): needs a native rebuild on your side.
