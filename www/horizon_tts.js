/* HORIZON · text to speech · V1.25.0
 *
 * Engines. You pick one under Voice quality; Horizon always falls back to the Android voice if it fails:
 *   1. Gemini        natural voice, 30 voices, uses your Gemini key(s) from API PROVIDERS PLUS KEYS
 *   2. Pollinations  natural voice, 6 voices, uses a Pollinations key (enter.pollinations.ai)
 *   3. Native        Android's own speech engine through the HorizonSpeech plugin (free, offline, unlimited)
 *   4. Web Speech    the WebView's speechSynthesis, as a last resort
 *
 * The voice is independent of the chat provider: Gemini voice works while Groq, Cohere or Pollinations answers.
 * V1.25.0: Piper is gone (it needed a 60 MB model, WASM and a module worker and did not run reliably on phones).
 * Every failure falls through to the next engine and is reported, never swallowed.
 * Exposes window.HorizonTTS. Self-contained: it does not touch the rest of the app.
 */
(function (root) {
    'use strict';

    // ------------------------------------------------------------------ config
    // Everything that depends on an outside host lives here, so a dead URL is a one-line fix.
    const GEMINI = {
        base: 'https://generativelanguage.googleapis.com/v1beta/',
        models: ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts'],
        timeoutMs: 90000,
        voices: [
            ['Kore', 'Firm'], ['Sulafat', 'Warm'], ['Achird', 'Friendly'], ['Puck', 'Upbeat'], ['Zephyr', 'Bright'], ['Charon', 'Informative'],
            ['Fenrir', 'Excitable'], ['Leda', 'Youthful'], ['Orus', 'Firm'], ['Aoede', 'Breezy'], ['Callirrhoe', 'Easy-going'], ['Autonoe', 'Bright'],
            ['Enceladus', 'Breathy'], ['Iapetus', 'Clear'], ['Umbriel', 'Easy-going'], ['Algieba', 'Smooth'], ['Despina', 'Smooth'], ['Erinome', 'Clear'],
            ['Algenib', 'Gravelly'], ['Rasalgethi', 'Informative'], ['Laomedeia', 'Upbeat'], ['Achernar', 'Soft'], ['Alnilam', 'Firm'], ['Schedar', 'Even'],
            ['Gacrux', 'Mature'], ['Pulcherrima', 'Forward'], ['Zubenelgenubi', 'Casual'], ['Vindemiatrix', 'Gentle'], ['Sadachbia', 'Lively'], ['Sadaltager', 'Knowledgeable']
        ].map(v => ({ id: v[0], name: v[0] + ' · ' + v[1] }))
    };
    const POLL = {
        url: 'https://gen.pollinations.ai/v1/audio/speech',
        model: 'tts-1',
        timeoutMs: 90000,
        voices: [
            { id: 'nova', name: 'Nova · warm female' },
            { id: 'shimmer', name: 'Shimmer · clear female' },
            { id: 'alloy', name: 'Alloy · neutral' },
            { id: 'echo', name: 'Echo · male' },
            { id: 'fable', name: 'Fable · expressive British' },
            { id: 'onyx', name: 'Onyx · deep male' }
        ]
    };
    const MAX_CHARS = { native: 3000, web: 180, gemini: 1200, pollinations: 1000 };
    const ENGINES = ['standard', 'gemini', 'pollinations'];
    const KEYS = {
        engine: 'horizon_tts_engine',
        voice: 'horizon_tts_voice',
        lang: 'horizon_tts_lang',
        rate: 'horizon_tts_rate',
        pitch: 'horizon_tts_pitch',
        gvoice: 'horizon_tts_gemini_voice',
        gmodel: 'horizon_tts_gemini_model',
        pvoice: 'horizon_tts_poll_voice',
        pkey: 'horizon_tts_poll_key'
    };

    // ----------------------------------------------------------------- helpers
    const ls = {
        get(k) { try { return root.localStorage.getItem(k); } catch (e) { return null; } },
        set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { /* storage blocked or full */ } }
    };
    const msg = e => {
        const m = (e && e.message) ? e.message : String(e == null ? 'Unknown error' : e);
        return m.length > 200 ? m.slice(0, 199) + '…' : m;
    };
    const clamp = (n, lo, hi, d) => { n = parseFloat(n); return isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
    function withTimeout(p, ms, label) {
        let t;
        const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(label)), ms); });
        return Promise.race([Promise.resolve(p), timer]).finally(() => clearTimeout(t));
    }

    // ---------------------------------------------------------------- settings
    let keysFn = null;                     // (providerId) => [key, ...backup keys], supplied by the app
    const geminiIds = GEMINI.voices.map(v => v.id);
    const pollIds = POLL.voices.map(v => v.id);
    function cloudKeys(id) {
        let list = [];
        try { list = keysFn ? keysFn(id) || [] : []; } catch (e) { list = []; }
        return list.filter((k, i, a) => typeof k === 'string' && k.trim() && k !== 'free' && a.indexOf(k) === i).map(k => k.trim());
    }
    const pollKey = () => String(ls.get(KEYS.pkey) || '').trim();
    function settings() {
        const gv = ls.get(KEYS.gvoice), pv = ls.get(KEYS.pvoice);
        let eng = ls.get(KEYS.engine);
        if (ENGINES.indexOf(eng) < 0) eng = cloudKeys('gemini').length ? 'gemini' : 'standard';   // first run, or the old Piper setting
        return {
            engine: eng,
            voice: ls.get(KEYS.voice) || '',
            lang: ls.get(KEYS.lang) || '',
            rate: clamp(ls.get(KEYS.rate), 0.5, 2, 1),
            pitch: clamp(ls.get(KEYS.pitch), 0.5, 2, 1),
            gvoice: geminiIds.indexOf(gv) >= 0 ? gv : geminiIds[0],
            pvoice: pollIds.indexOf(pv) >= 0 ? pv : pollIds[0]
        };
    }
    function set(key, value) {
        switch (key) {
            case 'engine': ls.set(KEYS.engine, ENGINES.indexOf(value) >= 0 ? value : 'standard'); break;
            case 'voice': ls.set(KEYS.voice, String(value || '')); break;
            case 'lang': ls.set(KEYS.lang, String(value || '')); break;
            case 'rate': ls.set(KEYS.rate, String(clamp(value, 0.5, 2, 1))); break;
            case 'pitch': ls.set(KEYS.pitch, String(clamp(value, 0.5, 2, 1))); break;
            case 'gvoice': if (geminiIds.indexOf(value) >= 0) ls.set(KEYS.gvoice, value); break;
            case 'pvoice': if (pollIds.indexOf(value) >= 0) ls.set(KEYS.pvoice, value); break;
            case 'pkey': ls.set(KEYS.pkey, String(value || '').trim()); break;
            default: return false;
        }
        return true;
    }

    // -------------------------------------------------- text → something speakable
    // Replies are markdown. Reading symbols, code and URLs aloud is unusable, so clean first.
    function speakable(src) {
        let t = String(src == null ? '' : src).replace(/\r\n?/g, '\n');
        t = t.replace(/```[\s\S]*?(?:```|$)/g, '\nCode block skipped.\n');
        t = t.replace(/~~~[\s\S]*?(?:~~~|$)/g, '\nCode block skipped.\n');
        t = t.replace(/<[^>\n]+>/g, ' ');
        t = t.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
        t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
        t = t.replace(/\bhttps?:\/\/\S+/gi, 'link');
        t = t.replace(/`([^`\n]+)`/g, '$1');
        t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '');
        t = t.replace(/^[ \t]*>+[ \t]?/gm, '');
        t = t.replace(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/gm, '');
        t = t.replace(/^[ \t]*\|?[ \t:|-]{3,}\|?[ \t]*$/gm, '');
        t = t.replace(/^[ \t]*\|(.+)\|[ \t]*$/gm, (m, row) => row.split('|').map(c => c.trim()).filter(Boolean).join(', '));
        t = t.replace(/\|/g, ', ');
        t = t.replace(/(\*\*|__|~~)/g, '');
        t = t.replace(/(^|[\s(])\*+([^*\n]+?)\*+(?=[\s).,!?;:]|$)/g, '$1$2');
        t = t.replace(/(^|[\s(])_+([^_\n]+?)_+(?=[\s).,!?;:]|$)/g, '$1$2');
        try { t = t.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, ''); } catch (e) { /* old engine without \p */ }
        t = t.split('\n').map(l => {
            l = l.replace(/[ \t]+/g, ' ').trim();
            return (l && !/[.!?…:;,]["')\]”’]*$/.test(l)) ? l + '.' : l;
        }).filter(Boolean).join('\n');
        return t.trim();
    }

    function hardSplit(s, max) {
        const out = [];
        while (s.length > max) {
            let cut = s.lastIndexOf(', ', max);
            if (cut < max * 0.4) cut = s.lastIndexOf(' ', max);
            if (cut <= 0) cut = max;
            out.push(s.slice(0, cut + 1).trim());
            s = s.slice(cut + 1).trim();
        }
        if (s) out.push(s);
        return out;
    }
    // Packs whole sentences into chunks no longer than max, so engines get small, natural pieces.
    function chunkText(text, max) {
        const out = [];
        let cur = '';
        const flush = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
        String(text || '').split('\n').forEach(line => {
            line = line.trim();
            if (!line) return;
            let sents;
            try { sents = line.split(/(?<=[.!?…]["')\]”’]*)\s+/); } catch (e) { sents = [line]; }
            sents.forEach(s => {
                s = s.trim();
                if (!s) return;
                if (s.length > max) { flush(); hardSplit(s, max).forEach(p => out.push(p)); return; }
                if (cur && (cur.length + 1 + s.length) > max) flush();
                cur = cur ? cur + ' ' + s : s;
            });
        });
        flush();
        return out;
    }

    // ------------------------------------------------------------ state + events
    let plugFn = null;
    let NATIVE = false;
    let nativeMissing = false;
    let nativeStop = Promise.resolve();
    let cur = null;                        // { id, tok }
    let audioEnd = null;                   // stops whatever cloud audio is playing
    let actx = null;                       // Web Audio context, created and unlocked on a tap
    let status = { state: 'idle', id: null, engine: '', error: '', note: '' };
    const listeners = new Set();
    function emit(patch) {
        status = Object.assign({}, status, { note: '', error: '' }, patch);
        listeners.forEach(fn => { try { fn(status); } catch (e) { /* a listener must never break speech */ } });
        hold(status.state === 'loading' || status.state === 'playing');
    }
    // V1.17.0: while speaking, an Android foreground service (with a Stop button) keeps the app alive in the background
    let held = false;
    function hold(on) {
        if (!NATIVE || !plugFn || held === on) return;
        held = on;
        try {
            const p = plugFn('HorizonAI');
            const f = p && (on ? p.speechHold : p.speechRelease);
            if (typeof f === 'function') Promise.resolve(f.call(p)).catch(() => { held = false; });
        } catch (e) { held = false; }
    }
    function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }

    // ------------------------------------------------------------ engine: native
    function nativePlugin() {
        if (!NATIVE || nativeMissing || !plugFn) return null;
        try { return plugFn('HorizonSpeech'); } catch (e) { return null; }
    }
    const isMissing = e => !!e && (e.code === 'UNIMPLEMENTED' || /not implemented/i.test(String(e.message || e)));
    const nativeUsable = () => !!nativePlugin();

    async function nativeVoices() {
        const p = nativePlugin();
        if (!p) return [];
        try {
            const r = await withTimeout(p.getSupportedVoices(), 8000, 'Voice list timed out');
            const arr = (r && r.voices) || [];
            return arr.map((v, i) => ({
                index: i,
                id: v.voiceURI || v.name || String(i),
                name: v.name || v.voiceURI || ('Voice ' + (i + 1)),
                lang: String(v.lang || '').replace(/_/g, '-')
            }));
        } catch (e) {
            if (isMissing(e)) nativeMissing = true;
            return [];
        }
    }

    async function runNative(chunks, tok, s, started) {
        const p = nativePlugin();
        if (!p) throw new Error('The Android voice plugin is not part of this build');
        await nativeStop;
        const voices = await nativeVoices();
        if (tok.cancelled) return;
        const v = voices.find(x => x.id === s.voice) || null;
        const langs = [v && v.lang, s.lang, root.navigator && root.navigator.language, 'en-US']
            .filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
        let li = 0, first = true;
        let startListener = null;
        let activeUtterance = '';
        try {
            startListener = await p.addListener('speechStart', ev => { if (!tok.cancelled && first && ev.id === activeUtterance) { first = false; started(); } });
        } catch (_) { /* fallback still reports success only after Android accepts speech */ }
        try {
        for (const text of chunks) {
            let done = false;
            while (!done) {
                if (tok.cancelled) return;
                activeUtterance = 'hz-' + Date.now() + '-' + Math.random().toString(36).slice(2);
                const args = { utteranceId: activeUtterance, text, lang: langs[li], rate: s.rate, pitch: s.pitch, volume: 1.0, queueStrategy: 0 };
                if (v && langs[li] === v.lang) args.voice = v.index;
                // Native speechStart, not queue submission, marks playback as started.
                try {
                    await withTimeout(p.speak(args), 20000 + (text.length / (6 * s.rate)) * 1000, 'The Android voice timed out');
                    if (first) { first = false; started(); }
                    done = true;
                } catch (e) {
                    if (tok.cancelled) return;
                    if (isMissing(e)) { nativeMissing = true; throw e; }
                    if (/timed out/i.test(msg(e))) { try { await p.stop(); } catch (x) { /* ignore */ } }
                    if (/not supported|language/i.test(msg(e)) && li < langs.length - 1) { li++; continue; }
                    throw e;
                }
            }
        }
        } finally { if (startListener) await startListener.remove(); }
    }

    // ---------------------------------------------------------- engine: Web Speech
    const webUsable = () => !!(root.speechSynthesis && typeof root.SpeechSynthesisUtterance === 'function');
    async function webVoices() {
        if (!webUsable()) return [];
        let list = root.speechSynthesis.getVoices() || [];
        if (!list.length) {
            await new Promise(res => {
                const done = () => { root.speechSynthesis.removeEventListener('voiceschanged', done); res(); };
                root.speechSynthesis.addEventListener('voiceschanged', done);
                setTimeout(done, 1500);
            });
            list = root.speechSynthesis.getVoices() || [];
        }
        return list.map((v, i) => ({ index: i, id: v.voiceURI || v.name, name: v.name, lang: v.lang || '' }));
    }
    function runWeb(chunks, tok, s, started) {
        return new Promise((resolve, reject) => {
            const synth = root.speechSynthesis;
            if (!synth) { reject(new Error('No browser voice is available')); return; }
            const voices = synth.getVoices() || [];
            const pick = voices.find(v => (v.voiceURI || v.name) === s.voice) || null;
            let i = 0, begun = false;
            const next = () => {
                if (tok.cancelled) { resolve(); return; }
                if (i >= chunks.length) { resolve(); return; }
                const u = new root.SpeechSynthesisUtterance(chunks[i++]);
                u.rate = s.rate; u.pitch = s.pitch;
                if (pick) { u.voice = pick; u.lang = pick.lang; }
                else if (s.lang) u.lang = s.lang;
                // The WebView can accept speak() and then stay silent forever. Do not wait for it.
                let guard = begun ? null : setTimeout(() => { synth.cancel(); reject(new Error('The browser voice did not start')); }, 4000);
                u.onstart = () => { if (guard) { clearTimeout(guard); guard = null; } if (!begun) { begun = true; started(); } };
                u.onend = () => { if (guard) clearTimeout(guard); next(); };
                u.onerror = ev => {
                    if (guard) clearTimeout(guard);
                    const er = ev && ev.error;
                    if (tok.cancelled || er === 'canceled' || er === 'interrupted') { resolve(); return; }
                    reject(new Error('Browser voice error: ' + (er || 'unknown')));
                };
                try { synth.speak(u); } catch (e) { if (guard) clearTimeout(guard); reject(e); }
            };
            try { synth.cancel(); } catch (e) { /* ignore */ }
            next();
        });
    }

    // ------------------------------------------------------- engines: Gemini + Pollinations (natural voices)
    // Both return a Blob that playBlob() plays through Web Audio. Calls are queued one at a time so a long reply
    // cannot burst through a free-tier rate limit, and the next chunk is fetched while the current one plays.
    let cloudQ = Promise.resolve();
    const cool = {};                       // engine -> time until which it is skipped after a limit error
    let gModel = ls.get(KEYS.gmodel) || '';

    function queued(tok, fn) {
        const run = () => { if (tok.cancelled) throw new Error('cancelled'); return fn(); };
        const p = cloudQ.then(run, run);
        cloudQ = p.catch(() => { /* keep the queue alive */ });
        return p;
    }
    async function errText(res) {
        let t = '';
        try { t = await res.text(); } catch (e) { t = ''; }
        try { const j = JSON.parse(t); if (j && j.error) t = j.error.message || (typeof j.error === 'string' ? j.error : t); } catch (e) { /* not JSON */ }
        t = String(t || '').replace(/\s+/g, ' ').trim();
        return t.length > 160 ? t.slice(0, 159) + '…' : t;
    }
    function b64ToBytes(b64) {
        const bin = root.atob(String(b64).replace(/\s+/g, ''));
        const out = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }
    function pcmToWav(pcm, rate) {
        const n = pcm.length - (pcm.length % 2);
        const buf = new ArrayBuffer(44 + n);
        const v = new DataView(buf);
        const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
        v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
        w(36, 'data'); v.setUint32(40, n, true);
        new Uint8Array(buf, 44).set(pcm.subarray(0, n));
        return new Blob([buf], { type: 'audio/wav' });
    }
    const looksLikeAudio = u8 => u8.length > 4 && (
        (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) ||                          // ID3 (mp3)
        (u8[0] === 0xFF && (u8[1] & 0xE0) === 0xE0) ||                                   // mp3 frame sync
        (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46) ||        // RIFF (wav)
        (u8[0] === 0x4F && u8[1] === 0x67 && u8[2] === 0x67 && u8[3] === 0x53));         // OggS
    const limitErr = (m, status) => { const e = new Error(m); e.status = status; e.limit = true; return e; };

    // ---- Gemini
    async function geminiCall(key, model, text, voice) {
        const res = await withTimeout(root.fetch(GEMINI.base + 'models/' + encodeURIComponent(model) + ':generateContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
            body: JSON.stringify({
                contents: [{ parts: [{ text }] }],
                generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } }
            })
        }), GEMINI.timeoutMs, 'Gemini voice took too long');
        if (!res.ok) { const e = new Error(await errText(res) || ('HTTP ' + res.status)); e.status = res.status; throw e; }
        const data = await res.json();
        const cand = data && data.candidates && data.candidates[0];
        const parts = (cand && cand.content && cand.content.parts) || [];
        const part = parts.find(p => p && p.inlineData && p.inlineData.data);
        if (!part) {
            const why = (data && data.promptFeedback && data.promptFeedback.blockReason) || (cand && cand.finishReason) || 'no audio in the reply';
            throw new Error('Gemini returned no audio (' + why + ')');
        }
        const mime = String(part.inlineData.mimeType || '');
        const bytes = b64ToBytes(part.inlineData.data);
        if (/l16|pcm|raw/i.test(mime) || !mime) {
            const m = /rate=(\d+)/i.exec(mime);
            return pcmToWav(bytes, m ? parseInt(m[1], 10) : 24000);
        }
        return new Blob([bytes], { type: mime.split(';')[0] });
    }
    async function geminiDiscover(key) {
        try {
            const res = await withTimeout(root.fetch(GEMINI.base + 'models?pageSize=200', { headers: { 'x-goog-api-key': key } }), 15000, 'Model list timed out');
            if (!res.ok) return [];
            const d = await res.json();
            return (d.models || [])
                .filter(m => /tts/i.test(m.name || '') && (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
                .map(m => String(m.name).replace(/^models\//, ''))
                .sort((a, b) => (/flash/.test(b) ? 1 : 0) - (/flash/.test(a) ? 1 : 0) || b.localeCompare(a));
        } catch (e) { return []; }
    }
    async function geminiSynth(text, voice) {
        const keys = cloudKeys('gemini');
        if (!keys.length) throw new Error('no Gemini key found. Add one under API PROVIDERS PLUS KEYS');
        let last = null, found = null;
        for (const key of keys) {
            const models = [gModel].concat(GEMINI.models).filter((m, i, a) => m && a.indexOf(m) === i);
            for (let mi = 0; mi < models.length; mi++) {
                try {
                    const blob = await geminiCall(key, models[mi], text, voice);
                    if (gModel !== models[mi]) { gModel = models[mi]; ls.set(KEYS.gmodel, gModel); }
                    return blob;
                } catch (e) {
                    last = e;
                    const gone = e.status === 404 || (e.status === 400 && /model|not found|not supported|modalit/i.test(e.message) && !/api key/i.test(e.message));
                    if (!gone) break;                                                    // key problem or limit: next key
                    if (mi === models.length - 1 && !found) {
                        found = await geminiDiscover(key);
                        found.forEach(m => { if (models.indexOf(m) < 0) models.push(m); });
                    }
                }
            }
        }
        const st = last && last.status, m = msg(last);
        if (st === 429 || /quota|exhaust|rate.?limit|too many/i.test(m)) throw limitErr('Gemini voice limit reached (' + m + ')', st);
        if (st === 400 && /api key/i.test(m)) throw new Error('the Gemini key was rejected (' + m + ')');
        if (st === 404) throw new Error('this Gemini key has no text-to-speech model available (' + m + ')');
        throw last || new Error('Gemini voice failed');
    }

    // ---- Pollinations
    async function pollSynth(text, voice) {
        const key = pollKey();
        if (!key) throw new Error('add your Pollinations key under Voice first');
        const res = await withTimeout(root.fetch(POLL.url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
            body: JSON.stringify({ model: POLL.model, input: text, voice, response_format: 'mp3' })
        }), POLL.timeoutMs, 'Pollinations voice took too long');
        if (!res.ok) {
            const m = await errText(res);
            if (res.status === 401 || res.status === 403) throw new Error('the Pollinations key was rejected (' + (m || res.status) + ')');
            if (res.status === 402) throw limitErr('Pollinations balance is used up (' + (m || '402') + ')', 402);
            if (res.status === 429) throw limitErr('Pollinations rate limit (' + (m || '429') + ')', 429);
            throw new Error('Pollinations error ' + res.status + (m ? ': ' + m : ''));
        }
        let u8 = new Uint8Array(await res.arrayBuffer());
        if (!looksLikeAudio(u8)) {
            // some WebView HTTP bridges hand binary bodies back as base64 text
            try { const dec = b64ToBytes(new TextDecoder().decode(u8)); if (looksLikeAudio(dec)) u8 = dec; } catch (e) { /* not base64 */ }
        }
        if (!looksLikeAudio(u8)) throw new Error('Pollinations did not return audio');
        return new Blob([u8], { type: (u8[0] === 0x52) ? 'audio/wav' : 'audio/mpeg' });
    }

    async function runCloud(synth, chunks, tok, s, started) {
        let next = queued(tok, () => synth(chunks[0]));
        let first = true;
        for (let i = 0; i < chunks.length; i++) {
            const blob = await next;
            if (tok.cancelled) return;
            next = i + 1 < chunks.length ? queued(tok, () => synth(chunks[i + 1])) : null;
            if (next) next.catch(() => { /* surfaced when awaited */ });
            await playBlob(blob, s.rate, () => { if (first) { first = false; started(); } });
            if (tok.cancelled) return;
        }
    }
    const runGemini = (chunks, tok, s, started) => runCloud(t => geminiSynth(t, s.gvoice), chunks, tok, s, started);
    const runPollinations = (chunks, tok, s, started) => runCloud(t => pollSynth(t, s.pvoice), chunks, tok, s, started);

    // Android can refuse to start audio that was not triggered by a tap, and cloud voices take seconds to arrive,
    // so the tap is long gone by the time the sound is ready. A Web Audio context that was created and resumed
    // during a tap stays unlocked, so it is unlocked early (on every tap) and used for playback.
    function audioCtx() {
        if (actx) return actx;
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return null;
        try { actx = new AC(); } catch (e) { actx = null; }
        return actx;
    }
    function unlockAudio() {
        try {
            const c = audioCtx();
            if (c && c.state !== 'running' && c.state !== 'closed') {
                const r = c.resume();
                if (r && typeof r.catch === 'function') r.catch(() => { /* still locked, reported at play time */ });
            }
        } catch (e) { /* nothing to unlock */ }
    }
    async function playWebAudio(blob, rate, onStart) {
        const c = audioCtx();
        if (!c) throw new Error('Web Audio is not available');
        if (c.state !== 'running') {
            try { await withTimeout(c.resume(), 2000, 'resume timed out'); } catch (e) { /* checked below */ }
        }
        if (c.state !== 'running') throw new Error('Android has the audio locked (' + c.state + ')');
        const ab = await blob.arrayBuffer();
        const buf = await new Promise((res, rej) => {
            const p = c.decodeAudioData(ab, res, rej);
            if (p && typeof p.catch === 'function') p.catch(rej);
        });
        return new Promise((resolve, reject) => {
            const srcNode = c.createBufferSource();
            srcNode.buffer = buf;
            srcNode.playbackRate.value = clamp(rate, 0.5, 2, 1);
            srcNode.connect(c.destination);
            let fin = false;
            const stopFn = () => end();
            const end = err => {
                if (fin) return;
                fin = true;
                srcNode.onended = null;
                try { srcNode.stop(); } catch (e) { /* already stopped */ }
                try { srcNode.disconnect(); } catch (e) { /* already disconnected */ }
                if (audioEnd === stopFn) audioEnd = null;
                err ? reject(err) : resolve();
            };
            audioEnd = stopFn;
            srcNode.onended = () => end();
            try { srcNode.start(0); if (onStart) onStart(); } catch (e) { end(e); }
        });
    }
    function playElement(blob, rate, onStart) {
        return new Promise((resolve, reject) => {
            const url = root.URL.createObjectURL(blob);
            const a = new root.Audio(url);
            let fin = false;
            const stopFn = () => end();
            const end = err => {
                if (fin) return;
                fin = true;
                try { a.pause(); } catch (e) { /* ignore */ }
                root.URL.revokeObjectURL(url);
                if (audioEnd === stopFn) audioEnd = null;
                err ? reject(err) : resolve();
            };
            audioEnd = stopFn;
            a.playbackRate = clamp(rate, 0.5, 2, 1);
            a.onended = () => end();
            a.onerror = () => end(new Error('Audio playback failed'));
            a.onplaying = () => { if (onStart) { const f = onStart; onStart = null; f(); } };
            const pr = a.play();
            if (pr && typeof pr.catch === 'function') pr.catch(e => end(new Error('The audio element was refused: ' + msg(e))));
        });
    }
    async function playBlob(blob, rate, onStart) {
        let began = false;
        const mark = () => { began = true; if (onStart) onStart(); };
        try {
            await playWebAudio(blob, rate, mark);
            return;
        } catch (e1) {
            if (began) throw e1;                       // it was already playing: do not restart it
            try {
                await playElement(blob, rate, mark);
                return;
            } catch (e2) {
                if (began) throw e2;
                throw new Error('The voice audio was made but Android would not play it (' + msg(e1) + '; ' + msg(e2) + ')');
            }
        }
    }

    // ------------------------------------------------------------- orchestration
    const RUN = { gemini: runGemini, pollinations: runPollinations, native: runNative, web: runWeb };
    const LABEL = { gemini: 'Gemini voice', pollinations: 'Pollinations voice', native: 'Android voice', web: 'Browser voice' };

    function stop(silent) {
        const c = cur;
        cur = null;
        if (c) {
            c.tok.cancelled = true;
            try { const p = nativePlugin(); if (p && typeof p.stop === 'function') nativeStop = Promise.resolve(p.stop()).catch(() => {}); } catch (e) { /* ignore */ }
            try { if (webUsable()) root.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        }
        if (audioEnd) { try { audioEnd(); } catch (e) { /* ignore */ } }
        if (!silent && (c || status.state !== 'idle')) emit({ state: 'idle', id: null, engine: '', error: '' });
    }

    async function speak(id, rawText) {
        unlockAudio();                                 // must run synchronously inside the tap
        stop(true);
        const tok = { cancelled: false };
        cur = { id, tok };
        const s = settings();
        const text = speakable(rawText);
        if (!text) {
            emit({ state: 'error', id, error: 'There is nothing to read aloud in this reply.' });
            cur = null;
            emit({ state: 'idle', id: null, engine: '' });
            return false;
        }
        emit({ state: 'loading', id, engine: '', error: '' });
        const order = [];
        if (s.engine === 'gemini' || s.engine === 'pollinations') order.push(s.engine);
        order.push('native', 'web');
        const errors = [];
        for (const eng of order) {
            if (tok.cancelled) return false;
            if (eng === 'native' && !nativeUsable()) continue;
            if (eng === 'web' && !webUsable()) continue;
            if (cool[eng] && cool[eng] > Date.now()) { errors.push(LABEL[eng].toLowerCase() + ' is at its limit, trying again in a minute'); continue; }
            let began = false;
            try {
                emit({ engine: eng });
                await RUN[eng](chunkText(text, MAX_CHARS[eng]), tok, s, () => {
                    began = true;
                    if (!tok.cancelled) emit({ state: 'playing', id, engine: eng });
                });
                if (tok.cancelled) return false;
                cur = null;
                emit({
                    state: 'idle', id: null, engine: '', error: '',
                    note: errors.length ? 'Used the ' + LABEL[eng].toLowerCase() + ' instead: ' + errors[0] + '.' : ''
                });
                return true;
            } catch (e) {
                if (tok.cancelled) return false;
                if (e && e.limit) cool[eng] = Date.now() + 60000;
                if (began) { errors.push(LABEL[eng] + ' stopped: ' + msg(e)); break; }   // already speaking, so do not restart from the top
                errors.push(LABEL[eng].toLowerCase() + ' failed (' + msg(e) + ')');
            }
        }
        if (tok.cancelled) return false;
        cur = null;
        const why = errors.length
            ? errors.join('. ')
            : 'No voice engine is available on this device. Install Speech Services by Google in Android settings.';
        emit({ state: 'error', id, error: why });
        emit({ state: 'idle', id: null, engine: '' });
        return false;
    }

    function toggle(id, text) {
        if (status.id === id && (status.state === 'loading' || status.state === 'playing')) { stop(); return Promise.resolve(false); }
        return speak(id, text);
    }
    const TEST_LINE = 'This is how Horizon sounds. Strategy over impulse.';
    const test = () => toggle('test', TEST_LINE);

    // ------------------------------------------------------------------ voices UI
    let dispNames = null;
    try { dispNames = new Intl.DisplayNames([(root.navigator && root.navigator.language) || 'en'], { type: 'language' }); } catch (e) { dispNames = null; }
    function langInfo(tag) {
        const raw = String(tag || '').replace(/_/g, '-');
        const parts = raw.split('-');
        const key = parts.length > 1 ? parts[0].toLowerCase() + '-' + parts.slice(1).join('-').toUpperCase() : raw.toLowerCase();
        let name = '';
        if (dispNames && key) { try { name = dispNames.of(key) || ''; } catch (e) { name = ''; } }
        return { key: key || 'und', name: (name && name !== key) ? name : (key || 'Unknown language') };
    }
    // Android engine names look like "en-us-x-tpd-network". Turn that into something a person can pick.
    function voiceLabel(v, li) {
        const nm = String(v.name || '');
        const net = /network/i.test(nm), loc = /local|embedded/i.test(nm);
        const gender = /female/i.test(nm) ? 'female' : (/(^|[^a-z])male/i.test(nm) ? 'male' : '');
        const code = /-x-([a-z0-9]+)/i.exec(nm);
        const plain = /language$/i.test(nm) || nm.toLowerCase() === String(li.key).toLowerCase() || nm.toLowerCase() === String(v.lang).toLowerCase();
        const bits = [code ? 'Voice ' + code[1].toUpperCase() : (plain ? 'Standard voice' : nm)];
        if (gender) bits.push(gender);
        if (net) bits.push('online'); else if (loc) bits.push('offline');
        return bits.join(' · ');
    }
    let voiceCache = null, voiceCacheAt = 0;
    async function listVoices(force) {
        if (!force && voiceCache && Date.now() - voiceCacheAt < 20000) return voiceCache;
        let source = 'native', list = await nativeVoices();
        if (!list.length) { source = 'web'; list = await webVoices(); }
        const mine = String((root.navigator && root.navigator.language) || 'en-US').replace(/_/g, '-').toLowerCase();
        const mineLang = mine.split('-')[0];
        const enriched = list.map(v => {
            const li = langInfo(v.lang);
            return Object.assign({}, v, { langKey: li.key, langName: li.name, label: voiceLabel(v, li) });
        });
        // the phone's own accent first, then the rest of that language, then English, then everything else
        const rank = v => {
            const k = v.langKey.toLowerCase();
            return k === mine ? 0 : (k.split('-')[0] === mineLang ? 1 : (k.split('-')[0] === 'en' ? 2 : 3));
        };
        enriched.sort((a, b) => rank(a) - rank(b) || a.langName.localeCompare(b.langName) || a.langKey.localeCompare(b.langKey) || a.label.localeCompare(b.label));
        // tell apart voices that ended up with the same label
        const seen = {};
        enriched.forEach(v => { const k = v.langKey + '|' + v.label; seen[k] = (seen[k] || 0) + 1; });
        const run = {};
        enriched.forEach(v => {
            const k = v.langKey + '|' + v.label;
            if (seen[k] > 1) { run[k] = (run[k] || 0) + 1; v.label += ' ' + run[k]; }
        });
        const langs = [];
        enriched.forEach(v => {
            let l = langs[langs.length - 1];
            if (!l || l.key !== v.langKey) { l = { key: v.langKey, name: v.langName, count: 0 }; langs.push(l); }
            l.count++;
        });
        voiceCache = { source, voices: enriched, langs };
        voiceCacheAt = Date.now();
        return voiceCache;
    }
    async function diagnose() {
        const l = await listVoices();
        let audio = 'unsupported';
        if (actx) audio = actx.state === 'running' ? 'ready' : (actx.state === 'suspended' ? 'unlocks when you tap a speaker button' : actx.state);
        else if (root.AudioContext || root.webkitAudioContext) audio = 'unlocks when you tap a speaker button';
        return {
            native: NATIVE,
            nativePlugin: !!nativePlugin(),
            source: l.voices.length ? l.source : 'none',
            count: l.voices.length,
            langCount: l.langs.length,
            geminiKeys: cloudKeys('gemini').length,
            pollKey: !!pollKey(),
            audio
        };
    }
    function describe() {
        const s = settings();
        if (s.engine === 'gemini') {
            if (!cloudKeys('gemini').length) return 'Gemini voice needs a key. Using the Android voice for now.';
            return 'Natural voice (Gemini · ' + s.gvoice + ')';
        }
        if (s.engine === 'pollinations') {
            if (!pollKey()) return 'Pollinations voice needs a key. Using the Android voice for now.';
            const v = POLL.voices.find(x => x.id === s.pvoice);
            return 'Natural voice (Pollinations · ' + (v ? v.name.split(' · ')[0] : s.pvoice) + ')';
        }
        if (nativeUsable()) return 'Standard voice (Android)';
        if (webUsable()) return 'Standard voice (browser)';
        return 'No voice engine found';
    }

    function init(opts) {
        opts = opts || {};
        plugFn = typeof opts.plug === 'function' ? opts.plug : null;
        keysFn = typeof opts.keys === 'function' ? opts.keys : null;
        NATIVE = !!opts.native;
        if (root.document) {
            // V1.17.0: the Android app keeps speaking after you leave it. Only a browser tab stops when hidden.
            root.document.addEventListener('visibilitychange', () => { if (root.document.hidden && !NATIVE) stop(); });
            // any tap unlocks the Web Audio context, so cloud voices can play after the network wait without a fresh tap
            ['click', 'touchend', 'keydown'].forEach(ev => root.document.addEventListener(ev, unlockAudio, { capture: true, passive: true }));
        }
        root.addEventListener('pagehide', () => { if (!NATIVE) stop(true); });
    }

    root.HorizonTTS = {
        init, settings, set, speak, toggle, stop, test, onState, listVoices, describe, diagnose,
        status: () => status,
        speakable, chunkText,
        cloud: {
            gemini: { voices: GEMINI.voices, keyCount: () => cloudKeys('gemini').length },
            pollinations: { voices: POLL.voices, hasKey: () => !!pollKey() }
        }
    };
})(window);
