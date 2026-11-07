/* HORIZON V1.49.0 · Creator. DiceBear avatars, Memegen.link memes and p5.js sketches. No keys.
   HorizonCreator.init({ notice, fetch, save }) adds a Create strip to the + menu (three buttons with SVG icons).
   Each button opens a full-screen sheet. Results can be attached to the next message, copied or saved.
   notice(text, kind)   shows a chat notice
   fetch(url)           optional fetch that works on the phone (falls back to window.fetch)
   save(blob, filename) optional native save, resolves to a label such as Documents/Horizon/x.png */
(function () {
  'use strict';

  var host = { notice: function () {}, fetch: null, save: null };
  var cur = null;      // the open sheet: { id, shade, pushed, onClose }
  var inited = false;

  // ---------- tiny helpers ----------
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var SVGNS = 'http://www.w3.org/2000/svg';
  var ICONS = {
    dice: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c.6-4.2 3.8-7 7.5-7s6.9 2.8 7.5 7"/>',
    meme: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M7 7.5h10M7 16.5h10"/><circle cx="9.5" cy="11" r=".7"/><circle cx="14.5" cy="11" r=".7"/><path d="M9.5 13c.7.7 1.5 1 2.5 1s1.8-.3 2.5-1"/>',
    p5: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M6.5 15c1.7-5.5 3.3-5.5 5-1.5s3.3 4 5-1.5"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    play: '<path d="M8 5l11 7-11 7z"/>',
    stop: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
    shuffle: '<path d="M16 3h5v5"/><path d="M4 20 21 3"/><path d="M21 16v5h-5"/><path d="M15 15l6 6"/><path d="M4 4l5 5"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/>',
    clip: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l9-9a3.5 3.5 0 0 1 5 5l-9 9a2 2 0 0 1-3-3l8-8"/>',
    save: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    code: '<path d="M8 8l-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>'
  };
  function svg(name, cls) {
    var s = document.createElementNS(SVGNS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', cls || 'ic');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name] || '';
    return s;
  }
  function btn(label, icon, cls, onClick) {
    var b = el('button', 'hzcr-btn' + (cls ? ' ' + cls : ''));
    b.type = 'button';
    if (icon) b.appendChild(svg(icon, 'hzcr-bi'));
    b.appendChild(el('span', '', label));
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function field(label, node) {
    var w = el('label', 'hzcr-field');
    w.appendChild(el('span', 'hzcr-lab', label));
    w.appendChild(node);
    return w;
  }
  function load(key, dflt) {
    try { var v = JSON.parse(localStorage.getItem(key) || 'null'); if (v && typeof v === 'object') return Object.assign({}, dflt, v); } catch (e) { /* storage off */ }
    return Object.assign({}, dflt);
  }
  function store(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage off */ } }
  function debounce(fn, ms) { var t = 0; return function () { var a = arguments, s = this; clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms); }; }
  function slug(s) { return String(s || 'x').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'x'; }
  function doFetch(url, opts) {
    var f = host.fetch || window.fetch.bind(window);
    return f(url, opts);
  }
  function note(t, k) { try { host.notice(t, k); } catch (e) { /* host gone */ } }

  async function copyText(t) {
    try { await navigator.clipboard.writeText(t); }
    catch (e) {
      var ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (x) { ok = false; }
      ta.remove();
      if (!ok) throw new Error('Copy is blocked here');
    }
    note('Copied.');
  }
  async function saveBlob(blob, name) {
    try {
      if (host.save) { var where = await host.save(blob, name); note('Saved ' + (where || name)); return; }
      var a = el('a'); a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      note('Saved ' + name);
    } catch (e) { note('Could not save: ' + (e && e.message || 'unknown error'), 'error'); }
  }
  async function attachBlob(blob, name, type) {
    if (!window.HorizonAttach) { note('Attachments are not available.', 'error'); return false; }
    var f = new File([blob], name, { type: type || blob.type || 'application/octet-stream' });
    await window.HorizonAttach.add([f]);
    note(name + ' is attached. Write your message and send.');
    closeSheet();
    return true;
  }
  function svgToPng(text, size) {
    return new Promise(function (res, rej) {
      var s = text;
      if (!/<svg[^>]*\swidth=/i.test(s)) s = s.replace(/<svg/i, '<svg width="' + size + '" height="' + size + '"');
      var im = new Image();
      im.onload = function () {
        var c = document.createElement('canvas'); c.width = size; c.height = size;
        c.getContext('2d').drawImage(im, 0, 0, size, size);
        c.toBlob(function (b) { b ? res(b) : rej(new Error('PNG export failed')); }, 'image/png');
      };
      im.onerror = function () { rej(new Error('Could not draw the SVG')); };
      im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s);
    });
  }
  function dataUrlToBlob(u) {
    var p = u.split(','), mime = (p[0].match(/:(.*?);/) || [])[1] || 'image/png', bin = atob(p[1]), n = bin.length, a = new Uint8Array(n);
    while (n--) a[n] = bin.charCodeAt(n);
    return new Blob([a], { type: mime });
  }

  // ---------- sheet (full-screen window) ----------
  function openSheet(id, title, icon, build) {
    closeSheet(true);
    var shade = el('div', 'hzcr-shade');
    var box = el('section', 'hzcr');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title);
    var head = el('header', 'hzcr-head');
    var h = el('h2', 'hzcr-title');
    h.appendChild(svg(icon, 'hzcr-ti'));
    h.appendChild(el('span', '', title));
    var x = el('button', 'hzcr-x'); x.type = 'button'; x.setAttribute('aria-label', 'Close ' + title);
    x.appendChild(svg('close', 'hzcr-bi'));
    x.addEventListener('click', function () { closeSheet(); });
    head.append(h, x);
    var body = el('div', 'hzcr-body');
    box.append(head, body);
    shade.appendChild(box);
    document.body.appendChild(shade);
    cur = { id: id, shade: shade, pushed: false, onClose: null };
    try { history.pushState(Object.assign({}, history.state || {}, { hzCreator: id }), ''); cur.pushed = true; } catch (e) { /* no history */ }
    build(body, function (fn) { if (cur) cur.onClose = fn; });
    setTimeout(function () { try { x.focus(); } catch (e) { /* ignore */ } }, 30);
  }
  function teardown() {
    if (!cur) return;
    var c = cur; cur = null;
    try { if (c.onClose) c.onClose(); } catch (e) { /* ignore */ }
    c.shade.remove();
  }
  function closeSheet(silent) {
    if (!cur) return;
    var wasPushed = cur.pushed, st = history.state;
    teardown();
    if (!silent && wasPushed && st && st.hzCreator) { try { history.back(); } catch (e) { /* ignore */ } }
    else if (silent && wasPushed && st && st.hzCreator) { try { history.replaceState(Object.assign({}, st, { hzCreator: null }), ''); } catch (e) { /* ignore */ } }
  }
  window.addEventListener('popstate', function () { if (cur && !(history.state && history.state.hzCreator)) teardown(); });
  document.addEventListener('keydown', function (e) { if (cur && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSheet(); } }, true);

  // ======================================================================
  // DiceBear
  // ======================================================================
  var DB_STYLES = ['adventurer', 'adventurer-neutral', 'avataaars', 'avataaars-neutral', 'big-ears', 'big-ears-neutral', 'big-smile', 'bottts', 'bottts-neutral', 'croodles', 'croodles-neutral', 'dylan', 'fun-emoji', 'glass', 'icons', 'identicon', 'initials', 'lorelei', 'lorelei-neutral', 'micah', 'miniavs', 'notionists', 'notionists-neutral', 'open-peeps', 'personas', 'pixel-art', 'pixel-art-neutral', 'rings', 'shapes', 'thumbs'];
  var DB_BGS = [['', 'None'], ['00e5ff', 'Cyan'], ['f97316', 'Orange'], ['ffffff', 'White'], ['000000', 'Black']];

  function openDiceBear() {
    openSheet('dicebear', 'Avatars', 'dice', function (body) {
      var S = load('hzcr.db', { style: 'avataaars', seed: 'Horizon', bg: '', flip: false, radius: 0 });
      if (DB_STYLES.indexOf(S.style) < 0) S.style = 'avataaars';
      var ver = '9.x', triedFallback = false;

      function url(fmt, size, seed) {
        var q = new URLSearchParams();
        q.set('seed', seed == null ? S.seed : seed);
        if (size) q.set('size', String(size));
        if (S.bg) q.set('backgroundColor', S.bg);
        if (S.flip) q.set('flip', 'true');
        if (S.radius > 0) q.set('radius', String(S.radius));
        return 'https://api.dicebear.com/' + ver + '/' + S.style + '/' + fmt + '?' + q.toString();
      }

      var stage = el('div', 'hzcr-stage hzcr-stage-sq');
      var img = el('img', 'hzcr-avatar'); img.alt = 'DiceBear avatar preview'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      var msg = el('p', 'hzcr-msg'); msg.setAttribute('role', 'status');
      stage.append(img, msg);

      var styleSel = el('select', 'hzcr-in');
      DB_STYLES.forEach(function (s) { var o = el('option', '', s); o.value = s; styleSel.appendChild(o); });
      styleSel.value = S.style;
      var seedIn = el('input', 'hzcr-in'); seedIn.type = 'text'; seedIn.value = S.seed; seedIn.autocomplete = 'off'; seedIn.spellcheck = false; seedIn.maxLength = 80;
      seedIn.setAttribute('autocapitalize', 'off');
      var dice = btn('Random', 'shuffle', 'hzcr-sm', function () { S.seed = Math.random().toString(36).slice(2, 8); seedIn.value = S.seed; render(); });
      var seedRow = el('div', 'hzcr-row'); seedRow.append(seedIn, dice);

      var bgRow = el('div', 'hzcr-chips'); bgRow.setAttribute('role', 'group'); bgRow.setAttribute('aria-label', 'Background colour');
      DB_BGS.forEach(function (b) {
        var c = el('button', 'hzcr-chip'); c.type = 'button'; c.dataset.v = b[0];
        c.setAttribute('aria-label', 'Background ' + b[1]);
        var dot = el('i', 'hzcr-dot'); dot.style.background = b[0] ? '#' + b[0] : 'transparent';
        c.append(dot, el('span', '', b[1]));
        c.addEventListener('click', function () { S.bg = b[0]; render(); });
        bgRow.appendChild(c);
      });
      var rad = el('input', 'hzcr-range'); rad.type = 'range'; rad.min = '0'; rad.max = '50'; rad.step = '5'; rad.value = String(S.radius);
      var radOut = el('output', 'hzcr-out', String(S.radius));
      var radRow = el('div', 'hzcr-row'); radRow.append(rad, radOut);
      var flip = el('input'); flip.type = 'checkbox'; flip.checked = !!S.flip;
      var flipLab = el('label', 'hzcr-check'); flipLab.append(flip, el('span', '', 'Flip horizontally'));

      var vars = el('div', 'hzcr-vars'); vars.setAttribute('aria-label', 'Variations: tap one to use its seed');

      var acts = el('div', 'hzcr-acts');
      acts.append(
        btn('Attach to chat', 'clip', 'hzcr-pri', async function () {
          try { var t = await svgText(); var png = await svgToPng(t, 512); await attachBlob(png, 'dicebear-' + slug(S.style) + '-' + slug(S.seed) + '.png', 'image/png'); }
          catch (e) { note('DiceBear: ' + (e && e.message || 'failed'), 'error'); }
        }),
        btn('Copy SVG', 'copy', '', async function () { try { await copyText(await svgText()); } catch (e) { note('DiceBear: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Save SVG', 'save', '', async function () { try { var t = await svgText(); await saveBlob(new Blob([t], { type: 'image/svg+xml' }), 'dicebear-' + slug(S.style) + '-' + slug(S.seed) + '.svg'); } catch (e) { note('DiceBear: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Save PNG', 'save', '', async function () { try { var png = await svgToPng(await svgText(), 512); await saveBlob(png, 'dicebear-' + slug(S.style) + '-' + slug(S.seed) + '.png'); } catch (e) { note('DiceBear: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Copy link', 'copy', '', function () { copyText(url('svg', 512)).catch(function (e) { note(e.message, 'error'); }); })
      );
      var hint = el('p', 'hzcr-hint', 'Same seed, same avatar. Free, no key. api.dicebear.com');

      body.append(stage, field('Style', styleSel), field('Seed (any text)', seedRow), field('Background', bgRow), field('Corner radius', radRow), flipLab, el('div', 'hzcr-lab hzcr-lab-solo', 'Variations'), vars, acts, hint);

      async function svgText() {
        var res = await doFetch(url('svg', 512));
        if (!res.ok) throw new Error('DiceBear answered ' + res.status);
        var t = await res.text();
        if (t.indexOf('<svg') < 0) throw new Error('DiceBear sent something that is not an SVG');
        return t;
      }
      function render() {
        S.seed = seedIn.value || 'Horizon';
        S.style = styleSel.value;
        S.radius = Number(rad.value) || 0;
        S.flip = flip.checked;
        radOut.textContent = String(S.radius);
        store('hzcr.db', S);
        bgRow.querySelectorAll('.hzcr-chip').forEach(function (c) { c.classList.toggle('on', c.dataset.v === S.bg); c.setAttribute('aria-pressed', c.dataset.v === S.bg ? 'true' : 'false'); });
        msg.textContent = 'Loading...'; stage.classList.add('busy');
        img.src = url('svg', 512);
        vars.replaceChildren();
        for (var i = 1; i <= 6; i++) {
          (function (n) {
            var seed = S.seed + '-' + n;
            var b = el('button', 'hzcr-var'); b.type = 'button'; b.setAttribute('aria-label', 'Use seed ' + seed);
            var im = el('img'); im.alt = ''; im.loading = 'lazy'; im.decoding = 'async'; im.referrerPolicy = 'no-referrer'; im.src = url('svg', 128, seed);
            b.appendChild(im);
            b.addEventListener('click', function () { seedIn.value = seed; render(); });
            vars.appendChild(b);
          })(i);
        }
      }
      img.addEventListener('load', function () { msg.textContent = ''; stage.classList.remove('busy'); });
      img.addEventListener('error', function () {
        if (!triedFallback && ver === '9.x') { triedFallback = true; ver = '7.x'; render(); return; }
        stage.classList.remove('busy');
        msg.textContent = 'Could not load. Check your connection and the style name.';
      });
      var deb = debounce(render, 350);
      seedIn.addEventListener('input', deb);
      styleSel.addEventListener('change', render);
      rad.addEventListener('input', deb);
      flip.addEventListener('change', render);
      render();
    });
  }

  // ======================================================================
  // Memegen.link
  // ======================================================================
  var MG_BASE = 'https://api.memegen.link';
  var MG_FALLBACK = [
    ['buzz', 'X, X everywhere', 2], ['ds', 'Daily Struggle', 3], ['oprah', 'Oprah You Get A', 2], ['iw', 'Inigo Montoya', 2], ['rollsafe', 'Roll Safe', 2],
    ['pigeon', 'Is This a Pigeon?', 3], ['ugandanknuck', 'Ugandan Knuckles', 2], ['both', 'Why Not Both?', 2], ['drake', 'Drakeposting', 2],
    ['db', 'Distracted Boyfriend', 3], ['fry', 'Futurama Fry', 2], ['doge', 'Doge', 2], ['fine', 'This Is Fine', 2], ['cmm', 'Change My Mind', 1],
    ['gru', "Gru's Plan", 4], ['harold', 'Hide the Pain Harold', 2], ['spiderman', 'Spider-Man Pointing', 2], ['success', 'Success Kid', 2],
    ['wonka', 'Condescending Wonka', 2], ['philosoraptor', 'Philosoraptor', 2], ['blb', 'Bad Luck Brian', 2], ['yuno', 'Y U No', 2], ['custom', 'Custom background', 2]
  ];
  var mgTpl = null;

  // Memegen escapes: space/underscore/dash, then the symbols that would break a URL path.
  function mgEsc(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return '_';
    s = s.replace(/_/g, '__').replace(/-/g, '--').replace(/ /g, '_')
      .replace(/\?/g, '~q').replace(/&/g, '~a').replace(/%/g, '~p').replace(/#/g, '~h').replace(/\//g, '~s').replace(/\\/g, '~b')
      .replace(/</g, '~l').replace(/>/g, '~g').replace(/"/g, "''").replace(/\r?\n/g, '~n');
    return encodeURIComponent(s);
  }
  async function mgTemplates() {
    if (mgTpl) return mgTpl;
    try {
      var c = JSON.parse(localStorage.getItem('hzcr.mgtpl') || 'null');
      if (c && c.length > 20) mgTpl = c;
    } catch (e) { /* no cache */ }
    try {
      var res = await doFetch(MG_BASE + '/templates/');
      if (!res.ok) throw new Error('status ' + res.status);
      var arr = await res.json();
      var slim = arr.filter(function (t) { return t && t.id; }).map(function (t) {
        return { id: t.id, name: t.name || t.id, lines: Math.max(1, Math.min(6, Number(t.lines) || 2)), ex: (t.example && t.example.text) || [] };
      });
      if (slim.length > 20) { mgTpl = slim; try { localStorage.setItem('hzcr.mgtpl', JSON.stringify(slim)); } catch (e) { /* too big */ } }
    } catch (e) { /* keep cache or fallback */ }
    if (!mgTpl) mgTpl = MG_FALLBACK.map(function (t) { return { id: t[0], name: t[1], lines: t[2], ex: [] }; });
    if (!mgTpl.some(function (t) { return t.id === 'custom'; })) mgTpl.push({ id: 'custom', name: 'Custom background', lines: 2, ex: [] });
    return mgTpl;
  }

  function openMemegen() {
    openSheet('memegen', 'Memes', 'meme', function (body) {
      var S = load('hzcr.mg', { id: 'buzz', ext: 'jpg', width: '600', bg: '', texts: {} });
      var tpls = MG_FALLBACK.map(function (t) { return { id: t[0], name: t[1], lines: t[2], ex: [] }; });

      var stage = el('div', 'hzcr-stage hzcr-stage-meme');
      var img = el('img', 'hzcr-meme'); img.alt = 'Meme preview'; img.decoding = 'async'; img.referrerPolicy = 'no-referrer';
      var msg = el('p', 'hzcr-msg'); msg.setAttribute('role', 'status');
      stage.append(img, msg);

      var find = el('input', 'hzcr-in'); find.type = 'search'; find.placeholder = 'Find a template (drake, buzz, doge...)'; find.autocomplete = 'off'; find.spellcheck = false;
      find.setAttribute('autocapitalize', 'off');
      var sel = el('select', 'hzcr-in');
      var linesBox = el('div', 'hzcr-lines');
      var bgIn = el('input', 'hzcr-in'); bgIn.type = 'url'; bgIn.placeholder = 'https://... image link'; bgIn.value = S.bg; bgIn.spellcheck = false; bgIn.setAttribute('autocapitalize', 'off');
      var bgField = field('Background image link (custom template)', bgIn);
      var extSel = el('select', 'hzcr-in');
      [['jpg', 'JPG (small)'], ['png', 'PNG'], ['webp', 'WebP'], ['gif', 'GIF']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; extSel.appendChild(op); });
      extSel.value = S.ext;
      var widSel = el('select', 'hzcr-in');
      [['', 'Template size'], ['400', '400 px'], ['600', '600 px'], ['800', '800 px'], ['1000', '1000 px']].forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; widSel.appendChild(op); });
      widSel.value = S.width;
      var fmtRow = el('div', 'hzcr-row2'); fmtRow.append(field('Format', extSel), field('Width', widSel));

      var acts = el('div', 'hzcr-acts');
      acts.append(
        btn('Attach to chat', 'clip', 'hzcr-pri', async function () {
          try { var b = await memeBlob(); await attachBlob(b, 'meme-' + slug(S.id) + '.' + S.ext, b.type || 'image/' + (S.ext === 'jpg' ? 'jpeg' : S.ext)); }
          catch (e) { note('Memegen: ' + (e && e.message || 'failed'), 'error'); }
        }),
        btn('Random example', 'shuffle', '', function () { example(); }),
        btn('Save image', 'save', '', async function () { try { await saveBlob(await memeBlob(), 'meme-' + slug(S.id) + '.' + S.ext); } catch (e) { note('Memegen: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Copy link', 'copy', '', function () { var u = memeUrl(); if (!u) { note('Add a background link first.', 'error'); return; } copyText(u).catch(function (e) { note(e.message, 'error'); }); })
      );
      var hint = el('p', 'hzcr-hint', 'Free, no key. api.memegen.link. Empty lines stay blank.');

      body.append(stage, find, field('Template', sel), linesBox, bgField, fmtRow, acts, hint);

      function tpl() { return tpls.find(function (t) { return t.id === S.id; }) || tpls[0]; }
      function fillSelect(filter) {
        var f = String(filter || '').toLowerCase();
        sel.replaceChildren();
        var list = tpls.filter(function (t) { return !f || t.id.toLowerCase().indexOf(f) >= 0 || t.name.toLowerCase().indexOf(f) >= 0; });
        if (!list.length) { var none = el('option', '', 'No match'); none.value = ''; sel.appendChild(none); return; }
        list.forEach(function (t) { var o = el('option', '', t.name + '  (' + t.id + ')'); o.value = t.id; sel.appendChild(o); });
        sel.value = list.some(function (t) { return t.id === S.id; }) ? S.id : list[0].id;
        if (sel.value !== S.id) { S.id = sel.value; buildLines(); render(); }
      }
      function texts() { return S.texts[S.id] || (S.texts[S.id] = []); }
      function buildLines() {
        var t = tpl(), arr = texts();
        linesBox.replaceChildren();
        for (var i = 0; i < t.lines; i++) {
          (function (n) {
            var inp = el('input', 'hzcr-in'); inp.type = 'text'; inp.maxLength = 140; inp.autocomplete = 'off';
            inp.placeholder = t.lines === 2 ? (n === 0 ? 'Top text' : 'Bottom text') : 'Line ' + (n + 1);
            inp.value = arr[n] || '';
            inp.addEventListener('input', function () { texts()[n] = inp.value; renderSoon(); });
            linesBox.appendChild(inp);
          })(i);
        }
        bgField.hidden = S.id !== 'custom';
      }
      function memeUrl() {
        var t = tpl(), arr = texts(), parts = [];
        for (var i = 0; i < t.lines; i++) parts.push(mgEsc(arr[i]));
        var u;
        if (S.id === 'custom') {
          if (!S.bg) return '';
          u = MG_BASE + '/images/custom/' + parts.join('/') + '.' + S.ext + '?background=' + encodeURIComponent(S.bg);
        } else u = MG_BASE + '/images/' + encodeURIComponent(S.id) + '/' + parts.join('/') + '.' + S.ext;
        if (S.width) u += (u.indexOf('?') >= 0 ? '&' : '?') + 'width=' + S.width;
        return u;
      }
      async function memeBlob() {
        var u = memeUrl();
        if (!u) throw new Error('Add a background image link first');
        var res = await doFetch(u);
        if (!res.ok) throw new Error('Memegen answered ' + res.status);
        var b = await res.blob();
        if (!/^image\//.test(b.type)) throw new Error('Memegen did not send an image');
        return b;
      }
      function example() {
        var t = tpl(), arr = texts();
        if (!t.ex || !t.ex.length) { note('This template has no example text.', 'error'); return; }
        t.ex.forEach(function (x, i) { arr[i] = x; });
        buildLines(); render();
      }
      function render() {
        store('hzcr.mg', S);
        var u = memeUrl();
        if (!u) { img.removeAttribute('src'); msg.textContent = 'Paste a background image link below.'; stage.classList.remove('busy'); return; }
        msg.textContent = 'Loading...'; stage.classList.add('busy');
        img.src = u;
      }
      var renderSoon = debounce(render, 450);
      img.addEventListener('load', function () { msg.textContent = ''; stage.classList.remove('busy'); });
      img.addEventListener('error', function () { stage.classList.remove('busy'); msg.textContent = 'No image. Check the template, the link and your connection.'; });
      find.addEventListener('input', function () { fillSelect(find.value); });
      sel.addEventListener('change', function () { if (!sel.value) return; S.id = sel.value; buildLines(); render(); });
      extSel.addEventListener('change', function () { S.ext = extSel.value; render(); });
      widSel.addEventListener('change', function () { S.width = widSel.value; render(); });
      bgIn.addEventListener('input', function () { S.bg = bgIn.value.trim(); renderSoon(); });

      if (!tpls.some(function (t) { return t.id === S.id; })) tpls.push({ id: S.id, name: S.id, lines: 2, ex: [] });
      fillSelect(''); buildLines(); render();
      mgTemplates().then(function (list) {
        if (!cur || cur.id !== 'memegen') return;
        tpls = list;
        if (!tpls.some(function (t) { return t.id === S.id; })) S.id = tpls[0].id;
        fillSelect(find.value); buildLines(); render();
      });
    });
  }

  // ======================================================================
  // p5.js
  // ======================================================================
  var P5_VER = '1.9.4';
  var P5_URLS = ['https://cdn.jsdelivr.net/npm/p5@' + P5_VER + '/lib/p5.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/' + P5_VER + '/p5.min.js'];
  var P5_CACHE = 'hzcr-p5', P5_KEY = 'https://hzcr.invalid/p5-' + P5_VER + '.js';
  var p5src = '';

  var P5_SAMPLES = {
    'Neon flow field':
      'let pts = [];\n\nfunction setup() {\n  createCanvas(360, 360);\n  colorMode(HSB, 360, 100, 100, 100);\n  background(0);\n  noStroke();\n  for (let i = 0; i < 400; i++) pts.push(createVector(random(width), random(height)));\n}\n\nfunction draw() {\n  fill(0, 0, 0, 6);\n  rect(0, 0, width, height);\n  for (const p of pts) {\n    const a = noise(p.x * 0.006, p.y * 0.006, frameCount * 0.004) * TAU * 2;\n    p.x += cos(a) * 1.4;\n    p.y += sin(a) * 1.4;\n    if (p.x < 0 || p.x > width || p.y < 0 || p.y > height) {\n      p.x = random(width);\n      p.y = random(height);\n    }\n    fill(180 + sin(a) * 30, 90, 100, 80);\n    circle(p.x, p.y, 2);\n  }\n}\n',
    'Pulse rings':
      'function setup() {\n  createCanvas(360, 360);\n  noFill();\n  strokeWeight(2);\n}\n\nfunction draw() {\n  background(0, 40);\n  translate(width / 2, height / 2);\n  for (let i = 0; i < 14; i++) {\n    const r = (frameCount * 1.2 + i * 14) % 170;\n    const k = 1 - r / 170;\n    if (i % 2) stroke(0, 229, 255, 255 * k);\n    else stroke(249, 115, 22, 255 * k);\n    circle(0, 0, r * 2 + sin(frameCount * 0.05 + i) * 6);\n  }\n}\n',
    'Touch sparks':
      'const bits = [];\n\nfunction setup() {\n  createCanvas(360, 360);\n  colorMode(HSB, 360, 100, 100, 255);\n  noStroke();\n}\n\nfunction draw() {\n  background(0, 0, 0, 40);\n  if (mouseIsPressed || frameCount % 5 === 0) {\n    const x = mouseIsPressed ? mouseX : random(width);\n    const y = mouseIsPressed ? mouseY : random(height);\n    for (let i = 0; i < 4; i++) bits.push({ x, y, vx: random(-2, 2), vy: random(-3, 0.5), life: 255, h: random(170, 210) });\n  }\n  for (let i = bits.length - 1; i >= 0; i--) {\n    const b = bits[i];\n    b.x += b.vx;\n    b.y += b.vy;\n    b.vy += 0.05;\n    b.life -= 4;\n    fill(b.h, 80, 100, b.life);\n    circle(b.x, b.y, 4);\n    if (b.life <= 0) bits.splice(i, 1);\n  }\n  fill(0, 0, 100, 160);\n  textSize(12);\n  text("touch to draw", 10, 20);\n}\n',
    'Sine weave':
      'function setup() {\n  createCanvas(360, 360);\n  noFill();\n  stroke(0, 229, 255, 170);\n}\n\nfunction draw() {\n  background(0);\n  for (let y = 20; y < height; y += 12) {\n    beginShape();\n    for (let x = 0; x <= width; x += 6) {\n      vertex(x, y + sin(x * 0.04 + frameCount * 0.04 + y * 0.05) * 10);\n    }\n    endShape();\n  }\n}\n',
    "Starfield":
      "let stars = [];\n\nfunction setup() {\n  createCanvas(360, 360);\n  for (let i = 0; i < 160; i++) stars.push({ x: random(-180, 180), y: random(-180, 180), z: random(360) });\n}\n\nfunction draw() {\n  background(8);\n  translate(width / 2, height / 2);\n  noStroke();\n  for (const s of stars) {\n    s.z -= 4;\n    if (s.z < 1) { s.x = random(-180, 180); s.y = random(-180, 180); s.z = 360; }\n    const sx = (s.x / s.z) * 180, sy = (s.y / s.z) * 180;\n    fill(0, 229, 255, map(s.z, 0, 360, 255, 60));\n    circle(sx, sy, map(s.z, 0, 360, 4, 0.5));\n  }\n}",
    "Spirograph":
      "let t = 0;\n\nfunction setup() {\n  createCanvas(360, 360);\n  background(8);\n  strokeWeight(2);\n}\n\nfunction draw() {\n  translate(width / 2, height / 2);\n  const R = 120, r = 47, d = 80;\n  stroke(0, 229, 255, 170);\n  for (let i = 0; i < 18; i++) {\n    const a = t + i * 0.01;\n    point((R - r) * cos(a) + d * cos(((R - r) / r) * a), (R - r) * sin(a) - d * sin(((R - r) / r) * a));\n  }\n  t += 0.18;\n  if (t > TWO_PI * 47) { t = 0; background(8); }\n}",
    "Matrix rain":
      "let cols, drops = [];\n\nfunction setup() {\n  createCanvas(360, 360);\n  textFont('monospace');\n  textSize(14);\n  cols = floor(width / 14);\n  for (let i = 0; i < cols; i++) drops.push(random(-20, 0));\n  background(0);\n}\n\nfunction draw() {\n  background(0, 0, 0, 40);\n  fill(0, 255, 140);\n  for (let i = 0; i < cols; i++) {\n    text('01ABCDEFGHJKLMNPQRSTUVWXYZ'.charAt(floor(random(26))), i * 14, drops[i] * 14);\n    if (drops[i] * 14 > height && random() > 0.95) drops[i] = 0;\n    drops[i] += 0.6;\n  }\n}",
    "Bouncing balls":
      "let balls = [];\n\nfunction setup() {\n  createCanvas(360, 360);\n  colorMode(HSB, 360, 100, 100, 100);\n  noStroke();\n  for (let i = 0; i < 14; i++) {\n    balls.push({ x: random(40, 320), y: random(40, 320), vx: random(-3, 3), vy: random(-3, 3), r: random(10, 22), h: random(360) });\n  }\n}\n\nfunction draw() {\n  background(230, 40, 10, 35);\n  for (const b of balls) {\n    b.x += b.vx; b.y += b.vy;\n    if (b.x < b.r || b.x > width - b.r) b.vx *= -1;\n    if (b.y < b.r || b.y > height - b.r) b.vy *= -1;\n    fill(b.h, 80, 100, 90);\n    circle(b.x, b.y, b.r * 2);\n  }\n}",
    "Kaleidoscope":
      "let t = 0;\n\nfunction setup() {\n  createCanvas(360, 360);\n  colorMode(HSB, 360, 100, 100, 100);\n  background(0, 0, 6);\n  noStroke();\n}\n\nfunction draw() {\n  translate(width / 2, height / 2);\n  const r = 40 + 70 * noise(t);\n  const a = t * 2;\n  for (let i = 0; i < 8; i++) {\n    push();\n    rotate((TWO_PI / 8) * i);\n    fill((t * 40) % 360, 80, 100, 35);\n    circle(cos(a) * r, sin(a * 1.3) * r, 10);\n    pop();\n  }\n  t += 0.02;\n  if (frameCount % 900 === 0) background(0, 0, 6);\n}",
    "Wave lines":
      "function setup() {\n  createCanvas(360, 360);\n  colorMode(HSB, 360, 100, 100, 100);\n  noFill();\n  strokeWeight(2);\n}\n\nfunction draw() {\n  background(0, 0, 6);\n  for (let y = 20; y < height; y += 16) {\n    beginShape();\n    for (let x = 0; x <= width; x += 8) {\n      vertex(x, y + sin(x * 0.03 + frameCount * 0.04 + y * 0.05) * 10 + sin(x * 0.011 - frameCount * 0.02) * 6);\n    }\n    stroke((y * 1.2 + frameCount) % 360, 70, 100);\n    endShape();\n  }\n}"
  };

  async function loadP5(onStatus) {
    if (p5src) return p5src;
    try {
      if (window.caches) {
        var c = await caches.open(P5_CACHE), hit = await c.match(P5_KEY);
        if (hit) { var t = await hit.text(); if (t.length > 200000) { p5src = t; return p5src; } }
      }
    } catch (e) { /* no cache storage */ }
    var lastErr = 'no connection';
    for (var i = 0; i < P5_URLS.length; i++) {
      try {
        if (onStatus) onStatus('Loading p5.js ' + P5_VER + ' (first run only)...');
        var res = await doFetch(P5_URLS[i]);
        if (!res.ok) throw new Error('status ' + res.status);
        var text = await res.text();
        if (text.length < 200000 || text.indexOf('p5') < 0) throw new Error('unexpected file');
        p5src = text;
        try { if (window.caches) { var cc = await caches.open(P5_CACHE); await cc.put(P5_KEY, new Response(text, { headers: { 'content-type': 'text/javascript' } })); } } catch (e) { /* cache full */ }
        return p5src;
      } catch (e) { lastErr = (e && e.message) || 'failed'; }
    }
    throw new Error('Could not load p5.js (' + lastErr + '). It needs the internet once, then it is kept on the phone.');
  }

  function p5Doc(src, code) {
    var safe = function (s) { return String(s).replace(/<\/script/gi, '<\\/script'); };
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<style>html,body{margin:0;height:100%;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center}canvas{display:block;max-width:100%;max-height:100%;width:auto!important;height:auto!important;touch-action:none}</style>' +
      '<script>window.onerror=function(m,s,l){parent.postMessage({hzcr:"err",msg:String(m)+(l?" (line "+l+")":"")},"*");return true};' +
      'window.addEventListener("unhandledrejection",function(e){parent.postMessage({hzcr:"err",msg:String(e.reason&&e.reason.message||e.reason)},"*")});' +
      'window.addEventListener("message",function(e){var d=e.data;if(d&&d.hzcr==="snap"){var c=document.querySelector("canvas"),u="";try{u=c?c.toDataURL("image/png"):""}catch(x){}parent.postMessage({hzcr:"png",id:d.id,url:u},"*")}});' +
      'window.addEventListener("load",function(){parent.postMessage({hzcr:"ready"},"*")});<\/script>' +
      '<script>' + safe(src) + '<\/script></head><body><script>' + safe(code) + '<\/script></body></html>';
  }

  function openP5() {
    openSheet('p5', 'Visuals', 'p5', function (body, onClose) {
      var S = load('hzcr.p5', { sample: 'Neon flow field', code: '' });
      if (!S.code || typeof S.code !== 'string') S.code = P5_SAMPLES[S.sample] || P5_SAMPLES['Neon flow field'];
      var frame = null, snapId = 0, snapWait = null;

      var stage = el('div', 'hzcr-stage hzcr-stage-sq hzcr-stage-p5');
      var holder = el('div', 'hzcr-holder');
      var msg = el('p', 'hzcr-msg', 'Tap Run to start the sketch.'); msg.setAttribute('role', 'status');
      stage.append(holder, msg);
      var errBox = el('pre', 'hzcr-err'); errBox.hidden = true;

      var sampleSel = el('select', 'hzcr-in');
      Object.keys(P5_SAMPLES).forEach(function (k) { var o = el('option', '', k); o.value = k; sampleSel.appendChild(o); });
      var cu = el('option', '', 'Your code'); cu.value = '__mine'; sampleSel.appendChild(cu);
      sampleSel.value = P5_SAMPLES[S.sample] === S.code ? S.sample : '__mine';

      var ta = el('textarea', 'hzcr-code'); ta.value = S.code; ta.spellcheck = false; ta.rows = 14; ta.wrap = 'off';
      ta.setAttribute('autocapitalize', 'off'); ta.setAttribute('autocorrect', 'off'); ta.setAttribute('aria-label', 'p5.js sketch code');

      var runB = btn('Run', 'play', 'hzcr-pri', function () { run(); });
      var stopB = btn('Stop', 'stop', '', function () { stop('Stopped.'); });
      var runRow = el('div', 'hzcr-acts'); runRow.append(runB, stopB);
      var acts = el('div', 'hzcr-acts');
      acts.append(
        btn('Attach picture', 'clip', '', async function () { try { await attachBlob(await snap(), 'p5-sketch.png', 'image/png'); } catch (e) { note('p5.js: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Attach code', 'code', '', async function () { try { await attachBlob(new Blob([ta.value], { type: 'text/javascript' }), 'sketch.js', 'text/javascript'); } catch (e) { note('p5.js: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Save PNG', 'save', '', async function () { try { await saveBlob(await snap(), 'p5-sketch-' + Date.now() + '.png'); } catch (e) { note('p5.js: ' + (e && e.message || 'failed'), 'error'); } }),
        btn('Save code', 'save', '', function () { saveBlob(new Blob([ta.value], { type: 'text/javascript' }), 'sketch-' + Date.now() + '.js'); }),
        btn('Copy code', 'copy', '', function () { copyText(ta.value).catch(function (e) { note(e.message, 'error'); }); })
      );
      var hint = el('p', 'hzcr-hint', 'p5.js ' + P5_VER + ' runs in a sealed frame: it cannot touch your chats, keys or Vault. Needs the internet once, then it is cached.');

      body.append(stage, errBox, runRow, field('Sketch', sampleSel), ta, acts, hint);

      function status(t) { msg.textContent = t || ''; }
      function stop(t) {
        if (frame) { frame.remove(); frame = null; }
        holder.replaceChildren();
        status(t || '');
      }
      async function run() {
        S.code = ta.value;
        store('hzcr.p5', { sample: sampleSel.value === '__mine' ? '' : sampleSel.value, code: S.code.slice(0, 40000) });
        errBox.hidden = true; errBox.textContent = '';
        stop('Starting...');
        runB.disabled = true;
        try {
          var src = await loadP5(status);
          var f = el('iframe', 'hzcr-frame');
          f.setAttribute('sandbox', 'allow-scripts');
          f.setAttribute('title', 'p5.js sketch');
          f.srcdoc = p5Doc(src, S.code);
          holder.replaceChildren(f);
          frame = f;
          status('');
        } catch (e) { status(e && e.message || 'Could not start.'); }
        runB.disabled = false;
      }
      function snap() {
        return new Promise(function (res, rej) {
          if (!frame || !frame.contentWindow) { rej(new Error('Run the sketch first')); return; }
          var id = ++snapId;
          var t = setTimeout(function () { snapWait = null; rej(new Error('The sketch did not answer')); }, 4000);
          snapWait = function (url) {
            clearTimeout(t); snapWait = null;
            if (!url) { rej(new Error('No canvas to save yet')); return; }
            res(dataUrlToBlob(url));
          };
          snapWait.id = id;
          frame.contentWindow.postMessage({ hzcr: 'snap', id: id }, '*');
        });
      }
      function onMsg(e) {
        if (!frame || e.source !== frame.contentWindow) return;
        var d = e.data;
        if (!d || !d.hzcr) return;
        if (d.hzcr === 'err') { errBox.hidden = false; errBox.textContent = String(d.msg).slice(0, 400); }
        else if (d.hzcr === 'png' && snapWait && snapWait.id === d.id) snapWait(d.url);
      }
      window.addEventListener('message', onMsg);
      onClose(function () { window.removeEventListener('message', onMsg); if (frame) { frame.remove(); frame = null; } });
      sampleSel.addEventListener('change', function () {
        if (sampleSel.value === '__mine') return;
        ta.value = P5_SAMPLES[sampleSel.value]; run();
      });
      ta.addEventListener('input', function () { sampleSel.value = '__mine'; });
      ta.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') { e.preventDefault(); var s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); }
      });
      run();
    });
  }

  // ---------- + menu strip ----------
  var TOOLS = [
    { id: 'dicebear', label: 'Avatars', icon: 'dice', aria: 'Avatars: make an avatar from any seed', desc: 'Make an avatar from any seed. 30 styles, background colour, corner radius, flip and 6 variations. Powered by DiceBear.', open: openDiceBear },
    { id: 'memegen', label: 'Memes', icon: 'meme', aria: 'Memes: make a meme from a template', desc: 'Make a meme from a template with your own text. Powered by Memegen.', open: openMemegen },
    { id: 'p5', label: 'Visuals', icon: 'p5', aria: 'Visuals: run a code art sketch', desc: 'Run a code art sketch: 10 ready-made visuals, or write your own. Powered by p5.js.', open: openP5 }
  ];
  function installStrip() {
    var menu = $('toolMenu');
    if (!menu || menu.querySelector('.hzcr-bar')) return;
    var bar = el('div', 'hzcr-bar');
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', 'Generators: no key needed');
    TOOLS.forEach(function (t) {
      var b = el('button', 'hzcr-tool'); b.type = 'button'; b.id = 'tm-' + t.id;
      b.setAttribute('aria-label', t.aria);
      var ic = el('span', 'hzcr-tool-ic'); ic.appendChild(svg(t.icon, 'hzcr-bi'));
      var tx = el('span', 'hzcr-tool-tx'); tx.append(el('span', 'hzcr-tool-l', t.label), el('span', 'hzcr-tool-d', t.desc || ''));   /* V1.54.0: full description under the name */
      b.append(ic, tx, el('span', 'hzcr-tool-go', '\u203a'));
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        menu.hidden = true;
        var plus = $('webToggle'); if (plus) plus.setAttribute('aria-expanded', 'false');
        t.open();
      });
      bar.appendChild(b);
    });
    var lab = el('div', 'tm-grp', 'Generators');   /* V1.53.1: Create is its own group, first in the grouped menu */
    var head = menu.querySelector('.tm-head');
    if (head && head.nextSibling) { menu.insertBefore(lab, head.nextSibling); menu.insertBefore(bar, lab.nextSibling); } else { menu.appendChild(lab); menu.appendChild(bar); }
  }

  function init(h) {
    if (h) { if (h.notice) host.notice = h.notice; if (h.fetch) host.fetch = h.fetch; if (h.save) host.save = h.save; }
    if (inited) return;
    inited = true;
    installStrip();
  }

  window.HorizonCreator = { init: init, open: function (id) { var t = TOOLS.find(function (x) { return x.id === id; }); if (t) t.open(); }, close: function () { closeSheet(); }, esc: mgEsc };
})();
