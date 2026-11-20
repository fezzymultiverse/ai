#!/usr/bin/env python3
"""Install the supplied Stats plugin in an existing Capacitor Android project; dry-run unless --apply is given."""
from pathlib import Path
import argparse
import re
import shutil
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('android', type=Path, help='Existing Capacitor android directory')
parser.add_argument('--apply', action='store_true', help='Write the listed changes (backups are kept)')
a = parser.parse_args()
base = a.android.resolve()
main = base / 'app/src/main'
manifest = main / 'AndroidManifest.xml'
if not manifest.is_file():
    parser.error('Expected app/src/main/AndroidManifest.xml below the supplied Android directory')
repo = Path(__file__).resolve().parents[1]
source = repo / 'android-native/com/festers/horizon/stats/HorizonStatsPlugin.kt'
activities = list((main / 'java').rglob('MainActivity.java')) + list((main / 'java').rglob('MainActivity.kt'))
if len(activities) != 1:
    parser.error('Expected exactly one MainActivity.java or MainActivity.kt; install manually if your host activity has another name')
activity = activities[0]
s = activity.read_text()
registration = 'com.festers.horizon.stats.HorizonStatsPlugin'
if registration not in s:
    if activity.suffix == '.java':
        marker = re.search(r'super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*;', s)
        if marker:
            s = s[:marker.start()] + 'registerPlugin(' + registration + '.class);\n        ' + s[marker.start():]
        else:
            m = re.search(r'class\s+MainActivity\s+extends\s+BridgeActivity\s*\{', s)
            if not m:
                parser.error('Unrecognised Java activity; no files changed')
            s = s[:m.end()] + '\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        registerPlugin(' + registration + '.class);\n        super.onCreate(savedInstanceState);\n    }\n' + s[m.end():]
    else:
        marker = re.search(r'super\.onCreate\s*\(\s*savedInstanceState\s*\)', s)
        if marker:
            s = s[:marker.start()] + 'registerPlugin(' + registration + '::class.java)\n        ' + s[marker.start():]
        else:
            m = re.search(r'class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{', s)
            if not m:
                parser.error('Unrecognised Kotlin activity; add onCreate registration manually. No files changed')
            s = s[:m.end()] + '\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        registerPlugin(' + registration + '::class.java)\n        super.onCreate(savedInstanceState)\n    }\n' + s[m.end():]
xml = manifest.read_text()
ET.fromstring(xml)
permissions = ['INTERNET', 'ACCESS_NETWORK_STATE', 'ACCESS_WIFI_STATE', 'ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION']
missing = [name for name in permissions if 'android.permission.' + name not in xml]
if missing:
    root_end = xml.find('>', xml.find('<manifest')) + 1
    if root_end < 1:
        parser.error('Invalid manifest')
    xml = xml[:root_end] + '\n' + '\n'.join('    <uses-permission android:name="android.permission.' + name + '"/>' for name in missing) + xml[root_end:]
ET.fromstring(xml)
dest = main / 'java/com/festers/horizon/stats/HorizonStatsPlugin.kt'
print(('APPLY' if a.apply else 'DRY RUN') + ': Stats native installation')
print('Plugin:', dest)
print('Registration:', activity)
print('Manifest permissions:', ', '.join(missing) or 'already present')
if not a.apply:
    print('No files written. Repeat with --apply after review. The host project must already support Kotlin (as required by the Edge plugin).')
else:
    for file, content in [(activity, s), (manifest, xml)]:
        if file.read_text() != content:
            backup = file.with_name(file.name + '.stats-backup')
            if not backup.exists():
                shutil.copy2(file, backup)
            file.write_text(content)
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.read_bytes() != source.read_bytes():
        backup = dest.with_name(dest.name + '.stats-backup')
        if not backup.exists():
            shutil.copy2(dest, backup)
    shutil.copy2(source, dest)
    print('Installed. Sync web assets and rebuild your APK. No other plugin registrations were changed.')
