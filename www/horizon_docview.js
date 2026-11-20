/* HORIZON V1.99.56 · Document viewer for Mermaid diagrams (and a one-tap full screen Open for HTML / SVG).
   - Any ```mermaid code block (or an unlabelled block that starts like a diagram) gets PREVIEW and SAVE in its header.
   - PREVIEW opens a full screen viewer: pinch to zoom, drag to move, double tap to fit/100%, Light/Dark, Diagram/Source tabs.
   - SAVE AS writes .svg, .png or the .mmd source to Downloads (or a browser download).
   - Forge artifact cards (type mermaid / html / svg) get an OPEN button that uses the same viewers.
   The diagram is drawn by the bundled Mermaid inside a sandboxed frame (strict mode, no network). The result is shown as an image,
   so nothing from the AI's text can run inside Horizon. Nothing is sent anywhere. */
(function () {
  'use strict';
  if (window.HorizonDocView) return;
  var NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  var ROOT = null;
  try { ROOT = new URL('.', document.currentScript ? document.currentScript.src : location.href); } catch (e) { ROOT = null; }
  var ov = null, scanT = 0, popBound = false, libP = null, seq = 0;

  function plug(n) { try { return NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[n] ? window.Capacitor.Plugins[n] : null; } catch (e) { return null; } }
  function toast(title, sub, kind) { if (window.HzToast) HzToast.show({ icon: kind === 'bad' ? 'i-info' : 'i-check', title: title, sub: sub || '', kind: kind || 'ok' }); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function b64(text) { return btoa(unescape(encodeURIComponent(text))); }

  /* DV:PURE:BEGIN */
  var MM_START = /^\s*(?:%%[^\n]*\n\s*)*(?:---[\s\S]*?---\s*)?(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|mindmap|timeline|sankey-beta|xychart-beta|block-beta|C4Context|C4Container|C4Component|C4Dynamic|C4Deployment|architecture-beta|packet-beta|kanban)\b/;
  var MM_NAMES = { graph: 'Flowchart', flowchart: 'Flowchart', sequencediagram: 'Sequence diagram', classdiagram: 'Class diagram', statediagram: 'State diagram', 'statediagram-v2': 'State diagram', erdiagram: 'ER diagram', journey: 'User journey', gantt: 'Gantt chart', pie: 'Pie chart', quadrantchart: 'Quadrant chart', requirementdiagram: 'Requirement diagram', gitgraph: 'Git graph', mindmap: 'Mind map', timeline: 'Timeline', 'sankey-beta': 'Sankey', 'xychart-beta': 'XY chart', 'block-beta': 'Block diagram', 'architecture-beta': 'Architecture', 'packet-beta': 'Packet', kanban: 'Kanban' };
  function mmKind(raw) { var m = MM_START.exec(String(raw || '').slice(0, 800)); return m ? m[1] : ''; }
  function isMermaidText(lang, raw) {
    lang = String(lang || '').trim().toLowerCase();
    if (lang === 'mermaid' || lang === 'mmd') return true;
    if (!lang || lang === 'text' || lang === 'txt' || lang === 'plaintext') return !!mmKind(raw);
    return false;
  }
  function mmTitle(raw) {
    var t = /(?:^|\n)\s*title\s*:\s*(.+)/.exec(String(raw || '').slice(0, 800));
    if (t && t[1].trim()) return t[1].trim().slice(0, 60);
    var k = mmKind(raw);
    return MM_NAMES[k.toLowerCase()] || 'Mermaid diagram';
  }
  function baseName(title) { return String(title || 'diagram').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'diagram'; }
  function dimsOf(svg) {
    var m = /<svg\b[^>]*>/.exec(svg), tag = m ? m[0] : '', vb = /viewBox="([^"]+)"/.exec(tag), w = 0, h = 0;
    if (vb) { var p = vb[1].trim().split(/[\s,]+/).map(Number); w = p[2]; h = p[3]; }
    if (!(w > 0 && h > 0)) { w = parseFloat((/\swidth="([\d.]+)"/.exec(tag) || [])[1]); h = parseFloat((/\sheight="([\d.]+)"/.exec(tag) || [])[1]); }
    if (!(w > 0 && h > 0)) { w = 800; h = 600; }
    return { w: Math.ceil(w), h: Math.ceil(h) };
  }
  function fixSvg(svg, bg) {
    var m = /<svg\b[^>]*>/.exec(svg); if (!m) return { svg: svg, w: 800, h: 600 };
    var d = dimsOf(svg), tag = m[0];
    var t = tag.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '').replace(/\sstyle="[^"]*"/, '');
    t = t.replace(/^<svg/, '<svg width="' + d.w + '" height="' + d.h + '" style="background-color:' + (bg || '#ffffff') + '"');
    if (!/\sxmlns=/.test(t)) t = t.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
    return { svg: svg.replace(tag, function () { return t; }), w: d.w, h: d.h };
  }
  /* DV:PURE:END */

  /* An <img> only shows well-formed XML. Mermaid sometimes emits HTML-style tags, so re-serialise through the parser. */
  function wellFormed(svg) {
    try {
      var x = new DOMParser().parseFromString(svg, 'image/svg+xml');
      if (!x.getElementsByTagName('parsererror').length && x.documentElement && /svg/i.test(x.documentElement.nodeName)) return new XMLSerializer().serializeToString(x.documentElement);
    } catch (e) { /* fall through */ }
    try {
      var h = new DOMParser().parseFromString(svg, 'text/html'), s = h.querySelector('svg');
      if (s) { if (!s.getAttribute('xmlns')) s.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); return new XMLSerializer().serializeToString(s); }
    } catch (e2) { /* ignore */ }
    return svg;
  }

  function lib() {
    if (!libP) {
      var url = new URL('vendor/forge/mermaid.min.js', ROOT || location.href).href;
      libP = fetch(url).then(function (r) { if (!r.ok) throw new Error('Bundled Mermaid is unavailable.'); return r.text(); }).catch(function (e) { libP = null; throw e; });
    }
    return libP;
  }

  /* Draws the diagram in a hidden sandboxed frame and resolves with the SVG text. */
  function renderMermaid(source, dark) {
    return lib().then(function (library) {
      return new Promise(function (resolve, reject) {
        var f = document.createElement('iframe');
        f.setAttribute('sandbox', 'allow-scripts'); f.referrerPolicy = 'no-referrer'; f.setAttribute('aria-hidden', 'true'); f.tabIndex = -1;
        f.style.cssText = 'position:fixed;left:-12000px;top:0;width:1400px;height:900px;border:0;visibility:hidden;pointer-events:none';
        var token = 'dv-' + (++seq) + '-' + Math.random().toString(36).slice(2), timer = 0;
        function done(err, svg) { clearTimeout(timer); window.removeEventListener('message', onmsg); try { f.remove(); } catch (e) { /* ignore */ } err ? reject(err) : resolve(svg); }
        function onmsg(e) {
          if (e.source !== f.contentWindow || !e.data || e.data.token !== token) return;
          if (e.data.error) done(new Error(e.data.error)); else if (typeof e.data.svg === 'string') done(null, e.data.svg);
        }
        window.addEventListener('message', onmsg);
        timer = setTimeout(function () { done(new Error('Mermaid took too long (20 s). The diagram may be too big.')); }, 20000);
        var runner = 'mermaid.initialize({startOnLoad:false,securityLevel:"strict",theme:"' + (dark ? 'dark' : 'default') + '",htmlLabels:false,flowchart:{htmlLabels:false},maxTextSize:200000});' +
          '(async()=>{try{var r=await mermaid.render("dv' + seq + '",decodeURIComponent(escape(atob("' + b64(source) + '"))));parent.postMessage({token:"' + token + '",svg:r.svg},"*")}catch(e){parent.postMessage({token:"' + token + '",error:String(e&&e.message||e)},"*")}})();';
        f.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><body style="margin:12px;background:#fff;font:15px sans-serif"></body><script>' + library.replace(/<\/script/gi, '<\\/script') + '</script><script>' + runner + '</script>';
        document.body.appendChild(f);
      });
    });
  }

  /* ---------- saving ---------- */
  function cleanName(n, ext) {
    var f = String(n || '').replace(/[\\/:*?"<>|]+/g, '_').trim().replace(/\.(svg|png|mmd|mermaid)$/i, '') || 'diagram';
    return f + ext;
  }
  async function writeText(fname, text, mime) {
    return window.HorizonOutputs.saveBlob(new Blob([text], {type:mime}), fname);
  }
  async function writeBlob(fname, blob) {
    return window.HorizonOutputs.saveBlob(blob, fname);
  }
  function browserSave(fname, blob) {
    var a = document.createElement('a'), u = URL.createObjectURL(blob);
    a.href = u; a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(u); }, 60000);
    return fname;
  }
  function toPng(svg, w, h, bg) {
    return new Promise(function (resolve, reject) {
      var scale = Math.max(1, Math.min(3, 4096 / Math.max(w, h))), img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = Math.round(w * scale); c.height = Math.round(h * scale);
        var x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob(function (b) { b ? resolve(b) : reject(new Error('PNG export failed')); }, 'image/png');
      };
      img.onerror = function () { reject(new Error('Could not draw the diagram to PNG')); };
      img.src = 'data:image/svg+xml;base64,' + b64(svg);
    });
  }

  /* ---------- viewer ---------- */
  function closeViewer(fromPop) {
    if (!ov) return;
    ov.remove(); ov = null;
    if (!fromPop && history.state && history.state.dvPrev) { try { history.back(); } catch (e) { /* ignore */ } }
  }
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) { try { var ta = el('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); ok ? res() : rej(new Error('copy blocked')); } catch (e) { rej(e); } });
  }
  function panZoom(stage, pan, dims) {
    var st = { s: 1, x: 0, y: 0 }, pts = {}, prev = null, moved = 0, lastTap = 0;
    function apply() { pan.style.transform = 'translate(' + st.x + 'px,' + st.y + 'px) scale(' + st.s + ')'; }
    function zoomAt(cx, cy, ns) { ns = Math.max(0.05, Math.min(12, ns)); var k = ns / st.s; st.x = cx - (cx - st.x) * k; st.y = cy - (cy - st.y) * k; st.s = ns; apply(); }
    function fit() { var d = dims(), W = stage.clientWidth, H = stage.clientHeight; st.s = Math.max(0.05, Math.min((W - 24) / d.w, (H - 24) / d.h, 2)); st.x = (W - d.w * st.s) / 2; st.y = (H - d.h * st.s) / 2; apply(); }
    function actual(cx, cy) { var d = dims(), W = stage.clientWidth, H = stage.clientHeight; if (cx == null) { cx = W / 2; cy = H / 2; } zoomAt(cx, cy, 1); }
    function cnt() { return Object.keys(pts).length; }
    function pair() { var k = Object.keys(pts), a = pts[k[0]], b = pts[k[1]]; return { d: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 }; }
    stage.addEventListener('pointerdown', function (e) {
      try { stage.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
      pts[e.pointerId] = { x: e.clientX, y: e.clientY }; moved = 0; if (cnt() === 2) prev = pair();
    });
    stage.addEventListener('pointermove', function (e) {
      var o = pts[e.pointerId]; if (!o) return;
      if (cnt() === 1) { st.x += e.clientX - o.x; st.y += e.clientY - o.y; moved += Math.abs(e.clientX - o.x) + Math.abs(e.clientY - o.y); pts[e.pointerId] = { x: e.clientX, y: e.clientY }; apply(); }
      else if (cnt() === 2) {
        pts[e.pointerId] = { x: e.clientX, y: e.clientY };
        var c = pair(), r = stage.getBoundingClientRect(); moved += 20;
        st.x += c.mx - prev.mx; st.y += c.my - prev.my; zoomAt(c.mx - r.left, c.my - r.top, st.s * c.d / prev.d); prev = c;
      }
    });
    function up(e) {
      var wasOne = cnt() === 1 && pts[e.pointerId];
      if (wasOne && moved < 8 && e.type === 'pointerup') {
        var now = Date.now();
        if (now - lastTap < 320) { var r = stage.getBoundingClientRect(); if (Math.abs(st.s - 1) < 0.02) fit(); else actual(e.clientX - r.left, e.clientY - r.top); lastTap = 0; } else lastTap = now;
      }
      delete pts[e.pointerId]; prev = null;
    }
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
    stage.addEventListener('wheel', function (e) { e.preventDefault(); var r = stage.getBoundingClientRect(); zoomAt(e.clientX - r.left, e.clientY - r.top, st.s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)); }, { passive: false });
    return { fit: fit, zoomBy: function (k) { zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, st.s * k); }, actual: actual };
  }

  function saveSheet(state) {
    var sheet = el('div', 'hv-sheet'), box = el('div', 'hv-box');
    box.appendChild(el('b', null, 'Save as'));
    var inp = el('input'); inp.type = 'text'; inp.value = baseName(state.title); inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'File name');
    box.appendChild(inp);
    var info = el('small', null, 'Pick a format. All files go to Android Downloads.');
    box.appendChild(info);
    var row = el('div', 'hv-row dv-formats');
    function btn(label, cls, fn) { var b = el('button', 'hv-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; b.onclick = fn; row.appendChild(b); return b; }
    function go(ext, work) {
      if (!state.svg && ext !== '.mmd') { toast('Wait for the diagram', 'It is still drawing, or it failed. Use .mmd to save the source.', 'bad'); return; }
      var name = cleanName(inp.value, ext); sheet.remove();
      Promise.resolve().then(work.bind(null, name)).then(function (where) { toast('Saved', where); }, function (e) { toast('Could not save', (e && e.message) || '', 'bad'); });
    }
    btn('Cancel', '', function () { sheet.remove(); });
    btn('.mmd', '', function () { go('.mmd', function (n) { return writeText(n, state.raw, 'text/plain'); }); });
    btn('.svg', '', function () { go('.svg', function (n) { return writeText(n, state.fixed.svg, 'image/svg+xml'); }); });
    btn('.png', 'pri', function () { go('.png', function (n) { return toPng(state.fixed.svg, state.fixed.w, state.fixed.h, state.dark ? '#0d1117' : '#ffffff').then(function (b) { return writeBlob(n, b); }); }); });
    box.appendChild(row); sheet.appendChild(box);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.remove(); });
    (ov || document.body).appendChild(sheet);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 50);
  }

  function openMermaid(raw, title) {
    raw = String(raw || '').replace(/^\s*```(?:mermaid|mmd)?[^\n]*\n/, '').replace(/\n```\s*$/, '');
    if (!raw.trim()) { toast('Nothing to preview yet', '', 'bad'); return; }
    if (ov) closeViewer(true);
    var state = { raw: raw, title: title || mmTitle(raw), dark: false, svg: '', fixed: null, tick: 0 };
    ov = el('div', 'dv-ov'); ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Diagram viewer');
    var bar = el('div', 'hv-bar'), close = el('button', 'hv-btn', 'Close'); close.type = 'button'; close.onclick = function () { closeViewer(false); };
    var sv = el('button', 'hv-btn pri', 'Save as'); sv.type = 'button'; sv.onclick = function () { saveSheet(state); };
    bar.appendChild(close); bar.appendChild(el('span', 'hv-title', state.title)); bar.appendChild(sv);
    var tools = el('div', 'dv-tools');
    var seg = el('div', 'dv-seg'), tD = el('button', 'dv-s on', 'Diagram'), tS = el('button', 'dv-s', 'Source');
    var seg2 = el('div', 'dv-seg'), tL = el('button', 'dv-s on', 'Light'), tK = el('button', 'dv-s', 'Dark');
    [tD, tS, tL, tK].forEach(function (b) { b.type = 'button'; });
    seg.appendChild(tD); seg.appendChild(tS); seg2.appendChild(tL); seg2.appendChild(tK);
    var zoom = el('div', 'dv-zoom'), zm = el('button', 'hv-btn', '\u2212'), zf = el('button', 'hv-btn', 'Fit'), zp = el('button', 'hv-btn', '+');
    [zm, zf, zp].forEach(function (b) { b.type = 'button'; zoom.appendChild(b); });
    tools.appendChild(seg); tools.appendChild(seg2); tools.appendChild(zoom);
    var stage = el('div', 'dv-stage'), pan = el('div', 'dv-pan'), msg = el('div', 'dv-msg', 'Drawing the diagram...');
    stage.appendChild(pan); stage.appendChild(msg);
    var src = el('pre', 'dv-src'); src.textContent = raw; src.hidden = true;
    var foot = el('div', 'dv-foot'), cp = el('button', 'hv-btn', 'Copy source'); cp.type = 'button';
    cp.onclick = function () { copyText(raw).then(function () { toast('Copied', 'Mermaid source'); }, function () { toast('Could not copy', '', 'bad'); }); };
    foot.appendChild(el('span', 'dv-hint', 'Pinch to zoom \u00b7 drag to move \u00b7 double tap to fit')); foot.appendChild(cp);
    ov.appendChild(bar); ov.appendChild(tools); ov.appendChild(stage); ov.appendChild(src); ov.appendChild(foot);
    document.body.appendChild(ov);
    var pz = panZoom(stage, pan, function () { return state.fixed || { w: 800, h: 600 }; });
    zf.onclick = function () { pz.fit(); }; zp.onclick = function () { pz.zoomBy(1.3); }; zm.onclick = function () { pz.zoomBy(1 / 1.3); };
    function showTab(source) {
      tD.classList.toggle('on', !source); tS.classList.toggle('on', source);
      stage.hidden = source; src.hidden = !source; zoom.style.visibility = source ? 'hidden' : '';
      if (!source) setTimeout(function () { if (state.fixed) pz.fit(); }, 30);
    }
    tD.onclick = function () { showTab(false); }; tS.onclick = function () { showTab(true); };
    function draw() {
      var mine = ++state.tick; state.svg = ''; state.fixed = null; pan.replaceChildren(); msg.hidden = false; msg.className = 'dv-msg'; msg.textContent = 'Drawing the diagram...';
      stage.classList.toggle('dark', state.dark);
      renderMermaid(state.raw, state.dark).then(function (svg) {
        if (mine !== state.tick || !ov) return;
        var bg = state.dark ? '#0d1117' : '#ffffff', fx = fixSvg(wellFormed(svg), bg);
        state.svg = svg; state.fixed = fx;
        var img = new Image(); img.alt = state.title; img.draggable = false; img.width = fx.w; img.height = fx.h;
        img.onload = function () { if (mine !== state.tick || !ov) return; msg.hidden = true; pan.replaceChildren(img); pan.style.width = fx.w + 'px'; pan.style.height = fx.h + 'px'; pz.fit(); };
        img.onerror = function () { if (mine !== state.tick) return; msg.className = 'dv-msg bad'; msg.textContent = 'The diagram was drawn but this phone could not show it. Use the Source tab or save .mmd.'; };
        img.src = 'data:image/svg+xml;base64,' + b64(fx.svg);
      }, function (e) {
        if (mine !== state.tick || !ov) return;
        msg.className = 'dv-msg bad';
        msg.textContent = 'Mermaid could not read this diagram: ' + String((e && e.message) || e).replace(/\s+/g, ' ').slice(0, 280) + ' (see the Source tab, or ask the AI to fix it)';
      });
    }
    tL.onclick = function () { if (!state.dark) return; state.dark = false; tL.classList.add('on'); tK.classList.remove('on'); draw(); };
    tK.onclick = function () { if (state.dark) return; state.dark = true; tK.classList.add('on'); tL.classList.remove('on'); draw(); };
    draw();
    try { history.pushState({ dvPrev: true }, ''); } catch (e) { /* ignore */ }
    if (!popBound) { popBound = true; window.addEventListener('popstate', function () { if (ov) closeViewer(true); }); }
  }

  /* ---------- hooks into the chat ---------- */
  function rawOf(block) { var c = block.querySelector('pre code'); return c ? c.textContent : ''; }
  function decorate(block) {
    if (block.getAttribute('data-dv') === '1') return;
    var head = block.querySelector('.code-head'); if (!head) return;
    var raw = rawOf(block), lang = ((block.querySelector('.code-lang') || {}).textContent || '');
    if (!isMermaidText(lang, raw)) { if (String(lang).trim() || raw.length >= 60) block.setAttribute('data-dv', '1'); return; }
    block.setAttribute('data-dv', '1');
    var copy = head.querySelector('.code-copy'), acts = el('div', 'hv-acts');
    var pv = el('button', 'code-copy hv-pv', '\u25B6 Preview'); pv.type = 'button'; pv.setAttribute('aria-label', 'Preview this diagram (does not save)');
    var sv = el('button', 'code-copy hv-sv', 'Save'); sv.type = 'button'; sv.setAttribute('aria-label', 'Save this diagram as a file');
    pv.addEventListener('click', function (e) { e.stopPropagation(); openMermaid(rawOf(block)); });
    sv.addEventListener('click', function (e) { e.stopPropagation(); openMermaid(rawOf(block)); setTimeout(function () { var b = ov && ov.querySelector('.hv-bar .pri'); if (b) b.click(); }, 60); });
    acts.appendChild(pv); acts.appendChild(sv); if (copy) acts.appendChild(copy); head.appendChild(acts);
  }
  function decorateCard(card) {
    if (card.getAttribute('data-dv') === '1') return;
    var t = card.getAttribute('data-type'); if (t !== 'mermaid' && t !== 'html' && t !== 'svg') { card.setAttribute('data-dv', '1'); return; }
    var head = card.querySelector('.hf-head'); if (!head) return;
    card.setAttribute('data-dv', '1');
    var b = el('button', 'hf-open', '\u26F6 Open'); b.type = 'button'; b.setAttribute('aria-label', 'Open full screen');
    b.addEventListener('click', function () {
      var s = card.querySelector('.hf-source'), raw = s ? s.textContent : '', st = card.querySelector('.hf-head strong'), title = st ? st.textContent.replace(/\.(mmd|html?|svg)$/i, '') : '';
      if (!raw.trim()) { toast('Nothing to open yet', 'The AI has not finished this one.', 'bad'); return; }
      if (t === 'mermaid') openMermaid(raw, title);
      else if (window.HorizonHtmlView) window.HorizonHtmlView.preview(raw, t);
      else toast('Viewer missing', 'horizon_htmlview.js did not load', 'bad');
    });
    head.insertBefore(b, head.lastElementChild);
  }
  function scan() {
    scanT = 0;
    document.querySelectorAll('.code-block:not([data-dv="1"])').forEach(decorate);
    document.querySelectorAll('.hf-card:not([data-dv="1"])').forEach(decorateCard);
  }
  function queue(records) {
    // Only newly inserted code/artifact nodes need decorating, not clocks or streaming text.
    if (records && !records.some(function (r) { return Array.prototype.some.call(r.addedNodes, function (n) {
      return n.nodeType === 1 && (n.matches('.code-block,.hf-card') || n.querySelector('.code-block,.hf-card'));
    }); })) return;
    if (!scanT) scanT = setTimeout(function retry() {
      if (window.hzTyping || window.hzKbBusy || window.hzEditorFocused || document.hidden) { scanT = setTimeout(retry, 400); return; }
      scan();
    }, 120);
  }
  function init() {
    if (!document.querySelector('link[data-horizon-docview]')) {
      var l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('horizon_docview.css', ROOT || location.href).href; l.setAttribute('data-horizon-docview', ''); document.head.appendChild(l);
    }
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.HorizonDocView = { openMermaid: openMermaid, isMermaid: isMermaidText, title: mmTitle, fixSvg: fixSvg, version: '1.0.0' };
})();
