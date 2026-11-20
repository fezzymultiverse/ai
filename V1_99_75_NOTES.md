# V1.99.75 - Where You Are inside Maps, right panel with no scroll, Edge plugin found by GitHub

Changed: www/index.html, www/horizon_locate.js, www/horizon_app.css (block appended), www/horizon_about.js, www/horizon_release.js, .github/workflows/build-apk.yml, tests/where-v73.test.cjs, version files.

- WHERE YOU ARE card: removed from the right panel. It is now the first block of the Maps window (tile on top), followed by the Maps form and map. Same GPS / IP / street / network / areas / "AI knows where I am" switch / refresh. The Maps button on the card is gone (you are already in Maps). Opening Maps repaints it and refreshes the fix when older than 4 minutes.
- Right panel home: overflow hidden, rows / media card shrink to fit, dock static. scrollHeight == clientHeight in a 360x800 headless check.
- Edge plugin: new workflow step "Locate Edge voice plugin sources" runs before the install steps. It looks for the 5 Kotlin files in android-native/com/festers/horizon/edge/, searches the whole repo for any copy, and if still incomplete rebuilds them from scripts/edge_kit.sh. Fails with a plain error if it cannot. Tested with the sources absent: all 5 restored.
- Not compiled, not seen on a phone.

## Install step hardening (same version)
scripts/install_native.sh no longer dies when android/build.gradle or app/build.gradle lack the exact lines it anchored on (AGP classpath line, allprojects { mavenCentral() }, apply plugin: 'com.android.application'). Each now has a fallback (extra buildscript / allprojects block, kotlin-android appended) and prints a "Note:" line. Tested on a bare and a Capacitor-7-style mock android/ project, run twice (idempotent): install + both --check commands pass. Real gradle build still not run here.

## Check bug fixed (found from the real CI log)
`install_native.sh --check` demanded the literal text `kotlin-android` in app/build.gradle, while the installer accepts `org.jetbrains.kotlin.android` (what the repo uses) and skips adding it. Result: install passed, check failed with "MISSING: kotlin-android in app/build.gradle". The check now accepts both spellings, plus jvmToolchain/compilerOptions as well as kotlinOptions, and a Kotlin plugin in either form in android/build.gradle. Tested on a mock with package com.fezzy.horizon and plugins{} style Gradle files.
