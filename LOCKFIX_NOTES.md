# Lockfile fix (npm ci failure)

CI failed at "Install dependencies": the repo package.json was on Capacitor 6 (+ playwright) while package-lock.json was Capacitor 7.

- Root `package.json` added: Capacitor ^7 (android, core, filesystem, local-notifications, cli) + `playwright` (needed by tests/*.browser.cjs).
- `scaffold/package.json` now identical to it.
- Old `package-lock.json` removed (it had no playwright). It must be regenerated once with network access:

    rm -rf node_modules
    npm install
    git add package.json package-lock.json

- Until the new lock is committed, CI must use `npm install` (the bundled workflow already falls back to it when no lock exists).
- If your repo has its own package.json / package-lock.json, delete the old lock there too, or replace its package.json with this one.

## No manual steps needed
The workflow now always copies scaffold/package.json over the repo's package.json, deletes any package-lock.json, and runs `npm install`.
So a stale Capacitor 6 package.json or old lock in the repo can no longer break "Install dependencies".
If your repo uses a different workflow file (e.g. a signed-release one), replace its install step with the two steps in build-apk.yml.

## Update (second CI failure: "Missing: playwright@1.65.1 from lock file")
- `package-lock.json` is back in the zip, now WITH playwright 1.65.1 / playwright-core 1.65.1 (checked with `npm ci --dry-run`), so a plain `npm ci` passes.
- The zip's workflow was renamed to `build-apk-zip-debug.yml` and is manual-only, so it can no longer overwrite your own `build-apk.yml` (the signed release one).
- Your signed-release workflow runs Java 17 (see its log). Capacitor 7 needs Java 21: set `java-version: 21` in its setup-java step.

## Update 3
- `.github/workflows/build-apk.yml` is now YOUR signed-release workflow (rebuilt from the copy you pasted) with: Java 21 kept, and "Install dependencies" falling back to `npm install` if lock and package.json ever drift. All signing / naming / release steps are unchanged.
- The old zip-only debug workflow was removed.
- Note: an explicit `export APP_ID APP_NAME` was added in "Apply app identity" (harmless; they were already exported from env).
- Not in this zip (kept in your repo): scripts/apply-android.sh, scripts/set-version.sh, worker/, tests/people-service.test.cjs and the npm test scripts. Do not delete them from the repo.

## Update 4
- Gradle build step retries up to 4 times (60s, 120s, 180s pauses). Cause: Maven Central returned HTTP 429 (Too Many Requests) for kotlin-stdlib-jdk8; not a code problem. Java 21 is now accepted (the compile got past the earlier error).

## Update 5
- New step "Align Kotlin JVM target with Java 21" before the Gradle build. Fixes `Inconsistent JVM-target compatibility detected for tasks 'compileReleaseJavaWithJavac' (21) and 'compileReleaseKotlin' (17)`: rewrites jvmTarget/jvmToolchain 17 -> 21 in android/app/build.gradle and sets kotlin.jvm.target.validation.mode=warning as a backstop.

## Update 6
- Gradle step now saves its output and, if the build fails, prints a short "BUILD ERRORS" block (Kotlin `e:` lines, "What went wrong") at the END of the log, so `gh run view ... --log-failed | tail -40` shows the real error. It only retries on download problems (429 etc.), not on compile errors.

## Update 7
- package.json now has `test` (node --test tests/*.test.cjs) and `test:browser` (node --test tests/*.browser.cjs), pointing at files that really exist in this zip. The other scripts the workflow calls (test:voice-dsp, test:key-boxes, ...) have no matching files here; those steps are continue-on-error and do not affect the APK build.

## Update 8 - Maps tiles
- Map tiles showed "API KEY REQUIRED carto.com/basemaps/apikey" (CARTO now needs a key). www/horizon_maps.js now uses OpenStreetMap tiles (keyless); dark themes invert them via CSS (.hzm-dark-tiles in horizon_maps.css).
