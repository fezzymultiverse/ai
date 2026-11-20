# Horizon native Edge voice (Kotlin) - V1.99.27

Cloud to phone, nothing in between: Microsoft WebSocket -> OkHttp -> RAM pipe -> ExoPlayer. No Termux, no edge-tts, no temp files.

## 1. Copy
Copy `com/festers/horizon/edge/*.kt` to `android/app/src/main/java/com/festers/horizon/edge/`.
If your MainActivity package is not `com.festers.horizon`, change line 1 of each file.

## 2. Gradle (android/app/build.gradle, dependencies block; skip lines you already have)
```
implementation "com.squareup.okhttp3:okhttp:4.12.0"
implementation "androidx.media3:media3-exoplayer:1.5.1"
```
Needs the INTERNET permission (already there for the AI providers).

## 3. Register the plugin (MainActivity, BEFORE super.onCreate)
Kotlin:
```
registerPlugin(com.festers.horizon.edge.HorizonEdgeVoicePlugin::class.java)
```
Java:
```
registerPlugin(com.festers.horizon.edge.HorizonEdgeVoicePlugin.class);
```
Then `npx cap sync android` and build.

## Notes
- Endpoint: wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1 with TrustedClientToken and a rotating
  Sec-MS-GEC token (built in EdgeProtocol.secMsGec). The api.msedgeservices.com / cognitiveservices URL is not the keyless Edge service.
- Microsoft bumps the Edge version string now and then. If voices start failing with HTTP 403, JS can pass a newer
  `gecVersion` to `speak()` (no rebuild); the default is in EdgeProtocol.DEFAULT_VERSION.
- A phone clock that is off gets one automatic retry on the server's clock.
- Unofficial service: no SLA. Any failure falls back to the Android voice in JS, as before.


## Stats plugin — V1.99.37

The Stats native plugin is in `com/festers/horizon/stats/HorizonStatsPlugin.kt`.
From this source package run `python3 scripts/install_stats.py /path/to/existing/android` for a dry run;
review it, then add `--apply` to install and register the plugin. Run Capacitor sync and rebuild your existing host.
The supplied archive has no complete Gradle host, Android SDK or signing configuration, so it is not an APK.
Wi-Fi/cell details require the explicit in-app network-details action and OS location permission.
Cleanup is token-bound, expires after five minutes, skips changed files and is limited to the private
`cacheDir/horizon-transient` directory. Put only disposable app-owned cache there. Other cache/audio,
chats, keys, databases, user files and external downloads are excluded. Browser cleanup is independently
restricted to `horizon-transient-*` CacheStorage buckets. Native compilation and physical device behavior
must be validated in your Android build. See `TEST_REPORT.html` in the package root.


## V1.99.39: Edge voices were all failing with HTTP 403 (token v2)

Microsoft started rejecting the old Sec-MS-GEC token around 13 Oct 2026. `EdgeGec.kt` (new) builds the v2 token and the
client now sends `Sec-MS-GEC-Version=2-<version>`. Copy ALL `com/festers/horizon/edge/*.kt` again (EdgeGec.kt is new),
then `npx cap sync android` and REBUILD THE APK. A web-only update (www/) does not fix this: the token lives in the native plugin.
The voice catalogue request now carries the token too. See NOTICE-gec.md for the licence note.


## All native plugins - V1.99.66

`android-native/` now holds the source of EVERY Horizon native plugin, not only Stats and Edge voice.

| Path | Content |
|---|---|
| `app/` | 27 plugin / service / receiver sources (Kotlin + Java) incl. `MainActivity.java`. The package line is `__APPID__`; the installer writes your app namespace there. |
| `com/festers/horizon/stats/` | Kotlin Stats plugin (snapshot, netChange watch, token-bound cache clean). |
| `com/festers/horizon/edge/` | Kotlin Edge voice plugin (5 files). |
| `manifest/` | `permissions.txt`, `queries.xml` (Termux and TTS visibility), `components.xml` (services and receivers). |
| `res/xml/network_security_config.xml` | HTTPS only; plain HTTP only to 127.0.0.1 and localhost (your local G4F server). |

Install into an `android/` folder (the GitHub workflow does this on every build; every command is safe to repeat):
```
bash scripts/install_native.sh android            # dry run, writes nothing
bash scripts/install_native.sh android --apply    # sources, manifest, permissions, Gradle, network config
bash scripts/install_edge.sh android --apply
bash scripts/install_native.sh --check android    # exit 1 and the reason if anything is missing
bash scripts/edge_kit.sh --check android
```
Gradle changes it makes: Kotlin 1.9.25, JitPack, core-library desugaring, coroutines, WorkManager, biometrics, OkHttp, Media3 and
NewPipeExtractor v0.27.1, plus 3 GB Gradle heap. `scripts/install_stats.py` is only for older hosts; `install_native.sh` installs Stats too.

The old Java `HorizonStatsPlugin` is retired: it and the Kotlin one both register as `HorizonStats`, and Capacitor allows a name once.
A leftover copy is kept as `.native-backup`, and `--check` fails on any duplicate plugin name.

Maintenance: `scripts/edge_kit.sh` carries copies of the Edge files and this README. After editing any of them run
`python3 scripts/regen_edge_kit.py`, otherwise the kit test fails.

Not verified: no Kotlin or Java compile, no APK build, nothing run on a phone. The first CI run is the real test.
