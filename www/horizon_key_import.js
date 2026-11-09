/* Horizon 1.87: local-only, conservative key extraction. No network or secret logging here. */
(function (root) {
    'use strict';
    const aliases = {gemini:'gemini',google:'gemini',groq:'groq',cohere:'cohere',mistral:'mistral',openrouter:'openrouter',anyapi:'anyapi',gonka:'gonka',gonkarouter:'gonka',routeway:'routeway'};
    function identify(key) {
        if (/^(?:AIza[A-Za-z0-9_-]{20,}|A[Qq][.A-Za-z0-9_-]{20,})$/.test(key)) return 'gemini';
        if (/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) return 'groq';
        if (/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(key)) return 'openrouter';
        return '';
    }
    function validate(provider, key) {
        key = String(key || '');
        if (key.length < 20 || key.length > 8192 || !/^[A-Za-z0-9_.-]+$/.test(key)) return 'Paste one complete API key, not a note, URL or placeholder.';
        if (/^(?:your[_-]?|example|replace|paste|test[_-]|dummy|xxx)/i.test(key) || /(.)\1{19}/.test(key)) return 'This looks like a placeholder, not an API key.';
        const owner = identify(key);
        if (owner && owner !== provider) return 'That key belongs to ' + owner + ', not ' + provider + '.';
        if (['gemini','groq','openrouter'].includes(provider) && owner !== provider) return 'The key format does not match ' + provider + '.';
        return '';
    }
    function extract(note) {
        const items = [], seen = new Set(); let rejected = 0, context = '';
        const text = String(note || '').slice(0,65536).replace(/\\n/g,'\n').replace(/[,{}]/g,'\n').replace(/\b(gemini|google|groq|cohere|mistral|openrouter|anyapi|gonkarouter|gonka|routeway)(?=[_ -]*(?:api[_ -]*)?key|\s*[:=])/ig,'\n$1');
        // Split prose on semicolons too; keep provider label + key on the same segment.
        for (const raw of text.split(/[\r\n;]+/)) {
            const line = raw.trim(); if (!line) { context = ''; continue; }
            const label = /(?:^|[^a-z0-9_])(gemini|google|groq|cohere|mistral|openrouter|anyapi|gonkarouter|gonka|routeway)(?:[_ -]*(?:api[_ -]*)?key)?(?:[^a-z0-9_]|$)/i.exec(line);
            const declared = label ? aliases[label[1].toLowerCase()] : '';
            const payload = label ? line.slice(label.index + label[0].length) : line;
            const tokens = payload.match(/[A-Za-z0-9_][A-Za-z0-9_.-]{19,8191}/g) || [];
            if (declared) context = declared;
            let matched = false;
            for (const key of tokens) {
                if (/^(?:https?|[A-Z_]*(?:API_KEY|TOKEN))$/i.test(key) || key.includes('://')) continue;
                const owner = identify(key);
                // Unique prefixes can stand alone; unprefixed keys need an immediately associated label.
                const provider = declared || owner || context;
                if (!provider || validate(provider,key)) { rejected++; continue; }
                const sig = provider + ':' + key;
                if (!seen.has(sig)) { items.push({provider,key}); seen.add(sig); }
                matched = true;
            }
            // A heading carries only to the next nonempty line, never across arbitrary prose.
            if (!declared || matched || tokens.length) context = '';
        }
        return {items,rejected};
    }
    root.HorizonKeyImport = Object.freeze({identify,validate,extract});
})(typeof window !== 'undefined' ? window : globalThis);
