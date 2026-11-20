# Horizon V1.99.58 - FOUR MORE KEYLESS AIs

Includes everything in V1.99.57. Nothing removed.

## New (strictly keyless: no key, no account, no Authorization header)
- G4F NVIDIA      https://g4f.space/api/nvidia       (Nemotron, GLM, MiniMax)
- G4F Gemini      https://g4f.space/api/gemini       (Gemini 2.5 Flash / Pro; separate from your own Gemini key AI)
- G4F Pollinations https://g4f.space/api/pollinations (second route to Pollinations models)
- BridgeNode      https://bridgenode.cc/v1           (only models marked "free": true in /v1/models; paid models use crypto micropayments and are never listed or sent)

Each has its own SVG icon, model picker + model walk, usage colour, voice-list entry, @tags, browser-tool support and a card tooltip.
Total keyless AIs added this session: 6 (G4F Groq, G4F Ollama in V1.99.57; these four in V1.99.58).

## Why four and not six
Only these have documented, multi-source keyless access. api.airforce, Hack Club AI, g4f.space/v1, OpenRouter, Groq/Gemini direct all need a key or account, so they were left out on purpose.

## NOT verified (no network in the build sandbox)
- No endpoint was called live. Fallback model ids are best guesses (BridgeNode's gpt-oss-120b is a guess and may be a paid model; the app lists real free ids after Refresh models). Tap Refresh models on each card first.
- G4F Pollinations model ids rotate; the model walk skips dead ones.
- Community relays: per-IP limits, no SLA, models can vanish.

## Tested
node --check on all www/*.js, inline-script check, bash -n edge_kit.sh, SVG symbols parsed as XML, all *.test.cjs (185 pass, 0 fail).
