# Horizon V1.99.25 - Tools dock, Options pill, header tile

- Tools menu: "Purple is on, black is off" removed.
- Tools menu bottom strip: the "Tap a tool to switch it. Hold one to read more." pill is replaced by People + Horizon ID (left), Make PDF (while PDF is on) and Add chat (far right). People and Add chat use the multicolour ring.
  Hold or tap a tile and its description opens inside the same strip above that row. The strip stays pinned at the bottom of the menu while it scrolls. List view keeps the strip too.
  On a narrow phone (strip narrower than 335px) Make PDF drops to its own line so Horizon ID is never cut.
- Add chat opens the same People > Contacts panel as the + beside the group pill (openPlus). The old + stays where it was.
- Above the chat box: People and Horizon ID left that row. Only Options stays, as a white pill with black text and a cyan outline, 10px lower (pull 18px to 28px). The AI group "i" (Options) gets the same look. The row hides itself when there is no Options button.
- If the Tools strip is ever missing, People falls back to the old row, so nothing is lost.
- Header: the top-right Settings tile is 36x36 like the Menu tile, with the sliders icon. The provider pill is 36px tall with smaller type and arrows so it fits.
- Files changed: www/index.html, www/horizon_toolgrid.js, www/horizon_people.js, www/horizon_v2.js, www/horizon_app.css, tests/tools-dock.test.cjs (new).
- Run `bash scripts/predeliver.sh` before building: bash -n, node --check, tests.
