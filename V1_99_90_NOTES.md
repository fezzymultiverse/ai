# V1.99.90 - free.ai added (keyless), mlvoca confirmed

Changed: www/index.html, www/horizon_net.js, www/horizon_model_inventory.js, www/horizon_model_policy.js, www/horizon_about.js, www/horizon_release.js, www/horizon_usage.js, www/horizon_people.js, android-native/app/HorizonAIPlugin.kt, android-native/app/HorizonCheckinPlugin.kt, package.json, scaffold/package.json, tests (v55, front-header). New: tests/freeai-v90.test.cjs.

1. free.ai is a new provider in the KEYLESS group. Implemented + unit tested. Chat goes to POST https://api.free.ai/v1/chat/ (the path free.ai documents; no /completions). Optional key box: a free sk-free- key (30,000 tokens a day) can be pasted, blank sends no Authorization header.
2. Picker seed: mistral and qwen3-8b (both answered keyless in your probe). qwen7b (the id in free.ai's docs) is a candidate only, so Refresh tests it and keeps it only if it answers. deepseek-r1-7b is left out (HTTP 200 but marked DEAD).
3. Refresh never downloads free.ai's 568-model list; only the fixed candidates are tested.
4. Transport allowlist (horizon_net.js) accepts only api.free.ai /v1/models, /v1/chat and /v1/chat/completions. Android host list (HorizonAIPlugin.kt) and check-in endpoints (HorizonCheckinPlugin.kt) carry api.free.ai: NEEDS AN APK REBUILD.
5. mlvoca: already in from before (tinyllama, deepseek-r1:1.5b, mlvoca.com/api/generate, no key). Unchanged.

NOT tested on a device: the real chat call to api.free.ai (this sandbox has no network). Your keyless probe is the evidence the models answer.
If the first free.ai message fails with HTTP 404/405, the path is the one to change: PROVIDERS.freeai.chatUrl in www/index.html.

Tests: 232 pass, 0 fail. node --check clean on every changed JS file; inline JS check passed.
