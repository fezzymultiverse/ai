// V1.99.0 united hub: two tabs, group pill, Synced contacts actions, per-chat AI controls in "i".
// Runs in plain Node with a tiny fake DOM (no browser needed).
const test = require('node:test'), assert = require('node:assert/strict');
['setTimeout', 'setInterval'].forEach(k => { const o = global[k]; global[k] = (...a) => { const t = o(...a); if (t && t.unref) t.unref(); return t; }; });
class N {
    constructor(tag) { this.tag = tag; this.kids = []; this.attrs = {}; this.dataset = {}; this.style = {}; this.className = ''; this.hidden = false; this._t = ''; this.listeners = {}; this.parentNode = null;
        const self = this; this.classList = { add(c) { self.className = (self.className + ' ' + c).trim(); }, toggle() {}, remove(c) { self.className = self.className.split(' ').filter(x => x !== c).join(' '); }, contains(c) { return (' ' + self.className + ' ').includes(' ' + c + ' '); } }; }
    get textContent() { return this._t + this.kids.map(k => k.textContent).join(''); }
    set textContent(v) { this._t = String(v); this.kids = []; }
    get parentElement() { return this.parentNode; }
    get childNodes() { return this.kids; }
    _add(n, front) { if (typeof n === 'string') { const t = new N('#t'); t._t = n; n = t; } if (n.parentNode) n.remove(); n.parentNode = this; front ? this.kids.unshift(n) : this.kids.push(n); }
    append(...a) { a.forEach(n => this._add(n)); } prepend(...a) { a.reverse().forEach(n => this._add(n, true)); }
    replaceChildren(...a) { this.kids.forEach(k => k.parentNode = null); this.kids = []; this._t = ''; this.append(...a); }
    remove() { if (this.parentNode) this.parentNode.kids = this.parentNode.kids.filter(k => k !== this); this.parentNode = null; }
    after(n) { global.document.body._add(n); } before(n) { global.document.body._add(n); } focus() {} select() {} insertAdjacentHTML() {}
    setAttribute(k, v) { this.attrs[k] = v; } getAttribute(k) { return this.attrs[k]; }
    addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } removeEventListener() {}
    getBoundingClientRect() { return { bottom: 80, top: 40, left: 0, right: 100 }; }
    contains(n) { for (let x = n; x; x = x.parentNode) if (x === this) return true; return false; }
    closest(sel) { for (let x = this; x; x = x.parentNode) if (x.className && sel[0] === '.' && x.classList.contains(sel.slice(1))) return x; return null; }
    all(f, out = []) { this.kids.forEach(k => { if (f(k)) out.push(k); k.all(f, out); }); return out; }
    querySelector(s) { return this.querySelectorAll(s)[0] || null; }
    querySelectorAll(s) { return this.all(k => s.startsWith('.') ? k.classList.contains(s.slice(1)) : s === 'button' ? k.tag === 'button' : s === 'input' ? k.tag === 'input' : s.startsWith('[data-hzp-draft]') ? k.dataset.hzpDraft != null : false); }
}
const store = {}; const docL = {};
global.window = global; global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
global.addEventListener = () => {}; global.navigator = {}; global.location = { origin: 'http://x' }; global.HORIZON_PEOPLE_SERVER = 'http://x';
const body = new N('body'), head = new N('head');
global.document = { body, head, hidden: false, createElement: t => new N(t), createTextNode: t => { const n = new N('#t'); n._t = t; return n; }, querySelector: () => null, getElementById: id => body.all(k => k.id === id)[0] || null, addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); } };
const calls = [];
const me = { id: 'HZ-ME', name: 'Me' }, A = { id: 'HZ-A', name: 'Alice' }, B = { id: 'HZ-B', name: 'Bob' };
const sync = { me, people: [me, A, B], contacts: [A, B], requests: [], invitations: [], blocked: [], rooms: [{ id: 'r1', members: ['HZ-ME', 'HZ-A'], pending: [], group: false, owner: 'HZ-ME', messages: [] }] };
global.fetch = async (url, o) => { const route = String(url).split('people-api/')[1].split('?')[0]; calls.push([route, o && o.body ? JSON.parse(o.body) : null]); return { ok: true, status: 200, json: async () => (route === 'sync' ? sync : { ok: true }) }; };
store.horizon_people_v1 = JSON.stringify({ token: 't', me, savedContacts: { 'HZ-ME': [A, B] }, mig197: true });
const chat = { id: 'c1', title: 'Alice', messages: [], people: { room: 'r1', account: 'HZ-ME', joined: true, ai: true, aiMembers: ['mistral'], aiOwner: 'HZ-ME' } };
const input = new N('textarea'); input.parentNode = new N('div');
const notes = [];
const host = { chats: () => [chat], current: () => chat, open: id => notes.push('open:' + id), make: () => chat, notice: m => notes.push(m), input, providers: () => [{ id: 'mistral', name: 'Mistral', ready: true }, { id: 'gemini', name: 'Gemini', ready: false }], save() {}, refresh() {}, busy: () => false, ai: async () => {}, append() {}, clearInput() {}, restore() {} };
require('../www/horizon_people.js');
const tick = async () => { for (let i = 0; i < 4; i++) await new Promise(r => setImmediate(r)); };
const btn = (root, t) => root.all(k => k.tag === 'button' && k.textContent.includes(t))[0];
const panel = () => body.all(k => k.id === 'hzPeoplePanel')[0];
const flip = (box, v) => { box.checked = v; return box.onchange(); };
const lineBox = (root, label) => root.all(k => k.tag === 'label' && k.textContent.includes(label))[0].all(k => k.tag === 'input')[0];

