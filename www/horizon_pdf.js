// Horizon V1.4.0 - horizon_pdf.js
// Glue between the Ember A4 document engine (ember_document_engine.js) and Horizon's chat.
//   parse(text)   finds <artifact type="pdf" title="X.pdf">markdown</artifact> blocks in a reply
//   card(a)       the artifact card shown in the chat: View + Download
//   view(a)       full-screen viewer (the real PDF, drawn page by page with bundled pdf.js)
//   download(a)   saves the PDF (native saver is set by index.html, browser falls back to a link)
// pdfmake and pdf.js load from ./vendor the first time they are needed. No network.
'use strict';
(() => {
  const W = window, D = document;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = m => { try { (W.toast || console.log)(m); } catch (_) { /* no toast */ } };

  // ---------- parse ----------
  const PDF_TYPES = /^(?:pdf|document|markdown)$/i;
  function parse(text) {
    const src = String(text || ''), items = [], re = /<artifact\b([^>]*)>([\s\S]*?)(?:<\/artifact\s*>|$)/gi;
    let prose = '', at = 0, m;
    while ((m = re.exec(src))) {
      prose += src.slice(at, m.index); at = re.lastIndex;
      const attrs = {}, ar = /([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g; let a;
      while ((a = ar.exec(m[1]))) attrs[a[1].toLowerCase()] = a[2] != null ? a[2] : a[3];
      let body = m[2].replace(/^\s*\n/, '').replace(/\s+$/, '');
      const fenced = /^```(?:markdown|md)?[ \t]*\n([\s\S]*?)\n```$/.exec(body);
      if (fenced) body = fenced[1];
      if (!PDF_TYPES.test(attrs.type || 'pdf')) { prose += '\n\n```\n' + body + '\n```\n\n'; continue; } // other types are shown as plain text
      let title = String(attrs.title || 'Document.pdf').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '').trim().slice(0, 80) || 'Document.pdf';
      if (!/\.pdf$/i.test(title)) title = title.replace(/\.[A-Za-z0-9]{1,4}$/, '') + '.pdf';
      items.push({ type: 'pdf', title, content: body, attrs, open: !/<\/artifact\s*>\s*$/i.test(m[0]) });
    }
    prose += src.slice(at);
    return { items, prose: prose.replace(/\n{3,}/g, '\n\n').trim() };
  }

  // ---------- markdown -> pdfmake (A4, margins 48/64/48/58, body 10.5pt) ----------
  const THEMES = { ember: '#c2410c', ocean: '#0369a1', forest: '#15803d', violet: '#6d28d9', crimson: '#be123c', teal: '#0f766e', slate: '#334155', gold: '#a16207', rose: '#e11d48', midnight: '#1e3a8a', mint: '#047857', sunset: '#ea580c', mono: '#111827' };
  const CALLOUT = { note: ['#0369a1', '#e0f2fe'], info: ['#0369a1', '#e0f2fe'], tip: ['#15803d', '#dcfce7'], success: ['#15803d', '#dcfce7'], important: ['#6d28d9', '#ede9fe'], warning: ['#b45309', '#fef3c7'], caution: ['#b45309', '#fef3c7'], danger: ['#be123c', '#ffe4e6'] };
  const REPL = { '✓': '[x]', '✔': '[x]', '✗': 'x', '✘': 'x', '→': '->', '←': '<-', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=', '≈': '~', '−': '-', ' ': ' ', ' ': ' ', ' ': ' ' };
  function clean(s) {
    let o = '';
    for (const ch of String(s == null ? '' : s)) {
      const c = ch.codePointAt(0);
      if (c === 9) o += '    ';
      else if (c === 10 || c === 13) o += ' ';
      else if (c < 32 || (c >= 127 && c < 160) || c === 0xFEFF || c === 0x200B || c === 0x200D || c === 0xFE0F) continue;
      else if (REPL[ch] !== undefined) o += REPL[ch];
      else if (c >= 0x1F000 || (c >= 0x2600 && c <= 0x27BF) || (c >= 0x2B00 && c <= 0x2BFF)) continue;
      else o += ch;
    }
    return o;
  }

  function runs(src, ctx, st) {
    st = st || {}; const out = [];
    const re = /(`+)([^`]+?)\1|\*\*\*([^*]+?)\*\*\*|\*\*([^*]+?)\*\*|__([^_]+?)__|\*([^*\s][^*]*?)\*|\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)|~~([^~]+?)~~/g;
    let last = 0, m;
    const add = (t, extra) => { if (t) out.push(Object.assign({ text: clean(t) }, st, extra || {})); };
    while ((m = re.exec(src))) {
      add(src.slice(last, m.index));
      if (m[2] !== undefined) add(m[2], { color: '#9a3412', background: '#f1f5f9' });
      else if (m[3] !== undefined) out.push(...runs(m[3], ctx, Object.assign({}, st, { bold: true, italics: true })));
      else if (m[4] !== undefined) out.push(...runs(m[4], ctx, Object.assign({}, st, { bold: true })));
      else if (m[5] !== undefined) out.push(...runs(m[5], ctx, Object.assign({}, st, { bold: true })));
      else if (m[6] !== undefined) out.push(...runs(m[6], ctx, Object.assign({}, st, { italics: true })));
      else if (m[7] !== undefined) {
        const link = /^(?:https?:|mailto:)/i.test(m[8]) ? m[8] : null;
        out.push(...runs(m[7], ctx, Object.assign({}, st, link ? { link, color: ctx.accent, decoration: 'underline' } : {})));
      } else if (m[9] !== undefined) out.push(...runs(m[9], ctx, Object.assign({}, st, { decoration: 'lineThrough' })));
      last = re.lastIndex;
    }
    add(src.slice(last));
    return out.length ? out : [{ text: '' }];
  }

  function frontMatter(md) {
    const m = /^﻿?---[ \t]*\n([\s\S]*?)\n---[ \t]*(?:\n|$)/.exec(md), o = {};
    if (!m) return { md, o };
    m[1].split('\n').forEach(l => { const k = /^\s*([\w-]+)\s*:\s*(.*?)\s*$/.exec(l); if (k) o[k[1].toLowerCase()] = k[2]; });
    return { md: md.slice(m[0].length), o };
  }

  function toDoc(source, title, attrs) {
    const fm = frontMatter(String(source || '').replace(/\r\n?/g, '\n')), opt = Object.assign({}, attrs || {}, fm.o);
    const name = String(title || 'Document').replace(/\.pdf$/i, '');
    const accent = /^#[0-9a-f]{6}$/i.test(opt.accent || '') ? opt.accent : (THEMES[String(opt.theme || 'ocean').toLowerCase()] || THEMES.ocean);
    const ctx = { accent }, wantCover = /^(?:true|yes|on|1)$/i.test(opt.cover || ''), wantToc = /^(?:true|yes|on|1)$/i.test(opt.toc || '');
    const tpl = String(opt.template || 'report').toLowerCase(), isCv = /^(?:cv|resume)$/.test(tpl), isLetter = tpl === 'letter';
    const M = isCv ? [40, 40, 40, 40] : isLetter ? [64, 64, 64, 64] : [48, 64, 48, 58], WIDTH = 595.28 - M[0] - M[2];
    const content = [], L = fm.md.split('\n');
    let afterH1 = false;
    let target = content, cols = null, pending = false, i = 0, para = [];
    const R = (t, st) => runs(t, ctx, st);
    const emit = n => { if (pending && target === content) { n.pageBreak = 'before'; pending = false; } target.push(n); };
    const flush = () => { if (para.length) { emit(isCv && afterH1 ? { text: R(para.join(' '), { color: '#475569' }), fontSize: 9.5, margin: [0, 0, 0, 8] } : { text: R(para.join(' ')), margin: [0, 0, 0, isLetter ? 9 : 6] }); afterH1 = false; para = []; } };
    const isSep = s => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(s) && s.includes('-');
    const cells = s => s.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
    const kv = lines => lines.map(l => l.split('|')).filter(p => p.length > 1 || (p[0] && p[0].trim())).map(p => [p[0].trim(), p.slice(1).join('|').trim()]);

    function table(rows) {
      const n = Math.max(...rows.map(r => r.length)), body = rows.map((r, ri) => Array.from({ length: n }, (_, c) =>
        ({ text: R(r[c] || '', ri === 0 ? { bold: true, color: '#ffffff' } : {}), fontSize: 9.5, alignment: /^[A-Z$\u20ac\u00a3]{0,3}\s?[-+]?[\d][\d\s.,]*%?$/.test(clean(r[c] || '').trim()) ? 'right' : undefined })));
      const widths = Array.from({ length: n }, (_, c) => Math.max(...rows.map(r => clean(r[c] || '').length)) <= 8 ? 'auto' : '*');
      return { table: { headerRows: 1, widths, dontBreakRows: true, body }, margin: [0, 2, 0, 10],
        layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1',
          paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4,
          fillColor: r => r === 0 ? accent : (r % 2 === 0 ? '#f8fafc' : null) } };
    }
    function codeBlock(lines) {
      const rows = []; for (let k = 0; k < lines.length || !rows.length; k += 28) rows.push([{ text: clean(lines.slice(k, k + 28).join('\n')) || ' ', preserveLeadingSpaces: true, fontSize: 8.5, color: '#0f172a', lineHeight: 1.2 }]);
      return { table: { widths: ['*'], dontBreakRows: true, body: rows }, margin: [0, 2, 0, 10],
        layout: { hLineWidth: (k, t) => (k === 0 || k === t.table.body.length) ? 0.5 : 0, vLineWidth: () => 0.5, hLineColor: () => '#cbd5e1', vLineColor: () => '#cbd5e1',
          paddingLeft: () => 8, paddingRight: () => 8, paddingTop: () => 3, paddingBottom: () => 3, fillColor: () => '#f1f5f9' } };
    }
    function boxed(stack, bar, fill) {
      return { table: { widths: [3, '*'], body: [[{ text: '', fillColor: bar }, { stack, fillColor: fill, margin: [8, 6, 8, 6] }]] }, margin: [0, 2, 0, 10],
        layout: { hLineWidth: () => 0, vLineWidth: () => 0, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } };
    }
    function listNodes(items) {
      let k = 0;
      const build = lvl => {
        const first = items[k], ordered = first.ord != null, out = [];
        while (k < items.length && items[k].lvl >= lvl) {
          if (items[k].lvl > lvl) { const sub = build(items[k].lvl); if (out.length) out[out.length - 1].stack.push(sub); else out.push({ stack: [sub] }); continue; }
          const it = items[k++]; out.push({ stack: [{ text: R((it.box === null ? '' : it.box ? '[x] ' : '[ ] ') + it.t) }] });
        }
        return ordered ? { ol: out, start: first.ord, margin: [0, 0, 0, 3] } : { ul: out, margin: [0, 0, 0, 3] };
      };
      const nodes = []; while (k < items.length) nodes.push(build(items[k].lvl));
      nodes[nodes.length - 1].margin = [0, 0, 0, 8]; return nodes;
    }
    function chart(lines) {
      const spec = { type: 'bar', title: '', unit: '', source: '', pts: [] };
      lines.forEach(l => {
        const h = /^\s*(type|title|unit|source)\s*:\s*(.*)$/i.exec(l);
        if (h) { spec[h[1].toLowerCase()] = h[2].trim(); return; }
        const p = l.split('|'); const v = parseFloat(String(p[1] || '').replace(/[^\d.+-]/g, ''));
        if (p.length > 1 && isFinite(v)) spec.pts.push({ label: p[0].trim(), v });
      });
      if (!spec.pts.length) return null;
      const share = /^(?:pie|donut)$/i.test(spec.type), max = Math.max(...spec.pts.map(p => Math.abs(p.v))) || 1, sum = spec.pts.reduce((a, p) => a + Math.abs(p.v), 0) || 1;
      const stack = [];
      if (spec.title) stack.push({ text: clean(spec.title), bold: true, fontSize: 11, margin: [0, 0, 0, 6] });
      spec.pts.forEach(p => stack.push({ columns: [
        { width: 120, text: clean(p.label), fontSize: 9 },
        { width: '*', canvas: [{ type: 'rect', x: 0, y: 1, w: Math.max(1, Math.abs(p.v) / max * 280), h: 9, color: p.v < 0 ? '#be123c' : accent }] },
        { width: 70, text: share ? Math.round(Math.abs(p.v) / sum * 1000) / 10 + '%' : clean(p.v + (spec.unit ? ' ' + spec.unit : '')), fontSize: 9, alignment: 'right' }], columnGap: 8, margin: [0, 0, 0, 3] }));
      if (spec.source) stack.push({ text: 'Source: ' + clean(spec.source), fontSize: 8, italics: true, color: '#64748b', margin: [0, 3, 0, 0] });
      return { unbreakable: true, stack, margin: [0, 2, 0, 10] };
    }
    function stats(lines) {
      const k = kv(lines).slice(0, 8); if (!k.length) return null;
      const per = Math.min(4, k.length), rows = [];
      for (let a = 0; a < k.length; a += per) rows.push(Array.from({ length: per }, (_, c) => k[a + c]
        ? { fillColor: '#f1f5f9', margin: [4, 6, 4, 6], stack: [{ text: clean(k[a + c][1]), fontSize: 18, bold: true, color: accent }, { text: clean(k[a + c][0]), fontSize: 8.5, color: '#64748b' }] }
        : { text: '' }));
      return { table: { widths: Array(per).fill('*'), body: rows }, margin: [0, 2, 0, 10],
        layout: { hLineWidth: () => 4, vLineWidth: () => 4, hLineColor: () => '#ffffff', vLineColor: () => '#ffffff' } };
    }
    function steps(lines) {
      const k = kv(lines); if (!k.length) return null;
      return { table: { widths: [90, '*'], dontBreakRows: true, body: k.map(([a, b]) => [{ text: clean(a), bold: true, color: accent }, { text: R(b) }]) }, margin: [0, 2, 0, 10],
        layout: { hLineWidth: (r, t) => r === 0 || r === t.table.body.length ? 0 : 0.5, vLineWidth: () => 0, hLineColor: () => '#e2e8f0', paddingTop: () => 5, paddingBottom: () => 5, paddingLeft: () => 0, paddingRight: () => 6 } };
    }

    while (i < L.length) {
      const line = L[i]; let m;
      if ((m = /^\s*(```+|~~~+)\s*([\w+-]*)/.exec(line))) {
        flush(); const fence = m[1][0], len = m[1].length, lang = String(m[2] || '').toLowerCase(), code = []; i++;
        while (i < L.length && !new RegExp('^\\s*' + fence + '{' + len + ',}\\s*$').test(L[i])) code.push(L[i++]);
        i++;
        const n = lang === 'chart' ? chart(code) : /^(?:stats|kpi)$/.test(lang) ? stats(code) : /^(?:steps|timeline)$/.test(lang) ? steps(code) : codeBlock(code);
        if (n) emit(n); continue;
      }
      if ((m = /^\s*<!--\s*(pagebreak|columns|col|endcolumns)\s*-->\s*$/i.exec(line))) {
        flush(); const d = m[1].toLowerCase(); i++;
        if (d === 'pagebreak') pending = true;
        else if (d === 'columns') { cols = [[]]; target = cols[0]; }
        else if (d === 'col' && cols) { cols.push([]); target = cols[cols.length - 1]; }
        else if (d === 'endcolumns' && cols) { const c = cols; cols = null; target = content; emit({ columns: c.map(s => ({ width: '*', stack: s })), columnGap: 16, margin: [0, 0, 0, 8] }); }
        continue;
      }
      if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flush(); emit({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.5, lineColor: '#cbd5e1' }], margin: [0, 6, 0, 10] }); i++; continue; }
      if ((m = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line))) {
        flush(); const n = m[1].length, size = isCv ? [26, 11, 11, 10.5, 10.5, 10.5][n - 1] : [22, 16, 13, 11.5, 10.5, 10.5][n - 1];
        const cvSec = isCv && n === 2;
        emit({ text: R(cvSec ? m[2].toUpperCase() : m[2], { bold: true }), fontSize: size, color: n <= 2 ? accent : '#0f172a', margin: [0, n === 1 ? 0 : cvSec ? 10 : 8, 0, cvSec ? 2 : n === 1 ? 4 : 4], headlineLevel: 1, tocItem: wantToc && n <= 2 });
        if (cvSec) emit({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.8, lineColor: accent }], margin: [0, 0, 0, 5] });
        else if (n === 1 && !isLetter && !isCv) emit({ canvas: [{ type: 'line', x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 1.5, lineColor: accent }], margin: [0, -4, 0, 10] });
        afterH1 = n === 1; i++; continue;
      }
      if (line.includes('|') && i + 1 < L.length && isSep(L[i + 1]) && !isSep(line)) {
        flush(); const rows = [cells(line)]; i += 2;
        while (i < L.length && L[i].includes('|') && L[i].trim()) rows.push(cells(L[i++]));
        emit(table(rows)); continue;
      }
      if (/^\s*>/.test(line)) {
        flush(); const q = [];
        while (i < L.length && /^\s*>/.test(L[i])) q.push(L[i++].replace(/^\s*>\s?/, ''));
        const co = /^\[!(NOTE|TIP|INFO|WARNING|CAUTION|IMPORTANT|SUCCESS|DANGER)\]\s*(.*)$/i.exec((q[0] || '').trim());
        if (co) { const c = CALLOUT[co[1].toLowerCase()]; emit(boxed([{ text: co[1].toUpperCase(), bold: true, fontSize: 8.5, color: c[0], margin: [0, 0, 0, 2] }, { text: R([co[2]].concat(q.slice(1)).join(' ').trim()) }], c[0], c[1])); }
        else emit(boxed([{ text: R(q.join(' ').trim(), { italics: true, color: '#334155' }) }], '#94a3b8', '#f8fafc'));
        continue;
      }
      if ((m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line))) {
        flush(); const items = [];
        while (i < L.length && (m = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(L[i]))) {
          let t = m[3], box = null; const cb = /^\[( |x|X)\]\s+(.*)$/.exec(t); if (cb) { box = cb[1] !== ' '; t = cb[2]; }
          const it = { lvl: Math.min(3, Math.floor(m[1].replace(/\t/g, '    ').length / 2)), ord: /\d/.test(m[2]) ? parseInt(m[2], 10) : null, t, box }; i++;
          while (i < L.length && L[i].trim() && /^\s{2,}\S/.test(L[i]) && !/^\s*([-*+]|\d+[.)])\s+/.test(L[i])) it.t += ' ' + L[i++].trim();
          items.push(it);
        }
        listNodes(items).forEach(emit); continue;
      }
      if (/^\s*!\[[^\]]*\]\([^)]*\)\s*$/.test(line)) { flush(); emit({ text: R('Figure: ' + /!\[([^\]]*)\]/.exec(line)[1]), italics: true, color: '#64748b', margin: [0, 0, 0, 6] }); i++; continue; }
      if (!line.trim()) { flush(); i++; continue; }
      para.push(line.trim()); i++;
    }
    flush();
    if (cols) { const c = cols; cols = null; target = content; emit({ columns: c.map(s => ({ width: '*', stack: s })), columnGap: 16 }); }
    if (!content.length) content.push({ text: ' ' });

    const head = [];
    if (wantCover) {
      head.push({ text: clean(name), fontSize: 30, bold: true, color: accent, margin: [0, 200, 0, 10] },
        { text: new Date().toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' }), color: '#64748b', fontSize: 12 },
        { text: '', pageBreak: 'after' });
    }
    if (wantToc) head.push({ toc: { title: { text: 'Contents', fontSize: 16, bold: true, color: accent, margin: [0, 0, 0, 8] } }, pageBreak: 'after' });
    return {
      pageSize: 'A4', pageMargins: M,
      background: () => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: 595.28, h: 7, color: accent }] }),
      info: { title: clean(name), author: 'Horizon', creator: 'Horizon - pdfmake', subject: 'Created on this device' },
      defaultStyle: { fontSize: isCv ? 10 : 10.5, lineHeight: isCv ? 1.2 : 1.3, color: '#111827' },
      header: pg => (isCv || isLetter || (wantCover && pg === 1)) ? null : { text: clean(name), fontSize: 8, color: '#94a3b8', margin: [M[0], 28, M[2], 0] },
      footer: (pg, n) => (isLetter || (isCv && n < 2)) ? null : ({ columns: [{ text: isCv ? clean(name) : 'Horizon', fontSize: 8, color: '#94a3b8' }, { text: pg + ' / ' + n, fontSize: 8, color: '#94a3b8', alignment: 'right' }], margin: [M[0], 0, M[2], 0] }),
      pageBreakBefore: (cur, following) => cur.headlineLevel === 1 && following.length === 0,
      content: head.concat(content)
    };
  }

  // ---------- engines (lazy, bundled) ----------
  const loads = {};
  function load(src) {
    if (!loads[src]) loads[src] = new Promise((res, rej) => {
      const s = D.createElement('script'); s.src = src;
      const t = setTimeout(() => { delete loads[src]; s.remove(); rej(new Error('Could not load ' + src)); }, 20000);
      s.onload = () => { clearTimeout(t); res(); }; s.onerror = () => { clearTimeout(t); delete loads[src]; s.remove(); rej(new Error('Could not load ' + src)); };
      D.head.appendChild(s);
    });
    return loads[src];
  }
  async function pdfmake() {
    await load('vendor/pdfmake-0.2.20.min.js'); await load('vendor/pdfmake-0.2.20-fonts.js');
    if (!W.pdfMake) throw new Error('PDF engine missing');
    return W.pdfMake;
  }

  // ---------- build (cached) ----------
  const built = new Map(), pagesOf = new Map();
  const keyOf = a => a.title + '\u0000' + a.content.length + '\u0000' + a.content.slice(0, 80) + a.content.slice(-80);
  function build(a) {
    const k = keyOf(a);
    if (!built.has(k)) {
      const p = (async () => {
        const pm = await pdfmake(), def = toDoc(a.content, a.title, a.attrs);
        const blob = await new Promise((res, rej) => {
          const t = setTimeout(() => rej(new Error('PDF build timed out')), 90000);
          try {
            const doc = pm.createPdf(def), r = doc.getBlob(b => { clearTimeout(t); res(b); });
            if (r && typeof r.then === 'function') r.then(b => { clearTimeout(t); res(b); }, e => { clearTimeout(t); rej(e); });
          } catch (e) { clearTimeout(t); rej(e); }
        });
        const txt = new TextDecoder('latin1').decode(await new Response(blob).arrayBuffer());
        pagesOf.set(k, (txt.match(/\/Type\s*\/Page(?![s\w])/g) || []).length);
        return blob;
      })();
      p.catch(() => built.delete(k));
      built.set(k, p);
    }
    return built.get(k);
  }
  const estPages = a => Math.max(1, Math.round(a.content.split(/\s+/).length / 420));
  const metaText = a => 'PDF · A4 · ' + (pagesOf.has(keyOf(a)) ? pagesOf.get(keyOf(a)) + ' page' + (pagesOf.get(keyOf(a)) === 1 ? '' : 's') : '~' + estPages(a) + ' page' + (estPages(a) === 1 ? '' : 's')) + (a.open ? ' · cut off' : '');

  // ---------- download ----------
  let saver = null;
  async function download(a) {
    const blob = await build(a), name = a.title;
    let label = null;
    if (saver) label = await saver(blob, name);
    if (!label) {
      const l = D.createElement('a'); l.href = URL.createObjectURL(blob); l.download = name; D.body.appendChild(l); l.click(); l.remove();
      setTimeout(() => URL.revokeObjectURL(l.href), 60000); label = 'browser downloads/' + name;
    }
    T('Saved: ' + label);
    return label;
  }

  // ---------- chat card ----------
  function card(a) {
    const el = D.createElement('div'); el.className = 'art-card';
    el.innerHTML = '<div class="art-card-ic" aria-hidden="true"><svg class="pdf-ic" viewBox="0 0 24 24" aria-hidden="true"><rect width="24" height="24" rx="5.5" fill="#FA0F00"/><path d="M12.2 4.8c-.95 0-1.25 1.05-1 2.1.35 1.75 1.4 4 2.9 6.15 1.6 2.25 3.5 3.95 4.95 4.15 1.1.15 1.3-.9.4-1.45-1.5-.95-4.55-.85-8.2.15-3.1.85-5.3 2.2-5.6 3.3-.2.7.6 1.05 1.4.45 1.6-1.2 3.2-4.55 4.1-7.7.5-1.8.5-3.6-.1-3.9" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg></div><div class="art-card-tx"><b>' + esc(a.title.replace(/\.pdf$/i, '')) + '</b><small>' + esc(metaText(a)) + '</small></div>'
      + '<div class="art-card-act"><button type="button" data-a="view">View</button><button type="button" data-a="dl" class="pri">Download</button></div>';
    const small = el.querySelector('small'), bView = el.querySelector('[data-a="view"]'), bDl = el.querySelector('[data-a="dl"]');
    const run = async (btn, fn, busy) => {
      const was = btn.textContent; btn.disabled = true; btn.textContent = busy;
      try { await fn(); small.textContent = metaText(a); } catch (e) { T('PDF failed: ' + (e && e.message || e)); } finally { btn.disabled = false; btn.textContent = was; }
    };
    bView.addEventListener('click', () => run(bView, () => view(a), 'Opening...'));
    bDl.addEventListener('click', () => run(bDl, () => download(a), 'Saving...'));
    return el;
  }

  // ---------- viewer ----------
  let ov = null, pdfjsP = null;
  const pdfjs = () => pdfjsP || (pdfjsP = import('./vendor/pdfjs/pdf.mjs').then(lib => { lib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.mjs', location.href).href; return lib; }).catch(e => { pdfjsP = null; throw e; }));

  async function view(a) {
    const blob = await build(a);
    closeView(true);
    const lib = await pdfjs();
    const doc = await lib.getDocument({ data: new Uint8Array(await new Response(blob).arrayBuffer()) }).promise;
    ov = D.createElement('div'); ov.id = 'hzPdfView'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-label', a.title);
    ov.innerHTML = '<div class="pv-bar"><button type="button" class="pv-x" aria-label="Close">✕</button><span class="pv-t">' + esc(a.title) + '<small> · ' + doc.numPages + ' page' + (doc.numPages === 1 ? '' : 's') + '</small></span>'
      + '<button type="button" class="pv-z" data-z="-1" aria-label="Zoom out">−</button><button type="button" class="pv-z" data-z="1" aria-label="Zoom in">+</button><button type="button" class="pv-dl">Download</button></div><div class="pv-body"></div>';
    D.body.appendChild(ov);
    try { history.pushState({ hzv: 1 }, ''); } catch (_) { /* no history */ }
    const body = ov.querySelector('.pv-body'), steps = [1, 1.5, 2, 3]; let zi = 0, gen = 0;
    const pages = [];
    const first = await doc.getPage(1), base = first.getViewport({ scale: 1 });
    const fit = () => Math.min(body.clientWidth - 16, 900) * steps[zi];
    for (let n = 1; n <= doc.numPages; n++) { const c = D.createElement('canvas'); c.className = 'pv-page'; c.dataset.n = n; body.appendChild(c); pages.push(c); }
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) draw(e.target); }), { root: body, rootMargin: '600px 0px' });
    const size = () => { const w = fit(), h = w * base.height / base.width; pages.forEach(c => { c.style.width = w + 'px'; c.style.height = h + 'px'; c.dataset.done = ''; }); };
    let chain = Promise.resolve();
    function draw(c) {
      if (c.dataset.done === '1' || c.dataset.busy === '1') return;
      c.dataset.busy = '1'; const g = gen;
      chain = chain.then(async () => {
        if (g !== gen || !ov) { c.dataset.busy = ''; return; }
        try {
          const pg = await doc.getPage(+c.dataset.n), w = fit(), out = Math.min(W.devicePixelRatio || 1, 2) * (zi > 1 ? 1 : 1.25);
          const vp = pg.getViewport({ scale: w / pg.getViewport({ scale: 1 }).width * out });
          c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
          await pg.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
          if (g === gen) c.dataset.done = '1';
        } catch (_) { /* page left blank; next zoom/scroll retries */ }
        c.dataset.busy = '';
      });
    }
    size(); pages.forEach(c => io.observe(c));
    ov.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('button'); if (!t) return;
      if (t.classList.contains('pv-x')) closeView();
      else if (t.classList.contains('pv-dl')) { t.disabled = true; download(a).catch(err => T('PDF failed: ' + (err && err.message || err))).finally(() => { t.disabled = false; }); }
      else if (t.dataset.z) { const n = Math.max(0, Math.min(steps.length - 1, zi + +t.dataset.z)); if (n !== zi) { zi = n; gen++; size(); pages.forEach(c => { io.unobserve(c); io.observe(c); }); } }
    });
    ov._cleanup = () => { gen++; io.disconnect(); try { doc.destroy(); } catch (_) { /* gone */ } };
  }
  function closeView(quiet) {
    if (!ov) return;
    try { ov._cleanup(); } catch (_) { /* nothing to clean */ }
    ov.remove(); ov = null;
    if (!quiet && history.state && history.state.hzv) { try { history.back(); } catch (_) { /* ignore */ } }
  }
  W.addEventListener('popstate', () => closeView(true));
  D.addEventListener('keydown', e => { if (e.key === 'Escape' && ov) closeView(); });

  // V1.80.0: real page count of an artifact (renders it once, reads the page count, drops the cached blob). 0 if it could not be built.
  async function pageCount(a) {
    const k = keyOf(a);
    try { await build(a); } catch (e) { return 0; }
    const n = pagesOf.get(k) || 0;
    built.delete(k);
    return n;
  }
  W.HorizonPDF = { parse, toDoc, build, card, view, download, close: closeView, pageCount, setSaver: f => { saver = f; } };
  W.EmberArtifacts = { parse, view, download, card, build, render: card }; // names ember_artbox.js expects
})();
