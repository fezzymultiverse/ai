> **WhatsApp feature removed.** The WhatsApp notification-preview feature (toast pills, pinning, reply drafts, "Let AI see my latest previews", the notification listener service and its Android permission screen) is gone from the app, the native build, the CI checks and the tests. On first launch the app wipes any WhatsApp preview data an older build left on the phone. Older changelog entries and validation files below are kept as history.

> **Current source release: V1.93.14.** Deep-scan repair: thirteen-provider streaming, honest errors and usage, cancellation, two optional visual controls, keyless live data and targeted integration fixes. See DEEPSCAN-AUDIT-V1.93.14.txt for test evidence and remaining device/live-account checks. Previous releases: Natural male and female English voices in Settings > Voice: the best installed Android voice of that gender, spoken directly with no effects, alternating between the two in group chats. Before that: group and provider fixes (V1.93.1 to V1.93.7), including hold to read and queued Debate/Judge. Before that: WhatsApp silent send + auto-read toggles (V1.92.0), long chats open on their newest 40 messages (V1.92.1), live download progress card (V1.92.2), one-line tool descriptions (V1.92.3), Downloads tap fix (V1.92.4). Read [UPGRADE-REPORT-V1_93_0.txt](UPGRADE-REPORT-V1_93_0.txt) for changes and limits and [PERFORMANCE-PLAN.txt](PERFORMANCE-PLAN.txt) for the real-phone test plan. This ZIP contains source, not an APK. Older version descriptions below are historical.

<p align="center">
  <img src="resources/icon.png" alt="Horizon" width="128">
</p>

<h1 align="center">HORIZON</h1>

<p align="center">A clean Android AI chat app built with Capacitor. Gemini, Groq, Cohere or free Pollinations, one at a time, no fallback chains. V1.3.0 turns Settings into a three-row list, adds a PERMISSIONS panel with red/green switches, and adds a YouTube music feature: ask the AI about music, ask it to download, and watch progress in a Downloads box.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-00e5ff"></a>
  <img alt="Platform: Android" src="https://img.shields.io/badge/platform-Android-000000">
  <img alt="Capacitor 6" src="https://img.shields.io/badge/Capacitor-6-00e5ff">
</p>

## V1.89.0 provider endpoint fix

AnyAPI, Routeway and GonkaRouter all failed with **Unsupported AI endpoint**. Cause: `HorizonAIPlugin.kt` only allowed six hosts (Gemini, Groq, Cohere, Mistral, OpenRouter, Pollinations), so the native bridge rejected the three gateway hosts before sending anything.

- **Implemented:** `api.anyapi.ai`, `api.routeway.ai` and `api.gonkarouter.io` added to the allowlist in `request()`. Still HTTPS only; redirects are still not followed, so keys never go to a redirect host.
- **Implemented:** the background-notification text parser now reads GonkaRouter's Anthropic-style reply (`content` array).
- **Implemented:** `tests/endpoint-allowlist.test.cjs` fails the build if a provider base URL in `www/index.html` is missing from the native allowlist.
- **Tested here:** `node --test tests/*.test.cjs` passes.
- **Not tested:** Kotlin compile and on-device sending. Rebuild with the existing workflow, then send one message on each provider.
- **Planned check:** GonkaRouter uses `/v1/messages` with an `x-api-key` header. Its `/v1/chat/completions` path was confirmed working from Termux; `/v1/messages` was not.

## V1.87.0 integration patch — WhatsApp, Termux, downloads and keyboard

This ZIP is updated **project source**, not a production APK. Rebuild using the existing GitHub Actions **Build Android APK** workflow. It calls `scripts/apply-android.sh`, which now also runs the idempotent `scripts/apply-bridges.py`; do not copy Kotlin files manually. The unchanged voice-bundling step remains necessary for the full release APK. Existing providers, API-key import, speech, PDFs, Vault, app lock and chat logic were not re-authored.

### Where the features live

Open **Settings → Permissions**. Two new cards appear below the existing permission rows:

**WhatsApp bridge**

- Independent WhatsApp personal and WhatsApp Business switches, plus background alerts and confirmed replies.
- **Grant access** opens Android's notification-listener settings. Android describes this as broad notification access; Horizon's listener filters to `com.whatsapp` and `com.whatsapp.w4b` and only captures enabled sources. **Allow pop-up alerts** requests Horizon's notification permission and opens its settings if blocked. Android notification channel settings, Do Not Disturb, force-stop, managed-device rules and OEM battery restrictions can still suppress delivery/banner presentation.
- **Message inbox** shows sender, conversation, time and notification text. Foreground message banners use the WhatsApp symbol; background alerts use an Android notification with WhatsApp icon, sender and an expandable preview. Tapping opens the inbox. No unreliable background custom Toast or overlay permission is used.
- Capture is notification-based: it cannot unlock the WhatsApp encrypted database, load all historical conversations, recover hidden previews, retrieve media attachments, or see messages that produce no readable notification. Active previews can be collected on connection; this is not a full-history import.
- Captured previews stay in private app preferences, with at most 300 messages and a seven-day rolling read/capture window. Expired entries are purged on the next access/capture, not by an exact-time deletion alarm. Turning a source off purges its captured rows. **Clear inbox** removes all stored previews. These preferences and Termux result preferences are excluded from Android cloud/device backups by the added rules. No extra server is involved.
- The AI is not automatically sent new messages. Each AI read asks before sharing with the selected chat provider; its results are paginated to avoid flooding the prompt. After sharing, those tool results enter the normal chat/provider processing flow; clearing the capture inbox is not deletion from a provider or existing chat history.
- Replies use WhatsApp's live notification RemoteInput action and always require native confirmation with recipient/conversation and exact text. A removed/expired reply action requires opening WhatsApp. A successful handoff means **submitted**, not delivered/read. To start a new conversation, the AI can open a WhatsApp draft with an international phone number; you must tap **Send in WhatsApp**. No accessibility auto-clicking, unsupported silent-send API or Business API credentials are assumed.

Examples to ask your AI: “Read my captured WhatsApp messages from Alex”, “Check all captured messages, continue through all pages”, “Reply to Alex: I will call in ten minutes”, or “Prepare a WhatsApp Business message to +[international number]”.

**Your Termux · native bridge**

- Uses your standard `com.termux` installation, its official RUN_COMMAND service and the `com.termux.permission.RUN_COMMAND` runtime permission. It is separate from Horizon's original limited native shell, which stays intact.
- **One-time external prerequisite:** standard Termux must be installed and initialized, and `allow-external-apps=true` must be enabled in `~/.termux/termux.properties`. Grant Horizon **Run commands**. Android's app sandbox prevents Horizon editing Termux's private properties before that bridge is allowed. “Open Termux setup” opens Termux; it cannot bypass the prerequisite or silently enable it. After setup there is no need to reopen Termux or paste commands for ordinary jobs.
- Turn on the bridge, tap **Grant permission**, then **Test bridge**. Permission alone does not prove Termux accepts external commands; the actual test result does.
- **Install download tools** offers `pkg install -y python ffmpeg aria2` and installs/upgrades yt-dlp through Python. Approve the displayed native command. Package repositories/network access and a compatible Termux distribution are required.
- **Review & run command** and AI commands show the exact command in a native confirmation. This executes with Termux's access, not root and not an isolated shell sandbox. Do not approve commands you do not trust.
- Commands run as background Termux tasks with an explicit mutable one-shot PendingIntent directed at a non-exported result receiver. Exit code/stdout/stderr are captured, limited and stored for recovery. **Recent jobs / results** retrieves recent submissions after a WebView restart. Old results are pruned on a subsequent submission; the list shows the newest 20.
- A UI timeout means completion is **unknown**, not cancellation. Do not blindly repeat an install, send or download; use Recent jobs or check Termux first. Turning the bridge off prevents new jobs; it does not kill jobs already running in Termux. Android battery/force-stop restrictions can still interrupt Termux.

### Music playback

AI music commands wait for the library cache to initialize and automatically scan storage when the library is empty. Concurrent requests share one scan. If Android needs Music/audio permission, the existing permission request is used and a refusal returns a specific error. A cache-open watchdog prevents a blocked IndexedDB open from hanging all commands. `music.scan` can refresh manually through the AI tool.

An empty local library no longer means the app cannot play music. Local playback is attempted through the actual player; AI play/resume only reports success after playback progress, and returns an error when it does not start. YouTube streaming remains separately controlled by the per-chat YouTube switch and source availability. No access to private/age-restricted/DRM content is promised.

### Downloads

- Direct HTTPS files, ZIPs and images use Android DownloadManager for durable system-owned transfers, retry/wait handling and completion notifications. The Downloads history reattaches these native jobs after a reload instead of declaring them interrupted. Files go to `Download/Horizon`, images to `Pictures/Horizon`. Existing MediaStore paths remain for other audio/video saves.
- File/image/repository AI tools follow **File access**, not the YouTube-specific switch. Unknown direct links still ask for approval. A bare public GitHub repository URL is resolved through GitHub's API to its actual default branch and downloaded as ZIP. Private/authenticated/rate-limited repositories need an authorized accessible download URL; no token-bypass is attempted.
- YouTube extraction tries pinned native NewPipeExtractor **v0.27.0**, then the existing direct clients and public sources. Both extraction failures and save failures enter retry handling. When enabled, Termux/yt-dlp is the final confirmed download fallback, with FFmpeg for adaptive streams/conversion. YouTube changes may still require future extractor/yt-dlp updates; no implementation can guarantee every video or site.
- Magnets use aria2 through Termux when enabled, after native command approval; otherwise the existing external torrent-app handoff remains. `.torrent` files can be saved/opened with an installed torrent client, and Termux's command box can run aria2 on a permitted URL/file. The Download screen's torrent flow uses the same bridge. Seeding stops after the download (`--seed-time=0`). Use only material you have permission to download/share.
- Termux downloads use shared `~/storage/downloads/Horizon` **if already accessible**, otherwise `~/horizon-downloads` inside Termux. The latter is private to Termux and will not automatically appear in Horizon's Files picker or Android's Downloads folder. Configure Termux shared-storage access if you want public files. Completion/result text reports the path. Termux download byte progress is not a native torrent progress dashboard.
- “Queued”, “submitted”, “completed” and “unknown/timed out” are kept distinct. A partial or failed job is not reported as a finished download.

### Keyboard and performance

Android adjustResize remains the primary layout owner. Native overlap measurements are suppressed while the IME animates; the web fallback avoids subtracting a stale keyboard cover from an already-resized viewport. The delayed blur that could cancel a new keyboard opening was removed. Textarea measurements are deferred during composition and keyboard movement. Download history repaints back off while typing/keyboard movement is active. WhatsApp notification parsing/storage runs on its own worker, not Android's UI thread. New interface styling is scoped, uses existing theme variables and respects reduced motion. This is targeted contention reduction, not a claim of a universal JavaScript speed multiplier or a measured FPS guarantee on your phone.

### Verification and limits

- `npm test`: **42/42** passed (24 retained existing tests plus 18 new checks).
- Mobile Chromium: **14 integration checks** passed, including clean boot, permission cards, safe message rendering, consent refusal, bounded read tool routing, no false reply delivery claim, keyboard focus/composition and single-flight music scanning/playback failure reporting. Native WhatsApp/Termux/audio boundaries were mocked for these UI tests.
- All application JavaScript and inline scripts passed syntax checks. The Android patch script was applied repeatedly to check idempotent component/dependency wiring.
- Actual Android Kotlin/Java compilation, manifest/resource merging, desugaring, dex merging and debug packaging passed with Java 17 / Android SDK 34. For local compile/packaging verification only, the pre-existing voice API source was fetched; the large original voice binaries/models were **not** bundled locally. The resulting development APK is deliberately not supplied as a complete replacement. Use the unchanged existing release workflow, including its voice-bundling step.
- Not device-verified here: real WhatsApp/Business notification formats/reply action expiry, notification delivery under OEM battery limits, actual Termux authorization/setup/package installs, real yt-dlp/torrent transfers, and keyboard smoothness on your device. These need a rebuilt APK and your phone. No production signing key or provider credentials were requested.

### Third-party licensing

The original Horizon source license is retained. NewPipeExtractor is **GPL-3.0-or-later**, not MIT. Distributing an APK linked with it carries GPL obligations for the combined work, including corresponding-source/licence requirements; do not describe that combined binary as MIT-only. The upstream licence is included at `resources/android/NEWPIPE-LICENSE.txt`. Source: https://github.com/TeamNewPipe/NewPipeExtractor/tree/v0.27.0 . Review distribution obligations before publishing.

Upstream technical references: https://github.com/termux/termux-app/wiki/RUN_COMMAND-Intent ; https://developer.android.com/reference/android/service/notification/NotificationListenerService ; https://developer.android.com/reference/android/app/RemoteInput ; https://developer.android.com/guide/topics/ui/notifiers/toasts .

## What's new in V1.87.0

- **Speech reliability:** Android MediaPlayer playback for generated WAV audio bypasses WebView audio locks. Standard Android voice is the first-run default. Missing bundled voices fail fast; replies fall back, while the explicit voice Test reports the selected engine's error. Native WAV pause, resume, stop, cleanup and watchdogs are included. Rebuild the APK to include the native changes.
- **Provider note import:** at the bottom of API PROVIDERS PLUS KEYS, paste provider-labelled notes, JSON or environment-style entries. Gemini `AIza`, `AQ` and `Aq`, Groq and OpenRouter prefixes can be routed standalone. Ambiguous keys require labels. Main and backup keys are checked before saving; duplicates are skipped. Gateway checks make a minimal completion request and can consume tokens. Quota/network failures are not silently treated as verified keys. Notes are local, not sent wholesale to an AI, and masked from UI Lens captures.
- **Gateway routing:** GonkaRouter uses the documented `/v1/messages` protocol with `x-api-key`; AnyAPI and Routeway retain their documented `/v1/chat/completions` URLs. Public model catalogs are no longer treated as authentication. Live models are filtered by availability and supported endpoint, and the existing AnyAPI/Routeway free-only policy stays in place. Sources: https://gonkarouter.io/docs ; https://docs.routeway.ai/getting-started/models ; https://models.dev/providers/anyapi . A free-only catalog with no eligible models now gives an error instead of silently selecting a paid model.
- **Grey theme:** muted, high-contrast green quick replies target the correct `grey` theme. Three unobtrusive visual details: welcome horizon line, starter-card corner arrows, composer focus outline. Existing interface structure is retained.
- **PDF reliability:** numerical and `ten-page` requests use smaller section calls, existing page-count verification/expansion, an outline fallback, empty-section protection and cancellation propagation. Selectable text allowance is 120,000 characters. Scanned PDFs send up to ten page images to supported vision models (individual provider image limits still apply); PDF resources are released after reading. Exact generated page count still depends on provider output and layout.
- **Verification:** `npm test` passes 24 automated tests, including native speech bridge simulations. Mobile Chromium passed 14 integration assertions with mocked provider responses, including rejecting invalid keys behind public catalogs, four-provider note routing, eight-section document generation, actual ten-page PDF rendering and text extraction through page ten. All application JS and inline scripts passed syntax checks. Provider credentials were not supplied, so no live authenticated account test was possible. Native Android code was not compiled or run on a phone here; this ZIP is updated project source, not an APK. The existing GitHub Actions workflow builds the APK.