test('hub: two tabs, invites under add, preferences below, defaults to reply after everyone sent', async () => {
    HorizonPeople.init(host); await tick();
    assert.equal(JSON.parse(store.horizon_people_v1).defaults.timing, 'all');
    HorizonPeople.open(); await tick();
    const p = panel(), tabs = p.all(k => k.classList.contains('hzp-tab')).map(k => k.textContent);
    assert.deepEqual(tabs, ['Add & preferences', 'Synced contacts']);
    const t = p.textContent;
    assert.ok(t.indexOf('Add contact') < t.indexOf('Invites') && t.indexOf('Invites') < t.indexOf('Keep Horizon in the background'));
    assert.ok(t.includes('Default ID') && t.includes('Edit my Name Card'));
    assert.ok(!t.includes('Hold AI'), 'Hold AI lives in the i sheet');
    // People pill is back at the bottom; the top has one dropdown pill, not a row of contact chips.
    const launch = body.all(k => k.id === 'peopleBtn')[0]; assert.ok(launch && launch.textContent.startsWith('People'));
    assert.equal(body.all(k => k.dataset.hzpContact).length, 0);
});

test('synced contacts: ticks stay, group pill follows, actions per contact', async () => {
    const p = panel(); btn(p, 'Synced contacts').onclick(); await tick();
    assert.ok(p.textContent.includes('Alice') && p.textContent.includes('AI to include'));
    flip(p.all(k => k.attrs['aria-label'] === 'Add Alice to the group')[0], true); await tick();
    flip(lineBox(p, 'Mistral'), true); await tick();
    const sel = JSON.parse(store.horizon_people_v1)['selection_HZ-ME'];
    assert.deepEqual([sel.contacts, sel.ai], [['HZ-A'], ['mistral']]);
    assert.ok(body.all(k => k.classList.contains('hzp-gpill'))[0].textContent.includes('3 in group'));
    const row = p.all(k => k.classList.contains('hzp-pickrow'))[0].kids; assert.equal(row[row.length - 1].tag, 'input', 'tick is last (right side)');
    btn(p, 'Alice').onclick(); await tick();
    for (const a of ['Chat', 'Ping', 'Remove', 'Block', 'Block & remove']) assert.ok(btn(panel(), a), a);
    btn(panel(), 'Ping').onclick(); await tick();
    assert.deepEqual(calls.filter(c => c[0] === 'ping').pop(), ['ping', { id: 'HZ-A' }]);
    btn(panel(), 'Chat').onclick(); await tick();
    assert.ok(notes.includes('open:c1'));
});

test('group pill: dropdown is cards (icons, no emoji), x takes someone out, tick on the right, tap name opens chat', async () => {
    btn(body, '3 in group').onclick(); await tick();
    let pop = body.all(k => k.classList.contains('hzp-gpop'))[0];
    assert.ok(pop.textContent.includes('In this group \u00B7 3'));
    assert.ok(!/keep/i.test(pop.textContent), 'the confusing "keep" wording is gone');
    assert.ok(!pop.textContent.includes('\u2728'), 'no sparkle emoji, icons instead');
    assert.ok(pop.textContent.includes('Contacts') && pop.textContent.includes('Bob'));
    const mem = pop.all(k => k.classList.contains('hzp-gm'));
    assert.equal(mem.length, 3, 'You, Alice, Mistral');
    assert.ok(mem[2].kids[0].classList.contains('hzp-aiic') && mem[2].kids[0].innerHTML.includes('<svg'), 'AI member has an SVG icon');
    assert.ok(mem[0].textContent.includes('you') && !mem[0].all(k => k.tag === 'button').length, 'You has a badge, no remove button');
    const crow = pop.all(k => k.tag === 'button' && k.dataset.hzpContact === 'HZ-A')[0].parentNode.kids; assert.equal(crow[crow.length - 1].tag, 'input', 'dropdown tick is on the right');
    pop.all(k => k.attrs['aria-label'] === 'Remove Alice from the group')[0].onclick(); await tick();
    assert.deepEqual(JSON.parse(store.horizon_people_v1)['selection_HZ-ME'].contacts, []);
    assert.ok(body.all(k => k.classList.contains('hzp-gpill'))[0].textContent.includes('2 in group'));
    // dropdown: tapping a contact name opens the chat
    pop = body.all(k => k.classList.contains('hzp-gpop'))[0];
    const aliceName = pop.all(k => k.tag === 'button' && k.dataset.hzpContact === 'HZ-A')[0]; aliceName.onclick(); await tick();
    assert.ok(notes.includes('open:c1')); assert.equal(body.all(k => k.classList.contains('hzp-gpop')).length, 0);
});

