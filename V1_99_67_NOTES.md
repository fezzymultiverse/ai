# Horizon V1.99.67 - build fixes + keyless map tiles

- Version bumped from 1.99.66 to 1.99.67: package.json, package-lock.json, scaffold/package.json, www/horizon_release.js, www/horizon_about.js (+ changelog entry), ?v= cache-busters in www/index.html.
- Build (see LOCKFIX_NOTES.md and HORIZON_CI_FIX_GUIDE.txt): Capacitor 7 lock with playwright, Java 21, Kotlin JVM target 21, Gradle retry on Maven 429, short BUILD ERRORS block.
- Maps: CARTO tiles now need an API key (they painted "API KEY REQUIRED"). www/horizon_maps.js uses OpenStreetMap tiles; dark themes invert them (horizon_maps.css).
- package.json has test / test:browser scripts for files that exist in tests/.
- Not tested on a phone. The CI run decides.
