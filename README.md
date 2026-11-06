<p align="center">
  <img src="resources/icon.png" alt="Horizon" width="128">
</p>

<h1 align="center">HORIZON</h1>

<p align="center">A clean Android AI chat app built with Capacitor. Gemini or Groq, one at a time, no fallback chains. V1.3.0 turns Settings into a three-row list, adds a PERMISSIONS panel with red/green switches, and adds a YouTube music feature: ask the AI about music, ask it to download, and watch progress in a Downloads box.</p>

<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-00e5ff"></a>
  <img alt="Platform: Android" src="https://img.shields.io/badge/platform-Android-000000">
  <img alt="Capacitor 6" src="https://img.shields.io/badge/Capacitor-6-00e5ff">
</p>

## What's new in V1.6.0

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

- **+ button** left of the message box opens the Tools menu (Web, YouTube, PDF switches, green on / red off). Web and YouTube are per chat; PDF is global. New chats start with Web on.
- **Sources used** strip under any reply that searched or scraped, with tappable domain chips. Every reply also carries a small provider logo with its name and model.
- **Free-text replies**: Horizon types straight onto the page, no chat bubble. Tap a reply while it types to skip to the end. Each reply shows how long it took.
- **999 persona**: street-smart, empathetic, slightly dark humour, real advice, sharp wording, substantial replies. Built in, editable.
- **Right panel (Settings)**, with the Horizon name and logo in the top corner, is a list of three rows. Tap one to go straight in:
  - **API PROVIDERS PLUS KEYS**: Gemini and Groq cards. Keys are validated against the provider before they are saved and the model list is pulled live. One provider is active at a time, no fallback chains.
  - **WEB SCRAPING**: SerpAPI (search), Firecrawl (search + scrape), ScraperBee / ScrapingBee (scrape) and Browserless (scrape). Each has a key box, an on/off switch and a validate button. Horizon is told exactly which ones are live and calls them itself.
  - **PERMISSIONS**: five switches (see below) plus the **YouTube music source** box.
- **Left panel** has three horizontal tabs:
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