test('i sheet: AI reply box (was Hold AI), Pause AI, reply after each message; no AI label under a person', async () => {
    HorizonPeople.info(chat); await tick();
    const sheet = body.all(k => k.classList.contains('hzp-sheet'))[0];
    flip(lineBox(sheet, 'Pause AI'), true); await tick(); assert.equal(chat.people.paused, true);
    flip(lineBox(sheet, 'AI replies after each message'), true); await tick(); assert.equal(chat.people.timing, 'each');
    flip(lineBox(sheet, 'AI reply box'), true); await tick(); assert.equal(JSON.parse(store.horizon_people_v1).replyFirst, true);
    HorizonPeople.changed(); await tick();
    const strip = body.all(k => k.classList.contains('hzp-strip'))[0] || input.parentNode.kids.find(k => k.classList.contains('hzp-strip'));
    if (strip) assert.ok(!/AI on|after all users|after each user/.test(strip.textContent));
});

test('v1.99.3: contact cards show status, AI rows have icon left and tick right, status saves through profile', async () => {
    HorizonPeople.open(); await tick();
    const p = panel(); btn(p, 'Synced contacts').onclick(); await tick();
    const cards = p.all(k => k.classList.contains('hzp-cc'));
    assert.equal(cards.length, 2, 'one card per contact');
    assert.ok(cards[0].textContent.includes('Alice') && cards[0].textContent.includes('Available'), 'name and status on the card');
    assert.equal(cards[0].kids[cards[0].kids.length - 1].tag, 'input', 'tick on the right of the card');
    const ai = p.all(k => k.tag === 'label' && k.classList.contains('hzp-ai'));
    assert.equal(ai.length, 2, 'one row per AI provider');
    ai.forEach(l => { assert.ok(l.kids[0].classList.contains('hzp-aiic'), 'icon left of the name'); assert.equal(l.kids[l.kids.length - 1].tag, 'input', 'tick right of the name'); });
    assert.ok(ai[0].kids[0].innerHTML.includes('<svg') && ai[0].kids[0].innerHTML.includes('<path'), 'Mistral gets its own glyph, not a letter');
    const input = p.all(k => k.dataset.hzpDraft === 'mystatus')[0]; input.value = 'At the gym';
    btn(p, 'Save status').onclick(); await tick();
    assert.deepEqual(calls.filter(c => c[0] === 'profile').pop(), ['profile', { name: 'Me', avatar: '◎', status: 'At the gym' }]);
    btn(panel(), 'Busy').onclick(); await tick();
    assert.equal(calls.filter(c => c[0] === 'profile').pop()[1].status, 'Busy', 'preset saves straight away');
});

