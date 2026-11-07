#!/usr/bin/env bash
# Horizon: apply launcher icons + splash to the generated Android platform.
# Run after `npx cap add android`, from the project root.
set -euo pipefail

SRC="resources/android/res"
DEST="android/app/src/main/res"

if [ ! -d "$DEST" ]; then
    echo "Android platform not found. Run: npx cap add android" >&2
    exit 1
fi
if [ ! -d "$SRC" ]; then
    echo "Missing $SRC. Run: python3 scripts/make_icons.py" >&2
    exit 1
fi

# Remove the default Capacitor launcher + splash assets so nothing stale survives.
find "$DEST" -type f -name 'ic_launcher*' -delete
find "$DEST" -type f -name 'splash.*' -delete

# Drop in the Horizon assets.
cp -R "$SRC"/. "$DEST"/

# Fail loudly if the icon did not land, so a default Android icon can never ship silently.
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
    for f in ic_launcher.png ic_launcher_round.png ic_launcher_foreground.png; do
        cmp -s "$SRC/mipmap-$d/$f" "$DEST/mipmap-$d/$f" || { echo "Icon check failed: mipmap-$d/$f" >&2; exit 1; }
    done
done
[ ! -e "$DEST/drawable-v24/ic_launcher_foreground.xml" ] || { echo "Stale default icon still present" >&2; exit 1; }
echo "Horizon icons and splash applied (verified)."

# ---- V1.3.0: manifest permissions + native Permissions plugin ----
MANIFEST="android/app/src/main/AndroidManifest.xml"
if [ ! -f "$MANIFEST" ]; then
    echo "Missing $MANIFEST" >&2
    exit 1
fi

add_perm() {
    # $1 = permission name, $2 = optional extra attributes
    if ! grep -q "android.permission.$1\"" "$MANIFEST"; then
        sed -i "s#</manifest>#    <uses-permission android:name=\"android.permission.$1\"${2:-} />\n</manifest>#" "$MANIFEST"
    fi
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

# V1.5.0: background keep-alive service declared in the manifest
if ! grep -q "HorizonBgService" "$MANIFEST"; then
    sed -i 's#</application>#        <service android:name=".HorizonBgService" android:exported="false" android:foregroundServiceType="dataSync" />\n    </application>#' "$MANIFEST"
fi
grep -q "HorizonBgService" "$MANIFEST" || { echo "Could not add the background service to the manifest" >&2; exit 1; }

# V1.7.0: let the app see Android's text-to-speech service (required on Android 11+ to list voices)
if ! grep -q "android.intent.action.TTS_SERVICE" "$MANIFEST"; then
    sed -i 's#</manifest>#    <queries>\n        <intent>\n            <action android:name="android.intent.action.TTS_SERVICE" />\n        </intent>\n    </queries>\n</manifest>#' "$MANIFEST"
fi
grep -q "android.intent.action.TTS_SERVICE" "$MANIFEST" || { echo "Could not add the text-to-speech query to the manifest" >&2; exit 1; }

APPID="$(node -p "require('./capacitor.config.json').appId")"
JAVA_DIR="android/app/src/main/java/${APPID//./\/}"
if [ ! -d "$JAVA_DIR" ]; then
    echo "Missing $JAVA_DIR (appId mismatch?)" >&2
    exit 1
fi
for f in HorizonPermsPlugin.java HorizonBgService.java HorizonMediaPlugin.java HorizonMediaService.java HorizonArt.java HorizonSpeechPlugin.java HorizonLensPlugin.java HorizonStatsPlugin.java HorizonBrowserPlugin.java MainActivity.java; do
    sed "s/__APPID__/${APPID}/" "resources/android/java/$f" > "$JAVA_DIR/$f"
done

echo "Horizon permissions and native plugin applied."

# Dedicated mediaPlayback service (not the data-sync keep-alive service).
if ! grep -q 'android:name=".HorizonMediaService"' "$MANIFEST"; then
    sed -i 's#</application>#        <service android:name=".HorizonMediaService" android:exported="false" android:foregroundServiceType="mediaPlayback" />\n    </application>#' "$MANIFEST"
fi

# V1.13.0: additive Kotlin support. Idempotent across add, update and sync hooks.
python3 - <<'PY'
from pathlib import Path
root = Path('android/build.gradle')
s = root.read_text()
if 'org.jetbrains.kotlin:kotlin-gradle-plugin:' not in s:
    s = s.replace('    dependencies {', "    dependencies {\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:1.9.22'", 1)
root.write_text(s)
app = Path('android/app/build.gradle')
s = app.read_text()
if "apply plugin: 'org.jetbrains.kotlin.android'" not in s:
    s = s.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'org.jetbrains.kotlin.android'", 1)
if 'jvmTarget = "17"' not in s:
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
manifest.write_text(s)
PY
for f in HorizonAIPlugin.kt HorizonAIService.kt HorizonReplyReceiver.kt HorizonSpeakService.kt HorizonShellPlugin.kt HorizonLockPlugin.kt; do
    sed "s/__APPID__/${APPID}/" "resources/android/java/$f" > "$JAVA_DIR/$f"
done
echo "Horizon Kotlin AI jobs and reply notifications applied."

# Fail the build loudly if any native plugin source did not land (a missing plugin only shows up at
# runtime as "unable to find plugin : HorizonAI").
for f in HorizonPermsPlugin.java HorizonBgService.java HorizonMediaPlugin.java HorizonMediaService.java HorizonArt.java HorizonSpeechPlugin.java HorizonLensPlugin.java HorizonStatsPlugin.java HorizonBrowserPlugin.java MainActivity.java HorizonAIPlugin.kt HorizonAIService.kt HorizonReplyReceiver.kt HorizonSpeakService.kt HorizonShellPlugin.kt HorizonLockPlugin.kt; do
    [ -s "$JAVA_DIR/$f" ] || { echo "Native source missing after apply: $f" >&2; exit 1; }
done
grep -q "registerPlugin(HorizonAIPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonAIPlugin" >&2; exit 1; }
grep -q "registerPlugin(HorizonLensPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonLensPlugin" >&2; exit 1; }
grep -q "registerPlugin(HorizonStatsPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonStatsPlugin" >&2; exit 1; }
grep -q "registerPlugin(HorizonShellPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonShellPlugin" >&2; exit 1; }
grep -q "registerPlugin(HorizonBrowserPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonBrowserPlugin" >&2; exit 1; }
grep -q 'android:name=".HorizonReplyReceiver"' "$MANIFEST" || { echo "Reply receiver missing from the manifest" >&2; exit 1; }
grep -q 'android:name=".HorizonSpeakService"' "$MANIFEST" || { echo "Speak service missing from the manifest" >&2; exit 1; }
grep -q 'org.jetbrains.kotlin.android' android/app/build.gradle || { echo "Kotlin plugin not applied to app/build.gradle" >&2; exit 1; }
echo "Native plugin sources verified."

