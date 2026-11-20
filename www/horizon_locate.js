/* HORIZON V1.99.73 · WHERE YOU ARE (keyless: GPS + IP + place name).
 * One tracker that answers "where exactly am I right now" for the AI and for you.
 *   1. GPS     window.HzGeo (the shared helper, one permission prompt, never asked in the background).
 *   2. IP      ipwho.is, then ipapi.co, then geojs.io, then ipinfo.io (no key, no account). City level only.
 *   3. NAME    the coordinates are turned into street / suburb / city / region / country with Photon reverse,
 *              then OSM Nominatim reverse, then BigDataCloud (all keyless). With no GPS the IP position is named instead.
 * What it feeds:
 *   - the AI: HorizonWhere.block() is added to the native tool contract (horizon_toolpolicy.js), so the AI can say where you are
 *     and knows which areas to link a place to before it asks for directions. The switch in the card turns this off.
 *   - Maps: HorizonWhere.bias() is the search bias, so "Shoprite" means the one in your area, not one in another country.
 *   - the card "WHERE YOU ARE" at the top of the Maps window, above the map (V1.99.75: moved out of the right panel).
 * Nothing is saved except the switch. The IP, coordinates and names live in memory only. It never opens another app. */
(function () {
  'use strict';
  var KEY_AI = 'horizon_where_ai';       // '0' = do not tell the AI where I am
  var FRESH = 4 * 60 * 1000, STALE_AI = 12 * 60 * 1000;
  var S = { w: null, at: 0, busy: null, err: '', gps: 'unknown', tick: 0 };
  var refs = {};

  function $(s) { return document.querySelector(s); }
  function el(tag, cls, txt) { var n = document.createElement(tag); if (cls) n.className = cls; if (txt != null) n.textContent = txt; return n; }
  function lsg(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lss(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } }
  function clip(s, n) { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function num(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }
  function aiOn() { return lsg(KEY_AI) !== '0'; }

  function fetchJSON(url, ms) {
    var ctl = typeof AbortController === 'function' ? new AbortController() : null;
    var to = setTimeout(function () { if (ctl) ctl.abort(); }, ms || 9000);
    return fetch(url, ctl ? { signal: ctl.signal } : {}).then(function (r) {
      clearTimeout(to);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(to); throw e; });
  }
  function haversine(a, b) {
    var R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m < 10000 ? (m / 1000).toFixed(1) : Math.round(m / 1000)) + ' km'; }
  function countryName(cc) {
    try { if (cc && typeof Intl !== 'undefined' && Intl.DisplayNames) return new Intl.DisplayNames(['en'], { type: 'region' }).of(String(cc).toUpperCase()) || cc; } catch (e) { /* fall through */ }
    return cc || '';
  }
  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 45) return 'just now';
    var m = Math.round(s / 60);
    return m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago';
  }
  function uniq(a) { var seen = {}, out = []; a.forEach(function (x) { x = String(x || '').trim(); var k = x.toLowerCase(); if (x && !seen[k]) { seen[k] = 1; out.push(x); } }); return out; }

  /* ---------- 1. GPS ---------- */
  function gpsGet(ask, force) {
    if (!window.HzGeo) return Promise.resolve(null);
    if (force) { try { window.HzGeo.forget(); } catch (e) { /* ignore */ } }
    return window.HzGeo.get(!!ask).then(function (r) {
      if (r && typeof r.lat === 'number' && typeof r.lon === 'number') { S.gps = 'on'; return r; }
      S.gps = r && r.err === 1 ? 'denied' : r && r.err === 4 ? 'paused' : r && r.err === 2 ? 'off' : 'none';
      return null;
    }, function () { S.gps = 'none'; return null; });
  }

  /* ---------- 2. IP (keyless, four services, first answer wins) ---------- */
  function ipLookup() {
    return fetchJSON('https://ipwho.is/', 9000).then(function (j) {
      if (!j || j.success === false || !j.ip) throw new Error('no answer');
      return { ip: j.ip, city: j.city || '', region: j.region || '', country: j.country || '', cc: j.country_code || '', lat: num(j.latitude), lon: num(j.longitude),
        isp: (j.connection && (j.connection.isp || j.connection.org)) || '', tz: (j.timezone && j.timezone.id) || '', postal: j.postal || '', via: 'ipwho.is' };
    }).catch(function () {
      return fetchJSON('https://ipapi.co/json/', 9000).then(function (j) {
        if (!j || j.error || !j.ip) throw new Error('no answer');
        return { ip: j.ip, city: j.city || '', region: j.region || '', country: j.country_name || '', cc: j.country_code || '', lat: num(j.latitude), lon: num(j.longitude),
          isp: j.org || '', tz: j.timezone || '', postal: j.postal || '', via: 'ipapi.co' };
      });
    }).catch(function () {
      return fetchJSON('https://get.geojs.io/v1/ip/geo.json', 9000).then(function (j) {
        if (!j || !j.ip) throw new Error('no answer');
        return { ip: j.ip, city: j.city || '', region: j.region || '', country: j.country || '', cc: j.country_code || '', lat: num(j.latitude), lon: num(j.longitude),
          isp: j.organization_name || '', tz: j.timezone || '', postal: '', via: 'geojs.io' };
      });
    }).catch(function () {
      return fetchJSON('https://ipinfo.io/json', 9000).then(function (j) {
        if (!j || !j.ip) throw new Error('no answer');
        var ll = String(j.loc || '').split(',');
        return { ip: j.ip, city: j.city || '', region: j.region || '', country: countryName(j.country), cc: j.country || '', lat: num(ll[0]), lon: num(ll[1]),
          isp: j.org || '', tz: j.timezone || '', postal: j.postal || '', via: 'ipinfo.io' };
      });
    });
  }

  /* ---------- 3. name the coordinates ---------- */
  function viaPhoton(p) {
    return fetchJSON('https://photon.komoot.io/reverse?lat=' + p.lat + '&lon=' + p.lon + '&lang=en&limit=1', 7000).then(function (j) {
      var f = j && j.features && j.features[0], a = f && f.properties;
      if (!a) throw new Error('none');
      var r = { road: a.street ? (a.housenumber ? a.housenumber + ' ' : '') + a.street : (a.name || ''), suburb: a.district || a.locality || '', city: a.city || a.county || '',
        region: a.state || '', country: a.country || '', cc: a.countrycode || '', postcode: a.postcode || '' };
      if (!r.suburb && !r.city && !r.road) throw new Error('none');
      return r;
    });
  }
  function viaNominatim(p) {
    return fetchJSON('https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=en&lat=' + p.lat + '&lon=' + p.lon, 8000).then(function (j) {
      var a = j && j.address;
      if (!a) throw new Error('none');
      var r = { road: a.road ? (a.house_number ? a.house_number + ' ' : '') + a.road : '', suburb: a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet || '',
        city: a.city || a.town || a.municipality || a.county || '', region: a.state || a.province || '', country: a.country || '', cc: a.country_code || '', postcode: a.postcode || '' };
      if (!r.suburb && !r.city && !r.road) throw new Error('none');
      return r;
    });
  }
  function viaBigData(p) {
    return fetchJSON('https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + p.lat.toFixed(4) + '&longitude=' + p.lon.toFixed(4) + '&localityLanguage=en', 8000).then(function (j) {
      if (!j || (!j.locality && !j.city)) throw new Error('none');
      return { road: '', suburb: j.locality && j.locality !== j.city ? j.locality : '', city: j.city || j.locality || '', region: j.principalSubdivision || '', country: j.countryName || '', cc: j.countryCode || '', postcode: j.postcode || '' };
    });
  }
  function nameOf(p) {
    return viaPhoton(p).catch(function () { return viaNominatim(p); }).catch(function () { return viaBigData(p); }).catch(function () { return null; });
  }

  /* ---------- the resolved position ---------- */
  function build(g, ip, nm) {
    var gps = g && typeof g.lat === 'number', ipOk = ip && ip.lat != null && ip.lon != null;
    var w = { at: Date.now(), src: gps ? 'GPS' : 'IP', lat: gps ? g.lat : (ipOk ? ip.lat : null), lon: gps ? g.lon : (ipOk ? ip.lon : null), acc: gps && typeof g.acc === 'number' ? g.acc : null,
      road: '', suburb: '', city: '', region: '', country: '', cc: '', postcode: '', ip: ip ? ip.ip : '', isp: ip ? ip.isp : '', tz: ip ? ip.tz : '', ipPlace: '', note: '' };
    if (ip) w.ipPlace = uniq([ip.city, ip.region]).join(', ') || ip.country || '';
    if (nm) { w.road = nm.road; w.suburb = nm.suburb; w.city = nm.city; w.region = nm.region; w.country = nm.country; w.cc = nm.cc; w.postcode = nm.postcode; }
    else if (!gps && ip) { w.city = ip.city; w.region = ip.region; w.country = ip.country; w.cc = ip.cc; w.postcode = ip.postal; }
    if (!w.country && w.cc) w.country = countryName(w.cc);
    if (w.src === 'IP') w.suburb = ''; // an IP never knows the street or suburb: do not pass a guess off as one
    if (w.src === 'IP') w.road = '';
    w.place = uniq([w.suburb, w.city]).join(', ') || uniq([w.city, w.region]).join(', ') || w.country || (w.lat != null ? w.lat.toFixed(4) + ', ' + w.lon.toFixed(4) : '');
    if (gps && ipOk) {
      var far = haversine({ lat: g.lat, lon: g.lon }, { lat: ip.lat, lon: ip.lon });
      if (far > 60000) w.note = 'The IP address points ' + fmtDist(far) + ' away (' + (w.ipPlace || 'another place') + '): a VPN or the mobile carrier gateway. GPS is the real position.';
    } else if (!gps) {
      w.note = S.gps === 'denied' ? 'GPS is not allowed for Horizon, so this is the IP position (city level, can be off by many km).'
        : S.gps === 'paused' ? 'Location is paused while Horizon is snoozed, so this is the IP position (city level).'
        : S.gps === 'off' ? 'Location is switched off on the phone, so this is the IP position (city level).'
        : 'No GPS fix yet, so this is the IP position (city level, can be off by many km).';
    }
    return w;
  }

  /* get(force, ask): force = look again now; ask = allow the Android permission prompt (only from a tap). */
  function get(force, ask) {
    if (S.busy) return S.busy;
    if (!force && S.w && Date.now() - S.at < FRESH) return Promise.resolve(S.w);
    S.err = ''; paint();
    S.busy = Promise.all([gpsGet(ask, force), ipLookup().catch(function () { return null; })]).then(function (r) {
      var g = r[0], ip = r[1], pt = null;
      if (g) pt = { lat: g.lat, lon: g.lon };
      else if (ip && ip.lat != null && ip.lon != null) pt = { lat: ip.lat, lon: ip.lon };
      if (!pt) throw new Error(navigator.onLine === false ? 'Offline: no way to find the place right now.' : 'No GPS fix and no IP lookup answered. Try again in a moment.');
      return nameOf(pt).then(function (nm) { return build(g, ip, nm); });
    }).then(function (w) {
      S.w = w; S.at = Date.now(); S.err = ''; S.busy = null; paint(); return w;
    }, function (e) {
      S.busy = null; S.err = clip(e && e.message, 140) || 'Location failed.'; paint(); return S.w;
    });
    return S.busy;
  }

  /* ---------- for Maps ---------- */
  function areas() {
    var w = S.w;
    return w ? uniq([w.suburb, w.city, w.region, w.country]) : [];
  }
  function bias() {
    var w = S.w;
    if (!w || w.lat == null) return null;
    return { lat: w.lat, lon: w.lon, city: w.city || '', region: w.region || '', country: w.country || '', area: areas().join(', '), src: w.src };
  }

  /* ---------- for the AI ---------- */
  function block(lite) {
    if (!aiOn()) return 'LOCATION: Fezzy switched "AI knows where I am" off (WHERE YOU ARE card, top of Maps). Do not claim to know where he is. For directions from his position use [[map.route: here | place | mode]] (the map tool still reads his GPS) or ask which area he is in.';
    var w = S.w;
    if (!w) {
      if (!S.busy) get(false);
      return 'LOCATION: not resolved yet (still loading, offline, or Location is off). Never guess where he is. Use [[map.here: now]] to read his position, or ask which suburb and city he is in.';
    }
    var age = Date.now() - S.at;
    if (age > FRESH && !S.busy) get(false);
    var chain = areas();
    var exact = w.lat != null ? w.lat.toFixed(5) + ',' + w.lon.toFixed(5) + (w.src === 'GPS' ? (w.acc != null ? ' (GPS, within about ' + Math.round(w.acc) + ' m)' : ' (GPS)') : ' (IP only, city level, may be many km off)') : '';
    var rows = [
      'HORIZON LOCATION (live, keyless: GPS + IP + place name; fix ' + ago(age) + (age > STALE_AI ? ', may be out of date: if he says he moved, use [[map.here: now]]' : '') + '):',
      'NOW: ' + w.place + (w.road && !lite ? ' | street: ' + w.road : '') + (w.region ? ' | ' + w.region : '') + (w.country ? ' | ' + w.country : '') + (w.postcode ? ' | ' + w.postcode : '') + (exact ? ' | ' + exact : '') + '.'
    ];
    if (!lite && w.ip) rows.push('IP ' + w.ip + (w.isp ? ' (' + clip(w.isp, 40) + ')' : '') + (w.ipPlace ? ' resolves to ' + w.ipPlace : '') + (w.tz ? ', time zone ' + w.tz : '') + '.' + (w.note ? ' ' + w.note : ''));
    else if (w.note) rows.push(w.note);
    rows.push('When he asks where he is, which area or suburb he is in, or what is near: answer from this block in one short line (suburb, city; give coordinates only if asked). Never say you cannot know his location while this block is present.');
    if (chain.length) {
      rows.push('AREAS TO LINK A PLACE TO (narrowest first): ' + chain.join(' > ') + '. For directions, a bare name like "Shoprite", "the clinic" or "KFC" means the one in his area: write it WITH the area, e.g. [[map.route: here | Shoprite, ' + chain.slice(0, 2).join(', ') + ' | car]], or use [[map.near: shoprite | here]] and route to the returned lat,lon. Leave the area out only when he names another city or country himself. If a tool says the place is far from his area and he did not ask for that, redo it with the area.');
    }
    return rows.join('\n');
  }

  /* ---------- the card ---------- */
  function mkBtn(cls, label, svg, fn) {
    var b = el('button', cls); b.type = 'button'; b.setAttribute('aria-label', label); b.title = label;
    if (svg) b.innerHTML = svg;
    b.addEventListener('click', fn); return b;
  }
  var ICO_REF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/></svg>';
  function cell(k) { var c = el('div', 'hzw-c'); var kk = el('span', 'hzw-k', k), v = el('b', 'hzw-v', '-'); c.appendChild(kk); c.appendChild(v); return { box: c, v: v }; }
  function build_ui() {
    var root = $('#hzWhere');
    if (!root || root.getAttribute('data-ready')) return !!root;
    root.setAttribute('data-ready', '1'); root.replaceChildren();
    var top = el('div', 'hzw-top');
    top.appendChild(el('div', 'hzw-title', 'WHERE YOU ARE'));
    refs.src = el('span', 'hzw-src', '...');
    refs.ref = mkBtn('hzw-ref', 'Find my location again', ICO_REF, function () { get(true, true); });
    top.appendChild(refs.src); top.appendChild(refs.ref);
    refs.place = el('div', 'hzw-place', 'Finding you...');
    refs.sub = el('div', 'hzw-sub', '');
    var grid = el('div', 'hzw-grid');
    refs.cc = cell('Coordinates'); refs.st = cell('Street'); refs.ip = cell('IP'); refs.isp = cell('Network');
    [refs.cc, refs.st, refs.ip, refs.isp].forEach(function (c) { grid.appendChild(c.box); });
    refs.areasBox = el('div', 'hzw-areas');
    refs.note = el('div', 'hzw-note', ''); refs.note.hidden = true;
    var foot = el('div', 'hzw-foot');
    var lab = el('label', 'hzw-sw'); refs.sw = document.createElement('input'); refs.sw.type = 'checkbox'; refs.sw.checked = aiOn();
    refs.sw.addEventListener('change', function () { lss(KEY_AI, refs.sw.checked ? '1' : '0'); paint(); });
    lab.appendChild(refs.sw); lab.appendChild(el('span', '', 'AI knows where I am'));
    refs.upd = el('span', 'hzw-upd', '');
    foot.appendChild(lab); foot.appendChild(refs.upd);
    root.appendChild(top); root.appendChild(refs.place); root.appendChild(refs.sub); root.appendChild(grid); root.appendChild(refs.areasBox); root.appendChild(refs.note); root.appendChild(foot);
    refs.note.addEventListener('click', function () { if (S.gps === 'denied' && window.HzGeo) window.HzGeo.settings(); });
    return true;
  }
  function paint() {
    if (!build_ui()) return;
    var w = S.w, busy = !!S.busy;
    root_busy(busy);
    refs.sw.checked = aiOn();
    if (!w) {
      refs.src.textContent = busy ? 'finding...' : 'no fix';
      refs.place.textContent = busy ? 'Finding you...' : 'Location not found';
      refs.sub.textContent = ''; refs.cc.v.textContent = refs.st.v.textContent = refs.ip.v.textContent = refs.isp.v.textContent = '-';
      refs.areasBox.replaceChildren();
      refs.upd.textContent = '';
      var msg = S.err || (S.gps === 'denied' ? 'Location is not allowed. Tap here to open the settings, or tap the arrow to allow it.' : '');
      refs.note.textContent = msg; refs.note.hidden = !msg;
      return;
    }
    refs.src.textContent = w.src === 'GPS' ? 'GPS' + (w.acc != null ? ' ±' + Math.round(w.acc) + ' m' : '') : 'IP · city level';
    refs.src.className = 'hzw-src ' + (w.src === 'GPS' ? 'is-gps' : 'is-ip');
    refs.place.textContent = w.place || 'Unknown place';
    refs.sub.textContent = uniq([w.region, w.country, w.postcode]).join(' · ');
    refs.cc.v.textContent = w.lat != null ? w.lat.toFixed(5) + ', ' + w.lon.toFixed(5) : '-';
    refs.st.v.textContent = w.road || (w.src === 'IP' ? 'needs GPS' : '-');
    refs.ip.v.textContent = w.ip || '-';
    refs.isp.v.textContent = clip(w.isp || '-', 28);
    refs.areasBox.replaceChildren();
    var ar = areas();
    if (ar.length) {
      refs.areasBox.appendChild(el('span', 'hzw-al', 'Directions link to'));
      ar.forEach(function (a) { refs.areasBox.appendChild(el('span', 'hzw-chip', a)); });
    }
    var note = S.err || w.note || (S.gps === 'denied' ? 'GPS is not allowed. Tap here to open the settings.' : '');
    refs.note.textContent = note; refs.note.hidden = !note;
    refs.upd.textContent = 'updated ' + ago(Date.now() - S.at);
  }
  function root_busy(b) { var r = $('#hzWhere'); if (r) r.classList.toggle('is-busy', !!b); }

  function panelOpen() { var p = $('#rightPanel'); return !!(p && p.classList.contains('open')); }
  function init() {
    build_ui(); paint();
    setTimeout(function () { get(false); }, 1500);
    var rp = $('#rightPanel');
    if (rp) {
      try {
        new MutationObserver(function () { if (panelOpen()) { paint(); if (!S.busy && (!S.w || Date.now() - S.at > FRESH)) get(false); } }).observe(rp, { attributes: true, attributeFilter: ['class'] });
      } catch (e) { /* optional */ }
    }
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('[data-addon="maps"]');
      if (!t) return;
      setTimeout(function () { paint(); if (!S.busy && (!S.w || Date.now() - S.at > FRESH)) get(false); }, 80);
    }, true);
    document.addEventListener('visibilitychange', function () { if (!document.hidden && (!S.w || Date.now() - S.at > FRESH)) get(false); });
    S.tick = setInterval(function () {
      if (document.hidden) return;
      if (S.w && Date.now() - S.at > 5 * 60 * 1000 && !S.busy) get(false); else paint();
    }, 20000);
  }

  window.HorizonWhere = { get: get, peek: function () { return S.w; }, block: block, bias: bias, areas: areas, aiOn: aiOn,
    setAi: function (on) { lss(KEY_AI, on ? '1' : '0'); paint(); }, _t: { haversine: haversine, build: build, ago: ago, fmtDist: fmtDist } };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
