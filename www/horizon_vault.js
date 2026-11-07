/* HORIZON · Horizon Vault · V1.12.0
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
 * Public API: window.HorizonVault = { init, SRC, block, extract, aiOn, setAi, add, count, refresh, lock, isLocked }
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
    const SECRET_RE = /(AIza[0-9A-Za-z_-]{20,}|gsk_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;

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
        useAiKey: async () => {}, useWebKey: async () => {}, currentAiKey: () => '', currentWebKey: () => '', onAiChange: () => {}
    };
    let items = [];
    let filter = 'all';
    let editId = '';
    let root = null;
    const revealed = new Set();
    const openNotes = new Set();
    const aiSwitches = [];
    const delTimers = {};

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
    const aiOn = () => host.lsGet(LS_AI) !== '0';
    const canFile = () => aiOn() && !!cryptoKey;
    function setAi(v) { host.lsSet(LS_AI, v ? '1' : '0'); paintAi(); host.onAiChange(!!v); }

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
        const text = String(raw || '').replace(new RegExp(SRC, 'gi'), (m, title, body) => {
            if (canFile() && saved.length < 2 && body && !SECRET_RE.test(title + '\n' + body)) {
                const it = add({ type: 'note', title, value: body, by: 'ai' });
                if (it) saved.push(it.title);
            }
            return '';
        }).replace(/\n{3,}/g, '\n\n').trim();
        return { text, saved };
    }

    function block() {
        if (!aiOn()) {
            return 'HORIZON VAULT NOTES\nSwitched off (PERMISSIONS in the right panel). You cannot file notes. If Fezzy asks you to save something, tell him to switch "AI can write Vault notes" on.';
        }
        if (!cryptoKey) {
            return 'HORIZON VAULT NOTES\nThe Vault is locked (encrypted). You cannot file notes and you cannot see what is in it. If Fezzy asks you to save something, tell him to unlock the Vault in the right panel first.';
        }
        const titles = items.filter(i => i.type === 'note').slice(0, 25).map(i => '- ' + i.title);
        return [
            'HORIZON VAULT NOTES (Fezzy\'s private note stash in the right panel)',
            'When Fezzy asks you to write, plan, outline or save something he will want to keep (a plan, checklist, script, summary, config, snippet), or when you finish a substantial piece he would obviously want filed, add ONE line at the very END of your reply: [[vault.note: Short title | the note text]]. The note text may run over several lines and use Markdown. Max 2 per reply. Do not file small talk or things already in the chat that he did not need kept. Never put keys, tokens, passwords or SSH keys in a note. Tell him in a few words that it is in the Vault. The app strips the tag.',
            titles.length ? 'Notes already in the Vault (do not duplicate):\n' + titles.join('\n') : ''
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
        tools.innerHTML = '<button class="vt-act pri" id="vtLockNow" type="button">Lock now</button><button class="vt-act" id="vtChangeBtn" type="button">Change passphrase</button>';
        intro.appendChild(tools);
        main.appendChild(intro);

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

    function openForm(id) {
        if (!cryptoKey) return;
        editId = id || '';
        const f = $1('#vtForm');
        const it = id ? items.find(x => x.id === id) : null;
        $1('#vtType').value = it ? it.type : (filter !== 'all' ? filter : 'ai');
        $1('#vtType').disabled = !!it;
        syncForm();
        if (it) { if (it.svc) $1('#vtSvc').value = it.svc; $1('#vtTitle').value = it.title; $1('#vtVal').value = it.value; }
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
        if (editId) {
            const it = items.find(x => x.id === editId);
            if (it) {
                it.value = value.slice(0, MAX_VALUE);
                it.title = $1('#vtTitle').value.trim().slice(0, 90) || it.title;
                if (svc) it.svc = svc;
                save();
            }
        } else {
            add({ type: t.id, title: $1('#vtTitle').value, value, svc });
        }
        closeForm();
        render();
        host.notice(wasEdit ? 'Updated in the Vault' : 'Saved to the Vault');
    }

    function render() {
        if (!root) return;
        const locked = isLocked();
        $1('#vtLock').hidden = !locked;
        $1('#vtMain').hidden = locked;
        if (locked) { $1('#vtList').replaceChildren(); $1('#vtFilters').replaceChildren(); paintLock(); return; }

        const status = $1('#vtStatus');
        status.textContent = (items.length ? `${items.length} item${items.length === 1 ? '' : 's'} saved` : 'Empty') + ' · encrypted';

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

        const list = $1('#vtList');
        list.replaceChildren();
        const shown = items.filter(i => filter === 'all' || i.type === filter);
        if (!shown.length) {
            list.appendChild(h('div', 'vt-empty', items.length ? 'Nothing of this type yet. Tap Add.' : 'The Vault is empty. Tap <b>Add</b> to store a key, note, SSH key, token or link.'));
            return;
        }
        shown.forEach(it => list.appendChild(itemEl(it)));
    }

    function itemEl(it) {
        const T = typeOf(it.type);
        const el = h('div', 'vt-item');
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
        el.appendChild(head);

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

    window.HorizonVault = { init, SRC, block, extract, aiOn, setAi, add, count: () => items.length, refresh: () => render(), lock: () => lock('Vault locked'), isLocked };
})();
