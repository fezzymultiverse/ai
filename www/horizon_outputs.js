'use strict';
(() => {
  const W = window, D = document;
  const NS = 'http://schemas.openxmlformats.org/';
  const MIME = { docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv' };
  const xml = value => String(value ?? '').replace(/[^\u0009\u000a\u000d\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
  const el = (tag, text, cls) => { const e = D.createElement(tag); if (text != null) e.textContent = text; if (cls) e.className = cls; return e; };
  const kind = text => {
    const s = String(text || '').trim();
    if (!/^(?:please\s+)?(?:create|make|generate|draft|write|build|produce|prepare|export|convert|give me|i (?:want|need))\b/i.test(s)) return '';
    const m = /\b(docx|word (?:document|file)|csv|xlsx|excel|spreadsheet)\b/i.exec(s);
    return !m ? '' : /^word|docx/i.test(m[0]) ? 'docx' : /^csv$/i.test(m[0]) ? 'csv' : 'xlsx';
  };
  function prompt(type) {
    return `The latest user specifically requested ${type.toUpperCase()} output. Create exactly one complete <artifact type="${type}" title="name.${type}">...</artifact>. ` + (type === 'docx' ? 'Inside use plain text paragraphs and Markdown headings (# to ####); use no code fence.' : 'Inside provide ONLY a JSON array of row arrays, including the header row. Use JSON numbers, booleans, strings or null; no formulas or code fences.') + ' Horizon creates the real file locally with Preview, Download and Save as. Do not claim it was already written to disk. Do not wrap the artifact in a code fence.';
  }
  function wrap(a) {
    // Keep the output in the artifact channel, separate from Horizon's executable chat tags.
    return `<artifact type="${a.type}" title="${a.title}">\n${a.content}${a.open ? '' : '\n</artifact>'}`;
  }
  function parseCSV(text) {
    const data = []; let row = [], cell = '', quoted = false, closed = false;
    const push = () => { row.push(cell); cell = ''; closed = false; };
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else { quoted = false; closed = true; } }
        else cell += c;
      } else if (c === '"') {
        if (cell || closed) throw new Error('Invalid CSV quoting. Regenerate the table.');
        quoted = true;
      } else if (c === ',') push();
      else if (c === '\r' || c === '\n') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        push(); data.push(row); row = [];
      } else {
        if (closed) throw new Error('Invalid CSV quoting. Regenerate the table.');
        cell += c;
      }
    }
    if (quoted) throw new Error('The CSV has an unclosed quoted field. Regenerate the table.');
    if (cell || row.length || closed) { push(); data.push(row); }
    return data;
  }
  function rows(a) {
    let data;
    let text = a.content.trim().replace(/^\uFEFF/, '');
    const fence = /^```(?:json|csv)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(text);
    if (fence) text = fence[1];
    text = text.replace(/^\uFEFF/, '');
    try { data = JSON.parse(text); }
    catch (_) {
      if (a.type !== 'csv' || /^[\[{]/.test(text)) throw new Error('The assistant did not return a valid table. Ask it to regenerate.');
      data = parseCSV(text);
    }
    if (!Array.isArray(data) || !data.length || data.length > 10000 || data.some(row => !Array.isArray(row) || !row.length || row.length > 100 || row.some(v => v !== null && !['string','number','boolean'].includes(typeof v) || typeof v === 'number' && !Number.isFinite(v) || typeof v === 'string' && v.length > 32767))) throw new Error('Invalid table or spreadsheet size.');
    return data;
  }
  function contents(a) {
    if (a.open) throw new Error('The reply was cut off. Regenerate it before exporting.');
    if (!a.content.trim() || a.content.length > 1000000) throw new Error('The document is empty or too large.');
    return a.type === 'docx' ? a.content.split(/\r?\n/).map(line => {
      const heading = /^(#{1,4})\s+(.*)$/.exec(line);
      return { level: heading ? heading[1].length : 0, text: heading ? heading[2] : line };
    }) : rows(a);
  }
  function csvValue(v) {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^(?:[\t\r\n]|[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20])/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  const relationship = (id, type, path) => `<Relationship Id="${id}" Type="${NS}officeDocument/2006/relationships/${type}" Target="${path}"/>`;
  const relationships = content => `<Relationships xmlns="${NS}package/2006/relationships">${content}</Relationships>`;
  const mainType = path => `<Override PartName="/${path}" ContentType="application/vnd.openxmlformats-officedocument.${path.startsWith('word/') ? 'wordprocessingml.document' : 'spreadsheetml.sheet'}.main+xml"/>`;
  function column(i) { let s = ''; for (i++; i; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + (i - 1) % 26) + s; return s; }
  function build(a) {
    const data = contents(a);
    if (a.type === 'csv') return new Blob(['\ufeff', data.map(row => row.map(csvValue).join(',')).join('\r\n'), '\r\n'], {type:MIME.csv});
    const word = a.type === 'docx', main = word ? 'word/document.xml' : 'xl/workbook.xml';
    const entries = {
      '[Content_Types].xml': `<Types xmlns="${NS}package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${mainType(main)}${word ? '' : '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'}</Types>`,
      '_rels/.rels': relationships(relationship('rId1', 'officeDocument', main))
    };
    if (word) {
      entries[main] = `<w:document xmlns:w="${NS}wordprocessingml/2006/main"><w:body>` + data.map(p => `<w:p><w:r>${p.level ? `<w:rPr><w:b/><w:sz w:val="${40 - 4 * p.level}"/></w:rPr>` : ''}<w:t xml:space="preserve">${xml(p.text)}</w:t></w:r></w:p>`).join('') + '</w:body></w:document>';
    } else {
      entries[main] = `<workbook xmlns="${NS}spreadsheetml/2006/main" xmlns:r="${NS}officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`;
      entries['xl/_rels/workbook.xml.rels'] = relationships(relationship('rId1', 'worksheet', 'worksheets/sheet1.xml'));
      entries['xl/worksheets/sheet1.xml'] = `<worksheet xmlns="${NS}spreadsheetml/2006/main"><sheetData>` + data.map((row, i) => `<row r="${i+1}">` + row.map((v, j) => {
        const ref = column(j) + (i + 1);
        if (v === null) return '';
        if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
        if (typeof v === 'boolean') return `<c r="${ref}" t="b"><v>${Number(v)}</v></c>`;
        // Text is never promoted to a formula. Escape OOXML escape sequences before escaping XML.
        return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xml(v.replace(/_x[0-9a-f]{4}_/gi, '_x005F_$&').replace(/\r/g, '_x000D_'))}</t></is></c>`;
      }).join('') + '</row>').join('') + '</sheetData></worksheet>';
    }
    for (const key of Object.keys(entries)) entries[key] = W.fflate.strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' + entries[key]);
    return new Blob([W.fflate.zipSync(entries, {level: 3})], {type: MIME[a.type]});
  }
  let host;
  async function saveBlob(blob, name) {
    const native = host && host.plug('HorizonOutput');
    if (native) {
      const data = await new Promise((r, j) => { const reader = new FileReader(); reader.onload = () => r(String(reader.result).split(',')[1]); reader.onerror = () => j(reader.error); reader.readAsDataURL(blob); });
      const out = await native.download({ name, data, mime: blob.type || 'application/octet-stream' });
      if (!out || !out.saved) throw new Error('Android did not confirm the download.');
      return (out.location || 'Download') + '/' + (out.name || name);
    }
    if (W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()) throw new Error('Native Downloads saver is unavailable. Rebuild the Android app with HorizonOutput.');
    const link = el('a'), url = URL.createObjectURL(blob);
    link.href = url; link.download = name; D.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
    return 'browser downloads/' + name;
  }
  async function save(a, choose) {
    const blob = build(a);
    if (host && host.plug('HorizonOutput') || W.Capacitor && W.Capacitor.isNativePlatform && W.Capacitor.isNativePlatform()) {
      const location = await saveBlob(blob, a.title);
      if (host) host.notice('Saved to ' + location);
      return;
    }
    if (choose && typeof W.showSaveFilePicker === 'function') {
      try { const f = await W.showSaveFilePicker({ suggestedName: a.title }); const wr = await f.createWritable(); await wr.write(blob); await wr.close(); if (host) host.notice('Document saved.'); }
      catch (e) { if (e.name !== 'AbortError') throw e; }
      return;
    }
    const link = el('a'), url = URL.createObjectURL(blob);
    link.href = url; link.download = a.title; D.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 15000);
  }
  function btn(label, handler) {
    const b = el('button', label); b.type = 'button';
    b.onclick = async () => { b.disabled = true; try { await handler(); } catch (e) { if (host) host.notice(e.message, 'error'); } finally { b.disabled = false; } };
    return b;
  }
  function actions(a) {
    const out = el('div', null, 'art-card-act');
    out.append(btn('Download', () => save(a, false)), btn('Save as', () => save(a, true)));
    return out;
  }
  function view(a) {
    const data = contents(a), modal = el('dialog'); modal.setAttribute('aria-label', a.title);
    modal.style.cssText = 'color:inherit;background:#10202a;border:1px solid #456;border-radius:14px;width:min(91vw,850px);max-height:85vh;padding:16px;overflow:auto';
    modal.append(el('h3', a.title), btn('Close', () => modal.close()), actions(a));
    if (a.type === 'docx') data.forEach(p => { const n = el(p.level ? 'h' + p.level : 'p', p.text || '\u00a0'); n.style.whiteSpace = 'pre-wrap'; modal.append(n); });
    else {
      const table = el('table'); table.style.borderCollapse = 'collapse';
      data.slice(0, 150).forEach((row, i) => {
        const tr = el('tr'); row.forEach(v => { const cell = el(i ? 'td' : 'th', v == null ? '' : String(v)); cell.style.cssText = 'padding:6px 10px;border:1px solid #456;white-space:pre-wrap'; tr.append(cell); }); table.append(tr);
      });
      if (data.length > 150) modal.append(el('p', 'Showing the first 150 of ' + data.length + ' rows. The export contains all rows.'));
      modal.append(table);
    }
    modal.addEventListener('close', () => modal.remove(), {once:true}); D.body.append(modal); modal.showModal();
  }
  function card(a) {
    const out = el('div', null, 'art-card'), title = el('div', null, 'art-card-tx'), act = actions(a);
    title.append(el('b', a.title), el('small', a.type.toUpperCase() + (a.open ? ' · incomplete' : '')));
    act.prepend(btn('Preview', () => view(a))); out.append(title, act); return out;
  }
  W.HorizonOutputs = { init: h => { host = h; }, kind, prompt, wrap, build, card, view, saveBlob };
})();
