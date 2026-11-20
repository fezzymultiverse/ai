# Horizon V1.99.57 - TWO MORE KEYLESS AIs

Includes everything in V1.99.56. Nothing removed.
Changed: www/index.html, www/horizon_browser.js, www/horizon_usage.js, www/horizon_edge_tts.js, www/horizon_people.js, www/horizon_about.js, scripts/edge_kit.sh, tests/chatbox-v55.test.cjs and tests/docview-v56.test.cjs (version regex accepts V1.99.57). New: tests/keyless-v57.test.cjs.

## New keyless AIs (found in the GPT4Free docs, gpt4free.github.io/docs/ready_to_use.html: "API key: none required")
- G4F Groq   https://g4f.space/api/groq    default llama-3.3-70b-versatile
- G4F Ollama https://g4f.space/api/ollama  default gpt-oss:120b

Both: OpenAI-style, no account, no token, no Authorization header. They sit in the KEYLESS group with a model picker, model walk (dead model skipped, next one tried), usage colour, voice-list entry, people icon, @tags (@g4f groq, @g4f ollama, @g4fgroq, @g4follama) and browser-tool support.

## NOT verified (needs the phone / a network)
- No network in the build sandbox, so neither endpoint was called live. Model ids in the built-in fallback lists are best guesses. The app loads the real list from {base}/models when you tap Refresh models; if that call fails it uses the fallback list.
- These are community relays: per-IP limits, no SLA, models can change or vanish.
- If a relay starts demanding a key, tell me the exact error text.

## Tested
node --check on every www/*.js, inline-script check, bash -n on edge_kit.sh, all *.test.cjs (new keyless-v57 tests included).
