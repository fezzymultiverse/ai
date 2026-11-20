# V1.99.96 - Agnes AI added

Changed: www/index.html (provider, icon, picker blurb, Settings text), horizon_model_policy.js, horizon_model_inventory.js, horizon_key_import.js, horizon_usage.js, horizon_people.js, horizon_about.js, horizon_release.js, android-native/app/HorizonAIPlugin.kt, HorizonCheckinPlugin.kt, package.json files, tests (chatbox-v55, front-header version asserts).

1. Agnes AI is a new provider: base https://apihub.agnes-ai.com/v1, Bearer key, OpenAI Chat Completions (from Agnes's own docs, wiki.agnes-ai.com).
2. Picker lists agnes-3.0-flash and agnes-2.5-flash only. Image and video models are filtered out. Manual pick, no fallback, no model swap.
3. FREE STATUS IS UNCONFIRMED: the Agnes docs say nothing about free quota. The free tier (about 30 RPM, no card) comes from third-party listings. The card says so. Read your Agnes Token Plan terms.
4. Model IDs come from third-party listings; Agnes's overview doc lists none. If Refresh in the picker shows different IDs, tell me and the list is changed.
5. Native: apihub.agnes-ai.com added to the Android host list and the check-in endpoint map: NEEDS AN APK REBUILD.
6. Not run against a live key.
