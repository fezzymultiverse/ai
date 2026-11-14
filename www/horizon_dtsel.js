/* HORIZON V1.93.38 · DOUBLE-TAP SELECT.
   Double-tap text in a chat message and Horizon selects it, then shows a small Copy button next to the selection:
     - normal text: first double-tap selects the sentence under your finger, a second double-tap on the same
       sentence widens it to the whole paragraph (or list item or heading); a third goes back to the sentence
     - code block: one double-tap selects the whole block
   Taps on links, buttons, cards, chips and the code header are left alone. The long-press menu (Copy, Quote, Select text)
   and swipe-to-quote work as before. Every step is guarded, so a failure here can never break the chat.
   Public API: window.HorizonDtSel = { sentenceAt, selectAt, hide }. */
(function () {
  'use strict';
  var msgs = document.getElementById('chatMessages');
  if (!msgs || window.HorizonDtSel) return;

  var DBL_MS = 350;       // longest gap between the two taps
  var DBL_PX = 36;        // the two taps must land this close together
  var TAP_MS = 380;       // a press longer than this is a long-press, not a tap
  var MOVE_PX = 12;       // a finger that moves more than this is scrolling or swiping, not tapping
  var CYCLE_MS = 9000;    // how long a sentence selection can still be widened to the paragraph
  var SKIP = 'a, button, input, textarea, select, .code-head, .qa-edit, .art-card, .link-card, .th-chip, .hz-dtpill';
  var BLOCKS = 'p, li, h3, h4, blockquote, td, th';
  var ABBR = /(?:^|[\s(\[])(?:Mr|Mrs|Ms|Dr|Prof|St|vs|No|Fig|e\.g|i\.e)$/;

  var down = null, last = null, pill = null, pillText = '', pillRange = null, mem = null, hideT = 0;

  function toast(o) { try { if (window.HzToast) window.HzToast.show(o); } catch (e) { /* toast is optional */ } }
  function getSel() { try { return window.getSelection ? window.getSelection() : null; } catch (e) { return null; } }
  function wrapOf(n) { return n && n.closest ? n.closest('#chatMessages > .message') : null; }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
  function elOf(n) { return n && n.nodeType === 1 ? n : (n ? n.parentElement : null); }

  /* ---------- text and position helpers ---------- */
  function textMap(root) {
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null), list = [], pos = 0, n, len;
    while ((n = w.nextNode())) {
      len = n.nodeValue.length;
      if (!len) continue;
      list.push({ n: n, s: pos, e: pos + len });
      pos += len;
    }
    return { list: list, text: list.map(function (x) { return x.n.nodeValue; }).join(''), len: pos };
  }

  function caretAt(x, y) {
    try {
      if (document.caretPositionFromPoint) {
        var p = document.caretPositionFromPoint(x, y);
        if (p && p.offsetNode) return { node: p.offsetNode, off: p.offset };
      }
      if (document.caretRangeFromPoint) {
        var r = document.caretRangeFromPoint(x, y);
        if (r) return { node: r.startContainer, off: r.startOffset };
      }
    } catch (e) { /* no caret API */ }
    return null;
  }

  function idxOf(map, node, off) {
    var i, it, r, cmp;
    for (i = 0; i < map.list.length; i++) {
      it = map.list[i];
      if (it.n === node) return it.s + Math.min(off, it.e - it.s);
    }
    if (node && node.nodeType === 1) {
      r = document.createRange();
      try { r.setStart(node, Math.min(off, node.childNodes.length)); r.collapse(true); } catch (e) { return -1; }
      for (i = 0; i < map.list.length; i++) {
        it = map.list[i];
        try { cmp = r.comparePoint(it.n, 0); } catch (e2) { continue; }
        if (cmp >= 0) return it.s;
      }
      return map.len;
    }
    return -1;
  }

  function trimSpan(t, s, e) {
    while (s < e && /\s/.test(t.charAt(s))) s++;
    while (e > s && /\s/.test(t.charAt(e - 1))) e--;
    return e > s ? [s, e] : null;
  }

  /* the sentence that holds character position idx; a line break also ends a sentence */
  function sentenceAt(t, idx) {
    var segs = [], start = 0, re = /[.!?\u2026]+["'\u201d\u2019)\]]*(?=\s|$)|\n+/g, m, end, nxt, i;
    t = String(t || '');
    while ((m = re.exec(t))) {
      end = m.index + m[0].length;
      if (m[0].charAt(0) !== '\n') {
        if (m[0] === '.' && ABBR.test(t.slice(Math.max(0, m.index - 6), m.index))) continue;   // Mr. Dr. e.g. i.e. and friends
        nxt = /\S/.exec(t.slice(end));
        if (nxt && /[a-z]/.test(nxt[0])) continue;                                               // "etc. and ..." carries on
      }
      segs.push([start, end]);
      start = end;
    }
    if (start < t.length) segs.push([start, t.length]);
    if (!segs.length) return null;
    if (idx < 0) idx = 0;
    for (i = 0; i < segs.length; i++) if (idx >= segs[i][0] && idx < segs[i][1]) return trimSpan(t, segs[i][0], segs[i][1]);
    return trimSpan(t, segs[segs.length - 1][0], segs[segs.length - 1][1]);
  }

  /* plain-text bubbles have no <p>: a paragraph there is the stretch between blank lines */
  function chunkAt(t, idx) {
    var re = /\n[ \t]*\n+/g, start = 0, m;
    t = String(t || '');
    while ((m = re.exec(t))) {
      if (idx <= m.index) return trimSpan(t, start, m.index);
      start = m.index + m[0].length;
    }
    return trimSpan(t, start, t.length);
  }

  function rangeFor(map, s, e) {
    var a = null, b = null, i, it, r;
    for (i = 0; i < map.list.length; i++) {
      it = map.list[i];
      if (!a && s < it.e) a = [it.n, Math.max(0, s - it.s)];
      if (a && e <= it.e) { b = [it.n, Math.max(0, e - it.s)]; break; }
    }
    if (!a || !b) return null;
    r = document.createRange();
    try { r.setStart(a[0], a[1]); r.setEnd(b[0], b[1]); } catch (e2) { return null; }
    return r;
  }

  /* ---------- the Copy button ---------- */
  function hide() {
    clearTimeout(hideT); hideT = 0;
    if (pill) { var p = pill; pill = null; p.classList.remove('on'); setTimeout(function () { if (p.parentNode) p.parentNode.removeChild(p); }, 160); }
  }

  function legacyCopy(t) {
    try {
      var ta = document.createElement('textarea');
      ta.value = t; ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, t.length);
      var ok = document.execCommand('copy');
      if (ta.parentNode) ta.parentNode.removeChild(ta);
      return !!ok;
    } catch (e) { return false; }
  }

  function copyNow(t) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return legacyCopy(t); });
      }
    } catch (e) { /* fall through */ }
    return Promise.resolve(legacyCopy(t));
  }

  function applySelection(range) {
    var s = getSel();
    if (!s || !range) return;
    var key = range.toString(), at = Date.now();
    function set() { try { s.removeAllRanges(); s.addRange(range.cloneRange()); } catch (e) { /* ignore */ } }
    set();
    /* the WebView may run its own word-select right after a double-tap; put ours back if it did */
    [30, 120, 260].forEach(function (ms) { setTimeout(function () { if (Date.now() - at < 400 && s.toString() !== key) set(); }, ms); });
  }

  function showPill(range, text) {
    hide();
    var rects = range.getClientRects(), first = rects.length ? rects[0] : range.getBoundingClientRect(), lastR = rects.length ? rects[rects.length - 1] : first;
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'hz-dtpill'; b.setAttribute('aria-label', 'Copy selected text');
    var NS = 'http://www.w3.org/2000/svg', svg = document.createElementNS(NS, 'svg'), use = document.createElementNS(NS, 'use');
    svg.setAttribute('class', 'ic'); svg.setAttribute('aria-hidden', 'true'); use.setAttribute('href', '#i-copy'); svg.appendChild(use);
    var lab = document.createElement('span'); lab.textContent = 'Copy';
    b.appendChild(svg); b.appendChild(lab);
    /* pointerdown and mousedown keep the selection from collapsing. touchstart is left alone on purpose: cancelling it would swallow the tap's click on a phone. */
    ['pointerdown', 'mousedown'].forEach(function (ev) { b.addEventListener(ev, function (e) { e.preventDefault(); e.stopPropagation(); }); });
    b.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      var t = pillText, rg = pillRange;
      copyNow(t).then(function (ok) {
        hide();
        if (ok) toast({ title: 'Copied', sub: t.length + ' characters', kind: 'ok', ms: 1800 });
        else toast({ title: 'Could not copy', sub: 'Use the long-press menu, then Copy', kind: 'bad' });
        if (rg) applySelection(rg);
      });
    });
    pill = b; pillText = text; pillRange = range.cloneRange();
    document.body.appendChild(b);
    var w = b.offsetWidth || 96, h = b.offsetHeight || 38, vw = window.innerWidth || document.documentElement.clientWidth, vh = window.innerHeight || document.documentElement.clientHeight;
    var cx = first.left + first.width / 2;
    var left = Math.max(8, Math.min(vw - w - 8, cx - w / 2));
    var top = first.top - h - 10;
    if (top < 56) top = lastR.bottom + 22;               // not enough room above: go below, clear of the selection handles
    top = Math.max(8, Math.min(vh - h - 8, top));
    b.style.left = left + 'px'; b.style.top = top + 'px';
    requestAnimationFrame(function () { if (pill === b) b.classList.add('on'); });
    hideT = setTimeout(hide, 12000);
  }

  /* ---------- choosing what to select ---------- */
  function selectAt(x, y, target) {
    var bubble = target && target.closest ? target.closest('.bubble') : null, wrap = wrapOf(bubble);
    if (!bubble || !wrap || wrap.id === 'loadingBubble') return false;
    var api = window.HzMsg;
    try { if (api && api.busy && api.busy() && wrap === msgs.lastElementChild) return false; } catch (e) { /* ignore */ }

    var pre = target.closest('pre'), r, text;
    if (pre && bubble.contains(pre)) {                    // code block: the whole block, nothing else
      r = document.createRange();
      r.selectNodeContents(pre.querySelector('code') || pre);
      text = r.toString();
      if (!text) return false;
      mem = null;
      applySelection(r); showPill(r, text);
      return true;
    }

    var caret = caretAt(x, y), cel = caret ? elOf(caret.node) : null;
    var blockEl = (cel && bubble.contains(cel) ? cel.closest(BLOCKS) : null) || (target.closest(BLOCKS)) || null;
    if (blockEl && !bubble.contains(blockEl)) blockEl = null;
    var realBlock = !!blockEl;
    var root = blockEl || bubble;
    var map = textMap(root);
    if (!map.len) return false;

    var idx = caret && root.contains(caret.node) ? idxOf(map, caret.node, caret.off) : -1;
    var para, sent;
    if (idx < 0) {                                        // the tap landed on padding: take the whole block, but only a real one
      if (!realBlock) return false;
      para = trimSpan(map.text, 0, map.len); sent = null;
    } else {
      para = realBlock ? trimSpan(map.text, 0, map.len) : chunkAt(map.text, idx);
      sent = sentenceAt(map.text, idx);
      if (para && sent && (sent[0] < para[0] || sent[1] > para[1])) sent = [Math.max(sent[0], para[0]), Math.min(sent[1], para[1])];
    }
    if (!para) return false;

    var paraR = rangeFor(map, para[0], para[1]), sentR = sent ? rangeFor(map, sent[0], sent[1]) : null;
    if (!paraR) return false;
    var pick = sentR || paraR, stage = 1;
    if (sentR) {
      var sTxt = norm(sentR.toString()), pTxt = norm(paraR.toString()), now = Date.now();
      if (sTxt === pTxt) { pick = paraR; stage = 2; }
      else if (mem && mem.root === root && mem.stage === 1 && mem.sTxt === sTxt && now - mem.at < CYCLE_MS) { pick = paraR; stage = 2; }   // 2nd double-tap on the same sentence: widen
      mem = { root: root, stage: stage, sTxt: sTxt, at: now };
    } else {
      mem = null;
    }
    text = pick.toString();
    if (!norm(text)) return false;
    applySelection(pick); showPill(pick, text);
    return true;
  }

  /* ---------- tap tracking ---------- */
  msgs.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) { down = null; return; }
    down = { t: Date.now(), x: e.clientX, y: e.clientY, moved: false, target: e.target };
  }, true);
  msgs.addEventListener('pointermove', function (e) {
    if (down && (Math.abs(e.clientX - down.x) > MOVE_PX || Math.abs(e.clientY - down.y) > MOVE_PX)) down.moved = true;
  }, true);
  msgs.addEventListener('pointercancel', function () { down = null; last = null; }, true);
  msgs.addEventListener('pointerup', function (e) {
    var d = down; down = null;
    try {
      if (!d || d.moved || !d.target || !d.target.closest) { last = null; return; }
      var now = Date.now();
      if (now - d.t > TAP_MS) { last = null; return; }                                  // a long-press belongs to the message menu
      if (d.target.closest(SKIP)) { last = null; return; }
      var bubble = d.target.closest('.bubble');
      if (!bubble || !wrapOf(bubble)) { last = null; return; }
      if (last && last.bubble === bubble && now - last.t < DBL_MS && Math.abs(e.clientX - last.x) < DBL_PX && Math.abs(e.clientY - last.y) < DBL_PX) {
        last = null;
        selectAt(e.clientX, e.clientY, d.target);
      } else {
        last = { t: now, x: e.clientX, y: e.clientY, bubble: bubble };
      }
    } catch (err) { last = null; }
  }, true);

  /* a desktop browser can select a word on its own double-click: put our choice back */
  msgs.addEventListener('dblclick', function (e) {
    try { if (pillRange && pill) applySelection(pillRange); } catch (err) { /* ignore */ }
  });

  /* the Copy button goes away when you tap elsewhere, scroll, or the selection collapses */
  document.addEventListener('pointerdown', function (e) { if (pill && !(e.target.closest && e.target.closest('.hz-dtpill'))) hide(); }, true);
  var sc = document.getElementById('chatScroll');
  if (sc) sc.addEventListener('scroll', function () { if (pill) hide(); }, { passive: true });
  document.addEventListener('selectionchange', function () {
    if (!pill) return;
    var s = getSel();
    if (!s || s.isCollapsed) { var p = pill; setTimeout(function () { if (pill === p) { var s2 = getSel(); if (!s2 || s2.isCollapsed) hide(); } }, 350); }
  });

  window.HorizonDtSel = { sentenceAt: sentenceAt, selectAt: selectAt, hide: hide };
})();
