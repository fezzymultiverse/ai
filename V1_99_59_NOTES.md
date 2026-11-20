# Horizon V1.99.59 - DEEPSEEK, KEYLESS

Includes everything in V1.99.58. Nothing removed.
Changed: www/index.html (LLM7.io built-in model list + a DeepSeek description), www/horizon_about.js, tests.

- LLM7.io (https://api.llm7.io/v1, no key, about 30 requests a minute anonymous) now falls back to: gpt-oss:20b, deepseek-r1-0528, deepseek-r1, codestral-latest, mistral-Nemo-Instruct-2407. Default model unchanged.
- DeepSeek R1 gets its own one-line description in the model picker.

## Strong keyless models already in Horizon
- LLM7.io: DeepSeek R1
- OVHcloud: Qwen3.5-397B-A17B, gpt-oss-120b, Llama 3.3 70B (2 requests a minute without a token)
- G4F Gemini: Gemini 2.5 Pro / Flash
- BlockRun: Nemotron 3 Ultra 550B
- G4F Ollama: DeepSeek / Qwen3 Coder (ids are guesses until Refresh models)

## Checked and rejected (NOT keyless)
OpenCode Zen: its anonymous "public" lane returned 403 FreeTierError in a 2026-10 test and the other report relies on copying OpenCode CLI headers, which Horizon will not do. DeepSeek web-chat proxies need your own DeepSeek login and a server.

## NOT verified
No network in the build sandbox, so nothing was called live. If DeepSeek R1 is missing from the LLM7.io picker, tap Refresh models and tell me what the list shows.
