#!/usr/bin/env python3
"""Syntax-check every inline application script without executing it."""
from html.parser import HTMLParser
from pathlib import Path
import subprocess
import tempfile

class Scripts(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.active = False
        self.buffer = []
        self.scripts = []
    def handle_starttag(self, tag, attrs):
        if tag == 'script':
            a = dict(attrs)
            self.active = 'src' not in a and a.get('type', '') in ('', 'text/javascript', 'application/javascript', 'module')
            self.buffer = []
    def handle_data(self, data):
        if self.active:
            self.buffer.append(data)
    def handle_endtag(self, tag):
        if tag == 'script' and self.active:
            self.scripts.append(''.join(self.buffer))
            self.active = False

root = Path(__file__).resolve().parents[1]
p = Scripts()
p.feed((root / 'www/index.html').read_text())
with tempfile.TemporaryDirectory() as directory:
    for i, text in enumerate(p.scripts):
        f = Path(directory) / ('inline-' + str(i) + '.js')
        f.write_text(text)
        subprocess.run(['node', '--check', str(f)], check=True)
print('Inline JavaScript syntax: ' + str(len(p.scripts)) + ' scripts passed')
