# Horizon V1.99.63 - dead AIs removed

Built on V1.99.62-REPAIR (the repair is already integrated in this package's www/).

## Removed (live audit results from the V1.99.62 PATCH_REPORT)
- G4F Groq, G4F Ollama, G4F NVIDIA, G4F Gemini, G4F Pollinations: chat returned HTTP 402 (proof-of-work credits).
- BridgeNode: models and chat returned HTTP 404.
- VLM Run: configured Qwen model returned HTTP 401 (provider key required).

## Where they were removed
- www/index.html: icons, provider definitions, access notes, model descriptions, card tooltips, catalogue refresh list, image-capable check.
- www/horizon_net.js: hosts g4f.space, bridgenode.cc, gateway.vlm.run dropped from the native HTTP allowlist.
- www/horizon_browser.js, horizon_people.js, horizon_usage.js, horizon_edge_tts.js: id lists, gateway map, icon, colour entries.
- www/horizon_about.js: new V1.99.63 changelog entry (older entries kept as history).

## Kept
- G4F Local (your own Termux server on 127.0.0.1:1337), Pollinations (direct), ch.at, OVHcloud, Kilo, LLM7, AI Horde, BlockRun.

## Behaviour
- If your saved active AI was a removed one, the app falls back to the first AI with a key, else OVHcloud.

## Verified / not verified
- Verified: node --check on every edited JS file; inline script syntax check (4 scripts passed); no references left outside the changelog history.
- Not verified: no APK built, nothing run on a phone, no live endpoint calls.
