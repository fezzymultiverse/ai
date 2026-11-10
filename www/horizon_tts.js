/* HORIZON · text to speech · V1.93.0
 *
 * V1.93.0: HD VOICE. Kokoro (open source, Apache-2.0) is one tap away from Settings > Voice (HorizonTTS.hd), listed best voices first.
 *   Speed is now made INSIDE the model for the on-phone voices (clean timing, no pitch shift); pitch stays a separate playback control.
 *   The first sentence of an on-phone voice is cut shorter so the sound starts sooner on a slow phone.
 *
 * V1.86.0: VOICE LIBRARY. Under Voice > Built-in voice you can download human-sounding voices (Kokoro, Piper) once; they then run offline through the same sherpa-onnx
 *   runtime as the bundled Kitten voice. The plugin downloads and unpacks them into app storage (HorizonVoice.download / packs / removePack).
 *
 * Engines. You pick one under Voice; Horizon always falls back to the Android voice if it fails:
 *   1. Gemini   natural voice, 30 voices, uses your Gemini key(s) from API PROVIDERS PLUS KEYS
 *   2. Kokoro   V1.75.0: Kitten nano, 8 English voices (4 female + 4 male), built INTO the app (sherpa-onnx, native). Small. NO key, NO download, NO limit, offline.
 *               V1.73.0: replaces the WebView Kokoro (kokoro-js), which could not load its model through the app's network layer.
 *   3. Native   Android's own speech engine through the HorizonSpeech plugin (free, offline, unlimited)
 *   4. Web Speech  the WebView's speechSynthesis, as a last resort
 * V1.73.0: Pollinations and OpenAI voices are removed (they needed keys).
 *
 * The voice is independent of the chat provider: Gemini voice works while Groq, Cohere or Pollinations answers.
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
    const MAX_CHARS = { native: 3000, web: 180, gemini: 1200, kokoro: 300, gcloud: 1200 };
    const ENGINES = ['standard', 'gemini', 'kokoro', 'gcloud'];
    // V1.75.0: KITTEN nano replaces Kokoro (Kokoro was too big). Same engine id 'kokoro' so saved settings keep working. The open Kitten nano model and the sherpa-onnx runtime are packed INSIDE the APK by the build
    // (scripts/bundle-voice.sh). HorizonVoicePlugin.kt unpacks the model once into app storage, loads it, and makes each sentence on the phone.
    // Speaker ids are the order of kokoro-multi-lang-v1_0 (voices.bin): af_*, am_*, bf_*, bm_* come first, then the other languages.
    const KOKORO = {
        loadMs: 60000,
        genMs: 45000,
        // V1.75.0: Kitten nano. 8 English voices in voices.bin order: male, female, male, female ... (speaker ids 0-7). Female listed first.
        // If a voice sounds the wrong gender on your phone, swap the two sid numbers here, it is a one-line fix.
        voices: [
            ['kt_f1', 1, 'Female 1 \u00b7 clear'], ['kt_f2', 3, 'Female 2'], ['kt_f3', 5, 'Female 3'], ['kt_f4', 7, 'Female 4'],
            ['kt_m1', 0, 'Male 1 \u00b7 clear'], ['kt_m2', 2, 'Male 2'], ['kt_m3', 4, 'Male 3'], ['kt_m4', 6, 'Male 4']
        ].map(v => ({ id: v[0], sid: v[1], name: v[2] }))
    };
    // V1.86.0: VOICE LIBRARY. Downloaded packs add voices to the Built-in list. A pack is one official sherpa-onnx archive (k2-fsa/sherpa-onnx, release tts-models).
    // Kokoro speaker ids follow kokoro-multi-lang-v1_0 (voices.bin): af 0-10, am 11-19, bf 20-23, bm 24-27. Piper packs have one speaker (sid 0).
    // Sizes are approximate. If a download link ever dies it is a one-line fix here, or the plugin shows the HTTP error.
    const REL = 'https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/';
    const kok = (n, sid, label) => ['kk_' + n, sid, label];
    const HD_PACK = 'kokoro';            // V1.93.0: the one-tap HD voice is the Kokoro pack
    const HD_BEST = 'kk_af_heart';
    const PACKS = [
        { id: 'kokoro', name: 'Kokoro', size: 'about 130 MB', url: REL + 'kokoro-int8-multi-lang-v1_0.tar.bz2',
          note: 'HD voice. The most human voices here: 28 English voices, US and UK, best ones first (\u2605). Open source (Apache-2.0). The biggest pack and the slowest to speak on a weak phone.',
          voices: [
            kok('af_heart', 3, 'Heart \u00b7 US female \u2605 best'), kok('af_bella', 2, 'Bella \u00b7 US female \u2605'), kok('af_nicole', 6, 'Nicole \u00b7 US female \u2605 calm'),
            kok('am_fenrir', 14, 'Fenrir \u00b7 US male \u2605'), kok('am_michael', 16, 'Michael \u00b7 US male \u2605'), kok('am_puck', 18, 'Puck \u00b7 US male \u2605'),
            kok('bf_emma', 21, 'Emma \u00b7 UK female \u2605'), kok('bm_fable', 25, 'Fable \u00b7 UK male'), kok('bm_george', 26, 'George \u00b7 UK male'),
            kok('af_kore', 5, 'Kore \u00b7 US female'), kok('af_sarah', 9, 'Sarah \u00b7 US female'), kok('af_aoede', 1, 'Aoede \u00b7 US female'),
            kok('af_alloy', 0, 'Alloy \u00b7 US female'), kok('af_nova', 7, 'Nova \u00b7 US female'), kok('af_sky', 10, 'Sky \u00b7 US female'),
            kok('af_jessica', 4, 'Jessica \u00b7 US female'), kok('af_river', 8, 'River \u00b7 US female'),
            kok('bf_isabella', 22, 'Isabella \u00b7 UK female'), kok('bf_alice', 20, 'Alice \u00b7 UK female'), kok('bf_lily', 23, 'Lily \u00b7 UK female'),
            kok('bm_daniel', 24, 'Daniel \u00b7 UK male'), kok('bm_lewis', 27, 'Lewis \u00b7 UK male'),
            kok('am_adam', 11, 'Adam \u00b7 US male'), kok('am_eric', 13, 'Eric \u00b7 US male'), kok('am_liam', 15, 'Liam \u00b7 US male'),
            kok('am_onyx', 17, 'Onyx \u00b7 US male'), kok('am_echo', 12, 'Echo \u00b7 US male'), kok('am_santa', 19, 'Santa \u00b7 US male')
          ] },
        { id: 'piper-lessac-high', name: 'Lessac (high)', size: 'about 110 MB', url: REL + 'vits-piper-en_US-lessac-high.tar.bz2',
          note: 'US English, female, calm and clear. Piper high quality, one voice.', voices: [['pp_lessac_high', 0, 'Lessac \u00b7 US female']] },
        { id: 'piper-ryan-high', name: 'Ryan (high)', size: 'about 110 MB', url: REL + 'vits-piper-en_US-ryan-high.tar.bz2',
          note: 'US English, male, natural and steady. Piper high quality, one voice.', voices: [['pp_ryan_high', 0, 'Ryan \u00b7 US male']] },
        { id: 'piper-lessac-low', name: 'Lessac (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_US-lessac-low.tar.bz2',
          note: 'US English, female. The lightest and fastest, a clear step up from the Android voice. Try this first.', voices: [['pp_lessac_low', 0, 'Lessac \u00b7 US female (small)']] },
        { id: 'piper-ryan-low', name: 'Ryan (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_US-ryan-low.tar.bz2',
          note: 'US English, male. Light and fast.', voices: [['pp_ryan_low', 0, 'Ryan \u00b7 US male (small)']] },
        { id: 'piper-amy-low', name: 'Amy (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_US-amy-low.tar.bz2',
          note: 'US English, female, warm. Light and fast.', voices: [['pp_amy_low', 0, 'Amy \u00b7 US female (small)']] },
        { id: 'piper-lessac-medium', name: 'Lessac (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-lessac-medium.tar.bz2',
          note: 'Same voice as Lessac high, smaller and quicker.', voices: [['pp_lessac_medium', 0, 'Lessac \u00b7 US female (light)']] },
        { id: 'piper-ryan-medium', name: 'Ryan (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-ryan-medium.tar.bz2',
          note: 'Same voice as Ryan high, smaller and quicker.', voices: [['pp_ryan_medium', 0, 'Ryan \u00b7 US male (light)']] },
        { id: 'piper-amy-medium', name: 'Amy (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-amy-medium.tar.bz2',
          note: 'US English, female, warm.', voices: [['pp_amy_medium', 0, 'Amy \u00b7 US female']] },
        { id: 'piper-joe-medium', name: 'Joe (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-joe-medium.tar.bz2',
          note: 'US English, male, relaxed.', voices: [['pp_joe_medium', 0, 'Joe \u00b7 US male']] },
        { id: 'piper-alan-medium', name: 'Alan (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_GB-alan-medium.tar.bz2',
          note: 'British English, male.', voices: [['pp_alan_medium', 0, 'Alan \u00b7 UK male']] },
        { id: 'piper-hfc-female-medium', name: 'HFC Female (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-hfc_female-medium.tar.bz2',
          note: 'US English, female.', voices: [['pp_hfc_f', 0, 'HFC \u00b7 US female']] },
        { id: 'piper-hfc-male-medium', name: 'HFC Male (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-hfc_male-medium.tar.bz2',
          note: 'US English, male.', voices: [['pp_hfc_m', 0, 'HFC \u00b7 US male']] },
        { id: 'piper-kristin-medium', name: 'Kristin (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-kristin-medium.tar.bz2',
          note: 'US English, female.', voices: [['pp_kristin', 0, 'Kristin \u00b7 US female']] },
        { id: 'piper-norman-medium', name: 'Norman (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-norman-medium.tar.bz2',
          note: 'US English, male.', voices: [['pp_norman', 0, 'Norman \u00b7 US male']] },
        { id: 'piper-john-medium', name: 'John (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-john-medium.tar.bz2',
          note: 'US English, male.', voices: [['pp_john', 0, 'John \u00b7 US male']] },
        { id: 'piper-kusal-medium', name: 'Kusal (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-kusal-medium.tar.bz2',
          note: 'US English, male.', voices: [['pp_kusal', 0, 'Kusal \u00b7 US male']] },
        { id: 'piper-ljspeech-medium', name: 'LJSpeech (medium)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-ljspeech-medium.tar.bz2',
          note: 'US English, female, audiobook style.', voices: [['pp_lj_medium', 0, 'LJSpeech \u00b7 US female']] },
        { id: 'piper-ljspeech-high', name: 'LJSpeech (high)', size: 'about 110 MB', url: REL + 'vits-piper-en_US-ljspeech-high.tar.bz2',
          note: 'Same voice, higher quality.', voices: [['pp_lj_high', 0, 'LJSpeech \u00b7 US female (high)']] },
        { id: 'piper-danny-low', name: 'Danny (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_US-danny-low.tar.bz2',
          note: 'US English, male. Light and fast.', voices: [['pp_danny_low', 0, 'Danny \u00b7 US male (small)']] },
        { id: 'piper-kathleen-low', name: 'Kathleen (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_US-kathleen-low.tar.bz2',
          note: 'US English, female. Light and fast.', voices: [['pp_kathleen_low', 0, 'Kathleen \u00b7 US female (small)']] },
        { id: 'piper-alan-low', name: 'Alan (small)', size: 'small, roughly 20-30 MB', url: REL + 'vits-piper-en_GB-alan-low.tar.bz2',
          note: 'British English, male. Light and fast.', voices: [['pp_alan_low', 0, 'Alan \u00b7 UK male (small)']] },
        { id: 'piper-glados', name: 'GLaDOS', size: 'about 60 MB', url: REL + 'vits-piper-en_US-glados.tar.bz2',
          note: 'The Portal robot voice, just for fun.', voices: [['pp_glados', 0, 'GLaDOS \u00b7 robot']] },
        { id: 'piper-libritts-r-medium', name: 'LibriTTS-R (medium, many speakers)', size: 'about 60 MB', url: REL + 'vits-piper-en_US-libritts_r-medium.tar.bz2',
          note: 'Hundreds of different real speakers in one pack. The first 12 are listed as Speaker 1-12, so you can hear which sound good.',
          voices: [['pp_ltr_0', 0, 'Speaker 1'], ['pp_ltr_1', 1, 'Speaker 2'], ['pp_ltr_2', 2, 'Speaker 3'], ['pp_ltr_3', 3, 'Speaker 4'], ['pp_ltr_4', 4, 'Speaker 5'], ['pp_ltr_5', 5, 'Speaker 6'], ['pp_ltr_6', 6, 'Speaker 7'], ['pp_ltr_7', 7, 'Speaker 8'], ['pp_ltr_8', 8, 'Speaker 9'], ['pp_ltr_9', 9, 'Speaker 10'], ['pp_ltr_10', 10, 'Speaker 11'], ['pp_ltr_11', 11, 'Speaker 12']] }
    ];
    KOKORO.voices.forEach(v => { v.pack = 'builtin'; });
    const KOK_BASE = KOKORO.voices.slice();
    const CLOUD = ['gemini', 'kokoro', 'gcloud'];
    const KEYS = {
        engine: 'horizon_tts_engine',
        voice: 'horizon_tts_voice',
        lang: 'horizon_tts_lang',
        rate: 'horizon_tts_rate',
        pitch: 'horizon_tts_pitch',
        gvoice: 'horizon_tts_gemini_voice',
        gmodel: 'horizon_tts_gemini_model',
        kvoice: 'horizon_tts_kokoro_voice',
        nengine: 'horizon_tts_native_engine',
        packs: 'horizon_tts_packs'
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
    function cloudKeys(id) {
        let list = [];
        try { list = keysFn ? keysFn(id) || [] : []; } catch (e) { list = []; }
        return list.filter((k, i, a) => typeof k === 'string' && k.trim() && k !== 'free' && a.indexOf(k) === i).map(k => k.trim());
    }
    let packsFlight = null;
    let kokIds = KOKORO.voices.map(v => v.id);
    // V1.86.0: the Built-in voice list = bundled Kitten voices + the voices of every downloaded pack. Rebuilt in place (the app holds a reference to this array).
    function packsInstalled() {
        try { const a = JSON.parse(ls.get(KEYS.packs) || '[]'); return Array.isArray(a) ? a.filter(x => typeof x === 'string') : []; } catch (e) { return []; }
    }
    function rebuildVoices() {
        const have = packsInstalled();
        KOKORO.voices.length = 0;
        // V1.93.0: downloaded voices come first (HD Kokoro before Piper, as the catalog is ordered), the 8 small built-in voices last
        PACKS.forEach(pk => {
            if (have.indexOf(pk.id) < 0) return;
            pk.voices.forEach(v => KOKORO.voices.push({ id: v[0], sid: v[1], name: v[2] + (pk.id === 'kokoro' ? ' (Kokoro)' : ' (Piper)'), pack: pk.id }));
        });
        KOK_BASE.forEach(v => KOKORO.voices.push(v));
        kokIds = KOKORO.voices.map(v => v.id);
    }
    rebuildVoices();
    function settings() {
        const gv = ls.get(KEYS.gvoice), kv = ls.get(KEYS.kvoice);
        let eng = ls.get(KEYS.engine);
        if (eng === 'freetts' || eng === 'ttsai' || eng === 'edge' || eng === 'pollinations' || eng === 'openai') eng = 'kokoro';   // Edge, TTS.ai (V1.67.5) and Pollinations, OpenAI (V1.73.0) were removed; Kokoro replaces them
        if (eng === 'sherpa') eng = 'standard';   // V1.47.0: Piper is gone, so an old Piper pick becomes the Android voice
        if (ENGINES.indexOf(eng) < 0) eng = 'standard';   // first run: Android/browser voice needs no model unpacking
        return {
            engine: eng,
            voice: ls.get(KEYS.voice) || '',
            lang: ls.get(KEYS.lang) || '',
            rate: clamp(ls.get(KEYS.rate), 0.5, 2, 1),
            pitch: clamp(ls.get(KEYS.pitch), 0.5, 2, 1),
            gvoice: geminiIds.indexOf(gv) >= 0 ? gv : geminiIds[0],
            kvoice: kokIds.indexOf(kv) >= 0 ? kv : kokIds[0],
            nengine: String(ls.get(KEYS.nengine) || '').trim()
        };
    }

    // V1.64.0: GROUP VOICES. In a group chat each AI takes the next voice along on the engine already picked in Settings, so you hear who is
    // talking. Slot 0 is your own pick; slot 1, 2, 3 step through that engine's voice list, wrapping round. Nothing is saved.
    function slotPick(ids, cur, slot) {
        if (!ids.length) return cur;
        const at = Math.max(0, ids.indexOf(cur));
        return ids[(at + slot * 3) % ids.length];       // a step of 3 skips the near-twin neighbours in the lists
    }
    function applySlot(s, slot) {
        slot = slot | 0;
        s.slot = slot > 0 ? slot : 0;
        if (!s.slot) return s;
        if (s.engine === 'gemini') s.gvoice = slotPick(geminiIds, s.gvoice, s.slot);
        else if (s.engine === 'kokoro') { const cv = KOKORO.voices.find(x => x.id === s.kvoice); const same = KOKORO.voices.filter(x => !cv || x.pack === cv.pack).map(x => x.id); s.kvoice = slotPick(same, s.kvoice, s.slot); }
        return s;
    }
    // the Android / browser voice list loads later, so those engines resolve the slot where the list is in hand
    function slotVoice(list, wantId, lang, slot) {
        if (!slot || !list.length) return null;
        const cur = list.find(x => x.id === wantId) || null;
        const base = String((cur && cur.lang) || lang || (root.navigator && root.navigator.language) || 'en').slice(0, 2).toLowerCase();
        const same = list.filter(x => String(x.lang || '').slice(0, 2).toLowerCase() === base);
        const pool = same.length > 1 ? same : list;
        const at = Math.max(0, pool.findIndex(x => cur && x.id === cur.id));
        return pool[(at + slot) % pool.length] || null;
    }
    // for the app: which voice a slot would use right now (used for labels)
    function voiceFor(slot) { const s = applySlot(settings(), slot); return { engine: s.engine, gemini: s.gvoice, kokoro: s.kvoice }; }
    function set(key, value) {
        switch (key) {
            case 'engine': ls.set(KEYS.engine, ENGINES.indexOf(value) >= 0 ? value : 'standard'); break;
            case 'voice': ls.set(KEYS.voice, String(value || '')); break;
            case 'lang': ls.set(KEYS.lang, String(value || '')); break;
            case 'rate': ls.set(KEYS.rate, String(clamp(value, 0.5, 2, 1))); break;
            case 'pitch': ls.set(KEYS.pitch, String(clamp(value, 0.5, 2, 1))); break;
            case 'gvoice': if (geminiIds.indexOf(value) >= 0) ls.set(KEYS.gvoice, value); break;
            case 'kvoice': if (kokIds.indexOf(value) >= 0) ls.set(KEYS.kvoice, value); break;
            case 'nengine': ls.set(KEYS.nengine, String(value || '').trim()); voiceCache = null; break;
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

    // Cloud voices are generated whole before they play, so a short first piece starts the sound much sooner.
    // V1.93.0: the on-phone voices make audio slower than they play it on a weak phone, so their first piece is cut shorter (about one sentence).
    function fastFirst(chunks, head1) {
        const lim = head1 || 150;
        if (!chunks.length || chunks[0].length <= lim + 20) return chunks;
        const head = chunkText(chunks[0], lim);
        if (head.length < 2) return chunks;
        return [head[0], head.slice(1).join(' ')].concat(chunks.slice(1));
    }

    // ------------------------------------------------------------ state + events
    let plugFn = null;
    let NATIVE = false;
    let nativeMissing = false;
    let nativeStop = Promise.resolve();
    let cur = null;                        // { id, tok }
    let utterSeq = 0; // unique native WAV playback event ids
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
    let held = false, relTimer = 0, queuedN = 0;
    // V1.64.0: the service is let go 1.2 s after speech ends, not at once, so between two queued replies the lock-screen controls
    // and the notification stay put instead of vanishing and coming back.
    function hold(on) {
        if (!NATIVE || !plugFn) return;
        if (on) {
            if (relTimer) { clearTimeout(relTimer); relTimer = 0; }
            if (held) return;
            held = true;
            try {
                const p = plugFn('HorizonAI');
                if (p && typeof p.speechHold === 'function') Promise.resolve(p.speechHold({ paused: !!paused, queued: queuedN })).catch(() => { held = false; });
            } catch (e) { held = false; }
        } else {
            if (!held || relTimer) return;
            relTimer = setTimeout(() => {
                relTimer = 0;
                if (!held) return;
                held = false;
                try {
                    const p = plugFn('HorizonAI');
                    if (p && typeof p.speechRelease === 'function') Promise.resolve(p.speechRelease()).catch(() => {});
                } catch (e) { /* ignore */ }
            }, 1200);
        }
    }
    function onState(fn) { listeners.add(fn); return () => listeners.delete(fn); }
    // V1.63.7: tell the notification whether it should show Pause or Resume
    function holdPaint() {
        if (!NATIVE || !plugFn || !held) return;
        try { const p = plugFn('HorizonAI'); if (p && typeof p.speechHold === 'function') Promise.resolve(p.speechHold({ paused: !!paused, queued: queuedN })).catch(() => {}); } catch (e) { /* ignore */ }
    }
    // V1.64.0: auto-read tells the notification how many replies are waiting behind the one being read
    function setQueued(n) { n = Math.max(0, Math.min(99, n | 0)); if (n === queuedN) return; queuedN = n; holdPaint(); }

    // ------------------------------------------------------------ engine: native
    function nativePlugin() {
        if (!NATIVE || nativeMissing || !plugFn) return null;
        try { return plugFn('HorizonSpeech'); } catch (e) { return null; }
    }
    const isMissing = e => !!e && (e.code === 'UNIMPLEMENTED' || /not implemented/i.test(String(e.message || e)));
    const nativeUsable = () => !!nativePlugin();

    // V1.47.0: which speech engine Android uses (Google, Samsung, an engine app...). '' = the phone's default.
    let engineApplied = null;               // null = nothing sent to the plugin yet this run
    async function applyEngine(p) {
        const want = settings().nengine || '';
        if (engineApplied === want) return;
        try {
            const r = await withTimeout(p.setEngine({ engine: want }), 15000, 'it took too long to start');
            engineApplied = (r && r.failed) ? '' : want;
            if (r && r.failed) { ls.set(KEYS.nengine, ''); voiceCache = null; throw new Error('it would not start, so Horizon went back to the phone default'); }
        } catch (e) {
            if (isMissing(e)) { engineApplied = want; return; }     // an older build without engine choice
            if (want) { ls.set(KEYS.nengine, ''); engineApplied = ''; voiceCache = null; }
            throw new Error('The speech engine you picked failed (' + msg(e) + '). Back on the phone default. Tap Test again');
        }
    }
    async function listEngines() {
        const p = nativePlugin();
        if (!p) return { engines: [], def: '', selected: '' };
        try {
            const r = await withTimeout(p.getEngines(), 8000, 'Engine list timed out');
            return { engines: (r && r.engines) || [], def: (r && r.default) || '', selected: settings().nengine || '' };
        } catch (e) {
            if (isMissing(e)) return { engines: [], def: '', selected: '' };
            return { engines: [], def: '', selected: '' };
        }
    }

    async function nativeVoices() {
        const p = nativePlugin();
        if (!p) return [];
        try {
            await applyEngine(p);
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
        await applyEngine(p);                         // throws a readable error if the picked engine will not start
        const voices = await nativeVoices();
        if (tok.cancelled) return;
        const v = (s.slot ? slotVoice(voices, s.voice, s.lang, s.slot) : null) || voices.find(x => x.id === s.voice) || null;
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
                    if (paused) { await waitResume(); if (tok.cancelled) return; await nativeStop; continue; }   // V1.63.7: paused mid-sentence, say it again on Resume
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
    let webUtterance = null; // some WebViews garbage-collect an unreferenced utterance before playback
    function runWeb(chunks, tok, s, started) {
        return new Promise((resolve, reject) => {
            const synth = root.speechSynthesis;
            if (!synth) { reject(new Error('No browser voice is available')); return; }
            const voices = synth.getVoices() || [];
            let pick = voices.find(v => (v.voiceURI || v.name) === s.voice) || null;
            if (s.slot) {
                const wl = voices.map(v => ({ id: v.voiceURI || v.name, lang: v.lang || '', v }));
                const sp = slotVoice(wl, pick && (pick.voiceURI || pick.name), s.lang, s.slot);
                if (sp) pick = sp.v;
            }
            let i = 0, begun = false;
            const next = () => {
                if (tok.cancelled) { resolve(); return; }
                if (i >= chunks.length) { resolve(); return; }
                const u = new root.SpeechSynthesisUtterance(chunks[i++]);
                webUtterance = u;
                u.rate = s.rate; u.pitch = s.pitch;
                if (pick) { u.voice = pick; u.lang = pick.lang; }
                else if (s.lang) u.lang = s.lang;
                // The WebView can accept speak() and then stay silent forever. Do not wait for it.
                let guard = setTimeout(() => { synth.cancel(); reject(new Error('The browser voice did not start')); }, 4000);
                u.onstart = () => { if (guard) { clearTimeout(guard); guard = null; } if (!begun) { begun = true; started(); } };
                u.onend = () => { webUtterance = null; if (guard) clearTimeout(guard); next(); };
                u.onerror = ev => {
                    if (guard) clearTimeout(guard);
                    const er = ev && ev.error;
                    if (tok.cancelled || er === 'canceled' || er === 'interrupted') { resolve(); return; }
                    reject(new Error('Browser voice error: ' + (er || 'unknown')));
                };
                try { synth.resume(); synth.speak(u); } catch (e) { if (guard) clearTimeout(guard); reject(e); }
            };
            try { synth.cancel(); } catch (e) { /* ignore */ }
            next();
        });
    }

    // ------------------------------------------------------- engines: Gemini + Kokoro (natural voices)
    // Both return a Blob that playBlob() plays through Web Audio. Calls are queued one at a time so a long reply
    // cannot burst through a free-tier rate limit, and the next chunk is fetched while the current one plays.
    let cloudQ = Promise.resolve();
    const cool = {};                       // engine -> time until which it is skipped after a limit error
    // V1.63.7: a voice that FAILED (not just hit a limit) is skipped for 5 minutes in replies, so a dead voice no longer
    // costs seconds before the working one starts. The Test button ignores this and tries the picked voice every time.
    const bad = {};
    let paused = false, resumeWaiters = [], curEl = null;
    function waitResume() { return new Promise(res => { if (!paused) res(); else resumeWaiters.push(res); }); }
    function flushWaiters() { const w = resumeWaiters; resumeWaiters = []; w.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); }
    // Pause keeps the place for cloud voices (the audio is frozen and carries on). The Android voice cannot freeze,
    // so it stops and Resume starts the sentence it was on again.
    function setPaused(on) {
        on = !!on;
        if (on === paused) return paused;
        if (on && !(cur && (status.state === 'playing' || status.state === 'loading'))) return false;
        paused = on;
        try {
            if (on) {
                if (actx && actx.state === 'running') actx.suspend();
                if (curEl) curEl.pause();
                if (webUsable()) root.speechSynthesis.pause();
                const p = nativePlugin();
                if (p && status.engine !== 'native' && typeof p.pauseAudio === 'function') Promise.resolve(p.pauseAudio()).catch(() => {});
                else if (p && status.engine === 'native' && typeof p.stop === 'function') nativeStop = Promise.resolve(p.stop()).catch(() => {});
            } else {
                if (actx && actx.state === 'suspended') actx.resume();
                if (curEl) { const r = curEl.play(); if (r && typeof r.catch === 'function') r.catch(() => {}); }
                if (webUsable()) root.speechSynthesis.resume();
                const p = nativePlugin();
                if (p && status.engine !== 'native' && typeof p.resumeAudio === 'function') Promise.resolve(p.resumeAudio()).catch(() => {});
                flushWaiters();
            }
        } catch (e) { /* pause is best effort */ }
        emit({ paused });
        holdPaint();
        return paused;
    }
    const togglePause = () => setPaused(!paused);
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

    // ---- Kokoro (V1.73.0): native, built into the APK. The plugin unpacks the model once, loads it, then every sentence is made on the phone
    // and comes back as a WAV that the normal cloud player plays (so speed, pitch, pause and stop work like every other voice).
    let kokReady = null, kokPack = '', kokLastNote = '';
    const voicePlugin = () => { if (!NATIVE || !plugFn) return null; try { return plugFn('HorizonVoice'); } catch (e) { return null; } };
    const kokoroUsable = () => !!voicePlugin();
    async function kokLoad(pack) {
        pack = pack || 'builtin';
        if (kokReady && kokPack === pack) return kokReady;
        kokPack = pack;
        const p = voicePlugin();
        if (!p) throw new Error('the built-in voice is not part of this build. Install the latest Horizon APK');
        kokReady = (async () => {
            if (pack === 'builtin' && typeof p.status === 'function') {
                try {
                    const status = await withTimeout(p.status(), 5000, 'Voice status timed out');
                    if (status && status.bundled === false) throw new Error('The built-in model is missing from this APK; using another available voice');
                } catch (e) { if (!isMissing(e)) throw e; }
            }
            let ln = null;
            try {
                if (typeof p.addListener === 'function') {
                    ln = await p.addListener('voiceProgress', ev => {
                        const t = ev && ev.note ? String(ev.note) : '';
                        if (t && t !== kokLastNote) { kokLastNote = t; emit({ note: t }); }
                    });
                }
            } catch (e) { ln = null; }
            try {
                const r = await withTimeout(p.load({ pack }), KOKORO.loadMs, 'the built-in voice took too long to start');
                if (!r || !r.ready) throw new Error((r && r.error) || 'the built-in voice did not start');
                return r;
            } finally { if (ln && typeof ln.remove === 'function') { try { await ln.remove(); } catch (e) { /* ignore */ } } }
        })();
        kokReady.catch(() => { if (kokPack === pack) { kokReady = null; kokPack = ''; } });   // a failed start can be tried again
        return kokReady;
    }
    async function kokoroSynth(text, voice, speed) {
        const v = KOKORO.voices.find(x => x.id === voice) || KOKORO.voices[0];
        await kokLoad(v.pack);
        const p = voicePlugin();
        let r;
        try { r = await withTimeout(p.synth({ text, sid: v.sid, pack: v.pack || 'builtin', speed: clamp(speed, 0.5, 2, 1) }), KOKORO.genMs, 'the built-in voice took too long to speak'); }
        catch (e) { if (isMissing(e)) throw new Error('the built-in voice is not part of this build. Install the latest Horizon APK'); throw e; }
        if (!r || !r.wav) throw new Error('the built-in voice made no sound');
        const bytes = b64ToBytes(r.wav);
        if (bytes.length < 100) throw new Error('the built-in voice made no sound');
        return new Blob([bytes], { type: 'audio/wav' });
    }

    // ---- V1.86.0 Voice library: the plugin downloads one official archive, unpacks it into app storage and reports progress.
    async function packsRefresh() {
        const p = voicePlugin();
        if (!p || typeof p.packs !== 'function') return packsInstalled();
        if (packsFlight) return packsFlight;
        packsFlight = (async () => {
            try {
                const r = await withTimeout(p.packs(), 5000, 'Voice library status timed out');
                const ids = (r && Array.isArray(r.installed) ? r.installed : []).filter(id => PACKS.some(pk => pk.id === id));
                ls.set(KEYS.packs, JSON.stringify(ids));
            } catch (e) { /* keep the cache; native synth still validates installation */ }
            rebuildVoices(); return packsInstalled();
        })();
        try { return await packsFlight; } finally { packsFlight = null; }
    }
    async function packDownload(id, onProgress) {
        const p = voicePlugin();
        const pk = PACKS.find(x => x.id === id);
        if (!p || typeof p.download !== 'function') throw new Error('this build has no voice library. Install the latest Horizon APK');
        if (!pk) throw new Error('unknown voice pack');
        let ln = null;
        try { if (typeof p.addListener === 'function') ln = await p.addListener('packProgress', ev => { if (ev && ev.id === id && onProgress) onProgress(ev); }); } catch (e) { ln = null; }
        try {
            const r = await p.download({ id, url: pk.url });
            if (!r || !r.ok) throw new Error((r && r.error) || 'the download failed');
            await packsRefresh();
            kokReady = null; kokPack = '';
            // The completed download becomes the selected offline voice, not a stale bundled id.
            set('kvoice', pk.voices[0][0]); set('engine', 'kokoro');
        } finally { if (ln && typeof ln.remove === 'function') { try { await ln.remove(); } catch (e) { /* ignore */ } } }
    }
    async function packRemove(id) {
        const p = voicePlugin();
        if (!p || typeof p.removePack !== 'function') throw new Error('this build has no voice library');
        if (kokPack === id) { kokReady = null; kokPack = ''; }
        const r = await p.removePack({ id });
        if (r && r.ok === false) throw new Error(r.error || 'could not remove the voice');
        await packsRefresh();
    }
    // V1.93.0: HD voice helpers for the one-tap card in Settings > Voice.
    const hdInstalled = () => packsInstalled().indexOf(HD_PACK) >= 0;
    const hdActive = () => { const s = settings(); const v = KOKORO.voices.find(x => x.id === s.kvoice); return s.engine === 'kokoro' && !!v && v.pack === HD_PACK; };
    function hdUse() {
        if (!hdInstalled()) return false;
        const v = KOKORO.voices.find(x => x.id === ls.get(KEYS.kvoice));
        set('kvoice', v && v.pack === HD_PACK ? v.id : HD_BEST);
        set('engine', 'kokoro');
        return true;
    }
    function packCancel() { const p = voicePlugin(); if (p && typeof p.cancelDownload === 'function') { try { p.cancelDownload(); } catch (e) { /* ignore */ } } }

    async function runCloud(synth, chunks, tok, s, started, playRate) {
        let next = queued(tok, () => synth(chunks[0]));
        let first = true;
        for (let i = 0; i < chunks.length; i++) {
            const blob = await next;
            if (tok.cancelled) return;
            next = i + 1 < chunks.length ? queued(tok, () => synth(chunks[i + 1])) : null;
            if (next) next.catch(() => { /* surfaced when awaited */ });
            await playBlob(blob, playRate == null ? s.rate : playRate, () => { if (first) { first = false; started(); } }, s.pitch);
            if (tok.cancelled) return;
        }
    }
    const runGemini = (chunks, tok, s, started) => runCloud(t => geminiSynth(t, s.gvoice), chunks, tok, s, started);
    async function googleCloudSynth(text) {
        const key = (ls.get('horizon_tts_gcloud_key') || '').trim();
        if (!key) throw new Error('Add a Google Cloud Text-to-Speech key in Voice settings (separate from Gemini)');
        const month = new Date().toISOString().slice(0, 7);
        let usage; try { usage = JSON.parse(ls.get('horizon_tts_gcloud_usage') || '{}'); } catch (_) { usage = {}; }
        const used = usage.month === month ? Number(usage.chars) || 0 : 0;
        const chars = Array.from(text).length;
        if (used + chars > 4000000) throw new Error('Horizon local Standard voice monthly cap reached. Using offline voice');
        // Reserve before sending; conservatively count failed requests too. No retry spending.
        const reservation = JSON.stringify({month, chars: used + chars});
        try {
            root.localStorage.setItem('horizon_tts_gcloud_usage', reservation);
            if (root.localStorage.getItem('horizon_tts_gcloud_usage') !== reservation) throw new Error('not persisted');
        } catch (_) { throw new Error('Cannot save Cloud TTS usage safely; use an offline voice or free local storage first'); }
        const res = await withTimeout(root.fetch('https://texttospeech.googleapis.com/v1/text:synthesize', {
            method: 'POST', headers: {'Content-Type':'application/json', 'x-goog-api-key': key},
            body: JSON.stringify({input:{text},voice:{languageCode:'en-US',name:'en-US-Standard-C'},audioConfig:{audioEncoding:'LINEAR16'}})
        }), 25000, 'Google Cloud voice timed out');
        if (!res.ok) throw new Error('Google Cloud voice HTTP ' + res.status + '. Check API enablement, restricted key and billing account');
        const data = await res.json();
        if (!data.audioContent) throw new Error('Google Cloud returned no audio');
        return new Blob([b64ToBytes(data.audioContent)], { type: 'audio/wav' });
    }
    const runGoogleCloud = (chunks, tok, s, started) => runCloud(googleCloudSynth, chunks, tok, s, started);
    // V1.93.0: the model itself makes the speed (clean timing, no pitch shift), so playback runs at 1x. Pitch stays a playback control.
    const runKokoro = (chunks, tok, s, started) => runCloud(t => kokoroSynth(t, s.kvoice, s.rate), chunks, tok, s, started, 1);

    // Android can refuse to start audio that was not triggered by a tap, and cloud voices take seconds to arrive,
    // so the tap is long gone by the time the sound is ready. A Web Audio context that was created and resumed
    // during a tap stays unlocked, so it is unlocked early (on every tap) and used for playback.
    function audioCtx() {
        if (actx && actx.state !== 'closed') return actx;
        actx = null;
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
    async function playWebAudio(blob, rate, onStart, pitch) {
        if (paused) await waitResume();     // V1.63.7: a chunk that arrives while paused waits
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
            srcNode.playbackRate.value = clamp(clamp(rate, 0.5, 2, 1) * clamp(pitch, 0.5, 2, 1), 0.25, 4, 1);
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
    function playElement(blob, rate, onStart, pitch) { return (paused ? waitResume() : Promise.resolve()).then(() => playElement0(blob, rate, onStart, pitch)); }
    function playElement0(blob, rate, onStart, pitch) {
        return new Promise((resolve, reject) => {
            const url = root.URL.createObjectURL(blob);
            const a = new root.Audio(url);
            curEl = a;
            let fin = false;
            const watchdog = setTimeout(() => end(new Error('Audio playback did not start')), 8000);
            const stopFn = () => end();
            const end = err => {
                if (fin) return;
                fin = true; clearTimeout(watchdog);
                a.onended = a.onerror = a.onplaying = null;
                try { a.pause(); } catch (e) { /* ignore */ }
                if (curEl === a) curEl = null;
                root.URL.revokeObjectURL(url);
                if (audioEnd === stopFn) audioEnd = null;
                err ? reject(err) : resolve();
            };
            audioEnd = stopFn;
            try { a.preservesPitch = false; a.mozPreservesPitch = false; a.webkitPreservesPitch = false; } catch (e) { /* default */ }
            a.playbackRate = clamp(clamp(rate, 0.5, 2, 1) * clamp(pitch, 0.5, 2, 1), 0.25, 4, 1);
            a.onended = () => end();
            a.onerror = () => end(new Error('Audio playback failed'));
            a.onplaying = () => { clearTimeout(watchdog); if (onStart) { const f = onStart; onStart = null; f(); } };
            const pr = a.play();
            if (pr && typeof pr.catch === 'function') pr.catch(e => end(new Error('The audio element was refused: ' + msg(e))));
        });
    }
    async function playBlob(blob, rate, onStart, pitch) {
        let began = false;
        const mark = () => { began = true; if (onStart) onStart(); };
        const playbackToken = cur && cur.tok;
        if (paused) await waitResume();
        if (playbackToken && playbackToken.cancelled) return;
        if (NATIVE) {
            const p = nativePlugin();
            if (p && typeof p.playAudio === 'function') {
                let listener = null;
                try {
                    await nativeStop;
                    const id = 'wav-' + (++utterSeq);
                    if (typeof p.addListener === 'function') listener = await p.addListener('speechStart', ev => { if (ev && ev.id === id) mark(); });
                    const bytes = new Uint8Array(await blob.arrayBuffer());
                    let binary = '';
                    for (let i=0; i<bytes.length; i+=8192) binary += String.fromCharCode.apply(null,bytes.subarray(i,i+8192));
                    if (playbackToken && playbackToken.cancelled) return;
                    if (paused) await waitResume();
                    if (playbackToken && playbackToken.cancelled) return;
                    await p.playAudio({wav:root.btoa(binary),rate,pitch,utteranceId:id});
                    return;
                } catch (e) { if (playbackToken && playbackToken.cancelled) return; if (began) throw e; /* old APK or device player: try Web Audio */ }
                finally { if (listener) { try { await listener.remove(); } catch (_) {} } }
            }
        }
        try {
            await playWebAudio(blob, rate, mark, pitch);
            return;
        } catch (e1) {
            if (began) throw e1;                       // it was already playing: do not restart it
            try {
                await playElement(blob, rate, mark, pitch);
                return;
            } catch (e2) {
                if (began) throw e2;
                throw new Error('The voice audio was made but Android would not play it (' + msg(e1) + '; ' + msg(e2) + ')');
            }
        }
    }

    // ------------------------------------------------------------- orchestration
    const RUN = { gcloud: runGoogleCloud, gemini: runGemini, kokoro: runKokoro, native: runNative, web: runWeb };
    const LABEL = { gcloud: 'Google Cloud Standard', gemini: 'Gemini voice', kokoro: 'Built-in voice', native: 'Android voice', web: 'Browser voice' };

    function stop(silent) {
        if (paused) {
            paused = false;
            status = Object.assign({}, status, { paused: false });
            try { if (actx && actx.state === 'suspended') actx.resume(); } catch (e) { /* ignore */ }
            try { if (webUsable()) root.speechSynthesis.resume(); } catch (e) { /* ignore */ }
            flushWaiters();
        }
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

    async function speak(id, rawText, opts) {
        unlockAudio();                                 // must run synchronously inside the tap
        stop(true);
        const tok = { cancelled: false };
        cur = { id, tok };
        if (ls.get(KEYS.engine) === 'kokoro') await packsRefresh();
        if (tok.cancelled) return false;
        const s = settings();
        applySlot(s, opts && opts.slot);
        const text = speakable(rawText);
        if (!text) {
            emit({ state: 'error', id, error: 'There is nothing to read aloud in this reply.' });
            cur = null;
            emit({ state: 'idle', id: null, engine: '' });
            return false;
        }
        emit({ state: 'loading', id, engine: '', error: '' });
        const order = [];
        // V1.47.0: strict (the Test button) runs ONLY the voice that is selected, so a missing key or a failure is
        // reported instead of quietly playing a different voice. Replies keep the fallback chain.
        const strict = !!(opts && opts.strict);
        if (CLOUD.indexOf(s.engine) >= 0) order.push(s.engine);
        if (!strict || CLOUD.indexOf(s.engine) < 0) order.push('native', 'web');
        const errors = [];
        for (const eng of order) {
            if (tok.cancelled) return false;
            if (eng === 'native' && !nativeUsable()) continue;
            if (eng === 'kokoro' && !kokoroUsable()) { errors.push('built-in voice is not part of this build'); continue; }
            if (eng === 'web' && !webUsable()) continue;
            if (cool[eng] && cool[eng] > Date.now()) { errors.push(LABEL[eng].toLowerCase() + ' is at its limit, trying again in a minute'); continue; }
            if (!strict && bad[eng] && bad[eng] > Date.now()) { errors.push(LABEL[eng].toLowerCase() + ' failed a moment ago, skipped'); continue; }
            let began = false;
            try {
                emit({ engine: eng });
                await RUN[eng](CLOUD.indexOf(eng) >= 0 ? fastFirst(chunkText(text, MAX_CHARS[eng]), eng === 'kokoro' ? 90 : 150) : chunkText(text, MAX_CHARS[eng]), tok, s, () => {
                    began = true;
                    if (!tok.cancelled) emit({ state: 'playing', id, engine: eng });
                });
                if (tok.cancelled) return false;
                delete bad[eng];
                cur = null;
                emit({
                    state: 'idle', id: null, engine: '', error: '',
                    note: errors.length ? 'Used the ' + LABEL[eng].toLowerCase() + ' instead: ' + errors[0] + '.' : ''
                });
                return true;
            } catch (e) {
                if (tok.cancelled) return false;
                if (e && e.limit) cool[eng] = Date.now() + 60000;
                else if (!strict && CLOUD.indexOf(eng) >= 0 && !began) bad[eng] = Date.now() + 300000;
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

    function toggle(id, text, opts) {
        if (status.id === id && (status.state === 'loading' || status.state === 'playing')) { stop(); return Promise.resolve(false); }
        return speak(id, text, opts);
    }
    const TEST_LINE = 'This is how Horizon sounds. Strategy over impulse.';
    const test = () => toggle('test', TEST_LINE, { strict: true });

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
            kokoro: kokoroUsable(),
            audio
        };
    }
    // V1.93.0: the Voice row in Settings is collapsed, so its status line says where the HD voice is until it is installed
    const hdHint = () => (kokoroUsable() && !hdInstalled()) ? ' \u00b7 open to get the free HD voice' : '';
    function describe() {
        const s = settings();
        if (s.engine === 'gcloud') return 'Google Cloud Standard · optional free tier, billing account required';
        if (s.engine === 'gemini') {
            if (!cloudKeys('gemini').length) return 'Gemini voice needs a key. Using the Android voice for now.';
            return 'Natural voice (Gemini · ' + s.gvoice + ')';
        }
        if (s.engine === 'kokoro') {
            if (!kokoroUsable()) return 'The built-in voice is missing from this build. Using the Android voice for now.';
            const v = KOKORO.voices.find(x => x.id === s.kvoice);
            if (v && v.pack === HD_PACK) return 'HD voice (' + v.name.replace(/ \(Kokoro\)$/, '').replace(/ \u2605.*$/, '') + ' \u00b7 Kokoro, offline)';
            if (v && v.pack && v.pack !== 'builtin') return 'Natural voice (' + v.name + ' \u00b7 downloaded, offline)';
            return 'Natural voice (Built-in \u00b7 ' + (v ? v.name.split(' \u00b7 ')[0] : s.kvoice) + ' \u00b7 built in, offline)' + hdHint();
        }
        if (nativeUsable()) return 'Standard voice (Android)' + hdHint();
        if (webUsable()) return 'Standard voice (browser)' + hdHint();
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
        // V1.63.7: the Pause / Resume button in the notification
        root.addEventListener('horizon-tts-pause', () => { togglePause(); });
        // V1.64.0: lock-screen / headset Play and Pause say which way to go, so a repeated press can never flip the wrong way
        root.addEventListener('horizon-tts-set', ev => { setPaused(!!(ev && ev.detail && ev.detail.paused)); });
    }

    root.HorizonTTS = {
        init, settings, set, speak, toggle, stop, test, onState, pause: () => setPaused(true), resume: () => setPaused(false), togglePause, isPaused: () => paused, setQueued, voiceFor, listVoices, listEngines, describe, diagnose,
        status: () => status,
        speakable, chunkText,
        cloud: {
            gcloud: { voices: [], keyCount: () => ls.get('horizon_tts_gcloud_key') ? 1 : 0 },
            gemini: { voices: GEMINI.voices, keyCount: () => cloudKeys('gemini').length },
            kokoro: { voices: KOKORO.voices, usable: kokoroUsable },
        },
        packs: { catalog: PACKS, installed: packsInstalled, refresh: packsRefresh, download: packDownload, remove: packRemove, cancel: packCancel },
        hd: { pack: HD_PACK, info: () => PACKS.find(x => x.id === HD_PACK), installed: hdInstalled, active: hdActive, use: hdUse, get: onProgress => packDownload(HD_PACK, onProgress) }
    };
})(window);
