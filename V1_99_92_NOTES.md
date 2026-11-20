# V1.99.92 - GonkaRouter removed

Changed: www/index.html (provider, icon, card hint, picker blurb, Settings text, startup cleanup), horizon_browser.js, horizon_setai.js, horizon_people.js, horizon_usage.js, horizon_edge_tts.js, horizon_key_import.js, horizon_model_inventory.js, horizon_model_policy.js, horizon_app.css, horizon_about.js, horizon_release.js, scripts/edge_kit.sh, android-native/app/HorizonAIPlugin.kt, HorizonCheckinPlugin.kt, package.json files, tests (v55, front-header, manual-routing-v87, native-first.browser).

1. GonkaRouter is gone from the provider list, group chat, key paste (gonka/gonkarouter labels no longer recognised), usage colours, avatar styles and the check-in/native code. Implemented, unit tested.
2. A saved GonkaRouter key, model list and backup keys are wiped on next start (same cleanup used for Together, SambaNova, NVIDIA, Cerebras). If it was the active AI, Horizon falls back to the first AI that has a key.
3. api.gonkarouter.io removed from the Android host list: NEEDS AN APK REBUILD. Kept: the generic Anthropic-style code path, which Claude (api.anthropic.com) still uses.
4. Old changelog entries that mention GonkaRouter are left as history.

Not run on a device. Tests: 235 pass. node --check clean on every JS file; inline JS check passed.
