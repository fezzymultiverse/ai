# V1.99.91 - Mistral and Cohere: your verified models only

Changed: www/horizon_model_inventory.js, www/horizon_model_policy.js, www/index.html, www/horizon_about.js, www/horizon_release.js, package.json, scaffold/package.json, tests (v55, front-header, manual-routing-v87). New: tests/mistral-cohere-v91.test.cjs.

1. Mistral picker (implemented, unit tested): codestral-2508, codestral-latest, ministral-14b-2512/-latest, ministral-8b-2512/-latest, ministral-3b-2512/-latest, voxtral-small-2507/-latest. Default stays codestral-latest. Refresh keeps only these.
2. Cohere picker (implemented, unit tested): c4ai-aya-expanse-32b, c4ai-aya-vision-32b, command-a-03-2025, command-a-plus-05-2026, command-a-translate-08-2025, command-a-vision-07-2025, command-r-08-2024, command-r-plus-08-2024, command-r7b-12-2024, command-r7b-arabic-02-2025. Default stays command-a-03-2025. Refresh now keeps only these (before it accepted any chat model Cohere listed).
3. Left out: Mistral 429 (medium, small, magistral, vibe, code) and 403 (labs-leanstral); 400 (moderation, voxtral-mini, transcribe, tts). Cohere command-a-reasoning-08-2025 (HTTP 000) and cohere-transcribe (400). North and Tiny Aya were not in your probe, so they are removed from the picker.
4. The 429 Mistral models may work later; a 429 is a limit, not a dead model. Say the word and I add any back.

Not tested on a device. Tests: 235 pass. Needs no APK rebuild beyond the V1.99.90 one.
