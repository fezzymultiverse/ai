#!/usr/bin/env bash
# Horizon: apply launcher icons, splash, manifest edits, Gradle dependencies and native plugin sources
# to the generated Android platform. Run after `npx cap add android`, from the project root.
#
# V1.63.1: rebuilt so one failed edit can no longer hide behind a vague message.
#   - The keyboard-resize edit used to look for "<activity " (with a space). Capacitor writes "<activity"
#     followed by a line break, so the edit silently did nothing and the check after it failed. It now matches
#     the MainActivity element however it is laid out.
#   - Every check goes through die(), which prints what went wrong AND the current manifest, so the build log
#     shows the real state instead of one line.
#   - Every native source is copied by one function that verifies the file landed and that no __APPID__ is left.
set -euo pipefail

SRC="resources/android/res"
DEST="android/app/src/main/res"
MANIFEST="android/app/src/main/AndroidManifest.xml"
APP_GRADLE="android/app/build.gradle"
ROOT_GRADLE="android/build.gradle"

say() { echo "[apply-android] $*"; }

# die MESSAGE: print the message as a CI error, show the manifest for context, stop.
die() {
    echo "::error::$*" >&2
    echo "[apply-android] FAILED: $*" >&2
    if [ -f "$MANIFEST" ]; then
        echo "---- current AndroidManifest.xml (first 90 lines) ----" >&2
        sed -n '1,90p' "$MANIFEST" >&2 || true
        echo "---- end manifest ----" >&2
    fi
    exit 1
}

# need FILE FIXED_TEXT MESSAGE: fail with MESSAGE unless FILE contains FIXED_TEXT (literal match, not a pattern).
need() {
    [ -f "$1" ] || die "$3 (file not found: $1)"
    grep -qF -- "$2" "$1" || die "$3"
}

command -v python3 >/dev/null 2>&1 || die "python3 is required but not installed"
command -v node    >/dev/null 2>&1 || die "node is required but not installed"

[ -d "$DEST" ] || die "Android platform not found. Run: npx cap add android"
[ -d "$SRC" ]  || die "Missing $SRC. Run: python3 scripts/make_icons.py"

# ------------------------------------------------------------------------------------------
# 1. Icons and splash
# ------------------------------------------------------------------------------------------
# Remove the default Capacitor launcher + splash assets so nothing stale survives.
find "$DEST" -type f -name 'ic_launcher*' -delete
find "$DEST" -type f -name 'splash.*' -delete

# Drop in the Horizon assets.
cp -R "$SRC"/. "$DEST"/

# Fail loudly if the icon did not land, so a default Android icon can never ship silently.
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    for f in ic_launcher.png ic_launcher_round.png ic_launcher_foreground.png; do
        cmp -s "$SRC/mipmap-$d/$f" "$DEST/mipmap-$d/$f" || die "Icon check failed: mipmap-$d/$f"
    done
done
[ ! -e "$DEST/drawable-v24/ic_launcher_foreground.xml" ] || die "Stale default icon still present"
say "Horizon icons and splash applied (verified)."

# ------------------------------------------------------------------------------------------
# 2. Manifest permissions
# ------------------------------------------------------------------------------------------
[ -f "$MANIFEST" ] || die "Missing $MANIFEST"

add_perm() {
    # $1 = permission name, $2 = optional extra attributes
    if ! grep -qF "android.permission.$1\"" "$MANIFEST"; then
        sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$1\"${2:-} />\n</manifest>#" "$MANIFEST"
    fi
    grep -qF "android.permission.$1\"" "$MANIFEST" || die "Could not add permission $1 to the manifest"
}
add_perm INTERNET
add_perm WAKE_LOCK
add_perm POST_NOTIFICATIONS
add_perm RECORD_AUDIO
add_perm MODIFY_AUDIO_SETTINGS
add_perm REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
add_perm READ_MEDIA_AUDIO
add_perm FOREGROUND_SERVICE
add_perm FOREGROUND_SERVICE_MEDIA_PLAYBACK
add_perm FOREGROUND_SERVICE_DATA_SYNC
add_perm READ_EXTERNAL_STORAGE ' android:maxSdkVersion="32"'
add_perm WRITE_EXTERNAL_STORAGE ' android:maxSdkVersion="28"'
add_perm ACCESS_NETWORK_STATE
add_perm ACCESS_COARSE_LOCATION
add_perm ACCESS_FINE_LOCATION
add_perm USE_BIOMETRIC
add_perm VIBRATE
add_perm RECEIVE_BOOT_COMPLETED       # V1.68.0: re-arm alarms after a reboot
add_perm SET_ALARM                    # V1.68.0: add the alarm to the phone's Clock app
add_perm SCHEDULE_EXACT_ALARM ' android:maxSdkVersion="32"'
add_perm USE_EXACT_ALARM              # V1.68.0: exact alarms for a calendar / alarm app (Android 13+)
add_perm USE_FULL_SCREEN_INTENT   # V1.63.0: lets a reply open over a locked screen (Android 14 asks the user once)
say "Manifest permissions applied (verified)."

