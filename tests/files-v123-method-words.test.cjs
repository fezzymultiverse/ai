// V1.99.123: "without Termux" / "don't use root" describe HOW, not which folder to spare. They must not block file tools.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '..', 'android-native/app/HorizonFilesState.java'), 'utf8');

function javaStrings(block) {
    const out = [], re = /"((?:[^"\\]|\\.)*)"/g; let m;
    while ((m = re.exec(block))) out.push(m[1].replace(/\\u([0-9a-fA-F]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/\\\\/g, '\\').replace(/\\n/g, '\n'));
    return out;
}
function arrayOf(name) {
    const i = src.indexOf('static final String[] ' + name + ' = {'); assert.ok(i >= 0, name + ' missing');
    return javaStrings(src.slice(i, src.indexOf('};', i)));
}
const js = r => new RegExp(r.replace('(?iu)', ''), 'giu');
const EXCL = arrayOf('EXCLUSION_PATTERNS'), METHOD = arrayOf('METHOD_PATTERNS');
const TRIGGER = js(javaStrings(src.slice(src.indexOf('static String ambiguousWord'), src.indexOf('static boolean ambiguousExclusions')))
    .find(s => s.includes('leave|except')));

function ambiguous(text) {
    let masked = text;
    for (const r of [...EXCL, ...METHOD]) masked = masked.replace(js(r), ' ');
    TRIGGER.lastIndex = 0;
    return TRIGGER.test(masked);
}

test('method wording no longer blocks file tools (the screenshot message)', () => {
    assert.equal(ambiguous('Can u see if u can move it back without Termux to check if the file manager work'), false);
    assert.equal(ambiguous("don't use Termux, just move the files"), false);
    assert.equal(ambiguous('move my pictures without using root'), false);
    assert.equal(ambiguous('do it without a PC'), false);
});
test('plain requests still pass', () => {
    assert.equal(ambiguous('move my pictures into /storage/emulated/0/MyDocuments/IMAGES'), false);
});
test('real exclusions still parse and stay strict', () => {
    assert.equal(ambiguous('sort downloads but leave Vault alone'), false);
    assert.equal(ambiguous('sort downloads except Vault'), false);
    assert.equal(ambiguous('do not touch the Vault folder'), false);
});
test('unreadable negative constraints still fail closed', () => {
    assert.equal(ambiguous("tidy it up, don't mess with the private stuff"), true);
    assert.equal(ambiguous('tidy it up but not the important ones'), true);
    assert.equal(ambiguous('tidy it up without the secret ones'), true);
});
test('the block now explains itself instead of looking like a protected folder', () => {
    assert.match(src, /NOT a protected folder: the wording/);
    assert.match(src, /static String ambiguousWord\(String text\)/);
});
