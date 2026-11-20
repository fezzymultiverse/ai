# Horizon V1.99.65 - project scaffold for the GitHub build

Built on V1.99.64. App code unchanged except version string and About entry.

## Added
- scaffold/package.json, scaffold/capacitor.config.json, scaffold/.gitignore, scaffold/README.md (Capacitor 7, appId com.festers.horizon, webDir www, CapacitorHttp on, plugins filesystem + local-notifications).
- build-apk.yml: copies the scaffold files to the repo root ONLY if the repo has no package.json. Your own files always win.

## Limits (read these)
- android/ is not stored in the zip: the workflow generates it with `npx cap add android`.
- These native plugins are called by the web code but their source is NOT in this zip: HorizonAI, HorizonMedia, HorizonPerms, HorizonDaemon, HorizonTermux, HorizonLock, HorizonDisplay, HorizonCheckin, HorizonAlarm, HorizonBrowser. An APK built from the scaffold alone lacks them. Keep using your real repo for the full app.
- Stats plugin: add `python3 scripts/install_stats.py android --apply` to the workflow if you want it (not added, not tested in CI).
- No lockfile, so the workflow runs `npm install`. Package versions were not checked against npm (no network here).

## Verified / not verified
- Verified: JSON and YAML parse; node --check on edited JS; inline script check; Edge installer fixtures and Node tests.
- Not verified: the workflow on GitHub, npm install of these versions, Kotlin compilation, anything on a phone.
