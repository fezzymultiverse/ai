/* Horizon V1.26.0: ABOUT & UPDATES page: version, release check, backup export/import, changelog, privacy awareness + reminder switch. */
(function () {
    'use strict';
    var VERSION = 'V1.67.11';
    var LSK = 'horizon_privacy_notice';
    var REPO_API = 'https://api.github.com/repos/fezzymultiverse/ai';
    var LOG = [
        ['V1.67.11', ['GROUP REPLY: every AI message in a group chat has a Reply button at the end. Tap it, the box gets @that AI, and only that AI answers. The others stay out of it.']],
        ['V1.67.10', ['CHAT BOX: the text now starts at the top left and runs the full width. The icons sit on their own row at the bottom, with a gap, and the box grows upward. CHAT LIST: the pin and bin fit on screen, no sliding right. PREFERENCES: every preference has its own box with its own bin. Add preference makes a new box.']],
        ['V1.67.9', ['TOP PILL: in a group chat it reads GROUP CHAT and nothing else (no AI names). In a one on one chat it shows only the provider name, the model is on the reply. The words are spread evenly. GROUP IN THE BACKGROUND: a group round now keeps one Kotlin background service alive from the first AI to the last, so leaving the app no longer slows the next reply, the typing or the voice. Typing finishes at once when you leave the app.']],
        ['V1.67.8', ['GROUP CHAT FIX: an old group round can no longer keep running in the background after you start a new group or leave one. Before, it could grab the busy state again, so sending in the new group did nothing, and its retry bar could appear in the wrong chat.']],
        ['V1.67.7', ['OPENAI VOICE: a new natural voice engine with 11 male and female voices. Settings > Voice > pick Natural: OpenAI, paste your OpenAI key, Save, then Test. It needs a little credit on your OpenAI account (about 1 cent per few thousand characters) and has no daily cap. If it fails, Horizon falls back to the Android voice.']],
        ['V1.67.6', ['HTML SAVE: Save on an HTML page or SVG now puts the file in your phone\u2019s Downloads (Download/Horizon). It used to go to Documents/Horizon, so it never showed in Downloads. Needs the Android app rebuilt once.']],
        ['V1.67.5', ['GROUP CHAT FIX: starting or leaving a group no longer says "Horizon is busy". A stuck or slow reply (a dead provider) is stopped for you and the group starts.', 'CHAT BOX: your text now runs the full width, left to right, on its own row, with the buttons under it (plus and clip on the left, speaker, mic and send on the right).', 'LIGHT GREY: a bit darker, not too dark. Tool tiles and their icons are soft grey and soft green instead of hard black.', 'VOICES: Microsoft Edge and TTS.ai are removed. New Kokoro voices: 28 natural voices, no key, no limit, made on the phone itself. The first use downloads the voice model once (about 90 MB), then it works offline.']],
        ['V1.67.4', ['FOLD ALL: the Fold all and Unfold all button now stays on the right side of the action row, next to the speaker button, instead of sitting in the middle. Its label changes, but its right edge stays put.']],
        ['V1.67.3', ['TWO THEMES: Dark green and Dark purple are gone. Dark cyan stays as the main theme and Light grey is new. Pick one in Settings > PERSONALISATION > Theme or with the two dots under the Settings title. Old green and purple choices become Dark cyan.']],
        ['V1.67.2', ['FOLD ALL: a folded reply is now a small scroll window instead of a clipped one. Fold all keeps every long reply short in the chat, and you can still swipe inside one to read the whole thing. At its top or bottom the swipe carries on into the chat.']],
        ['V1.67.1', ['AI SHEET: tap the provider pill (in the header or on the welcome card) and pick a provider, then a model. Every model has a plain-English line under it. Providers with no key show their models too, with a Set API key box right there: paste, Save key, and it is checked and saved without leaving the sheet.', 'READ-ALOUD PILL: while a reply is read, its speaker button becomes a wide pill: the speaker icon on the left and a long 22-bar waveform beside it. Paused turns it amber with a pause icon.', '+ MENU: a tool that is on goes green all over (tile, icon and dot), off is black with a red dot, and the tile flips the moment you tap it instead of stalling. A tool that needs something no longer paints a red dot over an ON tile, which is why the Vault stayed red while it was locked.', 'MEMORY: the Memory tile no longer opens Settings. It flips the Auto-save switch directly.', 'KEYBOARD: the message box rides on top of the keyboard. Android now measures how much of the page the keyboard covers and the page shrinks to the visible area, so the box lifts like in the Claude app.']],
        ['V1.65.4', ['VOICE IN THE REPLY SPEAKER: the Voice pill at the bottom is gone. The waveform now replaces the speaker icon on the reply being read. Tap it to pause or resume, long-press to stop.', 'TOP PANEL: the usage badge moved up next to the provider pill, side by side. The arrow tab on the right middle is a little smaller.']],
        ['V1.67.0', ['HEADER: the Horizon chip is now a hamburger (long lines to short) that opens the Menu. Browser (blue) and AI Group Chat (green) sit next to it. A small vertical hamburger on the right opens Settings. The edge drawer and arrow tabs are gone. The provider is a pill with the name and tokens on one row and a green light running round its edge; while the AI writes, a small speaker pulses beside the tokens. GITHUB PUSH moved into the Menu panel. The reading bar on AI replies is green again and pulses.']],
        ['V1.66.0', ['NEW HEADER: Github Push sits next to the logo, then one diamond capsule with a spinning diamond, the provider, the status and the reply timer. A small wave runs beside the timer only while the AI is writing. EDGE: a small hamburger handle in the middle of the right edge opens a narrow, tall panel: Browser (blue), AI Group Chat (green), Settings and Menu (red, glowing). SNOOZE IS GONE. Downloads moved under Usage & Engine in Settings. Apps dock keeps Music, Terminal, Lens and YouTube. The + menu is all cyan with a green dot when a tool is on. The reading bar on AI replies is thin and soft. The connected-tool pills above the input are removed.']],
        ['V1.65.3', ['CYAN EDGE: the edge door and the right-middle settings tab are cyan now. The door drawer shrinks to its tiles instead of running the full height, and Menu and Settings sit at the bottom of it.']],
        ['V1.65.2', ['TERMINAL IS MORE ALIVE: the prompt has colours (user purple, host cyan, folder pink, $ green) and the first word of each command is bold white. Lines fade in, a colour sweep runs under the title bar and speeds up while a command runs, and the key rows are grouped by colour (arrows cyan, Ctrl purple, Esc and Tab amber, ^C and ^D red). Messages that start with an error, warning or ok are coloured. Opening the terminal shows three boot lines before the banner. Commands run exactly as before.']],
        ['V1.65.1', ['ABOUT FIX: About scrolls and taps again. Two settings added in V1.63.1 that could freeze it on some phones are removed.', 'GITHUB PUSH: the GitHub app is now called Github Push in the Apps panel, the Settings dock, the app window and the edge drawer, and the name fits its tile.']],
        ['V1.65.0', ['EDGE DOOR: the five header buttons moved into a drawer on the right edge. Menu and Settings sit side by side, then Snooze, Group, Browser, Terminal, Github Push and Downloads, each with its own colour. Drag the green door or tap it. Long-press the logo chip to switch back to the old header.']],
        ['V1.63.3', ['GEMINI CAN LISTEN IN CHAT: when Gemini is the one answering (alone or in a group chat) he is told he can hear, and he can use the listen tool himself with no switch. Ask him about the song that is playing and he cuts a clip and listens. The other AIs still need Let the chat AI ask him to listen, and in a group they are told to pass sound questions to @gemini.', 'LISTEN FIX: the listening step only uses a real Gemini model that takes audio. If the model you picked cannot, it retries once on gemini-2.5-flash, in the chat and in the player ear sheet.', 'LEAVE GROUP: a red Leave group button sits in the group bar. Tap it, pick which AI carries on, and the chat becomes a normal one-AI conversation. The history stays and the old group replies keep their names.']],
        ['V1.63.2', ['LAUNCH CRASH FIX: V1.63.1 closed straight after opening. LeakCanary, the heaviest part added in V1.63.0, is removed from the build. The /canary menu still opens but no longer watches anything.', 'CRASH REPORT: if Horizon crashes after it has started, the next launch shows a Horizon crashed last time box with the error and a Copy button, so the cause can be read on the phone without a computer.']],
        ['V1.63.1', ['BUILD FIX: the Android build no longer fails at the keyboard resize step. The old edit looked for the activity tag with a space after it, but Android writes a line break there, so nothing was changed and the check stopped the build. It now finds the right activity however it is laid out. Every check also prints what went wrong and the current manifest, and the APK check lists every missing plugin at once.', 'API KEYS: backup keys are now separate slots. Paste a key and it saves into its own slot, and the box empties for the next one. Each slot has its own health light and an X to delete it. A Test all keys button checks every slot, and the Test all button at the top still checks every provider. Your old saved backup keys show up as slots.', 'ABOUT: scrolls smoothly. The changelog shows the newest five versions and loads the older ones when you tap Show older versions.']],
        ['V1.63.0', ['POP-UP REPLIES: when Horizon finishes a reply while you are in another app, it now drops in front of the screen as a banner and makes the notification sound (it also vibrates). Android locks a notification channel\u2019s importance the first time it is made, so Horizon makes a new one, AI replies (pop-up + sound), and removes the old one. Progress lines such as Horizon is thinking stay silent on their own channel. Type /notif to send a test pop-up, check banner and sound, or jump to the channel settings. On Android 14, /notif also opens the Allow full-screen alerts switch so a reply can open over a locked screen.', 'KEYBOARD FREEZE: Android now tells Horizon the exact moment the keyboard starts and stops sliding, instead of Horizon guessing from resize events. While it slides the page does no layout work, the browser sends one position update (it used to send dozens), and a safety timer means the page can never stay stuck. If the keyboard is hidden with Back while the message box still had focus, the box lets go, so the next tap lifts the keyboard again.', 'COROUTINES + STRUCTURED CONCURRENCY: Horizon\u2019s background AI requests and media saves now run as Kotlin coroutines inside scopes owned by the service or plugin that started them. Every job has a time limit, one failure never cancels the others, the page is always told when a job is cancelled, and when the owner is destroyed all of its work is cancelled with it. A cancelled download stops at once and deletes the half-written file. No GlobalScope and no loose threads.', 'LEAKCANARY: watches every closed screen, service and plugin and, when one is still in memory five seconds after it should be gone, shows the chain of references holding it. Type /canary to open the leak list or switch it on and off. It pauses the phone for a second or two when it dumps memory, so switch it off for normal use.']],
        ['V1.62.0', ['EDGE VOICE: a keyless natural voice. Settings > Voice > Natural: Microsoft Edge. No key, no account, no daily limit, so it cannot run out of credit. 18 neural voices (US, South African, British, Australian) and six tone presets (Natural, Calm and warm, Upbeat, Bright, Deep narrator, Fast reader) that stack with your Speed and Pitch sliders and are applied by the voice itself, so it sounds clean. The text is sent to Microsoft. It is an unofficial route that the Edge browser itself uses, so if Microsoft changes it Horizon says why and falls back to the Android voice. Android app only.']],
        ['V1.61.0', ['DEBATE: in a group chat, tap Debate in the members bar and every AI critiques the others\u2019 replies (what they got right, wrong or missed). It uses the same [Name said] history, so it is one more round and Stop still ends it.', 'FREE ONLY: in the model picker for OpenRouter, a Free only switch hides the paid models and keeps the :free ones. It is remembered.', 'WHAT\u2019S THIS SONG?: the music notification has a new button. Tap it and Gemini listens to a clip of what is playing and answers in a notification, without opening the app. The red eye and your Gemini key still apply.', 'SAVE TO VAULT: under each of Gemini\u2019s song answers there is a Save to Vault button that files the answer as an encrypted Vault note. The answer from the notification waits for you in the Ask Gemini sheet.']],
        ['V1.60.1', ['TOOLS GRID: tiles are no longer highlighted green. A dot on the right of each tile shows the state: green = on, red = off or needs attention.']],
        ['V1.60.0', ['GROUP CHAT: a new Group tile at the top right. Pick two or more AIs and a model for each, and start a group chat. Every message is answered by each of them in turn, and they read each other\u2019s replies (shown to each as [Name said]). The members show as chips above the message box; tap one to @ it, or Edit to change the group.', 'SINGLE OUT ONE: type @ in the message box and the AI names pop up like the slash menu (@gemini, @groq, @openrouter ...). A message with an @name goes only to that AI, in any chat, even a normal one. @all wakes the whole group. Stop ends the rest of the round. Regenerate redoes a reply with the AI that wrote it.']],
        ['V1.59.0', ['OPENROUTER: a new AI provider. One key opens hundreds of models, including free ones (names ending in :free). Add the key in Settings > API PROVIDERS PLUS KEYS, pick OpenRouter in the AI sheet, or leave the model on openrouter/auto. It joins the backup-key and auto-switch rules like the others.', 'GEMINI EARS: Gemini can now hear the song that is playing. Tap the ear button on the now-playing bar, the mini player or the full player (Ask Gemini) and ask about the vibe, the beat, the vocals or the mix. A 30 s to 5 min clip is cut on the phone and sent to Google only when you tap Ask. Follow-up questions reuse what he heard; Listen again sends a fresh clip.', 'The chat AI can ask Gemini to listen too, but only after you switch on Let the chat AI ask him to listen in the sheet. The red eye still hides your music from every AI.']],
        ['V1.58.5', ['TOOLS GRID: the + menu now shows every tool at once as tiles, with no scrolling: Generators (Avatars, Memes, Visuals), then Think and look, Fetch, Make and Remember. Tap a tile to switch it, hold one to read its description and status in the strip at the bottom. Make PDF and the key checks show in that strip. The List view chip in the header brings the old list back.']],
        ['V1.58.4', ['PLACE TAG REMOVED: the place name no longer appears on your chat bubbles, the Show my place switch is gone from Personalisation, and Horizon no longer looks up your location for it or saves a place with each message. Your name tag, the DASH weather and the Location permission are unchanged. The old saved place name is deleted from this phone.']],
        ['V1.58.3', ['SNOOZE FIX: tapping Snooze no longer opens Android Settings. Location is the one permission an app cannot switch off, so Snooze now pauses it inside Horizon instead and Wake turns it back on.', 'LESS REDRAWING: the pulsing glow on the Settings AI button and the Browser button animated a big blurred shadow, which Android had to redraw on every frame. The glow now fades a ready-made layer instead (same look, almost no work), and it pauses while the keyboard is open or sliding.', 'LAG DETECTOR V2: /lag now shows which file and function made each slow frame, how the time splits between scripts and layout, and has test switches (header glow off, all animations off, shadows and filters off, hide messages, spellcheck off). A switch change starts a fresh measurement.']],
        ['V1.58.2', ['SMOOTHER TYPING: the message box no longer re-measures the whole page on every key, the link check and draft save wait for a longer pause (the draft is still saved when you leave the box or the app), and the music wave and background sweep rest while you type. Autocorrect and suggestions are switched back on for your keyboard.', 'KEYBOARD: Horizon now pins Android\u2019s resize mode and pauses the dashboard re-fit and message animations while the keyboard slides, then re-fits once.', 'LAG DETECTOR: type /lag to see the measured refresh rate, slow keys and what is blocking typing, with a Copy report button. Nothing is stored or sent.', '90 HZ: the app asks Android for a 90 Hz display mode. Android has the last word (Battery saver or a fixed 60 Hz setting wins).']],
        ['V1.58.1', ['VOICE SPACING: the TTS.ai and Pollinations key boxes in Settings > Personalisation now have a proper full-width field with room above and below, and the Save / Remove buttons are bigger and spaced apart. The speed and pitch sliders have more air too.']],
        ['V1.58.0', ['SETTINGS AI: a glowing AI button beside Settings opens an assistant that only talks about Horizon\u2019s settings and features (where things are, fixes, ideas to improve). No small talk. It never sees your keys, the Vault or Security pages. Matches all 3 themes.', 'TERMINAL AI MOVED INSIDE: the floating box is gone. The AI chat now sits docked in the terminal. The eye shows or hides the terminal output from the AI, the arrow minimizes the panel so the copy cards never crowd the terminal. Nothing moves or drags any more.']],
        ['V1.57.0', ['MODEL DESCRIPTIONS: every model in the AI picker now has a plain one-line description under its name (no category labels).', 'MARKDOWN BLOCKS: when the AI writes a Markdown document it arrives in one block with Copy, a Raw | Converted switch and Save (.md or .html). Copy always gives the raw text. Fences now nest properly and ~~~ works.']],
        ['V1.56.1', ['GROQ CAN SEE: Groq now counts as a vision provider (Qwen3.8 27B and Muse Spark, plus Llama 4). Pictures, PDFs and the Lens screenshot of the app go to a Groq vision model, so the AI sees the real UI. If your chosen Groq model cannot see, that turn quietly uses the Groq vision model. Max 3 pictures per Groq request.']],
        ['V1.56.0', ['NEW HEADER + SNOOZE SCREEN: the robot button is gone from the header. A provider pill now sits in the middle (status dot, logo, name, model); tap it for the AI sheet, which has a Set API key tab that opens the right key card. Snooze is now a full screen: moon, the robot with a 💤, your provider logos in one row and Strategy Over Impulse. Tap anywhere to wake.']],
        ['V1.55.0', ['GENERATORS RENAMED + MORE VISUALS: DiceBear is now Avatars, Meme is now Memes, p5.js is now Visuals. Visuals has 10 ready-made sketches (new: Starfield, Spirograph, Matrix rain, Bouncing balls, Kaleidoscope, Wave lines) and still runs your own code.']],
        ['V1.54.1', ['GENERATORS: the Create group in the + menu is now called Generators (DiceBear, Meme, p5.js).']],
        ['V1.54.0', ['TOOL DESCRIPTIONS BACK: every tool in the grouped + menu shows its full description under its name again, and DiceBear, Meme and p5.js are rows with a description and an arrow instead of three small buttons.']],
        ['V1.53.1', ['CREATE GROUP: DiceBear, Meme and p5.js now sit under their own Create heading at the top of the grouped Tools menu.']],
        ['V1.53.0', ['GROUPED + MENU: the Tools menu is now sorted into four groups: Think and look (Thinking, Screen, Lens, Browser eye), Fetch (Web, YouTube, GitHub, Music), Make (PDF, Image) and Remember (Vault, Memory). Nothing else about the tools changed.']],
        ['V1.52.0', ['VPN CHIP REMOVED: the green VPN badge above your chat bubbles is gone. The place name stays. The VPN status in DASH and Settings is untouched.']],
        ['V1.51.0', ['PLACE STAMPED WHEN YOU SEND: each message now keeps the place (and the VPN chip) it was sent from, saved with the chat. Old messages no longer change when you move. Messages sent before this version show no place. If no place is known yet, a new message shows the live state (Allow location, Location off, Locating) and tapping it retries.']],
        ['V1.50.0', ['PLACE ON YOUR MESSAGES FIXED: Horizon now asks Android for your location directly instead of leaning on the WebView prompt, so the red pin and place name can appear. If it cannot, the tag says why (Allow location, Location off, No location) and tapping it tries again or opens the Android settings page. New Location switch under Settings, Permissions. The DASH uses the same location. SQUARE STARTER TILES: the 4 tiles on the chat screen are squares now. Not tested on a device: the Java was not compiled here, so the CI build is the first compile.']],
        ['V1.49.0', ['CREATE STRIP IN THE + MENU: three new buttons under the Tools title. DiceBear makes an avatar from any seed (30 styles, background colour, corner radius, flip, 6 variations). Memegen makes a meme from a template with your own text (live template list, JPG, PNG, WebP or GIF, custom background link). p5.js runs a code-art sketch in a sealed frame (4 samples, edit the code, Run, Stop). Every result can be attached to your next message, copied or saved. No keys. p5.js needs the internet once, then it is kept on the phone.']],
        ['V1.48.0', ['TTS.AI VOICE: FreeTTS.ai is gone. Settings, Voice, Natural: TTS.ai uses their Kokoro voices (10 to pick from). It works with no key on their free tier (about 5,000 characters a day, 10 requests a minute). If you make a free account at tts.ai/account you can paste its key under Voice for higher limits. If it fails or runs out, replies fall back to the Android voice; Test tells you why. A saved FreeTTS.ai choice becomes TTS.ai.']],
        ['V1.47.0', ['PIPER REMOVED: the offline Piper voices and the sherpa-onnx engine are gone from the app. The APK is smaller and starts faster, and any Piper voice you downloaded is deleted on the next launch to free the space. If Piper was your voice, Horizon now uses the Android voice.','ANDROID SPEECH ENGINE: Settings, Voice, Android voice has a new Android speech engine list. Pick Google, Samsung or any speech-engine app you install (a Kokoro engine app shows up here too). Horizon only starts that engine while it reads and lets it go after a short idle, so no second app keeps running in the background.','TEST PLAYS THE VOICE YOU PICKED: Test now runs only the selected voice. If it has no key or fails, it says why instead of quietly playing a different voice. Replies still fall back to the Android voice.','THINKING TOGGLE: the line under Thinking (and the other tools) in the + menu is no longer cut off with dots. It wraps to show the whole sentence.','FASTER VOICE NOTES: the recording is sent to Groq as it is. Before, Horizon decoded it and rebuilt a bigger WAV first, which was slow on the phone. The WAV is only made when Gemini needs it.','LIGHTER IDLE: the music-wave animation and the background tidy-up now do almost nothing while nothing plays or the app is hidden.']],
        ['V1.46.0', ['TERMINAL AI BOX: an AI button in the Terminal bar opens a half-screen floating AI box. Every command it gives has COPY and a \u2192 $ button that drops it in your prompt (you press Enter; the AI never runs anything). Tap PINNED / MOVE to lock the box or drag it. OUT sends the last terminal output. HTML PREVIEW: Preview is now the big cyan button, kept apart from Save, with a fallback so the page always shows.']],
        ['V1.45.2', ['BIGGER TEXT: text across the whole app is about 12% bigger (chat, menus, Settings, hints, small print). The header buttons and the Terminal keep their sizes.']],
        ['V1.45.1', ['HEADER: the 5 buttons (Snooze, AI, Browser, Menu, Settings) are taller and a little wider, with bigger icons and white labels.']],
        ['V1.45.0', ['THREE THEMES ONLY: Dark cyan, Dark green and Dark purple. Light and the old Dark are gone, and your old choice becomes Dark cyan. Pick one in Settings (Theme) or with the three colour dots under the Settings title.','WHITE TEXT: text is now white everywhere (titles, Settings descriptions, hints, placeholders, small print) instead of dim grey. Every cyan glow, border and button follows the colour you picked.','YOUR MESSAGES: the place tag on the right edge always shows (suburb and city from your GPS, or No location / Locating if there is none) and a green VPN chip appears beside it when a VPN is on.']],
        ['V1.44.0', ['KOKORO REMOVED: the Kokoro offline voice is gone. Piper voices stay. If you had Kokoro downloaded, Horizon deletes it to free the space (about 330 MB).','FREETTS.AI VOICE: Settings, Voice, Natural: FreeTTS.ai. Paste the endpoint and your key from your FreeTTS.ai dashboard, tap Save, then Test. If it fails or runs out, Horizon switches to the Android voice and says why.','WHITE FLASH: the white screen that showed for a second when you left the app is fixed. The window behind the page now follows your theme (Light, Dark or Cyan).']],
        ['V1.43.4', ['WEATHER WIDGET: the date pill is black with white text.']],
        ['V1.43.3', ['WEATHER WIDGET: tapping the expand arrow now closes the open Menu tabs above it to make room, so it opens every time. Before, it stayed folded and dimmed until you closed the tabs yourself. Opening a tab later still folds the widget back down when there is no room.']],
        ['V1.43.2', ['YOUR BUBBLE: dark grey again in every theme (V1.42.0 had turned it cyan).','PROVIDER PILL (Gemini, bottom left): the sliding bar and pulsing dot now keep moving while a reply runs. The pill was being rebuilt every quarter second, which restarted them before they could show. Now only the clock text updates.']],
        ['V1.43.1', ['VOICE PILL: the moving waveform and the pulsing ring now run from JavaScript, so Android\u2019s reduce-motion / remove-animations setting can no longer freeze them. Playing shows moving bars and a pulse, loading shows a shimmering line, idle is a flat line.']],
        ['V1.43.0', ['APP LOCK: Settings, SECURITY, App lock. Lock Horizon with a 4 to 6 digit PIN and, if your phone has one, the fingerprint prompt. It locks on start and after 0, 1 or 5 minutes in the background, and Back cannot get past it. Optional: hide Horizon in recent apps (this also blocks screenshots).','LIVE NETWORK: Android now tells Horizon the moment Wi-Fi, mobile data or a VPN comes or goes, so the IP, the VPN badge and the weather update at once. DASH shows a Link row (Wi-Fi, Mobile data, offline, metered).','HONEST LIMIT: the lock keeps people out of Horizon on a phone you left unlocked. It does not encrypt the keys stored on the device.','Not tested: the native Kotlin (fingerprint prompt, network watcher) has not been compiled or run yet.']],
        ['V1.42.1', ['AI REPLIES: the date is gone from the provider line, so it shows only the time and seconds and no longer runs too long.','YOUR PLACE: your real place name now shows on the right edge of your messages with a red pin on the left. It comes from the phone GPS, so a VPN does not change it. Switch it off under Personalisation, Your name tag, Show my place.','NAME TAG: still renamed or switched off under Personalisation, Your name tag.']],
        ['V1.42.0', ['OPERATOR: your messages now carry a name tag on the left with the date and time. Rename it or switch it off under Personalisation, Your name tag.','YOUR BUBBLE: now uses the same cyan-on-ink colours as the AI side, in Light, Dark and Cyan.','EDIT AND DELETE: Edit is a small round button and Delete is a small X. Delete removes your message and the reply under it.','REGENERATE: sits next to Copy under every reply, not just the newest. Regenerating an older reply removes what came after it first.','RETRY: when a message fails, a Retry bar pops up with the reason and reruns the same message with its files. An unanswered message keeps a Retry button.','BOTTOM ROW: the provider pill (name, model, bars, tokens, time) moved to the left and VOICE to the right, same width and height.','FILES: files you send stay on the left and wrap, no more sliding sideways. BROWSER: the Strategy Over Impulse strip is no longer cut off at the bottom.']],
        ['V1.41.0', ['BOTTOM ROW: the usage badge (provider, model, tokens, time) moved under the message box on the right, with a new VOICE pill beside it. VOICE shows a flat line when idle and a moving waveform with a pulse while a reply is read aloud; tap it to stop.','WHO ANSWERED: every reply now starts with the provider logo, name and model, like a username. The repeated model and token line under replies is gone, and so is the repeated status line under the box.','REPLY PILLS: Copy and Regenerate (and Continue when a reply is cut off) sit on the left under the newest reply, read-aloud on the right.','THINKING: new brain switch at the top of the + menu. Gemini 2.5 and 3 get a real thinking budget (and show a reasoning summary in the thought process), Groq gpt-oss gets high effort, every other model is told to plan, check and fix before it answers.']],
        ['V1.40.0', ['SETTINGS: the X and the second HORIZON logo are gone (Back still works). The Settings title and the Theme icons share one row at the top, and the whole list fits the screen with no scrolling.','BROWSER: the Horizon browser is white in Light and black in Dark and Cyan, following the app theme.','AI SEES THE APP: with Screen on the AI also sees the browser, terminal and picker layers, the engine badge, now playing, downloads, DASH and Vault counts. It reads your Vault NOTES (full text), never AI keys, scraping keys, SSH keys or tokens.','TOAST: when the AI saves a note to the Vault or a fact to memory you get a toast (tap it to open the Vault). If it tried and could not (locked, off, looked like a key) you get a red toast saying why.','PLUS MENU: each tool shows live checks (key, file access, online, unlocked, repo pulled) with a tap-to-fix chip, plus a summary line. New switches: Memory, Lens and Browser eye.','CHAT: tidier spacing, pill-shaped chips and status line, buttons all one size, nothing overlaps.']],
        ['V1.38.3', ['HEADER: the 5 buttons (Snooze, AI, Browser, Menu, Settings) now sit on the Strategy Over Impulse line, on the right, with a label under each icon and more room between them. The header is shorter too.','MENU WIDGET: the weather and time widget folds into the small pill when an open tab (Chats, Prompt and Preferences, AI Memories, Archive) would run under it, and opens back up when there is room. The arrow still sets what you prefer.']],
        ['V1.38.2', ['SETTINGS: more breathing room between the rows.','CYAN: the Browser button in the header and the robot ready dot are cyan now. APPS tiles: Lens ring cyan, Downloads cyan, Music pink.']],
        ['V1.38.1', ['THEME: Light, Dark and Cyan icons now sit in the right panel, under the Settings title, one tap each. HEADER: the line under the title now says Strategy Over Impulse. The four round buttons top right are a little smaller, and the header no longer squashes the logo on narrow phones.', 'AI SEES THE WHOLE APP: with Screen on, the AI now gets a short map of every panel, tab, settings section and switch, including the ones that are closed. It stays hidden for keys, the Vault and chat text.', 'KEYBOARD: background animations and sweeps pause while you type, the message box resizes once per frame and the draft saves after a short pause.']],
        ['V1.37.2', ['RIGHT PANEL: all 6 APPS tiles now sit in one row.', 'API PROVIDERS: new Test all button runs the key health check on every provider in turn and lists the result. Each provider has a bigger icon, more room, and a soft cyan line under it so the list no longer runs together.']],
        ['V1.37.1', ['MISTRAL: Mistral Studio is now a chat provider next to Gemini, Groq and Cohere. Add your Studio API key under API PROVIDERS PLUS KEYS, pick a model from your key, switch it on.', 'Works in notifications and background replies, the Browser assistant, key health, usage and snooze fallback. New Mistral icon.']],
        ['V1.37.0', ['OFFLINE NEURAL VOICES: Voice settings has a new Offline neural option (Piper and Kokoro through sherpa-onnx). Download a voice once, then it reads replies with no internet.', 'Pick the voice and, for Kokoro, one of 11 speakers. Delete a voice any time to free space. If the offline voice fails, Horizon falls back to the Android voice and tells you why.', 'Needs a 64-bit phone. Speed works, pitch shifts speed a little.']],
        ['V1.36.0', ['BOJACK SECURITY: the header now says Bojack Security instead of AI APK. APPS tiles in the right panel are smaller, with a gap above them.', 'Chat bubble is dark grey. Plus (Tools) menu has coloured real icons.', 'Now playing has a live waveform in the strip, mini player and player card. Voice notes get a waveform that fills as they play (tap to seek).', 'KEY HEALTH: paste backup keys, then Check key health shows each key as live, limited or failing.', 'Browser: black and white theme (white in Light), and Gemini now rotates your backup keys and models instead of failing on one key.', 'Voice: pitch works on natural voices, first sound starts sooner. AI typing speed moved to PERSONALISATION. Terminal got the hacker neon look with a HUD.']],
        ['V1.35.1', ['SECURITY is now its own row in Settings, under HORIZON VAULT, with a red title. The SECURITY AND PRIVACY block (training switch and the live access list) moved there from ABOUT & UPDATES.']],
        ['V1.35.0', ['AI DOWNLOADS: with the YouTube button on, the AI can now search Audius, Internet Archive and Wikimedia Commons images, save direct https links and .torrent files, and send magnet links to your torrent app. Unknown links and magnets ask you first.', 'Torrents: Horizon has no torrent engine; magnets are handed to an installed torrent app.']],
        ['V1.34.0', ['TERMINAL (new tile in the apps dock): full screen, with Minimize (strip above the chat box) and Exit. Runs your commands on Horizon\u2019s own Android shell. Neon-green welcome, cyan prompt, CTRL keys, history and TAB completion.', 'APPS DOCK now has six tiles: GitHub, YouTube (red), Music, Lens, Downloads, Terminal.', 'yt-dlp is NOT in this build (planned).']],
        ['V1.33.0', ['HORIZON BROWSER (globe-style network button, top bar): native WebView tabs, DuckDuckGo toggles, the Eye, AI box with typewriter replies and a minimise widget.', 'The browser AI gets the LENS (a live map of the whole app, side panels included), and can play and control your music when you allow it.', 'ABOUT rebuilt: logo, developer disclosure, a short red SECURITY AND PRIVACY section with a Don\u2019t-send-my-data-for-training switch and a live access list.']],
        ['V1.32.0', ['DASH WIDGET at the bottom of the left menu: live time, the date, weather with colour (sun, clouds, rain, snow, storm, night), and your location. Tap the arrow to collapse it to a slim half-size widget (weather, time, date, place) or expand it for the rest.', 'RAM, STORAGE, BATTERY and CPU bars. On the Android app they show the whole phone; CPU shows Horizon\'s own share when Android hides the total.', 'IP and VPN: shows your current IP and VPN ON or OFF (Android reports it on the app). With a VPN on it shows where the IP appears and your real area (GPS if you allow it, otherwise your phone time zone), and the weather follows your real area.', 'CALENDAR: tap the date. Add notes to any day with an optional time and a reminder. When one is due Horizon posts it in the chat, and a phone notification fires if the app is closed. The AI can see your next two weeks of notes.', 'WAVEFORM: a small animated waveform sits next to the song title in the now-playing bar while music plays.']],
        ['V1.31.0', ['SEARCH ALL CHATS: the new box in the left menu, above Recent chats, looks inside every message of every chat. Type several words and a chat must contain all of them. Matches are highlighted, and tapping a result opens the chat at that message.', 'PIN a chat with the pin button on its row. Pinned chats stay at the top and are never dropped when old chats are trimmed.']],
        ['V1.30.0', ['EDIT a message you sent: tap the pencil under it, change the words, tap Save and resend. Replies after that message are replaced with a fresh answer.', 'REGENERATE the newest reply with the round arrow under it. It uses whichever AI and model is selected, so switch first to get a second opinion. If it is stopped or fails, your old reply comes back.', 'CONTINUE: when an AI stops because it hit its length limit, a Continue button appears and carries on in the same reply.']],
        ['V1.29.0', ['CODE & TEXT FILES: the paperclip now takes .sh .py .js .json .txt .log .csv .yml and .yaml. Drop a script in and ask for fixes.', 'Each file shows as a small coloured card with its type (SH, PY, JSON...). Tap it to peek at the text.', 'A renamed binary file is refused with a clear message instead of flooding the chat. Other files in the same pick still attach.']],
        ['V1.28.0', ['VOICE NOTES: tap the microphone on the right of the message box, talk, tap stop, then Send. Horizon turns it into text (Groq Whisper, Gemini as backup) so every AI can answer it.', 'The paperclip now sits inside the message box (it moved out of the + menu).', 'New AI robot on the provider button.']],
        ['V1.27.0', ['SLASH COMMANDS: type / in the message box. /model switches provider or model, /recon <target> runs a web recon sweep, /music <words> searches your player, and /web /yt /gh /eye /pdf /img /vault /screen flip the tool switches.']],
        ['V1.26.0', ['EXPORT & IMPORT in ABOUT & UPDATES: save chats, settings, Archive items and the encrypted Vault to one backup file, and restore from it. API keys stay out of the file unless you switch them on.']],
        ['V1.24.1', ['Roomier top bar (wider button spacing, more space under the status bar), taller engine badge with a larger model name, clearer status line under the composer.']],
        ['V1.24.0', ['SNOOZE (moon button, top bar): like airplane mode. Network off, access permissions off, your 4 AIs asleep. Waking restores your permissions.']],
        ['V1.23.0', ['DOWNLOADS app (Apps menu): one list for everything Horizon saves, with Open on finished files, Retry on failed ones, filters and live progress.', 'Get music, video, images, repo .zip files, torrent links and any direct link: Audius, Internet Archive, Wikimedia Commons, GitHub and GitLab.', 'Quick picks in the YouTube terminal can be added to (+), replaced and removed.', 'Fixes \"Not one of standard directories: Music/Horizon\" on YouTube saves.']],
        ['V1.22.0', ['Rate limit rescue: backup keys per provider, then auto-switch to the next provider that has a key (switch in API PROVIDERS PLUS KEYS).', 'Provider logos redrawn to match the Play Store tiles.']],
        ['V1.21.1', ['Music and video downloads save through Android MediaStore (Music/Horizon, Movies/Horizon). Fixes "open failed: ENOENT" on Android 14.', 'Download errors now list every place that was tried.']],
        ['V1.21.0', ['ARCHIVE (left menu): upload PDF, DOCX, MD, TXT, CSV, JSON, HTML and images, save links and notes. Horizon reads the passages that match each message.', 'Provider logos for Gemini, Groq, Cohere and Pollinations in the robot picker, chips and settings.', 'Smaller settings rows so the whole list fits without scrolling.']],
        ['V1.20.0', ['LENS (Apps menu): the AI sees the whole UI, not only the screen: full UI map, real screenshot, auto problem check.', 'Compact usage badge with a mini bar trace of recent reply times.']],
        ['V1.19.0', ['ABOUT & UPDATES page: version, changelog, release check.', 'Privacy awareness text with a reminder switch.']],
        ['V1.18.0', ['Enter adds a new line, Back steps up one menu.', 'USAGE & ENGINE dashboard and live provider badge.']],
        ['V1.17.0', ['Read-aloud keeps going in the background.', 'Reply from the notification.']],
        ['V1.16.0', ['Attach files (images, PDF, DOCX, MD, HTML).', 'Screen switch for the AI.']]
    ];
    var warned = {}, checking = false, result = '', resultBad = false;

    function lsGet() { try { return localStorage.getItem(LSK); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(LSK, v); } catch (e) { /* ignore */ } }
    var LSN = 'horizon_no_train';
    function noTrain() { return lsGetK(LSN) !== '0'; }
    function lsGetK(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    var okSent = {};
    /* Asks once per provider per session while the switch is on. Cannot change a provider's own policy. */
    function allow(id, name) {
        if (!noTrain() || okSent[id]) return true;
        var yes = false;
        try { yes = window.confirm('Send to ' + name + '?\n\n"Don\u2019t send my data for training" is ON. Horizon never trains on your data, but ' + name + ' has its own terms and may keep prompts. Send anyway?'); } catch (e) { yes = true; }
        if (yes) okSent[id] = 1;
        return yes;
    }
    function noticeOn() { return lsGet() !== '0'; }
    function el(t, c, x) { var n = document.createElement(t); if (c) n.className = c; if (x != null) n.textContent = x; return n; }
    function vnum(v) { return String(v).replace(/^[^0-9]*/, '').split('.').map(function (x) { return parseInt(x, 10) || 0; }); }
    function newer(a, b) { var x = vnum(a), y = vnum(b); for (var i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); } return false; }

    function getJSON(url) {
        var ctl = typeof AbortController === 'function' ? new AbortController() : null;
        var to = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
        return fetch(url, ctl ? { signal: ctl.signal, headers: { Accept: 'application/vnd.github+json' } } : {}).then(function (r) {
            clearTimeout(to);
            return r.json().then(function (j) { return { status: r.status, ok: r.ok, json: j }; });
        }, function (e) { clearTimeout(to); throw e; });
    }
    function check() {
        if (checking) return;
        checking = true; result = ''; render();
        getJSON(REPO_API + '/releases/latest').then(function (r) {
            if (r.ok && r.json && r.json.tag_name) return r.json.tag_name;
            return getJSON(REPO_API + '/tags?per_page=20').then(function (t) {
                if (t.ok && Array.isArray(t.json) && t.json.length) {
                    var best = t.json.map(function (x) { return x.name; }).reduce(function (a, b) { return newer(b, a) ? b : a; });
                    return best;
                }
                return '';
            });
        }).then(function (tag) {
            if (!tag) { result = 'No published release found. You are on ' + VERSION + '.'; resultBad = false; }
            else if (newer(tag, VERSION)) { result = 'New version available: ' + tag + ' (you have ' + VERSION + ').'; resultBad = true; }
            else { result = 'You are up to date (' + VERSION + ').'; resultBad = false; }
        }, function (e) {
            result = (e && e.name === 'AbortError') ? 'Timed out. Check your connection.' : 'Could not check right now. Try again later.'; resultBad = true;
        }).then(function () { checking = false; render(); });
    }

    function sec(title) { var s = el('section', 'hza-sec'); s.appendChild(el('h4', 'hza-h', title)); return s; }
    function para(t) { return el('p', 'hza-p', t); }

    /* ---- V1.26.0: EXPORT & IMPORT (one JSON file; localStorage + Archive items) ---- */
    var BK_FORMAT = 1;
    var BK_OK = /^(horizon|ember)_/;
    var BK_NEVER = /^(horizon_snooze|horizon_snooze_snap|horizon_vault_fail)$/;
    var BK_SECRET = /^horizon_(key_|xkeys_|webkey_)|^horizon_gh_token$|_key$/;
    var ARCH_DB = 'horizon_archive_db', ARCH_STORE = 'items';
    var withKeys = false, bkMsg = '', bkBad = false, bkBusy = false, pending = null;

    function openArch() {
        return new Promise(function (res) {
            try {
                if (!window.indexedDB) { res(null); return; }
                var r = indexedDB.open(ARCH_DB, 1);
                r.onupgradeneeded = function () { if (!r.result.objectStoreNames.contains(ARCH_STORE)) r.result.createObjectStore(ARCH_STORE, { keyPath: 'id' }); };
                r.onsuccess = function () { res(r.result); };
                r.onerror = function () { res(null); };
            } catch (e) { res(null); }
        });
    }
    function archAll() {
        return openArch().then(function (d) {
            if (!d) return [];
            return new Promise(function (res) {
                var out = [];
                function done() { try { d.close(); } catch (e) { /* ignore */ } res(out); }
                try {
                    var t = d.transaction(ARCH_STORE, 'readonly');
                    var q = t.objectStore(ARCH_STORE).openCursor();
                    q.onsuccess = function () { var c = q.result; if (c) { out.push(c.value); c.continue(); } };
                    t.oncomplete = done; t.onerror = done; t.onabort = done;
                } catch (e) { done(); }
            });
        });
    }
    function archPut(list) {
        if (!list.length) return Promise.resolve(0);
        return openArch().then(function (d) {
            if (!d) return 0;
            return new Promise(function (res) {
                var n = 0;
                function done() { try { d.close(); } catch (e) { /* ignore */ } res(n); }
                try {
                    var t = d.transaction(ARCH_STORE, 'readwrite');
                    var st = t.objectStore(ARCH_STORE);
                    list.forEach(function (it) { st.put(it); n++; });
                    t.oncomplete = done;
                    t.onerror = function () { n = 0; done(); };
                    t.onabort = function () { n = 0; done(); };
                } catch (e) { n = 0; done(); }
            });
        });
    }
    function collect() {
        var ls = {}, n = 0, skipped = 0;
        try {
            for (var i = 0; i < localStorage.length; i++) {
                var k = localStorage.key(i);
                if (!k || !BK_OK.test(k) || BK_NEVER.test(k)) continue;
                if (!withKeys && BK_SECRET.test(k)) { skipped++; continue; }
                ls[k] = localStorage.getItem(k); n++;
            }
        } catch (e) { /* storage blocked */ }
        return archAll().then(function (arch) { return { ls: ls, arch: arch, n: n, skipped: skipped }; });
    }
    function plug(name) {
        try {
            var c = window.Capacitor;
            if (!c || typeof c.isNativePlatform !== 'function' || !c.isNativePlatform()) return null;
            if (c.Plugins && c.Plugins[name]) return c.Plugins[name];
            if (typeof c.registerPlugin === 'function') return c.registerPlugin(name);
        } catch (e) { /* no native bridge */ }
        return null;
    }
    function toB64(blob) {
        return new Promise(function (res, rej) {
            var r = new FileReader();
            r.onload = function () { res(String(r.result).split(',')[1]); };
            r.onerror = function () { rej(r.error); };
            r.readAsDataURL(blob);
        });
    }
    function saveBackup(blob, fname) {
        var FS = plug('Filesystem');
        if (!FS) {
            var a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = fname;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 60000);
            return Promise.resolve('browser downloads/' + fname);
        }
        return toB64(blob).then(function (data) {
            var targets = [
                { directory: 'DOCUMENTS', path: 'Horizon/' + fname, label: 'Documents/Horizon/' + fname },
                { directory: 'EXTERNAL', path: 'Horizon/' + fname, label: 'app storage/Horizon/' + fname }
            ];
            var firstErr = '';
            return targets.reduce(function (chain, t) {
                return chain.then(function (done) {
                    if (done) return done;
                    return FS.writeFile({ path: t.path, data: data, directory: t.directory, recursive: true }).then(function () { return t.label; }, function (e) { if (!firstErr) firstErr = (e && e.message) || String(e); return ''; });
                });
            }, Promise.resolve('')).then(function (where) {
                if (!where) throw new Error('Could not write the file. ' + firstErr);
                return where;
            });
        });
    }
    function stamp() {
        var d = new Date(), p = function (x) { return String(x).padStart(2, '0'); };
        return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
    }
    function plural(n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); }

    function doExport() {
        if (bkBusy) return;
        bkBusy = true; bkMsg = ''; pending = null; render();
        collect().then(function (c) {
            var payload = { app: 'horizon', format: BK_FORMAT, version: VERSION, created: new Date().toISOString(), includesKeys: withKeys, ls: c.ls, archive: c.arch };
            var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
            return saveBackup(blob, 'horizon-backup-' + stamp() + '.json').then(function (where) {
                bkMsg = 'Saved to ' + where + '. ' + plural(c.n, 'entry') + ' and ' + plural(c.arch.length, 'Archive item') + '.' + (c.skipped ? ' ' + plural(c.skipped, 'key') + ' left out.' : '');
                bkBad = false;
            });
        }).catch(function (e) {
            bkMsg = 'Export failed: ' + ((e && e.message) || e); bkBad = true;
        }).then(function () { bkBusy = false; render(); });
    }

    function parseBackup(text) {
        var j;
        try { j = JSON.parse(text); } catch (e) { throw new Error('That file is not a Horizon backup (not valid JSON).'); }
        if (!j || j.app !== 'horizon' || !j.ls || typeof j.ls !== 'object') throw new Error('That file is not a Horizon backup.');
        if (Number(j.format) > BK_FORMAT) throw new Error('This backup was made by a newer Horizon. Update the app first.');
        var ls = {}, n = 0;
        Object.keys(j.ls).forEach(function (k) {
            if (typeof j.ls[k] === 'string' && BK_OK.test(k) && !BK_NEVER.test(k)) { ls[k] = j.ls[k]; n++; }
        });
        var arch = Array.isArray(j.archive) ? j.archive.filter(function (x) { return x && typeof x === 'object' && typeof x.id === 'string' && x.id; }) : [];
        var chats = 0;
        try { var c = JSON.parse(ls.horizon_chats || '[]'); if (Array.isArray(c)) chats = c.length; } catch (e) { /* ignore */ }
        if (!n && !arch.length) throw new Error('That backup is empty.');
        return { ls: ls, arch: arch, n: n, chats: chats, created: j.created || '', version: j.version || '', keys: !!j.includesKeys };
    }
    function readBackup(f) {
        bkMsg = ''; pending = null;
        if (f.size > 80 * 1048576) { bkMsg = 'That file is too large to be a Horizon backup.'; bkBad = true; render(); return; }
        var r = new FileReader();
        r.onload = function () {
            try { pending = parseBackup(String(r.result)); } catch (e) { bkMsg = e.message; bkBad = true; }
            render();
        };
        r.onerror = function () { bkMsg = 'Could not read that file.'; bkBad = true; render(); };
        r.readAsText(f);
    }
    function mergeChats(cur, inc) {
        try {
            var a = JSON.parse(cur), b = JSON.parse(inc);
            if (!Array.isArray(a) || !Array.isArray(b)) return inc;
            var by = {};
            a.concat(b).forEach(function (c) {
                if (!c || c.id == null) return;
                var o = by[c.id];
                if (!o || (Number(c.updated) || 0) >= (Number(o.updated) || 0)) by[c.id] = c;
            });
            return JSON.stringify(Object.keys(by).map(function (k) { return by[k]; }).sort(function (x, y) { return (Number(y.updated) || 0) - (Number(x.updated) || 0); }));
        } catch (e) { return inc; }
    }
    function mergeIdx(cur, inc) {
        try {
            var a = JSON.parse(cur), b = JSON.parse(inc);
            if (!Array.isArray(a) || !Array.isArray(b)) return inc;
            return JSON.stringify(a.concat(b.filter(function (x) { return a.indexOf(x) < 0; })));
        } catch (e) { return inc; }
    }
    function applyBackup() {
        var b = pending;
        if (!b || bkBusy) return;
        bkBusy = true; render();
        var ok = 0, fail = 0;
        Object.keys(b.ls).forEach(function (k) {
            try {
                var v = b.ls[k], cur = localStorage.getItem(k);
                if (cur != null && k === 'horizon_chats') v = mergeChats(cur, v);
                else if (cur != null && k === 'horizon_att_idx') v = mergeIdx(cur, v);
                localStorage.setItem(k, v); ok++;
            } catch (e) { fail++; }
        });
        archPut(b.arch).then(function (na) {
            pending = null; bkBusy = false;
            bkBad = fail > 0 || (b.arch.length > 0 && !na);
            bkMsg = 'Restored ' + plural(ok, 'entry') + ' and ' + plural(na, 'Archive item') + '.' + (fail ? ' ' + plural(fail, 'entry') + ' did not fit in storage.' : '') + ' Restarting Horizon...';
            render();
            setTimeout(function () { try { location.reload(); } catch (e) { /* ignore */ } }, 1400);
        });
    }
    function pickFile() {
        var inp = document.createElement('input');
        inp.type = 'file'; inp.accept = '.json,application/json,text/plain'; inp.style.display = 'none';
        inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.remove(); if (f) readBackup(f); });
        document.body.appendChild(inp); inp.click();
    }
    function backupSection() {
        var s = sec('BACKUP: EXPORT & IMPORT');
        s.appendChild(para('Save your chats, settings, saved attachments, Archive items and Vault (still encrypted) to one file, or bring them back from one. The file stays on this device until you move it. The music library scan and downloaded GitHub repos are not included; they rebuild from your phone and GitHub.'));

        var row = el('button', 'hza-tog'); row.type = 'button';
        row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(withKeys));
        var tx = el('span', 'hza-tog-t');
        tx.appendChild(el('b', null, 'Include API keys'));
        tx.appendChild(el('small', null, 'Off by default. When on, the file holds your provider, search and GitHub keys in plain text, so keep it private.'));
        row.appendChild(tx);
        row.appendChild(el('span', 'hza-sw ' + (withKeys ? 'on' : 'off'), withKeys ? 'ON' : 'OFF'));
        row.addEventListener('click', function () { withKeys = !withKeys; render(); });
        s.appendChild(row);

        var ex = el('button', 'hza-btn', bkBusy && !pending ? 'Working...' : 'Export backup');
        ex.type = 'button'; ex.disabled = bkBusy; ex.addEventListener('click', doExport);
        s.appendChild(ex);
        var im = el('button', 'hza-btn', 'Import backup');
        im.type = 'button'; im.disabled = bkBusy; im.addEventListener('click', pickFile);
        s.appendChild(im);

        if (pending) {
            var card = el('div', 'hza-card');
            card.appendChild(el('b', null, 'Restore this backup?'));
            var when = '';
            try { if (pending.created) when = new Date(pending.created).toLocaleString(); } catch (e) { /* ignore */ }
            card.appendChild(el('p', 'hza-p', (when ? 'Made ' + when : 'Backup') + (pending.version ? ' in Horizon ' + pending.version : '') + ': ' + plural(pending.chats, 'chat') + ', ' + plural(pending.arch.length, 'Archive item') + ', ' + plural(pending.n, 'saved entry') + ' in all. API keys ' + (pending.keys ? 'are included.' : 'are not included, so your current keys stay.')));
            card.appendChild(el('p', 'hza-p', 'Chats are merged with the ones on this phone. Everything else in the file replaces what is here now, including the Vault, so use the passphrase you had when you exported. Horizon restarts when it is done.'));
            var two = el('div', 'hza-two');
            var go = el('button', 'hza-btn', bkBusy ? 'Restoring...' : 'Restore'); go.type = 'button'; go.disabled = bkBusy; go.addEventListener('click', applyBackup);
            var no = el('button', 'hza-btn alt', 'Cancel'); no.type = 'button'; no.disabled = bkBusy; no.addEventListener('click', function () { pending = null; render(); });
            two.appendChild(go); two.appendChild(no);
            card.appendChild(two);
            s.appendChild(card);
        }
        if (bkMsg) s.appendChild(el('p', 'hza-res' + (bkBad ? ' flag' : ''), bkMsg));
        return s;
    }


    function render() {
        var root = document.getElementById('hzAbout');
        if (!root) return;
        var f = document.createDocumentFragment();

        /* 1. logo + tagline */
        var hero = el('div', 'hza-hero');
        var img = document.createElement('img'); img.src = 'icon.png'; img.alt = 'Horizon'; img.className = 'hza-logo';
        hero.appendChild(img);
        hero.appendChild(el('div', 'hza-name', 'HORIZON'));
        hero.appendChild(el('div', 'hza-tag', 'Strategy over impulse.'));
        f.appendChild(hero);

        /* 2. developer disclosure */
        var dv = el('div', 'hza-dev');
        dv.appendChild(el('b', null, 'Developer: Grant Phil Festers'));
        dv.appendChild(el('span', null, 'Disclosure: independent, self-funded app. Horizon has no server of its own.'));
        f.appendChild(dv);

        /* 3. security and privacy now lives in Settings > SECURITY (V1.35.1) */

        /* 4. updates: version + release check (kept) */
        var a = sec('VERSION & UPDATES');
        a.appendChild(el('div', 'hza-ver', 'Horizon ' + VERSION));
        a.appendChild(para('A clean Android AI chat app. Gemini, Groq, Cohere or free Pollinations, one at a time.'));
        var b = el('button', 'hza-btn', checking ? 'Checking...' : 'Check for new release');
        b.type = 'button'; b.disabled = checking; b.addEventListener('click', check);
        a.appendChild(b);
        if (result) a.appendChild(el('p', 'hza-res' + (resultBad ? ' flag' : ''), result));
        f.appendChild(a);

        f.appendChild(backupSection());

        /* V1.63.1: the changelog used to put every version (about 80 long entries) into the page at once, which made the
           About screen heavy to scroll. Now the newest few show and the rest load when asked for. */
        var c = sec('CHANGELOG');
        function logBox(e) {
            var box = el('div', 'hza-log');
            box.appendChild(el('b', null, e[0]));
            var ul = el('ul');
            e[1].forEach(function (x) { ul.appendChild(el('li', null, x)); });
            box.appendChild(ul);
            return box;
        }
        var SHOWN = 5;
        LOG.slice(0, SHOWN).forEach(function (e) { c.appendChild(logBox(e)); });
        if (LOG.length > SHOWN) {
            var more = el('button', 'hza-btn alt', 'Show older versions (' + (LOG.length - SHOWN) + ')');
            more.type = 'button';
            more.addEventListener('click', function () {
                var rest = document.createDocumentFragment();
                LOG.slice(SHOWN).forEach(function (e) { rest.appendChild(logBox(e)); });
                c.insertBefore(rest, more);
                more.remove();
            });
            c.appendChild(more);
        }
        f.appendChild(c);

        /* data-training reminder moved into SECURITY AND PRIVACY above; the notice() reminder below still runs while its key is on */

        root.replaceChildren(f);
    }

    /* Settings > SECURITY page (V1.35.1): the old SECURITY AND PRIVACY block from ABOUT, moved. */
    function renderSecurity() {
        var root = document.getElementById('hzSecurity');
        if (!root) return;
        var p = sec('SECURITY AND PRIVACY');
        p.firstChild.className = 'hza-h red';
        p.appendChild(para('Nothing goes to the developer and nothing is used to train any Horizon model. Messages go straight from this device to the provider you pick. Free tiers may keep prompts or train on them, and Horizon cannot change that.'));
        var row = el('button', 'hza-tog'); row.type = 'button';
        row.setAttribute('role', 'switch'); row.setAttribute('aria-checked', String(noTrain()));
        var tx = el('span', 'hza-tog-t');
        tx.appendChild(el('b', null, 'Don\u2019t send my data for training'));
        tx.appendChild(el('small', null, 'ON: Horizon asks before the first message to each provider each session. It cannot override a provider\u2019s own policy.'));
        row.appendChild(tx);
        row.appendChild(el('span', 'hza-sw ' + (noTrain() ? 'on' : 'off'), noTrain() ? 'ON' : 'OFF'));
        row.addEventListener('click', function () { try { localStorage.setItem(LSN, noTrain() ? '0' : '1'); } catch (e) { /* ignore */ } okSent = {}; renderSecurity(); });
        p.appendChild(row);
        var perm = (window.HorizonBrowser && HorizonBrowser.perm) ? HorizonBrowser.perm() : null;
        var lensMode = (window.HorizonLens && HorizonLens.mode) ? HorizonLens.mode() : 'auto';
        var acc = el('div', 'hza-acc');
        acc.appendChild(el('b', 'hza-acc-h', 'SECURITY ACCESS (what the AI can reach)'));
        [
            ['Vault, API keys, passwords', 'NEVER', 0],
            ['UI Lens (app + side panels)', lensMode === 'off' ? 'OFF' : lensMode.toUpperCase(), lensMode === 'off' ? 0 : 1],
            ['Browser Eye (pages you open)', perm ? (perm.eye ? 'ON' : 'BLOCKED') : 'n/a', perm && perm.eye ? 1 : 0],
            ['Browser Lens', perm ? (perm.lens ? 'ON' : 'OFF') : 'n/a', perm && perm.lens ? 1 : 0],
            ['Music control', perm ? (perm.music ? 'ALLOWED' : 'OFF') : 'n/a', perm && perm.music ? 1 : 0]
        ].forEach(function (r) {
            var li = el('div', 'hza-acc-r');
            li.appendChild(el('span', null, r[0]));
            li.appendChild(el('em', r[2] ? 'on' : 'off', r[1]));
            acc.appendChild(li);
        });
        p.appendChild(acc);

        root.replaceChildren(p);
    }

    function warn(id, name, notice) {
        if (!noticeOn() || warned[id]) return;
        warned[id] = 1;
        notice('Reminder: your messages go to ' + name + '. Its own terms decide whether they are kept or used for training.');
    }

    window.HzAbout = { open: render, openSecurity: renderSecurity, warn: warn, allow: allow, version: VERSION };
})();