## What's new in V1.86.0

- **Voice library (human voices you download).** Settings > Voice > *Natural: On-phone voices* now has a Voice library. Packs are the official sherpa-onnx voices from the `tts-models` release: **Kokoro** (28 English voices, US and UK, about 130 MB), **Piper** Lessac and Ryan in high (about 110 MB) and medium (about 60 MB), plus Amy, Joe and Alan (medium), and small Lessac, Ryan and Amy, plus HFC, Kristin, Norman, John, Kusal, LJSpeech, Danny, Kathleen, Alan (small), GLaDOS and LibriTTS-R (many speakers; first 12 listed) (roughly 20-30 MB, not checked). A pack downloads once, unpacks into app storage and runs offline through the same sherpa-onnx runtime as the bundled Kitten voice. Delete removes it. The 8 Kitten voices stay bundled as the default.
- **How:** `HorizonVoicePlugin.kt` gains `packs`, `download`, `cancelDownload`, `removePack`, and `load` / `synth` take a `pack` (`builtin` or a pack id). A pack with `voices.bin` is loaded as Kokoro, any other as Piper (VITS). Only one model is held in memory. `scripts/apply-android.sh` adds `commons-compress` (to unpack `.tar.bz2`). `horizon_tts.js` adds the catalog (`PACKS`) and `HorizonTTS.packs`; `index.html` adds the Voice library rows.
- *Tested:* JS syntax; the voice-list rebuild, download, remove and fallback against a stubbed plugin in Node. *Not tested:* the Kotlin was not compiled here (no Android toolchain) and nothing ran on a phone, so the CI build is the first compile. Not checked against the live release: the exact archive sizes, that each archive name still exists, and the Kokoro speaker order (af 0-10, am 11-19, bf 20-23, bm 24-27; if a gender is swapped, change that voice's `sid` in `PACKS`). Big packs can speak slowly on a weak phone: that is a phone limit, so pick a medium Piper voice for speed.

## What's new in V1.85.0

- **V14 Typing indicator styles.** New Settings card (`horizon_ind.js`, `horizon_ind.css`). Dots, Laser, Orbiting diamond or Terminal cursor, kept in `horizon_ind` and applied through `html[data-ind]`.
- **P1 Live step text.** `horizon_v2.js`: while a reply runs, the pill shows the thinking bubble's current step (detail after the colon dropped) and clears it afterwards. Checked every 300 ms from the pill's existing animation frame, no new observer.
- Already in the app, nothing changed: F25 undo toast, F6 pinned banner, F3 swipe quote.
- *Tested:* JS syntax; the four styles and their Settings previews drawn in Chromium; picker click sets the attribute and storage; pill step text appears, updates and clears. *Not tested:* a build or the phone.

## What's new in V1.84.0

- **Speed pack.** The typewriter (`index.html`) now changes one text node per step and moves the caret only when needed; before, every step rewrote every text node from the top, which woke every page observer and forced a layout each time. `horizon_fold.js` batches its height reads and writes. `horizon_bojack.js` and `horizon_msgmenu.js` wait for changes to settle instead of reacting to each one. `horizon_perf.css` skips layout and paint for replies far above the screen (`content-visibility`) and animates only the newest three messages when a chat opens.
- **Fixed:** `horizon_downloads.js` threw `Cannot access 'trust' before initialization` at load, so `HorizonDownloads` was never created.
- *Tested:* JS syntax everywhere; typewriter output identical old vs new in Chromium (0 differences over 89 checks); DOM mutation events per reply 5560 to 403; headless boot with a 80-message chat shows no page errors. *Not tested:* a build or the behaviour on the phone.

## What's new in V1.83.0

- **Group rounds keep the page awake in the background.** `HorizonAIService` now publishes `holding` (true while a held turn runs, false when it is released or destroyed). `MainActivity.onPause` already kept the WebView running for the background switch and read-aloud; it now does the same while `HorizonAIService.holding` is true. Before, a group round held the foreground service but the page itself could still be throttled between two AIs.
- *Tested:* JS syntax everywhere; the edits re-read by eye against the surrounding Kotlin and Java. *Not tested:* a Kotlin/Java compile (the sandbox has no Android SDK, the GitLab build is the first compile) and the behaviour on a phone.
- *Not changed:* audio focus, SuperSonic handling, refresh rate (already asks for 90 Hz, the X5b's maximum) and any removal of old code, see the notes in chat.

## What's new in V1.82.0

- **Routeway provider** (`api.routeway.ai/v1`). Free models only: the list is filtered to ids ending `:free` and any other id is swapped for `deepseek-v4.1-flash:free` before sending. The nine built-in ids come from a real `/v1/models` call (287 models, 9 free). Free models are documented as about 200 requests a day.
- Wired into key cards, AI sheet, usage colours, auto-switch on rate limits, group chat and the widget chat. No picture input.
- *Tested:* JS syntax everywhere; the model list from a real call; the free-only swap and request shape against stubs. *Not tested:* a real Routeway chat reply, and the new card inside the running app.

## What's new in V1.81.0

- **AnyAPI provider** (`api.anyapi.ai/v1`). The model list is filtered to ids ending `:free`, and the chat call swaps any non-free id for the default free one, so it cannot spend credit. Eight free ids from a real `/models` call are the built-in fallback list.
- **GonkaRouter provider** (`api.gonkarouter.io/v1`). Three models: GLM-5.3 Flash, DeepSeek V4 Flash 0731, MiniMax M2.7. The 1,000,000 free tokens are a one-time grant; a 402 shows a clear out-of-balance message.
- Both are wired into the key cards, AI sheet, usage dashboard colours, auto-switch on rate limits, group chat and the widget chat. Neither sees pictures (images are not sent to them).
- *Tested:* JS syntax everywhere; the key test and model list on a real phone key (HTTP 200, 3 Gonka models, 12 AnyAPI models of which 8 are free, a Gonka chat reply). *Not tested:* an AnyAPI chat reply, and the new cards inside the running app (the build sandbox has no network and no device).

## What's new in V1.80.0

- **YouTube routes** (`horizon_ytdirect.js`). Seven player clients (Android VR 1.65 and 1.60, iOS, Android test, Android, TV embedded, TV) instead of two. Each link gets a 2-byte Range probe first; a 403 or 410 means that route needs a token, so the next one is tried. visitorData from the search answer is reused. Audio falls back to a combined stream when no audio-only link works.
- **Retry on failure.** `yt.play` and downloads ask a different route for a fresh link when the player or the saver refuses one (up to 3 routes). Songs the player will not stream directly are pulled in 2 MB Range chunks (`HzYtDirect.fetchBlob`) and played from that copy.
- **Better errors.** When the direct routes and the public servers all fail, the error carries `HzYtDirect.diag()` (what each route answered), so the cause is visible.
- **PDF page count.** Requests for 4+ pages (was 8+) use the section-by-section build, aimed at about 470 words a page. After the build `fitPages` counts the real pages (`HorizonPDF.pageCount`); if short it asks for extra new sections and counts again, twice at most. "up to / at most N pages" is left alone. It adds, it never trims, so a run can land one page over.
- *Tested:* JS syntax everywhere, the page-request pattern. *Not tested:* on a phone or against live YouTube (the build sandbox cannot reach YouTube), and the client versions are from memory of what worked in 2025, so some routes may be stale. If it still fails, send `HzYtDirect.diag()`.

## What's new in V1.78.0

- **YouTube works again.** The public Piped and Invidious servers Horizon relied on are mostly down or blocked, which is why the AI could not search or download. New `www/horizon_ytdirect.js` asks YouTube's own app API (InnerTube) straight from the phone through the native HTTP layer (`CapacitorHttp`, so no CORS and the User-Agent is really sent). Search, audio and video use it first; the old public servers are only the backup. The stream link is locked to the client that asked, so the native saver (`HorizonAIPlugin.saveMedia`) now takes a `ua` and sends it.
- **Play music.** New AI tool `[[yt.play: VIDEO_ID | Title]]` streams a song through the music player with no download (`HorizonMusic.playRemote`). If the player refuses the direct link, it fetches the audio through the native layer and plays that copy. The tool only says Started once sound is really running.
- **Library play is less picky.** `music.play` and `music.search` ignore dashes, `feat.`, `Official Video` and similar, and a long query may miss one word.
- **Images.** `[[img.search: words]]` finds openly licensed pictures (Openverse, Wikimedia Commons as backup). The AI sends one by writing `![caption](https://link)` on its own line; the chat draws a picture card with Save, Share and Open. `[[img.save: url | name.jpg]]` and the card's Save button store it in Pictures/Horizon and list it in Downloads.
- All of it sits behind the chat's YouTube button, as before.
- *Tested:* JS syntax everywhere, the direct YouTube client against mocked responses (search, audio and video picks, bad id), the picture-line and library-match patterns. *Not tested:* on a phone or against live YouTube, and the Kotlin edit (one `ua` line in `saveMedia`) was not compiled. YouTube changes its app API now and then; if search or play stops again, Settings shows the failure and `HzYtDirect.diag()` lists what each client said.

## What's new in V1.77.0

- **Long-press menu** (`horizon_msgmenu.js`). Hold any message: Copy, Quote, Select text, Pin to top, Share, Read from here, Delete. Delete on a reply removes only that reply; on your message it removes the message and the reply under it, as before.
- **Quote reply.** Swipe a message right (or pick Quote). The quote sits above the message box and is sent as `> ` lines with your next typed message; sent messages show it as a quote block.
- **Pinned banner.** One pinned message per chat (`chat.pinTs`), shown at the top of the chat. Tap to jump, X to unpin.
- **Undo toast.** Deleting a message or a chat shows a toast with UNDO for 5 seconds (`act` option added to `HzToast`). The confirm box is gone.
- **Remember.** A brain button on every reply opens a small editor and saves the line to the Memory box (`window.HzMsg.remember`).
- *Not tested:* on a phone.

## What's new in V1.76.0

- **Top pill.** `<` and `>` arrows step through providers that have a key (`window.HzCycle` in `index.html`); the middle still opens the AI sheet. The Laser runs along the pill's bottom edge while a reply runs. Tokens in/out and reply time in ms sit on the same line (`window.HzLast` from `horizon_usage.js`). Not shown in group chats or with a single key.
- **Final sweep.** When a reply finishes, the Thought process bar and the pill get one fast Laser pass (`HzLaser.sweep` in `horizon_laser.js`), then settle.
- **Scroll-to-bottom button** (`horizon_fab.js`). Count of new AI replies while scrolled up. Tap = latest, hold = previous AI reply.
- *Not tested:* on a phone.

## What's new in V1.75.2

- **Thought process bar: Laser pulse, smaller.** The dotted line under "Thought process" now shows the Laser style from the pulse lab: dim segments and a thin hot line with bloom sweeping across while the AI thinks; solid green when done. Segments are thinner and shorter (3px tall, 18px max) with a softer glow. `www/horizon_laser.js` moves the beam from JavaScript, so Android's Remove animations setting cannot freeze it (the old bar was switched off under that setting). CSS is the `.th-bar` block in `www/index.html`. *Not tested:* on a phone.

## What's new in V1.75.1

- **Browser, light mode.** Hard-coded black backgrounds made icons, arrows, the eye button, the URL pill, chat text and the bottom strip invisible in light mode. A scoped block at the end of `www/horizon_tidy.css` fixes it. Dark and cyan themes unchanged. *Not tested:* on a phone.

## What's new in V1.75.0

- **Voice: small built-in voice.** Kokoro (very large) is replaced by Kitten nano through the same sherpa-onnx engine. 8 English voices, 4 female and 4 male, offline, no key, nothing downloaded on the phone. `scripts/bundle-voice.sh` fetches it at build time; the plugin builds an `OfflineTtsKittenModelConfig`. The engine id stays `kokoro` internally so saved settings keep working; old Kokoro voice picks fall back to the first voice.
- *Not tested:* on a phone or in the real build. The speaker order (male, female, male, female...) is from the Kitten voice list; if a gender is swapped, change the `sid` numbers in `KOKORO.voices` in `www/horizon_tts.js`. Kokoro is still in the V1.74.0 zip.

## What's new in V1.74.0

- **Proactive Daemon** (Settings > Proactive Daemon). While Horizon is running, it watches the battery. When the level falls to yours (10 to 30%, default 15%) and the phone is not charging, Horizon pauses the music, stops reading aloud if it was, and pops a banner: "Fezzy, battery is low (14%). I paused the music. Plug in soon." The banner only claims what it really did. One alert per drain (it re-arms when you charge or the level climbs 5 points) and at most one every 30 minutes. If the page cannot answer, the native side posts a plain banner anyway.
- **Heat instead of CPU.** Android has hidden real CPU load from apps since Android 8, so Horizon cannot read it. It watches the phone's own heat warning (severe and worse) and reacts the same way.
- **"Need help?"** Eight or more separate backspace taps in 12 seconds, making up at least 40% of the keystrokes (a held key counts once), and Horizon asks "Need help?". Tap it to start a voice note instead of typing. Works in Horizon's own text boxes only, once every 10 minutes.
- **Test buttons** for the battery and heat alerts, so you do not have to drain the phone.
- **Not done on purpose:** "stopped background syncing". Horizon has no background sync to stop, so the banner never says it. The daemon does not run when Android has closed Horizon, and it cannot see typing in other apps.
- New files: `HorizonDaemonPlugin.kt`, `horizon_daemon.js`. Also `horizon_music.js` (pauseNow), `index.html`, `MainActivity.java`, `apply-android.sh`, the workflow.
- *Tested:* JS syntax, the typing detector and the battery reaction in a stubbed run. *Not tested:* the Kotlin was not compiled and nothing ran on a phone; the CI build is the first compile.

## What's new in V1.73.0

- **Voice: Kokoro is now built into the app.** The 28 English Kokoro voices (US and UK, female and male) run natively through sherpa-onnx. The runtime, its Kotlin API and the Kokoro multi-lang v1.0 int8 model are packed into the APK by `scripts/bundle-voice.sh` during the build, so there is nothing to install and nothing to download on the phone. The first use unpacks the model once (a few seconds), then it starts fast and works offline. Replaces the WebView Kokoro (kokoro-js), which had to pull its model through the app's network layer and would not play. New file: `HorizonVoicePlugin.kt`. The plugin returns a WAV per sentence, so speed, pitch, pause and stop work like the other voices.
- **Pollinations and OpenAI voices removed** (they needed keys). Their key boxes are gone. An old Pollinations or OpenAI voice pick becomes Kokoro. Pollinations as a chat and image provider is untouched. Voices now: Gemini (your keys), Kokoro (built in), Android voice.
- **First run default is Kokoro** in the app (no key needed).
- **Build:** new workflow step "Bundle the built-in voice" and an APK check that fails the build if the voice libraries or model are missing. APK is arm64-v8a only and several tens of MB bigger. Optional repo variable `SHERPA_VERSION` pins the sherpa-onnx release (default: newest).
- *Tested:* JS syntax, the TTS engine against a stubbed plugin (engine migration, speak path, missing-plugin error), the bundle script against mocked `gh` and `curl`, the workflow YAML. *Not tested:* the Kotlin was not compiled here and nothing ran on a phone, so the CI build is the first compile. Not checked against the live release: the sherpa-onnx asset names and the speaker order of the Kokoro voices (ids follow kokoro-multi-lang-v1_0: af 0-10, am 11-19, bf 20-23, bm 24-27). If a voice has the wrong gender, tell me which one.

## What's new in V1.67.11

- **Group reply.** Every AI message in a group has a Reply button. It fills the box with @that AI so only that one answers.

## What's new in V1.67.10

- **Chat box.** The text starts at the top left and uses the full width. The icons sit on a row of their own under it, and the box grows upward.
- **Chat list.** Pin and bin fit on screen, no sliding right.
- **Preferences.** One box per preference, each with its own bin, plus Add preference. Stored the same way as before (one per line), so old preferences load as separate boxes.

## What's new in V1.67.9

- **Top pill.** Group chat shows only the words GROUP CHAT. One on one shows only the provider name; the model is on the reply. The words are centred and spread evenly.
- **Group in the background.** One Kotlin background service now stays up for the whole group round (and 8 s after it), so leaving the app no longer slows the next AI, the typing or the voice. Typing finishes at once when you leave. Files: `HorizonAIService.kt`, `index.html`, `horizon_usage.js`, `horizon_hdr2.js`, `horizon_fix.css`.
- *Not tested:* on a phone (no Android build here).

## What's new in V1.67.5

- **Group chat fix.** Starting or leaving a group no longer says "Horizon is busy". A stuck or slow reply (for example a dead provider) is stopped for you and the group starts.
- **Chat box.** The text runs the full width, left to right, on its own row. The buttons sit under it: plus and clip on the left, speaker, mic and send on the right. New file: `horizon_fix.css`.
- **Light grey.** A bit darker (not too dark). Tool tiles and their icons are soft grey and soft green instead of hard black. Dark cyan is untouched.
- **Voices.** Microsoft Edge and TTS.ai are removed (the Edge Java file and its plugin method are gone too). **Kokoro** is new: 28 natural English voices (US and UK, female and male), no key, no account, no limit. It runs on the phone with the open-source kokoro-js library. The first use downloads the voice model once (about 90 MB), then it works offline. Old Edge and TTS.ai picks become Kokoro. Gemini, Pollinations and the Android voice stay.
- *Not tested:* on a phone. The Kokoro library loads from jsDelivr the first time (versions 1.2.1, then 1.2.0, then 1.1.1 are tried).

## What's new in V1.67.4

- **Fold all stays right.** The Fold all / Unfold all button is pinned to the right of the action row (next to the speaker button) instead of sitting in the middle.

## What's new in V1.67.3

- **Two themes.** Dark green and Dark purple are removed. Dark cyan stays as the main theme and **Light grey** is new (soft grey surfaces, dark text, deep cyan accent). Old green and purple saves become Dark cyan.

## What's new in V1.67.2

- **Fold all keeps reading.** A folded reply is a small scroll window: swipe inside it to read the whole message without unfolding. At its top or bottom the swipe carries on into the chat.

## What's new in V1.67.1

- **AI sheet.** Tap the provider pill, pick a provider, then a model (each has a plain-English description). A provider with no key still shows its models, with a **Set API key** box in the sheet: paste, Save key, done. The welcome-card pill opens the same sheet.
- **Read-aloud pill.** While a reply is read, its speaker button becomes a wide pill: speaker icon on the left, a long waveform beside it. Paused = amber.
- **+ menu.** On = green all over, off = black with a red dot. Tiles flip instantly. A tool that needs something no longer paints a red dot over an ON tile (the Vault stayed red while locked). Memory no longer opens Settings.
- **Keyboard.** The message box rides on top of the keyboard. New files: `horizon_v3.css`, `horizon_lift.js`; `MainActivity.java` measures the keyboard cover.

## What's new in V1.65.4

- **Voice in the reply speaker.** The Voice pill is gone. The waveform replaces the speaker icon on the reply being read. Tap = pause / resume, long-press = stop.
- **Top panel.** The usage badge sits next to the provider pill in the header. The right-middle arrow tab is smaller.

## What's new in V1.65.3

- **Cyan edge.** The edge door and the right-middle settings tab are cyan.
- **Compact drawer.** The door drawer is only as tall as its tiles, with Menu and Settings at the bottom.

## What's new in V1.65.2

- **Terminal is more alive.** The prompt is colour-coded (user purple, host cyan, folder pink, `$` green) and the first word of each command you run is bold white. New lines fade in, and a colour sweep under the title bar speeds up while a command runs. The key rows are grouped by colour: arrows cyan, Ctrl purple, Esc and Tab amber, Home/End/PgUp/PgDn green, `^C` and `^D` red.
- **Coloured messages.** A line that starts with an error, a warning, `ok`, `done` and so on is coloured. Files you `cat` are left alone. A very long dump appears at once, with no fades.
- **Boot lines.** The first time you open the terminal, three short lines appear before the banner (Bojack online, shell ready, private folder, no root).
- Commands run exactly as before. New files: `horizon_termlive.css` and `horizon_termlive.js`; `horizon_terminal.js` gained two one-line hooks.

## What's new in V1.65.1

- **About scrolls and taps again.** V1.63.1 made the Settings panel a pan-y scroller and let the browser skip painting changelog entries. On some phones that left About stuck, with nothing tappable. Both are removed, so the panel is a plain vertical scroller again.
- **Github Push.** The GitHub app is now named Github Push in the Apps panel, the Settings dock, the app window and the edge drawer. The label is sized so it fits its tile.
- About shows V1.65.1 and the newest changelog entries.

## What's new in V1.65.0

- **Edge door.** The five header buttons are gone. A green door on the right edge of the header opens one drawer: **Menu** and **Settings** side by side at the top, then **Snooze, Group, Browser, Terminal, GitHub and Downloads**, each with its own colour. Tap the door or drag it: the drawer follows your finger. Drag it right, tap outside, or press Back to close.
- **One-row header.** Header = logo + provider pill. The tagline moved into the drawer. The left-edge chevron is hidden because the door takes its place.
- **Snooze shows on the door.** A purple dot appears on the door and the Snooze tile glows while Snooze is on.
- **Nothing was rewritten.** The tiles click your real buttons and call the real openers, so every existing handler keeps working. New files: `horizon_door.css` and `horizon_door.js`. `index.html` only gained two include lines.
- **Old header fallback.** Long-press the Horizon logo chip for about a second to switch between the new header and the old one (the app reloads).

## What's new in V1.64.2

- **Group Retry works.** In a group, if some AIs fail and others answer, the Retry bar now names the AIs that failed (`Groq + Cohere`) and redoes only those, for the message they failed on. Before, Retry ran "regenerate the last reply", which in a group needs a user message right before it, so it quietly did nothing (or would have redone the wrong AI). If the app was reopened and nothing is remembered, Retry finds the group members that never answered the last message.
- **No more dead Retry.** Retry used to return silently while Horizon was "busy". It now says "Horizon is still working. Tap Stop first, then Retry." And the end of every turn no longer waits on the Android side for more than 3 seconds, so a hung bridge call can no longer leave Horizon stuck as busy.
- A stale Retry bar no longer sits above the next AI's reply during a group round.
- Known gap, not changed: in a group, the small Regenerate button only shows on the first AI reply after your message.

## What's new in V1.64.1

- **Group chat looks like a group.** In a group chat the pill at the top of the chat (on the welcome card) now reads `GROUP · Gemini + Groq + ... ready` with a group icon, the card title becomes "Group chat" with group instructions, and the message box and the note under it name the group instead of one AI. The bottom-left badge already followed the group (V1.64.0). Leaving the group, or ungrouping, puts everything back to the normal single-AI wording at once.

## What's new in V1.64.0

- **Lock-screen and notification controls for read-aloud.** Reading aloud now has a MediaSession, so the lock screen and Bluetooth/headset buttons get Play, Pause and Next. The notification gains a **Next** button between Pause and Stop, and shows "N more waiting". Next drops the reply being read and moves to the next queued one. Stop clears the whole queue. The notification no longer disappears for a moment between two queued replies.
- **Voice pill.** Tap while it speaks = pause or resume (amber "Paused" state). Long-press = voice settings. Idle tap still opens settings.
- **Group chat token trim.** In a group the newest 4 messages go to every AI in full; older ones lose code blocks and artifacts and are cut short, and the history stops at a size budget (about 3.5k tokens). No extra summary call.
- **Group voices.** In a group each AI reads in its own voice: the next voice along on the engine already picked in Settings (the Android voice steps through voices of the same language). Works for auto read and for the speaker button.
- **Group badge.** In a group chat the bottom-left badge shows GROUP, the member names, and whichever AI is answering with its timer.
- **Fold all / Unfold all.** A button in the action row under the newest reply, shown once two or more replies are long enough to fold.
- Kotlin changes: `HorizonSpeakService` (MediaSession, Next action, queued text), `HorizonReplyReceiver` (NEXT_SPEECH), `HorizonAIPlugin.speechHold` (queued). Not compiled or tested on a phone yet; the CI build is the first compile.

## What's new in V1.63.9

- **Now-reading highlight.** With auto read aloud on, the reply being read gets a green edge and a green "Reading aloud" tag. Replies waiting their turn show **Next · 1**, **Next · 2**, **Next · 3** in the order they will play, so a group chat's order is visible at a glance.
- **Auto-read button states.** It pulses green while speaking (drawn from JavaScript, so Android's "remove animations" does not stop it) and turns amber while paused.
- Not tested on a phone yet.

## What's new in V1.63.8

- **Edge voice 403, now readable.** When Microsoft refuses the Edge voice, the error now includes the server time and the start of its reply (for example `HTTP 403, server time Sun, 08 Nov 2026 ..., <reply>`), so the real cause shows in the red text under Voice.
- **Fix without a rebuild.** If Microsoft rotates the Edge token or version, set `horizon_edge_token` and `horizon_edge_ver` in the app's local storage and the native voice uses them instead of the built-in values. The built-in ones are unchanged.
- Not a fix for the 403 itself: it cannot be tested without a network, so the cause is still unknown. Kotlin/Java not compiled or tested on a phone yet.

## What's new in V1.63.7

- **Pause and Resume in the notification.** While Horizon reads aloud, the notification shows **Pause** (turns into **Resume**) and **Stop**. Cloud voices (Gemini, Edge, Pollinations, TTS.ai) freeze and carry on from the exact spot. The Android voice cannot freeze, so Resume says the sentence it was on again. `HorizonTTS.pause()`, `.resume()` and `.togglePause()` are available too.
- **Faster start.** A cloud voice that fails (for example the Edge 403) is skipped for 5 minutes in replies, so the voice that works starts straight away instead of waiting for the broken one first. The Voice **Test** button still tries the voice you picked every time. For the quickest start of all, pick the **Android voice**: it needs no download, cloud voices must fetch the audio first.
- Kotlin changes: `HorizonSpeakService` (Pause/Resume action), `HorizonReplyReceiver` (PAUSE_SPEECH), `HorizonAIPlugin.speechHold` (paused flag). Not compiled or tested on a phone yet; the CI build is the first compile.

## What's new in V1.63.6

- **Group chat box name.** In a group chat the message box now reads "Message the group (Gemini, Groq, Cohere)..." and updates the moment you add or remove an AI. Before, it kept showing the last single AI you had picked (for example OpenRouter) even after it was taken out of the group.
- Not tested on a phone yet.

## What's new in V1.63.5

- **Auto read aloud.** New speaker button beside the mic. Turn it on (it goes green) and every new AI reply is read aloud on its own, one after the other. In a group chat, three replies play in the order they arrived; a small number on the button shows how many are waiting. Turn it off and the queue clears and speech stops. It uses the voice from Settings > Voice, with the usual fallback to the Android voice. Old messages are never read when you open a chat. The setting is remembered.
- Not tested on a phone yet.

## What's new in V1.63.4

- **Fold arrow.** A tiny green arrow now shows at the right end of the name/time line on any long AI reply. Tap it to fold the reply down to a few lines, tap again to open it. Nothing is saved or sent.
- **OpenRouter free by default.** New `openrouter/free` model (free models only) is now the default and sits first in the list. If the picked model cannot be served for you (`No endpoints found...`, HTTP 402 or 404), Horizon switches once to `openrouter/free` and carries on. `openrouter/auto` can pick paid models, so it needs credits.
- **Settings AI waits.** Asking the Settings AI while the chat is answering now waits up to 25 seconds instead of saying "Wait a moment".
- **Music note.** The music block tells every AI that only the NOW PLAYING line is current, so Gemini stops repeating an old song name from earlier replies.
- Not changed: the Edge voice 403 (Microsoft side, cannot be tested without network). Use the Gemini voice in Settings > Voice meanwhile.
- Not tested on a phone yet.

## What's new in V1.63.3

- **Gemini listens in the chat.** When Gemini is the AI answering (alone or in a group chat) he is told he can hear and uses the existing `[[music.listen: question]]` tool himself, no switch needed. The other AIs still need *Let the chat AI ask him to listen*; in a group they are told to hand sound questions to `@gemini`.
- **Listen fix.** The listening step only uses a real Gemini model that takes audio. If the picked model cannot (Gemma, image, TTS, live), or Google answers 400/404, it retries once on `gemini-2.5-flash`. Same path for the player ear sheet.
- **Leave group.** New red **Leave group** button in the group bar. Tap it, pick which AI carries on, and the chat becomes a normal one-AI conversation. History stays; if several AIs had spoken, their old replies keep the `[Name said]` tag so nobody mistakes them for their own words. The sheet's Ungroup uses the same logic.
- **Group model pick.** Picking a model in the AI sheet while in a group chat also sets that AI's model in the group (before, the group kept its saved one).
- Not tested on a phone yet.

## What's new in V1.63.0

- Replies pop up as a banner over the screen with a sound (new channel, `/notif` to test).
- Keyboard lift/collapse freeze fixed: native start/end signal, one browser bounds update, stuck-proof guard.
- Kotlin coroutines with structured concurrency for background AI jobs and media saves.
- LeakCanary built in (`/canary`).

## Earlier: V1.62.0

- **Edge voice (keyless).** Settings > Voice > *Natural: Kokoro*. No key, no account, no limit. 18 neural voices incl. South African, six tone presets, native Android WebSocket (needs OkHttp, added by `apply-android.sh`).

## What's new in V1.61.0

- **Debate.** In a group chat, tap **Debate** in the members bar and each AI critiques the others' replies. It reuses the `[Name said]` history, so it is one more round.
- **Free only.** The OpenRouter model picker has a **Free only** switch (remembered) that keeps just the `:free` models.
- **What's this song?** New button on the music notification: Gemini listens to a clip and answers in a notification, without opening the app (red eye on, Gemini key set).
- **Save to Vault.** Gemini's song answers get a **Save to Vault** button that files them as an encrypted note.

## What's new in V1.60.1

- **Tools grid dots.** The green tile highlight and tinted icons are gone. Each tile has a dot on the right: green = on, red = off or needs attention.

## What's new in V1.60.0

- **Group chat.** New Group tile (top right): pick 2+ AIs with a model each. Every message is answered by each one in turn; they see each other's replies as `[Name said]: ...`. Members show as chips above the message box. Stored on the chat (`chat.group`), so it survives restarts.
- **@mentions.** Typing `@` pops up the AI names (like the slash menu). `@groq hi` sends that one message only to Groq, in any chat (a normal chat is marked multi-AI from then on). `@all` wakes the whole group. Stop ends the rest of the round; Regenerate and Retry use the AI that wrote the reply.
- Each AI uses its own group model for its turn only; your normal model picks are not changed. Not tested on a phone yet.

## What's new in V1.59.0

- **OpenRouter.** New provider: one key, hundreds of models, free ones end in `:free`. Default model `openrouter/auto`. Works with backup keys, auto-switch, usage stats, the browser AI and slash model picks. Native background calls now allow `openrouter.ai` (rebuild the Android app to pick that up).
- **Gemini ears.** The ear button (now-playing bar, mini player, full player) opens an ask sheet. Gemini hears a 30 s / 1 / 2 / 5 min clip cut on the phone (mono 16 kHz WAV, about 1 MB per 30 s) from where the song is now or from the start. Follow-ups reuse what he heard; Listen again sends a fresh clip. Tracks over 20 minutes are refused.
- **Chat tool.** `[[music.listen: question]]` lets the chat AI ask Gemini to listen. Off until you switch on Let the chat AI ask him to listen in the sheet. The red eye hides the music from every AI.
- Logic adapted from Raindrops' Gemini ears (clip cut + inlineData audio/wav). Tested in a desktop browser with mocked Gemini and OpenRouter; not tested on a phone yet.

## What's new in V1.58.5

- **Tools grid.** The + menu shows every tool at once as two-column tiles with no scrolling: a Generators row (Avatars, Memes, Visuals) on top, then Think and look, Fetch, Make and Remember. Green tile = on, plain tile = off, red dot = needs attention. Tap a tile to switch it (the existing switch code is untouched); hold a tile to read its description and status in the strip at the bottom. The strip also shows the missing-item chips (keys and so on) and the Make PDF button while PDF is on.
- **List view.** A chip in the menu header switches back to the old list. The choice is remembered on the phone (`horizon_toolgrid`).
- The layout is CSS scoped to `#toolMenu.hzg` plus `horizon_toolgrid.js`; no tool logic moved. Not tested on a phone yet.

## What's new in V1.58.4

- **Place tag removed from chat bubbles.** The suburb-and-city tag beside the time on your messages is gone, together with its "Show my place" switch under Personalisation. Horizon no longer looks up your location for it at start-up, no longer saves a place with each new message, and deletes the cached place name from the phone. Your "Operator" name tag, the DASH weather and the Location permission are unchanged.
- Messages sent in earlier versions may still carry a saved place in your stored chats. It is not shown or used anywhere now.

## What's new in V1.58.3

- **Snooze fix.** Tapping Snooze no longer opens Android Settings. The cause was Location: Android does not let an app switch it off, so its Off button opens the Settings page. Snooze now pauses Location inside Horizon (`HzGeo.pause`) and Wake turns it back on.
- **Less redrawing.** The pulsing glow on the Settings AI button and the Browser button animated a large blurred `box-shadow`, which forces a repaint on every frame (90 times a second at 90 Hz). The glow is now a pseudo-element whose opacity fades, so the shadow is drawn once. The inner glow of the Browser button is gone; the rest looks the same. These animations also pause while the keyboard is open or sliding.
- **Lag detector V2.** `/lag` adds Chrome's long-animation-frame data (which file and function made each slow frame, scripts vs style+layout), a worst-frames list, and five test switches. Changing a switch starts a fresh measurement and the report names the switches that were on.
- Not tested on a phone yet. The glow fix is the most likely cause of the per-key drawing cost but is not proven; the switches are there to prove or disprove it.

## What's new in V1.58.2

- **Smoother typing.** The message box only re-measures when the text grows or shrinks (before, every key forced a full page re-layout). The link-card check and the draft save wait for a longer pause; the draft is still saved when you leave the box or the app. The music wave and the background sweep rest while you type or the keyboard moves.
- **Autocorrect.** The message box no longer says `autocomplete="off"` and now asks for autocorrect and spellcheck, so a third-party keyboard can show suggestions. Not confirmed on the phone: it is the most likely reason they were missing.
- **Keyboard.** The resize mode is pinned in the manifest and in MainActivity. While the keyboard slides, the dashboard re-fit and message animations pause, then re-fit once.
- **Lag detector.** Type `/lag` in the message box: measured refresh rate, slow keys split into wait / run / paint, long tasks, and a Copy report button. Kept in memory only.
- **90 Hz.** MainActivity asks Android for a 90 Hz display mode. Android still decides: Battery saver or a fixed 60 Hz setting wins.
- Not tested on a phone yet. MainActivity.java was not compiled here (no Android SDK); the CI build compiles it.

## What's new in V1.58.1

- **Voice spacing.** The TTS.ai and Pollinations key boxes are full-width fields with space around them, with larger Save key / Remove key buttons; speed and pitch sliders have more room. Checked at 412 px wide in a browser, not yet on the phone.

## What's new in V1.58.0

- **Settings AI.** A pulsing AI button beside Settings opens an assistant limited to Horizon's settings and features: where things are, fixes, ideas. It sees setting names, which provider is active and whether keys exist (never the keys), and the open page's text (never Vault or Security). It cannot change settings. Follows the cyan, green and purple themes.
- **Terminal AI docked.** The floating box is replaced by a panel inside the terminal. Eye = show or hide the terminal output from the AI (on by default, so the last ~40 lines go to your provider with each message). Arrow = minimize. No drag, pin or resize. (Implemented and syntax-checked; not yet run on a device.)

## What's new in V1.57.0

- **Model descriptions.** Each model in the AI picker has a plain one-line description under its name, with no category labels.
- **Markdown blocks.** Markdown the AI writes arrives in one block with Copy, Raw | Converted and Save (.md or .html). Fences nest correctly and ~~~ works. (Implemented and syntax-checked; not yet run on a device.)

## What's new in V1.56.1

- **Groq vision.** Groq models can now see pictures, PDF pages and the Lens screenshot of the app (Qwen3.8 27B, Muse Spark, Llama 4). Max 3 pictures per request.

## What's new in V1.56.0

- **New header and Snooze screen.** Robot button removed. A provider pill sits in the middle and opens the AI sheet, which has a Set API key tab. Snooze is a full-screen moon, robot with a 💤, provider logos and the tagline. Tap anywhere to wake.

## What's new in V1.55.0

- **Avatars, Memes, Visuals.** The three generators are renamed; Visuals gains six more built-in sketches (10 total).

## What's new in V1.54.1

- **Generators.** The Create group in the Tools menu is renamed Generators.

## What's new in V1.54.0

- **Descriptions in the grouped Tools menu.** Full description under each tool; DiceBear, Meme and p5.js are rows with a description (`horizon_creator.js`, `horizon_tidy.css`).

## What's new in V1.53.1

- **Create group.** DiceBear, Meme and p5.js sit under a Create heading at the top of the grouped Tools menu (`horizon_creator.js`, `horizon_tidy.css`).

## What's new in V1.53.0

- **Grouped Tools menu.** Four groups: Think and look, Fetch, Make, Remember (`index.html`, `horizon_tidy.css`).

## What's new in V1.52.0

- **VPN chip removed from chat bubbles.** The place name stays; the VPN badge no longer renders (`horizon_operator.js`, `horizon_operator.css`).

## What's new in V1.51.0

- **Place stamped when you send.** Each message saves the place (and VPN flag) it was sent from, in the chat itself (`place`, `vpn` on the message, set in `pushMessage` through `HzOperator.stamp()`). The tag reads that saved place, so old messages no longer jump to wherever you are now. Messages sent before V1.51.0 show no place tag. A just-sent message with no known place yet shows the live state (Allow location, Location off, Locating) and tapping it retries.
- *Tested in headless Chromium with a stubbed Android plugin: stamped, old and VPN messages render correctly. Not tested on a device.*

## What's new in V1.50.0

- **Place on your messages fixed.** The red pin and place name never showed because the app leaned on the WebView's own location prompt, which Android did not always raise. Horizon now asks Android directly (new native methods `locationStatus`, `requestLocation`, `getLocation` in HorizonPermsPlugin) and the new `horizon_geo.js` (`window.HzGeo`) shares one request between the message tag and the DASH, so there is never a double prompt. In a plain browser it falls back to the normal browser location.
- **The tag explains itself.** *Allow location*, *Location off* or *No location* instead of one vague text. Tap it: it asks again, or opens Android's app settings when location is blocked.
- **Location switch** under Settings, Permissions (red or green like the others). The DASH "Use my real location" button opens Android settings when blocked.
- **Square starter tiles.** The 4 tiles on the chat screen (Build a script, Search the web, Make a PDF, Plan a build) are squares: icon on top, title and text at the bottom. Phones under 340 px wide keep one wide tile per row; Snooze keeps its compact tiles.
- *Not tested on a device: the Java was not compiled here (no Android toolchain), so the CI build is the first compile. JavaScript passed syntax checks.*

## What's new in V1.49.0

- **Create strip in the + menu.** Three buttons under the Tools title, each with its own SVG icon: **DiceBear**, **Memegen** and **p5.js**. Each opens a full-screen sheet (Back or Esc closes it). Results can be **attached to the next message**, copied or saved to Documents/Horizon. No keys anywhere. New files: horizon_creator.js/css; `window.HorizonCreator` is started from index.html next to HorizonAttach.
- **DiceBear** (api.dicebear.com, `9.x`, falls back to `7.x`): 30 styles, any seed, Random, 6 variations to tap, background colour, corner radius, flip. Attach sends a 512 px PNG; Copy SVG, Save SVG, Save PNG and Copy link are there too.
- **Memegen** (api.memegen.link): live template list (cached, with a built-in fallback), one input per text line, JPG/PNG/WebP/GIF, width, Random example, and a **custom** template with your own background image link. Special characters are escaped the Memegen way (`?` `&` `%` `#` `/` `"` and line breaks).
- **p5.js** (1.9.4): four samples, editable code, Run and Stop, touch works. The sketch runs in a sealed iframe (`sandbox="allow-scripts"`) so it cannot read chats, keys or the Vault. Attach picture, Attach code (so the AI can fix it), Save PNG, Save code, Copy code. p5.js is fetched from jsDelivr (cdnjs as backup) on first run and kept in Cache Storage after that, so the first run needs internet.
- *Not tested on a device. Checked in headless Chromium with the three services mocked; the live DiceBear and Memegen endpoints and the p5.js download were not reachable from the build machine. The Memegen template ids in the built-in fallback list (other than buzz, ds, oprah, iw, rollsafe, pigeon, ugandanknuck, both, custom) are from memory; the live list replaces them.*

## What's new in V1.48.0

- **TTS.ai replaces FreeTTS.ai** (Settings, Voice, Natural: TTS.ai). Kokoro voices through `api.tts.ai/v1/tts/`: the text is queued, then Horizon polls `/v1/speech/results/` for the audio link. No key needed on their free tier (500 characters per request, about 5,000 a day); an optional `sk-tts-` key from tts.ai/account raises limits. The ten voices listed are the standard Kokoro set; tts.ai's own live voice list was not checked. *Not tested against the live service here.*

## What's new in V1.47.0

- **Piper removed.** The sherpa-onnx offline engine, its download script and the Voice settings panel are gone. No native voice libraries ship in the APK any more. Old Piper downloads in app storage are deleted on the next launch. A saved Piper choice becomes the Android voice.
- **Android speech engine list** (Settings, Voice, Android voice). Lists every speech engine installed on the phone and lets you choose one (Google, Samsung, a Kokoro engine app). The plugin starts a third-party engine only when it speaks and releases it after about 45 seconds idle. *Not tested on a device: the Java was not compiled here (no Android toolchain), so the CI build is the first compile.*
- **Test plays the selected voice only.** It no longer falls back to another voice silently; a missing key or failure is shown. Normal replies keep the fallback chain.
- **Thinking toggle text** in the + menu wraps instead of ending in dots (all tool rows).
- **Voice notes:** Groq gets the original recording; the WAV re-encode only happens for Gemini or if Groq cannot read the container.
- **Idle load:** the wave animation and the background tidy-up skip work while nothing plays or the app is hidden.

## What's new in V1.46.0

- **Terminal AI box.** AI button in the Terminal bar opens a half-screen floating box. Commands get COPY and → $ (prompt) buttons; the AI never runs anything. PINNED / MOVE sign locks or drags the box. OUT attaches the last terminal output. New files: horizon_termai.js/css; bridge `window.HorizonAskAI` in index.html.
- **HTML Preview.** Preview is the big cyan button, apart from Save, with a blob-page fallback if the frame does not load.

## What's new in V1.45.2

- **Bigger text everywhere.** Every font size from 8 to 22 px in the app's styles was raised about 12% (rounded to half pixels). Skipped on purpose: the 5 header buttons (sized by hand in V1.45.1) and the Terminal (its grid is character-based). *Tested:* syntax checks. *Not tested:* on a phone. Some tight rows (chips, tiles, pills) may now clip or wrap, so check the busy panels and tell me which ones.

## What's new in V1.45.1

- **Bigger header buttons.** The 5 buttons are now 41 x 56 px (was 36 x 44) with 20 px icons and 9 px white labels; on narrow phones the HORIZON title shrinks slightly so everything still fits. *Tested:* syntax only. *Not tested:* on a phone, and 360 px wide screens are the ones to check.

## What's new in V1.45.0

- **Three dark themes only:** Dark cyan, Dark green, Dark purple. Light and the old Dark are removed; an old saved Light, Dark or Neon choice becomes Dark cyan. Settings > Theme and the colour dots under the Settings title switch between them. Under the hood the dark base stays `data-theme="neon"` and `data-accent` carries the colour, so older styles keep working. All hard-coded cyan in the CSS now follows `--accent-cyan` / `--accent-rgb` (30 hex colours and 79 rgba colours swapped).
- **White text.** Main text is pure white, secondary text is a light grey-white (`#d3dce2`), Settings descriptions and hints are `#e6edf1`, placeholders are no longer dim, and the few hard-coded dim greys (terminal, GitHub terminal, Bojack) were lightened. *Not changed:* status colours (red errors, green success) and provider brand colours.
- **Your message line:** the place tag on the right edge always shows (suburb, city from the phone GPS; "No location" or "Locating..." when there is none) in white, and a green **VPN** chip appears next to it when Android reports a VPN. *Not tested:* on a phone. The place lookup needs the Location permission and internet.
- *Tested:* syntax checks, plus the theme and VPN logic in a stubbed run. *Not tested:* how every screen looks on a phone; some old panels may still carry colours I did not catch.

## What's new in V1.44.0

- **Kokoro removed.** The Kokoro offline voice is gone from the Voice list and the native plugin (Piper was removed later, in V1.47.0). A Kokoro download from an older version is deleted on the next Voice settings visit to free about 330 MB. *Tested:* syntax checks only. *Not tested:* the Kotlin change has not been compiled.
- **FreeTTS.ai voice** (Settings, Voice, Natural: FreeTTS.ai). You paste the endpoint and your key; the voice name is optional. It accepts raw audio, base64 audio inside JSON, or a link to the audio inside JSON. Any failure falls back to the Android voice and says why. Pollinations voice is still there, untouched. *Planned:* lock the endpoint and request shape to FreeTTS.ai's real docs once the key exists. *Not tested:* against FreeTTS.ai (no key, no network here).
- **No more white flash when leaving the app.** The window and WebView behind the page were always white. They now take the theme colour (Light, Dark, Cyan), saved on the device and repainted on start, pause and resume (HorizonPerms.setBackdrop). *Not tested:* on a phone. The Java change has not been compiled.

## What's new in V1.43.4

- **Widget date pill is black** (white text, thin light edge so it shows on dark themes). *Not tested:* on a phone.

## What's new in V1.43.3

- **Weather widget expands on tap.** The arrow now closes the open Menu tabs above it to make room, instead of staying folded until you closed them by hand. *Tested:* syntax only. *Not tested:* on a phone.

## What's new in V1.43.2

- **Your bubble is dark grey again** in Light, Dark and Cyan.
- **Provider pill animates while a reply runs.** The pill used to be rebuilt every 250 ms, which restarted its sliding bar and pulsing dot each time. Now only the clock text updates. *Tested:* syntax and logic with a stubbed DOM. *Not tested:* on a phone.

## What's new in V1.43.1

- **Voice pill animates again.** The wave and pulse are now driven from JavaScript (like the now-playing waveform), so Android's reduce-motion setting cannot freeze them. *Tested:* logic with a stubbed DOM. *Not tested:* on a phone.

## What's new in V1.43.0

- **App lock** (Settings, SECURITY, App lock): a 4 to 6 digit PIN (salted PBKDF2 hash, stored only on the device) plus the Android fingerprint prompt where the phone has one. Locks on start and after Right away, 1 or 5 minutes in the background. Back cannot get past the lock screen. Five wrong PINs start a growing wait that survives a restart. Optional: hide Horizon in recent apps (this also blocks screenshots).
- **Live network.** Android now pushes Wi-Fi, mobile data and VPN changes to DASH the moment they happen, and DASH has a new Link row (Wi-Fi, Mobile data, offline, metered, via VPN).
- *Honest limit:* the lock keeps people out of Horizon on a phone you left unlocked. It does not encrypt the API keys stored on the device.
- *Tested:* syntax checks only. *Not tested:* on a phone. The new Kotlin (HorizonLockPlugin.kt) and the Stats plugin changes have not been compiled.

## What's new in V1.41.0

- **Bottom row under the message box:** the usage badge (provider, model, tokens, time) sits on the right, a new **Voice** pill beside it. Voice is a flat line when idle and a pulsing waveform while a reply is read aloud; tap it to stop.
- **Replies start like a username:** provider logo, name and model on top of the thought process. The repeated model and token line under each reply, and the repeated status line under the box, are gone (full token count shows on press-and-hold of the header).
- **Pill action row:** Copy and Regenerate (plus Continue when a reply is cut off) on the left, read-aloud on the right.
- **Thinking switch** (brain, top of the + menu): real thinking budget on Gemini 2.5 and 3, high reasoning effort on Groq gpt-oss, plan-and-check prompt on every other model.
- *Tested:* syntax checks and a desktop browser render with a mocked Gemini reply. *Not tested:* on a phone, and not against the live Gemini API.

## What's new in V1.40.0

- **Settings fits one screen.** No X, no second logo; the title and Theme icons share the top row, rows are compact, nothing scrolls on the home view. Back still works.
- **Browser follows the theme** (white in Light, black in Dark and Cyan).
- **AI sees the whole app** with Screen on (browser, terminal, picker, badge, now playing, downloads, DASH, Vault counts). It reads Vault notes, never AI keys, scraping keys, SSH keys or tokens.
- **Toasts** when the AI saves a Vault note or a memory, and a red toast when it could not (tap the green one to open the Vault).
- **Plus menu checks** with tap-to-fix chips, plus new Memory, Lens and Browser eye switches.
- **Chat tidy-up:** spacing, pill chips, equal buttons.
- *Tested:* syntax checks and a desktop browser render. *Not tested:* on a phone.

## What's new in V1.35.1

- **SECURITY is its own row in Settings**, directly under HORIZON VAULT, with a red title and a red edge. The SECURITY AND PRIVACY block (the do-not-train switch and the live "what the AI can reach" list) moved there from ABOUT & UPDATES, so it is no longer shown twice.
- *Not built yet:* the 4-digit PIN and fingerprint lock.
- *Tested:* syntax checks and a browser render of the moved page. *Not tested:* on a phone.

## What's new in V1.35.0

- **The chat AI can download more than YouTube music.** It was wired to YouTube only (`yt.search`, `yt.download`). Now, with the YouTube button beside + switched on for the chat, it also has:
  - `[[get.search: audius | query]]`, `images` (Wikimedia Commons, with the licence shown), `archive` (Internet Archive films and shows), `archive-audio`.
  - `[[get.url: REF | hint]]`: `audius:ID`, `archive:ID` (audio, video or torrent), or a direct https link (music, video, image, a `.torrent`, or any file).
  - `[[get.magnet: magnet:?xt=...]]`: handed to a torrent app after you approve.
- Links on unknown sites and every magnet link pop up a confirm first. Archive, Audius and Wikimedia links do not. File access must be on in Permissions.
- Everything the AI saves shows up in the Downloads page like the rest. The AI is told to say "queued", never "downloaded", and to refuse piracy requests.

**Status, stated plainly**
- *Tested:* the new tools ran in a desktop browser against mocked servers (search, save, archive file pick, .torrent, confirm and decline, YouTube and GitHub links refused). *Not tested:* real servers, or on a phone.
- *Limits:* Horizon has no torrent engine, so magnets need a torrent app installed and progress is not visible. Search covers Audius, the Internet Archive and Wikimedia Commons only; there is no general "any music site" search.
- *Not in this build:* yt-dlp (still planned).

## What's new in V1.34.0

- **APPS DOCK: six tiles.** GitHub, YouTube (icon now red), Music, Lens, **Downloads** (new in the dock; it was only in the HORIZON APPS menu) and **Terminal**, in two rows of three. Terminal is also in the HORIZON APPS menu.
- **TERMINAL.** White tile with a black `$_`, cyan `<` in the title, a glowing red dot. Opens full screen. **Minimize** drops a slim strip above the chat box (tap it to come back); **Exit** ends the session. Android Back minimizes.
- Neon-green three-sentence typewriter welcome (tap the screen to skip). Cyan prompt line.
- **Keys.** CTRL, ESC, TAB, HOME, END, PGUP, PGDN, arrows, DEL, and a MORE row of control letters: `^A ^B ^E ^F ^K ^L ^N ^P ^R ^U ^W ^Y ^C ^D`. CTRL then a soft-keyboard letter works too, and a hardware keyboard's Ctrl does. TAB completes file names; Up/Down is history; `cd` stays between commands.
- New files: `horizon_terminal.js`, `horizon_terminal.css`. No native code changed (it uses the V1.33.0 `HorizonShellPlugin.kt`).

**Status, stated plainly**
- *Tested:* the terminal logic ran in a desktop browser against a mocked shell (welcome, commands, cd, errors, history, CTRL keys, TAB, minimize, strip, exit). `node --check` passes on every JS file.
- *Not tested:* on a phone, with the real shell, or the dock layout inside the real app.
- *Limits:* it is Android's built-in shell (toybox) as Horizon's own app user: no root, no Python, no git or curl, no stdin, 30 second limit per command. It is not real Termux. Typing `yt-dlp` says it is planned.
- *Planned, not built:* yt-dlp (embedded library or Termux bridge), icons dropping below messages while chatting, HTML preview and save for AI replies.

## What's new in V1.33.0

- **HORIZON BROWSER.** New globe-style button in the header (neon-green network icon) opens a full browser in the Horizon neon theme. Real Android WebView tabs through the new native `HorizonBrowserPlugin.java` (the "websheet"), so sites that refuse iframes load normally.
- **Icon.** Black app tile with a neon-green network mark that pulses and vibrates.
- **DuckDuckGo toggles.** SEARCH tab: DuckDuckGo on/off, safe search, dark results, lite (no-JS) results, !bangs, live suggestions, region. Off = pick Brave, Startpage, Google or Bing.
- **Panels and tabs** in the Horizon style: SEARCH, PRIVACY (trackers, HTTPS, DNT/GPC, third-party cookies, pop-ups, JavaScript, desktop site, clear data), AI & EYE, TABS, BOOKMARKS, HISTORY, DISPLAY.
- **The Eye.** Open eye = the AI may read the page when you ask. Slashed red eye = blocked. Auto-closes on login and payment pages. Optional screenshot.
- **AI overlay.** Ask about the page in full screen; replies type out; the page above stays scrollable. The up-arrow minimises it into a slim black widget above the chat box with a cyan HORIZON / STRATEGY OVER IMPULSE strip that scrolls left to right with the black network icon.
- New files: `horizon_browser.js`, `horizon_browser.css`, `HorizonBrowserPlugin.java`.

**Status, stated plainly**
- *Not run on a phone:* the Java was not compiled here; the first CI build is its first compile. UI was tested in a desktop browser in preview mode (iframe), where many sites refuse framing.
- *Eye screenshot* uses WebView.draw and can come back blank on some devices; text reading is the main path.

## What's new in V1.32.0

- **DASH widget** at the bottom of the left menu: live time, the date, weather with colour (animated sun, clouds, rain, snow, storm, night moon, fog) and your location. The arrow collapses it to a slim half-size widget (weather, time, date, place) or expands it.
- **RAM, STORAGE, BATTERY, CPU** bars. On the Android app they read the whole phone through the new native `HorizonStatsPlugin.java`. Android 8+ hides total CPU from apps, so CPU shows Horizon's own share (labelled "app") when the total is not readable. In a plain browser they fall back to what the browser exposes.
- **IP and VPN.** Shows your current IP (marked private, so Screen and Lens never read it) and VPN ON/OFF. On the app the VPN flag comes from Android itself. In a browser it is a best guess (time zone vs IP, VPN or hosting network names) and is labelled "likely".
- **Real area.** With a VPN on, the widget shows where the IP appears ("Seen as") and your real area. Real area uses GPS after you tap **Use my real location** once (Android asks), otherwise your phone time zone (labelled). The weather follows the real area, not the VPN exit.
- **Calendar.** Tap the date. Month view with dots on days that have notes. Add a note to any day, optional time, Remind me switch. A due reminder is posted in the chat by Horizon, and a phone notification is scheduled for when the app is closed (needs the Notifications permission; Android may deliver it a few minutes late). Your next two weeks of notes are given to the AI, so you can ask "what do I have this week?". Notes live in `horizon_dash_notes` and are included in EXPORT and IMPORT.
- **Waveform.** A small animated waveform sits next to the song title in the now-playing bar in the chat while music plays, and rests flat when paused.
- New permissions in the manifest: `ACCESS_NETWORK_STATE`, `ACCESS_COARSE_LOCATION`, `ACCESS_FINE_LOCATION`. New files: `horizon_dash.js`, `horizon_dash.css`, `HorizonStatsPlugin.java`.

**Status, stated plainly**
- *Not run on a phone:* the Kotlin/Java side was not compiled here, so the first CI build is its first compile. Weather, IP and place lookups were not contacted from here.
- *Privacy:* the IP and coordinates stay in memory only. Weather uses open-meteo.com with coordinates rounded to about 1 km. The place name uses bigdatacloud.net and only runs after you allow GPS. The IP lookup uses ipwho.is (ipapi.co as backup).

## What's new in V1.31.0

- **Search all chats.** A search box sits in the left menu above Recent chats. It looks inside every message and chat title. Type several words and a chat must contain all of them, in any order. Each result shows a snippet with your words highlighted and how many messages match. Tap a result and the chat opens scrolled to that message, which flashes cyan.
- **Pin chats.** Tap the pin on a chat row to keep it at the top (tap again to unpin). Pinned chats are never dropped when the list is trimmed to 60 chats.
- Search is case-insensitive and safe with symbols like `[brackets]` or `C++`. File names of attachments are searchable too.

## What's new in V1.30.0

- **Edit a sent message.** Tap the pencil under any message you sent, change the words, tap Save and resend. Horizon drops the replies after that message and answers the edited one. The message shows "edited". Editing the first message renames the chat. Voice notes and picture-mode messages have no pencil.
- **Regenerate.** The round arrow under the newest reply asks again. It uses the AI and model you have selected right now, so switch first to get a second opinion. If the new try is stopped or fails, your old reply comes back.
- **Continue.** When an AI stops because it hit its length limit (Gemini MAX_TOKENS, or "length" from Groq, Cohere and Pollinations), a Continue button appears. It asks the AI to repeat its last few words and carry on, then joins the two parts into the same reply without doubled words.
- The buttons hide while Horizon is working and return when it finishes. PDF replies and long documents keep their own automatic continue.

## What's new in V1.29.0

- **Attach code and text files.** The paperclip now takes `.sh`, `.py`, `.js`, `.json`, `.txt`, `.log`, `.csv`, `.yml` and `.yaml` as well as images, PDF, DOCX, MD and HTML. Drop a script in and ask for fixes.
- Each file is a small coloured card labelled with its type (SH, PY, JSON...). Tap it to peek at the text. Long files are trimmed to 30,000 characters and the card says "trimmed".
- A renamed binary file is refused with a plain message, and any other files in the same pick still attach.
- The file picker lists every file type so Android does not grey out `.sh`, `.log` or `.yml`. Unsupported types are still refused after you pick them.

## What's new in V1.28.0

- **New robot.** The header provider button now shows the black AI robot (antenna, visor eyes, AI badge). It flips to a light robot in the Dark and Neon themes so it never disappears.
- **Paperclip moved into the message box.** Attach is gone from the + menu. The paperclip now sits inside the pill, left of where you type.
- **Voice notes.** A microphone sits on the right of the pill. Tap it, talk, tap stop. The note appears as a small card (tap it to play it back), and Send delivers it. Tap the X to cancel while recording, or tap Send while recording to stop and send in one go. Limit: 3 minutes.
- Voice notes are turned into text with Groq Whisper (needs a Groq key) and fall back to Gemini (needs a Gemini key). The AI receives the transcript, so every provider can answer a voice note. If transcription fails the card says so, and tapping it retries.
- The first tap asks Android for the microphone. PERMISSIONS keeps the master switch.

## What's new in V1.27.0

- **Slash commands.** Type `/` in the message box and a menu opens above it. Tap a row, or finish typing and tap send.
- `/model` lists your ready providers (tap to switch). `/model qwen` or `/m gem pro` searches every model across your providers. Providers without a key show NO KEY and open API PROVIDERS PLUS KEYS.
- `/recon <target>` turns Web on for this chat and sends a public-sources recon sweep. It needs a scraper key under WEB SCRAPING.
- `/music <words>` opens the Music Player and fills its search with your words.
- `/web`, `/yt`, `/gh`, `/eye` (the AI sees what is playing), `/pdf`, `/img`, `/vault` and `/screen` flip the same switches as the + menu, with ON/OFF shown.
- Safe by design: the send button only runs a command when the box holds exactly that command. Text like `/model is broken` still sends as a normal message.

## What's new in V1.26.0

- **EXPORT & IMPORT in ABOUT & UPDATES.** One backup file (`horizon-backup-YYYYMMDD-HHMM.json`, saved to Documents/Horizon) holds your chats, settings, saved attachments, Archive items and the Vault (still AES-encrypted). Import reads a backup, shows what is inside, and restores only after you tap Restore. Chats merge with the ones already on the phone; everything else in the file replaces the current value; Horizon then restarts.
- **API keys stay out of the file** unless you switch on Include API keys. Turning it on writes provider, search and GitHub keys in plain text, so keep that file private.
- The music library scan and downloaded GitHub repos are not exported. They rebuild from your phone and GitHub.
- Only `horizon_*` and `ember_*` entries are read back, and snooze state is never saved or restored.
- The two side arrows on the chat edges are green.

## What's new in V1.25.0

- **Natural voices. Piper is removed.** Under Personalisation > Voice you now pick **Natural: Gemini** (30 voices, uses the Gemini key(s) you already added, backup keys included), **Natural: Pollinations** (6 voices, paste a key from enter.pollinations.ai) or **Standard: Android voice** (free, offline, unlimited). The voice works with every chat provider.
- If a natural voice fails or hits its limit, Horizon speaks with the Android voice instead and shows why. After a limit error it skips that voice for a minute so replies do not stall.
- Speed works on every voice. Pitch only applies to the Android voice.
- Deleted `horizon_piper_worker.js`. Free-tier limits for the Gemini and Pollinations voices are set by Google and Pollinations and can change.

## V1.24.2

- **Collapsible Uploads box in the ARCHIVE.** Your items now live inside an Uploads box (inside the Archive card) with a count and a chevron. Tap to collapse or expand; nothing shows while collapsed, and collapsing the whole Archive card now hides the list too. It remembers its state.
- **ABOUT & UPDATES now sits at the bottom of the right panel**, on its own line above APPS. **USAGE & ENGINE is back in the settings list** (last row). Right-panel menu titles are cyan (HORIZON VAULT stays orange); descriptions are unchanged.

## V1.24.1

- **Spacing pass.** Header buttons get a 12px gap and padding, the top bar sits 6px lower under the status bar, the engine badge is 36px tall with a 12px model name, and the status line under the composer has more room.

## V1.24.0

- **SNOOZE** (moon button in the top bar). Works like airplane mode: Horizon blocks all network calls, switches its access permissions off (wake lock, background, notifications, files, microphone) and the chat dashboard shows **Horizon Offline** with Gemini, Groq, Cohere and Pollinations asleep under the menu cards. Tap the moon again to wake; permissions return to what they were before snoozing.
- New files: `horizon_snooze.js`, `horizon_snooze_net.js`, `horizon_snooze.css`.

## V1.23.0

- **DOWNLOADS** (5th tile in the Apps menu). One history for everything Horizon saves: the YouTube terminal, downloads the chat AI queues, and every source below. Each row shows live progress, size, source and age. **Open** on a finished file, **Retry** on a failed one, **Remove** (never deletes the file), **Clear finished**, and filters for Music, Video, Images, Files, Repos and Torrents. A red badge on the tile counts failed downloads.
- **GET SOMETHING** (second tab): YouTube (opens the terminal), **Audius** (music), **Internet Archive** (films, shows, radio, albums, with a file picker and a `.torrent`), **Images** from Wikimedia Commons (licence shown), **Any link** (song, video, picture or file), **Repo zip** (GitHub or GitLab, optional branch or tag), and **Torrent** (a magnet link goes to your torrent app, a `.torrent` link is saved). Up to 3 downloads run at once, the rest wait.
- **Saved where they belong** through MediaStore: `Music/Horizon`, `Movies/Horizon`, `Pictures/Horizon`, `Download/Horizon`.
- **Quick picks you control** (YouTube terminal): a **+** at the end of every group adds a pick, **Edit** lets you tap a pick to replace it, remove it with the x, rename or delete a group, add a new group, or reset to the defaults. Your picks are kept on the device.
- **Fix: "Could not queue download: Not one of standard directories: Music/Horizon".** YouTube saves still used the old DownloadManager call, which wants a standard folder plus a sub-path. They now use the same MediaStore save as everything else (and the old call is corrected too).
- New files: `horizon_downloads.js`, `horizon_downloads.css`. Native `HorizonAIPlugin.kt` gains `openMedia` and `openLink`, and `saveMedia` gains a `kind` (audio, video, image, file).

**Status, stated plainly**
- *Implemented and tested (headless Chromium, network mocked, browser save path):* the Downloads page, history, filters, Retry and Remove, restart handling ("Interrupted when the app closed"), the failed badge, all source screens and their link building, Quick picks add, replace, remove, reset and persistence, and the YouTube terminal and chat AI feeding the history.
- *Implemented, not run on a phone:* the Android side (MediaStore saves for images and files, Open, magnet hand-off). The Kotlin was not compiled here, so the first CI build is its first compile.
- *Not contacted from here:* the live Audius, Internet Archive, Wikimedia Commons, GitHub and GitLab servers. The code follows their public APIs, but a changed response would show as a failed row with the reason.
- *Not included:* SoundCloud (it has no open, keyless download API; Audius is the open alternative) and a built-in torrent engine (magnet links are handed to a torrent app such as LibreTorrent or Flud).
- Only save what you have the right to save. Private repos are not supported (no tokens are used for downloads).

## What's new in V1.20.0

- **LENS** (4th tile in the Apps menu, next to Music). The AI now sees how the app really looks, not only what is on screen: a full **UI map** (screen size, theme, every design token colour, fonts, every panel open or closed, a layout tree with sizes, colours, radius, padding and gaps) plus an **automatic problem check** (clipped text, tap targets under 32px, low contrast, tiny text, parts pushed off screen). On the Android app it also sends a **real screenshot** to vision models (Gemini, Groq Llama 4, Cohere vision). The Vault, keys and password fields are blurred before the shot, and nothing is saved.
- **Auto, Always or Off.** Auto only looks when your message is about how something looks, feels or lines up. Always sends the map and shot with every message. The Screen switch in the + menu stays the master switch.
- Lens window: preview the exact screenshot the AI gets, refresh and read the UI map, copy it, or tap Ask the AI to review.
- **Compact usage badge.** Smaller pill under the header: provider, model, a mini bar trace of the last replies, tokens and time. A thin line slides while the AI thinks. The usage dashboard is tighter too.
- New files: `horizon_lens.js`, `horizon_lens.css`, native `HorizonLensPlugin.java` (PixelCopy screenshot, registered in `MainActivity.java` and `apply-android.sh`).

## What was new in V1.19.0

- **ABOUT & UPDATES** (bottom row of the right panel): version, changelog, a Check for new release button, and privacy awareness. Messages go straight from the device to the chosen provider, whose own terms decide whether data is kept or used for training.
- **Data-training reminder switch** (ON/OFF): shows a short reminder the first time you send to each provider in a session. It only reminds; it cannot change provider-side settings.
- New files: `horizon_about.js`, `horizon_about.css`.

## What was new in V1.18.0

- **Enter adds a new line.** In the message box Enter no longer sends. Only the send button sends.
- **Back goes up one menu.** Hardware Back now steps back one level: model list to provider list, an app (GitHub, YouTube, Music) to the apps menu, a settings page to the settings list, and only then to the chat.
- **USAGE & ENGINE (right panel, top row).** Tokens and response time per provider (Gemini, Groq, Cohere, Pollinations), requests per day for the last 7 days, a sparkline of response times, and which keys are live, rate-limited or failing, with a Check all keys button. It also shows your IP, place name (city, region, country) and coordinates, looked up when the page opens and never saved. Tokens marked ~ are estimates for providers that do not report them. Stats stay on this device (no keys, no message text).
- **Live provider badge** under the header: active provider and model with a live timer while it thinks, then tokens in and out plus time. Tap it to open the dashboard.
- New files: `horizon_usage.js`, `horizon_usage.css`.

## What was new in V1.17.0

- **Read-aloud keeps going in the background.** Leaving the app no longer stops text to speech. While it speaks, a "Horizon is reading aloud" notification with a Stop button keeps Android from freezing the app (new Kotlin `HorizonSpeakService`).
- **Reply from the notification.** When a reply arrives while the app is in the background, the notification now has a real Reply box (Kotlin `RemoteInput` plus `HorizonReplyReceiver`). Your text is sent as a normal chat message, the notification shows "Horizon is thinking...", and the answer comes back as a new notification you can reply to again.
- If Android had already closed the app, the reply is saved and sent the next time Horizon opens.

## What was new in V1.16.0

- **Attach files.** The + menu has a new Attach row (a button, not a switch). Pick images, PDF, DOCX, MD or HTML. Each file waits above the message box as a small card with a remove X, and stays a small card in the chat. Tap a card to peek at its text. Up to 6 files, 25 MB each.
- **The AI reads them.** PDF, DOCX, MD and HTML go in as text, marked as untrusted data. Images go to vision models (Gemini, Groq Llama 4, Cohere vision). A scanned PDF is sent as page pictures. Older files shrink to a short excerpt to save tokens.
- **Screen switch.** A new Screen row in the + menu lets the AI see the app screen: the top panel, switches, buttons and recent notices. Keys, tokens, passwords, the Vault and chat text are never read.
- New files: `horizon_attach.js`, `horizon_attach.css`, `horizon_screen.js`.

## What was new in V1.15.3

- **Vault switch in the + menu (implemented, headless-tested).** A new Vault row turns "AI can write notes to the Vault" on or off. It is the same switch as the Vault page and PERMISSIONS. A locked vault still cannot be written to, and the row says so. The + button counts it (green when all 6 are on).
- **Compact + menu (implemented).** Still vertical, but one line per tool (name, short status, switch), roughly half the old height. Adding more rows later stays even.
- **Black instead of red (implemented).** Off is now black in the + menu, its switches, the + button and the PERMISSIONS switches. On stays green. The per-tool purple, lime and red icon tints are gone so every row matches. The Make PDF pill is neutral.
- *(Not run on a phone.)*

## What's new in V1.15.2

- **Piper no longer freezes the app (implemented, tested with a stub engine).** The Piper library loads a ~60 MB model and runs speech inference on the thread that imports it, so on the main thread it locked the whole app. It now runs in a background worker (`horizon_piper_worker.js`). A stuck job is cancelled by restarting the worker, and any Piper failure falls through to the Android voice with the reason shown. Chunks are shorter (180 characters) so the first sound arrives sooner.
- **Black chat bubble, white text (implemented).** Your messages show as a black bubble with white text in every theme.
- *(Tested in headless Chromium with the Piper library replaced by a stub that blocks for 2.5 s: the page stayed responsive and the voice went download, ready, speak, playing, idle. Not run against the real Piper model or on a phone.)*

## What's new in V1.15.1

- **YouTube window fills the screen (implemented, headless-tested).** The terminal stretches, with a collapsible DOWNLOADS panel under it (latest 2 collapsed; Expand shows 30 with Retry, Remove, Clear all) and a QUICK PICKS block at the bottom (local, beats and classics chips, plus a where-files-go tip).
- *(Not run on a phone.)*

## What's new in V1.15.0

- **YouTube terminal redesign (implemented, headless-tested).** Modern terminal look: status pill, quick-command chips with your last searches, result cards with thumbnail, duration and ↓ Music / ↓ Video buttons, inline spinner and per-download status.
- **Any text is a search (implemented).** Typing an artist used to hit "Unknown command" and show nothing. Now bare text searches. A bare number downloads that result's audio; a pasted YouTube link downloads it.
- **Sources race, not queue (implemented).** Piped/Invidious sources are tried 4 at a time, the last working one is remembered, and a live instance list is fetched when the built-ins are down.
- **Short errors (implemented).** The long pipe-joined error is gone. You get one line (how many sources were tried and how they failed). The AI is told to say it in one sentence. `diag` in the terminal shows per-source detail.
- **Piped proxy rewrite (implemented, untested live).** googlevideo links from Piped are routed through the instance's proxy so the phone can fetch them.
- *(Not run against live sources: the build sandbox has no outbound network. Tested with mocked sources at phone width. Public instances still go down; if all are dead you get the short message.)*

## What's new in V1.14.1

- **Device & native check (implemented).** The top of the Vault settings page now has a "Device & native check" card. It runs when the page opens and shows the device (maker, model, Android, CPU, screen), local and public IP, the installed app ID and APK version, and whether HorizonPerms, HorizonAI, HorizonMedia and HorizonSpeech are registered. Use it when you see "unable to find plugin". The public IP is looked up from api.ipify.org when you run it.
- **App ID pinned (implemented).** The build workflow now falls back to com.festers.horizon (same as capacitor.config.json). It used to fall back to com.fezzy.horizon, which installs as a second, separate Horizon beside the old one.
- *(Not run on a phone. Scripts checked with bash -n; the page script checked with node --check.)*

## What was new in V1.14.0

- **HORIZON APPS dock (implemented, headless-tested).** The right panel now ends with a compact dock of icon + label tiles (GitHub, YouTube, Music) in a grid. Tap one and it opens full screen. The dock hides itself inside a settings page so it never covers content.
- **ADD ONS row removed (implemented).** The dock is the only way in, so the extra settings row is gone. Minimize on an app window now returns straight to chat.
- **Header label removed (implemented).** The "AI EXTENSION ADD ONS" text above the HORIZON logo is gone.
- **Big blocks gone (implemented).** The old big widget blocks no longer show anywhere; the apps open from the dock tiles.
- *(Checked in headless Chromium at phone width: no page errors, dock opens the YouTube window, minimize shows the tile view, dock hides in Vault. Not run on a phone.)*

## What was new in V1.12.1

- **Stop button (red).** While Horizon is working, the send button turns into a red Stop square. Tap it and the request is dropped at once: the loading bubble goes, a "Stopped" note shows, and the late reply is thrown away. Further retries and tool rounds of that turn are cancelled too. While a reply is still typing out, Stop just finishes the text. Works for image mode as well.
- **Copy button (cyan, green when copied) on every Horizon reply**, next to the read-aloud button. It copies the reply text as written (Markdown) and shows "Copied" for a moment.
- **Calmer chat.** A thin divider line now sits between one exchange and the next. Nothing else was changed.
- *(Checked in headless Chromium with a mocked provider: copy and clipboard text, red Stop, instant release, late reply discarded, next turn works, Stop while typing. Not run on a phone. Stop drops the answer on your side; the provider may still finish the request it already received.)*

## What was new in V1.12.0

- **HORIZON VAULT is now encrypted.** The item list is one AES-256-GCM blob in the app's storage. The key is made from a passphrase you choose (PBKDF2-SHA256, 600,000 rounds, random salt). The passphrase and key are never stored, every save uses a fresh IV, and there is no recovery: forget it and the Vault can only be erased.
- **First open = set a passphrase.** Existing V1.11.0 items are encrypted with it; the old plaintext copy is removed only after the encrypted copy is written and checked to open.
- **Locks itself** after 5 minutes idle or 1 minute in the background, or with **Lock now**. Locked means the list is gone from memory and from the page, the AI cannot file notes and sees no titles. **Change passphrase** is on the unlocked page. Wrong tries are slowed down after the third miss. **Erase the Vault** is on the lock screen.
- **Not covered:** a key you switch on with **Use** is also kept by its provider card in the app's normal storage, outside the Vault. Anything you copy to the clipboard stays there. Deleted plaintext may linger in flash until Android reuses the space.
- *(Checked in headless Chromium at phone size: migration, ciphertext contents, lock / unlock, wrong-passphrase lockout, tampered data, change passphrase, background lock, erase, AI note filing locked and unlocked. Not run on a phone.)*

## What was new in V1.11.0

- **Robot button (top right).** The robot icon sits beside the menu button. Tap it and a sheet lists all four providers (Gemini, Groq, Cohere, Pollinations) with READY / NO KEY / ACTIVE. Tap one and it asks which model; the choice becomes the active provider and model. A provider with no key sends you to API PROVIDERS PLUS KEYS. The green or red dot on the button shows whether the active provider is ready. The old chip row above the chat is hidden (`#aiSelector` in the CSS) because the robot replaces it.
- **Three dots, wave and pulse.** The dots next to the AI while it answers are now three, each rising in a wave and glowing in turn. Reduced-motion still turns the animation off.
- **HORIZON VAULT (right panel, orange).** New settings page with its own description. Store AI keys and scraping keys (several per service, tap **Use** to switch the live key through the normal save-and-validate path), notes, SSH keys, tokens and links. Links show the site's icon. Filter by type, Show / Copy / Edit / Delete (delete asks twice), add with the **+ Add** button. Kept in the app's own storage on the phone and **not encrypted**.
- **AI can file notes.** With the switch on, the AI can end a reply with `[[vault.note: Title | text]]` and the note lands in the Vault (max 2 per reply, marked BY AI). The tag is always stripped from what you read. The AI sees only the titles of your notes, never keys, tokens or SSH keys, and a note that looks like it holds a key is refused. The switch is on the Vault page and as a row under **PERMISSIONS**, and it is on by default.
- **Link icons for AI searches.** Already in place, checked, nothing to add: search results in the thought process and the Sources cards under a reply show each site's icon, with a letter if the icon cannot load.
- **Bigger chat box, small icons.** The message box is a taller multi-line field (grows to about 6 lines; Enter still sends), the + and send buttons are smaller, and the red YouTube button no longer sits inside it. Anything switched on (YouTube, Image, PDF, Web, GitHub, Music, Vault notes) shows as a small chip in its own strip above the box, each with an **X** that switches it off.
- **Startup bug fixed (was in V1.10.0).** The music player's Songs / Artists / Albums tabs were treated as menu rows, which threw an error during start-up and stopped the rest of the setup (provider status, chat list, welcome screen). Only real menu rows are used now.
- *(Checked in headless Chromium at phone size with the AI and web calls mocked: picker, Vault add / edit / delete / use-state, AI note filing and secret refusal, chips and their X, box growth, 3-dot animation. Not run on a phone, and the Android Java is unchanged and untouched. Using a Vault key through Use was not tested against live Gemini, Groq or Cohere.)*
- New file `www/horizon_vault.js`.

## What was new in V1.10.0

- **Music player, own MUSIC tab in the left panel.** Full player: now-playing card with seek bar, previous / play-pause / next, shuffle, repeat (off, all, one), likes, a queue, Recent, and Songs / Artists / Albums / Liked views with search and sort (A-Z, Artist, Newest). Tap an artist or album to filter the songs. *(Implemented. Logic tested in Node with a mocked player and a mocked scan; not seen on a phone screen, and real playback is not tested.)*
- **Widget at the bottom of the left panel.** A mini player that stays pinned at the bottom: song, artist, previous / play-pause / next, the red eye, and an **expand** button that jumps straight to the MUSIC tab, so it never fights the other tabs. *(Implemented, layout not seen on a device.)*
- **Now playing under the Horizon logo.** A thin strip below the header shows the current song with an animated bar, play / pause, the red eye and a progress line. Tap it to open the player. It only shows once a song is loaded.
- **Scan your whole storage.** **Scan storage** asks Android's media index for every audio file on internal storage and the SD card (new native method `scanMusic` in `HorizonPermsPlugin.java`, uses the same audio / storage permission as the YouTube downloads). Voice recordings and other non-music audio are hidden unless you switch **All audio** on. Files inside `.nomedia` folders or that Android never indexed are not found. **Add files** loads audio for the current session (also works outside the app). The song list is cached, so no rescan is needed on every launch. *(The Java method is written but NOT compiled or run here: no Android toolchain. Treat the first build as the test.)*
- **Red eye = the AI can see.** One switch (red eye icon on the widget, the strip, the player and in the + menu as **Music (AI can see)**). On: every reply is given what is playing, how far in, up next and recently played, so you can ask "what do you think of this?". There is also an **Ask AI** button that asks it for you. Off (eye slashed): the AI sees nothing and gets no music tools.
- **AI controls.** With the eye on the AI can use `[[music.search: words]]`, `[[music.play: id or words]]`, `[[music.queue: id]]`, `[[music.pause]]`, `[[music.resume]]`, `[[music.next]]`, `[[music.prev]]`, `[[music.now]]`. It only knows song details (title, artist, album, length, position). It cannot hear the audio.
- Not built yet (planned): album art (tiles use a coloured letter), playlists you can name, sleep timer, and showing the YouTube downloads in the library automatically.
- New file `www/horizon_music.js`.

## What was new in V1.9.0

- **GitHub vault widget** at the bottom of the right panel (shown on the Settings list, hidden inside sub pages). Search GitHub by name, or paste `owner/name` or a github.com link, then tap **Pull**. *(Implemented; the GitHub calls and the vault were tested against a mocked GitHub and a mocked IndexedDB in Node, not against live GitHub and not on a device.)*
- **Termux-style terminal.** A small dark terminal shows what the pull is doing: the command, tree size, which files were kept or skipped, and a live `[####----] 45%` progress line. **Stop** aborts a pull and stores nothing for that repo. *(Implemented; layout not yet seen on a phone screen.)*
- **Pulled tab** next to the terminal lists every pulled repo with branch, file count, size and age, plus **Pull again** and **Remove** (tap twice). You never browse the files; only their size shows. They are stored as text inside the app (IndexedDB).
- **Sync** checks each pulled repo's latest commit, re-pulls the ones that changed, then the ring icon in the widget header shows the **percentage of vault space used** (green, amber from 70%, red from 90%). Budget is 100 MB for the vault, 15 MB and 1500 files per repo.
- **Uploaded to the AI.** Every chat with GitHub on gets a manifest of the pulled repos in its system prompt (layout, file types, README start) plus four tools the AI uses by itself: `[[gh.list]]`, `[[gh.tree: repo | folder]]`, `[[gh.read: repo | path | 1-200]]`, `[[gh.grep: repo | pattern]]`. Results go back to the AI marked as untrusted data. The vault is read-only: the AI cannot push to GitHub.
- **GitHub toggle in the + menu** with a cat icon (a stylised cat drawn for this app, swap in GitHub's official Octocat asset if you prefer). Per chat, green on and red off, same as Web and YouTube. Pulling a repo switches it on for the current chat.
- **Optional token** (Token section in the widget) for private repos and a higher rate limit. Stored on this phone only and sent only to GitHub. Skipped on purpose: binaries, `node_modules`, `dist`, `build`, `vendor`, lock files, files over 300 KB.
- New file `www/horizon_github.js` holds the vault, the GitHub calls, the terminal and the AI tools.

## What was new in V1.8.0

- **Cohere.** New provider chip. Add a Cohere key (a free trial key works), pick a Command model, switch it on. Uses the v2 chat API; the model list is loaded from your key. Trial-key rate limits are retried when the wait is short.
- **Pollinations (free chat, no key).** New provider chip that works with no setup. It is also the default on a fresh install. The free tier is one request at a time, about 30 seconds apart; Horizon waits for the next slot and retries instead of failing. "Refresh model list" reloads the models Pollinations offers.
- **Image toggle in the + menu.** Switch **Image** on and Pollinations takes over: whatever you type is drawn (768x768) and shown as an image card with **Save** (Documents/Horizon), **Redo** (new seed) and **Open**. A small lime dot on the + shows image mode is on. Switch it off to go back to chat. The free image tier is about one picture every 45 seconds.
- **PDF pill moved into the + menu.** The PDF switch now carries a **Make PDF** pill underneath it (shown while PDF is on). The extra button beside the + is gone, so the message bar has more room.
- **Piper voice plays.** Piper audio now plays through Web Audio that is unlocked on every tap, with the audio element as a backup, and the app allows media playback without a fresh tap. If Android still refuses, the Voice card shows why and Horizon falls back to the Android voice. Finishing the Piper download now switches Voice quality to High quality for you (before, it stayed on Standard, so Piper never spoke). Four more Piper voices were added (US, Scottish and UK English).
- **More Android voices and accents.** Voices are grouped by accent with readable names (for example "Voice AFRM · online"), your phone's own accent comes first, and a new **Accent or language** list narrows the voices. **Get more Android voices** opens Android's text-to-speech settings, where Speech Services by Google can install more. A status line shows how many voices Android reported and whether audio is unlocked.
- *(Built and checked in a headless browser with mocked Cohere, Pollinations and voice engines. The Android side (audio permission change, voice settings button) is not built or run on a device.)*

## What was new in V1.6.0

- **Code blocks.** Every fenced block gets a language label, a **Copy** button (turns into "Copied") and syntax colours for bash/Termux, JS/TS, Python, JSON, HTML, CSS, SQL, YAML, Java/Kotlin/C-style and diffs. Blocks with no language are guessed. Highlighting is built in, no network.
- **Link cards.** A pasted URL shows a small card above the message box (icon, title, site) and stays under your sent message. Bare URLs and `[text](url)` in replies become tappable links, and a link on its own line becomes a card. Titles are fetched only for links *you* paste, never for URLs inside a reply.
- **Themes.** New theme button in the header: Light, Dark and Neon cyan (black and electric cyan, matches the icon). Saved and applied before first paint.
- **Welcome screen.** Hero, provider status and four starter cards: Build a script, Search the web, Make a PDF, Plan a build. Tap one and it fills the message box.
- **Provider badge + live readout.** The reply avatar wears a ring in the provider colour (Gemini gradient, Groq orange) and pulses while working. A live chip shows provider, model, elapsed time and tokens; finished replies keep a token pill and in/out counts from the provider's own usage data.
- **Motion and empty states.** Typing dots are a wave, messages and cards fade in (respects reduced-motion), and Chats, Memories and Artifacts have proper empty states.
- *(Built and checked for syntax only. Not run on a device.)*

## What was new in V1.5.1

- **Thought process, rebuilt.** The steps now drop down vertically as a timeline (icon, title, detail, time) instead of sitting beside the dots. The steps are real: what it read in your message and what it took it for, how much chat context and how many memories went in (and which looked relevant), persona and preferences, which web tools are live, each round sent to the model, every tool it asked for with the query, what came back (service, size, time, errors), and what was tidied in the reply. It no longer vanishes: when the reply lands it stays above it as a "Thought process" chip. Tap it to expand. If you had it open while it worked, it stays open.
- **Right panel = separate pages.** API PROVIDERS PLUS KEYS, WEB SCRAPING and PERMISSIONS are rows in a list. Tap one and it opens on its own page with a Back button. The phone's Back button goes page to list first, then closes the panel.
- **Settings inside those pages are dropdowns.** Every provider, scraper and permission is a collapsed row (title, one line, chevron) that opens in place. Scraper options (JS rendering, region) now collapse with their card. Permission switches stay on the header so you can flip them without opening.
- The left panel keeps its accordion.
- **Web sources with icons.** Search and page-read steps list the pages they found as tappable rows with the site icon, and the reply ends with a "Sources" list of cards (icon, page title, site). Icons come from Google favicons and fall back to a letter badge offline.
- **App icon can no longer be skipped.** `apply-android.sh` now also runs automatically on every `cap add` and `cap sync` (package.json hooks), verifies the icon files landed, and fails the build if the default Android icon is still there.
- *(implemented; tested in a headless browser at phone width with mocked Groq and SerpAPI. Not run on a device.)*

## What was new in V1.5.0

- **Everything collapses.** Both panels are now accordions: every row and every card has a title, a one-line description and an expand/collapse chevron. Open as many as you like. Your open/closed choices are remembered.
- **+ is now the Tools menu.** Tap it for three switches: **Web**, **YouTube music**, **PDF**. Green is on, red is off. The + itself shows the overall state: green (all on), amber (some on), red (none on). It no longer sends you to set an API key; with no scraper key the Web switch just says so.
- **PDF icon** is now a red Acrobat-style badge (a recreation, not Adobe's official artwork) on the PDF button, the Artifacts row and PDF cards. The PDF button only shows while PDF is switched on.
- **Run in background** (new PERMISSIONS switch, on by default): a small foreground service keeps Horizon alive when you leave the app so Android does not restart it. The Back button now sends Horizon to the background instead of closing it. If Android still kills it, Horizon reopens on the same chat with your unsent text.
- **Permissions that actually ask.** Notifications, Microphone and storage/audio are now requested by a native plugin with the real Android prompt. If Android already blocked the prompt, Horizon opens the exact settings page. Turning one off inside the app works too. Battery optimisation falls back to the list page and Honor/Huawei power pages when the standard prompt is blocked. Failed native calls now show the real error text.
- **Groq fix**: rate-limit and size errors (the "fails after the second message" case) are retried automatically: it waits out short rate limits, and on "request too large" it resends a trimmed history. Errors now show the HTTP status and Groq's own message. GPT-OSS models run with low reasoning effort so they answer instead of coming back empty.
- *(implemented; the UI and Groq retry logic were run in a headless browser with mocked servers. The Android side has not been built or run on a device.)*

## What was new in V1.4.3

- **Long PDFs (8+ pages, or "detailed/comprehensive")**: Horizon outlines first, then writes each section in its own call (progress shows in the thought process), then builds the PDF with a contents page. Web tools are not used in this mode.
- **Auto-continue**: a PDF reply that gets cut off is continued up to 3 times and stitched together. *(implemented, not yet seen on a device)*

## What was new in V1.4.2

- **Colours and templates** for PDFs: 13 themes plus any `accent: #hex`, a colour strip on every page, and `template: cv | letter | report`. Say "make my CV in violet" and Horizon uses the CV layout (name, contact line, ruled sections, tight bullets). Numbers in tables right-align. *(implemented, not yet seen on a device)*

## What was new in V1.4.1

- **Live thought process**: while Horizon works, a rotating line with icons shows what it is doing (fast on chat, slower on PDFs). Tap it to open the full step list. Web search, page reads and YouTube steps are real and shown bold. Each reply keeps a "Thought process" chip you can tap later. *(implemented, not yet seen on a device)*

## What was new in V1.4.0

- **PDF button** (📄 PDF) beside the message box, plus "make a PDF" in plain words. Horizon writes the document and it appears in the chat as a PDF card with **View** (real PDF, page by page, zoom) and **Download** (Documents/Horizon). A4, up to 15+ pages, tables, charts, callouts, columns. Uses the Ember A4 document engine and bundled pdfmake + pdf.js, no network. *(implemented, not yet seen on a device)*
- **Artifacts (N)** box at the top of the CHATS tab lists every PDF across your chats.

## What was new in V1.3.0

- **Settings is now a list** (same layout as Ember): three full-width rows, each with a title, a one-line description and a chevron. Tap a row and it opens straight in. No dropdowns. A Back button returns to the list. *(implemented, logic tested, not yet seen on a device)*
- **PERMISSIONS panel** (third settings row): Wake lock, Notification access, File access, Battery optimisation, Microphone. Each has a logo and a switch, green when on and red when off. *(implemented; native side untested on a device)*
- **YouTube feature**: a red YouTube button beside the + button switches YouTube on for the current chat. With it on, you can ask the AI about music and tell it to download songs. *(implemented; search and download logic tested with mocked servers, not tested against live servers or on a device)*
- **Downloads drop box** above the message bar: tap it to drop it open. Every download has a progress bar, percentage, size and where it was saved. Finished and failed items stay in the list until you clear them. *(implemented)*
- New Android permissions and a small native plugin (`HorizonPerms`) are added by `scripts/apply-android.sh` during the build. *(implemented, script tested against a fake Android tree, not tested in CI)*

## Features

- **+ button** left of the message box opens the Tools menu (Web, YouTube, GitHub, Music, PDF switches, green on / red off). Web, YouTube and GitHub are per chat; PDF is global. New chats start with Web on.
- **Sources used** strip under any reply that searched or scraped, with tappable domain chips. Every reply also carries a small provider logo with its name and model.
- **Free-text replies**: Horizon types straight onto the page, no chat bubble. Tap a reply while it types to skip to the end. Each reply shows how long it took.
- **999 persona**: street-smart, empathetic, slightly dark humour, real advice, sharp wording, substantial replies. Built in, editable.
- **Right panel (Settings)**, with the Horizon name and logo in the top corner, is a list of three rows. Tap one to go straight in:
  - **API PROVIDERS PLUS KEYS**: Gemini and Groq cards. Keys are validated against the provider before they are saved and the model list is pulled live. One provider is active at a time, no fallback chains.
  - **WEB SCRAPING**: SerpAPI (search), Firecrawl (search + scrape), ScraperBee / ScrapingBee (scrape) and Browserless (scrape). Each has a key box, an on/off switch and a validate button. Horizon is told exactly which ones are live and calls them itself.
  - **PERMISSIONS**: five switches (see below) plus the **YouTube music source** box.
- **Left panel** has four tabs (the fourth, MUSIC, is the music player):
  - **CHATS**: new chat and saved history
  - **PROMPT & PREFERENCES**: the system prompt (editable, resettable) plus a preferences box that is added on top of it
  - **AI MEMORIES**: facts Horizon carries into every chat. Add your own, delete any, or let Horizon save durable facts itself (Auto-save). Keys and secrets are never stored.
- Markdown rendering for replies: bold, inline code, code blocks, lists, headings
- Fully offline UI: no CDN fonts or icon packs, everything is inlined
- Hardware Back closes panels first

## Permissions panel

| Switch | What it does | Turning it off |
| --- | --- | --- |
| Run in background | Foreground service that keeps Horizon alive when you leave the app. On by default. | Instant |
| Wake lock | Keeps the screen on while Horizon is open (Android keep-screen-on flag, Screen Wake Lock API in a browser). Remembered between launches. | Instant, inside the app |
| Notification access | Lets Horizon post a "Download complete" notification. | Opens Android app settings (Android does not let apps revoke it) |
| File access | Lets downloads be saved. Off pauses all downloads. | Instant, inside the app |
| Battery optimisation | Asks Android to exempt Horizon from battery optimisation. | Opens the Android battery list |
| Microphone | Requests microphone permission. **Voice input itself is not built yet** (planned). | Opens Android app settings |

The switches show the real Android state when you open the panel and again when you come back to the app. Battery optimisation is Android-app only and is disabled in a browser.

## YouTube music and downloads

1. Add a Gemini or Groq key and switch **File access** on under PERMISSIONS.
2. In a chat, tap the red **YouTube** button beside **+**. It lights red when on, and is per chat (new chats start with it off).
3. Ask for music: "what are the best Juice WRLD songs for gym" or "download Lucid Dreams for me". The AI searches, picks a match and queues the download.
4. Open the **Downloads** box above the message bar to watch the progress bar. Songs are saved to `Music/Horizon` on the phone. If Android refuses that folder, Horizon falls back to `Documents/Horizon`, then to app storage, and the box shows where each file went.

How it works: the AI replies with tags the app runs for it, the same way as the web tools: `[[yt.search: query]]` and `[[yt.download: VIDEO_ID | Title]]`. Search and audio links come from **Piped** or **Invidious** servers, the same idea as NewPipe, with no Google login and no API key. Public servers go down often, so the **YouTube music source** box under PERMISSIONS lets you list your own (one per line, start a line with `inv:` for Invidious) and has a **Test** button. Up to 2 downloads run at once, audio only.

Please only save music you have the right to download. Downloading from YouTube can break YouTube's terms of service.

*Status:* the search, stream picking, queue, fallback folders, progress and notification code was tested against mocked servers and a mocked Android bridge. It has **not** been tested against live servers, on a phone, or in a CI build. A true NewPipeExtractor native plugin is **planned**, not built.

## How the web tools work

When at least one scraper key is switched on, the system prompt tells Horizon which tools exist. To use one it replies with a tag such as `[[web.search: query]]` or `[[web.scrape: https://url]]`. The app runs the call with your key, hands the text back as the next message, and Horizon continues (up to 4 rounds per question). Page text is passed as untrusted data, never as instructions. Search goes SerpAPI then Firecrawl; scrape goes Firecrawl, then ScrapingBee, then Browserless, skipping anything that is off or fails.

Endpoints used: SerpAPI `search.json`, Firecrawl v2 `/search` and `/scrape`, ScrapingBee `/api/v1/`, Browserless `/content` (region selectable).

## Project layout

```
horizon/
├── .github/workflows/build-apk.yml   CI: builds the APK on GitHub Actions
├── www/
│   ├── index.html                    The whole app (HTML, CSS, JS)
│   ├── horizon_github.js             GitHub vault: search, pull, terminal, AI tools
│   ├── horizon_music.js              Music player: library, queue, now playing, AI tools
│   ├── horizon_downloads.js          Downloads app: history, Retry/Open, Audius, Internet Archive, Commons, links, repos, torrents
│   ├── horizon_downloads.css         Downloads app styles
│   └── icon.png                      Favicon
├── resources/
│   ├── icon.png                      1024px master icon
│   ├── icon-foreground.png           Adaptive icon foreground
│   └── android/
│       ├── res/                      Pre-rendered launcher icons, adaptive XML, splash
│       └── java/                     HorizonPermsPlugin.java + MainActivity.java templates
├── scripts/
│   ├── apply-android.sh              Icons, splash, manifest permissions, native plugin
│   ├── set-version.sh                Stamps versionName and versionCode
│   └── make_icons.py                 Regenerates every icon (needs Pillow)
├── capacitor.config.json
├── package.json
├── LICENSE
└── README.md
```

The `android/` folder is not committed. CI generates it fresh with `npx cap add android` on every build.

## Build the APK on GitHub

1. Create an empty repo on GitHub (for example `philfesters/horizon`).
2. Push this project:

   ```bash
   git init
   git add .
   git commit -m "Horizon V1.3.0"
   git branch -M main
   git remote add origin git@github.com:philfesters/horizon.git
   git push -u origin main
   ```

3. Open the **Actions** tab. **Build Android APK** runs on every push to `main`.
4. When it finishes, download the APK from the run's **Artifacts** section. The file is named like `Horizon-V1_3_0-b1.apk`.

### Publish a release

Tag a commit and push the tag. The same workflow attaches the APK to a GitHub Release.

```bash
git tag V1.3.0
git push origin V1.3.0
```

To bump the version, change `version` in `package.json`. CI stamps it into the APK as `versionName` and uses the run number as `versionCode`.

The workflow builds a **debug-signed** APK, which installs fine on any phone with "Install unknown apps" allowed.

## Using the app

1. Open the sliders button (top right). Settings is a list of three rows. Tap **API PROVIDERS PLUS KEYS**.
2. Paste a key into the Gemini or Groq card and tap **Save & validate**.
   - Gemini: https://aistudio.google.com/apikey
   - Groq: https://console.groq.com/keys
3. Pick a model, then tap **Use** on the provider you want (or use the chips above the chat).
4. Optional: open **WEB SCRAPING** from the settings list, add any of SerpAPI, Firecrawl, ScraperBee, Browserless, and leave them On. The **Web** chip above the chat shows whether Horizon is live on the web.
   Optional: open **PERMISSIONS**, switch on what you want (green is on), then use the red YouTube button beside + to ask for music.
5. Open the menu (top left): **PROMPT & PREFERENCES** to shape how it talks, **AI MEMORIES** to see or edit what it remembers.

Keys live in the app's local storage on your device and are only ever sent to their own service.

## Local development

```bash
npm install
npx cap add android
bash scripts/apply-android.sh   # icons, splash, permissions, native plugin
npx cap sync android
npx cap open android      # opens Android Studio
```

You can also open `www/index.html` directly in a desktop browser to work on the UI.

Regenerate the icons after changing the artwork in `scripts/make_icons.py`:

```bash
pip install pillow
python3 scripts/make_icons.py
```

## Notes

- `CapacitorHttp` is enabled in `capacitor.config.json`, so API calls go through the native layer and are not affected by browser CORS rules.
- `@capacitor/filesystem` saves the downloads and reports progress; `@capacitor/local-notifications` posts the completion notice. Both are pulled in by `npm install`.
- The package id is `com.festers.horizon`. Change `appId` in `capacitor.config.json` before your first build if you want a different one.

## License

[MIT](LICENSE) © 2026 Grant "Fezzy" Festers