test('v1.99.5 (layout per V1.99.21): People is first on the bottom row, then Horizon ID, with Options at the right end; contact tools moved to Synced contacts', async () => {
    const launch = body.all(k => k.classList.contains('hzp-launch'))[0];
    const first = launch.kids[launch.kids.length - 1];
    assert.equal(first.className.includes('hzp-i'), true, 'Options (the i button) is the last item of the bottom row (right end)');
    assert.equal(first.textContent, 'Options');
    assert.equal(first.hidden, false, 'visible inside a people chat');
    assert.equal(launch.kids[0].id, 'peopleBtn', 'the People pill is first');
    assert.ok(launch.kids[1].textContent.endsWith('Horizon ID'), 'the Horizon ID label follows People'); assert.ok(!launch.textContent.includes('groups'));
    assert.equal(body.all(k => k.classList.contains('hzp-strip'))[0].all(k => k.classList.contains('hzp-i')).length, 0, 'no i in the top strip any more');
    HorizonPeople.info(chat); await tick();
    const sheet = body.all(k => k.classList.contains('hzp-sheet'))[0], t = sheet.textContent;
    assert.ok(sheet.all(k => k.attrs['aria-label'] === 'Close')[0], 'Close button is labelled and inside the header');
    for (const w of ['AI in this chat', 'Add AI provider', 'Save preferences', 'Leave chat', 'AI reply box']) assert.ok(t.includes(w), w);
    for (const w of ['Upload photo', 'Mute messages', 'Show in top pill', 'Block ', 'Background notifications']) assert.ok(!t.includes(w), w + ' is not in the i sheet');
    // add provider separately: Gemini is not ready (needs a key), Mistral is already in the chat
    btn(sheet, 'Add AI provider').onclick(); await tick();
    const sh2 = body.all(k => k.classList.contains('hzp-sheet'))[0];
    assert.ok(!sh2.all(k => k.tag === 'label' && k.textContent.includes('Mistral')).length, 'providers already in the chat are not offered again');
    assert.ok(sh2.all(k => k.tag === 'label' && k.textContent.includes('Gemini')).length === 1);
    btn(sh2, 'Save preferences').onclick(); await tick();
    const d = JSON.parse(store.horizon_people_v1).defaults; assert.deepEqual([d.ai, d.aiMembers], [true, ['mistral']]);
    // contact tools are on the Synced contacts card
    HorizonPeople.open(); await tick();
    const p = panel(); btn(p, 'Synced contacts').onclick(); await tick();
    if (!btn(p, 'Upload photo')) { btn(p, 'Alice').onclick(); await tick(); }
    const q = panel();
    for (const w of ['Upload photo', 'Mute messages', 'Show in top pill', 'Copy ID', 'Block', 'Block & remove']) assert.ok(q.textContent.includes(w), w + ' is on the contact card');
});

