'use strict';
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const js = fs.readFileSync(path.join(__dirname, '..', 'www', 'horizon_maps.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'www', 'horizon_maps.css'), 'utf8');
test('V1.99.113: chat map card has in-place Maximise / Minimise', () => {
    assert.match(js, /me\.setMax = function/);
    assert.match(js, /'Maximise map'/);
    assert.match(js, /'Minimise map'/);
    assert.doesNotMatch(js, /bigBtn\('Full screen'/);
    assert.match(css, /\.hzm-card\.max\{position:fixed;inset:0/);
});
