#!/usr/bin/env bash
# Horizon V1.99.49 - install the native Edge voice plugin into a Capacitor android/ folder. Pure Bash.
# Usage: bash scripts/install_edge.sh <android-dir> [--apply]
# Dry run by default. Safe to run on every CI build: it only changes what is missing.
# Env: KOTLIN_VERSION (default 1.9.25), JVM_TARGET (default: read from app/capacitor.build.gradle, else 17)
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
SRC="$REPO/android-native/com/festers/horizon/edge"
ANDROID="${1:-}"
APPLY=0
[ "${2:-}" = "--apply" ] && APPLY=1
KOTLIN_VERSION="${KOTLIN_VERSION:-1.9.25}"
FAILED=0
CHANGED=0

die() { echo "ERROR: $*" >&2; echo "No further changes made." >&2; exit 2; }

[ -n "$ANDROID" ] || die "usage: bash scripts/install_edge.sh <android-dir> [--apply]"
[ -d "$ANDROID" ] || die "'$ANDROID' is not a folder. In CI run 'npx cap add android' first."
ANDROID="$(cd "$ANDROID" && pwd)"
MAIN="$ANDROID/app/src/main"
MANIFEST="$MAIN/AndroidManifest.xml"
[ -f "$MANIFEST" ] || die "missing app/src/main/AndroidManifest.xml"
ls "$SRC"/*.kt >/dev/null 2>&1 || die "Kotlin sources not found at $SRC"

APPG="$ANDROID/app/build.gradle"
ROOTG="$ANDROID/build.gradle"
[ -f "$APPG" ] || die "app/build.gradle not found (Kotlin DSL .kts is not supported by this helper)"
[ -f "$ROOTG" ] || die "android/build.gradle not found"

# exactly one MainActivity
ACTS=()
while IFS= read -r f; do ACTS+=("$f"); done < <(find "$MAIN/java" \( -name MainActivity.java -o -name MainActivity.kt \) 2>/dev/null)
[ "${#ACTS[@]}" -eq 1 ] || die "expected one MainActivity under app/src/main/java, found ${#ACTS[@]}"
ACT="${ACTS[0]}"

# write_if_changed <path> <new content>
write_if_changed() {
  local path="$1" content="$2" old="" oldn newn
  if [ -f "$path" ]; then old="$(cat "$path")"; fi
  oldn="$old"; newn="$content"
  if [ -f "$path" ] && [ "$oldn" = "$newn" ]; then return 0; fi
  echo "Update: $path"
  CHANGED=$((CHANGED + 1))
  if [ "$APPLY" -eq 1 ]; then
    if [ -f "$path" ] && [ ! -f "$path.edge-backup" ]; then cp -p "$path" "$path.edge-backup"; fi
    mkdir -p "$(dirname "$path")"
    printf '%s\n' "$content" > "$path"
  fi
}

# ---- 1. register the plugin in MainActivity ----
S="$(cat "$ACT"; printf x)"; S="${S%x}"
REG='com.festers.horizon.edge.HorizonEdgeVoicePlugin'
if [[ "$S" =~ registerPlugin[[:space:]]*\([[:space:]]*(com\.festers\.horizon\.edge\.)?HorizonEdgeVoicePlugin ]]; then
  :
else
  case "$ACT" in
    *.java) CALL="registerPlugin($REG.class);"; SEMI=";" ;;
    *)      CALL="registerPlugin($REG::class.java)"; SEMI="" ;;
  esac
  if [[ "$S" =~ super\.onCreate[[:space:]]*\([[:space:]]*savedInstanceState[[:space:]]*\)[[:space:]]*\;? ]]; then
    M="${BASH_REMATCH[0]}"; PRE="${S%%"$M"*}"; POST="${S#"$PRE$M"}"
    S="$PRE$CALL"$'\n        '"$M$POST"
  elif [[ "$S" == *"onCreate"* ]]; then
    die "MainActivity has a custom onCreate. Register $REG manually before super.onCreate."
  else
    case "$ACT" in
      *.java) RE='class[[:space:]]+MainActivity[[:space:]]+extends[[:space:]]+BridgeActivity[[:space:]]*\{'
              BLK=$'\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        '"$CALL"$'\n        super.onCreate(savedInstanceState);\n    }\n' ;;
      *)      RE='class[[:space:]]+MainActivity[[:space:]]*:[[:space:]]*BridgeActivity\(\)[[:space:]]*\{'
              BLK=$'\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        '"$CALL"$'\n        super.onCreate(savedInstanceState)\n    }\n' ;;
    esac
    [[ "$S" =~ $RE ]] || die "unrecognised MainActivity. Register $REG manually."
    M="${BASH_REMATCH[0]}"; PRE="${S%%"$M"*}"; POST="${S#"$PRE$M"}"
    S="$PRE$M$BLK$POST"
  fi
fi
write_if_changed "$ACT" "${S%$'\n'}"

# ---- 2. INTERNET permission ----
X="$(cat "$MANIFEST"; printf x)"; X="${X%x}"
if [[ "$X" != *"android.permission.INTERNET"* ]]; then
  HEAD="${X%%<manifest*}"; TAIL="${X#*<manifest}"; ATTRS="${TAIL%%>*}"; REST="${TAIL#*>}"
  X="$HEAD<manifest$ATTRS>"$'\n    <uses-permission android:name="android.permission.INTERNET"/>'"$REST"
fi
write_if_changed "$MANIFEST" "${X%$'\n'}"

# ---- 3. Kotlin plugin in the root build.gradle ----
R="$(cat "$ROOTG"; printf x)"; R="${R%x}"
if [[ "$R" != *"kotlin-gradle-plugin"* && "$R" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"com.android.tools.build:gradle"* ]]; then
      OUT+="        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\""$'\n'; DONE=1
    fi
  done <<< "$R"
  if [ "$DONE" -eq 0 ]; then echo "ERROR: could not find the Android Gradle plugin line in android/build.gradle. Add: classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\"" >&2; FAILED=1
  else R="${OUT%$'\n'}"; fi
fi
write_if_changed "$ROOTG" "${R%$'\n'}"

# ---- 4. app/build.gradle: kotlin plugin, java/kotlin target, dependencies ----
G="$(cat "$APPG"; printf x)"; G="${G%x}"
if [[ "$G" != *"kotlin-android"* && "$G" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"apply plugin: 'com.android.application'"* || "$line" == *'apply plugin: "com.android.application"'* ]]; then
      OUT+="apply plugin: 'kotlin-android'"$'\n'; DONE=1
    fi
  done <<< "$G"
  if [ "$DONE" -eq 0 ]; then echo "ERROR: app/build.gradle does not use 'apply plugin: com.android.application'. Add the Kotlin Android plugin by hand." >&2; FAILED=1
  else G="${OUT%$'\n'}"; fi
fi
if [[ "$G" != *"kotlinOptions"* && "$G" != *"jvmToolchain"* ]]; then
  JV="${JVM_TARGET:-}"
  if [ -z "$JV" ] && [ -f "$ANDROID/app/capacitor.build.gradle" ]; then
    CB="$(cat "$ANDROID/app/capacitor.build.gradle")"
    [[ "$CB" =~ JavaVersion\.VERSION_([0-9]+) ]] && JV="${BASH_REMATCH[1]}"
  fi
  JV="${JV:-17}"
  G+=$'\n\n// Horizon Edge: Kotlin target matches the Java target.\nandroid {\n    kotlinOptions {\n        jvmTarget = "'"$JV"$'"\n    }\n}'
fi
MISSING=""
for dep in "com.squareup.okhttp3:okhttp:4.12.0" "androidx.media3:media3-exoplayer:1.5.1"; do
  [[ "$G" == *"${dep%:*}"* ]] || MISSING+="    implementation \"$dep\""$'\n'
done
if [ -n "$MISSING" ]; then
  G+=$'\n\n// Horizon Edge: streamed speech, no external CLI.\ndependencies {\n'"${MISSING}}"
fi
write_if_changed "$APPG" "${G%$'\n'}"

# ---- 5. Kotlin sources ----
for f in "$SRC"/*.kt; do
  C="$(cat "$f")"
  write_if_changed "$MAIN/java/com/festers/horizon/edge/$(basename "$f")" "$C"
done

echo
if [ "$FAILED" -ne 0 ]; then echo "Finished WITH ERRORS (see above)." >&2; exit 3; fi
if [ "$APPLY" -eq 1 ]; then echo "Applied. $CHANGED file(s) changed. Now: npx cap sync android, then build."
else echo "Dry run: $CHANGED file(s) would change. Nothing written. Repeat with --apply."; fi
exit 0
