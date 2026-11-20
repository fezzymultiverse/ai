#!/usr/bin/env bash
# Tests scripts/install_edge.sh against fake Capacitor android folders (Java and Kotlin MainActivity). No network, no Gradle.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; REPO="$(dirname "$HERE")"
T="$(mktemp -d "${TMPDIR:-/tmp}/edgeinst.XXXXXX")"; PASS=0; FAIL=0
ok() { PASS=$((PASS+1)); echo "ok   $1"; }
bad() { FAIL=$((FAIL+1)); echo "FAIL $1"; }
chk() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

mk() { # mk <dir> <java|kt|custom>
  local d="$1" kind="$2" j="$1/app/src/main/java/com/example/app"
  mkdir -p "$j" "$d/app/src/main"
  cat > "$d/build.gradle" <<'G'
buildscript {
    repositories { google() }
    dependencies {
        classpath 'com.android.tools.build:gradle:8.7.2'
        classpath 'com.google.gms:google-services:4.4.2'
    }
}
G
  cat > "$d/app/build.gradle" <<'G'
apply plugin: 'com.android.application'

android {
    namespace "com.example.app"
    compileSdk 35
}

dependencies {
    implementation project(':capacitor-android')
}
G
  cat > "$d/app/capacitor.build.gradle" <<'G'
android {
  compileOptions {
      sourceCompatibility JavaVersion.VERSION_21
      targetCompatibility JavaVersion.VERSION_21
  }
}
G
  cat > "$d/app/src/main/AndroidManifest.xml" <<'G'
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <application android:label="x"></application>
</manifest>
G
  case "$kind" in
    java) printf 'package com.example.app;\n\nimport com.getcapacitor.BridgeActivity;\n\npublic class MainActivity extends BridgeActivity {}\n' > "$j/MainActivity.java" ;;
    kt)   printf 'package com.example.app\n\nimport android.os.Bundle\nimport com.getcapacitor.BridgeActivity\n\nclass MainActivity : BridgeActivity() {\n    override fun onCreate(savedInstanceState: Bundle?) {\n        super.onCreate(savedInstanceState)\n    }\n}\n' > "$j/MainActivity.kt" ;;
    custom) printf 'package com.example.app;\npublic class MainActivity extends BridgeActivity {\n  @Override protected void onCreate(android.os.Bundle b) { foo(); }\n}\n' > "$j/MainActivity.java" ;;
  esac
}

# --- Java template ---
mk "$T/j" java
OUT="$(bash "$REPO/scripts/install_edge.sh" "$T/j")"; chk "java: dry run reports changes" '[[ "$OUT" == *"Dry run"* ]]'
chk "java: dry run writes nothing" '[ ! -d "$T/j/app/src/main/java/com/festers" ]'
bash "$REPO/scripts/install_edge.sh" "$T/j" --apply >/dev/null; chk "java: apply exit 0" '[ $? -eq 0 ]'
A="$T/j/app/src/main/java/com/example/app/MainActivity.java"
chk "java: registers before super.onCreate" 'grep -q "registerPlugin(com.festers.horizon.edge.HorizonEdgeVoicePlugin.class);" "$A" && grep -q "super.onCreate(savedInstanceState);" "$A"'
chk "java: order register < super" '[ "$(grep -n registerPlugin "$A" | cut -d: -f1)" -lt "$(grep -n "super.onCreate" "$A" | cut -d: -f1)" ]'
chk "java: 5 kotlin files copied" '[ "$(ls "$T/j/app/src/main/java/com/festers/horizon/edge/"*.kt | wc -l)" -eq 5 ]'
chk "java: INTERNET added" 'grep -q "android.permission.INTERNET" "$T/j/app/src/main/AndroidManifest.xml"'
chk "java: kotlin classpath added" 'grep -q "kotlin-gradle-plugin:1.9.25" "$T/j/build.gradle"'
chk "java: kotlin plugin applied" 'grep -q "apply plugin: .kotlin-android." "$T/j/app/build.gradle"'
chk "java: jvmTarget read from capacitor.build.gradle (21)" 'grep -q "jvmTarget = \"21\"" "$T/j/app/build.gradle"'
chk "java: okhttp + media3 added" 'grep -q "okhttp:4.12.0" "$T/j/app/build.gradle" && grep -q "media3-exoplayer:1.5.1" "$T/j/app/build.gradle"'
chk "java: backups kept" '[ -f "$A.edge-backup" ] && [ -f "$T/j/app/build.gradle.edge-backup" ]'
cp -r "$T/j" "$T/j_before"
OUT2="$(bash "$REPO/scripts/install_edge.sh" "$T/j" --apply)"; chk "java: second run changes nothing (idempotent)" '[[ "$OUT2" == *"0 file(s) changed"* ]]'
chk "java: second run leaves files identical" 'diff -r -q "$T/j" "$T/j_before" >/dev/null'

# --- Kotlin template ---
mk "$T/k" kt
bash "$REPO/scripts/install_edge.sh" "$T/k" --apply >/dev/null
K="$T/k/app/src/main/java/com/example/app/MainActivity.kt"
chk "kt: registers before super.onCreate" '[ "$(grep -n registerPlugin "$K" | cut -d: -f1)" -lt "$(grep -n "super.onCreate" "$K" | cut -d: -f1)" ] && grep -q "::class.java)" "$K"'

# --- empty Capacitor-style Java activity gets an onCreate ---
mk "$T/e" java
bash "$REPO/scripts/install_edge.sh" "$T/e" --apply >/dev/null
chk "empty activity: onCreate generated with register then super" 'grep -q "public void onCreate" "$T/e/app/src/main/java/com/example/app/MainActivity.java"'

# --- custom onCreate refused, nothing written ---
mk "$T/c" custom
bash "$REPO/scripts/install_edge.sh" "$T/c" --apply >/dev/null 2>&1; RC=$?
chk "custom onCreate: refuses with exit 2" '[ "$RC" -eq 2 ]'
chk "custom onCreate: no files written" '[ ! -d "$T/c/app/src/main/java/com/festers" ]'

# --- bad input ---
bash "$REPO/scripts/install_edge.sh" "$T/nope" >/dev/null 2>&1; chk "missing folder: exit 2" '[ $? -eq 2 ]'
bash "$REPO/scripts/install_edge.sh" >/dev/null 2>&1; chk "no args: exit 2" '[ $? -eq 2 ]'

rm -rf "$T"
echo; echo "$PASS passed, $FAIL failed"; [ "$FAIL" -eq 0 ]
