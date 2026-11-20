# Horizon V1.99.54 - NO SILENT FALLBACK + EXACT-SONG YOUTUBE + NATIVE-FIRST PLAY

Includes everything in V1.99.53. Full project, nothing removed (all 201 original files + the additions listed under 5).
Changed: www/index.html, www/horizon_music.js, www/horizon_toolpolicy.js, www/horizon_about.js, tests/ytmatch-v54.test.cjs

## 1. Z.ai no longer takes over (index.html, Rate Limit Rescue)
Cause: a Cloudflare 429 ("neurons used up") counted as a rate limit, and Rescue handed the message to the next provider, Z.ai first (RESCUE_FIRST), then switched your active AI to it (setActive).
Now: auto-switch is OFF unless you turn it on (new setting key horizon_autoswitch_v2, the old key is ignored so nobody stays switched on by accident). setActive(other) is removed, so the AI you chose stays active even if you do turn auto-switch on. When a limit hits, a toast says "Nothing was switched. Pick another AI yourself, then tap Retry."
Still active: backup keys for the SAME provider.

## 2. YouTube: exact song, verified save (index.html)
- [[yt.get: Artist - Title]] (new): search, score, save, WAIT, report. Result is SAVED (path), STILL DOWNLOADING, ERROR or NEEDS CHOICE.
- Scoring: all your words must appear; live/cover/remix/sped up/slowed/karaoke/instrumental/nightcore/8d/reaction/tutorial/mashup/loop lose; official audio and "- Topic" win; under 45 s or over 10 min lose. Ask for "live" or "remix" and those stop losing.
- Not confident = nothing is downloaded and the AI gets the candidates to ask you.
- A failed save retries once, then says ERROR. The AI can no longer say "downloading" for a dead job.
- yt.search is ranked best first with flags. yt.play and yt.download accept words as well as video ids. A plain 11-letter word (Radioactive) is no longer mistaken for a video id.

## 3. Native first (index.html)
"play X" and "download the song X" typed as a simple sentence are run by the app BEFORE the AI is asked; the AI only reports the real result. Vague requests ("play something chill"), lyrics, radio and group chats are left to the AI. music.play falls back to YouTube by itself when the song is not in your library (YouTube button on).

## 4. Library (horizon_music.js)
Accents ignored, one typo allowed, exact title wins, music.search shows closest matches when nothing is exact.

## Tested
node --check on every www/*.js, inline-script check, all tests (old + 10 new in tests/ytmatch-v54.test.cjs: ranking, wrong-song rejection, verified SAVED, retry, intent reading, id detection, fallback settings).

## NOT verified (needs the phone)
Live NewPipe / YouTube responses and real downloads on the Honor X5b. The matching and waiting logic is tested with fake search results and fake downloads. If a good song is refused as NEEDS CHOICE, the numbers are in ytRank and ytSure in index.html (cover >= 0.8, score >= 0.75).

## 5. Edge Voice kit ("HorizonEdgeVoice is missing") - added files
- scripts/edge_kit.sh: ONE self-contained file carrying the 5 Kotlin files, install_edge.sh/.py, www/horizon_edge_tts.js, both CI snippets and the setup guide.
  `bash scripts/edge_kit.sh` restores anything missing (never overwrites yours), `--force` replaces differing files (old copy kept as .bak-TIMESTAMP), `--check android` fails with a plain reason if the plugin is not really in the android/ project, `--install android` does restore + install + check.
- EDGE_VOICE_SETUP.md: the one-page guide. scripts/ci/github-edge-snippet.yml: GitHub Actions version of the CI lines (the GitLab one was already there).
- tests/edge-kit-v54.test.cjs: restore is byte-identical, --check fails before and passes after install.
Why the APK said missing: web files cannot add the plugin. The CI build must run install_edge.sh before gradle. Add the lines from the setup guide to your build job; --check will fail the build instead of shipping an APK without the voice.
