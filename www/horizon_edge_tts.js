/* HORIZON · Microsoft Edge voices, native · V2.0.0 (app V1.99.27)
 *
 * Cloud straight to the phone. The Kotlin plugin HorizonEdgeVoice opens the WebSocket to Microsoft, receives the mp3 stream and feeds it
 * to ExoPlayer from memory. No shell script, no CLI, no files.
 *
 * Flow for one reply:
 *   1. HorizonTTS.speak() asks wants() whether Edge should read it. Off, or plugin missing = Android voice, exactly as before.
 *   2. play() hands the reply (already split into sentence-sized chunks) to the plugin with ONE speak() call.
 *   3. The plugin streams chunk after chunk into one continuous audio stream, so playback starts on the first audio bytes and there are no gaps.
 *   4. The plugin sends back "edgeVoice" events: playing, ended, error. play() resolves on ended.
 *   Any failure before the first sound throws back into HorizonTTS, which falls through to the Android voice. After a failure Edge is
 *   skipped for 3 minutes so auto-read does not wait on a broken connection for every reply. A failure after sound started ends quietly
 *   (no second read from the top).
 *
 * Public API: window.HorizonEdgeTTS = { wants, play, stop, setPaused, failed, voiceFor, setVoice, setDefault, enabled, setEnabled,
 *   voices, providers, sanitizeVoice, ratePct, DEFAULT_VOICE }
 */
