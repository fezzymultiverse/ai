/* V1.63.4: fold long AI replies. A tiny green arrow sits at the right end of the reply's name/time line once the reply is
   taller than about half a screen. Tap = fold to a few lines (arrow flips), tap again = open. Nothing is saved or sent. */
(function () {
    'use strict';
    var LIMIT = 380;      // px of reply height before the arrow shows
    var box = document.getElementById('chatMessages');
    if (!box || !window.MutationObserver) return;
    var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    var seen = new WeakSet();

    function attach(wrap) {
        if (seen.has(wrap) || !wrap.classList.contains('ai')) return;
        var bubble = wrap.querySelector(':scope > .bubble');
        var meta = wrap.querySelector(':scope > .message-meta');
        if (!bubble || !meta) return;
        seen.add(wrap);
        var btn = null;
        function make() {
            btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'hz-fold-btn';
            btn.innerHTML = SVG;
            sync();
            btn.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                wrap.classList.toggle('hz-folded');
                sync();
            });
            meta.appendChild(btn);
        }
        function sync() {
            if (!btn) return;
            var f = wrap.classList.contains('hz-folded');
            btn.setAttribute('aria-label', f ? 'Open reply' : 'Fold reply');
            btn.title = f ? 'Open reply' : 'Fold reply';
        }
        function check() {
            var tall = bubble.scrollHeight > LIMIT;
            if (tall && !btn) make();
            else if (!tall && btn && !wrap.classList.contains('hz-folded')) { btn.remove(); btn = null; }
        }
        if (window.ResizeObserver) { try { new ResizeObserver(check).observe(bubble); } catch (_) { /* older WebView */ } }
        new MutationObserver(check).observe(bubble, { childList: true, subtree: true, characterData: true });
        check();
    }
    function scan() { box.querySelectorAll(':scope > .message.ai').forEach(attach); }
    new MutationObserver(scan).observe(box, { childList: true });
    scan();

    // V1.64.0: FOLD ALL / UNFOLD ALL. One small button in the action row under the newest reply. It shows once two or more replies are
    // long enough to fold, folds every one of them, and reads "Unfold all" when they are all folded.
    var all = null, placeT = 0;
    var ALL_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 15l6-6 6 6"/></svg>';
    function foldables() {
        return [].slice.call(box.querySelectorAll(':scope > .message.ai')).filter(function (w) { return w.querySelector(':scope > .message-meta .hz-fold-btn'); });
    }
    function paintAll() {
        if (!all) return;
        var list = foldables();
        var anyOpen = list.some(function (w) { return !w.classList.contains('hz-folded'); });
        all.classList.toggle('is-open', anyOpen);
        var label = anyOpen ? 'Fold all' : 'Unfold all';
        var sp = all.querySelector('span');
        if (sp.textContent !== label) sp.textContent = label;     // only when it changed, or this repaint would retrigger its own observer
        all.setAttribute('aria-label', label + ' long replies');
        all.title = label + ' long replies';
    }
    function placeAll() {
        placeT = 0;
        var list = foldables();
        var last = null;
        [].slice.call(box.querySelectorAll(':scope > .message.ai')).forEach(function (w) { if (w.querySelector(':scope > .act-row > .act-left')) last = w; });
        if (list.length < 2 || !last) { if (all && all.parentNode) all.remove(); return; }
        if (!all) {
            all = document.createElement('button');
            all.type = 'button';
            all.className = 'hz-foldall';
            all.innerHTML = ALL_SVG + '<span></span>';
            all.addEventListener('click', function (e) {
                e.preventDefault(); e.stopPropagation();
                var items = foldables();
                var fold = items.some(function (w) { return !w.classList.contains('hz-folded'); });   // anything open -> fold all; else open all
                items.forEach(function (w) {
                    var isF = w.classList.contains('hz-folded');
                    var b = w.querySelector(':scope > .message-meta .hz-fold-btn');
                    if (b && isF !== fold) b.click();
                });
                paintAll();
            });
        }
        var left = last.querySelector(':scope > .act-row > .act-left');
        if (all.parentNode !== left) left.appendChild(all);
        paintAll();
    }
    function schedule() { if (!placeT) placeT = setTimeout(placeAll, 250); }
    new MutationObserver(schedule).observe(box, { childList: true, subtree: true });
    box.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.hz-fold-btn')) setTimeout(paintAll, 0); });
    schedule();
})();
