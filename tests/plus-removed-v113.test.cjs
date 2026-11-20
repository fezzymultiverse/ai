'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const creator = fs.readFileSync(path.join(__dirname, '..', 'www', 'horizon_creator.js'), 'utf8');
test('V1.99.113: Generators strip is not installed in the Tools menu', () => {
    const body = creator.slice(creator.indexOf('function installStrip()'));
    assert.match(body, /Generators \(Avatars, Memes, Visuals\) are removed/);
    assert.match(body, /oldBar\.remove\(\);[\s\S]*?\n    return;/);
});