# ------------------------------------------------------------------------------------------
# 3. Manifest components that need no Kotlin: background service, TTS query
# ------------------------------------------------------------------------------------------
# V1.5.0: background keep-alive service
if ! grep -qF "HorizonBgService" "$MANIFEST"; then
    sed -i 's#</application>#        <service android:name=".HorizonBgService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>#' "$MANIFEST"
fi
need "$MANIFEST" "HorizonBgService" "Could not add the background service to the manifest"

# V1.7.0: let the app see Android's text-to-speech service (required on Android 11+ to list voices)
if ! grep -qF "android.intent.action.TTS_SERVICE" "$MANIFEST"; then
    sed -i 's#</manifest>#    <queries>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />\n        </intent>\n    </queries>\n</manifest>#' "$MANIFEST"
fi
need "$MANIFEST" "android.intent.action.TTS_SERVICE" "Could not add the text-to-speech query to the manifest"

# Dedicated mediaPlayback service (not the data-sync keep-alive service).
if ! grep -qF 'android:name=".HorizonMediaService"' "$MANIFEST"; then
    sed -i 's#</application>#        <service android:name=".HorizonMediaService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>#' "$MANIFEST"
fi
need "$MANIFEST" 'android:name=".HorizonMediaService"' "Could not add the media service to the manifest"

# ------------------------------------------------------------------------------------------
# 4. Native plugin sources (Java + Kotlin)
# ------------------------------------------------------------------------------------------
APPID="$(node -p "require('./capacitor.config.json').appId")"
[ -n "$APPID" ] || die "capacitor.config.json has no appId"
JAVA_DIR="android/app/src/main/java/${APPID//./\/}"
[ -d "$JAVA_DIR" ] || die "Missing $JAVA_DIR (appId mismatch? Capacitor made a different package folder)"

# A Kotlin MainActivity from the template would clash with the Java one we install.
rm -f "$JAVA_DIR/MainActivity.kt"

# put_sources FILE...: copy each source into the app package with the real appId, and verify it landed.
put_sources() {
    local f
    for f in "$@"; do
        [ -f "resources/android/java/$f" ] || die "Native source is missing from the repo: resources/android/java/$f"
        sed "s/__APPID__/${APPID}/" "resources/android/java/$f" > "$JAVA_DIR/$f"
        [ -s "$JAVA_DIR/$f" ] || die "Native source missing after apply: $f"
        if grep -qF "__APPID__" "$JAVA_DIR/$f"; then die "Placeholder __APPID__ left in $f"; fi
    done
}

JAVA_SOURCES="HorizonPermsPlugin.java HorizonBgService.java HorizonMediaPlugin.java HorizonMediaService.java HorizonArt.java HorizonSpeechPlugin.java HorizonLensPlugin.java HorizonStatsPlugin.java HorizonBrowserPlugin.java MainActivity.java"
KOTLIN_SOURCES="HorizonAlarms.kt HorizonAlarmReceiver.kt HorizonAlarmBootReceiver.kt HorizonAlarmService.kt HorizonAlarmPlugin.kt HorizonAIPlugin.kt HorizonAIService.kt HorizonReplyReceiver.kt HorizonSpeakService.kt HorizonShellPlugin.kt HorizonLockPlugin.kt HorizonNotify.kt HorizonScopes.kt HorizonCanary.kt HorizonVoicePlugin.kt HorizonDaemonPlugin.kt"

# shellcheck disable=SC2086
put_sources $JAVA_SOURCES
say "Horizon permissions and native plugin applied."

# ------------------------------------------------------------------------------------------
# 5. Kotlin support (V1.13.0), idempotent across add, update and sync hooks
# ------------------------------------------------------------------------------------------
python3 - <<'PY'
import sys
from pathlib import Path

