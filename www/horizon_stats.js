/* Horizon V1.99.36 · opt-in device diagnostics. No simulated measurements or background IP/location tracking. */
(function (root) {
    'use strict';
    var doc = root.document, view = doc && doc.getElementById('hzStatsView');
    if (!view) return;
    var start = Date.now(), timer = 0, opened = false, busy = false, battery = null, nativeData = {}, network = null, geo = null;
    var paused = false, intervalMs = 3000, detailsAllowed = false, access = {}, permissionHandles = [], scanGeneration = 0;
    var history = [], samples = 0, lastError = '', mounted = false, pending = null, refreshEpoch = 0;
    function node(tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = String(text); return e; }
    var cachedNative = null;
    function nativePlugin() {
        try {
            var C = root.Capacitor;
            if (!C || (C.isNativePlatform && !C.isNativePlatform())) return null;
            if (C.Plugins && C.Plugins.HorizonStats) return C.Plugins.HorizonStats;
            if (C.isPluginAvailable && !C.isPluginAvailable('HorizonStats')) return null;
            if (cachedNative) return cachedNative;
            if (C.registerPlugin) return (cachedNative = C.registerPlugin('HorizonStats'));
            if (typeof C.nativePromise === 'function') return (cachedNative = new Proxy({}, {get:function(_,method) {
                if (method === 'then') return undefined;
                return function(args) { return C.nativePromise('HorizonStats',String(method),args || {}); };
            }}));
            return null;
        } catch (_) { return null; }
    }
    function bytes(n) { if (n == null || !Number.isFinite(Number(n))) return 'Unavailable'; var u = ['B', 'KB', 'MB', 'GB', 'TB'], i = 0; n = Number(n); while (n >= 1024 && i < 4) { n /= 1024; i++; } return n.toFixed(i > 1 ? 1 : 0) + ' ' + u[i]; }
    function duration(ms) { if (ms == null) return 'Native access needed'; var s = Math.max(0, Math.floor(ms / 1000)); return Math.floor(s / 3600) + 'h ' + Math.floor(s / 60) % 60 + 'm ' + s % 60 + 's'; }
    function value(id, text, note) { var e = doc.getElementById('hzs-' + id); if (!e) return; e.querySelector('strong').textContent = text == null ? 'Unavailable' : String(text); if (note != null) e.querySelector('small').textContent = note; }
    var cards = [
        ['battery', 'Battery', 'Power level and charge state'], ['temperature', 'Temperature', 'Battery sensor, not CPU temperature'],
        ['ram', 'System RAM', 'Native system measurement'], ['cpu', 'CPU', 'Horizon process usage, not whole-device load'],
        ['wifi', 'Wi-Fi', 'SSID requires native access and location permission'], ['ip', 'Public IP', 'Tap Network lookup to contact ipwho.is'],
        ['place', 'IP location / ISP', 'Approximate network location, not a person’s real name'], ['gps', 'GPS coordinates', 'Tap Locate me to request permission'],
        ['vpn', 'VPN', 'Native OS detection; no attempt to reveal your hidden IP'], ['tower', 'Registered cell tower', 'Tap Allow network details; carrier may withhold data'],
        ['uptime', 'Device uptime', 'Android elapsed time since boot'], ['runtime', 'App runtime', 'Current page session'],
        ['storage', 'Storage', 'App data volume / browser origin estimate'], ['heap', 'App memory', 'Process RAM or JS heap where exposed'],
        ['network', 'Connection quality', 'Network type · estimated RTT / downlink'], ['device', 'Device identification', 'No hardware IDs collected'],
        ['screen', 'Display', 'Viewport · pixel ratio'], ['locale', 'Locale & timezone', 'Device settings'],
        ['thermal', 'Thermal / power saver', 'OS status, not a guessed temperature'], ['permissions', 'Access & privacy', 'Sensitive measurements are opt-in']
    ];
    function button(label, fn, id) { var b = node('button', 'use-btn', label); b.type = 'button'; if (id) b.id = id; b.addEventListener('click', fn); return b; }
    var icons = {
        battery:'M3 7h16v10H3z M21 10v4 M7 10v4m4-4v4', temperature:'M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0 M12 8v9',
        ram:'M4 7h16v10H4z M8 10v4m4-4v4m4-4v4 M7 4v3m5-3v3m5-3v3M7 17v3m5-3v3m5-3v3', cpu:'M7 7h10v10H7z M3 9h4m-4 6h4m10-6h4m-4 6h4M9 3v4m6-4v4M9 17v4m6-4v4',
        wifi:'M3 8a14 14 0 0 1 18 0M6 12a9 9 0 0 1 12 0M9 16a4 4 0 0 1 6 0M12 20h.01', gps:'M12 22s8-8 8-14A8 8 0 0 0 4 8c0 6 8 14 8 14z M9 8a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
        storage:'M4 4h16v16H4z M4 10h16M4 15h16M16 7h1m-1 5h1m-1 5h1', vpn:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',
        tower:'M5 21l7-15 7 15M8 15h8M8 4a7 7 0 0 0 0 8m8-8a7 7 0 0 1 0 8', screen:'M3 4h18v13H3z M8 21h8m-4-4v4',
        runtime:'M12 4a9 9 0 1 0 9 9M12 7v6l4 2M12 1v3m5-1 2 2', network:'M3 6h6v5H3z M15 6h6v5h-6z M9 17h6v5H9z M6 11v3h12v-3M12 14v3',
        permissions:'M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6', device:'M7 2h10v20H7z M10 5h4m-3 14h2', locale:'M3 5h12M9 3v2M5 5c0 6 3 8 8 11M13 5c-1 5-5 10-10 12M14 21l4-10 4 10m-7-3h6'
    };
    function featureIcon(id) {
        var aliases = {ip:'network',place:'gps',uptime:'runtime',heap:'ram',thermal:'temperature'};
        var svg = doc.createElementNS('http://www.w3.org/2000/svg','svg'); svg.setAttribute('viewBox','0 0 24 24'); svg.setAttribute('class','hzs-icon'); svg.setAttribute('aria-hidden','true');
        var path = doc.createElementNS('http://www.w3.org/2000/svg','path'); path.setAttribute('d', icons[id] || icons[aliases[id]] || icons.cpu); svg.appendChild(path); return svg;
    }
    function accessSwitch(id, title, description, action) {
        var label = node('label','hzs-access'), text = node('span','hzs-access-text'); text.append(node('b','',title),node('small','',description));
        var input = node('input'); input.type='checkbox'; input.id=id; input.setAttribute('role','switch'); input.setAttribute('aria-label',title); input.addEventListener('change', action); label.append(text,input); return label;
    }
    function paintAccess() {
        [['hzsAllowLive',!paused],['hzsAllowIP',!!network],['hzsAllowGPS',!!geo],['hzsAllowDetails',detailsAllowed]].forEach(function (pair) { var n=doc.getElementById(pair[0]); if(n) n.checked=pair[1]; });
    }
    function mount() {
        if (mounted) return; mounted = true; view.className = 'hz-stats';
        var hero = node('div', 'hzs-hero');
        hero.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4"/><path d="M7 16v-4m5 4V7m5 9v-6"/></svg><div><h2>DEVICE STATS</h2><p>Live diagnostics · measured, not guessed</p></div>';
        view.appendChild(hero);
        var tools = node('div', 'hzs-actions');
        tools.append(button('Refresh', refresh, 'hzsRefresh'), button('Network lookup', lookup, 'hzsLookup'), button('Locate me', locate, 'hzsLocate'), button('Allow network details', permissions, 'hzsPermissions'), button('Export snapshot', exportSnapshot, 'hzsExport'));
        var pause = button('Pause live', function () {
            paused = !paused; if (paused) { stop(); refreshEpoch++; } else begin();
            pause.replaceChildren(featureIcon('runtime'), node('span','',paused ? 'Resume live' : 'Pause live')); pause.setAttribute('aria-pressed', String(paused)); render();
        }, 'hzsPause'); pause.setAttribute('aria-pressed', 'false'); tools.appendChild(pause); view.appendChild(tools);
        var descriptions = {hzsRefresh:'Read a fresh device snapshot.',hzsLookup:'One-time public IP and ISP lookup.',hzsLocate:'Request your current GPS coordinates.',hzsPermissions:'Ask Android for Wi-Fi / cell details.',hzsExport:'Download a reviewed diagnostic snapshot.',hzsPause:'Pause or resume live sampling.'};
        tools.querySelectorAll('button').forEach(function (b) { var card=node('div','hzs-action'); b.prepend(featureIcon(b.id==='hzsLocate'?'gps':b.id==='hzsPermissions'?'permissions':b.id==='hzsLookup'?'network':'runtime')); card.append(b,node('small','',descriptions[b.id])); tools.appendChild(card); });
        var accessBox=node('section','hzs-access-grid'); accessBox.setAttribute('aria-label','Diagnostic access controls');
        accessBox.append(
            accessSwitch('hzsAllowLive','Live sampling','Refresh device readings automatically.',function(e){ if(e.target.checked===paused) pause.click(); paintAccess(); }),
            accessSwitch('hzsAllowIP','Public network','Allow a one-time external IP lookup.',async function(e){ if(e.target.checked) { e.target.checked=false; await lookup(); } else { network=null; render(); } paintAccess(); }),
            accessSwitch('hzsAllowGPS','Location','Request GPS; off clears this session’s fix.',function(e){ if(e.target.checked) { e.target.checked=false; locate(); } else { geo=null; render(); } paintAccess(); }),
            accessSwitch('hzsAllowDetails','Network details','Opt in to native Wi-Fi / cell readings.',async function(e){ if(e.target.checked) { e.target.checked=false; await permissions(); } else { detailsAllowed=false; nativeData={}; refreshEpoch++; render(); if (!busy) await refresh(); } paintAccess(); })
        ); view.appendChild(accessBox);
        view.appendChild(node('p','hint','Switches show successful access in this session, not assumed OS grants. Turning access off stops collection / clears that reading here; revoke OS permissions in Android settings.'));
        var controls = node('div', 'hzs-controls'), rateLabel = node('label', '', 'Sample interval '), rate = node('select'); rate.id = 'hzsInterval'; rate.setAttribute('aria-label', 'Sample interval');
        [3000, 10000, 30000].forEach(function (ms) { var o = node('option', '', ms / 1000 + ' seconds'); o.value = ms; rate.appendChild(o); });
        rate.addEventListener('change', function () { intervalMs = Number(rate.value); if (!paused && opened) begin(); }); rateLabel.appendChild(rate); controls.appendChild(rateLabel); view.appendChild(controls);
        var status = node('p', 'hint'); status.id = 'hzsStatus'; status.setAttribute('role', 'status'); view.appendChild(status);
        var grid = node('div', 'hzs-grid');
        cards.forEach(function (c) { var e = node('article', 'hzs-card'); e.id = 'hzs-' + c[0]; e.append(featureIcon(c[0]), node('h3', '', c[1]), node('strong', '', 'Checking…'), node('small', '', c[2])); grid.appendChild(e); }); view.appendChild(grid);
        var glance=node('section','hzs-grid hzs-overview'); glance.setAttribute('aria-label','Device at a glance');
        ['battery','ram','cpu','storage'].forEach(function(id){glance.appendChild(doc.getElementById('hzs-'+id));}); view.insertBefore(glance,tools);
        var chart = node('section', 'hzs-section'); chart.appendChild(node('h3', '', 'Session trend · battery / memory'));
        chart.innerHTML += '<svg id="hzsChart" viewBox="0 0 600 70" role="img" aria-label="Battery percentage and memory percentage from recent measured samples"><path d="M0 69H600" stroke="currentColor" opacity=".2"/></svg><p class="hint">Green: battery %. Cyan: system RAM used % (JS heap used % in browser). Last 60 samples, this session only.</p>'; view.appendChild(chart);
        var apps = node('section', 'hzs-section'); apps.appendChild(node('h3', '', 'Apps · memory & space')); var appList = node('div'); appList.id = 'hzsApps'; apps.appendChild(appList); view.appendChild(apps);
        var clean = node('section', 'hzs-section'); clean.appendChild(node('h3', '', 'Safe maintenance'));
        clean.appendChild(node('p', 'hint', 'Scan first, then confirm. Only Horizon’s own cache can be removed. Chats, keys, downloads and personal files are excluded. Old-cache candidates are not proof that a personal file is orphaned.'));
        clean.append(button('Scan app cache', scan, 'hzsScan'), button('Scan old cache candidates', function () { scan(true); }, 'hzsOrphans'));
        var plan = node('p', 'hint'); plan.id = 'hzsCleanPlan'; clean.appendChild(plan);
        var yes = button('Confirm cleanup', cleanup, 'hzsCleanConfirm'); yes.hidden = true; clean.appendChild(yes); view.appendChild(clean);
        // The requested additions are live controls and telemetry above, not a placeholder checklist.
        var readings = node('details', 'hzs-section'); readings.appendChild(node('summary', '', 'Recent measured samples'));
        var table = node('table', 'hzs-chart-table'); table.innerHTML = '<thead><tr><th>Time</th><th>Battery</th><th>Memory used</th></tr></thead><tbody id="hzsSamples"></tbody>'; readings.appendChild(table); view.appendChild(readings);
        var empty = node('p', 'hzs-chart-empty'); empty.id = 'hzsChartEmpty'; chart.appendChild(empty);

    }
    function render() {
        paintAccess();
        var n = root.navigator || {}, c = n.connection || n.mozConnection || n.webkitConnection || {}, mem = root.performance && root.performance.memory;
        value('battery', nativeData.batteryPct != null ? nativeData.batteryPct + '%' : battery ? Math.round(battery.level * 100) + '%' : 'Not exposed', nativeData.charging != null ? (nativeData.charging ? 'Charging' : 'On battery') : battery ? (battery.charging ? 'Charging' : 'On battery') : 'Battery API unavailable on this platform');
        value('temperature', nativeData.batteryTempC != null ? nativeData.batteryTempC + ' °C' : 'Native sensor needed');
        value('ram', nativeData.ramTotal && nativeData.ramAvailable != null ? bytes(nativeData.ramTotal - nativeData.ramAvailable) + ' / ' + bytes(nativeData.ramTotal) : n.deviceMemory ? '≈' + n.deviceMemory + ' GB capacity' : 'Native access needed', nativeData.ramTotal ? 'Used / total system memory' : 'Browser capacity hint; live system usage needs native access');
        value('cpu', nativeData.processCpuPct != null ? nativeData.processCpuPct + '%' : 'Not exposed', (nativeData.cpuCores || n.hardwareConcurrency || '?') + ' logical cores · app process CPU only');
        value('wifi', nativeData.ssid || 'Unavailable / permission needed', nativeData.localIp ? 'Local IP · ' + nativeData.localIp : 'Browser cannot read Wi-Fi SSID');
        value('ip', network && network.ip || 'Not requested');
        value('place', network ? [network.city, network.country].filter(Boolean).join(', ') : 'Not requested', network ? [network.isp, network.asn, 'IP coordinates: ' + network.latitude + ', ' + network.longitude].filter(Boolean).join(' · ') : 'No real-name lookup; IPs identify networks, not people');
        value('gps', geo ? geo.latitude.toFixed(6) + ', ' + geo.longitude.toFixed(6) : 'Not requested', geo ? 'GPS accuracy ±' + Math.round(geo.accuracy) + ' m' : 'Only requested when you tap Locate me');
        value('vpn', nativeData.vpn != null ? nativeData.vpn ? 'VPN active' : 'No VPN transport detected' : 'Native OS access needed', nativeData.vpn ? 'Public IP lookup shows the VPN exit; hidden pre-VPN IP is not collected' : 'Detection is not inferred from an IP address');
        value('tower', nativeData.cellTower || 'Unavailable / permission needed');
        value('uptime', duration(nativeData.uptimeMs)); value('runtime', duration(Date.now() - start), nativeData.appRuntimeMs != null ? 'Android process runtime · ' + duration(nativeData.appRuntimeMs) : 'Current page session');
        value('storage', nativeData.diskTotal ? bytes(nativeData.diskTotal - nativeData.diskFree) + ' / ' + bytes(nativeData.diskTotal) : nativeData.storage ? bytes(nativeData.storage.usage) + ' / ' + bytes(nativeData.storage.quota) : 'Not exposed', nativeData.diskTotal ? 'App data volume · ' + bytes(nativeData.diskFree) + ' free' : 'Browser origin usage / quota, not entire phone');
        value('heap', nativeData.processRamBytes != null ? bytes(nativeData.processRamBytes) : mem ? bytes(mem.usedJSHeapSize) : 'Not exposed', nativeData.processRamBytes != null ? 'Horizon process PSS' : 'JS heap only; not total system RAM');
        value('network', (n.onLine === false ? 'Offline' : n.onLine === true ? 'Online' : 'Status unavailable') + ' · ' + (nativeData.networkType || c.effectiveType || c.type || 'type unavailable'), [c.rtt != null ? '≈' + c.rtt + ' ms RTT' : '', c.downlink != null ? '≈' + c.downlink + ' Mbps' : nativeData.linkDownstreamKbps > 0 ? 'OS link estimate ≈' + (nativeData.linkDownstreamKbps / 1000).toFixed(1) + ' Mbps' : '', c.saveData === true ? 'Data Saver on' : c.saveData === false ? 'Data Saver off' : nativeData.dataSaver || ''].filter(Boolean).join(' · ') || 'Network estimates unavailable');
        value('device', nativeData.device || n.userAgentData && n.userAgentData.platform || n.platform || 'Unknown', nativePlugin() ? 'Android native telemetry connected' : 'Browser telemetry · install native plugin for phone sensors');
        value('screen', root.innerWidth + ' × ' + root.innerHeight + ' px', 'Screen ' + (root.screen && root.screen.width || '?') + ' × ' + (root.screen && root.screen.height || '?') + ' · DPR ' + (root.devicePixelRatio || 1));
        value('locale', n.language || 'Unavailable', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Timezone unavailable');
        value('thermal', nativeData.thermalStatus || 'Native access needed', nativeData.powerSaver != null ? 'Power saver ' + (nativeData.powerSaver ? 'on' : 'off') : 'CPU temperature is not exposed by standard Android APIs');
        value('permissions', Object.keys(access).map(function (k) { return k + ': ' + access[k]; }).join(' · ') || 'Permission API unavailable',
            'Native location: ' + (nativeData.locationGranted === true ? 'granted' : nativeData.locationGranted === false ? 'not granted' : 'not exposed') + ' · Network details ' + (detailsAllowed ? 'requested' : 'not requested') + '. Public IP and GPS are opt-in.');
        var apps = doc.getElementById('hzsApps'); apps.replaceChildren();
        if (nativeData.apps && nativeData.apps.length) {
            nativeData.apps.forEach(function (a) { var row = node('div', 'hzs-app'); row.append(node('b', '', a.name), node('span', '', 'RAM ' + bytes(a.ramBytes) + ' · APK ' + bytes(a.codeBytes))); apps.appendChild(row); });
            apps.appendChild(node('p', 'hint', 'Only OS-visible processes/packages. APK size excludes private app data. Android restricts other apps’ live RAM and private storage; no task-killer claims.'));
        } else apps.appendChild(node('p', 'hint', 'Other apps’ RAM and private storage are restricted by the OS. Native mode lists only visible processes/packages, never guessed values.'));
        doc.getElementById('hzsStatus').textContent = (lastError || (nativePlugin() ? 'Android telemetry' : 'Browser mode · native-only fields are clearly marked')) + ' · ' + samples + ' samples · ' + (paused ? 'paused' : doc.hidden ? 'suspended while hidden' : 'live every ' + intervalMs / 1000 + 's') + (history.length ? ' · last sample ' + new Date(history[history.length-1].at).toLocaleTimeString() : '');
        var body = doc.getElementById('hzsSamples'); body.replaceChildren();
        history.slice(-10).reverse().forEach(function (s) { var row = node('tr'); row.append(node('td', '', new Date(s.at).toLocaleTimeString()), node('td', '', s.battery == null ? 'Not exposed' : s.battery.toFixed(1) + '%'), node('td', '', s.memory == null ? 'Not exposed' : s.memory.toFixed(1) + '%')); body.appendChild(row); });
        doc.getElementById('hzsChartEmpty').textContent = history.some(function (s) { return s.battery != null || s.memory != null; }) ? 'Measured samples only; gaps mean the API did not report a value.' : 'No battery or memory measurements exposed yet. No trend is invented.';
        var svg = doc.getElementById('hzsChart'); svg.querySelectorAll('polyline').forEach(function (e) { e.remove(); });
        ['battery', 'memory'].forEach(function (key, i) {
            var segments = [], segment = [];
            history.forEach(function (s, j) { if (s[key] == null) { if (segment.length) segments.push(segment); segment = []; } else segment.push((history.length > 1 ? j / (history.length - 1) * 600 : 0) + ',' + (69 - Math.min(100, Math.max(0, s[key])) * .68)); });
            if (segment.length) segments.push(segment);
            segments.forEach(function (points) { if (points.length === 1) points.push(points[0].replace(/^0,/, '1,')); var l = doc.createElementNS('http://www.w3.org/2000/svg', 'polyline'); l.setAttribute('points', points.join(' ')); l.setAttribute('stroke', i ? 'var(--accent-cyan)' : 'var(--neon)'); l.setAttribute('fill', 'none'); l.setAttribute('stroke-width', '2'); svg.appendChild(l); });
        });
    }
    async function refresh() {
        if (busy || !opened || doc.hidden) return; busy = true;
        var epoch = refreshEpoch;
        try {
            var P = nativePlugin();
            if (P) { var deadline, snapshot; try { snapshot = await Promise.race([P.snapshot({details: detailsAllowed}), new Promise(function (_, reject) { deadline = root.setTimeout(function () { reject(new Error('Native telemetry timed out')); }, 8000); })]); } finally { root.clearTimeout(deadline); } if (epoch !== refreshEpoch) return; nativeData = snapshot && typeof snapshot === 'object' ? snapshot : {}; if (nativeData.locationGranted === false) detailsAllowed = false; }
            else if (root.navigator.storage && root.navigator.storage.estimate) { var estimate = await root.navigator.storage.estimate(); if (epoch !== refreshEpoch) return; nativeData = {storage:estimate}; }
            if (epoch !== refreshEpoch) return;
            lastError = ''; samples++;
            var m = root.performance && root.performance.memory;
            history.push({at: Date.now(), battery: nativeData.batteryPct != null ? nativeData.batteryPct : battery ? battery.level * 100 : null,
                memory: nativeData.ramTotal && nativeData.ramAvailable != null ? (1 - nativeData.ramAvailable / nativeData.ramTotal) * 100 : m && m.jsHeapSizeLimit ? m.usedJSHeapSize / m.jsHeapSizeLimit * 100 : null});
            if (history.length > 60) history.shift(); render();
        } catch (e) { if (epoch === refreshEpoch) { lastError = 'Refresh failed: ' + String(e.message || e); render(); } }
        finally { busy = false; }
    }
    async function lookup() {
        if (!root.confirm('Look up your public IP, ISP and approximate location using ipwho.is? This contacts that external service.')) return;
        var b = doc.getElementById('hzsLookup'); b.disabled = true;
        var ctl = new AbortController(), timeout = root.setTimeout(function () { ctl.abort(); }, 10000);
        try {
            var r = await root.fetch('https://ipwho.is/', {signal: ctl.signal}); if (!r.ok) throw new Error('HTTP ' + r.status);
            var d = await r.json(); if (d.success === false || !d.ip) throw new Error('IP lookup unavailable');
            network = {ip: d.ip, city: d.city, country: d.country, latitude: d.latitude, longitude: d.longitude, isp: d.connection && d.connection.isp, asn: d.connection && d.connection.asn}; lastError = '';
        } catch (e) { lastError = 'Network lookup failed: ' + (e.message || e); }
        finally { root.clearTimeout(timeout); b.disabled = false; render(); }
    }
    function locate() {
        if (root.HzGeo && root.HzGeo.get) {
            root.HzGeo.get(true).then(function (p) {
                if (p.err) throw new Error(p.why || 'No location fix');
                geo = {latitude: p.lat, longitude: p.lon, accuracy: p.acc || 0}; lastError = ''; render();
            }).catch(function (e) { lastError = 'Location unavailable: ' + (e.message || e); render(); });
            return;
        }
        if (!root.navigator.geolocation) { lastError = 'GPS API unavailable'; render(); return; }
        root.navigator.geolocation.getCurrentPosition(function (p) { geo = {latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy}; lastError = ''; render(); }, function (e) { lastError = 'Location unavailable: ' + e.message; render(); }, {enableHighAccuracy: true, timeout: 12000, maximumAge: 60000});
    }
    async function permissions() {
        var P = nativePlugin();
        if (!P || !P.requestDetails) { lastError = 'Wi-Fi and cell details need the Android HorizonStats plugin. GPS uses Locate me.'; render(); return; }
        try { var d = await P.requestDetails(); detailsAllowed = d.locationGranted === true; lastError = detailsAllowed ? '' : 'Location permission denied; network details remain unavailable.'; await readPermissions(); await refresh(); if (!detailsAllowed) { lastError = 'Location permission denied; network details remain unavailable.'; render(); } } catch (e) { lastError = String(e.message || e); render(); }
    }
    async function scan(oldOnly) {
        // A click event is not the old-only flag.
        oldOnly = oldOnly === true; var P = nativePlugin(), generation = ++scanGeneration; pending = null;
        var out = doc.getElementById('hzsCleanPlan'), yes = doc.getElementById('hzsCleanConfirm'); yes.hidden = true;
        try {
            if (P && P.scanCache) { var r = await P.scanCache({oldOnly: oldOnly}); if (generation !== scanGeneration) return; pending = {native: true, oldOnly: oldOnly, token: r.token}; out.textContent = r.count + ' app-cache files · ' + bytes(r.bytes) + (oldOnly ? ' · older than 7 days' : '') + '. Personal files excluded.'; yes.hidden = !r.count; }
            else {
                var names = root.caches ? await root.caches.keys() : []; if (generation !== scanGeneration) return;
                names = names.filter(function (n) { return n.indexOf('horizon-transient-') === 0; });
                if (oldOnly) { out.textContent = 'Old-file scanning needs native access. No personal filesystem is scanned.'; return; }
                pending = {names: names, at: Date.now()}; out.textContent = names.length + ' Horizon transient CacheStorage buckets. Other origin caches, chats and settings are excluded.'; yes.hidden = !names.length;
            }
        } catch (e) { out.textContent = 'Scan unavailable: ' + (e.message || e); }
    }
    async function cleanup() {
        if (!pending || !root.confirm('Delete only the Horizon cache items in the reviewed scan? Chats, keys and personal files will not be touched.')) return;
        var plan = pending; pending = null; ++scanGeneration;
        if (plan.at && Date.now() - plan.at > 300000) { doc.getElementById('hzsCleanPlan').textContent = 'Scan expired; scan again before cleanup.'; doc.getElementById('hzsCleanConfirm').hidden = true; return; } doc.getElementById('hzsCleanConfirm').hidden = true;
        try {
            if (plan.native) { var P = nativePlugin(), r = await P.clearCache({token: plan.token}); doc.getElementById('hzsCleanPlan').textContent = 'Removed ' + r.count + ' cache files · ' + bytes(r.bytes); }
            else { await Promise.all(plan.names.map(function (n) { return root.caches.delete(n); })); doc.getElementById('hzsCleanPlan').textContent = 'Transient cache cleared.'; }
            await refresh();
        } catch (e) { doc.getElementById('hzsCleanPlan').textContent = 'Cleanup stopped: ' + (e.message || e); }
    }
    function exportSnapshot() {
        if (!root.confirm('Export diagnostics? The file can include your IP, approximate location, GPS, Wi-Fi name and app identifiers if you requested them. API keys and chat text are excluded.')) return;
        var blob = new Blob([JSON.stringify({at: new Date().toISOString(), schemaVersion: 2, native: nativeData, browser: browserSnapshot(), permissions: access, publicNetwork: network, location: geo, sessionMs: Date.now() - start, paused: paused, intervalMs: intervalMs, samples: history}, null, 2)], {type: 'application/json'});
        var url = URL.createObjectURL(blob), a = node('a'); a.href = url; a.download = 'horizon-stats.json'; doc.body.appendChild(a); a.click(); a.remove(); root.setTimeout(function () { URL.revokeObjectURL(url); }, 10000);
    }
    function browserSnapshot() {
        var n = root.navigator || {}, c = n.connection || {}, m = root.performance && root.performance.memory;
        return {platform: n.userAgentData && n.userAgentData.platform || n.platform || null, language:n.language || null, languages:n.languages || [], timezone:Intl.DateTimeFormat().resolvedOptions().timeZone, viewport:{width:root.innerWidth,height:root.innerHeight,dpr:root.devicePixelRatio || 1}, screen:root.screen ? {width:root.screen.width,height:root.screen.height} : null,
            connection:{online:n.onLine,type:c.effectiveType || c.type || null,rttMs:c.rtt,downlinkMbps:c.downlink,saveData:c.saveData}, heap:m ? {usedBytes:m.usedJSHeapSize,limitBytes:m.jsHeapSizeLimit} : null};
    }
    async function readPermissions() {
        var n = root.navigator || {}; if (!n.permissions || !n.permissions.query) return;
        await Promise.all(['geolocation','notifications','microphone','camera'].map(async function (name) {
            try { var result = await n.permissions.query({name:name}); access[name] = result.state;
                if (!permissionHandles.some(function (h) { return h.name === name; })) {
                    var fn = function () { access[name] = result.state; if (opened) render(); };
                    result.addEventListener('change', fn); permissionHandles.push({name:name,result:result,fn:fn});
                }
            } catch (_) { access[name] = 'not exposed'; }
        }));
        if (opened) render();
    }
    function stop() { root.clearInterval(timer); timer = 0; }
    function begin() { stop(); if (!opened || paused || doc.hidden) return; timer = root.setInterval(refresh, intervalMs); refresh(); }
    function show() { mount(); opened = true; render(); begin(); readPermissions(); if (!battery && root.navigator.getBattery) root.navigator.getBattery().then(function (b) { battery = b; if (opened) refresh(); }).catch(function () {}); }
    function hide() { opened = false; refreshEpoch++; stop(); }
    doc.addEventListener('visibilitychange', function () { if (doc.hidden) { stop(); refreshEpoch++; } else if (opened) begin(); });
    root.addEventListener('resize', function () { if (opened) render(); });
    ['online', 'offline'].forEach(function (e) { root.addEventListener(e, function () { if (opened) render(); }); });
    var connection = root.navigator.connection; if (connection && connection.addEventListener) connection.addEventListener('change', function () { if (opened) render(); });
    root.HorizonStats = {show: show, hide: hide, refresh: refresh};
})(window);
