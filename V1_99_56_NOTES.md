# Horizon V1.99.56 - DIAGRAM + PAGE VIEWER, APIZONE PROVIDER STATUS

Includes everything in V1.99.55. Nothing removed.
New: www/horizon_docview.js, www/horizon_docview.css, tests/docview-v56.test.cjs. Changed: www/horizon_usage.js, www/index.html (one script tag),
www/horizon_about.js (version + changelog), tests/chatbox-v55.test.cjs (accepts V1.99.55 or V1.99.56), Horizon-preview.html.

## 1. Mermaid document viewer
- Any ```mermaid block (or an unlabelled block that starts like a diagram: graph, flowchart, sequenceDiagram, classDiagram, erDiagram, gantt, pie, mindmap, ...) gets PREVIEW and SAVE in its header.
- Preview opens full screen: pinch to zoom, drag, double tap to fit / 100%, Light and Dark, Diagram / Source tabs, Copy source. A bad diagram shows Mermaid's error and the source.
- Save as: .svg, .png or .mmd. Text goes to Downloads/Horizon (falls back to Documents/Horizon); PNG goes to Documents/Horizon (then app storage); browser download in a normal browser.
- Drawn by the bundled Mermaid in a sandboxed frame (strict mode, no network) and shown as an image. Nothing from the AI's text runs inside Horizon.

## 2. HTML and SVG
- ```html blocks already had Preview + Save (V1.46.0, scripts run). Unchanged.
- Forge artifact cards (type mermaid / html / svg) now have an OPEN button. Mermaid opens the new viewer; html / svg open the full screen preview (the small in-card preview blocks scripts on purpose).

## 3. APIzone provider status (USAGE & ENGINE panel)
- New section PROVIDER STATUS (APIZONE): UP / DEGRADED / DOWN for each of your AIs that APIzone monitors, with latency. Source GET https://apizone.io/api/v1/status (no key, 60 requests/minute per IP).
- Fetched when the panel opens (at most every 5 minutes) or with Refresh provider status. AIs APIzone does not monitor are simply not listed.

## Tested
node --check on every www/*.js, inline-script check, all tests (8 new, 165 pass / 0 fail). The viewer was also run in headless Chromium: render, Dark, Source tab, Save sheet, PNG draw, close, unlabelled diagram.

## NOT verified (needs the phone)
- Real saves to Downloads/Documents on the Honor X5b, and the Android Back button while the viewer is open (same history trick as the HTML preview).
- APIzone's exact JSON field names. The parser accepts several shapes (array, services/apis/data/items, or a map) but was tested on made-up samples, not the live reply. If the section says "None of your AIs are on the APIzone list", send me the output of https://apizone.io/api/v1/status and I will match it exactly.
- APIzone matching is by AI id / name. An AI listed there under a different name will not show.

## Known flaky test (not caused by this change)
tests/people-hub.test.cjs "v1.99.7: @tag makes a guest for one reply" fails occasionally when run in parallel; it passes alone.
