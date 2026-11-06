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
add_perm FOREGROUND_SERVICE_DATA_SYNC
add_perm READ_EXTERNAL_STORAGE ' android:maxSdkVersion="32"'
add_perm WRITE_EXTERNAL_STORAGE ' android:maxSdkVersion="28"'

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
for f in HorizonPermsPlugin.java HorizonBgService.java MainActivity.java; do
    sed "s/__APPID__/${APPID}/" "resources/android/java/$f" > "$JAVA_DIR/$f"
done

echo "Horizon permissions and native plugin applied."
