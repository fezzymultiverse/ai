# Horizon V1.99.66 - every native plugin in the zip, installed and checked by the build

Built on V1.99.65 plus the V1.99.66 work in progress (native sources, HTTP transport fix). `horizon-native-plugins.zip` added no
source that was not already here (see "Zips compared").

## Native plugins
- `android-native/app/`: 27 sources (22 Kotlin + Java services, receivers, plugins, MainActivity). Package line is `__APPID__`, replaced on install.
- `android-native/com/festers/horizon/stats/HorizonStatsPlugin.kt`: the merged Stats plugin. The old Java Stats plugin is NOT included: both registered as
  "HorizonStats" and Capacitor allows a name once.
- `android-native/manifest/` (permissions, `<queries>` for Termux and TTS, services and receivers) and `android-native/res/xml/network_security_config.xml`
  (HTTPS only; plain HTTP only to 127.0.0.1 and localhost).
- `scripts/install_native.sh`: dry run by default, `--apply`, `--check`. Now also reads `namespace = "x"` (newer Gradle spelling), not only `namespace "x"`.
- `scripts/regen_edge_kit.py`: rebuilds the payloads `edge_kit.sh` carries; `--check` reports drift.

## Build
- `.github/workflows/build-apk.yml`: after `cap sync` it runs `install_native.sh --apply`, `install_edge.sh --apply`, then `install_native.sh --check` and
  `edge_kit.sh --check` (the build stops with a reason if anything is missing), Gradle cache, `assembleDebug --stacktrace`, and uploads
  `gradle-reports` when the build fails.

## Network
- `www/horizon_net.js`: an empty 204 reply no longer throws, CapacitorHttp is looked up without registering it twice, cleartext errors say what to do.
- `HorizonAIPlugin.kt`: added `ai-gateway.kilo.ai`, removed `gateway.vlm.run` (VLM Run was removed in V1.99.63).

## Version
Release string, About entry, `?v=` cache-busters, scaffold and lockfile versions are 1.99.66.

## Tests: 25 were already failing in V1.99.65 and are repaired (no product code was bent to pass)
- 18 tests for the six AIs removed in V1.99.63 are retired; one regression test now asserts they stay removed (also in both HTTP allowlists).
- Version assertions accept any V1.99.6x instead of a frozen range; maps test no longer pins 1.99.62.
- Scoped-transport test uses `ch.at` (g4f.space is gone) and asserts g4f.space is now rejected.
- `net-transport-v66.test.cjs` runs under `node --test` (it needed a path argument before).
- `edge_kit.sh` payloads regenerated (3 were stale).
- `bash scripts/predeliver.sh`: 20 files, 191 pass, 0 fail.

## Zips compared (all Kotlin and Java files)
- `horizon-V1_99_66-WIP`: base of this zip.
- `horizon-native-plugins`: 22 Kotlin files all present here; older copies of `HorizonStatsPlugin.kt`, `HorizonAIPlugin.kt`, `MainActivity.java`. Its Java Stats plugin is intentionally left out.
- `horizon-V1_99_65`, `horizon-V1_99_62-REPAIR`, `horizon-V1_99_56`: contain only Edge + the older Stats plugin; nothing missing here.

## Verified / not verified
- Verified: predeliver gate; the workflow's own install and check commands replayed twice on a Capacitor-style `android/` in the CI layout (38 changes, then 0;
  manifest valid XML; 33 sources; 15 plugins registered; no duplicate plugin names; no leftover placeholders); every manifest component, permission and
  third-party import has a declaration or dependency; NewPipeExtractor v0.27.1 exists on GitHub.
- NOT verified: no Kotlin or Java compile (no compiler here, Maven and Google blocked), no real `cap add android` or Gradle run, no JitPack build of NewPipe,
  the workflow has not run on GitHub, nothing was tested on a phone. The first CI run decides. If it fails, send the log.
