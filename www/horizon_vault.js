/* HORIZON · Horizon Vault · V1.12.0  (V1.99.116: BAD key indicator + Export)
 *
 * V1.99.116 BAD KEYS + EXPORT
 * - A key the provider rejected is flagged BAD (red) on its Vault item, in "Keys in Horizon", in a Bad filter chip and on the Vault row in Settings.
 *   Indicator only: nothing is deleted for you. You delete the Vault copy yourself when you see the flag.
 * - Export button: saves Everything, Notes only or Keys only as JSON, readable Text or .env, with or without the keys from the provider cards.
 *   The file is plain text on purpose (you asked for a readable export), so the panel warns you and asks for a second tap.
 *
 * A private stash on the phone, shown as the HORIZON VAULT page in the right panel.
 * - Item types: AI key, Scraping key, Note, SSH key, Token, Link. Several keys per service are fine.
 * - "Use" on an AI or scraping key sends it through the same save-and-validate path the provider cards use.
 * - Links show the site's icon (favicon, with a letter fallback).
 * - The AI can file notes here by itself: [[vault.note: Title | text]] at the end of a reply.
 *   A switch (here and under PERMISSIONS) turns that on or off. Keys, tokens and SSH keys are never
 *   sent to the AI, and a note that looks like it holds a secret is refused.
 *
 * V1.12.0 ENCRYPTION
 * - The item list is stored as one AES-256-GCM blob in localStorage ("horizon_vault_enc").
 * - The key comes from a passphrase through PBKDF2-SHA256 (600,000 rounds, random 16-byte salt).
 *   The passphrase and the key are never written anywhere. There is no recovery: forget it and the
 *   vault can only be erased.
 * - Every save uses a fresh random 12-byte IV.
 * - Locked: the list is gone from memory, the AI cannot file notes and sees no titles.
 *   Locks itself after 5 minutes idle or 1 minute in the background, or with Lock now.
 * - Old plaintext vaults (V1.11.0 and earlier) are encrypted the first time a passphrase is set,
 *   then the plaintext copy is removed.
 * - Wrong passphrase attempts are slowed down after the third miss.
 *
 * V1.93.39 KEYS IN HORIZON
 * - A card at the top of the unlocked Vault lists every API key saved in the app (main and backup keys, AI and
 *   scraping), masked, with the provider name, so you can see which ones you have.
 * - A key that matches a Vault item is marked NAMED with that item's title. One that does not is marked NOT NAMED,
 *   with a Name it button that opens the Add form with the key and service filled in.
 * - Only shown while unlocked. The card is private to the page: the AI never reads it.
 *
 * Public API: window.HorizonVault = { init, SRC, EDIT_SRC, block, extract, summary, aiOn, setAi, add, count, refresh, lock, isLocked }
 */
