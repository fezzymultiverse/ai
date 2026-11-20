# V1.99.89 - Cloudflare: your 19 verified models, no fallback

Changed: www/horizon_model_inventory.js, www/horizon_model_policy.js, www/index.html, www/horizon_about.js, www/horizon_release.js, package.json, scaffold/package.json, tests (v74, v55, front-header, v62). New: tests/cloudflare-v89.test.cjs.

1. Picker seed (inventory.verified.cloudflare) is exactly the 19 models that returned [OK] in your probe, in your order. It was empty before.
2. index.html fallbackModels and safeModels carry the same 19. No automatic model walk (policy keeps modelWalk=false).
3. gemma-2b-it-lora and gemma-7b-it-lora were being dropped by the non-chat filter (matches "lora"). Both are now allowed as chat models.
4. Default model is now @cf/meta/llama-3.1-8b-instruct-fp8 (the old default is not in your list). Cheap on the 10,000 neurons/day.
5. Left out because they failed your probe: deepseek-r1-distill-qwen-32b, gpt-oss-20b, mistral-7b-lora, glm-4.7-flash, llama-2-7b-lora (HTTP 000), and every 403 paid-plan model.

Tests: 225 pass, 0 fail. node --check clean on every changed JS file.
