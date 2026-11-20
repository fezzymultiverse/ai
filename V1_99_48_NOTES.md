# V1.99.48 - HORIZON RADIO

New: www/horizon_radio.js, www/horizon_radio.css
Changed: index.html (css/script tags, #hzRadio above the weather card, Radio menu item under Artifacts, tool-result wording), horizon_dash.js (radio tags in SCHEDULE_SRC, HorizonDash.place(), weather card never auto-folds), horizon_toolpolicy.js (radio row), horizon_about.js.

- Widget: walnut + brass radio above the weather card. Speaker grille pulses with the sound, amber dial with needle, scope wave, tuning knob (drag), prev/next, volume, 5 presets (hold to save), star to save, fold button.
- Find: country, town, "Near me" or station name. Source: radio-browser.info; town->country via open-meteo geocoding. Local first, then region, then national. https streams preferred.
- Frequencies: read from the station name only (FM/AM). Internet-only stations show NET. Nothing invented.
- Player: own HTMLAudio, 3 connection attempts, auto-reconnect x3, media-session controls, pauses the music player and stops if music starts. Wave is real when the stream allows analysis, otherwise labelled SIM WAVE.
- AI tags (colon + argument always): [[radio.find: Cape Town, South Africa]] / [[radio.find: here]], [[radio.play: 3]] or a name, [[radio.stop: now]], [[radio.vol: 0-100]], [[radio.now: status]]. Station names are stripped of tag brackets and results are marked untrusted.
- Weather card: stays expanded (chevron still folds it by hand); the Menu header is pinned and the tabs scroll above the dock.
