#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
node - "${1:-1}" <<'NODE'
const fs = require('fs');
const version = require('./package.json').version;
const build = Number(process.argv[2]);
if (!/^\d+\.\d+\.\d+$/.test(version) || !Number.isSafeInteger(build) || build < 1 || build > 2147483647) throw Error('Invalid version or Android versionCode');
const file = 'android/app/build.gradle';
let text = fs.readFileSync(file, 'utf8');
if (!/versionCode\s+\d+/.test(text) || !/versionName\s+["'][^"']+["']/.test(text)) throw Error('Missing Gradle version fields');
text = text.replace(/versionCode\s+\d+/, 'versionCode ' + build).replace(/versionName\s+["'][^"']+["']/, 'versionName "' + version + '"');
fs.writeFileSync(file, text);
NODE