test('v1.99.6: green i, one-to-one live bar, empty card, day dividers, two AI reply modes, whole-round prompt', async () => {
    global.HorizonTimes = { bind: (n, ts) => { n.textContent = String(ts); } };
    const css = head.all(k => k.tag === 'style').map(k => k.textContent).join('\n');
    assert.ok(css.includes('--hzp-green:#00e5ff') && css.includes('.hzp-launch button.hzp-i,.hzp-strip button.hzp-i{border-color:var(--hzp-green)'), 'the i is cyan');
    // body flag lets the app switch the group-AI i off while a people chat is open
    chat.people.paused = false; chat.people.auto = true; chat.messages = [];
    HorizonPeople.changed(); await tick();
    assert.equal(body.attrs['data-hzp-chat'], 'people');
    // empty one-to-one chat shows a card instead of a blank screen
    const cm = new N('div'); cm.id = 'chatMessages'; body._add(cm);
    HorizonPeople.changed(); await tick();
    const card = cm.all(k => k.classList.contains('hzp-empty'))[0];
    assert.ok(card && card.textContent.includes('Say hi to Alice'));
    // live bar: clock always, typing indicator while the AI answers, waiting line while the round is half done
    const bar = body.all(k => k.classList.contains('hzp-live'))[0];
    assert.ok(bar && bar.hidden === false);
    assert.ok(bar.all(k => k.classList.contains('hzp-clock'))[0].textContent.length > 4);
    const state = bar.all(k => k.classList.contains('hzp-state'))[0];
    assert.equal(state.hidden, true);
    host.busy = () => true; HorizonPeople.changed(); await tick();
    assert.equal(state.hidden, false); assert.ok(state.textContent.includes('Mistral is typing'));
    assert.ok(!state.className.includes('connect'), 'no pulse once the reply is typing');
    // V1.99.23: request sent, nothing back yet = cyan pulse + "Connecting to <AI>…"; works for any AI, named by the host
    host.aiPhase = () => 'connect'; host.aiName = () => 'Gemini'; HorizonPeople.live(); await tick();
    assert.equal(state.hidden, false); assert.ok(state.textContent.includes('Connecting to Gemini…'));
    assert.ok(state.className.includes('connect'), 'pulse class is on while connecting');
    assert.ok(state.all(k => k.classList.contains('hzp-pulse')).length === 1, 'pulse element exists');
    host.aiPhase = () => 'type'; HorizonPeople.live(); await tick();
    assert.ok(state.textContent.includes('Gemini is typing')); assert.ok(!state.className.includes('connect'));
    delete host.aiPhase; delete host.aiName;
    host.busy = () => false;
    chat.people.timing = 'all'; chat.people.round = ['HZ-ME']; HorizonPeople.changed(); await tick();
    assert.equal(state.hidden, false); assert.ok(state.textContent.includes('Waiting for Alice'));
    chat.people.round = [];
    // a message arrives: the empty card goes away
    chat.messages = [{ role: 'user', text: 'hi', ts: Date.now(), sender: 'You' }]; HorizonPeople.changed(); await tick();
    assert.equal(cm.all(k => k.classList.contains('hzp-empty')).length, 0);
    // day dividers before their messages when the day changes
    const y = new Date(); y.setDate(y.getDate() - 1); y.setHours(12); const t = new Date(); t.setHours(12);
    const box = new N('div');
    [[y.getTime(), 'old'], [t.getTime(), 'new'], [t.getTime() + 1000, 'newer']].forEach(([ts, text]) => HorizonPeople.renderHuman(box, { ts, text, sender: 'Alice' }));
    assert.deepEqual(box.all(k => k.classList.contains('hzp-day')).map(k => k.textContent), ['Yesterday', 'Today']);
    // i sheet: two choices, picking one saves it and resets the round
    HorizonPeople.info(chat); await tick();
    const sheet = body.all(k => k.classList.contains('hzp-sheet'))[0];
    assert.ok(sheet.textContent.includes('AI replies after each message') && sheet.textContent.includes('AI replies after everyone has sent'));
    flip(lineBox(sheet, 'AI replies after each message'), true); await tick(); assert.equal(chat.people.timing, 'each');
    chat.people.round = ['HZ-ME'];
    flip(lineBox(sheet, 'AI replies after everyone has sent'), true); await tick(); assert.equal(chat.people.timing, 'all'); assert.deepEqual(chat.people.round, []);
    assert.ok(sheet.all(k => k.classList.contains('hzp-mode') && k.classList.contains('on'))[0].textContent.includes('everyone has sent'));
    // whole-round prompt: AI gets both sides once everyone has sent
    const got = []; host.ai = async (c, text) => { got.push(text); };
    chat.messages = [{ role: 'ai', text: 'earlier answer', ts: 1 }, { role: 'user', text: 'Anyone free Friday?', ts: Date.now() - 5000, sender: 'You' }];
    chat.people.round = ['HZ-ME'];
    sync.rooms[0].messages = [{ id: 'm-a1', sender: 'HZ-A', text: 'Friday works for me', ts: Date.now(), clientId: 'c-a1', kind: 'text' }];
    HorizonPeople.open(); await tick(); HorizonPeople.changed(); await tick();
    assert.equal(got.length, 1);
    assert.ok(got[0].startsWith('Friday works for me'), 'the message comes first so @mentions still route');
    assert.ok(got[0].includes('Everyone has now sent a message') && got[0].includes('In the room: Me, Alice'));
    assert.ok(got[0].includes('Me: Anyone free Friday?'));
    assert.ok(got[0].includes('earlier answer') && got[0].includes('\u25B8 Me: Anyone free Friday?'), 'V1.99.11: the AI sees the whole chat; the new round is marked');
    assert.ok(got[0].includes('you CAN see the whole conversation') && got[0].includes('Never say you cannot see the chat'));
    // the group-AI side: no people chat open flips the flag back
    const keepCurrent = host.current; host.current = () => null; HorizonPeople.changed(); await tick();
    assert.equal(body.attrs['data-hzp-chat'], 'ai'); host.current = keepCurrent;
});

