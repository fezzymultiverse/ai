/* Horizon Forge: isolated artifact UI, offline previews and opt-in Termux execution.
 * No fetch interception, provider changes, chat persistence changes or native changes.
 * Runtime adapters delegate legacy PDF behavior. Dependencies load only on demand. */
(function () {
  'use strict';
  const W = window, D = document;
  if (W.HorizonForge) return;
  const ROOT = new URL('.', D.currentScript ? D.currentScript.src : location.href);
  const MAX_SOURCE = 1500000, MAX_PAGES = 20;
  const TYPES = new Set(['markdown', 'html', 'svg', 'mermaid', 'pdf', 'sh', 'py', 'js']);
  const aliases = { md: 'markdown', shell: 'sh', bash: 'sh', python: 'py', javascript: 'js' };
  const ext = { markdown: 'md', html: 'html', svg: 'svg', mermaid: 'mmd', pdf: 'pdf', sh: 'sh', py: 'py', js: 'js' };
  const mime = { markdown: 'text/markdown', html: 'text/html', svg: 'image/svg+xml', mermaid: 'text/plain', pdf: 'application/pdf', sh: 'text/x-shellscript', py: 'text/x-python', js: 'text/javascript' };
  const loads = new Map(), pdfCache = new WeakMap();
  let seq = 0, old = null, pdfLibPromise = null;
  const node = (tag, cls, text) => { const n = D.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const errorText = e => String(e && e.message || e);
  function filename(a, suffix) {
    let name = String(a.title || 'Artifact').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 100) || 'Artifact';
    return name.replace(/\.(md|markdown|html?|svg|mmd|mermaid|pdf|sh|py|js)$/i, '') + '.' + (suffix || ext[a.type]);
  }
  function sourceBody(s) { return s.replace(/^\s*```[\w.-]*[^\S\n]*\n([\s\S]*?)\n```\s*$/, '$1').trim(); }
  function parse(text) {
    const input = String(text || ''), items = [];
    // Visuals require explicit artifacts. Phase 2 also recognizes shell/Python/JS fences in AI replies.
    const re = /<artifact\b([^>]*)>([\s\S]*?)(<\/artifact\s*>|$)/gi;
    let prose = '', at = 0, m;
    while ((m = re.exec(input))) {
      let start = m.index, end = re.lastIndex;
      const attrs = {}, ar = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let am;
      while ((am = ar.exec(m[1]))) attrs[am[1].toLowerCase()] = am[2] == null ? am[3] : am[2];
      const rawType = (attrs.type || 'pdf').toLowerCase(), type = aliases[rawType] || rawType;
      const office = /^(docx|xlsx|csv)$/.test(type) && old;
      if (!TYPES.has(type) && !office) continue;
      // Consume an optional fence enclosing precisely this artifact, not adjacent prose.
      const before = input.slice(at, start), fence = /(^|\n)[ \t]*```(?:artifact|xml|html|markdown|md|svg|mermaid|json|sh|py|js)?[ \t]*\n[ \t]*$/.exec(before);
      const after = /^[ \t]*\n[ \t]*```(?=\s*(?:\n|$))/.exec(input.slice(end));
      if (fence && after) { start = at + fence.index + fence[1].length; end += after[0].length; re.lastIndex = end; }
      prose += input.slice(at, start); at = end;
      const content = sourceBody(m[2]);
      if (office) { items.push(...old.parse(m[0]).items); continue; }
      // Retain existing Markdown-to-PDF documents, including saved history and long-document core path.
      if (type === 'pdf' && !/^[\[{]/.test(content) && old) {
        const legacy = old.parse(m[0]); items.push(...legacy.items); continue;
      }
      items.push({ forge: true, type, title: attrs.title || 'Artifact.' + ext[type], content, attrs, open: !m[3] });
    }
    prose += input.slice(at);
    prose = prose.replace(/^(`{3,}|~{3,})[ \t]*(sh|bash|shell|py|python|js|javascript)[ \t]*\r?\n([\s\S]*?)^\1[ \t]*(?=\r?$)/gim, (block, fence, language, body) => {
      const type = aliases[language.toLowerCase()] || language.toLowerCase();
      items.push({ forge: true, type, title: 'Script.' + ext[type], content: body.replace(/\r?\n$/, ''), attrs: {}, open: false });
      return '';
    });
    return { items, prose: prose.trim() };
  }
  function load(path) {
    const src = new URL(path, ROOT).href;
    if (!loads.has(src)) loads.set(src, new Promise((resolve, reject) => {
      const s = node('script'); s.src = src;
      const timer = setTimeout(() => fail(new Error('Dependency timed out: ' + path)), 20000);
      function fail(e) { clearTimeout(timer); loads.delete(src); s.remove(); reject(e); }
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => fail(new Error('Cannot load bundled dependency: ' + path)); D.head.appendChild(s);
    }));
    return loads.get(src);
  }
  async function pdfLib() {
    if (!pdfLibPromise) pdfLibPromise = import(new URL('vendor/pdfjs/pdf.mjs', ROOT).href).then(lib => {
      lib.GlobalWorkerOptions.workerSrc = new URL('vendor/pdfjs/pdf.worker.mjs', ROOT).href; return lib;
    }).catch(e => { pdfLibPromise = null; throw e; });
    return pdfLibPromise;
  }
  function definition(a) {
    if (a.content.length > MAX_SOURCE) throw new Error('Artifact exceeds the 1.5 MB source limit.');
    let def;
    try { def = JSON.parse(a.content); } catch (_) { throw new Error('Invalid pdfmake JSON. Ask the AI to return one complete JSON object; no JavaScript functions.'); }
    if (!def || Array.isArray(def) || typeof def !== 'object' || !Array.isArray(def.content) || !def.content.length) throw new Error('PDF JSON needs a nonempty content array.');
    let nodes = 0;
    function walk(v, depth) {
      if (++nodes > 50000 || depth > 40) throw new Error('PDF definition is too complex.');
      if (!v || typeof v !== 'object') return;
      for (const k of Object.keys(v)) {
        if (['__proto__', 'prototype', 'constructor'].includes(k)) throw new Error('Unsafe PDF key: ' + k);
        if (['image', 'svg', 'images', 'attachments', 'files', 'file', 'src', 'url', 'background', 'watermark', 'pageSize'].includes(k)) {
          if (k === 'pageSize') { if (v[k] !== 'A4') throw new Error('Forge PDFs use A4 pages.'); }
          else throw new Error('Unsupported PDF field: ' + k + '. Use text, tables, lists and canvas shapes.');
        }
        if (k === 'font' && v[k] !== 'Roboto') throw new Error('Only bundled Roboto is available.');
        if (k === 'link' && !/^(https?:|mailto:)/i.test(String(v[k]))) throw new Error('Unsafe PDF link.');
        if (k === 'fontSize' && (!Number.isFinite(v[k]) || v[k] < 4 || v[k] > 120)) throw new Error('Font size must be 4–120.');
        walk(v[k], depth + 1);
      }
    }
    walk(def, 0); def.pageSize = 'A4';
    def.defaultStyle = Object.assign({ font: 'Roboto', fontSize: 11 }, def.defaultStyle || {});
    return def;
  }
  function timed(promise, ms, message) {
    return new Promise((resolve, reject) => { const t = setTimeout(() => reject(new Error(message)), ms); promise.then(v => { clearTimeout(t); resolve(v); }, e => { clearTimeout(t); reject(e); }); });
  }
  async function buildPDF(a) {
    if (pdfCache.has(a)) return pdfCache.get(a);
    const job = (async () => {
      if (a.open) throw new Error('Artifact is incomplete. Ask the AI to finish and close </artifact>.');
      const def = definition(a);
      if (!W.pdfMake) await load('vendor/pdfmake-0.2.20.min.js');
      if (!W.pdfMake.vfs || !Object.keys(W.pdfMake.vfs).length) await load('vendor/pdfmake-0.2.20-fonts.js');
      const bytes = await timed(new Promise((resolve, reject) => {
        try { W.pdfMake.createPdf(def).getBuffer(resolve); } catch (e) { reject(e); }
      }), 90000, 'PDF build timed out. Reduce document complexity.');
      const lib = await pdfLib(), doc = await lib.getDocument({ data: new Uint8Array(bytes) }).promise;
      const pages = doc.numPages; await doc.destroy();
      if (pages > MAX_PAGES) throw new Error('This PDF has ' + pages + ' pages. Forge allows at most 20. Ask the AI to shorten it.');
      return { blob: new Blob([bytes], { type: 'application/pdf' }), pages };
    })();
    pdfCache.set(a, job); job.catch(() => pdfCache.delete(a)); return job;
  }
  // Untrusted HTML/SVG cannot run scripts, navigate, submit forms, load remote resources or access app origin.
  function frame(source, type) {
    const f = node('iframe', 'hf-frame'); f.title = type === 'svg' ? 'SVG preview' : 'HTML preview';
    f.setAttribute('sandbox', ''); f.referrerPolicy = 'no-referrer';
    const policy = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'";
    f.srcdoc = '<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="' + policy + '"><meta charset="utf-8"><style>body{margin:14px;font:16px system-ui;color:#182235;background:white;overflow-wrap:anywhere}svg{max-width:100%;height:auto}img{max-width:100%}</style></head><body>' + source + '</body></html>';
    return f;
  }
  // Mermaid is given its own opaque-origin iframe, never the app DOM. User source is JSON/base64 encoded.
  async function mermaidFrame(source) {
    const response = await fetch(new URL('vendor/forge/mermaid.min.js', ROOT).href);
    if (!response.ok) throw new Error('Bundled Mermaid is unavailable.');
    const library = await response.text();
    const f = node('iframe', 'hf-frame'); f.title = 'Mermaid diagram'; f.setAttribute('sandbox', 'allow-scripts'); f.referrerPolicy = 'no-referrer';
    const token = 'forge-' + (++seq) + '-' + Math.random().toString(36).slice(2), encoded = btoa(unescape(encodeURIComponent(source)));
    const result = new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error('Mermaid rendering timed out.')), 20000);
      function done(err, svg) { clearTimeout(timer); W.removeEventListener('message', onmessage); err ? reject(err) : resolve(svg); }
      function onmessage(e) {
        if (e.source !== f.contentWindow || !e.data || e.data.token !== token) return;
        if (e.data.error) done(new Error(e.data.error)); else if (typeof e.data.svg === 'string' && e.data.svg.length < MAX_SOURCE) done(null, e.data.svg);
      }
      W.addEventListener('message', onmessage);
    });
    const runner = 'mermaid.initialize({startOnLoad:false,securityLevel:"strict",maxTextSize:100000,flowchart:{htmlLabels:false}});(async()=>{try{const r=await mermaid.render("diagram",decodeURIComponent(escape(atob("' + encoded + '"))));document.getElementById("diagram-host").innerHTML=r.svg;parent.postMessage({token:"' + token + '",svg:r.svg},"*")}catch(e){parent.postMessage({token:"' + token + '",error:String(e.message||e)},"*")}})();';
    f.srcdoc = '<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'unsafe-inline\'; style-src \'unsafe-inline\'; img-src data:; connect-src \'none\'; base-uri \'none\'; form-action \'none\'"><style>body{margin:12px;background:white;color:#182235;font:15px system-ui}svg{max-width:100%;height:auto}</style><div id="diagram-host"></div><script>' + library.replace(/<\/script/gi, '<\\/script') + '</script><script>' + runner + '</script>';
    return { frame: f, result };
  }
  async function saveBlob(blob, name) {
    return W.HorizonOutputs.saveBlob(blob, name);
  }
  function scriptCommand(a) {
    if (!['sh', 'py', 'js'].includes(a.type)) throw new Error('Not an executable artifact.');
    if (!a.content.trim() || a.content.length > 200000 || a.content.includes('\u0000')) throw new Error('Script is empty, oversized or contains NUL bytes.');
    const interpreter = { sh: 'sh', py: 'python', js: 'node' }[a.type];
    // Literal heredoc avoids shell expansion, substitutions and quoting injection.
    let delimiter = 'HORIZON_FORGE_SOURCE'; while (a.content.split(/\r?\n/).includes(delimiter)) delimiter += '_X';
    return 'command -v ' + interpreter + ' >/dev/null 2>&1 || { printf "%s\\n" "Install ' + interpreter + ' in Termux first" >&2; exit 127; }\n' + interpreter + " <<'" + delimiter + "'\n" + a.content + '\n' + delimiter;
  }
  async function run(a, output) {
    const bridge = W.HorizonBridges;
    if (!bridge || !bridge.termux) throw new Error('Existing Termux bridge is unavailable.');
    if (bridge.refresh) await bridge.refresh();
    const state = bridge.state ? bridge.state().termux : null;
    if (!state || !state.enabled || !state.permission || !state.aiEnabled) throw new Error('Enable Termux, Run commands permission and AI ASK/AUTO in Terminal Controls first.');
    if (!W.confirm('Run ' + filename(a) + ' on your phone through Termux?\n\nThis is NOT a security sandbox. It can read, modify or delete anything Termux can access and use the network. Review the entire source in Save before proceeding.')) return null;
    const result = await bridge.termux(scriptCommand(a), 120000, true);
    const text = bridge.resultText ? bridge.resultText(result) : 'exit ' + result.exitCode + '\n' + String(result.stdout || '') + '\n' + String(result.stderr || '');
    if (output) output.textContent = text.slice(-60000);
    W.dispatchEvent(new CustomEvent('horizon-forge-result', { detail: { title: filename(a), type: a.type, result } }));
    return result;
  }
  function card(a) {
    const root = node('section', 'hf-card'); root.dataset.type = a.type; root.setAttribute('aria-label', 'Artifact: ' + filename(a));
    const head = node('header', 'hf-head'), title = node('strong', '', filename(a)); head.append(title, node('span', 'hf-type', a.type.toUpperCase()));
    const tabs = node('div', 'hf-tabs'); tabs.setAttribute('role', 'tablist');
    const preview = node('div', 'hf-preview'), save = node('div', 'hf-save'), status = node('p', 'hf-status'); status.setAttribute('role', 'status');
    const ptab = node('button', '', 'Preview'), stab = node('button', '', 'Save');
    const id = 'hf-' + (++seq);
    for (const pair of [[ptab, preview, 'preview'], [stab, save, 'save']]) {
      const [b, panel, key] = pair; b.type = 'button'; b.id = id + '-tab-' + key; b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', id + '-' + key); panel.id = id + '-' + key; panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', b.id);
    }
    tabs.append(ptab, stab); let started = false, svg = null;
    function select(which) {
      preview.hidden = which !== 'preview'; save.hidden = which !== 'save';
      for (const b of [ptab, stab]) { const active = b === (which === 'preview' ? ptab : stab); b.setAttribute('aria-selected', String(active)); b.tabIndex = active ? 0 : -1; }
      if (which === 'preview' && !started) { started = true; render().catch(e => { status.textContent = 'Preview failed: ' + errorText(e) + ' Source remains available in Save.'; }); }
    }
    ptab.onclick = () => select('preview'); stab.onclick = () => select('save');
    tabs.onkeydown = e => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) { e.preventDefault(); const b = e.key === 'Home' ? ptab : e.key === 'End' ? stab : D.activeElement === ptab ? stab : ptab; b.click(); b.focus(); } };
    async function action(b, fn) { b.disabled = true; try { await fn(); } catch (e) { status.textContent = errorText(e); } finally { b.disabled = false; } }
    const download = node('button', 'hf-download', 'Download .' + ext[a.type]); download.type = 'button';
    download.onclick = () => action(download, async () => {
      if (a.open) throw new Error('Incomplete artifact: ask the AI to finish it before saving.');
      if (a.content.length > MAX_SOURCE) throw new Error('Source exceeds the 1.5 MB limit.');
      const blob = a.type === 'pdf' ? (await buildPDF(a)).blob : new Blob([a.content], { type: mime[a.type] + ';charset=utf-8' });
      status.textContent = 'Saved: ' + await saveBlob(blob, filename(a));
    });
    const raw = node('pre', 'hf-source', a.content); raw.tabIndex = 0;
    save.append(node('p', '', 'Review the complete source. Files save only when you tap Download.'), download);
    if (a.type === 'mermaid') {
      const ds = node('button', '', 'Download .svg'); ds.type = 'button';
      ds.onclick = () => action(ds, async () => {
        if (!svg) throw new Error('Open Preview and wait for the diagram to render first.');
        status.textContent = 'Saved: ' + await saveBlob(new Blob([svg], { type: 'image/svg+xml' }), filename(a, 'svg'));
      }); save.append(ds);
    }
    save.append(raw); root.append(head, tabs, preview, save, status);
    const output = node('pre', 'hf-output'); output.setAttribute('aria-live', 'polite'); output.hidden = true;
    if (['sh', 'py', 'js'].includes(a.type)) {
      const b = node('button', 'hf-run', 'Run'); b.type = 'button'; b.disabled = !!a.open;
      b.onclick = () => action(b, async () => { output.hidden = false; output.textContent = 'Awaiting review / Termux result…'; try { const result = await run(a, output); if (!result) output.textContent = 'Run cancelled.'; } catch (e) { output.textContent = errorText(e); throw e; } });
      root.append(node('p', 'hf-warning', 'Runs on your device, not in an isolated security sandbox. Review source before Run.'), b, output);
    }
    async function render() {
      if (a.open) { preview.textContent = 'Artifact is incomplete. Ask the AI to continue and close </artifact>.'; return; }
      if (a.content.length > MAX_SOURCE) throw new Error('Source exceeds the 1.5 MB limit.');
      if (a.type === 'markdown') {
        if (W.HorizonMdView) preview.appendChild(W.HorizonMdView.convert(a.content)); else preview.append(node('pre', '', a.content));
      } else if (a.type === 'html' || a.type === 'svg') preview.append(frame(a.content, a.type));
      else if (a.type === 'mermaid') {
        preview.textContent = 'Rendering diagram…'; const m = await mermaidFrame(a.content); preview.replaceChildren(m.frame); svg = await m.result; status.textContent = 'Diagram ready. Save supports .mmd and .svg.';
      } else if (a.type === 'pdf') {
        preview.textContent = 'Building PDF…'; const built = await buildPDF(a), lib = await pdfLib();
        preview.replaceChildren(node('p', '', built.pages + ' page' + (built.pages === 1 ? '' : 's') + ' / 20 maximum'));
        const doc = await lib.getDocument({ data: new Uint8Array(await built.blob.arrayBuffer()) }).promise;
        try {
          for (let i = 1; i <= doc.numPages; i++) {
            if (!root.isConnected) break;
            const pg = await doc.getPage(i), vp = pg.getViewport({ scale: 1.1 });
            const canvas = node('canvas', 'hf-page'); canvas.setAttribute('aria-label', 'PDF page ' + i); canvas.width = Math.ceil(vp.width); canvas.height = Math.ceil(vp.height); preview.append(canvas);
            await pg.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise; pg.cleanup();
          }
        } finally { await doc.destroy(); }
      } else preview.append(node('pre', 'hf-source', a.content));
    }
    select('save'); // Lazily render only when the card is visible / Preview selected.
    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver(entries => { if (entries.some(e => e.isIntersecting)) { io.disconnect(); select('preview'); } }); io.observe(root);
      setTimeout(() => { if (!root.isConnected) io.disconnect(); }, 60000);
    } else setTimeout(() => select('preview'), 0);
    return root;
  }
  function view(a) {
    const dialog = node('dialog', 'hf-dialog'); dialog.setAttribute('aria-label', 'Artifact viewer');
    const close = node('button', 'hf-close', 'Close'); close.type = 'button'; close.onclick = () => dialog.close();
    dialog.append(close, card(a)); D.body.append(dialog);
    dialog.addEventListener('close', () => dialog.remove(), { once: true }); dialog.showModal(); close.focus(); return dialog;
  }
  function restoreVisibleArtifacts() {
    // Initial chat history is rendered before the asynchronous loader; repair only artifact-bearing AI bubbles.
    D.querySelectorAll('#chatMessages .message.ai').forEach(wrap => {
      const msg = wrap._msg;
      if (!msg || typeof msg.text !== 'string' || wrap.querySelector('.hf-card')) return;
      const parsed = parse(msg.text); if (!parsed.items.some(a => a.forge)) return;
      const bubble = wrap.querySelector('.bubble'); if (!bubble) return;
      wrap.querySelectorAll(':scope > .art-card').forEach(n => n.remove());
      bubble.replaceChildren(); bubble.style.display = parsed.prose ? '' : 'none';
      if (parsed.prose) bubble.append(W.HorizonMdView ? W.HorizonMdView.convert(parsed.prose) : D.createTextNode(parsed.prose));
      parsed.items.forEach(a => wrap.appendChild(a.forge ? card(a) : old.card(a)));
    });
  }
  const PROMPT = 'HORIZON FORGE FORMAT RULES — these supersede legacy PDF ARTIFACTS / MARKDOWN FILES formatting instructions elsewhere. For deliverable notes use <artifact type="markdown" title="Notes.md">Markdown</artifact>; for a page use <artifact type="html" title="Page.html">HTML</artifact>; vector art uses type="svg" and diagrams use type="mermaid" with raw Mermaid source. For a PDF output STRICT pdfmake JSON (not Markdown, not executable JavaScript) inside <artifact type="pdf" title="Report.pdf">{"content":[{"text":"Title","style":"heading"}],"styles":{"heading":{"fontSize":20,"bold":true}}}</artifact>. A4 only, bundled Roboto, text/tables/lists/canvas only, no images/remote assets/functions, maximum 20 rendered pages. To ensure exactly 20 pages provide 20 bounded sections with pageBreak:"before" on sections 2–20; avoid overflow. For scripts use <artifact type="sh|py|js" title="Name.ext">complete script</artifact> (choose one actual type). The card offers Run through the existing Termux bridge only after the user taps Run and approves. Termux is NOT an isolated security sandbox. Never claim execution, test success or a saved file until a real result is available. PDF JSON can be used when PDF is enabled; respect tool-off settings. Close every artifact tag. Do not place [[termux.run]] inside or alongside script artifacts: artifacts NEVER execute automatically. Existing old Markdown PDF history and long-document core paths stay supported.';
  function install() {
    if (old || !W.HorizonPDF) return;
    old = Object.assign({}, W.HorizonPDF);
    W.HorizonPDF.parse = parse;
    W.HorizonPDF.card = a => a.forge ? card(a) : old.card(a);
    W.HorizonPDF.build = async a => a.forge && a.type === 'pdf' ? (await buildPDF(a)).blob : old.build(a);
    W.HorizonPDF.pageCount = async a => {
      if (!a.forge) return old.pageCount(a);
      if (a.type !== 'pdf') return 0;
      try { return (await buildPDF(a)).pages; } catch (_) { return 0; }
    };
    if (W.EmberArtifacts) {
      const previous = Object.assign({}, W.EmberArtifacts);
      W.EmberArtifacts.parse = parse;
      W.EmberArtifacts.card = W.EmberArtifacts.render = a => a.forge ? card(a) : previous.card(a);
      W.EmberArtifacts.view = a => a.forge ? view(a) : previous.view(a);
      W.EmberArtifacts.build = a => a.forge && a.type === 'pdf' ? buildPDF(a).then(r => r.blob) : previous.build(a);
      W.EmberArtifacts.download = async a => {
        if (!a.forge) return previous.download(a);
        if (a.open) throw new Error('Incomplete artifact.');
        const blob = a.type === 'pdf' ? (await buildPDF(a)).blob : new Blob([a.content], { type: mime[a.type] });
        return saveBlob(blob, filename(a));
      };
    }
    // Prompt-only decorator: no provider, network, bridge execution or persisted prompt changes.
    if (W.HorizonBridges) { const block = W.HorizonBridges.block; W.HorizonBridges.block = function () { return block.apply(this, arguments) + '\n\n' + PROMPT; }; }
    if (W.EmberDocumentEngine && typeof W.EmberDocumentEngine.note === 'function') {
      const engine = W.EmberDocumentEngine;
      W.EmberDocumentEngine = Object.freeze(Object.assign({}, engine, {
        note: function () { return engine.note.apply(engine, arguments) + '\n\n' + PROMPT; },
        apply: function () {
          const result = engine.apply.apply(engine, arguments);
          return result && result.documentMode ? Object.assign({}, result, { system: String(result.system || '') + '\n\n' + PROMPT }) : result;
        }
      }));
    }
    if (!D.querySelector('link[data-horizon-forge]')) { const style = node('link'); style.rel = 'stylesheet'; style.href = new URL('horizon_forge.css', ROOT).href; style.dataset.horizonForge = ''; D.head.append(style); }
    restoreVisibleArtifacts();
    if (W.EmberArtBox && W.EmberArtBox.refresh) W.EmberArtBox.refresh();
  }
  W.HorizonForge = { version: '1.0.0', parse, card, view, restoreVisibleArtifacts, buildPDF, definition, scriptCommand, run, saveBlob, prompt: () => PROMPT, install };
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', install, { once: true }); else install();
})();
