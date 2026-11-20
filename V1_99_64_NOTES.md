# Horizon V1.99.64 - GitHub build wiring for the Edge voice plugin

Built on V1.99.63. No app code changed apart from the version string and an About changelog entry.

## Added
- .github/workflows/build-apk.yml: npm install, cap add android (only if android/ is missing), cap sync, scripts/install_edge.sh --apply, scripts/edge_kit.sh --check, gradle assembleDebug, upload the APK as the "horizon-apk" artifact.
- EDGE_VOICE_SETUP.md: GitHub Actions section.

## Needs at the repo root
package.json with @capacitor/core, www/, scripts/, android-native/ (this zip has no package.json or android/, so the workflow only works inside your full project repo).

## Verified / not verified
- Verified: workflow YAML parses; node --check on edited JS; inline script syntax check; existing Edge installer fixtures (20) and Edge Node tests pass.
- Not verified: the workflow has not run on GitHub, the Kotlin has never been compiled, and nothing was tested on a phone or against Microsoft's live service.
