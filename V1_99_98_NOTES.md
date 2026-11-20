# V1.99.98 - Ollama Cloud added

Changed: www/index.html (provider, icon, picker blurb, Settings text), horizon_model_policy.js (fixed test list, billing note), horizon_model_inventory.js, horizon_key_import.js, horizon_usage.js, horizon_about.js, horizon_release.js, android-native/app/HorizonAIPlugin.kt, HorizonCheckinPlugin.kt, package.json files, tests (version asserts).

1. Ollama Cloud is a new provider: POST https://ollama.com/v1/chat/completions, Bearer key, OpenAI-style. Base URL and model id come from your own Ollama dashboard snippet.
2. Picker seed is deepseek-v4.1-flash only (the one model confirmed by your snippet). Refresh tests 9 listed models: deepseek-v4.1-flash, deepseek-v4-pro:0813, minimax-m3, nemotron-3-ultra, nemotron-3-super, gemma4:31b, gpt-oss:120b, gpt-oss:20b, nemotron-3-nano:30b. The extra 8 come from a third-party listing dated 10 Sep 2026 and may be out of date. Refresh costs 9 small requests of your free allowance.
3. FREE STATUS UNCONFIRMED: session and weekly limits are unpublished and it allows one request at a time. A paid plan can bill. Third-party listing only.
4. Manual pick, no fallback, no model swap.
5. Native: ollama.com added to the Android host list and the check-in endpoint map: NEEDS AN APK REBUILD.
6. Not run against a live key: the build sandbox cannot reach ollama.com.
7. Your key was pasted in chat; rotate it at ollama.com/settings/keys.
