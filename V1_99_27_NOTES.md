# Horizon V1.99.27 - Native Edge voice

- Edge voices stream straight from Microsoft into ExoPlayer through a Kotlin Capacitor plugin (HorizonEdgeVoice). Termux dependency removed.
- Files changed: www/horizon_edge_tts.js (rewritten), www/index.html (script version), tests/edge-tts.test.cjs (rewritten),
  EDGE_TTS_NOTES.md. New: android-native/ (4 Kotlin files + README). Removed: scripts/horizon_edge_tts.sh, last_voice.
- Run `bash scripts/predeliver.sh` before building. It now auto-deletes stale files listed in scripts/obsolete_files.txt (fixes CI test 50).
