# Horizon V1.99.60 - G4F LOCAL + OVH QWEN3.5-397B DEFAULT

Includes everything in V1.99.59. Nothing removed.

## 1. OVHcloud default model
OVHcloud (keyless, 2 requests a minute per IP without a token) now starts on Qwen3.5-397B-A17B, the largest keyless model found. A model you already picked is kept. gpt-oss-120b is still in the list.

## 2. G4F Local (new, keyless, on your phone)
GPT4Free running in your own Termux, called at http://127.0.0.1:1337/v1. No key, no account, no third-party relay, no shared per-IP limit.
Start it:   pip install -U g4f nest-asyncio2 && python -m g4f --port 1337   (leave it running)
Then tap Refresh models on the G4F Local card. Default DeepSeek R1; also GPT-4o, o3-mini, GPT-4o-mini, o1 (names from a public live test, they can change).

## NOT verified
- Never run here (no network, no phone). Plain http to 127.0.0.1 must be allowed by the APK's network config; the repo has no Android manifest, so I could not check. If the card cannot connect while the server is running, that is the cause: tell me and the CI build needs cleartext allowed for 127.0.0.1.
- Conflicting public reports (July vs October 2026) on whether OVH, LLM7.io and AI Horde anonymous access still work. Test each card with Refresh models.
