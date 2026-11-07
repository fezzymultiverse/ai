/* HORIZON V1.57.0 · Markdown blocks in chat.
   Any ```markdown / ```md block gets: a Raw | Converted switch, Save (.md or .html) and the normal Copy (always copies the raw text).
   The converter builds DOM nodes only (no innerHTML from the reply), links are http/https/mailto only. Nothing is sent anywhere. */
(function () {
  'use strict';
  var NATIVE = !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  var scanT = 0;

  function plug(n) { try { return NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[n] ? window.Capacitor.Plugins[n] : null; } catch (e) { return null; } }
  function toast(title, sub, kind) { if (window.HzToast) HzToast.show({ icon: kind === 'bad' ? 'i-info' : 'i-check', title: title, sub: sub || '', kind: kind || 'ok' }); }
  function el(tag, cls, txt) { var e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; }
  function rawOf(block) { var c = block.querySelector('pre code'); return c ? c.textContent : ''; }
  function isMd(block) { var l = ((block.querySelector('.code-lang') || {}).textContent || '').trim().toLowerCase(); return l === 'markdown' || l === 'md'; }

  /* ---------- inline ---------- */
  function safeHref(u) {
    u = String(u || '').trim();
    return /^(https?:\/\/|mailto:)/i.test(u) ? u : '';
  }
  var INL = /(`+)([^`]+?)\1|\*\*([^*]+?)\*\*|__([^_]+?)__|~~([^~]+?)~~|\*([^*\s][^*]*?)\*|(?:^|\b)_([^_]+?)_(?=\b|$)|(!?)\[([^\]]*)\]\(([^)\s]+)\)|(https?:\/\/[^\s<>)]+)/g;
  function inline(parent, text) {
    var re = new RegExp(INL.source, 'g'), last = 0, m;
    while ((m = re.exec(text))) {
      if (m.index > last) parent.appendChild(document.createTextNode(text.slice(last, m.index)));
      var n;
      if (m[2] != null) { n = el('code', null, m[2]); }
      else if (m[3] != null || m[4] != null) { n = el('strong'); inline(n, m[3] != null ? m[3] : m[4]); }
      else if (m[5] != null) { n = el('del'); inline(n, m[5]); }
      else if (m[6] != null || m[7] != null) { n = el('em'); inline(n, m[6] != null ? m[6] : m[7]); }
      else if (m[10] != null) {
        var h = safeHref(m[10]);
        if (m[8] === '!') n = document.createTextNode('[image: ' + (m[9] || m[10]) + ']');
        else if (h) { n = el('a'); n.href = h; n.target = '_blank'; n.rel = 'noopener noreferrer'; inline(n, m[9] || h); }
        else n = document.createTextNode(m[0]);
      } else {
        var u = m[11].replace(/[.,;:!?]+$/, ''), hh = safeHref(u);
        if (hh) { n = el('a', null, u); n.href = hh; n.target = '_blank'; n.rel = 'noopener noreferrer'; re.lastIndex = m.index + u.length; last = m.index + u.length; parent.appendChild(n); continue; }
        n = document.createTextNode(m[0]);
      }
      parent.appendChild(n);
      last = m.index + m[0].length;
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
  }

  /* ---------- blocks ---------- */
  function cells(line) {
    var t = line.trim().replace(/^\|/, '').replace(/\|$/, '');
    return t.split('|').map(function (c) { return c.trim(); });
  }
  var LI = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
  function indentOf(s) { return s.replace(/\t/g, '    ').length; }

  function convert(raw) {
    var root = el('div', 'mv-doc');
    var lines = String(raw || '').replace(/\r\n/g, '\n').split('\n');
    var i = 0;
    while (i < lines.length) {
      var line = lines[i];
      if (/^\s*$/.test(line)) { i++; continue; }

      var fm = /^\s*(`{3,}|~{3,})\s*([\w+#.-]*)/.exec(line);
      if (fm) {
        var ch = fm[1].charAt(0), len = fm[1].length, buf = [];
        i++;
        while (i < lines.length && !(new RegExp('^\\s*' + (ch === '`' ? '`' : '~') + '{' + len + ',}\\s*$')).test(lines[i])) { buf.push(lines[i]); i++; }
        i++;
        var pre = el('pre'), code = el('code', null, buf.join('\n'));
        if (fm[2]) pre.setAttribute('data-lang', fm[2]);
        pre.appendChild(code); root.appendChild(pre);
        continue;
      }
      var h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
      if (h) { var he = el('h' + h[1].length); inline(he, h[2]); root.appendChild(he); i++; continue; }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { root.appendChild(el('hr')); i++; continue; }
      if (/^\s*>/.test(line)) {
        var q = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        var bq = el('blockquote'), inner = convert(q.join('\n'));
        while (inner.firstChild) bq.appendChild(inner.firstChild);
        root.appendChild(bq); continue;
      }
      if (line.indexOf('|') !== -1 && i + 1 < lines.length && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1])) {
        var head = cells(line), al = cells(lines[i + 1]).map(function (c) { return /^:-+:$/.test(c) ? 'center' : (/-+:$/.test(c) ? 'right' : ''); });
        var wrap = el('div', 'mv-tbl'), tb = el('table'), th = el('thead'), tr = el('tr');
        head.forEach(function (c, k) { var t = el('th'); inline(t, c); if (al[k]) t.style.textAlign = al[k]; tr.appendChild(t); });
        th.appendChild(tr); tb.appendChild(th);
        var tbd = el('tbody'); i += 2;
        while (i < lines.length && lines[i].indexOf('|') !== -1 && !/^\s*$/.test(lines[i])) {
          var r = el('tr'); cells(lines[i]).forEach(function (c, k) { var d = el('td'); inline(d, c); if (al[k]) d.style.textAlign = al[k]; r.appendChild(d); });
          tbd.appendChild(r); i++;
        }
        tb.appendChild(tbd); wrap.appendChild(tb); root.appendChild(wrap); continue;
      }
      if (LI.test(line)) {
        var stack = [], top = null;
        while (i < lines.length) {
          var lm = LI.exec(lines[i]);
          if (!lm) {
            if (/^\s*$/.test(lines[i]) && i + 1 < lines.length && LI.test(lines[i + 1])) { i++; continue; }
            break;
          }
          var ind = indentOf(lm[1]), ord = /\d/.test(lm[2]);
          while (stack.length && stack[stack.length - 1].ind > ind) stack.pop();
          var cur = stack[stack.length - 1];
          if (!cur || cur.ind < ind || cur.ord !== ord) {
            if (cur && cur.ind === ind && cur.ord !== ord) stack.pop();
            var lst = el(ord ? 'ol' : 'ul');
            var parentLi = stack.length ? stack[stack.length - 1].lastLi : null;
            (parentLi || root).appendChild(lst);
            cur = { ind: ind, ord: ord, list: lst, lastLi: null };
            stack.push(cur);
          }
          var li = el('li'), body = lm[3], task = /^\[( |x|X)\]\s+(.*)$/.exec(body);
          if (task) {
            var cb = el('input'); cb.type = 'checkbox'; cb.disabled = true; cb.checked = task[1] !== ' ';
            li.className = 'mv-task'; li.appendChild(cb); inline(li, ' ' + task[2]);
          } else inline(li, body);
          cur.list.appendChild(li); cur.lastLi = li;
          i++;
        }
        continue;
      }
      var pb = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && !/^\s*(`{3,}|~{3,}|#{1,6}\s|>)/.test(lines[i]) && !LI.test(lines[i]) && !(pb.length && /^\s*([-*_])(\s*\1){2,}\s*$/.test(lines[i]))) { pb.push(lines[i]); i++; }
      if (!pb.length) { pb.push(lines[i]); i++; }
      var p = el('p');
      pb.forEach(function (l, k) { if (k) p.appendChild(el('br')); inline(p, l.replace(/\s+$/, '')); });
      root.appendChild(p);
    }
    return root;
  }

  /* ---------- save ---------- */
  function titleOf(raw) {
    var m = /^\s*#{1,6}\s+(.+?)\s*#*\s*$/m.exec(raw);
    var t = m ? m[1].replace(/[`*_~\[\]()]/g, '') : '';
    return t.replace(/\s+/g, ' ').trim().slice(0, 60) || 'Horizon notes';
  }
  function baseName(raw) { return titleOf(raw).replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 48) || 'horizon-notes'; }
  var PAGE_CSS = 'body{margin:0;padding:20px;background:#0b0f14;color:#e8eef5;font:16px/1.65 system-ui,sans-serif}.mv-doc{max-width:760px;margin:0 auto}h1,h2,h3,h4,h5,h6{color:#22d3ee;line-height:1.25}a{color:#67e8f9}code{background:#162029;padding:2px 6px;border-radius:6px;font-family:ui-monospace,monospace;font-size:.92em}pre{background:#0f171e;border:1px solid #223;padding:12px;border-radius:10px;overflow:auto}pre code{background:none;padding:0}blockquote{margin:12px 0;padding:2px 14px;border-left:3px solid #22d3ee;color:#b7c4d1}table{border-collapse:collapse;width:100%}th,td{border:1px solid #2a3947;padding:8px 10px;text-align:left}th{background:#12202a}hr{border:0;border-top:1px solid #2a3947}.mv-tbl{overflow:auto}';
  function pageFor(raw) {
    var d = convert(raw), tmp = el('div'); tmp.appendChild(d);
    var esc = titleOf(raw).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc + '</title><style>' + PAGE_CSS + '</style></head><body>' + tmp.innerHTML + '</body></html>';
  }
  async function writeFile(fname, text, mime) {
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
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = fname; document.body.appendChild(a); a.click(); a.remove();
    return fname;
  }
  function saveSheet(raw) {
    var sheet = el('div', 'mv-sheet'), box = el('div', 'hv-box');
    box.appendChild(el('b', null, 'Save as'));
    var inp = el('input'); inp.type = 'text'; inp.value = baseName(raw); inp.autocapitalize = 'off'; inp.spellcheck = false; inp.setAttribute('aria-label', 'File name');
    box.appendChild(inp);
    box.appendChild(el('small', null, 'Goes to Documents/Horizon on this phone. .md keeps the raw text; .html is the converted page.'));
    var row = el('div', 'hv-row');
    var no = el('button', 'hv-btn', 'Cancel'), h = el('button', 'hv-btn', 'Save .html'), md = el('button', 'hv-btn pri', 'Save .md');
    no.type = h.type = md.type = 'button';
    function clean() { return (inp.value || '').replace(/\.(md|markdown|html?)$/i, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'horizon-notes'; }
    function go(ext, text, mime) {
      var name = clean() + ext; sheet.remove();
      writeFile(name, text, mime).then(function (where) { toast('Saved', where); }, function (e) { toast('Could not save', (e && e.message) || '', 'bad'); });
    }
    no.onclick = function () { sheet.remove(); };
    md.onclick = function () { go('.md', raw, 'text/markdown'); };
    h.onclick = function () { go('.html', pageFor(raw), 'text/html'); };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') md.click(); });
    row.appendChild(no); row.appendChild(h); row.appendChild(md); box.appendChild(row); sheet.appendChild(box);
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.remove(); });
    document.body.appendChild(sheet);
    setTimeout(function () { try { inp.focus(); inp.select(); } catch (e) { /* ignore */ } }, 50);
  }

  /* ---------- block UI ---------- */
  function decorate(block) {
    if (block.getAttribute('data-mv') === '1') return;
    var head = block.querySelector('.code-head');
    if (!head) return;
    block.setAttribute('data-mv', '1');
    if (!isMd(block)) return;
    var pre = block.querySelector('pre'), view = null;
    var seg = el('div', 'mv-seg'), bRaw = el('button', 'mv-s on', 'Raw'), bConv = el('button', 'mv-s', 'Converted');
    bRaw.type = bConv.type = 'button';
    bRaw.setAttribute('aria-label', 'Show the raw markdown'); bConv.setAttribute('aria-label', 'Show the converted markdown');
    function show(conv) {
      bRaw.classList.toggle('on', !conv); bConv.classList.toggle('on', conv);
      if (conv) {
        var raw = rawOf(block);
        if (!raw.trim()) { toast('Nothing to convert yet', '', 'bad'); show(false); return; }
        if (view) view.remove();
        view = el('div', 'mv-view'); view.appendChild(convert(raw));
        pre.hidden = true; block.appendChild(view);
      } else {
        if (view) { view.remove(); view = null; }
        pre.hidden = false;
      }
    }
    bRaw.addEventListener('click', function (e) { e.stopPropagation(); show(false); });
    bConv.addEventListener('click', function (e) { e.stopPropagation(); show(true); });
    seg.appendChild(bRaw); seg.appendChild(bConv);
    var sv = el('button', 'code-copy mv-sv', 'Save'); sv.type = 'button'; sv.setAttribute('aria-label', 'Save this markdown as a file');
    sv.addEventListener('click', function (e) { e.stopPropagation(); var r = rawOf(block); if (!r.trim()) { toast('Nothing to save yet', '', 'bad'); return; } saveSheet(r); });
    var copy = head.querySelector('.code-copy');
    var acts = el('div', 'mv-acts');
    acts.appendChild(seg); acts.appendChild(sv);
    if (copy) acts.appendChild(copy);
    head.appendChild(acts);
  }
  function scan() { scanT = 0; document.querySelectorAll('.code-block:not([data-mv="1"])').forEach(decorate); }
  function queue() { if (!scanT) scanT = setTimeout(scan, 120); }
  function init() { scan(); new MutationObserver(queue).observe(document.body, { childList: true, subtree: true }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.HorizonMdView = { convert: convert, save: saveSheet };
})();
