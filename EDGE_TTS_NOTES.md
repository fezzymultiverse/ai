# Horizon V1.99.42 — Edge TTS integration and verification

## This update

The Edge JavaScript adapter now supports the unbundled Capacitor bridge (`nativePromise` + `addListener`), not just `Plugins` or `registerPlugin`. This was a missing execution path in the uploaded adapter; the main app already supported it. A plugin that is not present in the installed APK still cannot be added by replacing web assets.

The Voice settings now include **Check native connection**. It reports the included plugin's build identifier, or an actionable registration/rebuild error. Playback startup allows 30 seconds; listener registration has an 8-second deadline, and the catalogue bridge has a 25-second deadline. Catalogue network requests remain bounded to 10 seconds per attempt; native catalogue loading retries once on HTTP 403 with server-clock correction. Built-in/custom voice selections remain usable when catalogue loading fails.

## Native installation (existing Android project required)

The ZIP does not contain an Android Gradle host, wrapper, APK, or Android SDK configuration. Kotlin support in your existing Capacitor Android project is required.

From the project root, preview integration with:

```sh
python3 scripts/install_edge.py /path/to/your/android
```

Review the plan, then apply:

```sh
python3 scripts/install_edge.py /path/to/your/android --apply
```

The helper copies all five Kotlin source files, registers HorizonEdgeVoicePlugin before `super.onCreate`, ensures INTERNET permission, and adds missing OkHttp/Media3 dependencies. It supports standard Java or Kotlin MainActivity and Groovy/Kotlin app Gradle files, preserves `.edge-backup` files, and is idempotent. It refuses unrecognised host layouts. It does not change your Gradle/Kotlin plugin versions or sync web assets. Existing Kotlin setup is mandatory.

Sync the updated `www` assets using your normal Capacitor build flow, rebuild, and install the APK. Open Settings → Personalisation → Voice → Microsoft Edge voices. Tap **Check native connection**, **Load / refresh all Edge voices**, then **Test Edge voice**. Enable **Use Edge voices** for automatic reply readout. If the check shows a missing/outdated plugin, a web-only refresh is insufficient.

## What was actually verified

- 110 Node regression tests pass, including the unbundled native bridge, voice catalogue, timeout/error handling, and installer dry-run/idempotence fixtures for Java and Kotlin hosts.
- Six Chromium UI configurations pass at 320, 393, and 768 px in dark and grey themes; these include actual silent WAV playback through the browser music player. The music Settings tile pulses on playback and stops on pause. Lyrics activity uses a clearly identified DOM-state fixture.
- A separate Chromium Edge UI fixture tests native check, voice loading and test completion through a mocked nativePromise bridge. This does **not** synthesize Microsoft speech.
- Kotlin/Android was **not compiled** here. Live Microsoft synthesis, a physical phone speaker, native audio focus/background behavior, and on-device voice catalogue access remain **unverified**. The full Android project was not supplied.

## Prior architecture notes (historical V1.99.27)


Path of the audio: Microsoft WebSocket -> OkHttp -> in-memory pipe -> ExoPlayer. No Termux, no edge-tts CLI, no temp files, no /sdcard.

- Native side (Kotlin): android-native/com/festers/horizon/edge/ - copy, add 2 gradle lines, register the plugin. Steps in android-native/README.md.
- App side: www/horizon_edge_tts.js now calls the HorizonEdgeVoice plugin. The Set up button is gone (nothing to install).
- Endpoint: wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1 + Sec-MS-GEC token. The api.msedgeservices.com URL from the brief
  is not the keyless Edge service (the cognitiveservices/websocket/v1 path is Azure's paid Speech API and needs a key).
- Chunks are streamed into ONE continuous mp3 stream, so playback starts on the first bytes and has no gaps between chunks.
- Speed slider drives Edge too (1.0x = +0%). Per-AI voices, fallback to Android voice, 3-minute cooldown: unchanged.
- Failure after sound started ends quietly (no second read from the top). Failure before sound falls back to the Android voice.
- Removed: scripts/horizon_edge_tts.sh, SCRIPT_B64, Termux commands, stray test file `last_voice`.
- Tests: tests/edge-tts.test.cjs rewritten (mock plugin, Kotlin static checks). Run `bash scripts/predeliver.sh`: 76 pass.
- NOT done here: Kotlin was not compiled (no kotlinc in this environment) and the Android project is not in the zip. First build on your side is the real test.
