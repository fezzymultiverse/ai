/* Horizon V1.16.0: lets the AI see what is on screen (layout, switches, buttons, notices).
   Keys, tokens, passwords, the Vault and chat bodies are never read. */
(function () {
  'use strict';
  const LSK = 'horizon_screen_ai';
  const on = () => { try { return localStorage.getItem(LSK) !== '0'; } catch (e) { return true; } };
  const setOn = v => { try { localStorage.setItem(LSK, v ? '1' : '0'); } catch (e) {} };
  const $ = s => document.querySelector(s);
  const SECRET_ATTR = /key|token|secret|passw|passphrase|\bpat\b|ssh|auth|bearer|credential|cookie|private|pin\b/i;
  const SECRET_TXT = /AIza[\w-]{20,}|gsk_[\w]{20,}|gh[pousr]_[\w]{20,}|github_pat_[\w]{20,}|sk-[\w-]{20,}|-----BEGIN[\s\S]*?(?:-----END[^-]*-----|$)|[A-Za-z0-9+/_=-]{36,}/g;
  const BLOCK = '#chatMessages, #chatInput, .tab-body[data-tab="vault"], [data-hz-private], #attInput, .att-pv';
  const clean = (s, n) => String(s || '').replace(SECRET_TXT, '[hidden]').replace(/\s+/g, ' ').trim().slice(0, n || 80);

  const onscreen = e => {
    if (!e || e.hidden || !e.isConnected) return false;
    const r = e.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return false;
    const vw = innerWidth, vh = innerHeight;
    return r.right > 8 && r.left < vw - 8 && r.bottom > 8 && r.top < vh - 8 && getComputedStyle(e).visibility !== 'hidden';
  };
  const blocked = e => !!(e.closest && e.closest(BLOCK)) || e.hasAttribute && e.hasAttribute('data-hz-private');
  const isSecret = e => {
    if (e.type === 'password') return true;
    const lab = e.labels && e.labels[0] ? e.labels[0].textContent : '';
    return SECRET_ATTR.test([e.id, e.name, e.getAttribute('aria-label'), e.placeholder, e.getAttribute('autocomplete'), lab].join(' '));
  };
  const nameOf = e => clean(e.getAttribute('aria-label') || e.title || e.textContent || e.value || '', 48);

  function top() {
    const layers = [
      ['Music/GitHub/YouTube/Lens add-on window', '#hzExtensionWindow'],
      ['AI EXTENSION ADD ONS panel', '#hzAddons'],
      ['Settings panel (right)', '#rightPanel.open'],
      ['Menu panel (left)', '#leftPanel.open']
    ];
    for (const [name, sel] of layers) { const e = $(sel); if (onscreen(e)) return { name, e }; }
    return { name: 'Chat screen', e: null };
  }

  function controls(root) {
    const out = [], seen = new Set();
    root.querySelectorAll('button,[role="tab"],[role="switch"],[role="button"],select,input:not([type=hidden]):not([type=file]),textarea,a[href]').forEach(e => {
      if (out.length >= 36 || !onscreen(e) || blocked(e)) return;
      let n = nameOf(e);
      if (e.matches('select,input,textarea') && !n) n = clean(e.getAttribute('aria-label') || e.placeholder || e.id, 40);
      if (!n) return;
      let st = '';
      if (e.matches('select')) st = ' = ' + clean(e.options[e.selectedIndex] && e.options[e.selectedIndex].text, 40);
      else if (e.matches('textarea')) st = isSecret(e) ? ' (hidden)' : ` (text box, ${e.value.length} characters)`;
      else if (e.matches('input')) st = isSecret(e) ? ' (hidden)' : (e.type === 'checkbox' || e.type === 'radio' ? (e.checked ? ' (on)' : ' (off)') : (e.value ? ' = ' + clean(e.value, 40) : ' (empty)'));
      const as = e.getAttribute('aria-selected'), ac = e.getAttribute('aria-checked'), ap = e.getAttribute('aria-pressed');
      if (as === 'true') st += ' (selected)'; if (ac) st += ac === 'true' ? ' (on)' : ' (off)'; if (ap) st += ap === 'true' ? ' (pressed)' : '';
      if (e.disabled) st += ' (disabled)';
      const k = n + st; if (seen.has(k)) return; seen.add(k); out.push(k);
    });
    return out;
  }
  function headings(root) {
    const out = [];
    root.querySelectorAll('h1,h2,h3,h4,.tm-head b,.hint,.panel-foot,.tm-note').forEach(e => {
      if (out.length >= 14 || !onscreen(e) || blocked(e)) return;
      const t = clean(e.textContent, 110); if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  function block() {
    if (!on()) return 'SCREEN VIEW\nSwitched off (the + menu, Screen). You cannot see the app screen. If Fezzy asks what is on it, tell him to switch Screen on.';
    const L = [];
    L.push('SCREEN VIEW\nA live look at the Horizon app, taken as Fezzy sent this message. Use it to know what he is looking at, what just happened and which button to point him to. Keys, tokens, passwords, the Vault and chat text are hidden on purpose: never ask to see them and never guess them.');
    const t = top();
    L.push('Top layer: ' + t.name);
    const comp = $('#statusText');
    L.push('Composer status: ' + clean(comp && comp.textContent, 120) + ' | ' + (document.getElementById('sendBtn') && document.getElementById('sendBtn').classList.contains('stop') ? 'AI is working now' : 'idle'));
    const ld = document.getElementById('loadingBubble');
    if (ld) L.push('Loading line: ' + clean(ld.textContent, 100));
    const sw = [...document.querySelectorAll('#toolMenu .tm-row[role="switch"]')].map(r => { const h = r.querySelector('h4'); return (h ? h.textContent : r.id) + ' ' + (r.getAttribute('aria-checked') === 'true' ? 'on' : 'off'); });
    if (sw.length) L.push('Tool switches: ' + sw.join(', '));
    const tm = document.getElementById('toolMenu');
    if (tm && !tm.hidden) L.push('The + tools menu is open.');
    const att = document.getElementById('attTray');
    if (att && !att.hidden) L.push('Files waiting in the attach tray: ' + [...att.querySelectorAll('.att-name')].map(n => clean(n.textContent, 40)).join(', '));
    const ns = [...document.querySelectorAll('#chatMessages .notice')].slice(-5).map(n => (n.classList.contains('error') ? 'ERROR: ' : '') + clean(n.textContent, 120));
    if (ns.length) L.push('Recent notices (newest last): ' + ns.join(' || '));
    if (t.e) {
      const h = headings(t.e); if (h.length) L.push('Visible text: ' + h.join(' | '));
      const c = controls(t.e); if (c.length) L.push('Visible controls: ' + c.join(' ; '));
    } else {
      const c = controls(document.querySelector('main') || document.body);
      if (c.length) L.push('Visible controls: ' + c.join(' ; '));
    }
    return L.join('\n');
  }
  window.HorizonScreen = { on, setOn, block };
})();
