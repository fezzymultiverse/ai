# V1.99.95 - AnyAPI removed

Changed: www/index.html (provider, icon, card hint, picker blurb, Settings text, startup cleanup), horizon_browser.js, horizon_setai.js, horizon_people.js, horizon_usage.js, horizon_edge_tts.js, horizon_key_import.js, horizon_model_inventory.js, horizon_model_policy.js, horizon_app.css, horizon_about.js, horizon_release.js, scripts/edge_kit.sh, android-native/app/HorizonAIPlugin.kt, HorizonCheckinPlugin.kt, package.json files, tests/repair-v62.test.cjs.

1. AnyAPI is gone from the provider list, group chat, key paste (anyapi label no longer recognised), usage colours, avatar styles, model seeds and the check-in/native code.
2. A saved AnyAPI key, model list, certified-model list and backup keys are wiped on next start (same cleanup as Together, SambaNova, NVIDIA, Cerebras, GitHub Models, GonkaRouter). If it was the active AI, Horizon falls back to the first AI that has a key.
3. api.anyapi.ai removed from the Android host list and the check-in endpoint map: NEEDS AN APK REBUILD.
4. Routeway keeps its :free-only rule in the browser path and the check-in code.
5. Old changelog entries, audit files and the repair patch that mention AnyAPI are left as history.