(function () {
    'use strict';

    const LS_ITEMS = 'horizon_vault';          // legacy plaintext (V1.11.0 and earlier); removed after migration
    const LS_ENC = 'horizon_vault_enc';        // encrypted envelope
    const LS_FAIL = 'horizon_vault_fail';      // wrong-passphrase counter
    const LS_AI = 'horizon_vault_ai';
    const MAX_ITEMS = 300;
    const MAX_VALUE = 60000;
    const ITER = 600000;
    const MIN_PASS = 8;
    const IDLE_MS = 5 * 60 * 1000;
    const BG_MS = 60 * 1000;
    const AAD = new TextEncoder().encode('horizon-vault-v1');
    const SRC = '\\[\\[vault\\.note:\\s*([^|\\]]{1,90}?)\\s*\\|\\s*((?:(?!\\]\\])[\\s\\S])*?)\\s*\\]\\]';
    // V1.40.0: [[vault.edit: Title | text]] appends to a note the AI filed itself; [[vault.edit: Title | replace: text]] rewrites it.
    const EDIT_SRC = '\\[\\[vault\\.edit:\\s*([^|\\]]{1,90}?)\\s*\\|\\s*((?:(?!\\]\\])[\\s\\S])*?)\\s*\\]\\]';
    const SECRET_RE = /(A[Qq][.A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

    const TYPES = [
        { id: 'ai', label: 'AI key', plural: 'AI keys', ic: 'i-spark', secret: true, svc: 'ai', valLabel: 'API key', ph: 'Paste the key' },
        { id: 'scrape', label: 'Scraping key', plural: 'Scraping', ic: 'i-globe', secret: true, svc: 'web', valLabel: 'API key', ph: 'Paste the key' },
        { id: 'note', label: 'Note', plural: 'Notes', ic: 'i-note', secret: false, valLabel: 'Note', ph: 'Write the note' },
        { id: 'ssh', label: 'SSH key', plural: 'SSH keys', ic: 'i-terminal', secret: true, valLabel: 'SSH key (private key, host or command)', ph: '-----BEGIN OPENSSH PRIVATE KEY-----' },
        { id: 'token', label: 'Token', plural: 'Tokens', ic: 'i-key', secret: true, valLabel: 'Token', ph: 'Paste the token' },
        { id: 'link', label: 'Link', plural: 'Links', ic: 'i-link', secret: false, valLabel: 'Link', ph: 'https://' }
    ];
    const typeOf = id => TYPES.find(t => t.id === id) || TYPES[2];

    let host = {
        lsGet: () => null, lsSet: () => {}, lsDel: () => {}, notice: () => {}, esc: s => String(s), icon: () => document.createElement('span'),
        favHTML: () => '', safeUrl: u => u, hostName: u => u, providers: [], webs: [],
        useAiKey: async () => {}, useWebKey: async () => {}, currentAiKey: () => '', currentWebKey: () => '', listKeys: () => [], onAiChange: () => {}
    };
    let items = [];
    let filter = 'all';
    let editId = '';
    let root = null;
    const revealed = new Set();
    const openNotes = new Set();
    const aiSwitches = [];
    const delTimers = {};
    let keysOpen = true;
    let keysOnlyUnnamed = false;
    const EXP = { scope: 'all', fmt: 'json', app: true, armed: false, msg: '' };

    // crypto state. cryptoKey is a non-extractable CryptoKey; null while locked.
    let cryptoKey = null;
    let curSalt = null;
    let curIter = ITER;
    let hasVault = false;      // an encrypted envelope exists
    let legacy = [];           // plaintext items waiting to be encrypted by the first passphrase
    let busy = false;
    let saveQ = Promise.resolve();
    let lastActive = Date.now();
    let hiddenAt = 0;
    let tickTimer = 0;
    let eraseTimer = 0;
    const isLocked = () => !cryptoKey;

    const uid = () => 'v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // ---------- crypto ----------
    const te = new TextEncoder(), td = new TextDecoder();
    function b64(buf) {
        const a = new Uint8Array(buf);
        let s = '';
        for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
        return btoa(s);
    }
    const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
    const subtle = () => (window.crypto && window.crypto.subtle) || null;

    async function derive(pass, salt, iter) {
        const base = await subtle().importKey('raw', te.encode(String(pass).normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
        return subtle().deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    }
    async function seal(key, text) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ct = await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: AAD }, key, te.encode(text));
        return { iv: b64(iv), ct: b64(ct) };
    }
    async function openBlob(key, iv, ct) {
        return td.decode(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(iv), additionalData: AAD }, key, unb64(ct)));
    }
    function readEnv() {
        const raw = host.lsGet(LS_ENC);
        if (!raw) return null;
        try {
            const e = JSON.parse(raw);
            if (e && e.v === 1 && e.salt && e.iv && e.ct && e.iter > 0) return e;
        } catch (err) { /* damaged */ }
        return { damaged: true };
    }

    function load() {
        legacy = [];
        const env = readEnv();
        hasVault = !!env;
        if (hasVault) {
            // A finished migration never leaves plaintext behind; clean up if a crash did.
            if (host.lsGet(LS_ITEMS) != null) wipePlain();
            return;
        }
        try {
            const v = JSON.parse(host.lsGet(LS_ITEMS));
            legacy = Array.isArray(v) ? v.filter(x => x && x.id && x.type) : [];
        } catch (e) { legacy = []; }
    }
    function wipePlain() {
        host.lsSet(LS_ITEMS, '[]');
        host.lsDel(LS_ITEMS);
    }

    // Serialised so two quick edits can never land out of order.
    function save() {
        if (!cryptoKey) return Promise.resolve();
        const key = cryptoKey, salt = curSalt, iter = curIter;
        const snap = JSON.stringify(items);
        saveQ = saveQ.then(async () => {
            const blob = await seal(key, snap);
            const str = JSON.stringify({ v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: blob.iv, ct: blob.ct });
            host.lsSet(LS_ENC, str);
            if (host.lsGet(LS_ENC) !== str) throw new Error('storage full or blocked');
        }).catch(e => host.notice('Vault could not save: ' + (e && e.message || e), 'error'));
        return saveQ;
    }

    // ---------- fail throttle ----------
    function failState() {
        try { const f = JSON.parse(host.lsGet(LS_FAIL)); return { n: f.n | 0, until: +f.until || 0 }; } catch (e) { return { n: 0, until: 0 }; }
    }
    function noteFail() {
        const f = failState();
        f.n += 1;
        f.until = f.n >= 3 ? Date.now() + Math.min(15 * 60 * 1000, 5000 * Math.pow(2, f.n - 3)) : 0;
        host.lsSet(LS_FAIL, JSON.stringify(f));
        return f;
    }
    const clearFail = () => host.lsDel(LS_FAIL);

    // ---------- lock / unlock / setup ----------
    async function unlock(pass) {
        const env = readEnv();
        if (!env || env.damaged) throw new Error('The encrypted Vault data is damaged. If you have no backup, erase the Vault below and start again.');
        const f = failState();
        if (f.until > Date.now()) throw new Error(`Too many wrong tries. Wait ${Math.ceil((f.until - Date.now()) / 1000)} s.`);
        let key, text;
        try {
            key = await derive(pass, unb64(env.salt), env.iter);
            text = await openBlob(key, env.iv, env.ct);
        } catch (e) {
            const n = noteFail();
            throw new Error(n.until > Date.now() ? `Wrong passphrase. Locked out for ${Math.ceil((n.until - Date.now()) / 1000)} s.` : 'Wrong passphrase.');
        }
        let v;
        try { v = JSON.parse(text); } catch (e) { v = []; }
        items = Array.isArray(v) ? v.filter(x => x && x.id && x.type) : [];
        cryptoKey = key;
        curSalt = unb64(env.salt);
        curIter = env.iter;
        clearFail();
        touch();
        startTick();
    }

    async function setup(pass, pass2) {
        if (!subtle()) throw new Error('This device has no encryption support in the web view, so the Vault cannot be set up.');
        if (String(pass).length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters. Four random words is better.`);
        if (pass !== pass2) throw new Error('The two passphrases do not match.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await derive(pass, salt, ITER);
        items = legacy.slice();
        cryptoKey = key; curSalt = salt; curIter = ITER;
        await save();
        const env = readEnv();
        if (!env || env.damaged) {
            cryptoKey = null; items = [];
            throw new Error('Could not write the encrypted Vault. Nothing was changed.');
        }
        // Prove the stored blob opens before the plaintext copy is destroyed.
        try { await openBlob(key, env.iv, env.ct); } catch (e) {
            cryptoKey = null; items = [];
            host.lsDel(LS_ENC);
            throw new Error('Self-check failed. Nothing was changed.');
        }
        wipePlain();
        legacy = [];
        hasVault = true;
        clearFail();
        touch();
        startTick();
    }

    function lock(why) {
        if (!cryptoKey && !items.length) { render(); return; }
        cryptoKey = null;
        curSalt = null;
        items = [];
        revealed.clear();
        openNotes.clear();
        editId = '';
        Object.keys(delTimers).forEach(k => { clearTimeout(delTimers[k]); delete delTimers[k]; });
        stopTick();
        if (root) {
            ['#vtVal', '#vtTitle', '#vtCur', '#vtNew', '#vtNew2'].forEach(s => { const e = $1(s); if (e) e.value = ''; });
            const f = $1('#vtForm'); if (f) f.hidden = true;
            const p = $1('#vtPass'); if (p) p.hidden = true;
        }
        render();
        host.onAiChange(aiOn());
        if (why) host.notice(why);
    }

    async function changePass(cur, next, next2) {
        const env = readEnv();
        if (!env || env.damaged) throw new Error('Vault data is damaged.');
        try { await openBlob(await derive(cur, unb64(env.salt), env.iter), env.iv, env.ct); } catch (e) { throw new Error('The current passphrase is wrong.'); }
        if (String(next).length < MIN_PASS) throw new Error(`Use at least ${MIN_PASS} characters.`);
        if (next !== next2) throw new Error('The two new passphrases do not match.');
        const salt = crypto.getRandomValues(new Uint8Array(16));
        const key = await derive(next, salt, ITER);
        cryptoKey = key; curSalt = salt; curIter = ITER;
        await save();
        const chk = readEnv();
        try { await openBlob(key, chk.iv, chk.ct); } catch (e) { throw new Error('Self-check failed. Try again.'); }
    }

    function eraseAll() {
        host.lsDel(LS_ENC); host.lsDel(LS_FAIL); wipePlain();
        cryptoKey = null; curSalt = null; items = []; legacy = []; hasVault = false;
        revealed.clear(); openNotes.clear(); stopTick();
        render();
        host.onAiChange(aiOn());
        host.notice('Vault erased');
    }

    // ---------- auto-lock ----------
    function touch() { lastActive = Date.now(); }
    function check() {
        if (!cryptoKey) return;
        if (Date.now() - lastActive >= IDLE_MS) lock('Vault locked (idle)');
    }
    function startTick() { stopTick(); tickTimer = setInterval(check, 10000); }
    function stopTick() { if (tickTimer) clearInterval(tickTimer); tickTimer = 0; }
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
        const away = hiddenAt ? Date.now() - hiddenAt : 0;
        hiddenAt = 0;
        if (cryptoKey && away >= BG_MS) lock('Vault locked (app was in the background)');
        else check();
    });
    ['pointerdown', 'keydown', 'touchstart'].forEach(ev => document.addEventListener(ev, () => { if (cryptoKey) touch(); }, { passive: true, capture: true }));

    // ---------- state used by the rest of the app ----------
    const aiOn = () => true;   // no AI-notes switch any more: Fezzy asking the AI to add something to the Vault is the permission (the lock still protects it)
    const canFile = () => aiOn() && !!cryptoKey;
    function setAi() { /* removed: the AI is always allowed to file notes while the Vault is unlocked */ }

    function ago(ts) {
        const s = Math.max(0, (Date.now() - ts) / 1000);
        if (s < 60) return 'just now';
        if (s < 3600) return Math.floor(s / 60) + ' min ago';
        if (s < 86400) return Math.floor(s / 3600) + ' h ago';
        if (s < 86400 * 30) return Math.floor(s / 86400) + ' d ago';
        return new Date(ts).toLocaleDateString();
    }
    const mask = v => { v = String(v || ''); return v.length <= 8 ? '•'.repeat(Math.max(4, v.length)) : '•••••• ' + v.slice(-4); };
    function svcName(it) {
        const list = it.type === 'ai' ? host.providers : it.type === 'scrape' ? host.webs : [];
        const f = list.find(x => x.id === it.svc);
        return f ? f.name : '';
    }
    function copyText(text) {
        const done = () => host.notice('Copied');
        if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(text).then(done, fallback); return; }
        fallback();
        function fallback() {
            const ta = document.createElement('textarea');
            ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
            document.body.appendChild(ta); ta.select();
            try { document.execCommand('copy'); done(); } catch (e) { host.notice('Could not copy', 'error'); }
            ta.remove();
        }
    }

    // ---------- adding ----------
    function add(o) {
        if (!cryptoKey) return null;
        const type = typeOf(o.type).id;
        const value = String(o.value || '').trim().slice(0, MAX_VALUE);
        if (!value) return null;
        let title = String(o.title || '').trim().slice(0, 90);
        if (!title) {
            if (type === 'link') title = host.hostName(value) || value.slice(0, 40);
            else if (type === 'note') title = value.split('\n')[0].slice(0, 60);
            else title = typeOf(type).label;
        }
        const it = { id: uid(), type, title, value, t: Date.now() };
        if (o.svc) it.svc = o.svc;
        if (o.by === 'ai') it.by = 'ai';
        items.unshift(it);
        if (items.length > MAX_ITEMS) items.length = MAX_ITEMS;
        save();
        render();
        return it;
    }

    // [[vault.note: Title | text]] in an AI reply. Always stripped; filed only when the switch is on and the Vault is unlocked.
    function extract(raw) {
        const saved = [];
        let refused = '';
        const norm = t => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
        const text = String(raw || '').replace(new RegExp(EDIT_SRC, 'gi'), (m, title, body) => {
            if (!canFile() || saved.length >= 2 || !body || SECRET_RE.test(title + '\n' + body)) {
                if (!refused) refused = !aiOn() ? 'AI notes are switched off' : (!cryptoKey ? 'the Vault is locked' : (SECRET_RE.test(title + '\n' + body) ? 'it looked like a key or secret' : 'the limit is 2 notes per reply'));
                return '';
            }
            const k = norm(title);
            const mine = items.filter(i => i.type === 'note' && i.by === 'ai');
            const it = mine.find(i => norm(i.title) === k) || mine.find(i => norm(i.title).includes(k) || k.includes(norm(i.title)));
            if (!it) { if (!refused) refused = 'no note you filed is called "' + title.slice(0, 40) + '"'; return ''; }
            const rep = /^replace:\s*/i.test(body);
            const add = body.replace(/^replace:\s*/i, '').trim();
            it.value = (rep ? add : (it.value + '\n\n' + add)).slice(0, MAX_VALUE);
            it.t = Date.now();
            save();
            render();
            saved.push(it.title + ' (updated)');
            return '';
        }).replace(new RegExp(SRC, 'gi'), (m, title, body) => {
            if (canFile() && saved.length < 2 && body && !SECRET_RE.test(title + '\n' + body)) {
                const it = add({ type: 'note', title, value: body, by: 'ai' });
                if (it) saved.push(it.title);
            } else if (!refused) {
                refused = !aiOn() ? 'AI notes are switched off' : (!cryptoKey ? 'the Vault is locked' : (SECRET_RE.test(title + '\n' + body) ? 'it looked like a key or secret' : 'the limit is 2 notes per reply'));
            }
            return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        if (refused && window.HzToast) HzToast.show({ icon: 'i-vault', title: 'Horizon could not save a note', sub: 'Because ' + refused + '.', kind: 'bad' });
        return { text, saved };
    }

    function summary() {
        if (!cryptoKey) return 'Vault: locked';
        const c = {};
        items.forEach(i => { c[i.type] = (c[i.type] || 0) + 1; });
        return 'Vault: unlocked, ' + items.length + ' items (' + TYPES.map(t => (c[t.id] || 0) + ' ' + t.plural.toLowerCase()).join(', ') + '). Only notes are readable by the AI; key, SSH and token values are never shared.';
    }

    function block() {
        if (!aiOn()) {
            return 'HORIZON VAULT NOTES\nSwitched off (PERMISSIONS in the right panel). You cannot file notes. If Fezzy asks you to save something, tell him to switch "AI can write Vault notes" on.';
        }
        if (!cryptoKey) {
            return 'HORIZON VAULT NOTES\nThe Vault is locked (encrypted). You cannot file notes and you cannot see what is in it. If Fezzy asks you to save something, tell him to unlock the Vault in the right panel first.';
        }
        let used = 0;
        const titles = [];
        items.filter(i => i.type === 'note').slice(0, 25).forEach(i => {
            const body = String(i.value || '').replace(/\s+/g, ' ').slice(0, 500);
            if (used + body.length > 6000) return;
            used += body.length;
            titles.push('- ' + i.title + (i.by === 'ai' ? ' (you filed it)' : '') + ': ' + body);
        });
        return [
            'HORIZON VAULT NOTES (Fezzy\'s private note stash in the right panel)',
            'PERMISSION: there is no Vault switch. When Fezzy tells you to add, save, put or file something in his Vault, that IS your permission: do it at once with the tag below, never ask him to switch anything on and never ask him to confirm. Keys, tokens and SSH keys are never written or shown.',
            'When Fezzy asks you to write, plan, outline or save something he will want to keep (a plan, checklist, script, summary, config, snippet), or when you finish a substantial piece he would obviously want filed, add ONE line at the very END of your reply: [[vault.note: Short title | the note text]]. The note text may run over several lines and use Markdown. Max 2 per reply. Do not file small talk or things already in the chat that he did not need kept. Never put keys, tokens, passwords or SSH keys in a note. Tell him in a few words that it is in the Vault. The app strips the tag.',
            'EDITING YOUR NOTES: you can change notes marked "(you filed it)". To add to one, put [[vault.edit: exact title | text to append]] at the END of your reply; to rewrite it, use [[vault.edit: exact title | replace: the full new text]]. Prefer appending (checklist ticks, new steps, a log line). Counts toward the 2 tags per reply. Never edit notes Fezzy wrote himself. REPO NOTES: after you read a pulled GitHub repo and Fezzy asks you to note, document or summarise it, file it as [[vault.note: Repo: name | summary]] (what it is, stack, layout, entry points, how to run, open problems).',
            titles.length ? 'Notes in the Vault (you can read these; do not duplicate them. AI keys, scraping keys, SSH keys and tokens are never shown to you):\n' + titles.join('\n') : ''
        ].filter(Boolean).join('\n');
    }

    // ---------- UI ----------
    const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
    function $1(sel, r) { return (r || root).querySelector(sel); }

    function buildRoot() {
        root.innerHTML = '';

        // --- lock / setup screen ---
        const lockCard = h('section', 'vt-card vt-form vt-lock');
        lockCard.id = 'vtLock';
        lockCard.innerHTML =
            '<div class="settings-row-header"><div class="settings-row-content"><h3 class="vt-title"></h3><p id="vtLockMsg"></p></div></div>' +
            '<label class="field-label" for="vtPw" id="vtPwL">Passphrase</label>' +
            '<input id="vtPw" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<label class="field-label" for="vtPw2" id="vtPw2L">Repeat passphrase</label>' +
            '<input id="vtPw2" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<div class="card-actions"><button class="primary-btn" id="vtGo" type="button"></button></div>' +
            '<p class="vt-warn" id="vtLockWarn" hidden></p>' +
            '<p class="hint" id="vtLockHint"></p>' +
            '<div class="vt-acts"><button class="vt-act del" id="vtErase" type="button">Forgot it? Erase the Vault</button></div>';
        $1('.vt-title', lockCard).append(host.icon('i-vault'), document.createTextNode(' Vault locked'));
        root.appendChild(lockCard);

        // --- unlocked area ---
        const main = h('div', '');
        main.id = 'vtMain';
        root.appendChild(main);

        const intro = h('section', 'vt-card');
        intro.innerHTML =
            '<div class="settings-row-header"><div class="settings-row-content">' +
            '<h3 class="vt-title"></h3><p id="vtStatus">Empty</p></div>' +
            '<button class="primary-btn" id="vtAdd" type="button" aria-label="Add to the Vault"></button></div>' +
            '<p class="hint">Your private stash on this phone, encrypted with your passphrase: AI and scraping keys (several per service, tap <b>Use</b> to switch), notes, SSH keys, tokens and links. Horizon can also file notes here while it writes for you. You control that with the switch below or under PERMISSIONS.</p>';
        $1('.vt-title', intro).append(host.icon('i-vault'), document.createTextNode(' Private stash'));
        $1('#vtAdd', intro).append(host.icon('i-plus'), Object.assign(document.createElement('span'), { textContent: 'Add' }));
        const swRow = h('div', 'vt-switch');
        swRow.innerHTML = '<div><b>AI can write Vault notes</b><small>It files plans and scripts for you. Never keys.</small></div>';
        swRow.appendChild(makeSwitch());
        intro.appendChild(swRow);
        const tools = h('div', 'vt-acts');
        tools.innerHTML = '<button class="vt-act pri" id="vtLockNow" type="button">Lock now</button><button class="vt-act" id="vtChangeBtn" type="button">Change passphrase</button><button class="vt-act" id="vtDetect" type="button">Detect keys</button><button class="vt-act" id="vtExport" type="button">Export</button>';
        intro.appendChild(tools);
        main.appendChild(intro);
        const det = h('section', 'vt-card');
        det.id = 'vtDetectPanel';
        det.hidden = true;
        main.appendChild(det);
        $1('#vtDetect', tools).addEventListener('click', openDetect);
        const exp = h('section', 'vt-card vt-form vt-exp');
        exp.id = 'vtExportPanel';
        exp.hidden = true;
        main.appendChild(exp);
        $1('#vtExport', tools).addEventListener('click', openExport);

        const pass = h('section', 'vt-card vt-form');
        pass.id = 'vtPass';
        pass.hidden = true;
        pass.innerHTML =
            '<label class="field-label" for="vtCur">Current passphrase</label><input id="vtCur" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<label class="field-label" for="vtNew">New passphrase</label><input id="vtNew" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<label class="field-label" for="vtNew2">Repeat new passphrase</label><input id="vtNew2" type="password" autocomplete="off" autocapitalize="off" spellcheck="false">' +
            '<div class="card-actions"><button class="primary-btn" id="vtPassSave" type="button"></button><button class="use-btn" id="vtPassCancel" type="button">Cancel</button></div>' +
            '<p class="vt-warn" id="vtPassWarn" hidden></p>';
        $1('#vtPassSave', pass).append(host.icon('i-check'), Object.assign(document.createElement('span'), { textContent: 'Change' }));
        main.appendChild(pass);

        const form = h('section', 'vt-card vt-form');
        form.id = 'vtForm';
        form.hidden = true;
        form.innerHTML =
            '<label class="field-label" for="vtType">Type</label><select id="vtType"></select>' +
            '<label class="field-label" id="vtSvcL" for="vtSvc">Service</label><select id="vtSvc"></select>' +
            '<label class="field-label" for="vtTitle">Title</label><input id="vtTitle" type="text" autocomplete="off" autocapitalize="sentences" placeholder="Optional">' +
            '<label class="field-label" id="vtValL" for="vtVal">Value</label><textarea id="vtVal" rows="5" spellcheck="false" autocapitalize="off" autocomplete="off"></textarea>' +
            '<div class="card-actions"><button class="primary-btn" id="vtSave" type="button"></button><button class="use-btn" id="vtCancel" type="button">Cancel</button></div>' +
            '<p class="vt-warn" id="vtWarn" hidden></p>';
        TYPES.forEach(t => form.querySelector('#vtType').appendChild(Object.assign(document.createElement('option'), { value: t.id, textContent: t.label })));
        $1('#vtSave', form).append(host.icon('i-check'), Object.assign(document.createElement('span'), { textContent: 'Save to Vault' }));
        main.appendChild(form);

        const kc = h('section', 'vt-card vt-keys');
        kc.id = 'vtKeys';
        kc.setAttribute('data-hz-private', '1');
        main.appendChild(kc);

        main.appendChild(h('div', 'vt-filters')).id = 'vtFilters';
        main.appendChild(h('div', '')).id = 'vtList';
        main.appendChild(h('div', 'panel-foot', 'Encrypted on this device with AES-256-GCM. The key is made from your passphrase (PBKDF2, 600,000 rounds) and is never stored, so there is no recovery if you forget it. The Vault locks itself after 5 minutes idle or 1 minute in the background. Notes are the only thing the AI can see, and only while the Vault is unlocked. A key you switch on with Use is also kept by the provider card, outside the Vault.'));

        $1('#vtAdd', root).addEventListener('click', () => openForm(''));
        $1('#vtCancel', root).addEventListener('click', closeForm);
        $1('#vtSave', root).addEventListener('click', saveForm);
        $1('#vtType', root).addEventListener('change', syncForm);
        $1('#vtLockNow', root).addEventListener('click', () => lock('Vault locked'));
        $1('#vtChangeBtn', root).addEventListener('click', () => {
            const p = $1('#vtPass');
            p.hidden = !p.hidden;
            $1('#vtPassWarn').hidden = true;
            if (!p.hidden) { ['#vtCur', '#vtNew', '#vtNew2'].forEach(s => { $1(s).value = ''; }); p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
        });
        $1('#vtPassCancel', root).addEventListener('click', () => { $1('#vtPass').hidden = true; ['#vtCur', '#vtNew', '#vtNew2'].forEach(s => { $1(s).value = ''; }); });
        $1('#vtPassSave', root).addEventListener('click', async () => {
            const btn = $1('#vtPassSave'), warn = $1('#vtPassWarn');
            if (busy) return;
            busy = true; btn.disabled = true; warn.hidden = true;
            try {
                await changePass($1('#vtCur').value, $1('#vtNew').value, $1('#vtNew2').value);
                ['#vtCur', '#vtNew', '#vtNew2'].forEach(s => { $1(s).value = ''; });
                $1('#vtPass').hidden = true;
                host.notice('Passphrase changed');
            } catch (e) { warn.textContent = e.message || String(e); warn.hidden = false; }
            busy = false; btn.disabled = false;
        });

        $1('#vtGo', root).addEventListener('click', goLock);
        ['#vtPw', '#vtPw2'].forEach(s => $1(s, root).addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); goLock(); } }));
        $1('#vtErase', root).addEventListener('click', e => {
            const b = e.currentTarget;
            if (eraseTimer) {
                clearTimeout(eraseTimer); eraseTimer = 0;
                eraseAll();
                return;
            }
            b.textContent = 'Tap again to erase everything';
            b.classList.add('danger');
            eraseTimer = setTimeout(() => { eraseTimer = 0; paintLock(); }, 4000);
        });
    }

    async function goLock() {
        if (busy) return;
        const go = $1('#vtGo'), warn = $1('#vtLockWarn');
        const pw = $1('#vtPw').value, pw2 = $1('#vtPw2').value;
        if (!pw) { warn.textContent = 'Type the passphrase.'; warn.hidden = false; return; }
        const wasSetup = !hasVault;
        busy = true; go.disabled = true; warn.hidden = true;
        const label = go.querySelector('span');
        if (label) label.textContent = wasSetup ? 'Encrypting...' : 'Unlocking...';
        try {
            if (wasSetup) await setup(pw, pw2); else await unlock(pw);
            $1('#vtPw').value = ''; $1('#vtPw2').value = '';
            busy = false;
            render();
            host.onAiChange(aiOn());
            host.notice(wasSetup ? 'Vault encrypted' : 'Vault unlocked');
        } catch (e) {
            busy = false;
            warn.textContent = e && e.message || String(e);
            warn.hidden = false;
            $1('#vtPw').value = '';
            paintLock(true);
        }
        busy = false;
        go.disabled = false;
    }

    function paintLock(keepWarn) {
        const setupMode = !hasVault;
        $1('#vtLock .vt-title').lastChild.textContent = setupMode ? ' Encrypt the Vault' : ' Vault locked';
        $1('#vtLockMsg').textContent = setupMode
            ? (legacy.length ? `${legacy.length} item${legacy.length === 1 ? '' : 's'} saved without encryption` : 'Choose a passphrase to start')
            : 'Enter your passphrase to open it';
        $1('#vtPw2L').hidden = !setupMode;
        $1('#vtPw2').hidden = !setupMode;
        $1('#vtPwL').textContent = setupMode ? 'New passphrase' : 'Passphrase';
        const go = $1('#vtGo');
        go.replaceChildren(host.icon(setupMode ? 'i-shield' : 'i-key'), Object.assign(document.createElement('span'), { textContent: setupMode ? 'Encrypt the Vault' : 'Unlock' }));
        go.disabled = false;
        $1('#vtLockHint').textContent = setupMode
            ? `Your items are encrypted with AES-256-GCM and the passphrase is never stored. There is no recovery: if you forget it, the Vault can only be erased. Use at least ${MIN_PASS} characters, four random words is better.` +
              (legacy.length ? ' The old unencrypted copy is deleted once the encrypted one is written and checked.' : '')
            : 'Wrong tries are slowed down after the third miss.';
        const er = $1('#vtErase');
        er.hidden = setupMode;
        er.textContent = 'Forgot it? Erase the Vault';
        er.classList.remove('danger');
        if (!keepWarn) $1('#vtLockWarn').hidden = true;
    }

    function makeSwitch() {
        const sw = document.createElement('button');
        sw.type = 'button';
        sw.className = 'sw';
        sw.setAttribute('role', 'switch');
        sw.setAttribute('aria-label', 'AI can write Vault notes');
        sw.addEventListener('click', e => { e.stopPropagation(); setAi(!aiOn()); host.notice(`AI Vault notes ${aiOn() ? 'on' : 'off'}`); });
        aiSwitches.push(sw);
        return sw;
    }
    function paintAi() {
        const on = aiOn();
        aiSwitches.forEach(sw => { sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); });
        document.querySelectorAll('[data-vault-perm]').forEach(r => {
            r.classList.toggle('is-on', on);
            r.classList.toggle('is-off', !on);
            const n = r.querySelector('.perm-note');
            if (n) n.textContent = on ? 'On. The AI can file notes in the Vault (while it is unlocked)' : 'Off. The AI cannot write to the Vault';
        });
    }

    function openForm(id, pre) {
        if (!cryptoKey) return;
        editId = id || '';
        const f = $1('#vtForm');
        const it = id ? items.find(x => x.id === id) : null;
        $1('#vtType').value = it ? it.type : (pre && pre.type) ? pre.type : (filter !== 'all' ? filter : 'ai');
        $1('#vtType').disabled = !!it;
        syncForm();
        if (it) { if (it.svc) $1('#vtSvc').value = it.svc; $1('#vtTitle').value = it.title; $1('#vtVal').value = it.value; }
        else if (pre) { if (pre.svc) $1('#vtSvc').value = pre.svc; $1('#vtTitle').value = pre.title || ''; $1('#vtVal').value = pre.value || ''; }
        else { $1('#vtTitle').value = ''; $1('#vtVal').value = ''; }
        $1('#vtWarn').hidden = true;
        f.hidden = false;
        f.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    function closeForm() { $1('#vtForm').hidden = true; $1('#vtVal').value = ''; editId = ''; }
    function syncForm() {
        const t = typeOf($1('#vtType').value);
        const sel = $1('#vtSvc');
        const showSvc = !!t.svc;
        $1('#vtSvcL').hidden = !showSvc;
        sel.hidden = !showSvc;
        if (showSvc) {
            const list = t.svc === 'ai' ? host.providers : host.webs;
            const keep = sel.value;
            sel.replaceChildren();
            list.forEach(x => sel.appendChild(Object.assign(document.createElement('option'), { value: x.id, textContent: x.name })));
            if (keep && list.some(x => x.id === keep)) sel.value = keep;
        }
        $1('#vtValL').textContent = t.valLabel;
        $1('#vtVal').placeholder = t.ph;
        $1('#vtVal').rows = t.id === 'ssh' || t.id === 'note' ? 7 : 3;
        $1('#vtTitle').placeholder = t.id === 'link' ? 'Optional (defaults to the site name)' : 'Optional';
    }
    function saveForm() {
        if (!cryptoKey) return;
        const t = typeOf($1('#vtType').value);
        let value = $1('#vtVal').value.trim();
        const warn = msg => { const w = $1('#vtWarn'); w.textContent = msg; w.hidden = false; };
        if (!value) return warn('Nothing to save yet. Fill in the value.');
        if (t.id === 'link') {
            if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = 'https://' + value;
            if (!host.safeUrl(value)) return warn('That is not a web link (http or https).');
        }
        if (t.secret && /^["']|["']$/.test(value) && t.svc) value = value.replace(/^["']+|["']+$/g, '');
        const svc = t.svc ? $1('#vtSvc').value : '';
        const wasEdit = !!editId;
        let saved = null;
        if (editId) {
            const it = items.find(x => x.id === editId);
            if (it) {
                it.value = value.slice(0, MAX_VALUE);
                it.title = $1('#vtTitle').value.trim().slice(0, 90) || it.title;
                if (svc) it.svc = svc;
                saved = it;
                save();
            }
        } else {
            saved = add({ type: t.id, title: $1('#vtTitle').value, value, svc });
        }
        closeForm();
        render();
        // V1.99.115: the same key under another title is still the same key. Tell the user; they decide which copy to remove.
        const twin = dupOf(saved);
        host.notice(twin ? (wasEdit ? 'Updated' : 'Saved') + ', but this key is already in the Vault as "' + twin.title + '". Remove one copy.' : (wasEdit ? 'Updated in the Vault' : 'Saved to the Vault'));
    }

    function render() {
        if (!root) return;
        const locked = isLocked();
        $1('#vtLock').hidden = !locked;
        $1('#vtMain').hidden = locked;
        if (locked) { $1('#vtList').replaceChildren(); $1('#vtFilters').replaceChildren(); { const xp = $1('#vtExportPanel'); if (xp) { xp.hidden = true; xp.replaceChildren(); } EXP.armed = false; EXP.msg = ''; } paintLock(); return; }

        const status = $1('#vtStatus');
        const nBad = items.filter(isBadItem).length;
        status.textContent = (items.length ? `${items.length} item${items.length === 1 ? '' : 's'} saved` : 'Empty') + ' · encrypted' + (nBad ? ` · ${nBad} BAD key${nBad === 1 ? '' : 's'}` : '');

        renderKeys();

        const fil = $1('#vtFilters');
        fil.replaceChildren();
        const mk = (id, label, n) => {
            const b = h('button', 'vt-f' + (filter === id ? ' on' : ''));
            b.type = 'button';
            b.textContent = n != null ? `${label} ${n}` : label;
            b.addEventListener('click', () => { filter = id; render(); });
            fil.appendChild(b);
        };
        mk('all', 'All', items.length);
        TYPES.forEach(t => mk(t.id, t.plural, items.filter(i => i.type === t.id).length));
        if (nBad) {
            const bb = h('button', 'vt-f bad' + (filter === 'bad' ? ' on' : ''));
            bb.type = 'button'; bb.textContent = `Bad ${nBad}`;
            bb.addEventListener('click', () => { filter = filter === 'bad' ? 'all' : 'bad'; render(); });
            fil.appendChild(bb);
        } else if (filter === 'bad') filter = 'all';

        const list = $1('#vtList');
        list.replaceChildren();
        const shown = items.filter(i => filter === 'all' || (filter === 'bad' ? isBadItem(i) : i.type === filter));
        if (!shown.length) {
            list.appendChild(h('div', 'vt-empty', items.length ? 'Nothing of this type yet. Tap Add.' : 'The Vault is empty. Tap <b>Add</b> to store a key, note, SSH key, token or link.'));
            return;
        }
        shown.forEach(it => {
            const el = itemEl(it);
            const twin = dupOf(it);
            if (twin) { const w = h('div', 'vt-warn'); w.textContent = 'Duplicate: the same key is also saved as "' + twin.title + '". Remove one copy.'; el.appendChild(w); }
            list.appendChild(el);
        });
    }

    // ---------- Key health (V1.99.116) ----------
    const KH = () => window.HorizonKeyHealth || null;
    function healthOfValue(v) { const k = KH(); const key = normKey(v); return k && key.length >= 8 ? k.getByValue(key) : null; }
    function healthOf(it) { return it && (it.type === 'ai' || it.type === 'scrape') ? healthOfValue(it.value) : null; }
    function isBadItem(it) { const r = healthOf(it); return !!r && r.s === 'bad'; }
    function healthText(r) { return (r.s === 'bad' ? 'Rejected' : 'Limited') + (r.n ? ' by ' + r.n : '') + (r.h ? ' (HTTP ' + r.h + ')' : '') + ' ' + (KH() ? KH().ago(r.t) : ''); }

    // ---------- Keys in Horizon (V1.93.39) ----------
    function keyRows() {
        let rows = [];
        try { rows = host.listKeys() || []; } catch (e) { rows = []; }
        return rows.map((r, i) => {
            const named = items.find(x => x.type === r.kind && x.value === r.key);
            return { r, named, rid: 'k:' + r.kind + ':' + r.id + ':' + r.slot + ':' + r.key.slice(-6) };
        });
    }
    function renderKeys() {
        const card = $1('#vtKeys');
        if (!card) return;
        card.replaceChildren();
        const rows = keyRows();
        const unnamed = rows.filter(x => !x.named).length;
        const head = h('div', 'settings-row-header');
        const hc = h('div', 'settings-row-content');
        const t = h('h3', 'vt-title');
        t.append(host.icon('i-key'), document.createTextNode(' Keys in Horizon'));
        const p = h('p');
        p.textContent = rows.length
            ? `${rows.length} key${rows.length === 1 ? '' : 's'} saved · ${rows.length - unnamed} named · ${unnamed} not named` + (rows.filter(x => { const q = healthOfValue(x.r.key); return q && q.s === 'bad'; }).length ? ` · ${rows.filter(x => { const q = healthOfValue(x.r.key); return q && q.s === 'bad'; }).length} BAD` : '')
            : 'No API keys saved in the app yet';
        hc.append(t, p);
        head.appendChild(hc);
        const tg = h('button', 'use-btn');
        tg.type = 'button';
        tg.textContent = keysOpen ? 'Hide' : 'Show';
        tg.addEventListener('click', () => { keysOpen = !keysOpen; renderKeys(); });
        head.appendChild(tg);
        card.appendChild(head);
        if (!keysOpen) return;
        card.appendChild(h('p', 'hint', 'Every API key you added to a provider card, main and backup, so you can remember which ones you have. Values stay on this page: the AI never reads them. <b>Name it</b> files a key in the Vault under a title you choose.'));
        if (unnamed) {
            const f = h('div', 'vt-acts');
            const b = h('button', 'vt-act' + (keysOnlyUnnamed ? ' pri' : ''));
            b.type = 'button';
            b.textContent = keysOnlyUnnamed ? 'Showing not named only' : `Only not named (${unnamed})`;
            b.addEventListener('click', () => { keysOnlyUnnamed = !keysOnlyUnnamed; renderKeys(); });
            f.appendChild(b);
            card.appendChild(f);
        } else keysOnlyUnnamed = false;
        const shown = rows.filter(x => !keysOnlyUnnamed || !x.named);
        shown.forEach(({ r, named, rid }) => {
            const hr = healthOfValue(r.key);
            const el = h('div', 'vt-krow' + (hr && hr.s === 'bad' ? ' is-bad' : ''));
            const tx = h('div', 'vt-tx');
            const b = document.createElement('b');
            b.textContent = r.name + (r.slot === 'backup' ? ' · backup' : ' · main');
            const sm = document.createElement('small');
            sm.textContent = revealed.has(rid) ? r.key : mask(r.key);
            sm.className = 'vt-kval';
            tx.append(b, sm);
            el.appendChild(tx);
            if (hr) el.appendChild(h('span', 'vt-badge ' + (hr.s === 'bad' ? 'bad' : 'warn'), hr.s === 'bad' ? 'BAD KEY' : 'LIMITED'));
            el.appendChild(h('span', 'vt-badge' + (named ? '' : ' ai'), named ? 'NAMED' : 'NOT NAMED'));
            card.appendChild(el);
            const sub = h('div', 'vt-acts vt-kacts');
            const act = (label, fn, cls) => {
                const x = h('button', 'vt-act' + (cls ? ' ' + cls : ''));
                x.type = 'button'; x.textContent = label;
                x.addEventListener('click', e => { e.stopPropagation(); fn(); });
                sub.appendChild(x);
            };
            if (hr) { const bl = document.createElement('small'); bl.className = 'vt-kname vt-badline'; bl.textContent = healthText(hr) + (hr.s === 'bad' ? '. Remove it from the provider card.' : ''); sub.appendChild(bl); }
            if (named) { const nm = document.createElement('small'); nm.className = 'vt-kname'; nm.textContent = 'In the Vault as: ' + named.title; sub.appendChild(nm); }
            else act('Name it', () => openForm('', { type: r.kind, svc: r.id, value: r.key, title: r.name + (r.slot === 'backup' ? ' backup' : ' key') }), 'pri');
            act(revealed.has(rid) ? 'Hide' : 'Show', () => { if (revealed.has(rid)) revealed.delete(rid); else revealed.add(rid); renderKeys(); });
            act('Copy', () => copyText(r.key));
            card.appendChild(sub);
        });
        if (!shown.length && rows.length) card.appendChild(h('div', 'vt-empty', 'Every saved key is named.'));
    }

    // ---------- Detect keys (V1.99.115) ----------
    // Reads the Vault AI keys, finds the same key stored twice (whatever the title) and keys that are not in their provider card yet,
    // shows exactly what it will do, then files them through the same verified path as Paste & extract. Nothing is deleted; the Vault copy stays.
    const normKey = v => String(v || '').trim().replace(/^["']+|["',;]+$/g, '');
    const keyShaped = k => /^[A-Za-z0-9_.\-:+\/=~]{16,}$/.test(k);
    const svcLabel = id => (host.providers.find(p => p.id === id) || { name: id }).name;
    function dupOf(it) {
        if (!it || (it.type !== 'ai' && it.type !== 'scrape')) return null;
        const k = normKey(it.value);
        if (k.length < 8) return null;
        return items.find(x => x.id !== it.id && x.type === it.type && normKey(x.value) === k) || null;
    }
    function dupGroups() {
        const m = new Map();
        items.forEach(it => {
            if (it.type !== 'ai' && it.type !== 'scrape') return;
            const k = normKey(it.value);
            if (k.length < 8) return;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(it);
        });
        return Array.from(m.entries()).filter(e => e[1].length > 1).map(e => ({ key: e[0], list: e[1] }));
    }
    function appRows() { try { return host.listKeys() || []; } catch (e) { return []; } }
    function detectPlan() {
        const app = appRows();
        const inApp = (id, key) => app.some(r => r.kind === 'ai' && r.id === id && r.key === key);
        const hasMain = id => app.some(r => r.kind === 'ai' && r.id === id && r.slot === 'main');
        const known = new Set(host.providers.map(p => p.id));
        const svcOf = s => /^hzworker[23]$/.test(s) ? 'hzworker' : s;   // V1.99.157: Horizon Worker 2 and 3 are now the one Horizon Worker (extra links land in its backup slots)
        const seen = new Set(), move = [], already = [], skipped = [];
        const landing = {};
        items.slice().reverse().forEach(it => {   // oldest first, so the oldest copy is the one kept when a key is stored twice
            if (it.type !== 'ai' || !it.svc) return;
            const svc = svcOf(it.svc);
            const key = normKey(it.value);
            if (!known.has(svc)) { skipped.push({ it, why: 'that provider is not in Horizon' }); return; }
            if (!keyShaped(key)) { skipped.push({ it, why: 'the value is not a single key' }); return; }
            const sig = svc + '\n' + key;
            if (seen.has(sig)) return;
            seen.add(sig);
            if (inApp(svc, key)) { already.push({ it, key }); return; }
            const lands = (hasMain(svc) || landing[svc]) ? 'backup slot' : 'main key (none is set yet)';
            landing[svc] = true;
            move.push({ it, svc, key, lands });
        });
        return { move, already, skipped, dups: dupGroups() };
    }
    let detecting = false;
    function openDetect() {
        const p = $1('#vtDetectPanel');
        if (!p || !cryptoKey) return;
        p.hidden = false;
        paintDetect(null);
        try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* older WebView */ }
    }
    function paintDetect(results) {
        const p = $1('#vtDetectPanel');
        if (!p) return;
        p.replaceChildren();
        const plan = detectPlan();
        const say = (cls, txt) => { const d = h('p', cls); d.textContent = txt; p.appendChild(d); return d; };
        const t = h('h3', 'vt-title');
        t.append(host.icon('i-key'), document.createTextNode(' Detect keys'));
        p.appendChild(t);
        if (results) {
            const ok = results.filter(r => r.ok).length, bad = results.length - ok;
            say('hint', ok + ' key' + (ok === 1 ? '' : 's') + ' saved to the provider cards' + (bad ? ', ' + bad + ' not saved' : '') + '. The Vault copies are untouched.');
            results.forEach(r => {
                const row = h('div', 'vt-krow');
                const tx = h('div', 'vt-tx');
                const b = document.createElement('b');
                b.textContent = (r.ok ? 'Saved: ' : 'Not saved: ') + r.name + ' ' + mask(r.key);
                const sm = document.createElement('small');
                sm.textContent = r.msg;
                tx.append(b, sm);
                row.appendChild(tx);
                row.appendChild(h('span', 'vt-badge' + (r.ok ? '' : ' ai'), r.ok ? 'DONE' : 'FAILED'));
                p.appendChild(row);
            });
        }
        // 1. the same key stored more than once
        if (plan.dups.length) {
            const w = say('vt-warn', plan.dups.length + ' key' + (plan.dups.length === 1 ? ' is' : 's are') + ' stored more than once, even under different titles. Remove the extra copy yourself:');
            plan.dups.forEach(g => say('hint', mask(g.key) + ' is saved as: ' + g.list.map(x => '"' + x.title + '"').join(', ')));
        } else say('hint', 'No key is stored twice in the Vault.');
        // 2. keys not yet in their provider card
        if (plan.move.length) {
            say('hint', 'These Vault keys are not in their provider card yet. Each is checked with its provider first; only keys that pass are saved.');
            plan.move.forEach(m => {
                const row = h('div', 'vt-krow');
                const tx = h('div', 'vt-tx');
                const b = document.createElement('b');
                b.textContent = svcLabel(m.svc) + ' ' + mask(m.key);
                const sm = document.createElement('small');
                sm.textContent = 'From "' + m.it.title + '" → ' + m.lands;
                tx.append(b, sm);
                row.appendChild(tx);
                p.appendChild(row);
            });
        } else if (!results) say('hint', 'Nothing to move' + (plan.already.length ? ': ' + plan.already.length + ' Vault key' + (plan.already.length === 1 ? ' is' : 's are') + ' already in the provider cards.' : '. Add AI keys to the Vault first.'));
        if (plan.skipped.length) say('hint', 'Skipped ' + plan.skipped.length + ': ' + plan.skipped.map(x => '"' + x.it.title + '" (' + x.why + ')').join('; '));
        const acts = h('div', 'card-actions');
        if (plan.move.length) {
            const go = h('button', 'primary-btn');
            go.type = 'button';
            go.textContent = detecting ? 'Saving...' : 'Move ' + plan.move.length + ' key' + (plan.move.length === 1 ? '' : 's') + ' to the provider cards';
            go.disabled = detecting;
            go.addEventListener('click', runDetect);
            acts.appendChild(go);
        }
        const close = h('button', 'use-btn');
        close.type = 'button';
        close.textContent = 'Close';
        close.addEventListener('click', () => { p.hidden = true; });
        acts.appendChild(close);
        p.appendChild(acts);
    }
    async function runDetect() {
        if (detecting || !cryptoKey) return;
        detecting = true;
        paintDetect(null);
        const plan = detectPlan();
        const results = [];
        for (const m of plan.move) {
            try {
                if (typeof host.addAiKey !== 'function') throw new Error('This build cannot save keys to provider cards');
                const msg = await host.addAiKey(m.svc, m.key);
                const row = appRows().find(r => r.kind === 'ai' && r.id === m.svc && r.key === m.key);
                results.push({ ok: !!row, name: svcLabel(m.svc), key: m.key, msg: row ? (row.slot === 'main' ? 'Saved as the main key (' + String(msg || 'verified') + ')' : 'Saved in the backup slot (' + String(msg || 'verified') + ')') : 'The provider card did not keep it' });
            } catch (e) {
                results.push({ ok: false, name: svcLabel(m.svc), key: m.key, msg: String((e && e.message) || e || 'Failed') });
            }
        }
        detecting = false;
        renderKeys();
        paintDetect(results);
        const ok = results.filter(r => r.ok).length, bad = results.length - ok;
        host.notice('Detect: ' + ok + ' key' + (ok === 1 ? '' : 's') + ' saved to provider cards' + (bad ? ', ' + bad + ' failed' : ''));
    }

    // ---------- Export (V1.99.116) ----------
    // Builds one file from the unlocked Vault (and, if ticked, the keys in the provider cards). Plain text by design: it is for your own backup.
    function plug(n) { try { const C = window.Capacitor; return (C && C.Plugins && C.Plugins[n]) || null; } catch (e) { return null; } }
    function isNative() { try { return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()); } catch (e) { return false; } }
    function utf8b64(t) { return btoa(unescape(encodeURIComponent(t))); }
    async function saveFile(name, text, mime) {
        return window.HorizonOutputs.saveBlob(new Blob([text], {type:mime}), name);
    }
    const pad2 = n => String(n).padStart(2, '0');
    function stamp(d) { return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()); }
    function isoLocal(ts) { try { return new Date(ts).toISOString(); } catch (e) { return ''; } }
    function healthObj(v) { const r = healthOfValue(v); return r ? { status: r.s === 'bad' ? 'BAD' : 'LIMITED', message: r.m || '', http: r.h || 0, flagged: isoLocal(r.t) } : null; }
    function exportSets() {
        const want = EXP.scope;
        const own = items.filter(it => want === 'all' || (want === 'notes' ? it.type === 'note' : it.type !== 'note' && it.type !== 'link'));
        let app = [];
        if (EXP.app && want !== 'notes') { try { app = host.listKeys() || []; } catch (e) { app = []; } }
        return { own, app };
    }
    function envName(it, used) {
        let base = it.svc ? String(it.svc).toUpperCase().replace(/[^A-Z0-9]+/g, '_') + (it.type === 'token' ? '_TOKEN' : '_API_KEY') : String(it.title || it.type).toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'KEY';
        if (/^[0-9]/.test(base)) base = 'K_' + base;
        let n = base, i = 1;
        while (used.has(n)) { i++; n = base + '_' + i; }
        used.add(n);
        return n;
    }
    function buildExport() {
        const now = new Date();
        const { own, app } = exportSets();
        const base = 'horizon-vault-' + (EXP.scope === 'all' ? 'everything' : EXP.scope) + '-' + stamp(now);
        const counts = {}; own.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
        if (EXP.fmt === 'json') {
            const doc = {
                app: 'Horizon', export: 'Vault', version: 'V1.99.116', exportedAt: now.toISOString(), scope: EXP.scope,
                counts: Object.assign({ horizonKeys: app.length }, counts),
                vault: own.map(it => {
                    const o = { type: it.type, title: it.title, value: it.value, created: isoLocal(it.t) };
                    if (it.svc) o.service = it.svc;
                    if (it.by) o.by = it.by;
                    const hh = healthOf(it) && healthObj(it.value); if (hh) o.health = hh;
                    return o;
                }),
                horizonKeys: app.map(r => { const o = { kind: r.kind, provider: r.id, name: r.name, slot: r.slot, key: r.key }; const hh = healthObj(r.key); if (hh) o.health = hh; return o; })
            };
            return { name: base + '.json', mime: 'application/json', text: JSON.stringify(doc, null, 2) + '\n', n: own.length + app.length };
        }
        if (EXP.fmt === 'env') {
            const used = new Set(), seen = new Set(), out = ['# Horizon Vault keys · exported ' + now.toISOString(), '# Plain text. Keep this file private.', ''];
            let skipped = 0, n = 0;
            const line = (nameFn, val, hh) => {
                if (seen.has(val)) return;
                seen.add(val);
                const name = nameFn();
                if (hh) out.push('# ' + hh.status + ' key' + (hh.http ? ' (HTTP ' + hh.http + ')' : '') + ': ' + (hh.message || 'rejected by the provider').replace(/\s+/g, ' ').slice(0, 140));
                out.push(name + '=' + JSON.stringify(String(val)));
                n++;
            };
            own.forEach(it => {
                if (it.type === 'ssh' || /[\r\n]/.test(String(it.value).trim())) { skipped++; return; }
                line(() => envName(it, used), String(it.value).trim(), healthOf(it) && healthObj(it.value));
            });
            app.forEach(r => line(() => envName({ svc: r.id, type: r.kind === 'scrape' ? 'scrape' : 'ai', title: r.name }, used), String(r.key).trim(), healthObj(r.key)));
            if (skipped) out.push('', '# ' + skipped + ' multi-line item' + (skipped === 1 ? '' : 's') + ' (SSH keys) left out of .env. Use JSON or Text for those.');
            return { name: base + '.env.txt', mime: 'text/plain', text: out.join('\n') + '\n', n };
        }
        const L = ['HORIZON VAULT EXPORT', 'Exported: ' + now.toString(), 'Scope: ' + (EXP.scope === 'all' ? 'Everything' : EXP.scope === 'notes' ? 'Notes only' : 'Keys only'), 'Plain text. Keep this file private.', ''];
        TYPES.forEach(T => {
            const list = own.filter(i => i.type === T.id);
            if (!list.length) return;
            L.push('==== ' + T.plural.toUpperCase() + ' (' + list.length + ') ====', '');
            list.forEach(it => {
                L.push('# ' + it.title, '  Saved: ' + isoLocal(it.t) + (svcName(it) ? ' · ' + svcName(it) : '') + (it.by === 'ai' ? ' · filed by AI' : ''));
                const hh = healthOf(it) && healthObj(it.value);
                if (hh) L.push('  *** ' + hh.status + ' KEY' + (hh.http ? ' (HTTP ' + hh.http + ')' : '') + ' ***');
                L.push(String(it.value), '');
            });
        });
        if (app.length) {
            L.push('==== KEYS IN HORIZON PROVIDER CARDS (' + app.length + ') ====', '');
            app.forEach(r => {
                const hh = healthObj(r.key);
                L.push('# ' + r.name + ' · ' + r.slot + (hh ? '  *** ' + hh.status + ' KEY' + (hh.http ? ' (HTTP ' + hh.http + ')' : '') + ' ***' : ''), String(r.key), '');
            });
        }
        return { name: base + '.txt', mime: 'text/plain', text: L.join('\n'), n: own.length + app.length };
    }
    function openExport() {
        const p = $1('#vtExportPanel');
        if (!p || !cryptoKey) return;
        EXP.armed = false; EXP.msg = '';
        p.hidden = false;
        paintExport();
        try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) { /* older WebView */ }
    }
    function paintExport() {
        const p = $1('#vtExportPanel');
        if (!p) return;
        p.replaceChildren();
        const t = h('h3', 'vt-title');
        t.append(host.icon('i-note'), document.createTextNode(' Export'));
        p.appendChild(t);
        p.appendChild(h('p', 'hint', 'Saves what is in the Vault as a file on this phone. It is <b>plain text</b>: anyone who gets the file can read your keys. Keep it private and delete it when you are done.'));
        const group = (label, name, opts) => {
            p.appendChild(h('label', 'field-label', label));
            opts.forEach(o => {
                const row = h('label', 'vt-opt');
                const inp = document.createElement('input');
                inp.type = 'radio'; inp.name = 'vtx-' + name; inp.checked = EXP[name] === o.v;
                inp.addEventListener('change', () => { EXP[name] = o.v; EXP.armed = false; EXP.msg = ''; paintExport(); });
                const sp = document.createElement('span'); sp.textContent = o.t;
                const sm = document.createElement('small'); sm.textContent = o.s; sp.appendChild(sm);
                row.append(inp, sp);
                p.appendChild(row);
            });
        };
        group('What to export', 'scope', [
            { v: 'all', t: 'Everything', s: 'Notes, AI keys, scraping keys, SSH keys, tokens and links' },
            { v: 'notes', t: 'Notes only', s: 'Just your notes' },
            { v: 'keys', t: 'Keys only', s: 'AI keys, scraping keys, SSH keys and tokens' }
        ]);
        group('Format', 'fmt', [
            { v: 'json', t: 'JSON', s: 'Everything with titles, dates and key health. Best for a full backup' },
            { v: 'txt', t: 'Readable text', s: 'One file you can open and read anywhere' },
            { v: 'env', t: '.env lines', s: 'NAME="key" lines for scripts. Keys only; SSH keys are left out' }
        ]);
        const row = h('label', 'vt-opt');
        const cb = document.createElement('input');
        cb.type = 'checkbox'; cb.checked = EXP.app; cb.disabled = EXP.scope === 'notes';
        cb.addEventListener('change', () => { EXP.app = cb.checked; EXP.armed = false; EXP.msg = ''; paintExport(); });
        const sp = document.createElement('span'); sp.textContent = 'Include the keys saved in the provider cards';
        const sm = document.createElement('small'); sm.textContent = 'Main and backup keys, AI and scraping, with BAD flags';
        sp.appendChild(sm); row.append(cb, sp); p.appendChild(row);
        let b = { n: 0 };
        try { b = buildExport(); } catch (e) { b = { n: 0 }; }
        p.appendChild(h('p', 'vt-out', b.n ? 'Will export ' + b.n + ' item' + (b.n === 1 ? '' : 's') + (b.name ? ' as ' + b.name : '') + '.' : 'Nothing to export with these choices.'));
        if (EXP.msg) p.appendChild(h('p', 'vt-out', '')).textContent = EXP.msg;
        const acts = h('div', 'card-actions');
        const go = h('button', 'primary-btn');
        go.type = 'button';
        go.textContent = EXP.armed ? 'Tap again to save the file' : 'Save file';
        go.disabled = !b.n;
        go.addEventListener('click', async () => {
            if (!cryptoKey) return;
            if (!EXP.armed) { EXP.armed = true; paintExport(); setTimeout(() => { if (EXP.armed) { EXP.armed = false; if (!$1('#vtExportPanel').hidden) paintExport(); } }, 5000); return; }
            EXP.armed = false;
            go.disabled = true; go.textContent = 'Saving...';
            try {
                const f = buildExport();
                const where = await saveFile(f.name, f.text, f.mime);
                EXP.msg = 'Saved: ' + where;
                host.notice('Vault exported: ' + where);
            } catch (e) { EXP.msg = 'Could not save: ' + String((e && e.message) || e); host.notice('Vault export failed: ' + String((e && e.message) || e), 'error'); }
            touch(); paintExport();
        });
        acts.appendChild(go);
        const cp = h('button', 'use-btn');
        cp.type = 'button'; cp.textContent = 'Copy'; cp.disabled = !b.n;
        cp.addEventListener('click', () => { try { copyText(buildExport().text); } catch (e) { host.notice('Could not copy', 'error'); } });
        acts.appendChild(cp);
        const close = h('button', 'use-btn');
        close.type = 'button'; close.textContent = 'Close';
        close.addEventListener('click', () => { EXP.armed = false; EXP.msg = ''; p.hidden = true; });
        acts.appendChild(close);
        p.appendChild(acts);
    }

    function itemEl(it) {
        const T = typeOf(it.type);
        const hlt = healthOf(it);
        const el = h('div', 'vt-item' + (hlt && hlt.s === 'bad' ? ' is-bad' : ''));
        el.dataset.id = it.id;
        const head = h('div', 'vt-head');
        const ic = h('span', 'vt-ic');
        if (it.type === 'link' && host.safeUrl(it.value)) ic.innerHTML = host.favHTML(it.value);
        else ic.appendChild(host.icon(T.ic));
        const tx = h('div', 'vt-tx');
        const b = document.createElement('b'); b.textContent = it.title;
        const meta = [T.label, svcName(it), ago(it.t)].filter(Boolean);
        const sm = document.createElement('small'); sm.textContent = meta.join(' · ');
        tx.append(b, sm);
        head.append(ic, tx);

        let inUse = false;
        if (it.type === 'ai' && it.svc) inUse = !!it.value && host.currentAiKey(it.svc) === it.value;
        if (it.type === 'scrape' && it.svc) inUse = !!it.value && host.currentWebKey(it.svc) === it.value;
        if (inUse) head.appendChild(h('span', 'vt-badge', 'IN USE'));
        else if (it.by === 'ai') head.appendChild(h('span', 'vt-badge ai', 'BY AI'));
        if (hlt) head.appendChild(h('span', 'vt-badge ' + (hlt.s === 'bad' ? 'bad' : 'warn'), hlt.s === 'bad' ? 'BAD KEY' : 'LIMITED'));
        el.appendChild(head);
        if (hlt) { const bl = h('div', 'vt-badline'); bl.textContent = healthText(hlt) + (hlt.s === 'bad' ? '. Delete this item when you are ready.' : '. It usually recovers.'); el.appendChild(bl); }

        if (T.secret) {
            const v = h('div', 'vt-val');
            v.textContent = revealed.has(it.id) ? it.value : (it.type === 'ssh' ? '•••••• hidden, tap Show' : mask(it.value));
            el.appendChild(v);
        } else if (it.type === 'link') {
            const u = host.safeUrl(it.value);
            const a = h('a', 'vt-link');
            a.textContent = it.value;
            if (u) { a.href = u; a.target = '_blank'; a.rel = 'noopener noreferrer'; }
            el.appendChild(a);
        } else {
            const n = h('div', 'vt-note' + (openNotes.has(it.id) ? ' open' : ''));
            n.textContent = it.value;
            n.addEventListener('click', () => { if (openNotes.has(it.id)) openNotes.delete(it.id); else openNotes.add(it.id); n.classList.toggle('open'); });
            el.appendChild(n);
        }

        const acts = h('div', 'vt-acts');
        const act = (label, fn, cls) => {
            const x = h('button', 'vt-act' + (cls ? ' ' + cls : ''));
            x.type = 'button'; x.textContent = label;
            x.addEventListener('click', e => { e.stopPropagation(); fn(x); });
            acts.appendChild(x);
        };
        if ((it.type === 'ai' || it.type === 'scrape') && it.svc && !inUse) {
            act('Use', async x => {
                x.disabled = true; x.textContent = 'Checking...';
                try { if (it.type === 'ai') await host.useAiKey(it.svc, it.value); else await host.useWebKey(it.svc, it.value); } catch (e) { host.notice('Could not use that key: ' + (e && e.message || e), 'error'); }
                render();
            }, 'pri');
        }
        if (T.secret) act(revealed.has(it.id) ? 'Hide' : 'Show', () => { if (revealed.has(it.id)) revealed.delete(it.id); else revealed.add(it.id); render(); });
        act('Copy', () => copyText(it.value));
        if (it.type === 'link' && host.safeUrl(it.value)) act('Open', () => window.open(host.safeUrl(it.value), '_blank', 'noopener'));
        act('Edit', () => openForm(it.id));
        act('Delete', x => {
            if (delTimers[it.id]) {
                clearTimeout(delTimers[it.id]); delete delTimers[it.id];
                items = items.filter(z => z.id !== it.id);
                revealed.delete(it.id); openNotes.delete(it.id);
                save(); render();
                return;
            }
            x.textContent = 'Tap again';
            x.classList.add('danger');
            delTimers[it.id] = setTimeout(() => { delete delTimers[it.id]; render(); }, 3000);
        }, 'del');
        el.appendChild(acts);
        return el;
    }

    // The same switch as a row under PERMISSIONS
    function buildPermRow(into) {
        return;   // the AI-notes switch row is gone
        if (!into) return;
        const row = h('div', 'perm-row is-off');
        row.setAttribute('data-vault-perm', '1');
        const head = h('div', 'perm-head');
        const ic = h('div', 'perm-ic'); ic.appendChild(host.icon('i-vault'));
        const txt = h('div', 'perm-text');
        txt.innerHTML = '<h3>Horizon Vault notes</h3><p>Lets the AI file notes (plans, scripts, summaries) in HORIZON VAULT by itself while it is unlocked. It never sees your keys, tokens or SSH keys.</p><p class="perm-note"></p>';
        head.append(ic, txt, makeSwitch());
        head.addEventListener('click', () => setAi(!aiOn()));
        row.appendChild(head);
        into.appendChild(row);
        paintAi();
    }

    function init(opts) {
        host = Object.assign(host, opts || {});
        root = document.getElementById('vaultRoot');
        load();
        if (root) { buildRoot(); render(); }
        buildPermRow(document.getElementById('vaultPermHost'));
        paintAi();
    }

    window.HorizonVault = { init, SRC, block, extract, aiOn, setAi, add, count: () => items.length, refresh: () => render(), lock: () => lock('Vault locked'), isLocked, buildExport };
})();
