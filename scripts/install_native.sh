#!/usr/bin/env bash
# Horizon V1.99.66 - install ALL Horizon native plugins into a Capacitor android/ folder. Pure Bash.
#
#   bash scripts/install_native.sh <android-dir>            dry run (writes nothing)
#   bash scripts/install_native.sh <android-dir> --apply    install / update (safe to repeat on every build)
#   bash scripts/install_native.sh --check <android-dir>    verify the android/ project is wired correctly (exit 1 + reasons if not)
#
# What it does:
#   1. MainActivity + every plugin/service/receiver from android-native/app -> app/src/main/java/<namespace>/
#      (the __APPID__ placeholder is replaced by the namespace in app/build.gradle)
#   2. Kotlin Stats + Edge voice plugins from android-native/com/festers/horizon/ (Edge files are also kept in sync by install_edge.sh)
#   3. res/xml/network_security_config.xml (HTTPS only, plain HTTP allowed ONLY to 127.0.0.1 / localhost)
#   4. AndroidManifest.xml: permissions, <queries> (Termux, TTS), services, receivers, networkSecurityConfig
#   5. Gradle: Kotlin plugin, JitPack, desugaring (NewPipe), dependencies, packaging excludes, more Gradle memory
# Env: KOTLIN_VERSION (1.9.25)  NEWPIPE_VERSION (v0.27.1)  JVM_TARGET (read from app/capacitor.build.gradle, else 17)
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
SRC_APP="$REPO/android-native/app"
SRC_KT="$REPO/android-native/com/festers/horizon"
SRC_RES="$REPO/android-native/res/xml/network_security_config.xml"
SRC_PERMS="$REPO/android-native/manifest/permissions.txt"
SRC_QUERIES="$REPO/android-native/manifest/queries.xml"
SRC_COMP="$REPO/android-native/manifest/components.xml"
KOTLIN_VERSION="${KOTLIN_VERSION:-1.9.25}"
NEWPIPE_VERSION="${NEWPIPE_VERSION:-v0.27.1}"
BEGIN_MARK="<!-- HORIZON-NATIVE-BEGIN -->"
END_MARK="<!-- HORIZON-NATIVE-END -->"

MODE=install
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi
ANDROID="${1:-}"
APPLY=0
[ "${2:-}" = "--apply" ] && APPLY=1
CHANGED=0
FAILED=0

die() { echo "ERROR: $*" >&2; echo "No further changes made." >&2; exit 2; }
warn() { echo "WARN: $*" >&2; }

[ -n "$ANDROID" ] || die "usage: bash scripts/install_native.sh [--check] <android-dir> [--apply]"
[ -d "$ANDROID" ] || die "'$ANDROID' is not a folder. Run 'npx cap add android' first."
ANDROID="$(cd "$ANDROID" && pwd)"
MAIN="$ANDROID/app/src/main"
MANIFEST="$MAIN/AndroidManifest.xml"
APPG="$ANDROID/app/build.gradle"
ROOTG="$ANDROID/build.gradle"
[ -f "$MANIFEST" ] || die "missing app/src/main/AndroidManifest.xml"
[ -f "$APPG" ] || die "app/build.gradle not found (Kotlin DSL .kts is not supported by this helper)"
[ -f "$ROOTG" ] || die "android/build.gradle not found"
[ -d "$SRC_APP" ] || die "plugin sources not found at $SRC_APP"
ls "$SRC_APP"/MainActivity.java >/dev/null 2>&1 || die "MainActivity.java missing from $SRC_APP"

