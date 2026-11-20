# V1.99.99 (screen-always patch) - Screen always on, Screen/Lens/Browser eye tiles removed from the + menu
Changed: www/index.html, horizon_screen.js, horizon_lens.js, horizon_toolgrid.js, version strings.
1. + menu no longer has Screen, Lens or Browser eye tiles.
2. The AI always sees the app screen. New storage key horizon_screen_always, so an old "off" is reset to on.
3. Lens window (Apps menu) has a new SCREEN VIEW switch at the top to turn it off, plus the existing Auto/Always/Off and screenshot options.
4. Browser eye stays in the browser (eye icon + settings drawer).
5. Thinking and Memory tiles removed from the + menu. Both are ON by default and now have switches in Settings > Permissions (Thinking uses new key horizon_think_always, Memory uses the existing Auto-save setting).
6. USAGE & ENGINE row removed from the right panel (its tab, network/IP block and key-health block go with it). Each AI card in API PROVIDERS PLUS KEYS has a usage card attached: one readable line + progress bar under the title (still visible when the card is collapsed), and the full card inside when expanded (percent, tokens in/out today, requests, speed, last 7 days, APIzone status, optional daily token limit stored in horizon_usage_limits). Bar = % of the daily limit if one is set (amber 80%, red 100%), otherwise the provider's share of all AI tokens today. The header badge now opens the providers page.
