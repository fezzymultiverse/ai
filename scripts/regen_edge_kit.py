#!/usr/bin/env python3
"""Horizon V1.99.66 - rebuild the file payloads that scripts/edge_kit.sh carries, from the repo copies.

edge_kit.sh embeds 13 files (the 5 Edge Kotlin files, android-native/README.md, NOTICE-gec.md, install_edge.sh/.py,
two CI snippets, www/horizon_edge_tts.js, EDGE_VOICE_SETUP.md) so a zip that lost them can restore them byte for byte.
After editing any of those files run this, otherwise tests/edge-kit-v54.test.cjs fails.

  python3 scripts/regen_edge_kit.py            rewrite the embedded payloads and KIT_VERSION
  python3 scripts/regen_edge_kit.py --check    change nothing; exit 1 and name every payload that is out of date
Pure standard library, no network.
"""
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIT = os.path.join(ROOT, 'scripts', 'edge_kit.sh')


def read(path):
    with open(path, encoding='utf-8', newline='') as fh:
        return fh.read()


def main(argv):
    check = '--check' in argv
    kit = read(KIT)
    block = re.search(r'KIT_FILES=\(\s*(.*?)\n\)', kit, re.S)
    if not block:
        sys.exit('ERROR: KIT_FILES list not found in scripts/edge_kit.sh')
    files = re.findall(r'"([^"]+)"', block.group(1))
    stale = []
    for i, rel in enumerate(files):
        src = os.path.join(ROOT, rel)
        if not os.path.isfile(src):
            sys.exit('ERROR: %s is listed in the kit but missing from the repo' % rel)
        body = read(src)
        if not body.endswith('\n'):
            sys.exit('ERROR: %s must end with a newline to be carried in a here-document' % rel)
        end = 'KIT_EOF_%d' % i
        if re.search(r'^%s$' % end, body, re.M):
            sys.exit('ERROR: %s contains the here-document terminator %s' % (rel, end))
        pat = re.compile(r"(emit_%d\(\) \{\n  cat <<'%s'\n)(.*?)(\n%s\n\})" % (i, end, end), re.S)
        m = pat.search(kit)
        if not m:
            sys.exit('ERROR: emit_%d block for %s not found in edge_kit.sh' % (i, rel))
        if m.group(2) + '\n' != body:
            stale.append(rel)
            kit = kit[:m.start(2)] + body[:-1] + kit[m.end(2):]
    release = re.search(r"var release = '([0-9.]+)'", read(os.path.join(ROOT, 'www', 'horizon_release.js')))
    version = 'V' + release.group(1) if release else None
    if version:
        kit = re.sub(r'(Horizon Edge Voice KIT )V[0-9.]+', r'\g<1>' + version, kit, count=1)
        kit = re.sub(r'(KIT_VERSION=")V[0-9.]+(")', r'\g<1>' + version + r'\g<2>', kit, count=1)
    if check:
        for rel in stale:
            print('out of date: ' + rel)
        print('edge_kit.sh payloads are %s.' % ('CURRENT' if not stale else 'OUT OF DATE (run: python3 scripts/regen_edge_kit.py)'))
        sys.exit(1 if stale else 0)
    with open(KIT, 'w', encoding='utf-8', newline='') as fh:
        fh.write(kit)
    rc = subprocess.run(['bash', '-n', KIT]).returncode
    if rc != 0:
        sys.exit('ERROR: bash -n failed on the regenerated edge_kit.sh')
    print('edge_kit.sh regenerated (%s): %d payload(s) updated%s; bash -n OK.' % (version or 'version unchanged', len(stale), (': ' + ', '.join(stale)) if stale else ''))


if __name__ == '__main__':
    main(sys.argv[1:])
