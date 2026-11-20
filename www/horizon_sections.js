/* V1.99.151 · Expand / collapse for the Settings cards that mount themselves after the page loads
   (Automatic AI check-ins, WhatsApp auto-reply, Notification tones). The header stays visible; `keep` is how many
   top-level children stay visible with it (header, switch row, status line). Open/closed is remembered per card on this device. */
(function () {
    'use strict';
    var PREFIX = 'horizon_sec_';
    var SPEC = [
        { id: 'hzCheckinSettings', keep: 3 },
        { id: 'hzWabotSettings', keep: 3 },
        { id: 'toneCard', keep: 1 }
    ];
    var watched = [], timer = 0;

    function get(k) { try { return localStorage.getItem(PREFIX + k); } catch (_) { return null; } }
    function put(k, v) { try { localStorage.setItem(PREFIX + k, v); } catch (_) { /* optional */ } }

    function build(card, spec) {
        if (!card || card.dataset.hzs || card.querySelector('.card-chev')) return;
        var kids = Array.prototype.slice.call(card.children);
        if (kids.length <= spec.keep) return;
        card.dataset.hzs = '1';
        card.classList.add('hzs-sec');
        var head = kids[0];
        head.classList.add('hzs-head');
        head.setAttribute('role', 'button');
        head.setAttribute('tabindex', '0');
        var body = document.createElement('div');
        body.className = 'hzs-body';
        body.id = spec.id + 'Body';
        kids.slice(spec.keep).forEach(function (n) { body.appendChild(n); });
        card.appendChild(body);
        head.setAttribute('aria-controls', body.id);
        function set(open, save) {
            card.classList.toggle('hzs-closed', !open);
            head.setAttribute('aria-expanded', String(open));
            if (save) put(spec.id, open ? '1' : '0');
        }
        set(get(spec.id) !== '0', false);
        head.addEventListener('click', function (e) {
            if (e.target.closest && e.target.closest('button, input, select, textarea, a')) return;
            set(card.classList.contains('hzs-closed'), true);
        });
        head.addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (e.target !== head) return;
            e.preventDefault();
            set(card.classList.contains('hzs-closed'), true);
        });
    }

    function observe(node) {
        if (!node || !window.MutationObserver || watched.indexOf(node) !== -1) return;
        watched.push(node);
        new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(scan, 120); }).observe(node, { childList: true });
    }

    function scan() {
        SPEC.forEach(function (sp) { build(document.getElementById(sp.id), sp); });
        observe(document.getElementById('daemonCard'));
        observe(document.querySelector('.tab-body[data-tab="personalisation"]'));
    }

    // The tones card is built a moment after the native bridge answers, or when Personalisation is first opened.
    document.addEventListener('click', function () { setTimeout(scan, 250); setTimeout(scan, 1200); }, true);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scan); else scan();
    setTimeout(scan, 1500);
    setTimeout(scan, 4000);
    window.HzSections = { scan: scan };
})();
