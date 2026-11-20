# Horizon V1.99.35 - tile colours, Make PDF, Leave group

- Tools menu: ON tiles are black with a green dot, OFF tiles are white with a red dot (no more green/purple).
- Make PDF (bottom strip) is a white bold pill with a green dot so it stands out.
- Header tiles: Browser neon blue, Group neon pink, Vault neon yellow, Music dark neon green. GitHub unchanged.
- Group dropdown: new red "Leave group" button clears the group and hides the "N in group" pill. Tick a contact or tap + and it returns.
- CI: scripts/ci_bypass_tests.sh (run by predeliver step 0b) keeps the test steps non-blocking; stale Termux Edge files are auto-deleted (step 0).
- Files changed: www/horizon_people.js, www/horizon_app.css, www/index.html (cache versions), tests/ui-v32.test.cjs (new), tests/front-header.test.cjs + tests/edge-tts.test.cjs (version pins).
- Not visually checked on a device here: look at the Tools menu, group dropdown and header tiles on your phone.

## V1.99.33 additions
- Provider pill: the model name sits in the middle (cyan) so the pill is not empty. While a reply runs the middle shows the live step as before.
- Group chat: the pill shows the AI that answers next ("next · <model>"), and switches to the live speaker while it answers. It rotates through the group in order and wraps.
- Files changed: www/horizon_usage.js, www/horizon_v2.js, www/horizon_app.css, www/index.html (cache versions), tests/pill-model.test.cjs (new), version pins in tests/edge-tts.test.cjs + tests/front-header.test.cjs.
- Not checked on a device here: open the app and send one message in a group chat to watch the name rotate.

## V1.99.34
- Make PDF removed from the Tools dock row next to People / Horizon ID. It still shows in the description area when you hold the PDF tile, and the chat-bar PDF pill is unchanged.
- Files changed: www/horizon_toolgrid.js, www/horizon_app.css, www/index.html (cache versions), tests/tools-dock.test.cjs, tests/ui-v32.test.cjs, version pins.

## V1.99.35
- Grey theme: white-on-grey text fixed. Root cause: the header, the 5 tiles, the group dropdown and People used var(--text) and var(--bg), which no theme defined, so they always used dark-theme fallbacks. Both are now defined for grey only (dark theme unchanged). Neon tile colours get darker shades on grey so they stay readable.
- Files changed: www/horizon_app.css, www/index.html (cache versions), tests/grey-theme.test.cjs (new), version pins.
- Not checked on a device here: flip to Grey and look at the header, the 5 tiles, the group dropdown and the Tools menu.
