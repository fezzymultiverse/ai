'use strict';
(() => {
  const W = window, D = document;
  let host, listener, syncing = false, starting = false;
  const records = new Map();
  const el = (tag, text) => { const e = D.createElement(tag); if (text != null) e.textContent = text; return e; };
  const key = s => String(s || '').replace(/[\s().-]/g, '');
  const terminal = s => ['ended','failed','cancelled','not_found','handoff'].includes(s);
  function command(text) {
    const s = String(text || '').trim();
    if (/^(?:please\s+)?(?:clear|clean up|find|merge|link|remove|dedupe|deduplicate)\s+(?:(?:my|the)\s+)?(?:duplicates|duplicate (?:phone |device )?contacts)\s*(?:please)?[.!]?$/i.test(s)) return { duplicates: true };
    const m = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:call|phone|ring)\s+(.{1,120}?)(?:\s+please)?[!?]?$/iu.exec(s);
    if (!m) return null;
    let name = m[1].trim().replace(/\.$/, '');
    // V1.99.127: "Call Bastiaan for me" / "call Phil now please" must look up "Bastiaan" / "Phil", not the whole tail.
    for (let i = 0; i < 4; i++) {
      const cut = name.replace(/\s+(?:for\s+(?:me|us)|right\s+now|right\s+away|now|please|pls|thanks|thank\s+you)\s*[.!?]*$/i, '').trim();
      if (cut === name) break; name = cut;
    }
    if (!name) return null;
    // "Call any contact" / "call someone": nothing to look up, so open the contact list to choose from.
    if (/^(?:any|a|some|one|my|random)\s+(?:of\s+(?:my\s+)?)?(?:contacts?|people|person|one)$|^(?:anyone|anybody|someone|somebody|contacts?)$/i.test(name)) return { pick: true };
    if (/^\+?[0-9][0-9\s().-]{2,35}$/.test(name) && /^\+?\d{3,20}$/.test(key(name))) return { number: key(name) };
    if (!/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}\s.'’_-]*$/u.test(name) || !/\p{L}/u.test(name) || /^(?:me|them|him|her|us|it)$|^(?:a |the )/i.test(name)) return null;
    return { name };
  }
  function plugin() { return host && host.plug('HorizonContacts'); }
  function save() { if (host && host.save) host.save(); }
  function button(label, fn) {
    const b = el('button', label); b.type = 'button';
    b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await fn(); } catch (e) { if (host) host.notice(e.message || 'Call action failed.', 'error'); } finally { b.disabled = false; } };
    return b;
  }
  function repaint(info) { const rec = records.get(info.key); if (rec && rec.node) draw(rec.node, info); save(); }
  function create(info) {
    info.key = info.key || 'phone-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    if (host && host.createCall) host.createCall(info);
    else (D.getElementById('chatMessages') || D.body).append(card(info));
    return info;
  }
  const labels = {handoff:'Call placed in your phone app', lookup:'Finding contact…', choosing:'Choose the correct number', starting:'Starting call…', connecting:'Connecting…', dialing:'Calling…', ringing:'Incoming call', active:'Connected', holding:'On hold', disconnecting:'Ending call…', ended:'Call ended', failed:'Call failed', cancelled:'Call cancelled', not_found:'Contact not found', select_account:'Select the SIM in Android’s phone-account prompt'};
  function draw(node, info) {
    node.replaceChildren();
    const title = el('div'); title.className = 'art-card-tx';
    title.append(el('b', 'Calling Card · ' + (info.name || info.number || 'Private number')));
    const status = el('small', info.error || labels[info.state] || info.state || 'Call');
    status.setAttribute('role', 'status'); title.append(status);
    if (info.number && info.name) title.append(el('small', info.number));
    const actions = el('div'); actions.className = 'art-card-act';
    if (info.state === 'choosing') (info.choices || []).forEach(row => actions.append(button(row.name + ' · ' + row.number, () => begin(info, row))));
    if (info.id && !terminal(info.state)) {
      const control = action => plugin().control({id:info.id, action});
      if (info.state === 'ringing') actions.append(button('Answer', () => control('answer')), button('Decline', () => control('reject')));
      else {
        if (info.state === 'active' || info.state === 'holding') actions.append(button(info.muted ? 'Unmute' : 'Mute', () => control('mute')), button(info.speaker ? 'Speaker off' : 'Speaker', () => control('speaker')));
        actions.append(button('End call', () => control('hangup')));
      }
    }
    node.append(title, actions);
  }
  function card(info) {
    if (!info.key) info.key = 'phone-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    const node = el('article'); node.className = 'art-card hz-calling-card'; node.setAttribute('aria-label', 'Calling Card');
    records.set(info.key, {info, node}); draw(node, info); return node;
  }
  async function begin(info, row) {
    if (starting || info.id || !['lookup','choosing'].includes(info.state)) return;
    starting = true;
    info.name = row.name || info.name || ''; info.number = row.number; info.state = 'starting'; info.error = ''; delete info.choices; repaint(info);
    try {
      const p = plugin(); if (!p) throw new Error('In-chat calling requires the Android app.');
      const out = await p.dial({id:row.id || '', number:row.number});
      if (!out || !out.requested) throw new Error('No call was placed.');
      // Accepted by Telecom is not the same as connected. Live native state controls that label.
      info.requestedAt = Date.now();
      // V1.99.130: Horizon is not the default phone app, so the user's own phone app owns the call. Show the card, do not fake a live state.
      if (out.handedOff) { info.state = 'handoff'; repaint(info); return; }
      if (info.state === 'starting') { info.state = 'connecting'; repaint(info); }
      await sync();
      if (!info.id) setTimeout(() => {
        if (!info.id && !terminal(info.state)) {
          info.state = 'failed'; info.error = 'Android did not report an active call. Check Phone permission and the default phone setting.'; repaint(info);
        }
      }, 30000);
    } catch (e) { info.state = 'failed'; info.error = e.message || 'No call was placed.'; repaint(info); }
    finally { starting = false; }
  }
  async function execute(action) {
    if (starting || [...records.values()].some(r => !terminal(r.info.state) && r.info.state !== 'choosing')) { host.notice('Finish the current call first.', 'error'); return; }
    const info = create({name:action.name || '', number:action.number || '', state:'lookup'});
    try {
      const p = plugin(); if (!p) throw new Error('In-chat calling requires the Android app.');
      if (action.number) { await begin(info, {number:action.number}); return; }
      const result = await p.search({name:action.name});
      const rows = result.rows || [];
      if (!rows.length) { info.state = 'not_found'; repaint(info); }
      else if (rows.length === 1) await begin(info, rows[0]);
      else { info.state = 'choosing'; info.choices = rows; repaint(info); }
    } catch (e) { info.state = 'failed'; info.error = e.message; repaint(info); }
  }
  function receive(data, snapshot = false) {
    const live = new Set();
    for (const row of data.calls || []) {
      live.add(row.id);
      let rec = [...records.values()].find(r => r.info.id === row.id);
      if (!rec && row.number) rec = [...records.values()].find(r => !r.info.id && ['starting','connecting'].includes(r.info.state) && key(r.info.number) === key(row.number));
      if (!rec && row.state !== 'ended') {
        const info = create({id:row.id, name:row.name || '', number:row.number || '', state:row.state}); rec = records.get(info.key);
      }
      if (!rec) continue;
      const info = rec.info;
      info.id = row.id; info.state = row.state;
      if (row.number) info.number = row.number;
      if (row.name && !info.name) info.name = row.name;
      if (typeof data.muted === 'boolean') info.muted = data.muted;
      if (typeof data.speaker === 'boolean') info.speaker = data.speaker;
      repaint(info);
    }
    if (snapshot || data.full) for (const {info} of records.values()) {
      if (info.id && !terminal(info.state) && !live.has(info.id)) { info.state = 'ended'; repaint(info); }
    }
  }
  async function sync() {
    const p = plugin(); if (!p || !p.callState || syncing) return;
    syncing = true;
    try { receive(await p.callState(), true); }
    catch (_) { /* Never pretend an unavailable native call is connected. */ }
    finally { syncing = false; }
  }
  async function resume() {
    await sync();
    const p = plugin();
    if (p && p.consumeDialRequest) try {
      const out = await p.consumeDialRequest();
      if (out.number && /^\+?\d{3,20}$/.test(key(out.number))) create({number:key(out.number), state:'choosing', choices:[{name:'Call',number:key(out.number)}]});
    } catch (_) { /* No external dial request. */ }
  }
  function css() {
    if (D.getElementById('hz-dc-style')) return;
    const st = el('style'); st.id = 'hz-dc-style';
    st.textContent = [
      'dialog.hz-dc{color:#e8f6ff;background:#0a1620;border:1px solid rgba(0,229,255,.55);border-radius:20px;width:min(92vw,480px);max-height:84dvh;padding:0;overflow:hidden;box-shadow:0 0 0 1px rgba(122,44,255,.35),0 18px 50px rgba(0,0,0,.65)}',
      'dialog.hz-dc[open]{display:flex;flex-direction:column}',
      'dialog.hz-dc::backdrop{background:rgba(0,0,0,.62)}',
      '.hz-dc-head{display:flex;align-items:center;gap:10px;padding:14px 14px 10px 18px}',
      '.hz-dc-head h3{flex:1;margin:0;font:700 17px/1.2 system-ui;letter-spacing:.02em}',
      '.hz-dc-x{flex:0 0 auto;width:36px;height:36px;padding:0;border-radius:50%;border:1px solid rgba(0,229,255,.45);background:rgba(0,229,255,.08);color:#00e5ff;font:600 20px/1 system-ui;display:grid;place-items:center;cursor:pointer}',
      '.hz-dc-form{display:flex;gap:8px;padding:0 14px 10px}',
      '.hz-dc-form input{flex:1;min-width:0;box-sizing:border-box;height:42px;padding:0 14px;border-radius:999px;border:1px solid rgba(0,229,255,.4);background:#07111a;color:#fff;font:15px system-ui;outline:none}',
      '.hz-dc-form input:focus{border-color:#00e5ff;box-shadow:0 0 0 3px rgba(0,229,255,.18)}',
      '.hz-dc-go{flex:0 0 auto;height:42px;padding:0 18px;border-radius:999px;border:0;background:linear-gradient(135deg,#ff005f,#af5fff);color:#fff;font:700 14px system-ui;cursor:pointer}',
      '.hz-dc-st{margin:0;padding:0 18px 8px;font:12.5px system-ui;color:#8fb3c4;min-height:16px}',
      '.hz-dc-list{display:flex;flex-direction:column;gap:6px;padding:0 14px 8px;overflow-y:auto;-webkit-overflow-scrolling:touch;overscroll-behavior:contain;flex:1 1 auto;min-height:0}',
      '.hz-dc-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;box-sizing:border-box;padding:11px 14px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font:600 14.5px system-ui;text-align:left;cursor:pointer}',
      '.hz-dc-row:active{background:rgba(0,229,255,.14);border-color:#00e5ff}',
      '.hz-dc-row small{font:500 13px system-ui;color:#00e5ff;white-space:nowrap}',
      '.hz-dc-foot{padding:6px 14px calc(12px + env(safe-area-inset-bottom));border-top:1px solid rgba(255,255,255,.08)}',
      '.hz-dc-link{height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(175,95,255,.5);background:transparent;color:#d6b5ff;font:600 13px system-ui;cursor:pointer}'
    ].join('');
    D.head.append(st);
  }
  function open(opts = {}) {
    const plug = plugin();
    if (!plug) { if (host) host.notice('Device contacts require the Android app.', 'error'); return; }
    if (D.getElementById('hz-device-contacts')) return;
    css();
    const modal = el('dialog'), head = el('div'), title = el('h3', 'Device contacts'), closeX = el('button', '✕'), form = el('form'), input = el('input'), list = el('div'), status = el('p'), foot = el('div');
    modal.id = 'hz-device-contacts'; modal.className = 'hz-dc'; modal.setAttribute('aria-label', 'Device contacts');
    head.className = 'hz-dc-head'; closeX.type = 'button'; closeX.className = 'hz-dc-x'; closeX.setAttribute('aria-label', 'Close');
    form.className = 'hz-dc-form'; foot.className = 'hz-dc-foot';
    input.type = 'search'; input.placeholder = 'Search contacts'; input.setAttribute('aria-label', 'Contact name'); input.autocomplete = 'off'; input.value = opts.name || '';
    status.className = 'hz-dc-st'; status.setAttribute('role', 'status'); list.className = 'hz-dc-list';
    // Back button: one history entry while the box is open, so Android Back closes only this box.
    let pushed = false, gone = false;
    const onPop = () => { if (!(history.state && history.state.hzContacts)) dismiss(true); };
    function dismiss(fromPop) {
      if (gone) return; gone = true;
      W.removeEventListener('popstate', onPop);
      if (pushed && !fromPop) { try { history.back(); } catch (_) { /* nothing to step back */ } }
      pushed = false;
      try { modal.close(); } catch (_) { /* already closed */ }
      modal.remove();
    }
    let working = false;
    const run = async work => {
      if (working) return; working = true; status.textContent = 'Working…';
      try { await work(); } catch (e) { status.textContent = e.message || 'Contact action failed.'; }
      finally { working = false; }
    };
    function row(r, fn) {
      const b = el('button'); b.type = 'button'; b.className = 'hz-dc-row';
      b.append(el('span', r.name), el('small', r.number)); b.setAttribute('aria-label', r.name + ' \u00b7 ' + r.number);
      b.onclick = async () => { if (b.disabled) return; b.disabled = true; try { await fn(); } catch (e) { status.textContent = e.message || 'Contact action failed.'; } finally { b.disabled = false; } };
      return b;
    }
    const search = el('button', 'Find'); search.type = 'submit'; search.className = 'hz-dc-go';
    function find() { return run(async () => {
      list.replaceChildren(); const name = input.value.trim();
      const {rows} = await plug.search({name, browse:!name});
      status.textContent = rows.length ? 'Tap a contact to call inside Horizon.' : 'No matching contact with a callable number.';
      for (const r of rows) list.append(row(r, async () => {
        if (working || starting) return;
        dismiss(false);
        if ([...records.values()].some(x => !terminal(x.info.state) && x.info.state !== 'choosing')) { host.notice('Finish the current call first.', 'error'); return; }
        const info = create({name:r.name, number:r.number, state:'choosing'});
        await begin(info, r);
      }));
    }); }
    async function showDuplicates() {
      list.replaceChildren(); const {rows} = await plug.duplicates();
      status.textContent = rows.length ? 'Exact matches by name and number. Review and link each group; nothing is deleted.' : 'No exact duplicate phone contacts found.';
      for (const group of rows) list.append(row({name:'Link ' + group.length + ': ' + group[0].name, number:group[0].number}, () => run(async () => {
        const out = await plug.link({ids:group.map(r => r.id), number:group[0].number});
        if (out.linked) await showDuplicates(); else status.textContent = 'Link cancelled.';
      })));
    }
    const dup = el('button', 'Review duplicates'); dup.type = 'button'; dup.className = 'hz-dc-link'; dup.onclick = () => run(showDuplicates);
    closeX.onclick = () => dismiss(false);
    form.onsubmit = e => { e.preventDefault(); find(); };
    modal.addEventListener('cancel', e => { e.preventDefault(); dismiss(false); });
    modal.addEventListener('click', e => { if (e.target === modal) dismiss(false); });
    modal.addEventListener('close', () => dismiss(false));
    head.append(title, closeX); form.append(input, search); foot.append(dup);
    modal.append(head, form, status, list, foot);
    D.body.append(modal); modal.showModal();
    try { history.pushState({hzContacts:true}, ''); pushed = true; W.addEventListener('popstate', onPop); } catch (_) { /* history unavailable: the ✕ still closes it */ }
    if (opts.duplicates) run(showDuplicates); else find();
  }
  W.HorizonContacts = { init: h => {
    host = h;
    if (host.history) for (const info of host.history()) {
      if (info.key && !records.has(info.key)) {
        // No automatic redial on reload, including if a role/permission prompt was interrupted.
        if (!info.id && ['starting','connecting','lookup'].includes(info.state)) { info.state = 'ended'; info.error = 'Previous call request is no longer active.'; }
        records.set(info.key, {info, node:null});
      }
    }
    const p = plugin();
    if (!listener && p && p.addListener) listener = p.addListener('callState', data => receive(data));
    if (D.addEventListener) D.addEventListener('visibilitychange', () => { if (D.visibilityState === 'visible') resume(); });
    if (W.addEventListener) W.addEventListener('horizon-resume', resume);
    resume();
  }, command, open, execute, card };
})();