(function (root) {
    'use strict';
    var PLUGIN = 'HorizonEdgeVoice';
    var DEFAULT_VOICE = 'en-US-AriaNeural';
    var CHUNK_CHARS = 700;
    var STARTUP_MS = 30000;
    var COOLDOWN_MS = 180000;

    var VOICES = [
        ['en-US-AriaNeural', 'Aria · US female'], ['en-US-JennyNeural', 'Jenny · US female'], ['en-US-AvaNeural', 'Ava · US female'],
        ['en-US-EmmaNeural', 'Emma · US female'], ['en-US-MichelleNeural', 'Michelle · US female'],
        ['en-US-GuyNeural', 'Guy · US male'], ['en-US-AndrewNeural', 'Andrew · US male'], ['en-US-BrianNeural', 'Brian · US male'],
        ['en-US-ChristopherNeural', 'Christopher · US male'], ['en-US-EricNeural', 'Eric · US male'], ['en-US-RogerNeural', 'Roger · US male'],
        ['en-US-SteffanNeural', 'Steffan · US male'],
        ['en-GB-SoniaNeural', 'Sonia · UK female'], ['en-GB-LibbyNeural', 'Libby · UK female'],
        ['en-GB-RyanNeural', 'Ryan · UK male'], ['en-GB-ThomasNeural', 'Thomas · UK male'],
        ['en-ZA-LeahNeural', 'Leah · South Africa female'], ['en-ZA-LukeNeural', 'Luke · South Africa male'],
        ['en-AU-NatashaNeural', 'Natasha · Australia female'], ['en-AU-WilliamNeural', 'William · Australia male'],
        ['en-IN-NeerjaNeural', 'Neerja · India female'], ['en-IN-PrabhatNeural', 'Prabhat · India male'],
        ['en-IE-EmilyNeural', 'Emily · Ireland female'], ['en-IE-ConnorNeural', 'Connor · Ireland male']
    ].map(function (v) { return { id: v[0], label: v[1] }; });
    var PROVIDERS = [
        { id: 'gemini', name: 'Gemini' }, { id: 'cohere', name: 'Cohere' },
        { id: 'mistral', name: 'Mistral' }, { id: 'pollinations', name: 'Pollinations' }
    ];

    [ ['routeway','Routeway'], ['requesty','Requesty'], ['githubmodels','GitHub Models'], ['kilo','Kilo'], ['ovh','OVH'], ['chatat','Chatat'], ['blockrun','Blockrun'], ['aihorde','AI Horde'], ['llm7','LLM7'], ['cloudflare','Cloudflare'] ].forEach(function (p) { PROVIDERS.push({id:p[0], name:p[1]}); });

    var ls = {
        get: function (k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } },
        set: function (k, v) { try { root.localStorage.setItem(k, String(v)); } catch (_) { /* storage full or blocked */ } },
        remove: function (k) { try { root.localStorage.removeItem(k); } catch (_) { /* ignore */ } }
    };
    var K_ON = 'horizon_edge_on', K_DEF = 'horizon_edge_default', K_VOICE = 'horizon_edge_v_';

    var seq = 0, epoch = 0, coolUntil = 0, lastError = '', cur = null, listening = null, active = {};
    var statusEl = null;

    function noop() { /* nothing to do */ }
    function msg(e) { return String(e && e.message || e || 'Edge voice failed').replace(/\s+/g, ' ').slice(0, 220); }
    // Letters, digits and dashes only. A bad stored value just becomes the default voice.
    function sanitizeVoice(v) { v = String(v == null ? '' : v).trim(); return /^[A-Za-z0-9-]{3,64}$/.test(v) ? v : ''; }
    function provKey(prov) { return String(prov || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); }

    function enabled() { return ls.get(K_ON) === '1'; }
    function setEnabled(on) { ls.set(K_ON, on ? '1' : '0'); coolUntil = 0; }
    function defaultVoice() { return sanitizeVoice(ls.get(K_DEF)) || DEFAULT_VOICE; }
    function setDefault(v) { var s = sanitizeVoice(v); if (s) ls.set(K_DEF, s); else ls.remove(K_DEF); return s || DEFAULT_VOICE; }
    function voiceFor(prov) { var k = provKey(prov); return (k && sanitizeVoice(ls.get(K_VOICE + k))) || defaultVoice(); }
    function setVoice(prov, v) { var k = provKey(prov); if (!k) return ''; var s = sanitizeVoice(v); if (s) ls.set(K_VOICE + k, s); else ls.remove(K_VOICE + k); return voiceFor(prov); }

    // The Speed slider of the Android voice also drives Edge: 1.0x = +0%, 1.25x = +25%, limits -50% to +100%.
    function ratePct() {
        try {
            var r = Number(root.HorizonTTS && root.HorizonTTS.settings && root.HorizonTTS.settings().rate);
            if (!isFinite(r) || r <= 0) return 0;
            return Math.max(-50, Math.min(100, Math.round((r - 1) * 100)));
        } catch (_) { return 0; }
    }

    /* ---------- native plugin ---------- */
    var cachedPlugin = null;
    function plugin() {
        var C = root.Capacitor;
        try {
            if (!C) return null;
            if (C.isNativePlatform && !C.isNativePlatform()) return null;
            if (C.Plugins && C.Plugins[PLUGIN]) return C.Plugins[PLUGIN];
            if (C.isPluginAvailable && !C.isPluginAvailable(PLUGIN)) return null;
            if (cachedPlugin) return cachedPlugin;
            if (C.registerPlugin) return (cachedPlugin = C.registerPlugin(PLUGIN));
            if (typeof C.nativePromise === 'function' && typeof C.addListener === 'function') {
                cachedPlugin = new Proxy({}, {get: function (_, method) {
                    if (method === 'then') return undefined;
                    if (method === 'addListener') return function (event, listener) { return C.addListener(PLUGIN, event, listener); };
                    return function (args) { return C.nativePromise(PLUGIN, String(method), args || {}); };
                }});
                return cachedPlugin;
            }
            return null;
        } catch (_) { return null; }
    }
    function deadline(promise, ms, message) {
        var timer; return Promise.race([promise, new Promise(function (_, reject) { timer = root.setTimeout(function () { reject(new Error(message)); }, ms); })]).finally(function () { root.clearTimeout(timer); });
    }
    function listen(P) {
        if (listening) return listening;
        listening = Promise.resolve(P.addListener('edgeVoice', function (ev) {
            var h = ev && active[ev.id];
            if (h) h(ev);
        })).catch(function (e) { listening = null; throw e; });
        return listening;
    }

    /* ---------- engine hooks used by HorizonTTS ---------- */
    function wants(opts) {
        if (!plugin()) return false;
        if (opts && opts.forceEdge) return true;
        return enabled() && Date.now() >= coolUntil;
    }
    async function play(job) {
        var P = plugin();
        if (!P) throw new Error('The native Edge voice plugin is missing from this build');
        if (cur) stop();
        var my = ++epoch, cancelled = function () { return my !== epoch || job.cancelled(); };
        var voice = sanitizeVoice(job.voice) || voiceFor(job.prov);
        var chunks = job.chunk(job.text, CHUNK_CHARS).filter(function (c) { return String(c).trim(); });
        if (!chunks.length) throw new Error('Nothing to speak');
        await deadline(listen(P), 8000, 'Edge event listener did not connect. Rebuild with HorizonEdgeVoice registered.');
        await job.waitResume();
        if (cancelled()) return false;
        var id = 'edge_' + Date.now() + '_' + (++seq), started = false;
        return new Promise(function (ok, no) {
            var done = false;
            var startup = root.setTimeout(function () {
                if (started || done) return;
                Promise.resolve(P.stop()).catch(noop);
                end(new Error('Edge did not start within 30 seconds. Try another voice or connection.'));
            }, STARTUP_MS);
            function end(err, val) {
                if (done) return;
                done = true; root.clearTimeout(startup); delete active[id]; if (cur && cur.id === id) cur = null;
                if (err) no(err); else ok(val);
            }
            active[id] = function (ev) {
                if (ev.event === 'playing') {
                    if (!started) { root.clearTimeout(startup); started = true; if (!cancelled() && job.onPlaying) job.onPlaying(); }
                } else if (ev.event === 'ended') {
                    lastError = ''; paint(); end(null, true);
                } else if (ev.event === 'error') {
                    var e = new Error(msg(ev.message));
                    if (ev.started || started) { failed(e); end(null, true); } else end(e);
                }
            };
            cur = { id: id, end: function () { end(null, false); } };
            Promise.resolve(P.speak({ id: id, text: job.text, chunks: chunks, voice: voice, ratePct: ratePct() }))
                .catch(function (e) { end(e instanceof Error ? e : new Error(msg(e))); });
        });
    }
    function stop() {
        epoch++;
        var c = cur;
        if (!c) return;
        c.end();
        var P = plugin();
        if (P) Promise.resolve(P.stop()).catch(noop);
    }
    function setPaused(on) {
        var P = plugin();
        if (!P || !cur) return;
        Promise.resolve(on ? P.pause() : P.resume()).catch(noop);
    }
    function failed(e) { lastError = msg(e); coolUntil = Date.now() + COOLDOWN_MS; paint(); }

    /* ---------- settings UI (injected into the Voice card; nothing in index.html to maintain) ---------- */
    function paint() {
        if (!statusEl) return;
        var on = enabled();
        statusEl.textContent = !on ? 'Off. Replies use the Android voice.'
            : !plugin() ? 'On, but this build has no native Edge voice plugin. Using the Android voice.'
            : lastError ? 'On, but the last try failed: ' + lastError + (Date.now() < coolUntil ? ' Using the Android voice for a few minutes.' : '')
            : 'On. Tap Check native connection, then Test Edge voice to verify this build.';
    }
    function el(tag, cls, text) { var n = root.document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function fillSelect(sel, current, firstLabel) {
        sel.textContent = '';
        var o = el('option', '', firstLabel); o.value = ''; sel.appendChild(o);
        var known = false;
        VOICES.forEach(function (v) { var op = el('option', '', v.label); op.value = v.id; if (v.id === current) known = true; sel.appendChild(op); });
        if (current && !known) { var c = el('option', '', current + ' · custom'); c.value = current; sel.appendChild(c); }
        sel.value = current || '';
    }
    var catalogueAt = 0, catalogueBusy = null;
    function refreshVoices() {
        if (catalogueBusy) return catalogueBusy;
        catalogueBusy = (async function () {
            var P = plugin(), list;
            if (P && typeof P.listVoices === 'function') list = (await deadline(P.listVoices(), 25000, 'Edge catalogue timed out. Check internet and the installed native plugin.')).voices;
            else {
                if (root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()) throw new Error('HorizonEdgeVoice is missing. Install/register the native plugin and rebuild the APK.');
                var ctl = new AbortController(), timer = root.setTimeout(function () { ctl.abort(); }, 10000);
                try {
                    var response = await root.fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', {signal: ctl.signal});
                    if (!response.ok) throw new Error('Voice catalogue HTTP ' + response.status);
                    list = await response.json();
                } finally { root.clearTimeout(timer); }
            }
            var mapped = (list || []).map(function (v) {
                var id = sanitizeVoice(v.ShortName || v.id);
                return {id: id, label: (v.FriendlyName || v.label || id) + (v.Locale ? ' · ' + v.Locale : '')};
            }).filter(function (v) { return !!v.id; });
            if (!mapped.length) throw new Error('No voices returned; keeping the built-in list.');
            var seen = {};
            VOICES.splice(0, VOICES.length);
            mapped.sort(function (a,b) { return a.label.localeCompare(b.label); }).forEach(function (v) { if (!seen[v.id]) { seen[v.id] = true; VOICES.push(v); } });
            catalogueAt = Date.now(); return VOICES;
        })().finally(function () { catalogueBusy = null; });
        return catalogueBusy;
    }
    function testVoice(prov, voice) {
        var T = root.HorizonTTS;
        if (!T) { if (statusEl) statusEl.textContent = 'The speech engine has not loaded. Reload Horizon.'; return Promise.resolve(false); }
        lastError = ''; coolUntil = 0;
        if (!plugin()) { if (statusEl) statusEl.textContent = 'Voice testing needs the Android app with HorizonEdgeVoice installed.'; return; }
        T.stop();
        var selected = sanitizeVoice(voice) || voiceFor(prov);
        if (statusEl) statusEl.textContent = 'Connecting · ' + selected;
        return Promise.resolve(T.toggle('edge-test-' + (prov || 'default'), 'Hello. This is ' + selected.replace(/Neural$/, '').replace(/-/g, ' ') + ', speaking in Horizon.', {forceEdge: true, prov: prov || '', voice: selected})).then(function (ok) {
            if (statusEl) statusEl.textContent = lastError ? 'Edge test failed: ' + lastError + ' Android fallback was attempted.' : ok ? 'Edge test complete · ' + selected : 'Edge test stopped or could not play. Check Android speech settings.';
            return ok;
        }).catch(function (e) { failed(e); return false; });
    }
    function mount() {
        var doc = root.document, card = doc && doc.getElementById('ttsCard');
        if (!card || doc.getElementById('ttsEdgeGroup')) return;
        var group = el('details', 'hz-voice-group'); group.id = 'ttsEdgeGroup';
        group.appendChild(el('summary', '', 'Microsoft Edge voices · direct from the cloud'));
        group.appendChild(el('p', 'hint', 'Natural neural voices streamed straight from Microsoft to Horizon. Needs internet and the native HorizonEdgeVoice plugin in this APK. If Edge cannot connect, Horizon tries your Android speech engine and reports the error.'));
        var row = el('label', 'opt-row'); row.appendChild(el('span', '', 'Use Edge voices'));
        var chk = el('input'); chk.type = 'checkbox'; chk.id = 'ttsEdgeOn'; chk.checked = enabled(); row.appendChild(chk); group.appendChild(row);
        statusEl = el('p', 'hint'); statusEl.id = 'ttsEdgeStatus'; group.appendChild(statusEl);

        var defLbl = el('label', 'field-label', 'Default voice (used when an AI has none of its own)'); defLbl.setAttribute('for', 'ttsEdgeDef'); group.appendChild(defLbl);
        var def = el('select'); def.id = 'ttsEdgeDef'; fillSelect(def, ls.get(K_DEF) ? defaultVoice() : '', 'Aria · US female (built-in default)'); group.appendChild(def);
        var custLbl = el('label', 'field-label', 'Or type any Edge voice name, e.g. en-ZA-LeahNeural'); custLbl.setAttribute('for', 'ttsEdgeCustom'); group.appendChild(custLbl);
        var cust = el('input'); cust.type = 'text'; cust.id = 'ttsEdgeCustom'; cust.autocomplete = 'off'; cust.spellcheck = false; cust.placeholder = DEFAULT_VOICE; group.appendChild(cust);

        group.appendChild(el('h4', '', 'Voice for each AI'));
        PROVIDERS.forEach(function (p) {
            var entry = el('div', 'hz-edge-provider'); group.appendChild(entry);
            var l = el('label', 'field-label', p.name); l.setAttribute('for', 'ttsEdge_' + p.id); entry.appendChild(l);
            var s = el('select'); s.id = 'ttsEdge_' + p.id; fillSelect(s, sanitizeVoice(ls.get(K_VOICE + p.id)), 'Default voice'); entry.appendChild(s);
            s.addEventListener('change', function () { setVoice(p.id, s.value); });
            var test = el('button', 'use-btn hz-edge-test', 'Test ' + p.name); test.type = 'button'; test.dataset.edgeTest = p.id;
            test.addEventListener('click', function () { testVoice(p.id, s.value); }); entry.appendChild(test);
        });

        var find = el('input'); find.type = 'search'; find.id = 'ttsEdgeSearch'; find.placeholder = 'Find voices · name, language or country'; find.setAttribute('aria-label', 'Filter Edge voice catalogue');
        group.insertBefore(find, defLbl);
        function refill() {
            group.querySelectorAll('select').forEach(function (s) {
                var current = s.value; fillSelect(s, current, s === def ? 'Aria · built-in default' : 'Default voice');
                var q = find.value.toLowerCase().trim();
                Array.from(s.options).forEach(function (o) { o.hidden = !!(q && o.value && o.value !== current && (o.textContent + ' ' + o.value).toLowerCase().indexOf(q) < 0); });
            });
        }
        find.addEventListener('input', refill);
        var more = el('button', 'use-btn', 'Load / refresh all Edge voices'); more.id = 'ttsEdgeRefresh'; more.type = 'button'; group.insertBefore(more, find);
        var catalog = el('p', 'hint', VOICES.length + ' built-in voices. Refresh for Microsoft’s current multilingual catalogue.'); catalog.id = 'ttsEdgeCatalogueStatus'; group.insertBefore(catalog, find);
        more.addEventListener('click', async function () {
            more.disabled = true; catalog.textContent = 'Loading Microsoft voice catalogue…';
            try { await refreshVoices(); refill(); catalog.textContent = VOICES.length + ' voices · updated ' + new Date(catalogueAt).toLocaleTimeString(); }
            catch (e) { catalog.textContent = msg(e) + ' Built-in and custom voices are still available.'; }
            finally { more.disabled = false; }
        });
        var probe = el('button','use-btn','Check native connection'); probe.type='button'; probe.id='ttsEdgeProbe';
        probe.addEventListener('click', async function () {
            var P=plugin(); if(!P) { statusEl.textContent='HorizonEdgeVoice is missing. Install/register it in your Android project, then sync and rebuild the APK. A web-asset update alone cannot add this plugin.'; return; }
            probe.disabled=true; statusEl.textContent='Checking native Edge bridge…';
            try {
                var s=await deadline(P.status(), 8000, 'Native Edge bridge did not respond. Rebuild with the included plugin.');
                statusEl.textContent=s && s.available ? 'Native Edge connected · build ' + s.version + '. Ready to test a voice.' : 'Native Edge did not report readiness.';
            } catch(e) { statusEl.textContent='Native check failed: '+msg(e)+' Install the included V1.99.42 plugin and rebuild.'; }
            finally { probe.disabled=false; }
        }); group.insertBefore(probe, group.querySelector('h4'));
        var actions = el('div', 'card-actions');
        var testBtn = el('button', 'use-btn', 'Test Edge voice'); testBtn.type = 'button';
        actions.appendChild(testBtn); group.insertBefore(actions, group.querySelector('h4'));
        var stopTest = el('button', 'use-btn', 'Stop voice test'); stopTest.type = 'button';
        stopTest.addEventListener('click', function () { if (root.HorizonTTS) root.HorizonTTS.stop(); }); actions.appendChild(stopTest);

        chk.addEventListener('change', function () { setEnabled(chk.checked); lastError = ''; paint(); });
        def.addEventListener('change', function () { setDefault(def.value); cust.value = ''; });
        cust.addEventListener('change', function () {
            var s = sanitizeVoice(cust.value);
            if (!cust.value.trim()) return;
            if (!s) { statusEl.textContent = 'That is not a voice name. Use letters, numbers and dashes only.'; return; }
            setDefault(s); fillSelect(def, s, 'Aria · US female (built-in default)'); paint();
        });
        testBtn.addEventListener('click', function () {
            testVoice('', sanitizeVoice(cust.value) || def.value || defaultVoice());
        });
        var android = doc.getElementById('ttsAndroidGroup');
        if (android && android.parentNode === card) card.insertBefore(group, android); else card.appendChild(group);
        if (root.HorizonTTS && root.HorizonTTS.onState) root.HorizonTTS.onState(function (s) {
            if (s.engine === 'edge' && s.state === 'playing') statusEl.textContent = 'Playing Edge voice…';
            if (s.note && /Edge voice failed/.test(s.note)) statusEl.textContent = s.note;
        });
        root.document.addEventListener('deviceready', paint);
        paint();
    }

    /* V1.99.130: render a whole script to ONE mp3 blob (no playback). Needs HorizonEdgeVoicePlugin.renderMp3 in the APK. */
    async function renderMp3(text, opts) {
        var P = plugin();
        if (!P) throw new Error('The native Edge voice plugin is missing from this build');
        var raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        if (!raw) throw new Error('Nothing to render');
        if (raw.length > 30000) throw new Error('Script too long: 30000 characters at most');
        var chunks = raw.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [raw], out = [], cur = '';
        chunks.forEach(function (c) { if ((cur + c).length > CHUNK_CHARS && cur) { out.push(cur.trim()); cur = c; } else cur += c; });
        if (cur.trim()) out.push(cur.trim());
        var voice = sanitizeVoice(opts && opts.voice) || defaultVoice();
        var onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : null;
        var tell = function (d) { if (onProgress) { try { onProgress(d, out.length); } catch (_) { /* progress display is best effort */ } } };
        /* V1.99.131: render ONE part at a time (the plugin call is unchanged, it just gets one part) so the app can show real progress.
           MP3 frames join by simple concatenation, the same way the plugin already joins its own pieces. */
        var parts = [];
        tell(0);
        for (var ci = 0; ci < out.length; ci++) {
            var res;
            try {
                res = await deadline(Promise.resolve(P.renderMp3({ text: out[ci], chunks: [out[ci]], voice: voice, ratePct: ratePct() })), 120000, 'Edge render timed out on part ' + (ci + 1) + ' of ' + out.length + '. Check your internet and try again.');
            } catch (e) {
                var m = String(e && e.message || e);
                if (/not implemented|no such method|UNIMPLEMENTED/i.test(m)) throw new Error('This APK has no Edge render support yet. Rebuild with the V1.99.130 HorizonEdgeVoicePlugin.kt.');
                throw e;
            }
            if (!res || !res.base64) throw new Error('Edge voice returned no audio for part ' + (ci + 1) + ' of ' + out.length);
            var bin = root.atob(res.base64), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            parts.push(bytes);
            tell(ci + 1);
        }
        return new root.Blob(parts, { type: 'audio/mpeg' });
    }

    root.HorizonEdgeTTS = {
        wants: wants, play: play, stop: stop, setPaused: setPaused, failed: failed,
        voiceFor: voiceFor, setVoice: setVoice, setDefault: setDefault, enabled: enabled, setEnabled: setEnabled,
        voices: VOICES, providers: PROVIDERS, refreshVoices: refreshVoices, testVoice: testVoice, sanitizeVoice: sanitizeVoice, ratePct: ratePct, DEFAULT_VOICE: DEFAULT_VOICE, renderMp3: renderMp3
    };
    if (root.HorizonTTS && root.HorizonTTS.registerEdge) root.HorizonTTS.registerEdge(root.HorizonEdgeTTS);
    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount); else mount();
    }
})(typeof window !== 'undefined' ? window : globalThis);
