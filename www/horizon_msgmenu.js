/* HORIZON V1.77.0 · message tools (batch 2).
   F4  Long-press menu on any message: Copy, Quote, Select text, Pin, Share, Read from here, Delete.
   F3  Quote reply: swipe a message to the right (or pick Quote in the menu). The quote sits above the message box and goes with your next send.
   F6  Pinned banner: one pinned message per chat, shown at the top of the chat. Tap it to jump to the message.
   F21 Remember: a brain button on every reply that saves a line into the Memory box.
   F25 Undo toast is in index.html (delete message, delete chat) with the toast from horizon_toast.js.
   Talks to the app through window.HzMsg (defined in index.html). Every call is guarded, so a missing piece switches one feature off, never the chat. */
(function () {
  'use strict';
  var scroll = document.getElementById('chatScroll'), msgs = document.getElementById('chatMessages');
  if (!scroll || !msgs) return;

  var NS = 'http://www.w3.org/2000/svg';
  var API = function () { return window.HzMsg || null; };
  function toast(o) { try { if (window.HzToast) window.HzToast.show(o); } catch (e) { /* toast is optional */ } }
  function buzz(ms) { try { if (navigator.vibrate) navigator.vibrate(ms || 18); } catch (e) { /* no haptics */ } }
  function ic(id) {
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('class', 'ic'); s.setAttribute('aria-hidden', 'true');
    var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#' + id); s.appendChild(u); return s;
  }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }

  /* one small icon the sprite does not have */
  (function () {
    if (document.getElementById('i-hz-share')) return;
    var s = document.createElementNS(NS, 'svg'); s.setAttribute('width', '0'); s.setAttribute('height', '0'); s.setAttribute('style', 'position:absolute');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = '<symbol id="i-hz-share" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="10.5" x2="15.4" y2="6.5"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/></symbol>';
    document.body.appendChild(s);
  })();

  async function copyPlain(t) {
    try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(t); return true; } } catch (e) { /* fall through */ }
    try {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
      document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); ta.remove(); return !!ok;
    } catch (e) { return false; }
  }

  function wrapOf(node) { return node && node.closest ? node.closest('#chatMessages > .message') : null; }
  function msgOf(wrap) { return wrap ? wrap._msg || null : null; }
  function whoOf(wrap) {
    var m = msgOf(wrap);
    if (m && m.role === 'user') return 'You';
    var n = wrap && wrap.querySelector('.meta-name');
    return n && n.textContent ? n.textContent : 'Horizon';
  }
  function plain(t) {
    return String(t || '').replace(/<artifact\b[\s\S]*?<\/artifact>/gi, '').replace(/```[\s\S]*?```/g, ' code block. ')
      .replace(/^[>#\-\*\s]+/gm, '').replace(/[*_`~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+\n/g, '\n').trim();
  }

  /* ================= F3 · quote chip above the message box ================= */
  var quote = null;   /* { text, who } */
  var chip = el('div', 'hz-qchip'); chip.hidden = true;
  var chipBar = el('i', 'hz-qbar'); var chipTx = el('div', 'hz-qtx'); var chipWho = el('b', '', ''); var chipSn = el('span', '', '');
  chipTx.append(chipWho, chipSn);
  var chipX = el('button', 'hz-qx'); chipX.type = 'button'; chipX.setAttribute('aria-label', 'Remove the quote'); chipX.appendChild(ic('i-x'));
  chip.append(chipBar, chipTx, chipX);
  (function () {
    var area = document.querySelector('.chat-input-area');
    if (area && area.parentNode) area.parentNode.insertBefore(chip, area); else document.body.appendChild(chip);
  })();
  function clean(t) {
    return String(t || '').replace(/<artifact\b[\s\S]*?<\/artifact>/gi, '[document]').replace(/```[\s\S]*?```/g, '[code]')
      .split('\n').filter(function (l) { return !/^\s*>/.test(l); }).join('\n').replace(/\n{2,}/g, '\n').replace(/[ \t]+/g, ' ').trim();
  }
  function setQuote(text, who) {
    var t = clean(text);
    if (!t) { toast({ title: 'Nothing to quote', kind: 'bad' }); return; }
    if (t.length > 400) t = t.slice(0, 400).replace(/\s+\S*$/, '') + '\u2026';
    quote = { text: t, who: who || '' };
    chipWho.textContent = 'Quoting ' + (who || 'message');
    chipSn.textContent = t.replace(/\n/g, ' ');
    chip.hidden = false;
    var ta = document.getElementById('chatInput'); if (ta) { try { ta.focus(); } catch (e) { /* ignore */ } }
  }
  function clearQuote() { quote = null; chip.hidden = true; }
  chipX.addEventListener('click', clearQuote);
  /* index.html calls this when you send: returns the quote as "> " lines, once */
  function takeQuote() {
    if (!quote) return '';
    var q = quote.text.split('\n').map(function (l) { return '> ' + l; }).join('\n');
    clearQuote();
    return q;
  }
  window.HzMsgMenu = { takeQuote: takeQuote, quote: setQuote, clearQuote: clearQuote };

  /* ================= F3 · swipe right to quote ================= */
  (function () {
    var w = null, sx = 0, sy = 0, dx = 0, mode = 0;   /* mode 0 undecided, 1 swiping, -1 not a swipe */
    var TRIG = 72;
    function reset(animate) {
      if (!w) return;
      var x = w; w = null;
      x.classList.remove('hz-swiping', 'hz-swipe-ok');
      if (animate) { x.style.transition = 'transform .18s ease'; setTimeout(function () { x.style.transition = ''; }, 200); }
      x.style.transform = '';
    }
    scroll.addEventListener('touchstart', function (e) {
      reset(false); mode = 0; dx = 0;
      if (e.touches.length !== 1) { mode = -1; return; }
      var t = e.touches[0];
      if (t.clientX < 28) { mode = -1; return; }   /* the phone's own edge gestures */
      var x = wrapOf(e.target);
      if (!x || x.id === 'loadingBubble' || !msgOf(x)) { mode = -1; return; }
      if (e.target.closest && e.target.closest('pre, code, table, textarea, input, button, a, .qa-edit, .art-card, .link-card, .th-chip')) { mode = -1; return; }
      w = x; sx = t.clientX; sy = t.clientY;
    }, { passive: true });
    scroll.addEventListener('touchmove', function (e) {
      if (!w || mode < 0) return;
      var t = e.touches[0], mx = t.clientX - sx, my = t.clientY - sy;
      if (mode === 0) {
        if (Math.abs(my) > 14 && Math.abs(my) > Math.abs(mx)) { mode = -1; reset(false); return; }
        if (mx > 12 && mx > Math.abs(my) * 1.6) { mode = 1; w.classList.add('hz-swiping'); } else return;
      }
      if (e.cancelable) e.preventDefault();
      dx = Math.max(0, mx);
      w.style.transform = 'translateX(' + Math.min(dx * 0.55, 56) + 'px)';
      var ok = dx >= TRIG;
      if (ok !== w.classList.contains('hz-swipe-ok')) { w.classList.toggle('hz-swipe-ok', ok); if (ok) buzz(10); }
    }, { passive: false });
    function end() {
      if (!w) return;
      var hit = mode === 1 && dx >= TRIG, x = w;
      reset(true);
      if (hit) { var m = msgOf(x); if (m) { buzz(16); setQuote(m.text, whoOf(x)); } }
      mode = 0; dx = 0;
    }
    scroll.addEventListener('touchend', end, { passive: true });
    scroll.addEventListener('touchcancel', function () { reset(true); mode = 0; }, { passive: true });
  })();

  /* ================= F4 · long-press menu ================= */
  var sheet = null;
  function closeSheet() { if (sheet) { var s = sheet; sheet = null; s.classList.add('out'); setTimeout(function () { if (s.parentNode) s.parentNode.removeChild(s); }, 180); } }

  function row(icon, label, fn, cls) {
    var b = el('button', 'hz-mi' + (cls ? ' ' + cls : '')); b.type = 'button';
    var i = typeof icon === 'string' ? ic(icon) : icon; b.append(i, el('span', '', label));
    b.addEventListener('click', function () { closeSheet(); try { fn(); } catch (e) { toast({ title: 'That did not work', sub: String(e && e.message || e), kind: 'bad' }); } });
    return b;
  }

  function selectSheet(text) {
    var back = el('div', 'hz-mback'); var card = el('div', 'hz-msel');
    var h = el('div', 'hz-msel-h', 'Select text');
    var ta = el('textarea', 'hz-msel-ta'); ta.value = text; ta.readOnly = true; ta.setAttribute('inputmode', 'none'); ta.setAttribute('spellcheck', 'false');
    var act = el('div', 'hz-msel-row');
    var all = el('button', 'hz-mbtn', 'Select all'); all.type = 'button';
    var cp = el('button', 'hz-mbtn pri', 'Copy'); cp.type = 'button';
    var cl = el('button', 'hz-mbtn', 'Close'); cl.type = 'button';
    function shut() { back.classList.add('out'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    all.addEventListener('click', function () { ta.focus(); ta.setSelectionRange(0, ta.value.length); });
    cp.addEventListener('click', async function () {
      var a = ta.selectionStart, b = ta.selectionEnd, part = a !== b ? ta.value.slice(a, b) : ta.value;
      var ok = await copyPlain(part); toast({ title: ok ? (a !== b ? 'Selection copied' : 'Copied') : 'Copy failed', kind: ok ? 'ok' : 'bad', ms: 2200 });
    });
    cl.addEventListener('click', shut);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    act.append(all, cp, cl); card.append(h, ta, act); back.appendChild(card); document.body.appendChild(back);
    setTimeout(function () { try { ta.focus(); ta.setSelectionRange(0, ta.value.length); } catch (e) { /* ignore */ } }, 60);
  }

  function readFrom(wrap) {
    var T = window.HorizonTTS, a = API(), chat = a && a.chat();
    if (!T || !chat) { toast({ title: 'Read aloud is not ready', kind: 'bad' }); return; }
    var i = chat.messages.indexOf(msgOf(wrap));
    if (i < 0) return;
    var parts = [];
    for (var k = i; k < chat.messages.length; k++) { var m = chat.messages[k]; if (m.role !== 'user' && !m.img) { var p = plain(m.text); if (p) parts.push(p); } }
    if (!parts.length) { toast({ title: 'Nothing to read from here', sub: 'There is no reply from this point on.', kind: 'bad' }); return; }
    T.toggle('hz-from-here', parts.join('\n\n'), { slot: 0 });
  }

  function openMenu(wrap) {
    closeSheet();
    var m = msgOf(wrap), a = API(), chat = a && a.chat();
    if (!m || !chat) return;
    var back = el('div', 'hz-mback'); var card = el('div', 'hz-menu'); card.setAttribute('role', 'menu');
    var head = el('div', 'hz-mh'); head.append(el('b', '', whoOf(wrap)), el('span', '', clean(m.text).replace(/\n/g, ' ').slice(0, 90) || (m.img ? 'Picture' : 'Message')));
    card.appendChild(head);
    var pinned = chat.pinTs === m.ts;
    card.appendChild(row('i-copy', 'Copy', function () { copyPlain(String(m.text || '')).then(function (ok) { toast({ title: ok ? 'Copied' : 'Copy failed', kind: ok ? 'ok' : 'bad', ms: 2200 }); }); }));
    card.appendChild(row('i-chat', 'Quote', function () { setQuote(m.text, whoOf(wrap)); }));
    card.appendChild(row('i-edit', 'Select text', function () { selectSheet(String(m.text || '')); }));
    card.appendChild(row('i-pin', pinned ? 'Unpin' : 'Pin to top', function () { setPin(chat, pinned ? null : m); }));
    card.appendChild(row(ic('i-hz-share'), 'Share', function () {
      var t = String(m.text || '');
      if (navigator.share) navigator.share({ text: t }).catch(function () { /* cancelled */ });
      else copyPlain(t).then(function (ok) { toast({ title: ok ? 'Copied (sharing is not available here)' : 'Share failed', kind: ok ? 'ok' : 'bad' }); });
    }));
    if (window.HorizonTTS) card.appendChild(row('i-volume', 'Read from here', function () { readFrom(wrap); }));
    var del = row('i-trash', m.role === 'user' ? 'Delete (and its reply)' : 'Delete', function () { if (a.busy()) { toast({ title: 'Horizon is working', sub: 'Tap Stop first, then delete.', kind: 'bad' }); return; } a.deleteMsg(wrap); }, 'danger');
    card.appendChild(del);
    var cancel = el('button', 'hz-mcancel', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', closeSheet);
    card.appendChild(cancel);
    back.appendChild(card);
    back.addEventListener('click', function (e) { if (e.target === back) closeSheet(); });
    document.body.appendChild(back); sheet = back;
  }

  (function () {
    var timer = 0, w = null, sx = 0, sy = 0, fired = false;
    function stop() { if (timer) { clearTimeout(timer); timer = 0; } }
    msgs.addEventListener('pointerdown', function (e) {
      stop(); fired = false;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      var x = wrapOf(e.target);
      if (!x || x.id === 'loadingBubble' || !msgOf(x)) return;
      var b = e.target.closest && e.target.closest('.bubble');
      if (!b || !x.contains(b)) return;
      if (e.target.closest('a, button, input, textarea, pre, .qa-edit, .art-card, .link-card, .th-chip')) return;
      w = x; sx = e.clientX; sy = e.clientY;
      timer = setTimeout(function () {
        timer = 0; fired = true; buzz(20);
        try { var s = window.getSelection && window.getSelection(); if (s) s.removeAllRanges(); } catch (er) { /* ignore */ }
        openMenu(w);
      }, 420);
    });
    msgs.addEventListener('pointermove', function (e) { if (timer && (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10)) stop(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { msgs.addEventListener(ev, stop); });
    msgs.addEventListener('contextmenu', function (e) { if (fired || (w && timer)) e.preventDefault(); });
    msgs.addEventListener('click', function (e) { if (fired) { fired = false; e.preventDefault(); e.stopPropagation(); } }, true);
  })();

  /* ================= F6 · pinned banner ================= */
  var banner = el('div', 'hz-pinbar'); banner.hidden = true;
  var pbBody = el('button', 'hz-pin-b'); pbBody.type = 'button';
  var pbTx = el('span', 'hz-pin-t'); pbBody.append(ic('i-pin'), pbTx);
  var pbX = el('button', 'hz-pin-x'); pbX.type = 'button'; pbX.setAttribute('aria-label', 'Unpin this message'); pbX.appendChild(ic('i-x'));
  banner.append(pbBody, pbX);
  scroll.insertBefore(banner, scroll.firstChild);

  function pinnedMsg(chat) {
    if (!chat || !chat.pinTs) return null;
    for (var i = 0; i < chat.messages.length; i++) if (chat.messages[i].ts === chat.pinTs) return chat.messages[i];
    return null;
  }
  function setPin(chat, m) {
    var a = API(); if (!a || !chat) return;
    if (m) { chat.pinTs = m.ts; } else { delete chat.pinTs; }
    a.save();
    paintPin();
    toast({ title: m ? 'Pinned to the top' : 'Unpinned', sub: m ? 'Tap the banner to jump back to it.' : '', icon: 'i-pin', ms: 2600 });
  }
  function paintPin() {
    var a = API(), chat = a && a.chat(), m = pinnedMsg(chat);
    if (chat && chat.pinTs && !m) { delete chat.pinTs; a.save(); }   /* the pinned message was deleted */
    banner.hidden = !m;
    if (m) pbTx.textContent = clean(m.text).replace(/\n/g, ' ').slice(0, 120) || 'Pinned message';
  }
  function flash(node) { node.classList.add('hz-flash'); setTimeout(function () { node.classList.remove('hz-flash'); }, 1500); }
  function jumpPin() {
    var a = API(), chat = a && a.chat(), m = pinnedMsg(chat); if (!m) return;
    var all = msgs.querySelectorAll(':scope > .message');
    for (var i = 0; i < all.length; i++) if (all[i]._msg === m) {
      var edge = scroll.getBoundingClientRect().top + banner.offsetHeight;
      var y = scroll.scrollTop + (all[i].getBoundingClientRect().top - edge) - 8;
      try { scroll.scrollTo({ top: Math.max(0, y), behavior: 'smooth' }); } catch (e) { scroll.scrollTop = Math.max(0, y); }
      flash(all[i]); return;
    }
  }
  pbBody.addEventListener('click', jumpPin);
  pbX.addEventListener('click', function () { var a = API(); if (a) setPin(a.chat(), null); });

  /* ================= F21 · Remember (brain button on replies) ================= */
  function rememberSheet(wrap) {
    var m = msgOf(wrap), a = API(); if (!m || !a) return;
    var sel = '';
    try { var s = window.getSelection && window.getSelection(); if (s && s.toString() && wrap.contains(s.anchorNode)) sel = s.toString(); } catch (e) { /* ignore */ }
    var first = clean(sel || m.text).replace(/\n/g, ' ');
    if (first.length > 280) first = first.slice(0, 280).replace(/\s+\S*$/, '');
    var back = el('div', 'hz-mback'); var card = el('div', 'hz-msel');
    var h = el('div', 'hz-msel-h'); h.append(ic('i-brain'), document.createTextNode(' Remember this'));
    var note = el('div', 'hz-msel-n', 'Edit it down to the one line you want every chat to know. It goes into your Memory box.');
    var ta = el('textarea', 'hz-msel-ta short'); ta.value = first; ta.maxLength = 300; ta.setAttribute('spellcheck', 'true');
    var act = el('div', 'hz-msel-row');
    var sv = el('button', 'hz-mbtn pri', 'Save to Memory'); sv.type = 'button';
    var cl = el('button', 'hz-mbtn', 'Cancel'); cl.type = 'button';
    function shut() { back.classList.add('out'); setTimeout(function () { if (back.parentNode) back.parentNode.removeChild(back); }, 180); }
    sv.addEventListener('click', function () {
      var ok = false; try { ok = a.remember(ta.value); } catch (e) { ok = false; }
      if (ok) { shut(); buzz(14); toast({ title: 'Saved to Memory', sub: 'Every chat can use it now.', icon: 'i-brain', ms: 2800 }); }
      else toast({ title: 'Not saved', sub: 'It is empty, already saved, or looks like a key.', kind: 'bad' });
    });
    cl.addEventListener('click', shut);
    back.addEventListener('click', function (e) { if (e.target === back) shut(); });
    act.append(sv, cl); card.append(h, note, ta, act); back.appendChild(card); document.body.appendChild(back);
    setTimeout(function () { try { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } catch (e) { /* ignore */ } }, 60);
  }
  function decorate() {
    var rows = msgs.querySelectorAll(':scope > .message.ai .act-row .act-left');
    for (var i = 0; i < rows.length; i++) {
      var left = rows[i]; if (left.querySelector('.hz-rem')) continue;
      var wrap = wrapOf(left); var m = msgOf(wrap);
      if (!m || m.img || !String(m.text || '').trim()) continue;
      var b = el('button', 'hz-rem'); b.type = 'button'; b.setAttribute('aria-label', 'Remember this: save a line to Memory');
      b.append(ic('i-brain'), el('span', '', 'Remember'));
      (function (w) { b.addEventListener('click', function () { rememberSheet(w); }); })(wrap);
      left.appendChild(b);
    }
  }

  /* chat switches, new replies and re-renders all change #chatMessages */
  var pend = 0;
  function later() { if (pend) return; pend = requestAnimationFrame(function () { pend = 0; try { decorate(); paintPin(); } catch (e) { /* never break the chat */ } }); }
  try { new MutationObserver(later).observe(msgs, { childList: true, subtree: true }); } catch (e) { /* no observer */ }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSheet(); });
  later();
})();
