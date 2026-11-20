# Horizon V1.99.46 — music visualiser
- New www/horizon_viz.js: canvas spectrum replaces the plain bar strip in the right-panel player card and the Music tab player card.
- 56 glowing mirrored bars (accent > violet > pink per bar), halo glow, soft reflection, falling peak caps, kick pulse behind the bars, sparks flying up on the beat, glowing baseline.
- Bass bars hit on the kick, mids on the snare, highs shimmer on the hats. Tempo (96-132 BPM) comes from the song title, so each song looks different.
- Motion is synthesised from the clock: the phone plays audio natively, so there is no stream to read, and hooking the player could mute it. It is not a true analyser.
- Runs only while a song plays and the card is on screen, ~40 fps; paused/hidden/keyboard-open stops it; reduced-motion gets one still frame; paused track shows a calm resting bar line.
- Old bar strip stays in the DOM (hidden), so nothing else breaks.
- Files: www/horizon_viz.js (new), www/index.html, www/horizon_app.css (appended), www/horizon_about.js, tests (cache-bust).
- Checked: predeliver 110 pass, 0 fail; headless render with the playing state faked. NOT tested with real playback on the phone or the Music tab card.