test('v1.99.7: @tag makes a guest for one reply (aware, introduces itself), Ask AI green in groups, Retry in the strip', async () => {
    const real = global.fetch; let n = 0;
    global.fetch = async (url, o) => { const route = String(url).split('people-api/')[1].split('?')[0]; if (route === 'message') { calls.push([route, JSON.parse(o.body)]); return { ok: true, status: 200, json: async () => ({ message: { id: 'srv-' + (++n) } }) }; } return real(url, o); };
    global.HorizonGroup = { route: text => ({ mention: /@mistral/i.test(text), targets: /@mistral/i.test(text) ? [{ id: 'mistral' }] : [] }) };
    host.append = (c, role, text, extra) => { const m = Object.assign({ role, text, ts: Date.now() }, extra); c.messages.push(m); return m; };
    chat.people.ai = false; chat.people.aiMembers = []; delete chat.people.aiOwner; delete chat.people.guest; delete chat.group; chat.people.auto = true; chat.people.paused = false; chat.people.timing = 'each';
    chat.messages = [{ role: 'user', text: 'Hello', sender: 'You', ts: Date.now() - 9000 }, { role: 'human', text: 'Hi Grant, ready for the budget talk', sender: 'Alice', ts: Date.now() - 6000 }];
    let seen = null; host.ai = async (c, text) => { seen = { text, ai: c.people.ai, members: c.people.aiMembers.slice(), group: !!c.group, guest: !!c.people.guest }; };
    await HorizonPeople.send('@mistral what do you think about the budget?'); await tick();
    assert.ok(seen, 'the tagged provider was asked');
    assert.ok(seen.text.startsWith('@mistral what do you think about the budget?'));
    assert.ok(seen.text.includes('In the room: Me, Alice') && seen.text.includes('Me called on you'));
    assert.ok(seen.text.includes('New to this room: Mistral') && seen.text.includes('walking into someone'), 'guest introduces itself');
    assert.ok(seen.text.includes('Alice: Hi Grant, ready for the budget talk') && seen.text.includes('Do not bring up unrelated topics'));
    assert.deepEqual([seen.ai, seen.members, seen.group, seen.guest], [true, ['mistral'], true, true], 'a guest while it answers');
    assert.ok(notes.some(x => String(x).includes('Referee: Mistral answers this once')), 'V1.99.21 wording: the guest is announced as the Referee');
    await require('node:timers/promises').setTimeout(3400);
    assert.equal(chat.people.ai, false, 'not a member afterwards'); assert.deepEqual(chat.people.aiMembers || [], []); assert.equal(chat.group, undefined); assert.equal(chat.people.guest, undefined);
    // Added properly (as in Synced contacts / i sheet): stays, and no guest restore happens
    HorizonPeople.info(chat); await tick();
    // Ask AI: green, also in a group, and the AI is told who is in the room
    chat.people.ai = true; chat.people.aiMembers = ['mistral']; chat.people.aiOwner = 'HZ-ME';
    sync.rooms[0].group = true; HorizonPeople.changed(); await tick();
    const strip = body.all(k => k.classList.contains('hzp-strip'))[0];
    const ask = strip.all(k => k.tag === 'button' && k.textContent === 'Ask AI')[0];
    assert.ok(ask && ask.className.includes('hzp-ask'), 'Ask AI shows in a group');
    assert.equal(strip.all(k => k.tag === 'button' && k.className.includes('hzp-retry')).length, 0);
    chat.messages.push({ role: 'user', text: 'this one failed', sender: 'You', delivery: 'failed', clientId: 'cx', ts: Date.now() });
    HorizonPeople.changed(); await tick();
    assert.ok(strip.all(k => k.tag === 'button' && k.className.includes('hzp-retry') && k.textContent === 'Resend 1')[0], 'Resend sits in the strip when something failed');
    seen = null; await ask.onclick(); await tick();
    assert.ok(seen && seen.text.includes('Me called on you') && seen.text.includes('New to this room: Mistral'), 'a member that never spoke here still introduces itself');
    assert.ok(seen.text.includes('In the room: Me, Alice'));
    sync.rooms[0].group = false; global.fetch = real;
});

