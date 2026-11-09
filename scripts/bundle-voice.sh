#!/usr/bin/env bash
# Horizon V1.75.0: pack the built-in Kitten voice (was Kokoro in V1.73/V1.74) into the Android project.
#   1. sherpa-onnx native libraries (libsherpa-onnx-jni.so + libonnxruntime.so, arm64-v8a)  -> android/app/src/main/jniLibs/arm64-v8a
#   2. sherpa-onnx Kotlin API (Tts.kt, package com.k2fsa.sherpa.onnx, same release tag)     -> android/app/src/main/java/com/k2fsa/sherpa/onnx
#   3. Kitten nano English model (4 male + 4 female voices, small)                          -> android/app/src/main/assets/horizon_voice
# Run after `npx cap add android` and scripts/apply-android.sh, from the project root. Needs: gh (GH_TOKEN set), curl, tar, python3.
# Optional: SHERPA_VERSION overrides the pinned compatible v1.12.14 runtime; incompatible phonemizer APIs fail loudly.
# Every step checks what it got and stops with a readable error, so a half-bundled APK can never ship.
set -euo pipefail

REPO="k2-fsa/sherpa-onnx"
APP="android/app"
MAIN="$APP/src/main"
JNI="$MAIN/jniLibs/arm64-v8a"
KT="$MAIN/java/com/k2fsa/sherpa/onnx"
ASSET="$MAIN/assets/horizon_voice"
APP_GRADLE="$APP/build.gradle"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

say() { echo "[bundle-voice] $*"; }
die() { echo "::error::bundle-voice: $*" >&2; echo "[bundle-voice] FAILED: $*" >&2; exit 1; }

command -v gh      >/dev/null 2>&1 || die "gh (GitHub CLI) is not installed"
command -v curl    >/dev/null 2>&1 || die "curl is not installed"
command -v tar     >/dev/null 2>&1 || die "tar is not installed"
command -v python3 >/dev/null 2>&1 || die "python3 is not installed"
[ -d "$MAIN" ]       || die "Android platform not found ($MAIN). Run: npx cap add android"
[ -f "$APP_GRADLE" ] || die "Missing $APP_GRADLE"

# ------------------------------------------------------------------------------------------
# 0. Which sherpa-onnx release
# ------------------------------------------------------------------------------------------
TAG="${SHERPA_VERSION:-v1.12.14}"
if [ -z "$TAG" ]; then
    TAG="$(gh release view --repo "$REPO" --json tagName --jq .tagName)" || die "could not read the newest $REPO release"
fi
[ -n "$TAG" ] || die "empty sherpa-onnx release tag"
say "sherpa-onnx release: $TAG"

# ------------------------------------------------------------------------------------------
# 1. Native libraries
# ------------------------------------------------------------------------------------------
LIBASSET="$(gh release view "$TAG" --repo "$REPO" --json assets --jq '.assets[].name' | grep -E '^sherpa-onnx-v[0-9][0-9.]*-android\.tar\.bz2$' | head -1 || true)"
[ -n "$LIBASSET" ] || die "release $TAG has no sherpa-onnx-v*-android.tar.bz2 asset. Set SHERPA_VERSION to an older release"
say "libraries: $LIBASSET"
gh release download "$TAG" --repo "$REPO" --pattern "$LIBASSET" --dir "$WORK" --clobber || die "download of $LIBASSET failed"
mkdir -p "$WORK/lib"
tar -xjf "$WORK/$LIBASSET" -C "$WORK/lib" || die "could not unpack $LIBASSET"
SO_JNI="$(find "$WORK/lib" -path '*arm64-v8a*' -name 'libsherpa-onnx-jni.so' | head -1)"
SO_ORT="$(find "$WORK/lib" -path '*arm64-v8a*' -name 'libonnxruntime.so' | head -1)"
[ -n "$SO_JNI" ] || die "libsherpa-onnx-jni.so (arm64-v8a) is not in $LIBASSET"
[ -n "$SO_ORT" ] || die "libonnxruntime.so (arm64-v8a) is not in $LIBASSET"
mkdir -p "$JNI"
cp "$SO_JNI" "$JNI/libsherpa-onnx-jni.so"
cp "$SO_ORT" "$JNI/libonnxruntime.so"
[ -s "$JNI/libsherpa-onnx-jni.so" ] && [ -s "$JNI/libonnxruntime.so" ] || die "native libraries did not land in $JNI"
say "native libraries in place (arm64-v8a)"

