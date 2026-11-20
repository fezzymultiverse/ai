#!/usr/bin/env python3
"""Install Edge native sources into an EXISTING Capacitor Android project. Dry-run by default."""
from pathlib import Path
import argparse
import re
import shutil
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('android', type=Path, help='Existing Capacitor android directory')
parser.add_argument('--apply', action='store_true', help='Apply reviewed changes, retaining .edge-backup files')
a = parser.parse_args()
base = a.android.resolve()
main = base / 'app/src/main'
manifest = main / 'AndroidManifest.xml'
if not manifest.is_file():
    parser.error('Expected app/src/main/AndroidManifest.xml. No files changed.')
repo = Path(__file__).resolve().parents[1]
source = repo / 'android-native/com/festers/horizon/edge'
activities = list((main/'java').rglob('MainActivity.java')) + list((main/'java').rglob('MainActivity.kt'))
if len(activities) != 1:
    parser.error('Expected one MainActivity under app/src/main/java. Install manually for custom source sets.')
activity = activities[0]
s = activity.read_text()
registration = 'com.festers.horizon.edge.HorizonEdgeVoicePlugin'
registered = re.search(r'registerPlugin\s*\(\s*(?:com\.festers\.horizon\.edge\.)?HorizonEdgeVoicePlugin(?:\.class|::class\.java)\s*\)', s)
if not registered:
    java = activity.suffix == '.java'
    call = 'registerPlugin(' + registration + ('.class);' if java else '::class.java)')
    marker = re.search(r'super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*' + (';' if java else ''), s)
    if marker:
        s = s[:marker.start()] + call + '\n        ' + s[marker.start():]
    elif 'onCreate(' in s or 'onCreate (' in s:
        parser.error('Custom onCreate signature found. Register HorizonEdgeVoicePlugin manually; no files changed.')
    else:
        pattern = r'class\s+MainActivity\s+extends\s+BridgeActivity\s*\{' if java else r'class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{'
        m = re.search(pattern, s)
        if not m:
            parser.error('Unrecognised MainActivity. Install manually; no files changed.')
        block = ('\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        ' if java else '\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        ') + call + '\n        super.onCreate(savedInstanceState)' + (';' if java else '') + '\n    }\n'
        s = s[:m.end()] + block + s[m.end():]
xml = manifest.read_text()
ET.fromstring(xml)
if 'android.permission.INTERNET' not in xml:
    i = xml.find('>', xml.find('<manifest')) + 1
    if i < 1:
        parser.error('Invalid manifest')
    xml = xml[:i] + '\n    <uses-permission android:name="android.permission.INTERNET"/>' + xml[i:]
ET.fromstring(xml)
gradle = next((f for f in [base/'app/build.gradle',base/'app/build.gradle.kts'] if f.is_file()), None)
if not gradle:
    parser.error('No app/build.gradle(.kts). No files changed.')
g = gradle.read_text()
deps = ['com.squareup.okhttp3:okhttp:4.12.0','androidx.media3:media3-exoplayer:1.5.1']
missing = [d for d in deps if d.rsplit(':',1)[0] not in g]
if missing:
    g += '\n// Horizon Edge: streamed speech, no external CLI.\ndependencies {\n' + ''.join(('    implementation("'+d+'")\n') if gradle.suffix=='.kts' else ('    implementation "'+d+'"\n') for d in missing) + '}\n'
print(('APPLY' if a.apply else 'DRY RUN') + ': HorizonEdgeVoice native integration')
print('Activity:', activity)
print('Manifest:', manifest)
print('Dependencies:', ', '.join(missing) or 'already present')
print('Kotlin support is a prerequisite; this helper does not change your Gradle plugin versions.')
print('Back up your host project before applying. Web assets must also be synced before rebuilding.')
changes = [(activity,s),(manifest,xml),(gradle,g)]
for f in sorted(source.glob('*.kt')):
    changes.append((main/'java/com/festers/horizon/edge'/f.name,f.read_text()))
for target, content in changes:
    if target.exists() and target.read_text()==content:
        continue
    print('Update:', target)
    if a.apply:
        if target.exists():
            backup=target.with_name(target.name+'.edge-backup')
            if not backup.exists():
                shutil.copy2(target,backup)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(content)
print('Installed. Sync web assets, rebuild and install the APK; then use Check native connection in Voice settings.' if a.apply else 'No files written. Repeat with --apply only after reviewing the plan.')