test('v1.99.8: People pill has a multicolour circling pulse (reduced motion respected)', async () => {
    const css = head.all(k => k.tag === 'style').map(k => k.textContent).join('\n');
    assert.ok(css.includes('@property --hzp-a') && css.includes('@keyframes hzpSpin') && css.includes('.hzp-launch button.hzp-launch-btn::before'));
    assert.ok(/conic-gradient\(from var\(--hzp-a,0deg\),#ff2d95,#ff9a00,#ffe600,#2bff88,#00e5ff,#7a2cff/.test(css));
    assert.ok(css.includes('prefers-reduced-motion:reduce){.hzp-launch button.hzp-launch-btn'));
    const pill = body.all(k => k.id === 'peopleBtn')[0]; assert.ok(pill && pill.className.includes('hzp-launch-btn'));
});

test('v1.99.9: i pushed to the right edge, People pill pulled down onto the chat box', async () => {
    const css = head.all(k => k.tag === 'style').map(k => k.textContent).join('\n');
    assert.ok(css.includes('.hzp-launch button.hzp-i{margin-left:auto}'));
    assert.ok(css.includes('--hzp-pill-pull:8px') && css.includes('margin-bottom:calc(var(--hzp-pill-pull) * -1)'));
});

const closeAllSheets = () => body.all(k => k.classList.contains('hzp-back')).forEach(k => k.remove());
test('v1.99.10: i sheet always shows both reply cards, picking one turns Auto-reply on, Save preferences closes the sheet, real provider logos', async () => {
    chat.people.ai = false; delete chat.people.aiMembers; delete chat.people.aiOwner; delete chat.people.auto; delete chat.people.timing; delete chat.group; closeAllSheets();
    HorizonPeople.info(chat); await tick();
    const sheet = () => body.all(k => k.classList.contains('hzp-sheet'))[0];
    let t = sheet().textContent;
    assert.ok(t.includes('AI replies after each message') && t.includes('AI replies after everyone has sent'), 'both cards show even with no AI in the chat');
    assert.ok(t.indexOf('When the AI replies') < t.indexOf('AI in this chat'), 'reply cards sit above the provider list');
    const radio = sheet().all(k => k.tag === 'input' && k.type === 'radio'); assert.equal(radio.length, 2);
    flip(radio[0], true); await tick();
    assert.equal(chat.people.timing, 'each'); assert.equal(chat.people.auto, true);
    // Save preferences closes the full-screen sheet so the message box is reachable and typeable again.
    const before = body.all(k => k.classList.contains('hzp-sheet')).length;
    btn(sheet(), 'Save preferences').onclick(); await tick();
    assert.equal(before, 1); assert.equal(body.all(k => k.classList.contains('hzp-sheet')).length, 0, 'sheet is gone after Save preferences');
    assert.ok(notes.includes('Preferences saved'));
    assert.equal(JSON.parse(store.horizon_people_v1).defaults.timing, 'each');
    // official logos: the Add provider list uses real vector marks (data-hzp-logo), not the drawn glyphs
    HorizonPeople.info(chat); await tick(); btn(sheet(), 'Add AI provider').onclick(); await tick();
    const logos = sheet().all(k => k.attrs && k.attrs['data-hzp-logo'] === 'official'); assert.ok(logos.length >= 1, 'Mistral shows its official mark');
    assert.ok(/<path d="M[^"]{60,}"/.test(logos[0].innerHTML), 'logo is a real path');
    closeAllSheets();
    // scrolling hooks: the sheet keeps drags away from page-level handlers
    HorizonPeople.info(chat); await tick();
    for (const ev of ['touchstart', 'touchmove', 'wheel']) assert.ok(sheet().listeners[ev] && sheet().listeners[ev].length >= 1, ev);
    const css = head.all(k => k.tag === 'style').map(k => k.textContent).join('\n');
    assert.ok(css.includes('.hzp-sheet{display:block;height:auto;min-height:0') && css.includes('touch-action:pan-y') && css.includes('overflow-y:auto'));
    closeAllSheets();
});

test('v1.99.10: "after each message" answers every message, in order', async () => {
    chat.people.ai = true; chat.people.aiMembers = ['mistral']; chat.people.aiOwner = 'HZ-ME'; chat.people.timing = 'each'; chat.people.auto = true; chat.messages = [];
    const asked = []; host.ai = async (c, text) => { asked.push(text.split('\n')[0]); };
    sync.rooms[0].messages = [{ id: 'm1', kind: 'human', sender: 'HZ-A', text: 'first from Alice', ts: Date.now() - 3000, clientId: 'k1' }, { id: 'm2', kind: 'human', sender: 'HZ-A', text: 'second from Alice', ts: Date.now() - 2000, clientId: 'k2' }, { id: 'm3', kind: 'human', sender: 'HZ-A', text: 'third from Alice', ts: Date.now() - 1000, clientId: 'k3' }];
    HorizonPeople.open(); await tick(); for (let i = 0; i < 4; i++) { HorizonPeople.changed(); await tick(); }
    assert.deepEqual(asked, ['first from Alice', 'second from Alice', 'third from Alice']);
    // "after everyone has sent": one reply for the round, only when every member has spoken
    asked.length = 0; chat.people.timing = 'all'; chat.people.round = []; chat.messages = []; sync.rooms[0].messages = [];
    sync.rooms[0].messages = [{ id: 'n1', kind: 'human', sender: 'HZ-A', text: 'Alice speaks', ts: Date.now() - 900, clientId: 'q1' }];
    HorizonPeople.open(); await tick(); HorizonPeople.changed(); await tick();
    assert.equal(asked.length, 0, 'waits while Me has not sent ' + JSON.stringify([asked, chat.people.round, chat.messages.map(m => m.text)]));
    const realFetch = global.fetch; global.fetch = async (url, o) => { const route = String(url).split('people-api/')[1].split('?')[0]; return route === 'message' ? { ok: true, status: 200, json: async () => ({ message: { id: 'mine1' } }) } : realFetch(url, o); };
    await HorizonPeople.send('Me speaks', false); await tick();
    global.fetch = realFetch;
    assert.equal(asked.length, 1, 'once everyone has sent, the AI answers the round once');
    assert.ok(asked[0].startsWith('Me speaks'));
    assert.equal(chat.people.round.length, 0, 'round resets after the answer');
    sync.rooms[0].messages = [];
});

test('v1.99.11: every AI gets the full transcript, old @tags are defused, @tag of my provider answers by itself, Resend button', async () => {
    chat.people.ai = true; chat.people.aiMembers = ['mistral']; chat.people.aiOwner = 'HZ-ME'; chat.people.timing = 'all'; chat.people.auto = false; chat.people.paused = true; chat.people.round = [];
    chat.messages = [{ role: 'human', text: 'old tag @gemini what is up', sender: 'Alice', ts: 1 }, { role: 'ai', text: 'hello', sharedProvider: 'Gemini', ts: 2 }];
    const asked = []; host.ai = async (c, text) => { asked.push(text); };
    global.HorizonGroup = { route: text => /@mistral/.test(text) ? { mention: true, targets: [{ id: 'mistral' }] } : { mention: false, targets: [] } };
    const realTimeout = global.setTimeout; global.setTimeout = (f, ms, ...a) => realTimeout(f, ms > 1000 && ms <= 6000 ? 5 : ms, ...a);
    sync.rooms[0].messages = [{ id: 't1', kind: 'human', sender: 'HZ-A', text: '@mistral can you see the chat', ts: Date.now(), clientId: 'tt1' }];
    HorizonPeople.open(); await tick(); const t0 = Date.now(); while (Date.now() - t0 < 60) await new Promise(r => setImmediate(r)); for (let i = 0; i < 3; i++) { HorizonPeople.changed(); await tick(); }
    global.setTimeout = realTimeout; delete global.HorizonGroup;
    assert.equal(asked.length, 1, 'tagged provider answers with Auto-reply off, paused, and no Ask AI tap');
    assert.ok(asked[0].startsWith('@mistral can you see the chat'));
    assert.ok(asked[0].includes('Alice: old tag @\u200Bgemini what is up'), 'old @tags in the transcript cannot route');
    assert.ok(asked[0].includes('Gemini (AI): hello') && asked[0].includes('AIs here: Mistral') && asked[0].includes('NOT a one-on-one chat'));
    // Resend (was Retry): icon + count, in the strip
    chat.people.paused = false; chat.messages = [{ role: 'user', text: 'x', delivery: 'failed', clientId: 'f1', ts: Date.now() }, { role: 'user', text: 'y', shareFailed: true, clientId: 'f2', ts: Date.now() }];
    HorizonPeople.changed(); await tick();
    const strip = body.all(k => k.classList.contains('hzp-strip'))[0], rb = strip.all(k => k.tag === 'button' && k.className.includes('hzp-retry'))[0];
    assert.ok(rb && rb.textContent === 'Resend 2' && rb.attrs['aria-label'] === 'Resend 2 undelivered messages');
    assert.ok(rb.all(k => k.classList.contains('hzp-retry-i'))[0].innerHTML.includes('<svg'));
    chat.messages = []; sync.rooms[0].messages = [];
});

test('v1.99.22: AI group i becomes the same cyan Options pill; people Options pushed to the right', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'www', 'horizon_people.js'), 'utf8');
  assert.ok(src.includes("b.classList.add('hz-group-i', 'hzp-gopt')"), 'i gets the pill class');
  assert.ok(src.includes("b.textContent = 'Options'"), 'i is relabelled Options');
  assert.ok(/button\.hz-group-i\.hzp-gopt\{[^}]*#00e5ff/.test(src), 'pill is cyan');
  assert.ok(src.includes('body[data-hzp-chat="people"] .hz-group-i{display:none!important}'), 'still hidden in people chats');
  assert.ok(src.includes('.hzp-launch button.hzp-i.hzp-opt{margin-left:auto!important;margin-right:0!important}') && src.includes('.hzp-launch{box-sizing:border-box;width:100%;align-self:stretch}'), 'people Options pinned to the far right corner of a full-width row');
  assert.ok(src.includes('launch.append(launchBtn, launchSub, iBtn)'), 'Options is last in the row');
});

