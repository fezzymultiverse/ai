"""Isolated installer tests; no Android SDK and no real Android project is changed."""
from pathlib import Path
import tempfile
import subprocess
import sys
import unittest
import xml.etree.ElementTree as ET

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/install_stats.py'

class InstallerTests(unittest.TestCase):
    def fixture(self, content, suffix):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name) / 'android'
        main = base / 'app/src/main'
        activity = main / ('java/com/example/MainActivity.' + suffix)
        activity.parent.mkdir(parents=True)
        activity.write_text(content)
        manifest = main / 'AndroidManifest.xml'
        manifest.write_text('<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="com.example"><application/></manifest>')
        return base, main, activity, manifest

    def run_install(self, base, apply=False):
        result = subprocess.run([sys.executable, str(SCRIPT), str(base)] + (['--apply'] if apply else []), capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def assert_installed(self, main, activity, manifest, marker):
        text = activity.read_text()
        self.assertEqual(text.count('registerPlugin(com.festers.horizon.stats.HorizonStatsPlugin'), 1)
        self.assertIn(marker, text)
        self.assertTrue((main / 'java/com/festers/horizon/stats/HorizonStatsPlugin.kt').is_file())
        root = ET.fromstring(manifest.read_text())
        self.assertEqual(len(root.findall('uses-permission')), 5)

    def test_dry_run_writes_nothing(self):
        base, main, activity, manifest = self.fixture('class MainActivity extends BridgeActivity {}', 'java')
        before = {str(f.relative_to(base)): f.read_bytes() for f in base.rglob('*') if f.is_file()}
        self.assertIn('DRY RUN', self.run_install(base))
        self.assertEqual(before, {str(f.relative_to(base)): f.read_bytes() for f in base.rglob('*') if f.is_file()})

    def test_java_empty_activity(self):
        base, main, activity, manifest = self.fixture('class MainActivity extends BridgeActivity {}', 'java')
        self.run_install(base, True)
        self.assert_installed(main, activity, manifest, 'super.onCreate(savedInstanceState)')

    def test_java_existing_plugins_and_idempotence(self):
        original = 'class MainActivity extends BridgeActivity { public void onCreate(Bundle savedInstanceState) { registerPlugin(OtherPlugin.class); super.onCreate(savedInstanceState); } }'
        base, main, activity, manifest = self.fixture(original, 'java')
        self.run_install(base, True)
        before = activity.read_text(), manifest.read_text()
        self.run_install(base, True)
        self.assertEqual(before, (activity.read_text(), manifest.read_text()))
        self.assert_installed(main, activity, manifest, 'registerPlugin(OtherPlugin.class)')
        self.assertEqual(activity.with_name(activity.name + '.stats-backup').read_text(), original)

    def test_kotlin_empty_activity(self):
        base, main, activity, manifest = self.fixture('class MainActivity : BridgeActivity() {}', 'kt')
        self.run_install(base, True)
        self.assert_installed(main, activity, manifest, '::class.java')

    def test_kotlin_existing_activity(self):
        base, main, activity, manifest = self.fixture('class MainActivity : BridgeActivity() { override fun onCreate(savedInstanceState: Bundle?) { registerPlugin(OtherPlugin::class.java); super.onCreate(savedInstanceState) } }', 'kt')
        self.run_install(base, True)
        self.assert_installed(main, activity, manifest, 'OtherPlugin::class.java')

if __name__ == '__main__':
    unittest.main(verbosity=2)
