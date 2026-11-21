/* V1.99.62: bounded native HTTP for documented AI endpoints. No global fetch override.
 * Uses CapacitorHttp to avoid the older HorizonAI host list; never forwards credentials on redirects.
 * Public relay content is not private. No payment or x402 negotiation is implemented.
 */
(function () {
  'use strict';
  var paths = {
    'generativelanguage.googleapis.com': /^\/v1beta\/models(?:\/[A-Za-z0-9._%-]+:generateContent)?\/?$/,
    'api.cohere.com': /^\/(?:v1\/models|v2\/chat)\/?$/,
    'api.mistral.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'openrouter.ai': /^\/api\/v1\/(?:models|chat\/completions|auth\/key)\/?$/,
    'api.routeway.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'api.unorouter.com': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'router.requesty.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'api.z.ai': /^\/api\/paas\/v4\/(?:models|chat\/completions)\/?$/,
    'api.aionlabs.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'api.iteracompute.com': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'api.opentyphoon.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'tokenharbor.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'zro.moonmath.ai': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'apihub.agnes-ai.com': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'api.gonkarouter.io': /^\/v1\/(?:models|chat\/completions)\/?$/,
    'proxy.gonkabroker.com': /^\/v1\/(?:models|messages)\/?$/,
    'api.groq.com': /^\/openai\/v1\/(models|chat\/completions)\/?$/,
    'ai-gateway.kilo.ai': /^\/api\/v1\/(models|chat\/completions)\/?$/,
    'oai.endpoints.kepler.ai.cloud.ovh.net': /^\/v1\/(models|chat\/completions)\/?$/,
    'ch.at': /^\/v1\/(models|chat\/completions)\/?$/,
    'blockrun.ai': /^\/api\/v1\/(models|chat\/completions)\/?$/,
    'oai.aihorde.net': /^\/v1\/(models|chat\/completions)\/?$/,
    'mlvoca.com': /^\/api\/(generate|tags)\/?$/,
    'api.llm7.io': /^\/v1\/(models|chat\/completions)\/?$/,
    'api.free.ai': /^\/v1\/(models|chat(\/completions)?)\/?$/,
    'api.cloudflare.com': /^\/client\/v4\/accounts\/[a-f0-9]{32}\/ai\/(v1\/chat\/completions|models\/search)\/?$/i,
    'text.pollinations.ai': /^\/(openai|models)\/?$/
  };
  // V1.99.131: Horizon Worker. The user's own Cloudflare Worker lives at NAME.SUBDOMAIN.workers.dev, so the host cannot be listed one by one.
  // Only that suffix, only the two OpenAI-style paths, https and port 443 only.
  var WORKERS_HOST = /^[a-z0-9][a-z0-9-]*(?:\.[a-z0-9][a-z0-9-]*)?\.workers\.dev$/;
  var WORKERS_PATH = /^\/v1\/(models|chat\/completions)\/?$/;
  function isWorkerHost(h) { return WORKERS_HOST.test(h); }
  function accepts(raw) {
    try {
      var u = new URL(raw);
      if (u.username || u.password || u.hash) return false;
      if (u.protocol === 'https:' && (!u.port || u.port === '443') && isWorkerHost(u.hostname)) return WORKERS_PATH.test(u.pathname);
      return u.protocol === 'https:' && (!u.port || u.port === '443') && !!paths[u.hostname] && paths[u.hostname].test(u.pathname);
    } catch (_) { return false; }
  }
  // V1.99.105: slow shared hosts get longer than 18 seconds. mlvoca runs on shared hardware and a thinking model (deepseek-r1:1.5b) needs well over 18s.
  var slowPost = { 'mlvoca.com': 110000, 'api.free.ai': 60000 };
  function deadlineFor(url, method) {
    var host = ''; try { host = new URL(url).hostname; } catch (_) { host = ''; }
    if (/^(GET|HEAD)$/i.test(method || 'GET')) return slowPost[host] ? 15000 : isWorkerHost(host) ? 10000 : 6000;
    return slowPost[host] || (isWorkerHost(host) ? 60000 : 18000);   // V1.99.131: a 70B or reasoning model on Workers AI can take longer than 18 s
  }
  function timeoutError(ms) { var e = new Error('AI endpoint timed out after ' + Math.round((ms || 18000) / 1000) + ' seconds. Nothing was switched; retry or choose another model manually.'); e.status = 504; e.rescue = true; return e; }
  // V1.99.66: resolve CapacitorHttp without registering it twice (a second registerPlugin only logs a warning and returns the first proxy).
  function nativeHttp() {
    var cap = window.Capacitor;
    if (!(cap && cap.isNativePlatform && cap.isNativePlatform())) return null;
    var h = (cap.Plugins && cap.Plugins.CapacitorHttp) || window.CapacitorHttp || null;
    if (!h && typeof cap.registerPlugin === 'function') { try { h = cap.registerPlugin('CapacitorHttp'); } catch (_) { h = null; } }
    return h && typeof h.request === 'function' ? h : null;
  }
  // A Response constructor throws when a body is given with a "null body" status (101, 204, 205, 304).
  function makeResponse(r) {
    var status = Number(r && r.status) || 0;
    var hdrs = {}, src = (r && r.headers) || {};
    Object.keys(src).forEach(function (k) { if (typeof src[k] === 'string') hdrs[k] = src[k]; });
    var hasCT = Object.keys(hdrs).some(function (k) { return k.toLowerCase() === 'content-type'; });
    if (!hasCT) hdrs['Content-Type'] = 'application/json';
    var nullBody = status === 101 || status === 204 || status === 205 || status === 304;
    var body = r && r.data != null ? (typeof r.data === 'string' ? r.data : JSON.stringify(r.data)) : '';
    if (status < 200 || status > 599) { status = status === 0 ? 599 : 500; }   // Response only accepts 200-599
    return new Response(nullBody ? null : body, { status: status, headers: hdrs });
  }
  function nativeError(e) {
    var m = String((e && (e.message || e.errorMessage)) || e || 'network error');
    if (/cleartext/i.test(m)) m = 'Android blocked plain HTTP to this address. Only 127.0.0.1 is allowed; rebuild the app with scripts/install_native.sh applied. (' + m + ')';
    var err = new Error(m); err.status = 0; err.network = true; return err;
  }
  async function request(url, opt) {
    if (!accepts(url)) throw new Error('Endpoint is not in the Horizon AI transport policy');
    opt = opt || {};
    var http = nativeHttp();
    var deadlineMs = deadlineFor(url, opt.method);
    var ctl = typeof AbortController !== 'undefined' ? new AbortController() : null, timer, onAbort;
    var hd = Object.assign({}, opt.headers || {});
    if (hd.Authorization === 'Bearer anonymous' || hd.Authorization === 'Bearer unused' || hd.Authorization === 'Bearer free') delete hd.Authorization;
    try {
      var work;
      if (http) {
        var data = opt.body;
        if (typeof data === 'string' && data && /application\/json/i.test(hd['Content-Type'] || hd['content-type'] || '')) {
          try { data = JSON.parse(data); } catch (_) { /* send the text as it is */ }
        }
        var method = String(opt.method || 'GET').toUpperCase();
        var spec = { url: url, method: method, headers: hd, connectTimeout: 6000, readTimeout: deadlineMs, responseType: 'text', disableRedirects: true };
        if (method !== 'GET' && method !== 'HEAD' && data !== undefined && data !== '') spec.data = data;
        work = http.request(spec).then(makeResponse, function (e) { throw nativeError(e); });
      } else {
        work = fetch(url, Object.assign({}, opt, { headers: hd, signal: ctl ? ctl.signal : opt.signal, redirect: 'error' }));
      }
      var deadline = new Promise(function (_, reject) {
        timer = setTimeout(function () { if (ctl) ctl.abort(); reject(timeoutError(deadlineMs)); }, deadlineMs);
        onAbort = function () { if (ctl) ctl.abort(); var e = new Error('Stopped'); e.stopped = true; reject(e); };
        if (opt.signal) { if (opt.signal.aborted) onAbort(); else opt.signal.addEventListener('abort', onAbort, { once: true }); }
      });
      return await Promise.race([work, deadline]);
    } finally { clearTimeout(timer); if (opt.signal && onAbort) opt.signal.removeEventListener('abort', onAbort); }
  }
  window.HorizonNet = { accepts: accepts, request: request };
})();
