/* Horizon 1.93.25: local-only, conservative key extraction. No network or secret logging here.
   Rules this file keeps:
   - A key is only ever placed under a provider the user labelled, or one whose key has a unique prefix. Nothing is guessed.
   - A key-sized run that holds characters a key cannot hold is rejected whole, never cut down to a shorter "key".
   - Model names, file names, hyphenated words, URLs and version strings are never taken as keys.
   - The same key under two different providers is ambiguous: both placements are dropped.
   - extract(note, {scope}) can be limited to AI providers ('ai') or scraper services ('web'); keys that belong to the other
     list are reported in `elsewhere` instead of being dropped silently or saved in the wrong place. */
(function (root) {
    'use strict';
    const WEB_IDS = ['serpapi', 'firecrawl', 'scrapingbee', 'browserless'];
    const aliases = {
        gemini: 'gemini', google: 'gemini', groq: 'groq', cohere: 'cohere', mistral: 'mistral', openrouter: 'openrouter',
        anyapi: 'anyapi', gonka: 'gonka', gonkarouter: 'gonka', gronkrouter: 'gonka', routeway: 'routeway', requesty: 'requesty',
        llm7: 'llm7', zai: 'zai', 'z.ai': 'zai', aionlabs: 'aionlabs', aion: 'aionlabs',
        claude: 'claude', anthropic: 'claude', openai: 'openai', chatgpt: 'openai', deepseek: 'deepseek', xai: 'xai', grok: 'xai',
        cloudflare: 'cloudflare', kilo: 'kilo', ovh: 'ovh', ovhcloud: 'ovh',
        serpapi: 'serpapi', firecrawl: 'firecrawl', scrapingbee: 'scrapingbee', scraperbee: 'scrapingbee', browserless: 'browserless'
    };
    const LABELS = 'gemini|google|groq|cohere|mistral|openrouter|anyapi|gronkrouter|gonkarouter|gonka|routeway|requesty|claude|anthropic|chatgpt|openai|deepseek|grok|xai|llm7|aionlabs|aion|z\\.ai|zai|cloudflare|kilo|ovhcloud|ovh|serpapi|firecrawl|scrapingbee|scraperbee|browserless';
    const KEYWORD = '(?:[_ -]*(?:(?:api[_ -]*)?key|token|secret))?';
    // The label must end at a real boundary. "mistral-small-latest" is a model name, not the label "mistral".
    const LABEL_RE = new RegExp('(?:^|[^a-z0-9_.-])(' + LABELS + ')' + KEYWORD + '(?:[\\s:="\'|>]|$)', 'i');
    const SPLIT_RE = new RegExp('\\b(' + LABELS + ')(?=[_ -]*(?:(?:api[_ -]*)?key|token|secret)|\\s*[:=])', 'ig');

    function identify(key) {
        if (/^(?:AIza[A-Za-z0-9_-]{20,}|A[Qq][.A-Za-z0-9_-]{20,})$/.test(key)) return 'gemini';
        if (/^gsk_[A-Za-z0-9_-]{20,}$/.test(key)) return 'groq';
        if (/^sk-or-v1-[A-Za-z0-9_-]{20,}$/.test(key)) return 'openrouter';
        if (/^fc-[A-Za-z0-9_-]{20,}$/.test(key)) return 'firecrawl';
        if (/^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key)) return 'claude';
        if (/^xai-[A-Za-z0-9]{20,}$/.test(key)) return 'xai';
        if (/^sk-[0-9a-f]{32}$/.test(key)) return 'deepseek';
        if (/^sk-(?:proj-|svcacct-|admin-)[A-Za-z0-9_-]{20,}$/.test(key) || /^sk-[A-Za-z0-9]{40,}$/.test(key)) return 'openai';
        return '';
    }
    // Shape guard for keys that carry no unique prefix. A real secret is random: it mixes letters and digits and is not made of words.
    function looksLikeSecret(key, provider) {
        if (identify(key)) return true;
        if (provider === 'cloudflare') return true;   // validated separately as ACCOUNT_ID:API_TOKEN
        if (/\.(?:json|js|mjs|cjs|ts|txt|md|env|html?|css|sh|py|zip|apk|png|jpe?g|gif|webp|pdf|csv|log|yml|yaml|xml|lock)$/i.test(key)) return false;
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) return true;   // a UUID is a plausible token shape
        if (/^v?\d+(?:\.\d+){1,3}(?:[-+][\w.]+)?$/i.test(key)) return false;   // version strings
        const letters = /[A-Za-z]/.test(key), digits = /\d/.test(key);
        if (!(letters && digits)) return false;
        // Hyphen/underscore words ("mistral-small-latest-2506", "settings_backup_final_v2") are names, not secrets.
        const words = key.split(/[-_.]/).filter(w => /^[a-z]{3,}$/i.test(w) && !/\d/.test(w));
        if (words.length >= 2 && words.every(w => w === w.toLowerCase())) return false;
        if (words.length >= 3) return false;
        // Model and product ids such as gpt-oss-120b, qwen3-27b, llama-3.3-70b-instruct.
        if (/(?:^|[-_.])(?:gpt|llama|qwen\d*|gemma|mistral|claude|command|deepseek|instruct|latest|preview|turbo|flash|large|small|medium|mini)(?:[-_.]|$)/i.test(key) && /[-_.]/.test(key)) return false;
        return true;
    }
    function validate(provider, key) {
        key = String(key || '');
        if (provider === 'cloudflare') return /^[0-9a-fA-F]{32}:[A-Za-z0-9_.-]{20,}$/.test(key.trim()) ? '' : 'Cloudflare needs your Account ID and an API token joined with a colon: ACCOUNT_ID:API_TOKEN.';
        // V1.93.7: LLM7 tokens can carry + / = ~ characters, so that provider takes any single run of visible characters
        const charset = (provider === 'llm7' || provider === 'requesty') ? /^[A-Za-z0-9_.\-+\/=~:]+$/ : /^[A-Za-z0-9_.-]+$/;   // V1.93.26: Requesty keys may carry + / = ~ too
        if (key.length < (provider === 'llm7' ? 8 : 20) || key.length > 8192 || !charset.test(key)) return 'Paste one complete API key, not a note, URL or placeholder.';
        if (/^(?:your[_-]?|example|replace|paste|test[_-]|dummy|xxx)/i.test(key) || /(.)\1{19}/.test(key)) return 'This looks like a placeholder, not an API key.';
        const owner = identify(key);
        if (owner && owner !== provider) return 'That key belongs to ' + owner + ', not ' + provider + '.';
        if (['gemini', 'groq', 'openrouter', 'firecrawl'].includes(provider) && owner !== provider) return 'The key format does not match ' + provider + '.';
        return '';
    }
    function scopeOf(provider) { return WEB_IDS.includes(provider) ? 'web' : 'ai'; }
    function clean(note) {
        return String(note || '').slice(0, 65536)
            .replace(/<\/?(?:div|p|li|br|tr|pre)\b[^>]*>/gi, '\n').replace(/<[^>]{0,2048}>/g, ' ').replace(/\n[ \t]*\n/g, '\n')
            .replace(/&(?:quot|#34);/gi, '"').replace(/&(?:apos|#39);/gi, "'").replace(/&(?:nbsp|#160);/gi, ' ').replace(/&amp;/gi, '&')
            .replace(/[​-‍﻿]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
            .replace(/\b(?:GOOGLE_GENERATIVE_AI_API_KEY|GOOGLE_API_KEY|GEMINI_API_KEY)\b/gi, 'gemini_key')
            .replace(/\\n/g, '\n').replace(/[,{}]/g, '\n').replace(SPLIT_RE, '\n$1');
    }
    // Split a payload into whitespace-delimited runs and strip wrapping punctuation. A run is judged whole.
    function runsOf(payload) {
        return String(payload || '').replace(/https?:\/\/[^\s<>"']+/gi, ' ').split(/[\s]+/)
            .map(t => t.replace(/^[\s"'`([<:=|>]+/, '').replace(/[\s"'`)\]>.;:|]+$/, ''))
            .filter(t => t.length >= 8);
    }
    function extract(note, opts) {
        opts = opts || {};
        const scope = opts.scope === 'ai' || opts.scope === 'web' ? opts.scope : '';
        let rejected = 0, context = '';
        const found = [];   // {provider,key}
        for (const raw of clean(note).split(/[\r\n;]+/)) {
            const line = raw.trim(); if (!line) { context = ''; continue; }
            const label = LABEL_RE.exec(line);
            const declared = label ? aliases[label[1].toLowerCase()] : '';
            const payload = label ? line.slice(label.index + label[0].length) : line;
            const runs = runsOf(payload);
            if (declared) context = declared;
            let sawKeySized = false;
            for (const run of runs) {
                const owner = identify(run);
                const provider = declared || owner || context;
                const charset = (provider === 'llm7' || provider === 'requesty') ? /^[A-Za-z0-9_.\-+\/=~:]+$/ : provider === 'cloudflare' ? /^[A-Za-z0-9_.:-]+$/ : /^[A-Za-z0-9_.-]+$/;
                const keySized = run.length >= (provider === 'llm7' ? 8 : 20);
                if (!keySized) continue;
                sawKeySized = true;
                if (/^(?:https?|[A-Z_]*(?:API_KEY|TOKEN))$/i.test(run) || run.includes('://')) continue;
                // Whole-run rule: odd characters mean this is not a key. It is never cut down to a shorter piece.
                if (!provider || !charset.test(run) || !looksLikeSecret(run, provider) || validate(provider, run)) { if (provider || owner) rejected++; else if (/\d/.test(run) && /[A-Za-z]/.test(run) && !/[-_.]/.test(run)) rejected++; continue; }
                found.push({ provider, key: run });
            }
            // A heading carries only to the next nonempty line, never across arbitrary prose.
            if (!declared || sawKeySized) context = '';
        }
        // One key can belong to one service. The same string under two providers is ambiguous, so neither placement is kept.
        const owners = new Map();
        for (const f of found) { const s = owners.get(f.key) || new Set(); s.add(f.provider); owners.set(f.key, s); }
        const seen = new Set(), items = [], ambiguous = [], elsewhere = [];
        for (const f of found) {
            const sig = f.provider + ':' + f.key;
            if (owners.get(f.key).size > 1) { if (!seen.has('x:' + f.key)) { seen.add('x:' + f.key); rejected++; ambiguous.push(f.key); } continue; }
            if (seen.has(sig)) continue;
            seen.add(sig);
            if (scope && scopeOf(f.provider) !== scope) elsewhere.push(f); else items.push(f);
        }
        return { items, rejected, ambiguous, elsewhere };
    }
    root.HorizonKeyImport = Object.freeze({ identify, validate, extract, scopeOf, WEB_IDS: Object.freeze(WEB_IDS.slice()) });
})(typeof window !== 'undefined' ? window : globalThis);
