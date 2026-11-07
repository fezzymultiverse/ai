(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const panel = $('hzAddons'), shade = $('hzAddonShade'), win = $('hzExtensionWindow');
    let focusReturn = null;
    const shown = el => !el.hidden;
    function render(mode) {
        const active = mode === 'music' || mode === 'github' || mode === 'youtube' || mode === 'lens' || mode === 'downloads';
        shade.hidden = !mode; panel.hidden = !mode || active; win.hidden = !active;
        document.querySelectorAll('[data-addons-open]').forEach(b => b.setAttribute('aria-expanded', String(!!mode)));
        $('hzYouTubeView').hidden = mode !== 'youtube';
        $('hzMusicView').hidden = mode !== 'music'; $('hzGitHubView').hidden = mode !== 'github';
        const lv = $('hzLensView'); if (lv) lv.hidden = mode !== 'lens';
        const dv = $('hzDownloadsView'); if (dv) dv.hidden = mode !== 'downloads';
        if (active) {
            $('hzExtensionTitle').replaceChildren();
            if (mode === 'github') $('hzExtensionTitle').insertAdjacentHTML('beforeend', '<svg class="ic" aria-hidden="true"><use href="#i-gh"/></svg> GitHub');
            else if (mode === 'lens') { $('hzExtensionTitle').textContent = 'Lens'; if (window.HorizonLens) window.HorizonLens.show(); }
            else if (mode === 'downloads') { $('hzExtensionTitle').textContent = '⬇ Downloads'; if (window.HorizonDownloads) window.HorizonDownloads.show(); }
            else $('hzExtensionTitle').textContent = mode === 'youtube' ? '▶ YouTube · Terminal' : '🎵 Music Player';
            win.classList.remove('collapsed'); $('hzExtensionSize').textContent = '▣ Collapse';
            $('hzExtensionMin').focus();
        } else if (mode) $('hzAddonsClose').focus();
        else if (focusReturn && focusReturn.isConnected) focusReturn.focus();
    }
    function open(mode) {
        if (panel.hidden && win.hidden) focusReturn = document.activeElement;
        const old = history.state || {};
        const want = mode || 'widgets';
        // V1.18.0: apps menu -> an app is two history steps, so hardware Back goes app -> apps menu -> chat.
        if (!old.hzAddon) history.pushState({ ...old, hzAddon: want, hzDepth: 1 }, '');
        else if (old.hzAddon === 'widgets' && want !== 'widgets') history.pushState({ ...old, hzAddon: want, hzDepth: (old.hzDepth || 1) + 1 }, '');
        else history.replaceState({ ...old, hzAddon: want }, '');
        render(want);
    }
    function minimize() { close(); }
    function close() {
        const st = history.state;
        render('');
        if (st && st.hzAddon) history.go(-(st.hzDepth || 1));
    }
    window.addEventListener('popstate', () => render((history.state && history.state.hzAddon) || ''));
    document.querySelectorAll('[data-addons-open]').forEach(b => b.addEventListener('click', () => open('widgets')));
    document.querySelectorAll('[data-addon]').forEach(b => b.addEventListener('click', () => open(b.dataset.addon)));
    $('hzAddonsClose').addEventListener('click', close); shade.addEventListener('click', close);
    $('hzExtensionMin').addEventListener('click', minimize);
    $('hzExtensionSize').addEventListener('click', () => {
        const collapsed = win.classList.toggle('collapsed'); $('hzExtensionSize').textContent = collapsed ? '⛶ Full screen' : '▣ Collapse';
        $('hzExtensionSize').setAttribute('aria-label', collapsed ? 'Expand interface to full screen' : 'Collapse interface');
    });
    document.addEventListener('keydown', e => {
        if (!shown(panel) && !shown(win)) return;
        if (e.key === 'Escape') { e.preventDefault(); if (shown(win)) minimize(); else close(); }
        if (e.key === 'Tab') {
            const parent = shown(win) ? win : panel;
            const all = Array.from(parent.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]')).filter(el => !el.disabled && el.getClientRects().length);
            if (!all.length) return;
            const first = all[0], last = all[all.length-1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
        if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('#mpMini .mp-mini-t')) { e.preventDefault(); open('music'); }
    });
    window.HorizonAddons = { open, minimize, close };
})();
