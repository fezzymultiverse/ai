# Horizon V1.99.40 — version bump

- Version string moved 1.99.39 -> 1.99.40 in www/index.html (cache-bust on 6 assets + WEB_VERSION), www/horizon_about.js (VERSION + changelog entry), tests/front-header.test.cjs (cache-bust assertion).
- No voice code changed. Horizon's Android voice path (www/horizon_tts.js) talks to the native HorizonAI plugin, which lists and uses the phone's default text-to-speech engine. If it does, installing Marmalade TTS and choosing it as the default engine (Android Settings > Accessibility > Text-to-speech) should be enough.
- NOT verified: the HorizonAI native plugin source is not in this zip, so whether it honours the default engine could not be checked here. Test on the phone: set Marmalade as default, open Horizon voice settings, press Test.
- Reminder from V1.99.39: the Edge voice fix lives in the native Kotlin plugin, so it needs a native rebuild (README.md).
