#!/usr/bin/env bash
# V1.99.114 build entry point. This file was MISSING from the supplied V1.99.113-plusfix ZIP.
# No previous checks could be removed or weakened; install_native.sh remains the authoritative verifier.
# V1.99.117: icons + splash are now generated from assets/icon.svg (scripts/apply-icons.sh). Set HZ_SKIP_ICONS=1 to skip.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -s capacitor.config.json ] || { echo 'ERROR: capacitor.config.json missing'; exit 1; }
[ -s android/app/src/main/AndroidManifest.xml ] || { echo 'ERROR: run npx cap add android first'; exit 1; }
for f in HorizonFilesPlugin.java HorizonFilesAccessPlugin.java HorizonFilesState.java; do
  [ -s "android-native/app/$f" ] || { echo "ERROR: missing $f"; exit 1; }
done
[ -s android-native/files-native/horizon_files.c ] || { echo 'ERROR: missing atomic rename kernel wrapper'; exit 1; }
[ -s android-native/files-native/CMakeLists.txt ] || { echo 'ERROR: missing atomic rename build config'; exit 1; }
if [ "${HZ_SKIP_ICONS:-0}" != "1" ]; then bash scripts/apply-icons.sh android; fi
bash scripts/install_native.sh android --apply
bash scripts/install_native.sh --check android
# Every old installer check above is mandatory, plus both new plugin registrations and JNI dependency.
