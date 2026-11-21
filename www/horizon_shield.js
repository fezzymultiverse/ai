/* Horizon V1.99.171: SHIELD. Settings > SECURITY > Shield. Four guards that run on this phone only. Nothing is sent anywhere.
   1. Secret guard   : before a message goes to an AI provider, looks for API keys, tokens, private keys and "password: ..." lines.
                       You choose: Redact and send, Send anyway, or Cancel.
   2. Link guard     : tapping a link inside a chat checks it first (look-alike letters, IP address, user@host trick, plain http, short links,
                       or link text that names a different site than the address). Risky ones ask before opening.
   3. Privacy cover  : when Horizon goes to the background it is covered at once, so the screen is not readable in the app switcher or over your shoulder.
   4. Clipboard wipe : when you copy something that looks like a key or token, the clipboard is cleared again after the time you pick.
   Honest limit: these are pattern checks. They catch the common shapes, not every possible secret. */
(function () {
    'use strict';
    var K = { secret: 'horizon_shield_secret', link: 'horizon_shield_link', cover: 'horizon_shield_cover', clip: 'horizon_shield_clip', clipSec: 'horizon_shield_clip_sec' };
    var bypass = false, card = null, coverEl = null, clipTimer = 0, covered = false;

    function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
    function on(k) { return rd(k) !== '0'; }
    function clipSec() { var n = Number(rd(K.clipSec)); return n === 30 || n === 60 || n === 120 ? n : 60; }
    function el(tag, cls, t) { var e = document.createElement(tag); if (cls) e.className = cls; if (t != null) e.textContent = t; return e; }

    /* ---------- 1. secret patterns ---------- */
    var PATTERNS = [
        ['private key', /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY(?: BLOCK)?-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY(?: BLOCK)?-----|$)/g],
        ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
        ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/g],
        ['AWS access key', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g],
        ['Groq key', /\bgsk_[A-Za-z0-9]{40,}\b/g],
        ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
        ['Stripe key', /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
        ['API key', /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}\b/g],
        ['JWT', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g],
        ['password or secret', /\b(?:password|passwd|pwd|secret|api[_ -]?key|access[_ -]?token|auth[_ -]?token|token)\b\s*[:=]\s*["']?([^\s"']{8,})/gi]
    ];
    function scan(text) {
        var hits = [], out = String(text || '');
        PATTERNS.forEach(function (p) {
            out = out.replace(p[1], function (m, g1) {
                hits.push(p[0]);
                if (g1) return m.slice(0, m.length - g1.length) + '[REDACTED ' + p[0] + ']';
                return '[REDACTED ' + p[0] + ']';
            });
        });
        return { hits: hits, redacted: out };
    }
    function looksSecret(text) { return scan(text).hits.length > 0; }

    function dialog(title, body, buttons) {
        var back = el('div', 'hzs-back'), box = el('div', 'hzs-box');
        back.setAttribute('role', 'alertdialog'); back.setAttribute('aria-modal', 'true'); back.setAttribute('aria-label', title);
        box.appendChild(el('h3', null, title));
        body.forEach(function (p) { box.appendChild(p); });
        var row = el('div', 'hzs-btns');
        buttons.forEach(function (b) {
            var x = el('button', 'hzs-b ' + (b.cls || ''), b.text); x.type = 'button';
            x.addEventListener('click', function () { back.remove(); b.fn(); });
            row.appendChild(x);
        });
        box.appendChild(row); back.appendChild(box); document.body.appendChild(back);
        var first = row.querySelector('button'); if (first) { try { first.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
    }

    function resend(input) {
        bypass = true;
        var send = document.getElementById('sendBtn');
        try { if (send) send.click(); } finally { setTimeout(function () { bypass = false; }, 0); }
        if (!send && input) input.focus();
    }
    function guardSend(e) {
        if (bypass || !on(K.secret)) return;
        var input = document.getElementById('chatInput');
        if (!input || !input.value) return;
        var r = scan(input.value);
        if (!r.hits.length) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var uniq = r.hits.filter(function (h, i) { return r.hits.indexOf(h) === i; });
        var p = el('p', 'hzs-p', 'This message looks like it holds ' + uniq.join(', ') + '. Whatever you send goes to the AI provider you picked and can be stored in their logs.');
        dialog('Secret in your message', [p], [
            { text: 'Cancel', fn: function () { input.focus(); } },
            { text: 'Send anyway', fn: function () { resend(input); } },
            { text: 'Redact and send', cls: 'go', fn: function () {
                input.value = r.redacted;
                try { input.dispatchEvent(new Event('input', { bubbles: true })); } catch (x) { /* old WebView */ }
                resend(input);
            } }
        ]);
    }
    document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('#sendBtn');
        if (t) guardSend(e);
    }, true);
    document.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter' || e.shiftKey || e.isComposing) return;
        if (!e.target || e.target.id !== 'chatInput') return;
        guardSend(e);
    }, true);

    /* ---------- 2. link guard ---------- */
    var SHORT = /^(?:bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at|tiny\.cc|rb\.gy|t\.ly|lnkd\.in)$/i;
    function baseDomain(h) { var p = String(h).toLowerCase().replace(/^www\./, '').split('.'); return p.length > 2 ? p.slice(-2).join('.') : p.join('.'); }
    function assess(a) {
        var why = [], u;
        try { u = new URL(a.href, location.href); } catch (e) { return why; }
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return why;
        var host = u.hostname;
        if (u.protocol === 'http:') why.push('It is plain http, so anyone on the network can read or change it.');
        if (/xn--/i.test(host)) why.push('The address uses look-alike letters (xn--), a common fake-site trick.');
        if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || /^\[[0-9a-f:]+\]$/i.test(host)) why.push('It points at a raw IP address, not a named site.');
        if (u.username || u.password) why.push('The address hides the real site behind user@host.');
        if (SHORT.test(host)) why.push('It is a short link, so the real destination is hidden.');
        var txt = (a.textContent || '').trim(), m = txt.match(/^(?:https?:\/\/)?((?:[a-z0-9-]+\.)+[a-z]{2,})(?:[\/?#].*)?$/i);
        if (m && baseDomain(m[1]) !== baseDomain(host)) why.push('The link text says ' + m[1] + ' but it opens ' + host + '.');
        return why;
    }
    document.addEventListener('click', function (e) {
        if (!on(K.link) || e.defaultPrevented) return;
        var a = e.target && e.target.closest && e.target.closest('a[href]');
        if (!a || !a.closest('#chatMessages, .message, .markdown, .md')) return;
        if (a.dataset.hzsOk === '1') { a.dataset.hzsOk = ''; return; }
        var why = assess(a);
        if (!why.length) return;
        e.preventDefault(); e.stopImmediatePropagation();
        var body = [el('p', 'hzs-p', a.href.length > 140 ? a.href.slice(0, 140) + '...' : a.href)];
        why.forEach(function (w) { body.push(el('p', 'hzs-p hzs-why', w)); });
        dialog('Check this link', body, [
            { text: 'Cancel', fn: function () { /* stay */ } },
            { text: 'Open anyway', cls: 'go', fn: function () { a.dataset.hzsOk = '1'; a.click(); } }
        ]);
    }, true);

    /* ---------- 3. privacy cover ---------- */
    function showCover() {
        if (covered || !on(K.cover)) return;
        covered = true;
        if (!coverEl) {
            coverEl = el('div', 'hzs-cover'); coverEl.setAttribute('aria-hidden', 'true');
            var m = el('div', 'hzs-mark', 'HORIZON'); coverEl.appendChild(m);
        }
        if (!coverEl.parentNode) document.body.appendChild(coverEl);
    }
    function hideCover() {
        covered = false;
        if (coverEl && coverEl.parentNode) coverEl.remove();
    }
    document.addEventListener('visibilitychange', function () { if (document.hidden) showCover(); else hideCover(); });
    window.addEventListener('pagehide', showCover);
    window.addEventListener('pageshow', hideCover);
    window.addEventListener('blur', function () { if (document.hidden) showCover(); });
    window.addEventListener('focus', hideCover);

    /* ---------- 4. clipboard wipe ---------- */
    function armWipe(text) {
        if (!on(K.clip) || !looksSecret(text)) return;
        clearTimeout(clipTimer);
        clipTimer = setTimeout(function () {
            try {
                if (navigator.clipboard && navigator.clipboard.readText) {
                    navigator.clipboard.readText().then(function (now) {
                        if (now === text) return navigator.clipboard.writeText(' ');
                    }).catch(function () { try { navigator.clipboard.writeText(' '); } catch (e) { /* no focus */ } });
                } else if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(' ').catch(function () { /* no focus */ });
                }
            } catch (e) { /* clipboard unavailable */ }
        }, clipSec() * 1000);
    }
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            var orig = navigator.clipboard.writeText.bind(navigator.clipboard);
            navigator.clipboard.writeText = function (t) { var r = orig(t); try { armWipe(String(t)); } catch (e) { /* ignore */ } return r; };
        }
    } catch (e) { /* read-only clipboard object */ }
    document.addEventListener('copy', function () {
        try { var s = String(window.getSelection && window.getSelection()); if (s) armWipe(s); } catch (e) { /* ignore */ }
    }, true);

    /* ---------- settings card ---------- */
    function sw(isOn, label, fn) {
        var b = el('button', 'hzo-sw'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!isOn)); b.setAttribute('aria-label', label);
        b.appendChild(el('i')); b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
        return b;
    }
    function row(title, sub, control) {
        var r = el('div', 'settings-row-header hzl-set'), c = el('div', 'settings-row-content');
        c.appendChild(el('h3', null, title)); c.appendChild(el('p', null, sub)); r.appendChild(c);
        if (control) r.appendChild(control);
        return r;
    }
    function toggle(key, title, sub) { return row(title, sub, sw(on(key), title, function () { wr(key, on(key) ? '0' : '1'); paint(); })); }
    function paint() {
        if (!card) return;
        card.replaceChildren();
        var h = el('div', 'settings-row-header'), c = el('div', 'settings-row-content');
        c.appendChild(el('h3', null, 'Shield')); c.appendChild(el('p', null, 'Guards that watch for leaks and risky links. They run on this phone only.'));
        h.appendChild(c); card.appendChild(h);
        card.appendChild(toggle(K.secret, 'Secret guard', 'Asks before a message with an API key, token, private key or password goes to an AI.'));
        card.appendChild(toggle(K.link, 'Link guard', 'Checks links in chats for look-alike letters, raw IPs, short links and mismatched text before opening.'));
        card.appendChild(toggle(K.cover, 'Privacy cover', 'Covers the screen the moment Horizon goes to the background.'));
        card.appendChild(toggle(K.clip, 'Clipboard wipe', 'Clears the clipboard after you copy something that looks like a key or token.'));
        if (on(K.clip)) {
            var seg = el('div', 'hzl-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Clear clipboard after');
            [[30, '30 seconds'], [60, '1 minute'], [120, '2 minutes']].forEach(function (o) {
                var b = el('button', 'hzl-opt', o[1]); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(clipSec() === o[0]));
                b.addEventListener('click', function () { wr(K.clipSec, String(o[0])); paint(); });
                seg.appendChild(b);
            });
            card.appendChild(seg);
        }
        card.appendChild(el('p', 'hint', 'These are pattern checks. They catch the common shapes of secrets and risky links, not every possible one.'));
    }
    function mount() {
        var root = document.getElementById('hzSecurity');
        if (!root) return;
        if (!card) { card = el('section', 'provider-card hzs-card'); card.id = 'hzShieldCard'; paint(); }
        if (card.parentNode !== root) {
            var lock = document.getElementById('hzLockCard');
            if (lock && lock.parentNode === root) lock.insertAdjacentElement('afterend', card); else root.appendChild(card);
        }
    }
    var secRoot = document.getElementById('hzSecurity');
    if (secRoot && window.MutationObserver) new MutationObserver(function () { if (!card || card.parentNode !== secRoot) mount(); }).observe(secRoot, { childList: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
    window.addEventListener('load', mount);

    window.HzShield = { scan: scan, assess: assess };
})();
