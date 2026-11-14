/* HORIZON V1.58.0 · Settings AI.
   A glowing AI button beside "Settings". Tap it and a focused assistant opens that only talks about Horizon's settings and features:
   where things are, what they do, fixes, and ideas to improve. No small talk. It sees the names and descriptions of the settings rows,
   which provider/model is active and whether each key is set (never the keys), and the text of the settings page you have open
   (never the Vault or Security pages). It cannot change anything: it tells you the exact path. Nothing is saved in your chats. */
(function () {
  'use strict';
  var st = { hist: [], busy: false, open: false, pushed: false };
  var el = {};

  function mk(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  var SPARK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><path d="M12 2l2.1 6.2L20 10l-5.9 1.8L12 18l-2.1-6.2L4 10l5.9-1.8L12 2z"/><path d="M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9L19 14z" opacity=".75"/></svg>';

  var RULES = 'You are Horizon Settings AI, built into the Horizon app, helping Fezzy with Horizon\u2019s SETTINGS and FEATURES only. '
    + 'Scope: where a setting or feature lives, what it does, how to set it up, why something is not working, which option suits him, and concrete ideas or insights to improve his setup or the app. '
    + 'Strict: no small talk, greetings, jokes, opinions on other topics or general chat. If he goes off-topic, answer exactly "Settings and features only." and offer one relevant thing to look at. '
    + 'Work only from the context below. If a feature is not listed or you are unsure, say so instead of inventing it. You cannot change any setting yourself; give the exact path to tap, in short numbered steps. '
    + 'Never ask for, show or repeat API keys, passphrases or Vault contents. Keep answers short and practical. Use Markdown (short lists, bold names). End insight answers with one improvement idea only when it is genuinely useful.';

  var FEATURES = [
    'Chat with replies from Gemini, Groq, Cohere, Mistral, OpenRouter, AnyAPI, Routeway and Requesty (free models only), Kilo Gateway, OVHcloud AI, GonkaRouter or free Pollinations (pick in the AI sheet from the header pill; keys live in Settings > API PROVIDERS PLUS KEYS).',
    'Thinking switch, web scraping tools (SerpAPI, Firecrawl, ScraperBee, Browserless), memories and a persona/reply-preferences prompt, and an Archive of uploaded PDFs, notes, links and pictures the AI reads from.',
    'PDF artifacts (A4 documents), HTML preview + Save, and Markdown blocks with Raw/Converted + Save.',
    'Apps dock on the right panel: GitHub (pull repos for the AI), YouTube, music player, Terminal, Downloads, and more.',
    'Terminal (Android sh, no root) with an AI panel docked inside: an eye shows or hides the terminal output from the AI, an arrow minimizes the panel.',
    'Vault for keys and notes, Security (lock, PIN, what the AI can reach), Permissions (wake lock, notifications, files, battery, microphone), Personalisation (theme and voice), Usage & Engine, Snooze screen, Lens (the AI sees the app).'
  ].join('\n- ');

  function rows() {
    var out = [];
    document.querySelectorAll('#settingsHome .set-row').forEach(function (r) {
      var h = r.querySelector('h3'), p = r.querySelector('p');
      if (h) out.push('- ' + h.textContent.trim() + ': ' + (p ? p.textContent.trim() : ''));
    });
    return out.join('\n');
  }
  function providers() {
    var list = window.HzProviders || [], pick = window.HzPick;
    if (!list.length) return '';
    var s = list.map(function (p) { return p.name + (p.ready ? ' (key set)' : ' (no key)'); }).join(', ');
    return 'Providers: ' + s + '.' + (pick ? ' Active: ' + pick.name + ', model ' + pick.model + '.' : '');
  }
  function openPage() {
    var h = document.querySelector('#settingsTitle h2'), name = h ? h.textContent.trim() : 'Settings';
    var priv = /vault|security/i.test(name);
    var body = '';
    if (!priv && name !== 'Settings') {
      var tb = document.querySelector('#rightPanel > .tab-body:not([hidden])');
      if (tb) body = String(tb.innerText || '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 2500);
    }
    return { name: name, text: body, priv: priv };
  }
  function context() {
    var pg = openPage();
    var c = 'CONTEXT (from the app, right now)\nSettings rows:\n' + rows() + '\n\nFeatures:\n- ' + FEATURES + '\n\n' + providers();
    c += '\nPage open: ' + pg.name + (pg.priv ? ' (private page, contents not shared)' : '') + '.';
    if (pg.text) c += '\nText on that page:\n' + pg.text;
    return c;
  }

  function say(text, cls) { var d = mk('div', 'hzsa-m ' + cls, text); el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight; return d; }
  function bot(text) {
    var d = mk('div', 'hzsa-m hzsa-b mv-view');
    try { if (window.HorizonMdView) d.appendChild(HorizonMdView.convert(text)); else d.textContent = text; } catch (e) { d.textContent = text; }
    el.log.appendChild(d); el.log.scrollTop = el.log.scrollHeight;
  }
  function ask(v) {
    v = String(v || '').trim(); if (!v || st.busy) return;
    if (typeof window.HorizonAskAI !== 'function') { say('The AI link is missing in this build.', 'hzsa-err'); return; }
    el.ta.value = ''; el.ta.style.height = 'auto'; say(v, 'hzsa-u');
    st.hist.push({ role: 'user', text: v }); st.hist = st.hist.slice(-10);
    var msgs = st.hist.map(function (m) { return { role: m.role, text: m.text }; });
    if (msgs[0].role !== 'user') msgs.shift();
    msgs[0] = { role: 'user', text: RULES + '\n\n' + context() + '\n\nQUESTION\n' + msgs[0].text };
    st.busy = true; el.go.disabled = true; el.o.classList.add('busy'); var wait = say('thinking\u2026', 'hzsa-dim');
    window.HorizonAskAI(msgs).then(function (r) {
      wait.remove(); var reply = String(r || '').trim() || '(empty reply)';
      st.hist.push({ role: 'assistant', text: reply }); bot(reply);
    }, function (e) { wait.remove(); st.hist.pop(); say(String((e && e.message) || e || 'Failed'), 'hzsa-err'); })
      .then(function () { st.busy = false; el.go.disabled = false; el.o.classList.remove('busy'); el.log.scrollTop = el.log.scrollHeight; });
  }

  var CHIPS = [
    ['Check my setup', 'Check my setup: which settings are missing, off or worth changing right now?'],
    ['Ideas to improve', 'Give me your best ideas to improve my Horizon settings and features, most useful first.'],
    ['What can I do here?', 'What can I do on the settings page I have open, and what does each option do?']
  ];
  function hello() {
    el.log.textContent = '';
    say('Settings and features only. Ask where something is, what it does, why it is not working, or how to make it better.', 'hzsa-dim');
    var row = mk('div', 'hzsa-chips');
    CHIPS.forEach(function (c) { var b = mk('button', 'hzsa-chip', c[0]); b.type = 'button'; b.addEventListener('click', function () { ask(c[1]); }); row.appendChild(b); });
    el.log.appendChild(row);
  }

  function build() {
    if (el.o) return;
    var o = mk('div', 'hzsa-ov'); o.hidden = true;
    var sh = mk('div', 'hzsa-sheet'); sh.setAttribute('role', 'dialog'); sh.setAttribute('aria-modal', 'true'); sh.setAttribute('aria-label', 'Settings AI');
    var head = mk('div', 'hzsa-head');
    var ic = mk('span', 'hzsa-ico'); ic.innerHTML = SPARK;
    var ti = mk('div', 'hzsa-title'); ti.innerHTML = '<b>Settings AI</b><small>settings and features only</small>';
    var clr = mk('button', 'hzsa-x', '\u232B'); clr.type = 'button'; clr.setAttribute('aria-label', 'Clear this chat');
    clr.addEventListener('click', function () { st.hist = []; hello(); });
    var cl = mk('button', 'hzsa-x', '\u2715'); cl.type = 'button'; cl.setAttribute('aria-label', 'Close'); cl.addEventListener('click', function () { close(false); });
    [ic, ti, clr, cl].forEach(function (n) { head.appendChild(n); });
    el.log = mk('div', 'hzsa-log'); el.log.setAttribute('role', 'log');
    var inw = mk('div', 'hzsa-in');
    el.ta = mk('textarea', 'hzsa-ta'); el.ta.rows = 1; el.ta.placeholder = 'Ask about a setting or feature\u2026'; el.ta.spellcheck = false;
    el.go = mk('button', 'hzsa-go', 'SEND'); el.go.type = 'button'; el.go.setAttribute('aria-label', 'Send'); el.go.addEventListener('click', function () { ask(el.ta.value); });
    el.ta.addEventListener('input', function () { el.ta.style.height = 'auto'; el.ta.style.height = Math.min(96, el.ta.scrollHeight) + 'px'; });
    el.ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(el.ta.value); } });
    inw.appendChild(el.ta); inw.appendChild(el.go);
    sh.appendChild(head); sh.appendChild(el.log); sh.appendChild(inw); o.appendChild(sh);
    o.addEventListener('click', function (e) { if (e.target === o) close(false); });
    document.body.appendChild(o); el.o = o;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && st.open) close(false); });
    window.addEventListener('popstate', function () { if (st.open && !(history.state && history.state.hzsa)) { st.pushed = false; close(true); } });
    hello();
  }
  function open() {
    build(); el.o.hidden = false; st.open = true;
    if (!st.pushed) { try { history.pushState({ hzsa: 1 }, ''); st.pushed = true; } catch (e) { /* ignore */ } }
    setTimeout(function () { try { el.ta.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }, 120);
  }
  function close(fromPop) {
    if (!el.o || !st.open) return;
    el.o.hidden = true; st.open = false;
    if (st.pushed) { st.pushed = false; if (!fromPop && history.state && history.state.hzsa) { try { history.back(); } catch (e) { /* ignore */ } } }
  }

  function init() {
    var h = document.querySelector('#settingsTitle h2');
    if (!h || document.getElementById('hzSetAi')) return;
    var wrap = mk('div', 'hzsa-wrap');
    h.parentNode.insertBefore(wrap, h); wrap.appendChild(h);
    var b = mk('button', 'hzsa-btn'); b.type = 'button'; b.id = 'hzSetAi';
    b.setAttribute('aria-label', 'Settings AI: ask about your settings and features'); b.title = 'Settings AI';
    b.innerHTML = SPARK + '<span>AI</span>';
    b.addEventListener('click', open);
    wrap.appendChild(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.HorizonSettingsAI = { open: open, close: function () { close(false); } };
})();