test('v1.99.22: peer-to-peer box says Message Peer to Peer; Options and People row sits lower on the chat box', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'www', 'horizon_people.js'), 'utf8');
  assert.ok(src.includes("var P2P_HINT = 'Message Peer to Peer'"), 'hint text');
  assert.ok(src.includes('inp.placeholder = P2P_HINT') && src.includes("attributeFilter: ['placeholder']"), 'pinned and kept pinned');
  assert.ok(src.includes('body .hzp-launch{--hzp-pill-pull:18px}'), 'row pulled lower onto the chat box');
});

test('v1.99.22: AI provider rows are short, checkbox sits beside the name, a ticked row glows cyan', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'www', 'horizon_people.js'), 'utf8');
  assert.ok(src.includes('body .hzp-line.hzp-ai{justify-content:flex-start;gap:10px;min-height:0;padding:5px 10px'), 'short rows');
  assert.ok(src.includes('body .hzp-line.hzp-ai .hzp-ai-t{flex:0 1 auto}'), 'checkbox no longer pushed to the far right');
  assert.ok(src.includes('body .hzp-line.hzp-ai:has(input:checked){border-color:#00e5ff;background:rgba(0,229,255,.12);box-shadow:0 0 14px rgba(0,229,255,.55)'), 'whole row glows cyan when ticked');
});
