#!/usr/bin/env python3
"""Idempotent native wiring, called by apply-android.sh after its existing patches."""
import json
import re
from pathlib import Path
root = Path(__file__).resolve().parent.parent
app_id = json.loads((root / 'capacitor.config.json').read_text())['appId']
java = root / 'android/app/src/main/java' / app_id.replace('.', '/')
for name in ('HorizonWhatsAppPlugin.kt', 'HorizonTermuxPlugin.kt', 'HorizonExtractorPlugin.kt', 'HorizonCheckinPlugin.kt', 'HorizonWhatsAppDraftWorker.kt'):
    text = (root / 'resources/android/java' / name).read_text().replace('__APPID__', app_id)
    assert '__APPID__' not in text
    (java / name).write_text(text)
# Remove obsolete Accessibility sender from an already-generated platform too.
(java / 'HorizonWhatsAppAccessibility.kt').unlink(missing_ok=True)
(root / 'android/app/src/main/res/xml/horizon_whatsapp_accessibility.xml').unlink(missing_ok=True)
m = root / 'android/app/src/main/AndroidManifest.xml'
s = m.read_text()
# Purge the obsolete messenger permission when reusing an existing Android platform.
s = re.sub(r'\s*<uses-permission\s+android:name="android.permission.READ_CONTACTS"\s*/>', '', s)
if 'com.termux.permission.RUN_COMMAND' not in s:
    s = s.replace('</manifest>', '    <uses-permission android:name="com.termux.permission.RUN_COMMAND" />\n</manifest>')
if 'android:name=".HorizonWhatsAppListener"' not in s:
    s = s.replace('</application>', '''    <service android:name=".HorizonWhatsAppListener" android:label="Horizon WhatsApp access"
            android:permission="android.permission.BIND_NOTIFICATION_LISTENER_SERVICE" android:exported="true">
            <intent-filter><action android:name="android.service.notification.NotificationListenerService" /></intent-filter>
        </service>
        <receiver android:name=".HorizonTermuxResultReceiver" android:exported="false" />
    </application>''')
if '<package android:name="com.termux"' not in s:
    s = s.replace('</manifest>', '''    <queries>
        <package android:name="com.termux" />
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
    </queries>
</manifest>''')
# Preserve every existing application attribute, adding only bridge data backup exclusions.
if 'android:fullBackupContent=' not in s:
    s = s.replace('<application', '<application android:fullBackupContent="@xml/horizon_bridge_backup"', 1)
if 'android:dataExtractionRules=' not in s:
    s = s.replace('<application', '<application android:dataExtractionRules="@xml/horizon_bridge_extraction"', 1)
# No Accessibility sender: WhatsApp is strictly a viewer/editor.
s = re.sub(r'<service[^>]*android:name="\.HorizonWhatsAppAccessibility"[\s\S]*?</service>', '', s)
m.write_text(s)
g = root / 'android/build.gradle'
s = g.read_text()
if "https://jitpack.io" not in s:
    s = s.replace('allprojects {\n    repositories {', "allprojects {\n    repositories {\n        maven { url 'https://jitpack.io'; content { includeGroupByRegex 'com\\\\.github\\\\.TeamNewPipe.*' } }")
    assert 'https://jitpack.io' in s
g.write_text(s)
g = root / 'android/app/build.gradle'
s = g.read_text()
for dep in ("implementation 'androidx.work:work-runtime-ktx:2.9.1'", "implementation 'com.github.TeamNewPipe:NewPipeExtractor:v0.27.0'", "coreLibraryDesugaring 'com.android.tools:desugar_jdk_libs_nio:2.1.5'"):
    if dep not in s:
        s = s.replace('dependencies {', 'dependencies {\n    ' + dep, 1)
if 'coreLibraryDesugaringEnabled true' not in s:
    s = s.replace('compileOptions {', 'compileOptions {\n        coreLibraryDesugaringEnabled true', 1)
g.write_text(s)
g = root / 'android/app/proguard-rules.pro'
s = g.read_text()
if '# Horizon NewPipe' not in s:
    s += '\n# Horizon NewPipe\n-keep class org.mozilla.javascript.** { *; }\n-keep class org.mozilla.classfile.ClassFileWriter\n-dontwarn org.mozilla.javascript.tools.**\n'
draft_rule = '-keep class ' + app_id + '.HorizonWhatsAppDraftWorker { public <init>(android.content.Context, androidx.work.WorkerParameters); }'
if draft_rule not in s: s += '\n' + draft_rule + '\n'
worker_rule = '-keep class ' + app_id + '.HorizonCheckinWorker { public <init>(android.content.Context, androidx.work.WorkerParameters); }'
if worker_rule not in s:
    s += '\n' + worker_rule + '\n'
g.write_text(s)
for plugin in ('HorizonWhatsAppPlugin', 'HorizonTermuxPlugin', 'HorizonExtractorPlugin', 'HorizonCheckinPlugin'):
    assert 'registerPlugin(' + plugin + '.class)' in (java / 'MainActivity.java').read_text(), plugin
assert 'HorizonTermuxResultReceiver' in m.read_text()
print('[apply-bridges] WhatsApp, Termux and NewPipe sources + manifest + dependencies verified.')
