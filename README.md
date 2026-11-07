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

- **Kokoro removed.** The Kokoro offline voice is gone from the Voice list and the native plugin (Piper voices stay). A Kokoro download from an older version is deleted on the next Voice settings visit to free about 330 MB. *Tested:* syntax checks only. *Not tested:* the Kotlin change has not been compiled.
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