# ------------------------------------------------------------------------------------------
# 2. Kotlin API from the same tag (the JNI function names must match the Kotlin classes of the same release)
# ------------------------------------------------------------------------------------------
mkdir -p "$KT"
GOT=""
for path in "sherpa-onnx/kotlin-api/Tts.kt" "kotlin-api/Tts.kt" "android/SherpaOnnxTtsEngine/app/src/main/java/com/k2fsa/sherpa/onnx/Tts.kt"; do
    if curl -fsSL "https://raw.githubusercontent.com/$REPO/$TAG/$path" -o "$KT/Tts.kt" 2>/dev/null && [ -s "$KT/Tts.kt" ]; then GOT="$path"; break; fi
done
[ -n "$GOT" ] || die "could not fetch Tts.kt for $TAG"
grep -q '^package com.k2fsa.sherpa.onnx' "$KT/Tts.kt" || die "Tts.kt has an unexpected package"
grep -q 'class OfflineTts\b'             "$KT/Tts.kt" || die "Tts.kt has no OfflineTts class"
grep -q 'OfflineTtsKokoroModelConfig'    "$KT/Tts.kt" || die "this sherpa-onnx release has no Kokoro support in Tts.kt"
if grep -q 'deprecated, ignored; use lexicon or phonemeCodepoints' "$KT/Tts.kt"; then
    die "This runtime removed the espeak phonemizer used by Horizon packs. Use SHERPA_VERSION=v1.12.14; migrate phonemization before upgrading."
fi
say "Kotlin API in place ($GOT)"

# ------------------------------------------------------------------------------------------
# 3. Voice model. V1.75.0: KITTEN nano (small, 4 male + 4 female English voices) is the default.
#    HORIZON_VOICE=kokoro brings the big Kokoro model back (the plugin in this version only knows Kitten, so use the V1.74.0 zip for that).
# ------------------------------------------------------------------------------------------
VOICE="${HORIZON_VOICE:-kitten}"
[ "$VOICE" = "kitten" ] || die "this version only bundles the Kitten voice (HORIZON_VOICE=$VOICE). Kokoro lives in the V1.74.0 zip"
grep -q 'OfflineTtsKittenModelConfig' "$KT/Tts.kt" || die "this sherpa-onnx release has no Kitten support in Tts.kt. Set SHERPA_VERSION to a newer release"
MODEL=""
for name in kitten-nano-en-v0_2-fp16 kitten-nano-en-v0_1-fp16; do
    if gh release download tts-models --repo "$REPO" --pattern "$name.tar.bz2" --dir "$WORK" --clobber >/dev/null 2>&1 && [ -s "$WORK/$name.tar.bz2" ]; then MODEL="$name"; break; fi
done
[ -n "$MODEL" ] || die "no kitten-nano-en model in the $REPO tts-models release"
say "model: $MODEL"
mkdir -p "$WORK/model"
tar -xjf "$WORK/$MODEL.tar.bz2" -C "$WORK/model" || die "could not unpack $MODEL"
SRC="$(find "$WORK/model" -maxdepth 2 -name 'tokens.txt' -printf '%h\n' | head -1)"
[ -n "$SRC" ] || die "$MODEL has no tokens.txt"
[ -f "$SRC/voices.bin" ]     || die "$MODEL has no voices.bin"
[ -d "$SRC/espeak-ng-data" ] || die "$MODEL has no espeak-ng-data"
ONNX="$(ls "$SRC"/model*.onnx 2>/dev/null | head -1 || true)"
[ -n "$ONNX" ] || die "$MODEL has no model*.onnx"

rm -rf "$ASSET"
mkdir -p "$ASSET"
cp -R "$SRC"/. "$ASSET"/
printf '%s %s %s kitten\n' "$TAG" "$MODEL" "$(basename "$ONNX")" > "$ASSET/VERSION"
[ -s "$ASSET/tokens.txt" ] && [ -s "$ASSET/voices.bin" ] && [ -s "$ASSET/VERSION" ] || die "model files did not land in $ASSET"
say "model in place: $(du -sh "$ASSET" | cut -f1) in assets/horizon_voice"

# ------------------------------------------------------------------------------------------
# 4. Gradle: arm64 only (the libraries are arm64-v8a). Idempotent.
# ------------------------------------------------------------------------------------------
python3 - <<'PY'
import sys
from pathlib import Path
app = Path('android/app/build.gradle')
s = app.read_text()
if "abiFilters 'arm64-v8a'" not in s:
    if 'defaultConfig {' not in s:
        sys.exit('android/app/build.gradle has no "defaultConfig {" block')
    s = s.replace('defaultConfig {', "defaultConfig {\n        ndk { abiFilters 'arm64-v8a' }", 1)
app.write_text(s)
PY
grep -qF "abiFilters 'arm64-v8a'" "$APP_GRADLE" || die "could not pin arm64-v8a in $APP_GRADLE"
say "Gradle pinned to arm64-v8a"
say "Built-in voice bundled: $TAG, $MODEL"
