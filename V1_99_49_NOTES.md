# Horizon V1.99.49 - put the Edge voice plugin into the APK build

Why: Settings showed "HorizonEdgeVoice is missing". The plugin is Kotlin and lives in the APK, so web files alone cannot add it.

## Added (overlay: unzip over the project root, nothing existing is changed)
- scripts/install_edge.sh - pure Bash installer. Dry run by default, `--apply` to write, `.edge-backup` files kept, safe to run on every build.
- scripts/ci/gitlab-edge-snippet.yml - the CI lines, in order.
- tests/edge-install.test.sh - 20 checks against fake Java/Kotlin Capacitor folders.
- android-native/ - the same five Kotlin files as V1.99.48, unchanged (included so the overlay is self-contained).

## What the installer does
1. Registers HorizonEdgeVoicePlugin in MainActivity before super.onCreate (adds an onCreate if the activity is empty).
2. Adds the INTERNET permission if missing.
3. Adds the Kotlin Gradle plugin (default 1.9.25) and `apply plugin: 'kotlin-android'`, with kotlinOptions jvmTarget read from capacitor.build.gradle.
4. Adds okhttp 4.12.0 and media3-exoplayer 1.5.1 if missing.
5. Copies the five Kotlin files into app/src/main/java/com/festers/horizon/edge/.
Refuses (exit 2, nothing written) on a custom onCreate or a missing folder. Exit 3 if it cannot place the Kotlin plugin lines.

## Status
- Implemented + tested: the installer logic, `bash -n`, 20/20 checks in tests/edge-install.test.sh (Java template, Kotlin template, empty activity, custom onCreate refusal, idempotent second run).
- NOT tested: a real `gradlew` build, Kotlin compile of the plugin, Kotlin/AGP version compatibility with your Capacitor version, live Microsoft audio on the phone.
- Planned (not done): pass gecVersion from Settings to the plugin so a Microsoft version bump needs no rebuild.
- Groovy build.gradle only (Capacitor default). Kotlin DSL (.kts) is not handled.
