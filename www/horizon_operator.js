/* Horizon V1.42.0: OPERATOR. A name tag on the left of your messages, beside the date and time.
   Rename it or switch it off under Personalisation. Stored only on this device. It watches the chat, so every way a message
   is drawn (new, reloaded, edited) gets the tag without touching the message code.
   V1.58.4: the place tag (suburb and city) and the VPN chip on message bubbles were removed, together with their location
   lookups. The place name this feature cached on the phone is deleted on load. */
(function () {
    'use strict';
    var ON = 'horizon_operator_on', NM = 'horizon_operator_name', DEF = 'Operator', MAX = 24;
    function rd(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function wr(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage full or blocked */ } }
    function del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } }
    function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, MAX); }
    function enabled() { return rd(ON) !== '0'; }
    function name() { return clean(rd(NM)) || DEF; }

    // V1.58.4: forget what the removed place tag stored on this phone
    del('horizon_operator_loc_cache');
    del('horizon_operator_loc_on');

    var feed = document.getElementById('chatMessages');
    var sw = document.getElementById('opSwitch'), input = document.getElementById('opName'),
        reset = document.getElementById('opReset'), status = document.getElementById('opStatus');

    function apply() {
        if (!feed) return;
        var on = enabled(), nm = name();
        feed.querySelectorAll('.message.user > .message-meta').forEach(function (meta) {
            var tag = meta.querySelector(':scope > .meta-op');
            if (!on) { if (tag) tag.remove(); return; }
            if (!tag) { tag = document.createElement('span'); tag.className = 'meta-op'; meta.insertBefore(tag, meta.firstChild); }
            if (tag.textContent !== nm) tag.textContent = nm;
        });
    }

    function paint(note) {
        var on = enabled();
        if (sw) sw.setAttribute('aria-checked', String(on));
        if (input) { input.disabled = !on; if (document.activeElement !== input) input.value = clean(rd(NM)); }
        if (reset) reset.disabled = !on || !clean(rd(NM));
        if (status) status.textContent = (on ? 'On. Your messages show "' + name() + '" beside the date and time' : 'Off. Your messages show only the date and time') + (note ? ' \u00b7 ' + note : '');
    }

    if (sw) sw.addEventListener('click', function (e) { e.stopPropagation(); wr(ON, enabled() ? '0' : '1'); apply(); paint(); });   // stopPropagation: the card header would otherwise collapse the card
    if (input) {
        input.addEventListener('input', function () {
            var v = clean(input.value);
            if (v) wr(NM, v); else del(NM);
            apply(); paint();
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('blur', function () { paint(); });
    }
    if (reset) reset.addEventListener('click', function () { del(NM); if (input) input.value = ''; apply(); paint('reset'); });

    if (feed && window.MutationObserver) new MutationObserver(apply).observe(feed, { childList: true, subtree: true });
    window.HzOperator = { enabled: enabled, name: name, apply: apply };
    apply();
    paint();
})();
