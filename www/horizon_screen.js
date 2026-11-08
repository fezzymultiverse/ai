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
      ['Terminal', '#hzTerm:not([hidden])'],
      ['Horizon Browser', '#hzb'],
      ['AI and model picker', '#pkSheet'],
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


  /* V1.38.0: APP MAP. A short, always-current outline of the WHOLE app (closed panels, every tab,
     every settings section, switches, theme), read from the live page. Secrets stay hidden. */
  function appMap() {
    const L = ['APP MAP (the whole app, also the parts that are closed or off screen)'];
    const th = document.documentElement.getAttribute('data-accent') || 'cyan';
    L.push('Theme: ' + ({ cyan: 'Dark cyan', grey: 'Light grey' }[th] || 'Dark cyan') + ' (the two dots, Dark cyan and Light grey, are under the Settings title in the right panel, or Settings > PERSONALISATION). Only these two themes exist.');
    const open = [];
    if ($('#leftPanel.open')) open.push('Menu panel');
    if ($('#rightPanel.open')) open.push('Settings panel');
    L.push('Panels open now: ' + (open.length ? open.join(', ') : 'none (chat only)'));
    const hb = [...document.querySelectorAll('.app-header .header-btn')].map(b => clean(b.getAttribute('aria-label') || b.title, 40)).filter(Boolean);
    if (hb.length) L.push('Header buttons: ' + hb.join(' | '));
    const lt = [...document.querySelectorAll('#leftPanel > .tabbar .tab')].map(t => clean(t.textContent, 30)).filter(Boolean);
    if (lt.length) L.push('Menu panel (left) tabs: ' + lt.join(', '));
    const rows = [...document.querySelectorAll('#settingsHome .set-row')];
    rows.forEach(r => {
      const h = r.querySelector('h3'), pp = r.querySelector('p'), tab = r.getAttribute('data-tab');
      if (!h) return;
      let line = 'Settings > ' + clean(h.textContent, 40) + ': ' + clean(pp && pp.textContent, 110);
      if (tab && tab !== 'vault') {
        const body = document.querySelector('#rightPanel .tab-body[data-tab="' + tab + '"]');
        if (body && !blocked(body)) {
          const hs = [];
          body.querySelectorAll('h3,h4').forEach(e => { if (hs.length < 6 && !blocked(e)) { const t = clean(e.textContent, 34); if (t && hs.indexOf(t) < 0) hs.push(t); } });
          if (hs.length) line += ' [inside: ' + hs.join(', ') + ']';
        }
      }
      L.push(line);
    });
    const sw = [];
    document.querySelectorAll('#rightPanel [role="switch"], #rightPanel input[type="checkbox"]').forEach(e => {
      if (sw.length >= 16 || blocked(e) || isSecret(e)) return;
      const lab = e.getAttribute('aria-label') || (e.labels && e.labels[0] && e.labels[0].textContent) || (e.closest('.perm-row,.tm-row,label,.acc-row') || {}).textContent || '';
      const st = e.getAttribute('aria-checked') != null ? e.getAttribute('aria-checked') === 'true' : !!e.checked;
      const n = clean(lab, 34); if (n) sw.push(n + ' ' + (st ? 'on' : 'off'));
    });
    if (sw.length) L.push('Settings switches: ' + sw.join(', '));
    const ap = [...document.querySelectorAll('#hzDock .hz-app')].map(b => clean(b.textContent || b.getAttribute('aria-label'), 24)).filter(Boolean);
    if (ap.length) L.push('APPS dock (right panel, bottom): ' + ap.join(', ') + '. Also ABOUT & UPDATES and USAGE & ENGINE rows above it.');
    const sn = document.getElementById('snoozeBtn');
    if (sn) L.push('Snooze (network and permissions off): ' + (sn.getAttribute('aria-pressed') === 'true' ? 'ON, Horizon is offline' : 'off'));
    const say = (label, sel, n) => { const e = $(sel); const t = e && !e.hidden ? clean(e.textContent, n || 90) : ''; if (t) L.push(label + ': ' + t); };
    const cl = document.querySelectorAll('#chatList > *').length;
    L.push('Menu data: ' + cl + ' chat rows' + ($('#memStatus') ? ', memories ' + clean($('#memStatus').textContent, 24) : '') + ($('#artTitle') ? ', ' + clean($('#artTitle').textContent, 24) : ''));
    say('Engine badge', '#hzBadge', 90);
    say('Now playing', '#mpNow', 110);
    say('Downloads tray', '#dlSummary', 80);
    say('DASH widget (time, weather, device)', '#hzDash', 200);
    if ($('#hzb') && onscreen($('#hzb'))) L.push('The Horizon browser is open.');
    if ($('#hzTerm') && onscreen($('#hzTerm'))) L.push('The Terminal is open.');
    if (window.HorizonVault && HorizonVault.summary) L.push(HorizonVault.summary());
    return L.join('\n').slice(0, 4400);
  }

  function block() {
    if (!on()) return 'SCREEN VIEW\nSwitched off (the + menu, Screen). You cannot see the app screen. If Fezzy asks what is on it, tell him to switch Screen on.';
    const L = [];
    L.push('SCREEN VIEW\nA live look at the Horizon app, taken as Fezzy sent this message. Use it to know what he is looking at, what just happened and which button to point him to. Keys, tokens, passwords and Vault secrets are hidden on purpose: never ask to see them and never guess them. Vault notes are in the VAULT NOTES block and chat text is already in this conversation.');
    const t = top();
    L.push('Top layer: ' + t.name);
    const comp = $('#statusText');
    L.push('Composer status: ' + clean(comp && comp.textContent, 120) + ' | ' + (document.getElementById('sendBtn') && document.getElementById('sendBtn').classList.contains('stop') ? 'AI is working now' : 'idle'));
    const ld = document.getElementById('loadingBubble');
    if (ld) L.push('Loading line: ' + clean(ld.textContent, 100));
    const sw = [...document.querySelectorAll('#toolMenu .tm-row[role="switch"]')].map(r => { const h = r.querySelector('h4'); return (h ? h.textContent : r.id) + ' ' + (r.getAttribute('aria-checked') === 'true' ? 'on' : 'off'); });
    if (sw.length) L.push('Tool switches: ' + sw.join(', '));
    try { L.push(appMap()); } catch (e) { /* map is a bonus: never break the message */ }
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
