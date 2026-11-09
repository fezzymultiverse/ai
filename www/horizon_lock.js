/* Horizon V1.43.0: APP LOCK. Settings > SECURITY > App lock.
   A PIN (4 to 6 digits, stored only as a salted PBKDF2 hash on this device) plus an optional fingerprint through the
   native HorizonLock plugin. Locks on start, and after the app has been in the background for the time you pick.
   Honest limit: this keeps someone out of Horizon on a phone you left unlocked. It does not encrypt the keys on disk. */
(function () {
    'use strict';
    var K = { on: 'horizon_lock_on', pin: 'horizon_lock_pin', bio: 'horizon_lock_bio', after: 'horizon_lock_after', secure: 'horizon_lock_secure', fails: 'horizon_lock_fails' };
    var ITER = 150000, FREE_TRIES = 5, MIN = 4, MAX = 6;
    var NS = 'http://www.w3.org/2000/svg';

    function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
    function del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
    function plugin() { try { var c = window.Capacitor; return (c && c.Plugins && c.Plugins.HorizonLock) || null; } catch (e) { return null; } }
    function native(m, a) {
        var p = plugin();
        if (!p || typeof p[m] !== 'function') return Promise.resolve(null);
        return Promise.resolve().then(function () { return p[m](a || {}); }).catch(function () { return null; });
    }

    /* ---------- PIN hashing ---------- */
    function b64(buf) { var a = new Uint8Array(buf), s = ''; for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
    function unb64(s) { var b = atob(s), a = new Uint8Array(b.length); for (var i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
    function derive(pin, salt, iter) {
        return crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']).then(function (k) {
            return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iter }, k, 256);
        });
    }
    function rec() { try { return JSON.parse(rd(K.pin) || 'null'); } catch (e) { return null; } }
    function savePin(pin) {
        var salt = crypto.getRandomValues(new Uint8Array(16));
        return derive(pin, salt, ITER).then(function (h) { wr(K.pin, JSON.stringify({ s: b64(salt), h: b64(h), i: ITER, l: pin.length })); });
    }
    function checkPin(pin) {
        var r = rec();
        if (!r) return Promise.resolve(false);
        return derive(pin, unb64(r.s), r.i || ITER).then(function (h) {
            var a = new Uint8Array(h), b = unb64(r.h), d = a.length ^ b.length;
            for (var i = 0; i < a.length && i < b.length; i++) d |= a[i] ^ b[i];
            return d === 0;
        });
    }

    /* ---------- settings ---------- */
    function enabled() { return rd(K.on) === '1' && !!rec(); }
    function bioOn() { return rd(K.bio) === '1'; }
    function afterSec() { var v = parseInt(rd(K.after), 10); return v === 0 || v === 300 ? v : 60; }
    function secureOn() { return rd(K.secure) === '1'; }
    var bioAvail = false;
    function applySecure() { if (plugin()) native('setSecure', { on: enabled() && secureOn() }); }

    /* ---------- wrong-PIN delay (kept across restarts) ---------- */
    function fails() { try { var f = JSON.parse(rd(K.fails) || '{}'); return { n: f.n || 0, until: f.until || 0 }; } catch (e) { return { n: 0, until: 0 }; } }
    function failed() {
        var f = fails(); f.n += 1;
        if (f.n >= FREE_TRIES) f.until = Date.now() + Math.min(30000 * Math.pow(2, f.n - FREE_TRIES), 900000);
        wr(K.fails, JSON.stringify(f));
        return f;
    }
    function clearFails() { del(K.fails); }

    /* ---------- lock screen ---------- */
    var box = null, locked = false, authBusy = false, graceUntil = 0, typed = '', tick = null, dots = null, msg = null, keys = {}, bioBtn = null;

    function pinLen() { var r = rec(); return (r && r.l) || MIN; }
    function say(t, bad) { if (msg) { msg.textContent = t || ''; msg.className = 'hzl-msg' + (bad ? ' bad' : ''); } }
    function paintDots() {
        if (!dots) return;
        var n = pinLen();
        dots.replaceChildren();
        for (var i = 0; i < n; i++) dots.appendChild(el('i', i < typed.length ? 'on' : ''));
    }
    function pad(on) { Object.keys(keys).forEach(function (k) { keys[k].disabled = !on; }); }
    function waitLeft() { return Math.max(0, fails().until - Date.now()); }
    function paintWait() {
        clearInterval(tick); tick = null;
        var w = waitLeft();
        if (w <= 0) { pad(true); return; }
        pad(false);
        var run = function () {
            var left = waitLeft();
            if (left <= 0) { clearInterval(tick); tick = null; pad(true); say(''); return; }
            say('Too many tries. Wait ' + Math.ceil(left / 1000) + 's', true);
        };
        run(); tick = setInterval(run, 500);
    }
    function press(d) {
        if (!locked || waitLeft() > 0 || typed.length >= pinLen()) return;
        typed += d; paintDots(); say('');
        if (typed.length === pinLen()) {
            var attempt = typed;
            pad(false);
            checkPin(attempt).then(function (ok) {
                if (ok) { unlock(); return; }
                var f = failed();
                typed = ''; paintDots();
                if (box) { box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake'); }
                if (f.until > Date.now()) paintWait(); else { pad(true); say('Wrong PIN. ' + (FREE_TRIES - f.n) + ' tr' + (FREE_TRIES - f.n === 1 ? 'y' : 'ies') + ' left', true); }
            }, function () { pad(true); typed = ''; paintDots(); say('Could not check the PIN', true); });
        }
    }
    function back() { if (typed.length && waitLeft() <= 0) { typed = typed.slice(0, -1); paintDots(); } }
    function fpIcon() {
        var s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'hzl-fp'); s.setAttribute('aria-hidden', 'true');
        ['M12 11v3.5a8 8 0 0 1-1.2 4.2', 'M8 12a4 4 0 0 1 8 0v2.5c0 1.5-.3 3-1 4.3', 'M5 12.5a7 7 0 0 1 14 0V14c0 1.2-.1 2.4-.4 3.5', 'M5 15.5c0 1.6.2 3 .7 4.5'].forEach(function (d) {
            var p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.appendChild(p);
        });
        return s;
    }
    function tryBio() {
        if (!locked || authBusy || !bioOn() || !bioAvail || waitLeft() > 0) return;
        authBusy = true;
        native('authenticate', { title: 'Unlock Horizon', subtitle: 'Bojack Security', negative: 'Use PIN' }).then(function (r) {
            authBusy = false; graceUntil = Date.now() + 1500;
            if (r && r.ok) unlock();
            else if (r && !r.cancelled && r.error) say(r.error, true);
        });
    }
    function lock() {
        if (locked || !enabled() || !document.body) return;
        locked = true; typed = '';
        if (window.HorizonContacts) HorizonContacts.clear();
        box = el('div', 'hzl'); box.id = 'hzLock'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Horizon is locked');
        box.appendChild(el('div', 'hzl-brand', 'BOJACK SECURITY'));
        box.appendChild(el('div', 'hzl-title', 'Horizon is locked'));
        dots = el('div', 'hzl-dots'); box.appendChild(dots);
        msg = el('div', 'hzl-msg'); box.appendChild(msg);
        var grid = el('div', 'hzl-pad'); keys = {};
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'bio', '0', 'del'].forEach(function (k) {
            var b = el('button', 'hzl-key'); b.type = 'button';
            if (k === 'bio') {
                bioBtn = b; b.classList.add('fn'); b.setAttribute('aria-label', 'Use fingerprint');
                if (bioOn() && bioAvail) { b.appendChild(fpIcon()); b.addEventListener('click', tryBio); } else { b.disabled = true; b.classList.add('ghost'); }
            } else if (k === 'del') {
                b.classList.add('fn'); b.textContent = '\u232B'; b.setAttribute('aria-label', 'Delete'); b.addEventListener('click', back);
            } else { b.textContent = k; b.addEventListener('click', function () { press(k); }); keys[k] = b; }
            grid.appendChild(b);
        });
        box.appendChild(grid);
        document.body.appendChild(box);
        document.documentElement.classList.add('hz-locked');
        try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); } catch (e) { /* ignore */ }
        paintDots(); paintWait();
        native('setLocked', { locked: true });
        if (bioOn() && bioAvail) setTimeout(tryBio, 350);
    }
    function unlock() {
        if (!locked) return;
        locked = false; typed = ''; clearFails(); clearInterval(tick); tick = null;
        if (box && box.parentNode) box.parentNode.removeChild(box);
        box = dots = msg = bioBtn = null; keys = {};
        document.documentElement.classList.remove('hz-locked');
        native('setLocked', { locked: false });
    }

    /* lock again when you come back after the chosen time */
    var hiddenAt = 0;
    document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
            if (authBusy || Date.now() < graceUntil || !enabled()) return;
            hiddenAt = Date.now();
            if (afterSec() === 0) lock();
        } else {
            if (hiddenAt && enabled() && !locked && Date.now() - hiddenAt >= afterSec() * 1000) lock();
            hiddenAt = 0;
        }
    });

    /* ---------- the card in Settings > SECURITY ---------- */
    var card = null, mode = null, note = '';
    function sw(on, label, fn) {
        var b = el('button', 'hzo-sw'); b.type = 'button'; b.setAttribute('role', 'switch'); b.setAttribute('aria-checked', String(!!on)); b.setAttribute('aria-label', label);
        b.appendChild(el('i')); b.addEventListener('click', function (e) { e.stopPropagation(); fn(); });
        return b;
    }
    function row(title, sub, control) {
        var r = el('div', 'settings-row-header hzl-set'), c = el('div', 'settings-row-content');
        c.appendChild(el('h3', null, title)); c.appendChild(el('p', null, sub)); r.appendChild(c);
        if (control) r.appendChild(control);
        return r;
    }
    function pinInput(ph) {
        var i = el('input', 'hzo-input hzl-in'); i.type = 'password'; i.inputMode = 'numeric'; i.pattern = '[0-9]*'; i.maxLength = MAX; i.placeholder = ph;
        i.autocomplete = 'off'; i.setAttribute('data-hz-private', '1'); i.setAttribute('enterkeyhint', 'done');
        i.addEventListener('input', function () { i.value = i.value.replace(/\D/g, '').slice(0, MAX); });
        return i;
    }
    function btn(t, cls, fn) { var b = el('button', 'use-btn ' + (cls || ''), t); b.type = 'button'; b.addEventListener('click', fn); return b; }
    function form(fields, okText, onOk) {
        var f = el('div', 'hzl-form'), ins = fields.map(function (p) { var i = pinInput(p); f.appendChild(i); return i; });
        var m = el('p', 'hint hzl-err'); f.appendChild(m);
        var r = el('div', 'hzo-row hzl-btns');
        r.appendChild(btn('Cancel', '', function () { mode = null; note = ''; paint(); }));
        r.appendChild(btn(okText, 'hzl-go', function () {
            var v = ins.map(function (i) { return i.value; });
            m.textContent = '';
            onOk(v, function (e) { m.textContent = e; });
        }));
        f.appendChild(r);
        setTimeout(function () { if (ins[0]) ins[0].focus(); }, 60);
        return f;
    }
    function validNew(a, b) {
        if (a.length < MIN || a.length > MAX) return 'Use ' + MIN + ' to ' + MAX + ' digits';
        if (a !== b) return 'The two PINs do not match';
        if (/^(\d)\1+$/.test(a) || a === '1234' || a === '123456' || a === '0000') return 'Pick a PIN that is harder to guess';
        return '';
    }
    function paint() {
        if (!card) return;
        card.replaceChildren();
        var on = enabled();
        var head = row('App lock', on ? 'On. Horizon asks for your PIN' + (bioOn() && bioAvail ? ' or fingerprint' : '') + (note ? ' \u00b7 ' + note : '') : 'Off. Anyone holding your unlocked phone can open Horizon', sw(on || mode === 'set', 'App lock', function () {
            if (on) { mode = mode === 'off' ? null : 'off'; } else { mode = mode === 'set' ? null : 'set'; }
            note = ''; paint();
        }));
        head.classList.add('hzl-head');
        var h3 = head.querySelector('h3'); h3.insertBefore(el('span', 'hzl-lockic', '\uD83D\uDD12 '), h3.firstChild);
        card.appendChild(head);

        if (mode === 'set') {
            card.appendChild(el('p', 'hint', 'Choose a PIN of ' + MIN + ' to ' + MAX + ' digits. It is stored only as a salted hash on this phone, and cannot be recovered. If you forget it, clear Horizon\u2019s data in Android settings, which also removes your keys.'));
            card.appendChild(form(['New PIN', 'Repeat PIN'], 'Turn on', function (v, err) {
                var e = validNew(v[0], v[1]); if (e) return err(e);
                savePin(v[0]).then(function () { wr(K.on, '1'); if (rd(K.after) == null) wr(K.after, '60'); mode = null; note = ''; applySecure(); paint(); }, function () { err('This device could not store the PIN'); });
            }));
            return;
        }
        if (mode === 'off') {
            card.appendChild(el('p', 'hint', 'Enter your PIN to turn the lock off.'));
            card.appendChild(form(['Current PIN'], 'Turn off', function (v, err) {
                checkPin(v[0]).then(function (ok) {
                    if (!ok) return err('Wrong PIN');
                    wr(K.on, '0'); del(K.pin); del(K.bio); clearFails(); mode = null; note = ''; applySecure(); paint();
                });
            }));
            return;
        }
        if (mode === 'change') {
            card.appendChild(form(['Current PIN', 'New PIN', 'Repeat new PIN'], 'Change PIN', function (v, err) {
                checkPin(v[0]).then(function (ok) {
                    if (!ok) return err('Wrong current PIN');
                    var e = validNew(v[1], v[2]); if (e) return err(e);
                    return savePin(v[1]).then(function () { mode = null; note = 'PIN changed'; paint(); });
                });
            }));
            return;
        }
        if (!on) { card.appendChild(el('p', 'hint', 'Turn it on to lock Horizon with a PIN. On supported phones you can unlock with your fingerprint too.')); return; }

        if (bioAvail) card.appendChild(row('Use fingerprint', 'Unlock with the Android fingerprint prompt. The PIN stays as a backup.', sw(bioOn(), 'Use fingerprint', function () { wr(K.bio, bioOn() ? '0' : '1'); paint(); })));
        else if (plugin()) card.appendChild(row('Use fingerprint', 'No fingerprint is set up on this phone yet. Add one in Android settings, then come back.', null));

        var seg = el('div', 'hzl-seg'); seg.setAttribute('role', 'radiogroup'); seg.setAttribute('aria-label', 'Lock after');
        [[0, 'Right away'], [60, '1 minute'], [300, '5 minutes']].forEach(function (o) {
            var b = el('button', 'hzl-opt', o[1]); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(afterSec() === o[0]));
            b.addEventListener('click', function () { wr(K.after, String(o[0])); paint(); });
            seg.appendChild(b);
        });
        var la = row('Lock after', 'How long Horizon can sit in the background before it asks again.', null);
        card.appendChild(la); card.appendChild(seg);

        if (plugin()) card.appendChild(row('Hide in recent apps', 'Blanks Horizon in the app switcher. This also blocks screenshots while it is on.', sw(secureOn(), 'Hide in recent apps', function () { wr(K.secure, secureOn() ? '0' : '1'); applySecure(); paint(); })));

        var r = el('div', 'hzo-row hzl-btns');
        r.appendChild(btn('Change PIN', '', function () { mode = 'change'; note = ''; paint(); }));
        r.appendChild(btn('Lock now', 'hzl-go', function () { lock(); }));
        card.appendChild(r);
        card.appendChild(el('p', 'hint', 'This keeps people out of Horizon on a phone you left unlocked. It does not encrypt the keys stored on the device.'));
    }
    function mount() {
        var root = document.getElementById('hzSecurity');
        if (!root) return;
        if (!card) { card = el('section', 'provider-card hzl-card'); card.id = 'hzLockCard'; paint(); }
        if (card.parentNode !== root) root.insertBefore(card, root.firstChild);
    }
    var secRoot = document.getElementById('hzSecurity');
    if (secRoot && window.MutationObserver) new MutationObserver(function () { if (!card || card.parentNode !== secRoot) mount(); }).observe(secRoot, { childList: true });

    /* ---------- start ---------- */
    function start() {
        mount();
        if (enabled()) lock();        // cover the app straight away, before we know about the fingerprint
        native('available').then(function (r) {
            bioAvail = !!(r && r.biometric);
            if (card) paint();
            if (locked && bioBtn && bioOn() && bioAvail) {
                bioBtn.disabled = false; bioBtn.classList.remove('ghost'); bioBtn.replaceChildren(fpIcon()); bioBtn.addEventListener('click', tryBio);
                setTimeout(tryBio, 200);
            }
        });
        applySecure();
    }
    window.HzLock = { enabled: enabled, locked: function () { return locked; }, lock: lock };
    start();
})();
