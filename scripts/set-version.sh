#!/usr/bin/env bash
# Horizon: stamp versionName (from package.json) and versionCode into the Android build.
# Usage: bash scripts/set-version.sh [versionCode]
set -euo pipefail

GRADLE="android/app/build.gradle"
CODE="${1:-1}"

if [ ! -f "$GRADLE" ]; then
    echo "Missing $GRADLE. Run: npx cap add android" >&2
    exit 1
fi

VERSION="$(node -p "require('./package.json').version")"

sed -i -E "s/versionCode [0-9]+/versionCode ${CODE}/; s/versionName \"[^\"]*\"/versionName \"${VERSION}\"/" "$GRADLE"

echo "versionName=${VERSION} versionCode=${CODE}"