# ---- V1.47.0: Piper / sherpa-onnx removed (no native voice libraries, no commons-compress) ----

# ---- V1.43.0: app lock (fingerprint prompt) ----
python3 - <<'PY'
from pathlib import Path
app = Path('android/app/build.gradle')
s = app.read_text()
if 'androidx.biometric:biometric' not in s:
    s = s.replace('dependencies {', "dependencies {\n    implementation 'androidx.biometric:biometric:1.1.0'", 1)
app.write_text(s)
PY
grep -q "androidx.biometric:biometric" android/app/build.gradle || { echo "biometric library missing from app/build.gradle" >&2; exit 1; }
grep -q "registerPlugin(HorizonLockPlugin.class)" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not register HorizonLockPlugin" >&2; exit 1; }
[ -s "$JAVA_DIR/HorizonLockPlugin.kt" ] || { echo "Native source missing after apply: HorizonLockPlugin.kt" >&2; exit 1; }
echo "App lock (biometric) applied."

# ---- V1.44.0: window + WebView background follows the theme (no white flash when leaving the app) ----
grep -q "setBackdrop" "$JAVA_DIR/HorizonPermsPlugin.java" || { echo "HorizonPermsPlugin has no setBackdrop" >&2; exit 1; }
grep -q "paintBackdrop" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity does not paint the backdrop" >&2; exit 1; }
echo "Theme backdrop applied."

# ---- V1.58.2: keyboard resize mode pinned in the manifest + native 90 Hz request ---- || true
python3 - <<'PY'
import re
from pathlib import Path
m = Path('android/app/src/main/AndroidManifest.xml')
s = m.read_text()
if 'android:windowSoftInputMode' in s:
    s = re.sub(r'android:windowSoftInputMode="[^"]*"', 'android:windowSoftInputMode="adjustResize"', s)
else:
    s = s.replace('<activity ', '<activity android:windowSoftInputMode="adjustResize" ', 1)
m.write_text(s)
PY
grep -q 'android:windowSoftInputMode="adjustResize"' "$MANIFEST" || { echo "Could not pin the keyboard resize mode in the manifest" >&2; exit 1; } || true
grep -q "requestHighRefresh" "$JAVA_DIR/MainActivity.java" || { echo "MainActivity has no 90 Hz request" >&2; exit 1; }
echo "Keyboard resize mode and 90 Hz request applied."
