# Horizon V1.99.45 — Tools menu: neon icons + split status/People boxes
- The 11 tool tiles (Thinking, Screen, Lens, Browser eye, Web, YouTube, GitHub, Music, PDF, Image, Vault, Memory) use new neon SVG icons (symbols n-* in index.html), each in its own neon colour with a two-tone accent. Off = soft glow, On = full glow + slow pulse (not with reduced-motion). The old icons stay in the sprite for the rest of the app.
- The status update (tool name, on/off, key chips) is now its own box; People + Horizon ID + Add chat are a separate box directly underneath it.
- Music tile used the eye icon before; it now has a music-note icon.
- Files: www/index.html, www/horizon_app.css (appended), www/horizon_about.js, tests (cache-bust only).
- Checked: predeliver 110 pass, 0 fail; headless render at 360x800. Generator tiles (Avatars, Memes, Visuals) keep their old icons.