root = Path('android/build.gradle')
s = root.read_text()
if 'org.jetbrains.kotlin:kotlin-gradle-plugin:' not in s:
    if '    dependencies {' not in s:
        sys.exit('android/build.gradle has no "dependencies {" block to add the Kotlin plugin to')
    s = s.replace('    dependencies {', "    dependencies {\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'", 1)
root.write_text(s)

app = Path('android/app/build.gradle')
s = app.read_text()
if "apply plugin: 'org.jetbrains.kotlin.android'" not in s:
    if "apply plugin: 'com.android.application'" not in s:
        sys.exit("android/app/build.gradle has no \"apply plugin: 'com.android.application'\" line")
    s = s.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'", 1)
if 'jvmTarget = "17"' not in s:
    if 'android {' not in s:
        sys.exit('android/app/build.gradle has no "android {" block')
    s = s.replace('android {', 'android {\n    kotlinOptions { jvmTarget = "17" }\n    compileOptions {\n        sourceCompatibility JavaVersion.VERSION_17\n        targetCompatibility JavaVersion.VERSION_17\n    }', 1)
app.write_text(s)

manifest = Path('android/app/src/main/AndroidManifest.xml')
s = manifest.read_text()
if 'android:name=".HorizonAIService"' not in s:
    s = s.replace('</application>', '    <service android:name=".HorizonAIService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>')
if 'android:name=".HorizonSpeakService"' not in s:
    s = s.replace('</application>', '    <service android:name=".HorizonSpeakService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>')
if 'android:name=".HorizonReplyReceiver"' not in s:
    s = s.replace('</application>', '    <receiver android:name=".HorizonReplyReceiver" android:exported="false" />\n    </application>')
if 'android:name=".HorizonAlarmReceiver"' not in s:
    s = s.replace('</application>', '    <receiver android:name=".HorizonAlarmReceiver" android:exported="false" />\n    </application>')
if 'android:name=".HorizonAlarmBootReceiver"' not in s:
    s = s.replace('</application>', '    <receiver android:name=".HorizonAlarmBootReceiver" android:exported="true">\n            <intent-filter>\n                <action android:name="android.intent.action.BOOT_COMPLETED" />\n                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />\n                <action android:name="android.intent.action.TIME_SET" />\n                <action android:name="android.intent.action.TIMEZONE_CHANGED" />\n            </intent-filter>\n        </receiver>\n    </application>')
if 'android:name=".HorizonAlarmService"' not in s:
    s = s.replace('</application>', '    <service android:name=".HorizonAlarmService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>')
if 'android.intent.action.SET_ALARM' not in s:
    s = s.replace('</manifest>', '    <queries>\n        <intent>\n            <action android:name="android.intent.action.SET_ALARM" />\n        </intent>\n    </queries>\n</manifest>')
manifest.write_text(s)
PY
# shellcheck disable=SC2086
put_sources $KOTLIN_SOURCES
say "Horizon Kotlin AI jobs and reply notifications applied."

# Fail the build loudly if any native plugin source did not land (a missing plugin only shows up at
# runtime as "unable to find plugin : HorizonAI").
for f in $JAVA_SOURCES $KOTLIN_SOURCES; do
    [ -s "$JAVA_DIR/$f" ] || die "Native source missing after apply: $f"
done
for p in HorizonAIPlugin HorizonLensPlugin HorizonStatsPlugin HorizonShellPlugin HorizonBrowserPlugin HorizonVoicePlugin HorizonDaemonPlugin; do
    need "$JAVA_DIR/MainActivity.java" "registerPlugin($p.class)" "MainActivity does not register $p"
done
need "$MANIFEST" 'android:name=".HorizonReplyReceiver"' "Reply receiver missing from the manifest"
need "$MANIFEST" 'android:name=".HorizonSpeakService"' "Speak service missing from the manifest"
need "$MANIFEST" 'android:name=".HorizonAIService"'    "AI service missing from the manifest"
need "$MANIFEST" 'android:name=".HorizonAlarmReceiver"' "Alarm receiver missing from the manifest"
need "$MANIFEST" 'android:name=".HorizonAlarmBootReceiver"' "Alarm boot receiver missing from the manifest"
need "$MANIFEST" 'android:name=".HorizonAlarmService"' "Alarm service missing from the manifest"
need "$JAVA_DIR/MainActivity.java" "registerPlugin(HorizonAlarmPlugin.class)" "MainActivity does not register HorizonAlarmPlugin"
need "$APP_GRADLE" 'org.jetbrains.kotlin.android' "Kotlin plugin not applied to app/build.gradle"
say "Native plugin sources verified."

