/* Horizon V1.20.0: LENS. Lets the AI see how the app really looks, not only what is on the screen.
 * - UI MAP: viewport, theme, every design token (colours), fonts, every panel and its state, a layout
 *   tree with sizes and styles, and an automatic problem check (clipped text, tiny taps, low contrast,
 *   off-screen parts).
 * - SCREENSHOT: a real picture of the app window from the native HorizonLens plugin, sent to vision
 *   models. The Vault, keys and other private fields are blurred before the picture is taken.
 * - Runs only when Fezzy asks how something looks (Auto), on every message (Always), or never (Off).
 *   The Screen switch in the + menu is the master switch. Keys, tokens, the Vault and chat text are never read.
 */
(function () {
    'use strict';
    const LSM = 'horizon_lens_mode';   // auto | always | off
    const LSS = 'horizon_lens_shot';   // '0' = map only, no picture
    const BLOCK = '#chatMessages, #chatInput, .tab-body[data-tab="vault"], [data-hz-private], #attInput, .att-pv';
    const SECRET_ATTR = /key|token|secret|passw|passphrase|\bpat\b|ssh|auth|bearer|credential|cookie|private|pin\b/i;
    const SECRET_TXT = /AIza[\w-]{20,}|gsk_[\w]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|sk-[\w-]{20,}|-----BEGIN[\s\S]*?(?:-----END[^-]*-----|$)|[A-Za-z0-9+/_=-]{36,}/g;
    const ASK = /\b(?:how (?:does|do|is|are|would)\b[^.?!\n]{0,60}\blooks?|looks? (?:at|like|wrong|off|bad|broken|weird|ugly|good|clean)|look(?:ing)? at (?:my|the|this)|what (?:do|does|can) you see|can you see|do you see|see (?:my|the) (?:app|screen|ui|layout|design)|my (?:screen|ui|layout)|the (?:ui|ux|layout|design|theme|screen|interface)|screenshot|cut ?off|clipped|overlap\w*|off[- ]?screen|too (?:big|small|wide|tight|close|bright|dark|dim)|misalign\w*|alignment|spacing|padding|margins?|font (?:size|looks?)|contrast|colou?rs?|dark mode|light mode|neon|tile|widget|badge|pill|panel looks?|button looks?|redesign|restyle|make it (?:smaller|bigger|prettier|cleaner|better looking))\b/i;
    const LAYERS = [
        ['Horizon Browser (tabs, URL bar, AI box, settings drawer)', '#hzb.open'],
        ['Add-on window (Music, GitHub, YouTube, Lens)', '#hzExtensionWindow'],
        ['Apps menu', '#hzAddons'],
        ['Settings panel (right)', '#rightPanel.open'],
        ['Menu panel (left)', '#leftPanel.open']
    ];
    const FIXED = [
        ['Provider chips (top)', '#aiSelector'],
        ['Usage badge', '#hzBadge'],
        ['Composer (message box)', '.composer'],
        ['+ tools menu', '#toolMenu']
    ];
    const MAX_REPORT = 9500;

    let host = { canSee: () => false, native: null, notice: null, ask: null, screenOn: () => true };
    let pending = null;     // { report, shot } for the turn that is being sent
    let panel = null;
    let view = { shot: null, rep: null, busy: '', err: '' };

    // ---------- tiny helpers ----------
    const $ = s => document.querySelector(s);
    const el = (t, c, x) => { const n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; };
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* full */ } };
    const clean = (s, n) => String(s || '').replace(SECRET_TXT, '[hidden]').replace(/\s+/g, ' ').trim().slice(0, n || 80);
    const px = v => Math.round(parseFloat(v) || 0);
    const frames = () => new Promise(ok => { let d = false; const f = () => { if (!d) { d = true; ok(); } }; try { requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(f, 70))); } catch (e) { /* no rAF */ } setTimeout(f, 400); });

    const mode = () => { const m = lsGet(LSM); return m === 'always' || m === 'off' ? m : 'auto'; };
    const setMode = m => { lsSet(LSM, m === 'always' || m === 'off' ? m : 'auto'); };
    const shotOn = () => lsGet(LSS) !== '0';
    const setShot = v => lsSet(LSS, v ? '1' : '0');
    const enabled = () => mode() !== 'off' && !!host.screenOn();
    const wants = t => mode() === 'always' || (mode() === 'auto' && ASK.test(String(t || '')));

    // ---------- colour maths ----------
    function rgba(str) {
        const m = /rgba?\(([^)]+)\)/.exec(str || '');
        if (!m) return null;
        const p = m[1].split(/[\s,\/]+/).filter(Boolean).map(parseFloat);
        if (p.length < 3 || p.slice(0, 3).some(isNaN)) return null;
        return { r: p[0], g: p[1], b: p[2], a: p.length > 3 && !isNaN(p[3]) ? p[3] : 1 };
    }
    const hx = c => '#' + [c.r, c.g, c.b].map(v => ('0' + Math.max(0, Math.min(255, Math.round(v))).toString(16)).slice(-2)).join('') + (c.a < 1 ? '@' + Math.round(c.a * 100) + '%' : '');
    const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
    const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
    function effBg(e) {
        let n = e;
        while (n && n.nodeType === 1) {
            const cs = getComputedStyle(n);
            if (cs.backgroundImage !== 'none') return null;   // gradient or picture: cannot judge
            const c = rgba(cs.backgroundColor);
            if (c && c.a >= 0.5) return c;
            n = n.parentElement;
        }
        return { r: 255, g: 255, b: 255, a: 1 };
    }

    // ---------- element facts ----------
    function rendered(e) {
        if (!e || !e.isConnected || e.hidden) return false;
        const r = e.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) return false;
        const cs = getComputedStyle(e);
        return cs.display !== 'none' && cs.visibility !== 'hidden';
    }
    function onscreen(e) {
        if (!rendered(e)) return false;
        const r = e.getBoundingClientRect();
        return r.right > 2 && r.left < innerWidth - 2 && r.bottom > 2 && r.top < innerHeight - 2;
    }
    const isBlocked = e => !!(e.matches && e.matches(BLOCK)) || !!(e.closest && e.closest(BLOCK));
    function isSecret(e) {
        if (e.type === 'password') return true;
        const lab = e.labels && e.labels[0] ? e.labels[0].textContent : '';
        return SECRET_ATTR.test([e.id, e.name, e.getAttribute && e.getAttribute('aria-label'), e.placeholder, e.getAttribute && e.getAttribute('autocomplete'), lab].join(' '));
    }
    const ownText = e => Array.prototype.filter.call(e.childNodes, n => n.nodeType === 3).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    const rectTxt = r => '[' + Math.round(r.left) + ',' + Math.round(r.top) + ' ' + Math.round(r.width) + '\u00d7' + Math.round(r.height) + ']';
    function nameOf(e) {
        const t = e.getAttribute('aria-label') || e.title || ownText(e) || (e.matches('input,textarea,select') ? e.placeholder : '') || e.textContent || '';
        return clean(t, 32);
    }
    function labelOf(e) {
        const tag = e.tagName.toLowerCase();
        const cls = (typeof e.className === 'string' ? e.className : '').split(/\s+/).filter(c => c && !/^hz-?(?:on|off)$/.test(c)).slice(0, 2).join('.');
        let s = tag + (e.id ? '#' + e.id : '') + (cls ? '.' + cls : '');
        if (s.length > 46) s = s.slice(0, 45) + '\u2026';
        return s;
    }
    function stateOf(e) {
        let st = '';
        const as = e.getAttribute('aria-selected'), ac = e.getAttribute('aria-checked'), ap = e.getAttribute('aria-pressed');
        if (as === 'true') st += ' (selected)';
        if (ac) st += ac === 'true' ? ' (on)' : ' (off)';
        if (ap === 'true') st += ' (pressed)';
        if (e.disabled) st += ' (disabled)';
        if (e.matches('input[type=checkbox],input[type=radio]')) st += e.checked ? ' (on)' : ' (off)';
        return st;
    }
    function styleOf(e, pcs) {
        const cs = getComputedStyle(e), out = [];
        const txt = !!ownText(e) || e.matches('button,input,select,textarea');
        if (txt) {
            out.push('fs' + px(cs.fontSize));
            if (cs.fontWeight !== '400' && cs.fontWeight !== 'normal') out.push('w' + cs.fontWeight);
            const col = rgba(cs.color);
            if (col && (!pcs || cs.color !== pcs.color)) out.push('c' + hx(col));
        }
        const bg = rgba(cs.backgroundColor);
        if (bg && bg.a > 0.05 && (!pcs || cs.backgroundColor !== pcs.backgroundColor)) out.push('bg' + hx(bg));
        if (cs.backgroundImage !== 'none') out.push('bg-image');
        const rad = parseFloat(cs.borderTopLeftRadius);
        if (rad > 0) out.push('r' + Math.round(rad));
        const bw = parseFloat(cs.borderTopWidth);
        if (bw > 0 && cs.borderTopStyle !== 'none') { const bc = rgba(cs.borderTopColor); out.push('b' + (Math.round(bw * 10) / 10) + (bc ? hx(bc) : '')); }
        if (cs.boxShadow !== 'none') out.push('shadow');
        const pad = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px);
        if (pad.some(v => v > 0)) out.push('p' + (pad.every(v => v === pad[0]) ? pad[0] : pad.join('/')));
        if (cs.display.indexOf('flex') >= 0) out.push((cs.flexDirection.indexOf('column') === 0 ? 'col' : 'row') + (px(cs.rowGap) > 0 ? ' gap' + px(cs.rowGap) : ''));
        else if (cs.display.indexOf('grid') >= 0) out.push('grid' + cs.gridTemplateColumns.split(' ').filter(Boolean).length + (px(cs.rowGap) > 0 ? ' gap' + px(cs.rowGap) : ''));
        if (cs.position === 'fixed' || cs.position === 'absolute' || cs.position === 'sticky') out.push(cs.position);
        if (cs.zIndex !== 'auto') out.push('z' + cs.zIndex);
        if (cs.opacity !== '1') out.push('op' + cs.opacity);
        if (cs.overflowY === 'auto' || cs.overflowY === 'scroll') out.push('scroll-y');
        if (cs.overflowX === 'auto' || cs.overflowX === 'scroll') out.push('scroll-x');
        return out.join(' ');
    }

    // ---------- layout tree ----------
    function distinct(e) {
        const cs = getComputedStyle(e), bg = rgba(cs.backgroundColor);
        return (bg && bg.a > 0.05) || (parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none') || parseFloat(cs.borderTopLeftRadius) > 0 || cs.boxShadow !== 'none';
    }
    function walk(root, budget, depthMax) {
        const lines = [];
        const st = { n: 0, max: budget };
        const visit = (e, depth, pcs) => {
            if (st.n >= st.max || depth > depthMax) return;
            const tag = e.tagName.toLowerCase();
            if (tag === 'script' || tag === 'style' || tag === 'template' || tag === 'noscript' || tag === 'link' || tag === 'meta') return;
            if (!onscreen(e)) return;
            const r = e.getBoundingClientRect(), pad = '  '.repeat(depth);
            if (isBlocked(e)) {
                lines.push(pad + '(private, not read) ' + labelOf(e) + ' ' + rectTxt(r));
                st.n++;
                return;
            }
            if (tag === 'svg') { if (r.width >= 4) { lines.push(pad + 'icon ' + rectTxt(r) + (e.closest('button,a') ? '' : ' ' + styleOf(e, pcs))); st.n++; } return; }
            const inter = e.matches('button,a[href],input,select,textarea,[role="button"],[role="tab"],[role="switch"]');
            const own = ownText(e);
            const keep = depth === 0 || inter || !!e.id || !!own || distinct(e);
            const cs = getComputedStyle(e);
            if (keep) {
                let line = pad + labelOf(e) + ' ' + rectTxt(r);
                const s = styleOf(e, pcs);
                if (s) line += ' ' + s;
                if (inter) {
                    if (e.matches('input,textarea')) line += isSecret(e) ? ' (hidden)' : (e.matches('input[type=checkbox],input[type=radio]') ? '' : e.value ? ' (' + e.value.length + ' chars)' : ' (empty)');
                    const nm = nameOf(e); if (nm && !e.matches('input,textarea')) line += ' "' + nm + '"';
                    line += stateOf(e);
                } else if (own) line += ' "' + clean(own, 34) + '"';
                lines.push(line);
                st.n++;
            }
            const kids = e.children;
            for (let i = 0; i < kids.length; i++) visit(kids[i], keep ? depth + 1 : depth, keep ? cs : pcs);
        };
        visit(root, 0, null);
        if (st.n >= st.max) lines.push('  \u2026 (more elements not listed)');
        return lines;
    }

    // ---------- design tokens ----------
    function tokenNames() {
        const set = {};
        try {
            Array.prototype.forEach.call(document.styleSheets, sheet => {
                let rules; try { rules = sheet.cssRules; } catch (e) { return; }
                Array.prototype.forEach.call(rules || [], rule => {
                    if (!rule.selectorText || !rule.style) return;
                    if (!/^\s*(?:html|:root)\b/.test(rule.selectorText)) return;
                    for (let i = 0; i < rule.style.length; i++) { const n = rule.style[i]; if (n.indexOf('--') === 0) set[n] = 1; }
                });
            });
        } catch (e) { /* ignore */ }
        return Object.keys(set).slice(0, 60);
    }
    function tokensLine() {
        const cs = getComputedStyle(document.documentElement), out = [];
        tokenNames().forEach(n => {
            const v = cs.getPropertyValue(n).trim();
            if (!v) return;
            const c = rgba(v.indexOf('#') === 0 ? hexToRgb(v) : v);
            out.push(n + ' ' + (c ? hx(c) : v.slice(0, 28)));
        });
        return out.join(', ');
    }
    function hexToRgb(h) {
        let s = h.replace('#', '');
        if (s.length === 3) s = s.split('').map(c => c + c).join('');
        if (s.length !== 6 && s.length !== 8) return h;
        const n = parseInt(s.slice(0, 6), 16);
        if (isNaN(n)) return h;
        return 'rgb(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ')';
    }
    function safeArea() {
        const p = document.createElement('div');
        p.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)';
        document.body.appendChild(p);
        const cs = getComputedStyle(p), r = [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(px);
        p.remove();
        return r;
    }

    // ---------- problem scan ----------
    function scanProblems(scope) {
        const out = [];
        const all = scope.querySelectorAll('*');
        const cap = Math.min(all.length, 1100);
        const small = [], clipped = [], off = [], contrast = [], tiny = [];
        let contrastChecks = 0;
        const inScroller = e => { let n = e.parentElement; while (n && n !== scope) { const cs = getComputedStyle(n); if (/(auto|scroll|hidden)/.test(cs.overflowX)) return true; n = n.parentElement; } return false; };
        for (let i = 0; i < cap; i++) {
            const e = all[i];
            if (!onscreen(e) || isBlocked(e)) continue;
            const tag = e.tagName.toLowerCase();
            if (tag === 'svg' || tag === 'path' || tag === 'script' || tag === 'style' || (e.closest && e.closest('svg'))) continue;
            const r = e.getBoundingClientRect();
            const inter = e.matches('button,a[href],input:not([type=hidden]),select,textarea,[role="button"],[role="tab"],[role="switch"]') && e.getAttribute('aria-hidden') !== 'true' && e.tabIndex !== -1 && !e.hasAttribute('data-hit-pad');
            if (inter && Math.min(r.width, r.height) < 32 && !e.matches('input[type=checkbox],input[type=radio]')) small.push(labelOf(e) + ' ' + Math.round(r.width) + '\u00d7' + Math.round(r.height));
            if (r.right > innerWidth + 2 && r.width < innerWidth * 2 && !inScroller(e)) off.push(labelOf(e) + ' ends at x=' + Math.round(r.right) + ' (screen is ' + innerWidth + ')');
            const own = ownText(e);
            if (own) {
                const cs = getComputedStyle(e);
                if (e.scrollWidth > e.clientWidth + 2 && /(hidden|clip)/.test(cs.overflowX) && cs.textOverflow !== 'ellipsis') clipped.push(labelOf(e) + ' "' + clean(own, 22) + '"');
                const fs = parseFloat(cs.fontSize);
                if (fs < 10.5) tiny.push(labelOf(e) + ' ' + Math.round(fs * 10) / 10 + 'px "' + clean(own, 18) + '"');
                if (contrastChecks < 260) {
                    contrastChecks++;
                    const fg = rgba(cs.color), bg = effBg(e);
                    if (fg && bg && fg.a > 0.3) {
                        const k = ratio(fg, bg), need = fs >= 18 || (fs >= 14 && parseInt(cs.fontWeight, 10) >= 700) ? 3 : 4.5;
                        if (k < need) contrast.push({ k: k, t: labelOf(e) + ' ' + hx(fg) + ' on ' + hx(bg) + ' = ' + (Math.round(k * 10) / 10) + ':1 "' + clean(own, 18) + '"' });
                    }
                }
            }
        }
        if (document.documentElement.scrollWidth > innerWidth + 1) out.push('Page scrolls sideways: content is ' + document.documentElement.scrollWidth + 'px wide on a ' + innerWidth + 'px screen.');
        off.slice(0, 5).forEach(t => out.push('Pokes off the right edge: ' + t));
        clipped.slice(0, 6).forEach(t => out.push('Text clipped (no ellipsis): ' + t));
        small.slice(0, 8).forEach(t => out.push('Small tap target (under 32px): ' + t));
        contrast.sort((a, b) => a.k - b.k).slice(0, 6).forEach(c => out.push('Low contrast: ' + c.t));
        tiny.slice(0, 4).forEach(t => out.push('Tiny text: ' + t));
        const extra = small.length - 8 + clipped.length - 6 + contrast.length - 6;
        if (extra > 0) out.push('\u2026 and ' + extra + ' more of the same kinds.');
        return out;
    }

    // ---------- the report ----------
    function topLayer() {
        for (let i = 0; i < LAYERS.length; i++) { const e = $(LAYERS[i][1]); if (onscreen(e)) return { name: LAYERS[i][0], e: e }; }
        return { name: 'Chat screen', e: null };
    }
    function buildReport() {
        const L = [];
        const th = document.documentElement.getAttribute('data-accent') || 'cyan';
        const sa = safeArea();
        const body = getComputedStyle(document.body);
        const kb = window.visualViewport && window.visualViewport.height < innerHeight * 0.75;
        L.push('UI MAP (live look at the whole Horizon app, taken as Fezzy sent this message)');
        L.push('Screen: ' + innerWidth + '\u00d7' + innerHeight + ' css px | DPR ' + (Math.round(devicePixelRatio * 100) / 100) + ' | ' + (innerWidth > innerHeight ? 'landscape' : 'portrait') + ' | theme: ' + th + ' | safe area top/right/bottom/left ' + sa.join('/') + ' | keyboard ' + (kb ? 'open' : 'closed'));
        L.push('Fonts: body ' + px(body.fontSize) + 'px ' + clean(body.fontFamily, 60) + ' | mono ' + clean(getComputedStyle(document.documentElement).getPropertyValue('--mono') || 'n/a', 50));
        const tk = tokensLine();
        if (tk) L.push('DESIGN TOKENS (' + th + ' theme, resolved): ' + tk);
        L.push('LAYERS (open or closed): ' + LAYERS.concat(FIXED).map(x => { const e = $(x[1]); if (!e) return x[0] + ' missing'; return x[0] + ' ' + (onscreen(e) ? 'OPEN ' + rectTxt(e.getBoundingClientRect()) : 'closed'); }).join(' | '));

        const top = topLayer();
        const nodes = { n: 0 };
        const chat = $('.chat-interface');
        if (chat) {
            const cl = walk(chat, top.e ? 26 : 46, 4);
            L.push('CHAT SCREEN' + (top.e ? ' (behind the top layer)' : ' (this is what Fezzy is looking at)') + ':');
            cl.forEach(x => L.push(x));
            const cm = $('#chatMessages');
            if (cm) {
                const ub = cm.querySelector('.message.user .bubble'), ab = cm.querySelector('.message:not(.user) .bubble');
                L.push('  chat messages: ' + cm.querySelectorAll('.message').length + ' (text not read)' + (ub ? ' | user bubble ' + Math.round(ub.getBoundingClientRect().width) + 'px wide ' + styleOf(ub, getComputedStyle(cm)) : '') + (ab ? ' | AI bubble ' + styleOf(ab, getComputedStyle(cm)) : ''));
            }
            nodes.n += cl.length;
        }
        if (top.e) {
            const tl = walk(top.e, 64, 6);
            L.push('TOP LAYER: ' + top.name + ':');
            tl.forEach(x => L.push(x));
            nodes.n += tl.length;
        }
        const probs = scanProblems(top.e || chat || document.body);
        L.push('PROBLEMS (auto-checked' + (top.e ? ' on the top layer' : ' on the chat screen') + '): ' + (probs.length ? '' : 'none found.'));
        probs.forEach(p => L.push('- ' + p));
        let txt = L.join('\n');
        if (txt.length > MAX_REPORT) txt = txt.slice(0, MAX_REPORT) + '\n\u2026 (UI map cut to stay small)';
        view.rep = { text: txt, nodes: nodes.n, problems: probs, layer: top.name, at: Date.now() };
        return txt;
    }

    // ---------- screenshot (private parts blurred first) ----------
    function maskOn() {
        const hit = [];
        const add = e => { if (e && !e.classList.contains('hzl-mask')) { e.classList.add('hzl-mask'); hit.push(e); } };
        document.querySelectorAll('.tab-body[data-tab="vault"], [data-hz-private], .att-pv, input[type="password"]').forEach(add);
        document.querySelectorAll('input,textarea').forEach(e => { if (e.type !== 'checkbox' && e.type !== 'radio' && e.id !== 'chatInput' && isSecret(e)) add(e); });
        return () => hit.forEach(e => e.classList.remove('hzl-mask'));
    }
    async function shot() {
        if (!host.native) return null;
        const undo = maskOn();
        try {
            await frames();
            const r = await host.native('HorizonLens', 'shot', { max: 1024, quality: 78 });
            return r && r.b64 ? r : null;
        } catch (e) { return null; } finally { undo(); }
    }

    // ---------- the hook the chat uses ----------
    async function prepare(text) {
        pending = null;
        if (!enabled() || !wants(text)) return null;
        const p = { report: buildReport(), shot: null };
        pending = p;
        const sees = !!host.canSee();
        if (shotOn() && sees) p.shot = await shot();
        return { map: true, shot: !!p.shot, sees: sees, wantedShot: shotOn() };
    }
    const images = () => (pending && pending.shot ? [{ mime: pending.shot.mime || 'image/jpeg', b64: pending.shot.b64 }] : []);
    const done = () => { pending = null; };
    function block() {
        if (!enabled()) return '';
        if (pending) {
            const pic = pending.shot ? ' and a real screenshot of the app attached to his latest message (the Vault, keys and other private fields are blurred)' : (shotOn() ? ' (no screenshot this time: this model cannot see pictures or the capture failed, so work from the map)' : '');
            return 'UI LENS\nFezzy asked how the app looks, so this turn you have the FULL UI MAP below' + pic + '. Judge it like a UI designer who also reads code: name the exact element, the property and the value to change (for example "#hzBadge: font-size 11px, padding 4px 8px"). Sizes are CSS px at the moment he sent the message. Never claim to see anything that is not in the map or the picture, and never ask for keys, tokens or the Vault.\n\n' + pending.report;
        }
        return 'UI LENS\nOn. When Fezzy asks how the app looks, a full UI map and a real screenshot ride along with his message. If he asks about the look and this prompt has no UI MAP, tell him to ask again in those words, or set Lens to Always (Apps menu, Lens).';
    }

    // ---------- the Lens window (Apps menu tile) ----------
    function btn(label, fn, cls, dis) {
        const b = el('button', 'hzl-btn' + (cls ? ' ' + cls : ''), label);
        b.type = 'button'; b.disabled = !!dis; b.addEventListener('click', fn);
        return b;
    }
    function render() {
        panel = $('#hzLensView');
        if (!panel) return;
        const y = panel.parentElement ? panel.parentElement.scrollTop : 0;
        const f = document.createDocumentFragment();
        const wrap = el('div', 'hzl');

        const head = el('div', 'hzl-head');
        const eye = el('div', 'hzl-eye'); eye.innerHTML = '<svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8V5a1 1 0 0 1 1-1h3"/><path d="M16 4h3a1 1 0 0 1 1 1v3"/><path d="M20 16v3a1 1 0 0 1-1 1h-3"/><path d="M8 20H5a1 1 0 0 1-1-1v-3"/><circle cx="12" cy="12" r="3.5"/></svg>';
        head.appendChild(eye);
        const ht = el('div', 'hzl-ht');
        ht.appendChild(el('b', null, 'Lens'));
        ht.appendChild(el('span', null, 'What the AI sees when you ask how the app looks'));
        head.appendChild(ht);
        wrap.appendChild(head);

        if (!host.screenOn()) wrap.appendChild(el('p', 'hzl-warn', 'Screen is switched off in the + menu, so Lens is paused. Switch Screen on and the AI can look again.'));

        const modeBox = el('section', 'hzl-sec');
        modeBox.appendChild(el('h4', 'hzl-h', 'WHEN THE AI LOOKS'));
        const seg = el('div', 'hzl-seg'); seg.setAttribute('role', 'radiogroup');
        [['auto', 'Auto'], ['always', 'Always'], ['off', 'Off']].forEach(a => {
            const b = el('button', 'hzl-segb' + (mode() === a[0] ? ' on' : ''), a[1]);
            b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', mode() === a[0] ? 'true' : 'false');
            b.addEventListener('click', () => { setMode(a[0]); render(); });
            seg.appendChild(b);
        });
        modeBox.appendChild(seg);
        modeBox.appendChild(el('p', 'hzl-sub', mode() === 'auto' ? 'Auto: the AI gets the full UI map and a screenshot only when your message is about how something looks, feels or lines up.' : mode() === 'always' ? 'Always: every message carries the UI map and a screenshot. Uses more tokens.' : 'Off: the AI only gets the small Screen view.'));
        const sw = el('button', 'hzl-sw' + (shotOn() ? ' on' : ''));
        sw.type = 'button'; sw.setAttribute('role', 'switch'); sw.setAttribute('aria-checked', shotOn() ? 'true' : 'false');
        sw.appendChild(el('span', 'hzl-sw-t', 'Send a real screenshot'));
        sw.appendChild(el('i', 'hzl-knob'));
        sw.addEventListener('click', () => { setShot(!shotOn()); render(); });
        modeBox.appendChild(sw);
        modeBox.appendChild(el('p', 'hzl-sub', host.canSee() ? 'The active model can see pictures. Vault, keys and password fields are blurred before the shot.' : 'The active model cannot see pictures, so it gets the UI map only. Gemini or a Llama 4 model on Groq can see the screenshot.'));
        wrap.appendChild(modeBox);

        const act = el('section', 'hzl-sec');
        act.appendChild(el('h4', 'hzl-h', 'TRY IT'));
        const row = el('div', 'hzl-row');
        row.appendChild(btn(view.busy === 'shot' ? 'Capturing\u2026' : 'Preview screenshot', preview, '', !!view.busy));
        row.appendChild(btn(view.busy === 'map' ? 'Reading\u2026' : 'Refresh UI map', refreshMap, '', !!view.busy));
        act.appendChild(row);
        const row2 = el('div', 'hzl-row');
        row2.appendChild(btn('Copy UI map', copyMap, 'ghost', !view.rep));
        row2.appendChild(btn('Ask the AI to review', askReview, 'ghost'));
        act.appendChild(row2);
        if (view.err) act.appendChild(el('p', 'hzl-err', view.err));
        wrap.appendChild(act);

        if (view.shot) {
            const sec = el('section', 'hzl-sec');
            sec.appendChild(el('h4', 'hzl-h', 'SCREENSHOT PREVIEW (the chat screen, private fields blurred)'));
            const im = el('img', 'hzl-shot'); im.alt = 'Screenshot of the app as the AI would see it'; im.src = 'data:' + (view.shot.mime || 'image/jpeg') + ';base64,' + view.shot.b64;
            sec.appendChild(im);
            sec.appendChild(el('p', 'hzl-sub', view.shot.w + '\u00d7' + view.shot.h + ' px \u00b7 ' + Math.max(1, Math.round((view.shot.bytes || view.shot.b64.length * 0.75) / 1024)) + ' KB \u00b7 via ' + (view.shot.via || 'native')));
            wrap.appendChild(sec);
        } else if (!host.native) {
            wrap.appendChild(el('p', 'hzl-sub', 'Screenshots need the Android app. In a browser the AI still gets the full UI map.'));
        }

        if (view.rep) {
            const r = view.rep;
            const sec = el('section', 'hzl-sec');
            sec.appendChild(el('h4', 'hzl-h', 'UI MAP'));
            sec.appendChild(el('p', 'hzl-sub', r.text.length.toLocaleString() + ' characters (about ' + Math.round(r.text.length / 3.6).toLocaleString() + ' tokens) \u00b7 ' + r.nodes + ' elements \u00b7 layer: ' + r.layer + ' \u00b7 ' + r.problems.length + ' problem' + (r.problems.length === 1 ? '' : 's') + ' found'));
            if (r.problems.length) { const ul = el('ul', 'hzl-probs'); r.problems.slice(0, 12).forEach(p => ul.appendChild(el('li', null, p))); sec.appendChild(ul); }
            const d = el('details', 'hzl-det'); d.appendChild(el('summary', null, 'Show the full map'));
            const pre = el('pre', 'hzl-pre'); pre.textContent = r.text; d.appendChild(pre);
            sec.appendChild(d);
            wrap.appendChild(sec);
        }
        f.appendChild(wrap);
        panel.replaceChildren(f);
        if (panel.parentElement && y) panel.parentElement.scrollTop = y;
    }
    async function withWindowHidden(fn) {
        const win = $('#hzExtensionWindow'), shade = $('#hzAddonShade');
        const was = [win && win.style.visibility, shade && shade.style.visibility];
        if (win) win.style.visibility = 'hidden';
        if (shade) shade.style.visibility = 'hidden';
        try { await frames(); return await fn(); }
        finally { if (win) win.style.visibility = was[0] || ''; if (shade) shade.style.visibility = was[1] || ''; }
    }
    async function preview() {
        view.busy = 'shot'; view.err = ''; render();
        try {
            await withWindowHidden(async () => {
                buildReport();
                const s = await shot();
                if (s) view.shot = s; else view.err = host.native ? 'The screenshot did not come back. Update to the build that includes the HorizonLens plugin.' : 'Screenshots only work inside the Android app.';
            });
        } catch (e) { view.err = 'Could not capture: ' + clean(e && e.message, 100); }
        view.busy = ''; render();
    }
    async function refreshMap() {
        view.busy = 'map'; view.err = ''; render();
        try { await withWindowHidden(async () => { buildReport(); }); } catch (e) { view.err = 'Could not read the UI: ' + clean(e && e.message, 100); }
        view.busy = ''; render();
    }
    function copyMap() {
        if (!view.rep) return;
        const t = view.rep.text;
        const ok = () => { view.err = ''; if (host.notice) host.notice('UI map copied.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, () => { view.err = 'Copy was blocked. Open the map and select the text.'; render(); });
        else { view.err = 'Copy is not available here. Open the map and select the text.'; render(); }
    }
    function askReview() {
        if (host.ask) host.ask('Look at my app right now and review the UI like a designer. What looks off, what is cramped or too big, and what would you change first? Give exact elements and values.');
    }
    function show() { render(); }

    function init(h) { host = Object.assign(host, h || {}); }
    window.HorizonLens = { init: init, show: show, prepare: prepare, images: images, done: done, block: block, mode: mode, setMode: setMode, enabled: enabled, wants: wants, report: buildReport, shot: shot };
})();
