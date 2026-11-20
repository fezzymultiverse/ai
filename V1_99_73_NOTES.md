# V1.99.73 - Where you are, six tiles in a row, maps card back, visualiser, pink pulse

Changed: www/horizon_maps.css, www/horizon_maps.js, www/horizon_app.css (block appended at the end), www/horizon_viz.js, www/horizon_toolpolicy.js, www/index.html, www/horizon_about.js, www/horizon_release.js. New: www/horizon_locate.js.

- Chat map card: back to how it was before V1.99.68 (full width of the chat, 230px map). The 86% / 330px / 310px rule is removed.
- Chats tab: the Radio card under Artifacts is removed. The Radio widget at the bottom of the left panel is untouched; HorizonRadio.open() still exists.
- Right panel APPS: one row of six - Maps, Stats, RSS, Lens, Music, Downloads. YouTube leaves this row (still in the Menu Apps list and in AI tools).
- NEW tracker "WHERE YOU ARE" (www/horizon_locate.js, keyless): GPS (HzGeo, never prompts in the background) + IP (ipwho.is, ipapi.co, geojs.io, ipinfo.io) + street / suburb / city / region / country (Photon reverse, Nominatim reverse, BigDataCloud). With no GPS the IP position is named and the card says it is city level.
  - Card sits in the right panel directly under the six tiles: place, GPS accuracy or IP, coordinates, street, IP, network, the areas directions link to, refresh arrow, "AI knows where I am" switch, Maps button.
  - AI: HorizonToolPolicy.block() now carries a HORIZON LOCATION block (position, areas narrowest first, rule to write bare place names WITH the area). Switch off = the AI is told it does not know.
  - Maps: place search is biased to your area (Photon lat/lon + location_bias_scale) and map.show / map.route results add a WARNING when the place is 150 km+ from your area, so the AI redoes it with the area.
  - IP, coordinates and names stay in memory only. Only the switch is saved.
- Header: HORIZON + tagline moved left toward the true screen centre (26px on normal phones, less on narrow ones so it never touches the Browser tile).
- Music visualiser: Aurora Spectrum - bars grow from the centre line (bass middle, highs at both edges), mirrored up/down, three flowing ribbons, a ring out of the centre on every beat, sparks. Cards are taller (116px right panel, 128px Music tab).
- Settings tile while music plays: slow pink pulses ripple out of the tile (two rings, 2.6s, about 14px reach), slow glow, slow icon breath. No shake.
- Version strings bumped to 1.99.73 (package.json, lock, scaffold, release, About + changelog).
- Tests: two old tests were already failing on V1.99.72 and are updated to match decisions made in V1.99.68 and V1.99.71 (Termux tile first; Nominatim backup allowed).
- Not seen on a phone from the build sandbox. Checked in a headless phone-size browser with mocked network answers; no real GPS, IP or map server was called.
