# V1.99.74 - Cloudflare models back, Edge voice plugin wired into the build

Changed: www/index.html, www/horizon_about.js, www/horizon_release.js, .github/workflows/build-apk.yml, tests/repair-v62.test.cjs, version files. New: tests/cloudflare-v74.test.cjs.

## 1. Cloudflare (free tier) lost DeepSeek and the rest
Cause: V1.99.62 ("stable Cloudflare defaults") added PROVIDERS.cloudflare.safeModels with only 2 models and filtered the live catalogue AND the saved list down to them.
Fix: the live Workers AI catalogue is used again. When it cannot be read, the saved list plus a built-in list of 14 is used:
llama-3.1-8b, llama-3.3-70b-fp8-fast, deepseek-r1-distill-qwen-32b, gpt-oss-120b, gpt-oss-20b, qwq-32b, qwen2.5-coder-32b, qwen3-30b-a3b-fp8,
llama-4-scout-17b, mistral-small-3.1-24b, gemma-3-12b-it, llama-3.2-3b, llama-3.2-1b, granite-4.0-h-micro.
A one-time migration (horizon_cf_models_74) replaces the saved 2-model list. A model your account is not allowed to use still answers 403 and is skipped (dead-model walk, unchanged).
Default model is still llama-3.1-8b (light on the 10,000 neurons/day). Big models cost more neurons.

## 2. "HorizonEdgeVoice is missing"
Cause: the workflow in the V1.99.73 zip never ran install_native.sh or install_edge.sh (the V1.99.66 workflow did). The 5 Kotlin files were in the zip but never copied into android/ or registered, so the APK had no plugin. Web files can never add it.
Fix: new workflow step runs install_native.sh --apply, install_edge.sh --apply, install_native.sh --check, edge_kit.sh --check, lists the Edge sources and greps the MainActivity registration. The "Verify native plugins are inside the APK" step now also requires HorizonEdgeVoicePlugin, EdgeTtsClient, EdgeGec and EdgeAudioPipe in the dex.
Tested here on a mock Capacitor android/ project: installer wrote 5 Edge files, registered the plugin before super.onCreate, added OkHttp + Media3 + Kotlin, and both --check commands passed.

## After the build
Settings > Voice > Microsoft Edge voices > Check native connection > Load / refresh all Edge voices > Test Edge voice > tick Use Edge voices.
If you have a second workflow (Horizon 999 / horizon.yml) that builds the APK, add the same step (scripts/ci/github-edge-snippet.yml). Otherwise that APK is built without the plugin again.

## Not verified
No Kotlin compile, no APK, no phone, no live call to Microsoft or Cloudflare in this sandbox. 202/202 repo tests pass. The first CI run is the real test.