# ------------------------------------------------------------------------------------------
# 6. Gradle libraries: biometric (V1.43.0), OkHttp (V1.62.0), coroutines (V1.63.0)
#    V1.47.0: Piper / sherpa-onnx stay removed (no native voice libraries, no commons-compress).
# ------------------------------------------------------------------------------------------
python3 - <<'PY'
import sys
from pathlib import Path

app = Path('android/app/build.gradle')
s = app.read_text()
if 'dependencies {' not in s:
    sys.exit('android/app/build.gradle has no "dependencies {" block')
for dep in (
    "implementation 'androidx.biometric:biometric:1.1.0'",
    "implementation 'com.squareup.okhttp3:okhttp:4.12.0'",
    "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1'",
    "implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-core:1.8.1'",
    # V1.63.2: LeakCanary removed (the app closed on launch after it shipped).
):
    artifact = dep.split("'")[1].rsplit(':', 1)[0]
    if artifact not in s:
        s = s.replace('dependencies {', 'dependencies {\n    ' + dep, 1)
app.write_text(s)
PY
need "$APP_GRADLE" "androidx.biometric:biometric"        "biometric library missing from app/build.gradle"
need "$APP_GRADLE" "com.squareup.okhttp3:okhttp"         "okhttp library missing from app/build.gradle"
need "$APP_GRADLE" "kotlinx-coroutines-android"          "coroutines library missing from app/build.gradle"
say "Gradle libraries applied (verified)."

# ------------------------------------------------------------------------------------------
# 7. Feature checks on the installed sources
# ------------------------------------------------------------------------------------------
need "$JAVA_DIR/MainActivity.java" "registerPlugin(HorizonLockPlugin.class)" "MainActivity does not register HorizonLockPlugin"
need "$JAVA_DIR/HorizonPermsPlugin.java" "setBackdrop"   "HorizonPermsPlugin has no setBackdrop"
need "$JAVA_DIR/MainActivity.java" "paintBackdrop"       "MainActivity does not paint the backdrop"
need "$JAVA_DIR/MainActivity.java" "HorizonCanary.init"  "MainActivity does not call HorizonCanary.init"
need "$JAVA_DIR/MainActivity.java" "watchKeyboard"       "MainActivity has no keyboard watcher"
need "$JAVA_DIR/HorizonAIPlugin.kt" "HorizonNotify.alert" "Replies do not use the pop-up notification channel"
need "$MANIFEST" "android.permission.USE_FULL_SCREEN_INTENT" "Full-screen intent permission missing from the manifest"
say "App lock, theme backdrop and pop-up notifications verified."

# ------------------------------------------------------------------------------------------
# 8. V1.58.2: keyboard resize mode pinned in the manifest + native 90 Hz request
#    V1.63.1: the edit now finds the MainActivity element whether or not "<activity" is followed by a
#    line break, and the 90 Hz check reports which file it looked in.
# ------------------------------------------------------------------------------------------
python3 - <<'PY'
import re
import sys
from pathlib import Path

MODE = 'android:windowSoftInputMode="adjustResize"'
m = Path('android/app/src/main/AndroidManifest.xml')
s = m.read_text()

if re.search(r'android:windowSoftInputMode\s*=\s*"[^"]*"', s):
    # already declared (by Capacitor or an earlier run): force the value
    s = re.sub(r'android:windowSoftInputMode\s*=\s*"[^"]*"', MODE, s)
else:
    # The opening tag can span many lines. Prefer the MainActivity element, fall back to the first activity.
    tag = re.search(r'<activity\b[^>]*android:name\s*=\s*"(?:[^"]*\.)?MainActivity"[^>]*>', s, re.S)
    if tag is None:
        tag = re.search(r'<activity\b[^>]*>', s, re.S)
    if tag is None:
        sys.exit('no <activity> element found in AndroidManifest.xml, so the keyboard resize mode cannot be pinned')
    old = tag.group(0)
    new = old.replace('<activity', '<activity\n            ' + MODE, 1)
    s = s.replace(old, new, 1)

m.write_text(s)
PY
need "$MANIFEST" 'android:windowSoftInputMode="adjustResize"' "Could not pin the keyboard resize mode in the manifest"
need "$JAVA_DIR/MainActivity.java" "requestHighRefresh" "MainActivity ($JAVA_DIR/MainActivity.java) has no 90 Hz request"
say "Keyboard resize mode and 90 Hz request applied (verified)."

say "All Android patches applied and verified."
