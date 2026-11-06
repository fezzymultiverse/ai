// Ember V1.10.30 - ember_artbox.js
// The "Artifacts (N)" box in the left panel (Chats tab) and the list sheet behind it.
// It reads every saved chat, finds the <artifact> blocks with EmberArtifacts.parse, lists them newest first
// (icon, title, type, chat name, time) with a search box and a type filter, and opens the EXISTING
// full-screen viewer (EmberArtifacts.view), which keeps its PDF button. When Ember makes a new artifact the
// box gets a small "new" dot until the list is opened. No network, nothing is copied: the list is rebuilt
// from the chats on this phone each time.
'use strict';
(() => {
  const W = window, D = document, $ = id => D.getElementById(id);
  const LS = (W.U && W.U.LS) || {
    get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  };
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = m => { try { (W.toast || console.log)(m); } catch (_) { /* no toast */ } };
  const SEEN_KEY = 'ember_art_seen';

  // ---- type groups used by the filter chips ----
  const GROUPS = [['all', 'All'], ['pdf', 'PDF'], ['doc', 'Doc'], ['html', 'HTML'], ['code', 'Code'], ['image', 'Image']];
  const groupOf = t => t === 'pdf' ? 'pdf'
    : t === 'document' || t === 'markdown' ? 'doc'
    : t === 'html' ? 'html'
    : t === 'code' || t === 'json' || t === 'csv' ? 'code'
    : t === 'svg' || t === 'image' ? 'image' : 'other';
  const KIND = { pdf: 'PDF', document: 'Doc', markdown: 'Markdown', html: 'HTML', code: 'Code', json: 'JSON', csv: 'CSV', svg: 'SVG', image: 'Image' };
  const ICON = { pdf: '📕', document: '📄', markdown: '📄', html: '🌐', code: '💻', json: '📊', csv: '📊', svg: '🖼️', image: '🖼️' };
  const kindOf = a => (KIND[a.type] || String(a.type || 'file').toUpperCase()) + (a.type === 'code' && a.language && a.language !== 'code' ? ' · ' + a.language : '');

  let items = [];        // newest first: { key, chatId, chat, priv, mi, ai, ts, type, title, g, kind, hay }
  let newKeys = [];      // artifacts the person has not looked at yet
  let fresh = new Set(); // keys that were new when the list was opened (marked in the list)
  let filter = 'all';
  let tries = 0, timer = 0, busy = false, again = false, lastCardCount = -1;

  // ---- read every chat and pull out its artifacts ----
  async function collect() {
    const A = W.EmberArtifacts;
    if (!A || !A.parse || !W.Store) return [];
    let chats = [];
    try { chats = await W.Store.all(); } catch (_) { return []; }
    const out = [];
    for (const c of chats) {
      if (!c || !Array.isArray(c.msgs) || !c.msgs.length) continue;
      c.msgs.forEach((m, mi) => {
        if (!m || m.r !== 'a' || typeof m.t !== 'string' || !/<artifact\b/i.test(m.t)) return;
        let p; try { p = A.parse(m.t); } catch (_) { return; }
        const ts = Number(m.ts || c.updated || 0) || 0, chat = c.title || 'Chat';
        p.items.forEach((a, ai) => {
          const pic = a.type === 'svg' || a.type === 'image';
          out.push({
            key: c.id + '|' + mi + '|' + ai + '|' + ts, chatId: c.id, chat, priv: !!c.priv, mi, ai, ts,
            type: a.type, title: a.title, g: groupOf(a.type), kind: kindOf(a),
            hay: (a.title + ' ' + kindOf(a) + ' ' + chat + ' ' + (pic ? '' : String(a.content || '').slice(0, 600))).toLowerCase()
          });
        });
      });
    }
    out.sort((x, y) => y.ts - x.ts);
    return out;
  }

  // ---- "new" tracking: remember which artifacts were already seen ----
  function applySeen() {
    const keys = items.map(x => x.key), seen = LS.get(SEEN_KEY, null);
    if (!Array.isArray(seen)) { LS.set(SEEN_KEY, keys); newKeys = []; return; } // first run: what is already here is not "new"
    const have = new Set(seen), live = new Set(keys);
    newKeys = keys.filter(k => !have.has(k));
    const kept = seen.filter(k => live.has(k));
    if (kept.length !== seen.length) LS.set(SEEN_KEY, kept); // forget artifacts whose chat or message is gone
  }
  function markSeen() { LS.set(SEEN_KEY, items.map(x => x.key)); newKeys = []; paint(); }

  // ---- the box in the left panel ----
  function paint() {
    const t = $('artTitle'); if (t) t.textContent = 'Artifacts (' + items.length + ')';
    const d = $('artDot'); if (d) d.classList.toggle('hidden', !newKeys.length);
    const b = $('bArtOpen'); if (b) b.setAttribute('aria-label', 'Open artifacts, ' + items.length + (newKeys.length ? ', new' : ''));
  }

  async function refresh() {
    // Wait until the chats are loaded; reading too early would make everything look "new" later.
    if (!(W.__ember && W.__ember.ready)) { if (tries++ < 60) { clearTimeout(timer); timer = setTimeout(refresh, 400); } return; }
    if (busy) { again = true; return; }
    busy = true;
    try {
      items = await collect();
      applySeen();
      if (sheet.classList.contains('show')) { newKeys.forEach(k => fresh.add(k)); markSeen(); render(); }
      else paint();
    } catch (_) { /* leave the old list */ }
    busy = false;
    if (again) { again = false; schedule(300); }
  }
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(refresh, ms); }

  // ---- the list sheet ----
  const sheet = D.createElement('section');
  sheet.id = 'emberArtSheet'; sheet.className = 'sheet'; sheet.setAttribute('aria-label', 'Artifacts');
  sheet.innerHTML = '<div class="sh"><b>Artifacts</b><button class="hb" id="artX" type="button" aria-label="Close">✕</button></div>'
    + '<div class="sb art-sb"><input type="text" id="artQ" placeholder="Search artifacts…" autocomplete="off" spellcheck="false" aria-label="Search artifacts">'
    + '<div class="art-chips" id="artChips" role="group" aria-label="Filter by type"></div>'
    + '<div id="artList" class="art-list"></div></div>';
  D.body.appendChild(sheet);

  function render() {
    const q = ($('artQ').value || '').trim().toLowerCase();
    const counts = { all: items.length };
    items.forEach(x => { counts[x.g] = (counts[x.g] || 0) + 1; });
    $('artChips').innerHTML = GROUPS.map(([id, label]) =>
      '<button type="button" class="art-chip' + (filter === id ? ' on' : '') + '" data-g="' + id + '" aria-pressed="' + (filter === id) + '">' + label + ' <i>' + (counts[id] || 0) + '</i></button>').join('');
    const rows = items.filter(x => (filter === 'all' || x.g === filter) && (!q || x.hay.includes(q)));
    const U = W.U;
    $('artList').innerHTML = rows.map(x =>
      '<button type="button" class="art-row" data-k="' + esc(x.key) + '"><span class="art-ic" aria-hidden="true">' + (ICON[x.type] || '📦') + '</span>'
      + '<span class="art-tx"><b>' + esc(x.title) + '</b><small>' + esc(x.kind) + ' · ' + (x.priv ? '🔒 ' : '') + esc(x.chat)
      + (x.ts && U ? ' · ' + U.day(x.ts) + ' ' + U.time(x.ts) : '') + '</small></span>'
      + (fresh.has(x.key) ? '<i class="art-new" aria-label="New"></i>' : '') + '<span class="chev" aria-hidden="true">›</span></button>').join('')
      || '<div class="empty-state"><span class="es-ic" aria-hidden="true"><svg class="ic"><use href="#i-search"/></svg></span><b>' + (items.length ? 'Nothing matches' : 'No artifacts yet') + '</b><p>' + (items.length ? 'Try another word or filter.' : 'Ask Horizon to make a PDF and it lands here.') + '</p></div>';
  }

  async function openItem(x) {
    const A = W.EmberArtifacts; let a = null;
    try {
      const c = await W.Store.get(x.chatId), m = c && c.msgs && c.msgs[x.mi];
      if (m && m.r === 'a' && typeof m.t === 'string') a = (A.parse(m.t).items || [])[x.ai] || null;
    } catch (_) { /* fall through */ }
    if (!a) { T('Artifact is no longer available'); schedule(0); return; }
    A.view(a); // the existing full-screen viewer, with its PDF button
  }

  function open() {
    const dr = $('drawer'), bx = $('bDx');
    if (dr && dr.classList.contains('show') && bx) bx.click(); // close the left panel the normal way
    fresh = new Set(newKeys); filter = 'all'; $('artQ').value = '';
    sheet.classList.add('show');
    markSeen(); render();
    schedule(0);
  }
  function close() { sheet.classList.remove('show'); }

  // ---- wiring ----
  const box = $('bArtOpen');
  if (box) box.addEventListener('click', open);
  $('artX').addEventListener('click', close);
  $('artQ').addEventListener('input', render);
  $('artChips').addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-g]'); if (!b) return; filter = b.dataset.g; render(); });
  $('artList').addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-k]'); if (!b) return;
    const x = items.find(i => i.key === b.dataset.k); if (x) openItem(x);
  });
  const hist = $('bHist'); if (hist) hist.addEventListener('click', () => schedule(0)); // fresh count each time the panel opens
  D.addEventListener('visibilitychange', () => { if (!D.hidden) schedule(300); });
  // Escape closes the list, unless that same keypress is closing the viewer on top of it.
  let escHadViewer = false;
  D.addEventListener('keydown', e => { if (e.key === 'Escape') escHadViewer = !!$('artifactOverlay'); }, true);
  D.addEventListener('keydown', e => { if (e.key === 'Escape' && !escHadViewer && sheet.classList.contains('show')) close(); });
  // A new artifact card or picture in the chat means Ember just made one: re-read the chats.
  const log = $('log');
  if (log) {
    let raf = 0;
    new MutationObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const n = log.querySelectorAll('.artifact-card,.artifact-inline').length;
        if (n === lastCardCount) return;
        lastCardCount = n; schedule(900); setTimeout(() => schedule(0), 3500); // second pass in case the chat saves a moment late
      });
    }).observe(log, { childList: true, subtree: true });
  }
  schedule(600);

  W.EmberArtBox = { refresh: () => refresh(), open, close, count: () => items.length, isOpen: () => sheet.classList.contains('show') };
})();
