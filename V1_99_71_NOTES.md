# V1.99.71 - Browser to the header, Termux to the tile row, tidy right panel (changed: www/horizon_front.js, www/horizon_app.css)

- Header row is now: Menu | Browser | HORIZON | Settings. Browser is a small tile right next to the Menu tile.
- In the top tile row the Termux tile (orange, >_ icon) takes the old Browser slot: Termux, Group, GitHub, Vault, Music. It opens the same terminal as before.
- Right panel APPS grid has exactly six tiles in this order: Maps, Stats, RSS / Lens, YouTube, Downloads (3 columns x 2 rows). Its Terminal tile is hidden there (the element stays in the page so nothing else breaks).
- Replaces the 4-column grid and wide Maps tile from V1.99.70.
- The Apps list inside the left Menu panel is untouched.
- Not seen on a device from the build sandbox.
