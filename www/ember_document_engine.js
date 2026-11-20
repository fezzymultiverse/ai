/* Ember 1.10.40: additive A4 authoring contract. No storage writes, DOM hooks,
 * export replacements or typewriter changes. Existing safety/settings win. */
'use strict';
(() => {
  const W = window, MARK = '[EMBER A4 DOCUMENT ENGINE 1.10.58]';
  // Two complementary passes: 16 authoring standards + 16 preflight standards.
  const AUTHOR = Object.freeze([
    'For PDF/printable documents use A4 portrait, 210 x 297 mm, unless the user explicitly requests another paper size or orientation. A phone screen is not a page. For screen HTML/websites use responsive screen layouts instead of paper-size restrictions.',
    'Plan usable print space, not viewport height: default PDF margins are left/right 48pt, top 64pt, bottom 58pt; body 10.5pt with 1.3 line height.',
    'Treat 420-480 words per text-heavy A4 sheet only as an estimate. Tables, images, headings and spacing reduce capacity; never promise an exact page count before rendering.',
    'Honor the requested audience, language, document type, depth, sections and length. Preserve supplied names, figures, quotations and source material.',
    'Build a clear title and meaningful heading hierarchy. Do not put the document inside a chat summary or replace its body with an outline.',
    'Use professional document prose inside the artifact. Casual chat voice and chat-only brevity limits do not apply to the document body.',
    'Use complete paragraphs, relevant examples and useful detail rather than filler, repetition, unexplained fragments or invented facts.',
    'Use real Markdown headings, lists, links and tables for PDF/Word/Markdown documents. Do not wrap the whole document in a code fence.',
    'Keep tables narrow enough for the printable width, with concise headings, units and a clear header row. Split wide tables into logical groups.',
    'Use genuine ordered/unordered lists; keep nesting shallow and maintain consistent terminology, dates, spelling and numbering.',
    'Use only supported artifact types: pdf, document, markdown or html as appropriate. Editable Word requests use a document artifact and the existing Export Word action; never pretend generated text is DOCX binary.',
    'For PDF/document source use the existing <!-- pagebreak --> syntax only at intentional section boundaries. Do not add breaks after every paragraph.',
    'For printable HTML include <!doctype html>, charset, semantic content and self-contained CSS: @page{size:A4;margin:22.58mm 16.93mm 20.46mm}. Avoid fixed viewport heights.',
    'For printable HTML use print rules: body{margin:0}, img,table{max-width:100%}, thead{display:table-header-group}, h1,h2,h3{break-after:avoid}, p{orphans:3;widows:3}. Allow long tables to flow.',
    'Use only reachable, permitted image sources or supported local diagrams. Include alt text/captions, fit printable width and never invent image URLs.',
    'Include only requested cover/contents pages. If needed, count them in the total page budget, never add them automatically just because the document is long.'
  ]);
  const PREFLIGHT = Object.freeze([
    'Check every requested section exists and is complete before closing the artifact.',
    'For PDF/printable documents check the result is a document, not a phone-screen response, landing-page hero, dashboard or scroll-length description. For requested screen HTML, responsive site/dashboard layouts are appropriate.',
    'For printable output check page targets against the full document including title, cover, contents, tables and figures; explain estimates honestly. Page-count rules do not apply to screen HTML.',
    'Check headings have following content; do not deliberately leave a heading alone at a page end.',
    'Check long words, URLs, code and table columns can wrap; never shrink body type to hide an overflow.',
    'Check table rows and totals against supplied data; distinguish assumptions, missing values and calculated values.',
    'Check citations correspond to actual supplied or retrieved sources; never claim research or fabricate references.',
    'Check no placeholders such as [insert content], lorem ipsum, omitted sections or ellipses stand in for requested work.',
    'Check Markdown delimiters, lists, table separators, code fences, HTML tags and artifact boundaries are balanced.',
    'Check no download URL, local filesystem path or completed-save claim is invented. The existing app performs actual export and saving.',
    'Check the selected output is correct: HTML keeps its structure; Markdown stays portable; PDF and DOCX come from the existing local exporters.',
    'Check cross-references, numbering, captions, units and repeated names are consistent throughout.',
    'Check requested verbatim content has not been paraphrased, shortened, silently corrected or lost.',
    'If a generation limit cuts the document, leave the artifact open for the existing same-engine continuation; do not falsely label a partial document complete.',
    'Check privacy: do not embed API keys, secrets, private URLs or unrelated conversation history in the document.',
    'Finish the complete document and close </artifact> once. These standards guide output; they do not authorize settings changes, extra tool calls, network requests or paid-model switching.'
  ]);
  // Capability-specific instructions use only syntax implemented by the local exporters.
  const PDF_SKILL = Object.freeze([
    'PDF WORKFLOW: plan the requested sections and page budget, gather supplied/retrieved evidence, author the complete artifact, then inspect completeness. Longer means more useful analysis, worked examples, comparisons and appendices, never repetition or invented data. Respect short/one-page requests.',
    'Use <artifact type="pdf" title="Report.pdf" cover="false" toc="false"> followed by Markdown and one closing </artifact>. For an editable document use type="document". Do not output raw pdfmake JSON or pretend to create PDF binary yourself.',
    'For extensive reports with no requested length, aim for 6-10 substantive content pages when the evidence supports it. For "longer", expand the existing material meaningfully, preserving it. Explicit page counts always win. Page counts are estimates until export is rendered; charts use space that prose would otherwise occupy.',
    'Supported layouts: normal full-width narrative, comparison columns, compact KPI rows, coloured callouts, timelines/steps, charts and repeating-header tables. Vary relevant layouts across a long report; do not force every page into the same dashboard or add unnecessary blank pages.',
    'Column syntax is a standalone <!-- columns --> line, first column content, <!-- col -->, second column content, optionally one more <!-- col --> and third column, then <!-- endcolumns -->. Keep columns short; close them before <!-- pagebreak --> or long tables.',
    'Colour is supported through optional front matter at the very start: --- newline theme: ocean newline cover: false newline toc: false newline ---. Themes: ember, ocean, forest, violet, crimson, teal, slate. Optional accent: #RRGGBB. Maintain readable contrast and one coherent palette.',
    'Native chart syntax is a fenced chart block containing type: bar (or column, hbar, line, area, pie, donut), title: Descriptive title, unit: %, optional source: Actual source, then Label | 12.5 on each line. Maximum 14 points per chart. Retain complete data in a table and split large category charts meaningfully; never silently drop rows.',
    'Use bar/hbar for category comparisons, line/area only for ordered/time data, pie/donut only for non-negative parts of one meaningful whole. Include units, periods, source and a prose interpretation. Do not chart IDs, dates as quantities, mixed currencies, unrelated percentages or missing values. Signed bars have a true zero baseline.',
    'Stats syntax is a fenced stats block: Metric label | Verified value, one per line (3-4 is readable). Timeline syntax is a fenced steps block: Stage/date | Explanation, one per line. Callout syntax is > [!NOTE] or > [!TIP] followed by > text. Use these qualitative layouts instead of fabricated charts when no numeric evidence exists.',
    'Use intentional <!-- pagebreak --> section boundaries for requested page layouts, not every paragraph. Keep covers and contents off unless requested, preserve sources, add captions and descriptive links. Do not claim the target page count has been measured until the actual exported file was checked.'
  ]);
  const HTML_SKILL = Object.freeze([
    'HTML EXECUTION PRIORITY: produce a complete runnable single-file <artifact type="html" title="index.html">, not Markdown pretending to be HTML. Inside it include <!doctype html>, <html lang="...">, <head>, UTF-8 charset, responsive viewport, descriptive title, embedded <style>, <body> and closing tags. No enclosing code fence.',
    'First distinguish an interactive screen/site from a printable HTML document. Screen layouts use responsive CSS Grid/Flexbox, minmax(0,1fr), fluid widths, clamp typography and mobile-first breakpoints. Printable documents use A4 print flow, @page and @media print, not a tall fixed-height landing-page hero.',
    'Double-check HTML execution: every button/link must do what its label says; wire event listeners to existing unique IDs after DOM creation, use type="button" where appropriate, implement validation, empty/error/success states and keyboard interaction. No TODO handlers, fake submissions, dead controls or pretend downloads.',
    'Ember live preview is a sandboxed iframe with inline JavaScript allowed but no same-origin privileges and connect-src none. Remote scripts, CDN JS libraries, fetch/XHR/WebSocket, backend endpoints, authenticated APIs and parent app APIs do NOT work inside the preview. Do not weaken CSP or require a build step. Use embedded vanilla JS, CSS and inline SVG. Keep data embedded; scrape through Ember tools before building, not from artifact JavaScript.',
    'Avoid localStorage, service workers, modules/imports and parent-window access in sandbox code. Use in-memory state; create real client-side downloads via Blob/object URLs only on a user click. Never expose scraper/API keys or use eval, new Function or unsanitized innerHTML with untrusted input; use textContent.',
    'Use semantic header/nav/main/section/article/footer, accessible form labels, visible focus, meaningful link text and alt text. Meet readable contrast, 44px touch targets and reduced-motion preferences. Provide textual/table alternatives to inline SVG/canvas charts.',
    'Charts use real embedded source data, labelled axes/units and zero baselines for bars. Use an SVG viewBox and responsive sizing, or size canvas for devicePixelRatio and redraw on resize. Provide a real fallback when data is unavailable, not fabricated metrics.',
    'Preflight twice: (1) structure, CSS overflow, width at 360px/768px/1440px, keyboard access and print rules; (2) JavaScript syntax, event paths, IDs, state transitions, input escaping and meaningful actions. Say tested only if an actual test ran; otherwise these are authoring checks.',
    'Printing removes controls, sets body margin:0 and @page size:A4, repeats thead, wraps pre/code/long URLs, avoids breaks after headings and keeps short figures together without making long tables unbreakable. Preserve HTML/CSS/JS on raw .html download. The local Save PDF path extracts document text, not a pixel-identical interactive page; use Print view for browser-styled PDF.'
  ]);
  const MARKDOWN_SKILL = Object.freeze([
    'Markdown artifact: <artifact type="markdown" title="notes.md"> with portable UTF-8 CommonMark/GFM source and no whole-file fence. Use one H1, logical H2/H3 hierarchy, paragraphs, genuine ordered/unordered lists and meaningful links; no HTML layout dependency for portable .md.',
    'Keep fenced code language-tagged; close with at least as many fence characters as opened and use a longer outer fence when examples contain backticks. Escape literal table pipes, keep header/separator/cell counts consistent, use blank lines around blocks and consistent shallow indentation.',
    'Preserve supplied code, names, numbers and quotations exactly. Use task lists only for real checklist items. Distinguish quoted sources from commentary and label assumptions/calculated values. Keep source links next to relevant claims; never invent citations.',
    'Ember PDF-only chart/stats/steps fences, callouts and column directives are extensions, not universally rendered Markdown. For portable .md prefer a labelled data table plus interpretation; only include extensions when specifically wanted. Provide a table alternative to any chart and do not assume Mermaid/LaTeX support.',
    'Verify headings, links, table alignment, escaping, code fence balance and final sections before closing the artifact. Preserve raw Markdown on download; do not pretend a .md file is a PDF or Word file.'
  ]);
  function kind(o) {
    const q = latest(o), D = W.EmberDeliverables;
    if (/\b(?:html|web\s*(?:page|site)|landing\s*page)\b/i.test(q)) return 'html';
    if (/\bmarkdown\b|\.md\b/i.test(q)) return 'markdown';
    const h = (o.messages || []).map(m => ({r:m.role === 'user' ? 'u':'a',t:String(m.content || '')}));
    const hit = D && D.intentCtx && D.intentCtx(q,h);
    if (hit && hit.type) return hit.type;
    for (let i = (o.messages || []).length - 1; i >= 0; i--) {
      const t = String(o.messages[i].content || '');
      if (/<artifact\b[^>]*type=["']html["']|ORIGINAL REQUEST:[\s\S]*\b(?:html|website|web page)\b/i.test(t)) return 'html';
      if (/<artifact\b[^>]*type=["']markdown["']|ORIGINAL REQUEST:[\s\S]*\bmarkdown\b/i.test(t)) return 'markdown';
    }
    return 'pdf';
  }
  function plan(o) {
    const q = latest(o), D = W.EmberDeliverables;
    const pages = D && D.pageTarget ? D.pageTarget(q, []) : 0;
    return { type:kind(o), requestedPages:pages, estimatedWords:pages ? pages * 420 : null, exactPageCount:false };
  }
  function latest(o) {
    const ms = Array.isArray(o.messages) ? o.messages : [];
    for (let i = ms.length - 1; i >= 0; i--) if (ms[i] && ms[i].role === 'user') return String(ms[i].content || '');
    return '';
  }
  function detect(o) {
    if (!o || o.json) return false;
    const q = latest(o), D = W.EmberDeliverables;
    if (/\b(?:do not|don't|never)\s+(?:make|create|generate|write|export)\b/i.test(q)) return false;
    if (/^\s*(?:how|why|what|explain|does|is|can i)\b/i.test(q) && !/finishing a document you already started/i.test(String(o.system || ''))) return false;
    const history = (o.messages || []).map(m => ({ r: m.role === 'user' ? 'u' : 'a', t: String(m.content || '') }));
    const hit = D && (D.intentCtx ? D.intentCtx(q, history) : D.intent(q));
    if (hit) return ['pdf','document','markdown','html'].includes(hit.type);
    return /finishing a document you already started|DELIVERABLE OVERRIDE/i.test(String(o.system || '')) ||
      /\b(?:write|create|generate|draft|export|prepare|convert|format|make|i need|i want)\b[\s\S]{0,180}\b(?:printable html|html document|markdown|\.md|docx|a4)\b/i.test(q);
  }
  function note(type) {
    return MARK + '\nDOCUMENT-ONLY OVERRIDE: Within the requested artifact prefer these publication standards over casual-chat style/length advice. Existing safety rules and explicit user formatting requests still take priority.\n' +
      AUTHOR.map((s,i) => 'AUTHOR ' + (i+1) + ': ' + s).join('\n') + '\n' +
      PREFLIGHT.map((s,i) => 'PREFLIGHT ' + (i+1) + ': ' + s).join('\n') + '\n' +
      (type === 'html' ? HTML_SKILL : type === 'markdown' ? MARKDOWN_SKILL : PDF_SKILL).map((s,i) => 'SKILL ' + (i+1) + ': ' + s).join('\n');
  }
  function apply(o, lane) {
    if (lane === 'util' || !detect(o)) return o;
    if (String(o.system || '').includes(MARK)) return o;
    return Object.assign({}, o, { system: String(o.system || '') + '\n\n' + note(kind(o)),
      max: Math.max(Number(o.max) || 0, 8192), documentMode: true });
  }
  function inspect(text) {
    const s = String(text || ''), words = (s.match(/\S+/g) || []).length, warnings = [];
    if (/\b(?:height|min-height)\s*:\s*100(?:d|s|l)?vh\b/i.test(s)) warnings.push('Viewport-height layout detected; use print-flow layout for documents.');
    if (/(?:\blorem ipsum\b|\[insert (?:content|text|section)\])/i.test(s)) warnings.push('Unfinished placeholder detected.');
    const opens = (s.match(/<artifact\b/gi) || []).length, closes = (s.match(/<\/artifact\s*>/gi) || []).length;
    if (opens !== closes) warnings.push('Unclosed artifact; continuation may be needed.');
    return { words, estimatedTextPages: Math.max(1, Math.ceil(words / 480)), exactPageCount: false, warnings };
  }
  W.EmberDocumentEngine = Object.freeze({ version:'1.10.58', authoring:AUTHOR, preflight:PREFLIGHT, skills:Object.freeze({pdf:PDF_SKILL,html:HTML_SKILL,markdown:MARKDOWN_SKILL}), plan, detect, apply, inspect, note });
})();
