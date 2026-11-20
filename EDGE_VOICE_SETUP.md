# Horizon Edge Voice - setup and recovery (V1.99.54)

Settings shows "HorizonEdgeVoice is missing" when the APK was built WITHOUT the native Edge plugin.
Web files (www/) can never add it. The plugin is 5 Kotlin files that must be copied into the Android project and registered at build time.

## The 5 files (android-native/com/festers/horizon/edge/)
EdgeAudioPipe.kt, EdgeGec.kt, EdgeProtocol.kt, EdgeTtsClient.kt, HorizonEdgeVoicePlugin.kt

## Files the build needs in the repo (all are in this zip)
- android-native/com/festers/horizon/edge/*.kt  (the 5 above)
- scripts/install_edge.sh   (copies the 5 files into android/, registers the plugin, adds OkHttp + Media3 + Kotlin)
- scripts/edge_kit.sh       (restores ANY missing Edge file from itself, and checks the android/ folder)
- www/horizon_edge_tts.js   (the Settings > Voice screen)
- scripts/ci/gitlab-edge-snippet.yml, scripts/ci/github-edge-snippet.yml (the CI lines)

## If any of these are missing from a zip you were given
bash scripts/edge_kit.sh            # run in the repo root: restores every missing Edge file, never overwrites yours
bash scripts/edge_kit.sh --force    # also replaces files that differ with the V1.99.54 versions (old copy kept as .bak-TIMESTAMP)
edge_kit.sh is ONE self-contained file. Keep a copy of it on your phone and you never have to hunt for an old zip again.

## Put these lines in your APK build job (GitLab or GitHub), after the android/ folder exists and before gradle
npm ci
npx cap add android || true        # skip if android/ is committed
npx cap sync android
bash scripts/install_edge.sh android --apply
bash scripts/edge_kit.sh --check android   # FAILS the build with a plain reason if the plugin is not really inside android/
cd android && ./gradlew assembleDebug

## Check by hand
bash scripts/edge_kit.sh --check android
It verifies: 5 Kotlin files in android/app/src/main/java/com/festers/horizon/edge/, the plugin registered BEFORE super.onCreate in MainActivity,
INTERNET permission, OkHttp and Media3 in app/build.gradle, and the Kotlin plugin.

## After installing the new APK
Settings > Voice > Microsoft Edge voices > Check native connection > Load / refresh all Edge voices > Test Edge voice > tick Use Edge voices.

## If voices fail with HTTP 403
EdgeGec.kt holds the v2 token (Microsoft changed it on 13 Oct 2026). Make sure ALL 5 files are the V1.99.54 ones (edge_kit.sh --force) and rebuild the APK.

## Not verified
The Kotlin was not compiled here and no Android project was supplied. The first build on your side is the real test.

## GitHub Actions (V1.99.64)
.github/workflows/build-apk.yml is in the zip root and already runs install_edge.sh and edge_kit.sh --check before Gradle.
Commit .github/, scripts/, android-native/ and www/ to the repo, push, then download the "horizon-apk" artifact from the run.
If the check step fails, its log line names exactly what is missing from android/.

V1.99.66: the workflow now runs scripts/install_native.sh --apply first (every other plugin, the manifest entries and the Gradle dependencies),
then install_edge.sh, then install_native.sh --check and edge_kit.sh --check, and keeps a Gradle cache.
If a build fails, download the "gradle-reports" artifact from the run.
