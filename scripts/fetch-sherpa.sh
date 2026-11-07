#!/usr/bin/env bash
# Horizon V1.37.0: fetch the sherpa-onnx native libraries (arm64-v8a) and its Kotlin API for offline neural voices.
# Run from the project root after `npx cap add android`. Safe to run again.
set -euo pipefail
VER="${SHERPA_ONNX_VERSION:-1.13.6}"
JNI="android/app/src/main/jniLibs/arm64-v8a"
KT="android/app/src/main/java/com/k2fsa/sherpa/onnx"
if [ -s "$JNI/libsherpa-onnx-jni.so" ] && [ -s "$JNI/libonnxruntime.so" ] && [ -s "$KT/Tts.kt" ]; then
    echo "sherpa-onnx ${VER} already in place."
    exit 0
fi
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
echo "Fetching sherpa-onnx v${VER} Android libraries..."
curl -fsSL --retry 3 -o "$TMP/android.tar.bz2" "https://github.com/k2-fsa/sherpa-onnx/releases/download/v${VER}/sherpa-onnx-v${VER}-android.tar.bz2"
tar xjf "$TMP/android.tar.bz2" -C "$TMP"
SRC="$(find "$TMP" -type d -name arm64-v8a | head -1)"
[ -n "$SRC" ] && [ -s "$SRC/libsherpa-onnx-jni.so" ] && [ -s "$SRC/libonnxruntime.so" ] || { echo "arm64-v8a sherpa libraries not found in the release archive" >&2; exit 1; }
mkdir -p "$JNI" "$KT"
cp "$SRC"/*.so "$JNI"/
echo "Fetching sherpa-onnx Kotlin API..."
ok=0
for p in sherpa-onnx/kotlin-api/Tts.kt kotlin-api/Tts.kt; do
    if curl -fsSL --retry 3 -o "$KT/Tts.kt" "https://raw.githubusercontent.com/k2-fsa/sherpa-onnx/v${VER}/${p}"; then ok=1; break; fi
done
[ "$ok" = 1 ] && grep -q "class OfflineTts" "$KT/Tts.kt" || { echo "Could not fetch Tts.kt for v${VER}" >&2; exit 1; }
echo "sherpa-onnx ${VER} libraries and Kotlin API installed."