# ---- package = namespace of the app module (the manifest resolves ".MainActivity" against it) ----
PKG=""
if [[ "$(cat "$APPG")" =~ namespace[[:space:]]*=?[[:space:]]*[\"\']([A-Za-z0-9_.]+)[\"\'] ]]; then PKG="${BASH_REMATCH[1]}"; fi
if [ -z "$PKG" ] && [ -f "$REPO/capacitor.config.json" ]; then
  if [[ "$(cat "$REPO/capacitor.config.json")" =~ \"appId\"[[:space:]]*:[[:space:]]*\"([A-Za-z0-9_.]+)\" ]]; then PKG="${BASH_REMATCH[1]}"; fi
fi
[ -n "$PKG" ] || die "could not read the app namespace from app/build.gradle"
PKGDIR="${PKG//.//}"
JAVA_DIR="$MAIN/java/$PKGDIR"

# ---- helpers ----
backup_once() { # backup_once <file>
  if [ -f "$1" ] && [ ! -f "$1.native-backup" ]; then cp -p "$1" "$1.native-backup"; fi
}

put_file() { # put_file <src> <dest> [sed-script]
  local src="$1" dest="$2" tmp
  tmp="$(mktemp)"
  if [ -n "${3:-}" ]; then sed "$3" "$src" > "$tmp"; else cat "$src" > "$tmp"; fi
  if [ -f "$dest" ] && cmp -s "$tmp" "$dest"; then rm -f "$tmp"; return 0; fi
  echo "Write: ${dest#"$ANDROID"/}"
  CHANGED=$((CHANGED + 1))
  if [ "$APPLY" -eq 1 ]; then
    mkdir -p "$(dirname "$dest")"
    backup_once "$dest"
    cp "$tmp" "$dest"
  fi
  rm -f "$tmp"
}

put_text() { # put_text <path> <new content>
  local path="$1" content="$2" old=""
  if [ -f "$path" ]; then old="$(cat "$path")"; fi
  if [ -f "$path" ] && [ "$old" = "$content" ]; then return 0; fi
  echo "Update: ${path#"$ANDROID"/}"
  CHANGED=$((CHANGED + 1))
  if [ "$APPLY" -eq 1 ]; then
    backup_once "$path"
    printf '%s\n' "$content" > "$path"
  fi
}

retire() { # retire <file>: keep it as .native-backup so it no longer compiles
  [ -f "$1" ] || return 0
  echo "Retire: ${1#"$ANDROID"/} (kept as .native-backup)"
  CHANGED=$((CHANGED + 1))
  if [ "$APPLY" -eq 1 ]; then
    if [ -f "$1.native-backup" ]; then rm -f "$1"; else mv "$1" "$1.native-backup"; fi
  fi
}

# ============================== CHECK MODE ==============================
if [ "$MODE" = "check" ]; then
  bad() { echo "MISSING: $*" >&2; FAILED=1; }
  X="$(cat "$MANIFEST")"; G="$(cat "$APPG")"; R="$(cat "$ROOTG")"
  for f in "$SRC_APP"/*.kt "$SRC_APP"/*.java; do
    b="$(basename "$f")"
    [ -f "$JAVA_DIR/$b" ] || bad "source $b is not inside android/ ($JAVA_DIR)"
  done
  for f in "$SRC_KT"/stats/*.kt "$SRC_KT"/edge/*.kt; do
    [ -f "$MAIN/java/com/festers/horizon/${f#"$SRC_KT"/}" ] || bad "source ${f#"$SRC_KT"/} is not inside android/"
  done
  [ -f "$MAIN/res/xml/network_security_config.xml" ] || bad "res/xml/network_security_config.xml"
  [ -s "$MAIN/res/raw/horizon_live.sh" ] || bad "res/raw/horizon_live.sh (Termux live transport)"
  if [ -f "$MAIN/res/raw/horizon_live.sh" ]; then cmp -s "$REPO/android-native/res/raw/horizon_live.sh" "$MAIN/res/raw/horizon_live.sh" || bad "outdated Termux live transport"; fi
  [[ "$X" == *"android:networkSecurityConfig"* ]] || bad "android:networkSecurityConfig in the manifest"
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    [[ "$X" == *"android:name=\"${line%%|*}\""* ]] || bad "permission ${line%%|*}"
  done < "$SRC_PERMS"
  while IFS= read -r cls; do
    [[ "$X" == *"android:name=\"$PKG.$cls\""* || "$X" == *"android:name=\".$cls\""* ]] || bad "manifest component $cls"
  done < <(grep -o 'android:name="@APPID@\.[A-Za-z]*"' "$SRC_COMP" | sed 's/.*@APPID@\.//; s/"//')
  [[ "$X" == *"<queries>"* ]] || bad "<queries> block (Termux and TTS are invisible to the app without it)"
  MA="$JAVA_DIR/MainActivity.java"
  if [ -f "$MA" ]; then
    for p in HorizonFilesPlugin HorizonFilesAccessPlugin HorizonOutputPlugin HorizonContactsPlugin HorizonPermsPlugin HorizonAIPlugin HorizonMediaPlugin HorizonSpeechPlugin HorizonDaemonPlugin HorizonLensPlugin com.festers.horizon.stats.HorizonStatsPlugin com.festers.horizon.edge.HorizonEdgeVoicePlugin HorizonBrowserPlugin HorizonCheckinPlugin HorizonTermuxPlugin HorizonExtractorPlugin HorizonLockPlugin HorizonAlarmPlugin HorizonDisplayPlugin HorizonNotificationsPlugin HorizonWaBotPlugin; do
      [[ "$(cat "$MA")" == *"registerPlugin($p.class)"* ]] || bad "registerPlugin($p) in MainActivity"
    done
  else bad "MainActivity.java in $JAVA_DIR"; fi
  # V1.99.75: accept both Kotlin plugin spellings (kotlin-android / org.jetbrains.kotlin.android) and both JVM-target styles, same as the installer does.
  [[ "$R" == *"kotlin-gradle-plugin"* || "$R" == *"org.jetbrains.kotlin.android"* || "$R" == *"org.jetbrains.kotlin"* ]] || bad "Kotlin plugin in android/build.gradle"
  [[ "$R" == *"jitpack.io"* || "$(cat "$ANDROID/settings.gradle" 2>/dev/null)" == *"jitpack.io"* ]] || bad "jitpack.io in android/build.gradle"
  [[ "$G" == *"kotlin-android"* || "$G" == *"org.jetbrains.kotlin.android"* ]] || bad "kotlin-android in app/build.gradle"
  [[ "$G" == *"kotlinOptions"* || "$G" == *"jvmToolchain"* || "$G" == *"compilerOptions"* ]] || bad "Kotlin JVM target (kotlinOptions / jvmToolchain) in app/build.gradle"
  for d in "coreLibraryDesugaringEnabled" "kotlinx-coroutines-android" "androidx.work:work-runtime-ktx" "androidx.biometric:biometric" "okhttp3:okhttp" "media3-exoplayer" "NewPipeExtractor" "desugar_jdk_libs_nio"; do
    [[ "$G" == *"$d"* ]] || bad "$d in app/build.gradle"
  done
  for need in 'vnd.android.document/directory' 'resource/folder'; do
    [[ "$X" == *"$need"* ]] || bad "folder query $need"
  done
  [[ "$G" == *"androidx.exifinterface:exifinterface"* ]] || bad "EXIF metadata dependency"
  [[ "$G" == *"externalNativeBuild"* ]] || bad "atomic no-overwrite rename CMake integration"
  [ -f "$MAIN/cpp/horizon-files/horizon_files.c" ] || bad "atomic rename C source"
  [ -f "$MAIN/cpp/horizon-files/CMakeLists.txt" ] || bad "atomic rename CMake configuration"
  [[ "$(cat "$ANDROID/app/proguard-rules.pro" 2>/dev/null)" == *"HorizonFilesState"* ]] || bad "JNI state class preservation rule"
  # a Capacitor plugin name may only be registered once
  DUP="$(find "$MAIN/java" \( -name '*.kt' -o -name '*.java' \) -print0 | xargs -0 cat | tr '\n' ' ' | grep -oE '@CapacitorPlugin\([[:space:]]*name[[:space:]]*=[[:space:]]*"[A-Za-z0-9]+"' | sed 's/.*"\(.*\)"/\1/' | sort | uniq -d)"
  [ -z "$DUP" ] || bad "duplicate Capacitor plugin name(s): $DUP"
  if [ "$FAILED" -ne 0 ]; then echo "CHECK FAILED: the Horizon native plugins are NOT fully inside android/. Run: bash scripts/install_native.sh $ANDROID --apply" >&2; exit 1; fi
  echo "CHECK OK: $(ls "$JAVA_DIR"/*.kt "$JAVA_DIR"/*.java | wc -l) app sources, Stats + Edge plugins, manifest, Gradle and network config are in place (package $PKG)."
  exit 0
fi

# ============================== INSTALL MODE ==============================
echo "App package: $PKG"

# ---- 1. sources ----
ACTS=()
while IFS= read -r f; do ACTS+=("$f"); done < <(find "$MAIN/java" \( -name MainActivity.java -o -name MainActivity.kt \) 2>/dev/null)
for a in "${ACTS[@]+"${ACTS[@]}"}"; do
  [ "$a" = "$JAVA_DIR/MainActivity.java" ] || retire "$a"
done
for f in "$SRC_APP"/*.kt "$SRC_APP"/*.java; do
  put_file "$f" "$JAVA_DIR/$(basename "$f")" "s/__APPID__/$PKG/g"
done
# File administration's tiny native kernel wrapper is required for race-free no-clobber renames.
put_file "$REPO/android-native/files-native/CMakeLists.txt" "$MAIN/cpp/horizon-files/CMakeLists.txt"
put_file "$REPO/android-native/files-native/horizon_files.c" "$MAIN/cpp/horizon-files/horizon_files.c" "s|__APPIDPATH__|$PKGDIR|g"
# the old Java HorizonStatsPlugin shared the Capacitor name "HorizonStats" with the Kotlin one: only one can exist
retire "$JAVA_DIR/HorizonStatsPlugin.java"
for f in "$SRC_KT"/stats/*.kt "$SRC_KT"/edge/*.kt; do
  put_file "$f" "$MAIN/java/com/festers/horizon/${f#"$SRC_KT"/}"
done

# ---- 2. network security config ----
put_file "$SRC_RES" "$MAIN/res/xml/network_security_config.xml"
put_file "$REPO/android-native/res/raw/horizon_live.sh" "$MAIN/res/raw/horizon_live.sh"

# ---- 3. manifest ----
X="$(cat "$MANIFEST"; printf x)"; X="${X%x}"
# 3a permissions
PERMS=""
while IFS= read -r line; do
  [ -n "$line" ] || continue
  name="${line%%|*}"; extra=""
  [[ "$line" == *"|"* ]] && extra=" ${line#*|}"
  [[ "$X" == *"android:name=\"$name\""* ]] || PERMS+="    <uses-permission android:name=\"$name\"$extra />"$'\n'
done < "$SRC_PERMS"
if [ -n "$PERMS" ]; then
  [[ "$X" == *"<manifest"* ]] || die "AndroidManifest.xml has no <manifest> tag"
  HEAD="${X%%<manifest*}"; TAIL="${X#*<manifest}"; ATTRS="${TAIL%%>*}"; REST="${TAIL#*>}"
  X="$HEAD<manifest$ATTRS>"$'\n'"$PERMS${REST#$'\n'}"
fi
# 3b <queries> (Termux and the TTS engine are invisible to the app on Android 11+ without it)
if [[ "$X" != *"<queries>"* ]]; then
  [[ "$X" == *"<application"* ]] || die "AndroidManifest.xml has no <application> tag"
  PRE="${X%%<application*}"; POST="${X#"$PRE"}"
  PRE="${PRE%"${PRE##*[![:space:]]}"}"
  X="$PRE"$'\n\n'"$(cat "$SRC_QUERIES")"$'\n\n    '"$POST"
else
  for need in 'android:name="com.termux"' 'android.intent.action.TTS_SERVICE'; do
    [[ "$X" == *"$need"* ]] || warn "your <queries> block lacks $need - add it by hand (see android-native/manifest/queries.xml)"
  done
fi
# Add WhatsApp visibility on both fresh installs and existing Android projects.
for pkg in com.whatsapp com.whatsapp.w4b; do
  if [[ "$X" != *"android:name=\"$pkg\""* ]]; then
    ADD="<package android:name=\"$pkg\" />"
    X="${X/<\/queries>/$ADD<\/queries>}"
  fi
done
# Add folder visibility even when an existing <queries> block was already present.
for mime in 'vnd.android.document/directory' 'resource/folder'; do
  if [[ "$X" != *"$mime"* ]]; then
    ADD="<intent><action android:name=\"android.intent.action.VIEW\" /><data android:mimeType=\"$mime\" /></intent>"
    X="${X/<\/queries>/$ADD<\/queries>}"
  fi
done
# 3c networkSecurityConfig
if [[ "$X" != *"android:networkSecurityConfig"* ]]; then
  X="${X/<application/<application android:networkSecurityConfig=\"@xml/network_security_config\"}"
fi
# 3d components (own block between markers, replaced on every run)
if [[ "$X" == *"$BEGIN_MARK"* && "$X" == *"$END_MARK"* ]]; then
  PRE="${X%%"$BEGIN_MARK"*}"; POST="${X#*"$END_MARK"}"
  X="${PRE%"${PRE##*[![:space:]]}"}${POST}"
fi
DUPCOMP=""
while IFS= read -r cls; do
  if [[ "$X" == *"android:name=\"$PKG.$cls\""* || "$X" == *"android:name=\".$cls\""* ]]; then DUPCOMP+=" $cls"; fi
done < <(grep -o 'android:name="@APPID@\.[A-Za-z]*"' "$SRC_COMP" | sed 's/.*@APPID@\.//; s/"//')
if [ -n "$DUPCOMP" ]; then
  warn "manifest already declares:$DUPCOMP (outside the Horizon block) - components NOT added, to avoid duplicates"
else
  [[ "$X" == *"</application>"* ]] || die "AndroidManifest.xml has no </application> tag"
  COMP="$(sed "s/@APPID@/$PKG/g" "$SRC_COMP")"
  PRE="${X%</application>*}"; POST="</application>${X##*</application>}"
  PRE="${PRE%"${PRE##*[![:space:]]}"}"
  X="$PRE"$'\n\n        '"$BEGIN_MARK"$'\n'"$COMP"$'\n        '"$END_MARK"$'\n    '"$POST"
fi
put_text "$MANIFEST" "${X%$'\n'}"
if command -v xmllint >/dev/null 2>&1 && [ "$APPLY" -eq 1 ]; then
  xmllint --noout "$MANIFEST" || { echo "ERROR: the edited AndroidManifest.xml is not valid XML (original kept as AndroidManifest.xml.native-backup)." >&2; FAILED=1; }
fi

# ---- 4. root build.gradle: Kotlin plugin + JitPack (NewPipeExtractor) ----
R="$(cat "$ROOTG"; printf x)"; R="${R%x}"
if [[ "$R" != *"kotlin-gradle-plugin"* && "$R" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"com.android.tools.build:gradle"* ]]; then
      OUT+="        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\""$'\n'; DONE=1
    fi
  done <<< "$R"
  if [ "$DONE" -eq 0 ]; then
    # V1.99.75 fallback: no AGP classpath line to anchor on. Add a second dependencies block inside buildscript, or a new buildscript.
    OUT=""; DONE=0
    while IFS= read -r line || [ -n "$line" ]; do
      OUT+="$line"$'\n'
      if [ "$DONE" -eq 0 ] && [[ "$line" =~ ^[[:space:]]*buildscript[[:space:]]*\{ ]]; then
        OUT+="    dependencies { classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\" }"$'\n'; DONE=1
      fi
    done <<< "$R"
    if [ "$DONE" -eq 0 ]; then
      OUT="buildscript {"$'\n'"    repositories { google(); mavenCentral() }"$'\n'"    dependencies { classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\" }"$'\n'"}"$'\n'"$R"$'\n'
    fi
    echo "Note: no AGP classpath line in android/build.gradle, added the Kotlin plugin through a buildscript block instead."
    R="${OUT%$'\n'}"
  else R="${OUT%$'\n'}"; fi
fi
if [[ "$R" != *"jitpack.io"* ]]; then
  OUT=""; INALL=0; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    [[ "$line" == *"allprojects"* ]] && INALL=1
    if [ "$INALL" -eq 1 ] && [ "$DONE" -eq 0 ] && [[ "$line" == *"mavenCentral()"* ]]; then
      OUT+="        maven { url 'https://jitpack.io' }"$'\n'; DONE=1
    fi
  done <<< "$R"
  if [ "$DONE" -eq 0 ]; then
    # V1.99.75 fallback: append our own allprojects block (Gradle allows more than one).
    echo "Note: no allprojects { mavenCentral() } found, appended an allprojects block with JitPack."
    R="$R"$'\n'"allprojects {"$'\n'"    repositories {"$'\n'"        maven { url 'https://jitpack.io' }"$'\n'"    }"$'\n'"}"
  else R="${OUT%$'\n'}"; fi
fi
put_text "$ROOTG" "${R%$'\n'}"

# ---- 5. app/build.gradle ----
G="$(cat "$APPG"; printf x)"; G="${G%x}"
if [[ "$G" != *"kotlin-android"* && "$G" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"apply plugin: 'com.android.application'"* || "$line" == *'apply plugin: "com.android.application"'* ]]; then
      OUT+="apply plugin: 'kotlin-android'"$'\n'; DONE=1
    fi
  done <<< "$G"
  if [ "$DONE" -eq 0 ]; then
    echo "Note: no 'apply plugin: com.android.application' line, appended apply plugin: 'kotlin-android' at the end of app/build.gradle."
    G="$G"$'\n'"apply plugin: 'kotlin-android'"
  else G="${OUT%$'\n'}"; fi
fi
if [[ "$G" != *"kotlinOptions"* && "$G" != *"jvmToolchain"* ]]; then
  JV="${JVM_TARGET:-}"
  if [ -z "$JV" ] && [ -f "$ANDROID/app/capacitor.build.gradle" ]; then
    CB="$(cat "$ANDROID/app/capacitor.build.gradle")"
    [[ "$CB" =~ JavaVersion\.VERSION_([0-9]+) ]] && JV="${BASH_REMATCH[1]}"
  fi
  JV="${JV:-17}"
  G+=$'\n\n// Horizon native: Kotlin target matches the Java target.\nandroid {\n    kotlinOptions {\n        jvmTarget = "'"$JV"$'"\n    }\n}'
fi
if [[ "$G" != *"coreLibraryDesugaringEnabled"* ]]; then
  G+=$'\n\n// Horizon native: NewPipeExtractor needs core library desugaring below minSdk 33; META-INF duplicates from its jars are dropped.\nandroid {\n    compileOptions {\n        coreLibraryDesugaringEnabled true\n    }\n    packaging {\n        resources {\n            excludes += [\x27META-INF/DEPENDENCIES\x27, \x27META-INF/LICENSE\x27, \x27META-INF/LICENSE.txt\x27, \x27META-INF/NOTICE\x27, \x27META-INF/NOTICE.txt\x27, \x27META-INF/INDEX.LIST\x27]\n        }\n    }\n}'
fi
MISSING=""
add_dep() { # add_dep <configuration> <group:artifact> <version>
  [[ "$G" == *"$2"* ]] || MISSING+="    $1 \"$2:$3\""$'\n'
}
add_dep implementation "androidx.exifinterface:exifinterface" "1.3.7"
add_dep implementation "org.jetbrains.kotlinx:kotlinx-coroutines-android" "1.8.1"
add_dep implementation "androidx.work:work-runtime-ktx" "2.9.1"
add_dep implementation "androidx.biometric:biometric" "1.1.0"
add_dep implementation "com.squareup.okhttp3:okhttp" "4.12.0"
add_dep implementation "androidx.media3:media3-exoplayer" "1.5.1"
add_dep implementation "com.github.TeamNewPipe:NewPipeExtractor" "$NEWPIPE_VERSION"
add_dep coreLibraryDesugaring "com.android.tools:desugar_jdk_libs_nio" "2.0.4"
if [ -n "$MISSING" ]; then
  G+=$'\n\n// Horizon native: coroutines, WorkManager, biometrics, OkHttp, ExoPlayer, NewPipe extractor.\ndependencies {\n'"${MISSING}}"
fi
if [[ "$G" != *"cpp/horizon-files/CMakeLists.txt"* ]]; then
  G+=$'\n\n// File administration: kernel-enforced RENAME_NOREPLACE; never a copy/delete fallback.\nandroid {\n    externalNativeBuild {\n        cmake {\n            path file("src/main/cpp/horizon-files/CMakeLists.txt")\n            version "3.22.1"\n        }\n    }\n}\n'
fi
put_text "$APPG" "${G%$'\n'}"

# Preserve the JNI class and method names if a host enables R8/minification later.
PRO="$ANDROID/app/proguard-rules.pro"
PROTEXT="$(cat "$PRO" 2>/dev/null || true)"
if [[ "$PROTEXT" != *"HorizonFilesState"* ]]; then
  PROTEXT+=$'\n# Horizon atomic no-overwrite JNI registration.\n-keep class '"$PKG"$'.HorizonFilesState { *; }\n'
  put_text "$PRO" "$PROTEXT"
fi

# ---- 6. Gradle memory (Kotlin + NewPipe + dexing needs more than the 1.5 GB template default) ----
GP="$ANDROID/gradle.properties"
if [ -f "$GP" ]; then
  GPC="$(cat "$GP"; printf x)"; GPC="${GPC%x}"
  if [[ "$GPC" =~ org\.gradle\.jvmargs=([^$'\n']*) ]]; then
    cur="${BASH_REMATCH[1]}"
    if [[ "$cur" =~ -Xmx([0-9]+)([mMgG]) ]]; then
      n="${BASH_REMATCH[1]}"; u="${BASH_REMATCH[2]}"
      case "$u" in g|G) mb=$((n * 1024)) ;; *) mb=$n ;; esac
      if [ "$mb" -lt 3072 ]; then GPC="${GPC/org.gradle.jvmargs=$cur/org.gradle.jvmargs=${cur/-Xmx$n$u/-Xmx3g}}"; fi
    fi
  else
    GPC+=$'\norg.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8\n'
  fi
  [[ "$GPC" == *"android.useAndroidX"* ]] || GPC+=$'\nandroid.useAndroidX=true\n'
  put_text "$GP" "${GPC%$'\n'}"
fi

echo
if [ "$FAILED" -ne 0 ]; then echo "Finished WITH ERRORS (see above)." >&2; exit 3; fi
if [ "$APPLY" -eq 1 ]; then echo "Applied. $CHANGED change(s). Next: npx cap sync android, then bash scripts/install_edge.sh android --apply, then build."
else echo "Dry run: $CHANGED change(s) would be made. Nothing written. Repeat with --apply."; fi
exit 0
