'use strict';
(() => {
  const W = window, D = document, authOrigin = 'https://enter.pollinations.ai';
  const model = 'black-forest-labs/flux.1-schnell';
  let key = '', db, host;
  const webFetch = (url, init) => (W.CapacitorWebFetch || W.fetch).call(W, url, init);
  const urlFor = (text, seed) => 'https://gen.pollinations.ai/image/' + encodeURIComponent(text) + '?' + new URLSearchParams({ model, seed, width: 768, height: 768 });
  const openDb = () => db || (db = new Promise((resolve, reject) => {
    const req = indexedDB.open('horizon-generated-images', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('images');
    req.onerror = () => reject(new Error('Horizon could not open image storage.'));
    req.onsuccess = () => resolve(req.result);
  }));
  async function cached(id, blob) {
    const storeDb = await openDb();
    return new Promise((resolve, reject) => {
      const tx = storeDb.transaction('images', blob ? 'readwrite' : 'readonly');
      const store = tx.objectStore('images');
      const req = blob ? store.put(blob, id) : store.get(id);
      tx.oncomplete = () => resolve(req.result);
      tx.onabort = () => reject(new Error('Horizon could not access the saved image.'));
    });
  }
  async function generate(text, seed, signal) {
    if (!key) throw new Error('Connect Pollinations before drawing.');
    const res = await webFetch(urlFor(text, seed), { headers: { Authorization: 'Bearer ' + key }, redirect: 'error', signal });
    if (res.status === 401) { key = ''; throw new Error('Pollinations authorization expired. Reconnect and try again.'); }
    if (res.status === 403) { key = ''; throw new Error('Pollinations denied this image request. Reconnect and allow image models.'); }
    if (res.status === 402) throw new Error('Pollinations balance is too low for this image.');
    if (res.status === 429) throw new Error('Pollinations is rate-limiting image requests. Try again shortly.');
    if (!res.ok) throw new Error('Pollinations image generation failed (HTTP ' + res.status + ').');
    const blob = await res.blob();
    if (!/^image\/(?:png|jpeg|webp)$/.test(blob.type) || blob.size < 100 || blob.size > 20 * 1024 * 1024) throw new Error('Pollinations did not return a supported image.');
    return blob;
  }
  async function request(path, data, signal) {
    const res = await webFetch(authOrigin + path, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data), signal });
    const payload = await res.json();
    if (!res.ok && !payload.error) throw new Error('Pollinations authorization is unavailable.');
    return payload;
  }
  function connect() {
    if (key) return Promise.resolve(true);
    if (D.getElementById('hz-poll-connect')) return Promise.resolve(false);
    const modal = D.createElement('dialog'), head = D.createElement('h3'), msg = D.createElement('p'), start = D.createElement('button'), close = D.createElement('button'), link = D.createElement('a');
    modal.id = 'hz-poll-connect'; modal.setAttribute('aria-label', 'Connect Pollinations');
    modal.style.cssText = 'color:inherit;background:#10202a;border:1px solid #456;border-radius:14px;max-width:85vw;padding:16px';
    head.textContent = 'Connect Pollinations';
    msg.textContent = 'Authorize image generation with your Pollinations account. Prompts are sent to Pollinations and images may use your Pollen balance. This connection lasts until Horizon reloads.';
    start.type = close.type = 'button'; start.textContent = 'Get authorization code'; close.textContent = 'Cancel';
    link.target = '_blank'; link.rel = 'noopener noreferrer'; link.hidden = true; link.textContent = 'Open Pollinations to authorize';
    link.onclick = e => {
      const bridge = host && host.plug('HorizonAI');
      if (!bridge) return;
      e.preventDefault();
      bridge.openLink({ url: link.href }).catch(() => { msg.textContent = 'Could not open the browser. Open enter.pollinations.ai/device on another device and use the authorization code shown above.'; msg.prepend(link.dataset.code + ' · '); });
    };
    close.onclick = () => modal.close(); modal.append(head, msg, start, link, close); D.body.append(modal); modal.showModal();
    const control = new AbortController();
    return new Promise(resolve => {
      modal.addEventListener('close', () => { control.abort(); modal.remove(); resolve(!!key); }, {once:true});
      start.onclick = async () => {
        start.disabled = true;
        try {
          const code = await request('/api/device/code', {}, control.signal);
          if (!code.device_code || !code.user_code) throw new Error('Pollinations could not issue an authorization code.');
          const uri = new URL(code.verification_uri_complete || '/device', authOrigin);
          if (uri.origin !== authOrigin || uri.pathname !== '/device') throw new Error('Invalid Pollinations authorization address.');
          msg.textContent = 'Code: ' + code.user_code + '. Open Pollinations, confirm the code, and allow image generation. Horizon will continue here once authorized.';
          link.href = uri.href; link.dataset.code = code.user_code; link.hidden = false; start.hidden = true;
          const end = Date.now() + Math.min(1800, Math.max(1, Number(code.expires_in) || 1800)) * 1000;
          let interval = Math.max(5, Number(code.interval) || 5) * 1000;
          while (!control.signal.aborted && Date.now() < end) {
            await new Promise(r => setTimeout(r, interval));
            if (control.signal.aborted || Date.now() >= end) break;
            const out = await request('/api/device/token', {device_code:code.device_code}, control.signal);
            if (typeof out.access_token === 'string' && out.access_token) { key = out.access_token; modal.close(); return; }
            if (out.error === 'slow_down') interval += 5000;
            else if (out.error !== 'authorization_pending') throw new Error('Pollinations authorization ended. Start again to reconnect.');
          }
          if (!control.signal.aborted) throw new Error('The authorization code expired. Start again to reconnect.');
        } catch (e) {
          if (control.signal.aborted) return;
          msg.textContent = e instanceof TypeError ? 'Could not reach Pollinations. Check your connection.' : e.message;
          link.hidden = true; start.hidden = false; start.disabled = false;
        }
      };
    });
  }
  W.HorizonPollImage = { init: h => { host = h; }, urlFor, connect, generate, cached };
})();
