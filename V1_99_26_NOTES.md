# Horizon V1.99.26 - Front header

- Top row: Menu (left), HORIZON + Strategy Over Impulse (centre), Settings (right).
- Row 2: the provider pill, full width. Row 3: tiles Browser, Group, GitHub (logo only), Vault, Music. All three rows are pinned; only the chat scrolls.
- GitHub row, Vault row (Settings) and the Music tile (APPS) are hidden in the right panel. Their code stays, the header tiles open them.
- Files changed: www/index.html (script tag + css version), www/horizon_front.js (new), www/horizon_app.css, tests/front-header.test.cjs (new), tests/people-chatfirst.browser.cjs (new in V1.99.25-ci-fix).
- Run `bash scripts/predeliver.sh` before building.
