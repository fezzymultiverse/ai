/* Horizon 1.88: local-only, conservative key extraction. No network or secret logging here. */
(function (root) {
    'use strict';
    const aliases = {gemini:'gemini',google:'gemini',groq:'groq',cohere:'cohere',mistral:'mistral',openrouter:'openrouter',anyapi:'anyapi',gonka:'gonka',gonkarouter:'gonka',gronkrouter:'gonka',routeway:'routeway',llm7:'llm7',zai:'zai','z.ai':'zai',aionlabs:'aionlabs',aion:'aionlabs',serpapi:'serpapi',firecrawl:'firecrawl',scrapingbee:'scrapingbee',scraperbee:'scrapingbee',browserless:'browserless'};
    function identify(key) {
        if (/^(?:AIza[A-Za-z0-9_-]{20,}|A[Qq][.A-Za-z0-9_-]{20,})$/.test(key)) return 'gemini';
        if (/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) return 'groq';
        if (/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(key)) return 'openrouter';
        if (/^fc-[A-Za-z0-9_-]{20,}$/.test(key)) return 'firecrawl';
        return '';
    }
    function validate(provider, key) {
        key = String(key || '');
        if (provider === 'cloudflare') return /^[0-9a-fA-F]{32}:[A-Za-z0-9_.-]{20,}$/.test(key.trim()) ? '' : 'Cloudflare needs your Account ID and an API token joined with a colon: ACCOUNT_ID:API_TOKEN.';
        // V1.93.7: LLM7 tokens can carry + / = ~ characters, so that provider takes any single run of visible characters
        const charset = provider === 'llm7' ? /^[A-Za-z0-9_.\-+\/=~:]+$/ : /^[A-Za-z0-9_.-]+$/;
        if (key.length < (provider === 'llm7' ? 8 : 20) || key.length > 8192 || !charset.test(key)) return 'Paste one complete API key, not a note, URL or placeholder.';
        if (/^(?:your[_-]?|example|replace|paste|test[_-]|dummy|xxx)/i.test(key) || /(.)\1{19}/.test(key)) return 'This looks like a placeholder, not an API key.';
        const owner = identify(key);
        if (owner && owner !== provider) return 'That key belongs to ' + owner + ', not ' + provider + '.';
        if (['gemini','groq','openrouter'].includes(provider) && owner !== provider) return 'The key format does not match ' + provider + '.';
        return '';
    }
    function extract(note) {
        const items = [], seen = new Set(); let rejected = 0, context = '';
        const text = String(note || '').slice(0,65536).replace(/<\/?(?:div|p|li|br|tr|pre)\b[^>]*>/gi,'\n').replace(/<[^>]{0,2048}>/g,' ').replace(/\n[ \t]*\n/g,'\n').replace(/&(?:quot|#34);/gi,'"').replace(/&(?:apos|#39);/gi,"'").replace(/&(?:nbsp|#160);/gi,' ').replace(/&amp;/gi,'&').replace(/[\u200B-\u200D\uFEFF]/g,'').replace(/[\u2018\u2019]/g,"'").replace(/[\u201C\u201D]/g,'"').replace(/\b(?:GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY)\b/gi, 'gemini_key').replace(/\\n/g,'\n').replace(/[,{}]/g,'\n').replace(/\b(gemini|google|groq|cohere|mistral|openrouter|anyapi|gronkrouter|gonkarouter|gonka|routeway|llm7|aionlabs|aion|z\.ai|zai|serpapi|firecrawl|scrapingbee|scraperbee|browserless)(?=[_ -]*(?:(?:api[_ -]*)?key|token|secret)|\s*[:=])/ig,'\n$1');
        // Split prose on semicolons too; keep provider label + key on the same segment.
        for (const raw of text.split(/[\r\n;]+/)) {
            const line = raw.trim(); if (!line) { context = ''; continue; }
            const label = /(?:^|[^a-z0-9_])(gemini|google|groq|cohere|mistral|openrouter|anyapi|gronkrouter|gonkarouter|gonka|routeway|llm7|aionlabs|aion|z\.ai|zai|serpapi|firecrawl|scrapingbee|scraperbee|browserless)(?:[_ -]*(?:(?:api[_ -]*)?key|token|secret))?(?:[^a-z0-9_]|$)/i.exec(line);
            const declared = label ? aliases[label[1].toLowerCase()] : '';
            const payload = label ? line.slice(label.index + label[0].length) : line;
            const safePayload = payload.replace(/https?:\/\/[^\s<>"']+/gi, ' ');
            const tokens = safePayload.match(/[A-Za-z0-9_][A-Za-z0-9_.-]{19,}/g) || [];
            if (declared) context = declared;
            let matched = false;
            for (const token of tokens) {
                const key = token.replace(/[.]+$/, '');
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
