# V1.99.97 - Gonka Broker added

Changed: www/index.html (provider, icon, picker blurb, Settings text), horizon_model_policy.js (model filter, billing note, fixed catalogue, Anthropic-style text reader), horizon_model_inventory.js, horizon_key_import.js, horizon_usage.js, horizon_people.js, horizon_about.js, horizon_release.js, android-native/app/HorizonAIPlugin.kt, package.json files, tests (version asserts).

1. Gonka Broker is a new provider. Protocol: Anthropic-style (POST https://proxy.gonkabroker.com/v1/messages, x-api-key header), taken from the playground's own Anthropic SDK snippet. Third-party listings also say OpenAI-style works; that is not used.
2. Models: deepseek-ai/DeepSeek-V4-Flash-0731, zai-org/GLM-5.3-Flash, MiniMaxAI/MiniMax-M2.7 (from the playground model picker). Manual pick, no fallback, no swap. The embedding model is not listed.
3. FREE STATUS UNCONFIRMED: about 1M tokens a month after SMS verification comes from third-party listings. The app has a paid TOP UP button, so a topped-up balance can be spent. Check the Gonka app.
4. Model refresh uses a fixed 3-model test list, because there is no known public model-list call.
5. Policy textOf now reads Anthropic-style replies (content blocks), needed for the model test.
6. Not added to background check-ins: that code only speaks OpenAI-style.
7. Native: proxy.gonkabroker.com added to the Android host list and the Anthropic reply parser: NEEDS AN APK REBUILD.
8. Not run against a live key.
9. The key in the screenshot you sent is exposed; rotate it.
