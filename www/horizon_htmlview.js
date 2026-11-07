/* HORIZON V1.46.0 · HTML preview + Save as for code blocks in chat.
   Any code block that is an HTML page (```html, or text starting with <!doctype / <html) or an SVG gets two buttons in its header:
   PREVIEW opens it full screen in a sandboxed frame (scripts run, but it cannot touch Horizon's data); SAVE AS writes the file
   to Documents/Horizon (or downloads it in a browser). Nothing is sent anywhere. */
(function () {
  'use strict';
  var NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  var ov = null, scanT = 0, popBound = false;

  function plug(n) { try { return NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[n] ? window.Capacitor.Plugins[n] : null; } catch (e) { return null; } }
  function toast(title, sub, kind) { if (window.HzToast) HzToast.show({ icon: kind === 'bad' ? 'i-info' : 'i-check', title: title, sub: sub || '', kind: kind || 'ok' }); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }

  function kindOf(block, raw) {
    var lang = ((block.querySelector('.code-lang') || {}).textContent || '').trim().toLowerCase();
    var t = String(raw || '').replace(/^\s+/, '').slice(0, 400);
    if (lang === 'html' || lang === 'htm' || /^<!doctype\s+html/i.test(t) || /^<html[\s>]/i.test(t)) return 'html';
    if (lang === 'svg' || /^<svg[\s>]/i.test(t)) return 'svg';
    return '';
  }
  function rawOf(block) { var c = block.querySelector('pre code'); return c ? c.textContent : ''; }
  function titleOf(raw, kind) {
    var m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw);
    var t = m ? m[1].replace(/\s+/g, ' ').trim() : '';
    return t.slice(0, 60) || (kind === 'svg' ? 'Horizon SVG' : 'Horizon page');
  }
  function fileNameFor(raw, kind) {
    var base = titleOf(raw, kind).replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'horizon-page';
    return base + (kind === 'svg' ? '.svg' : '.html');
  }
  function docFor(raw, kind) {
    var s = String(raw || '');
    if (kind === 'svg') return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#fff;display:flex;align-items:center;justify-content:center}svg{max-width:100%;max-height:100%}</style></head><body>' + s + '</body></html>';
    if (!/<meta[^>]+viewport/i.test(s)) {
      if (/<head[^>]*>/i.test(s)) s = s.replace(/<head[^>]*>/i, function (m) { return m + '<meta name="viewport" content="width=device-width,initial-scale=1">'; });
      else if (/<html[^>]*>/i.test(s)) s = s.replace(/<html[^>]*>/i, function (m) { return m + '<head><meta name="viewport" content="width=device-width,initial-scale=1"></head>'; });
      else s = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + s + '</body></html>';
    }
    return s;
  }

  async function saveAs(name, text) {
    var fname = String(name || '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'horizon-page.html';
    if (!/\.(html?|svg)$/i.test(fname)) fname += '.html';
    var FSP = plug('Filesystem');
    if (NATIVE && FSP) {
      var data = btoa(unescape(encodeURIComponent(text)));
      var targets = [{ d: 'DOCUMENTS', p: 'Horizon/' + fname, l: 'Documents/Horizon/' + fname }, { d: 'EXTERNAL', p: 'Horizon/' + fname, l: 'app storage/Horizon/' + fname }];
      var err = '';
      for (var i = 0; i < targets.length; i++) {
        try { await FSP.writeFile({ path: targets[i].p, data: data, directory: targets[i].d, recursive: true }); return targets[i].l; }
        catch (e) { err = (e && e.message) || String(e); }
      }
      throw new Error(err || 'could not write the file');
    }
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: /\.svg$/i.test(fname) ? 'image/svg+xml' : 'text/html' }));
    a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    return fname;
  }

  function askName(def, then) {
    var sheet = el('div', 'hv-sheet');
    var box = el('div', 'hv-box');
    box.appendChild(el('b', null, 'Save as'));
    var inp = el('input'); inp.type = 'text'; inp.value = def; inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'File name');
    box.appendChild(inp);
    box.appendChild(el('small', null, 'Goes to Documents/Horizon on this phone.'));
    var row = el('div', 'hv-row');
    var no = el('button', 'hv-btn', 'Cancel'), ok = el('button', 'hv-btn pri', 'Save');
    no.type = ok.type = 'button';
    no.onclick = function () { sheet.remove(); };
    ok.onclick = function () { var v = inp.value; sheet.remove(); then(v); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') ok.click(); });
    row.appendChild(no); row.appendChild(ok); box.appendChild(row); sheet.appendChild(box);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.remove(); });
    (ov || document.body).appendChild(sheet);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 50);
  }

  function doSave(raw, kind) {
    askName(fileNameFor(raw, kind), function (name) {
      saveAs(name, kind === 'svg' ? raw : docFor(raw, kind)).then(function (where) { toast('Saved', where); }, function (e) { toast('Could not save', (e && e.message) || '', 'bad'); });
    });
  }

  function closePreview(fromPop) {
    if (!ov) return;
    ov.remove(); ov = null;
    if (!fromPop && history.state && history.state.hvPrev) { try { history.back(); } catch (e) { /* ignore */ } }
  }

  function preview(raw, kind) {
    if (ov) closePreview(true);
    ov = el('div', 'hv-ov');
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-label', 'Preview');
    var bar = el('div', 'hv-bar');
    var close = el('button', 'hv-btn', 'Close'); close.type = 'button'; close.onclick = function () { closePreview(false); };
    bar.appendChild(close);
    bar.appendChild(el('span', 'hv-title', titleOf(raw, kind)));
    var sv = el('button', 'hv-btn pri', 'Save as'); sv.type = 'button'; sv.onclick = function () { doSave(raw, kind); };
    bar.appendChild(sv);
    var fr = document.createElement('iframe');
    fr.className = 'hv-frame';
    fr.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');
    fr.setAttribute('title', 'Page preview');
    var doc = docFor(raw, kind), loaded = false;
    fr.addEventListener('load', function () { loaded = true; });
    fr.srcdoc = doc;
    ov.appendChild(bar); ov.appendChild(fr);
    document.body.appendChild(ov);
    /* V1.46.0: if this WebView never loads the srcdoc frame, fall back to a blob page so Preview always shows the page. */
    setTimeout(function () {
      if (loaded || !ov || fr.parentNode !== ov) return;
      try { fr.removeAttribute('srcdoc'); fr.src = URL.createObjectURL(new Blob([doc], { type: 'text/html' })); } catch (e) { /* ignore */ }
    }, 1500);
    try { history.pushState({ hvPrev: true }, ''); } catch (e) { /* ignore */ }
    if (!popBound) { popBound = true; window.addEventListener('popstate', function () { if (ov) closePreview(true); }); }
  }

  function decorate(block) {
    if (block.getAttribute('data-hv') === '1') return;
    var head = block.querySelector('.code-head');
    if (!head) return;
    var raw = rawOf(block), kind = kindOf(block, raw);
    block.setAttribute('data-hv', '1');
    if (!kind) return;
    var copy = head.querySelector('.code-copy');
    var acts = el('div', 'hv-acts');
    var pv = el('button', 'code-copy hv-pv', '\u25B6 Preview'); pv.type = 'button'; pv.setAttribute('aria-label', 'Preview this page (does not save)');
    var sv = el('button', 'code-copy hv-sv', 'Save'); sv.type = 'button'; sv.setAttribute('aria-label', 'Save this page as a file');
    pv.addEventListener('click', function (e) { e.stopPropagation(); var r = rawOf(block); if (!r.trim()) { toast('Nothing to preview yet', '', 'bad'); return; } preview(r, kind); });
    sv.addEventListener('click', function (e) { e.stopPropagation(); doSave(rawOf(block), kind); });
    acts.appendChild(pv); acts.appendChild(sv);
    if (copy) acts.appendChild(copy);
    head.appendChild(acts);
  }

  function scan() {
    scanT = 0;
    document.querySelectorAll('.code-block:not([data-hv="1"])').forEach(decorate);
  }
  function queue() { if (!scanT) scanT = setTimeout(scan, 120); }

  function init() {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.HorizonHtmlView = { preview: preview, save: doSave };
})();
