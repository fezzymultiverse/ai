#!/usr/bin/env bash
# Horizon: stamp one version number everywhere, or check that every stamp agrees.
#
# Usage (run from anywhere, it moves to the project root itself):
#   bash scripts/bump-version.sh 1.92.4     set every stamp to 1.92.4, then verify
#   bash scripts/bump-version.sh --check    list every stamp, exit 1 if any disagree
#
# Stamps it owns:
#   package.json            "version"
#   package-lock.json       top "version" and packages[""] "version"
#   www/horizon_about.js    var VERSION = 'V...'
#   www/horizon_release.js  var release = '...'
#   www/index.html          every ?v=x.y.z cache-bust tag (scripts and stylesheet)
#   www/horizon_app.css     first-line banner
#   README.md               first-line "Current source release" banner
# Checked but never written (it needs real text from you):
#   www/horizon_about.js    newest changelog entry in LOG
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PKG="package.json"
LOCK="package-lock.json"
ABOUT="www/horizon_about.js"
RELEASE="www/horizon_release.js"
HTML="www/index.html"
CSS="www/horizon_app.css"
README="README.md"

say() { echo "[bump-version] $*"; }
die() { echo "[bump-version] FAILED: $*" >&2; exit 1; }

for f in "$PKG" "$LOCK" "$ABOUT" "$RELEASE" "$HTML" "$CSS" "$README"; do
    [ -f "$f" ] || die "file not found: $f"
done

# first_match FILE ERE: the first capture group of the first line matching ERE ("" when nothing matches).
# The sed delimiter is @ so patterns may contain slashes; no pattern here contains an @.
first_match() {
    sed -nE "s@$2@\\1@p" "$1" | sed -n '1p'
}

# read_stamps: print "label|value" for every stamp, one per line.
read_stamps() {
    local tags
    echo "package.json|$(first_match "$PKG" '^  "version": "([^"]+)".*')"
    echo "package-lock.json (top)|$(first_match "$LOCK" '^  "version": "([^"]+)".*')"
    echo "package-lock.json (root package)|$(first_match "$LOCK" '^      "version": "([^"]+)".*')"
    echo "horizon_about.js VERSION|$(first_match "$ABOUT" ".*var VERSION = 'V([0-9.]+)'.*")"
    echo "horizon_release.js release|$(first_match "$RELEASE" ".*var release = '([0-9.]+)'.*")"
    tags="$(grep -oE '\?v=[0-9]+\.[0-9]+\.[0-9]+' "$HTML" | sed 's/^?v=//' | sort -u | tr '\n' ' ' | sed 's/ $//')"
    echo "index.html ?v= tags|${tags}"
    echo "horizon_app.css banner|$(first_match "$CSS" '^/\* HORIZON ([0-9.]+) .*')"
    echo "README.md banner|$(first_match "$README" '^> \*\*Current source release: V([0-9]+\.[0-9]+\.[0-9]+)\..*')"
    echo "horizon_about.js newest changelog|$(first_match "$ABOUT" "^ *\\['V([0-9.]+)', \\[.*")"
}

# show_stamps WANT: print the table; return 1 when any stamp differs from WANT.
# Without WANT, the package.json value is the reference.
show_stamps() {
    local want="${1:-}" bad=0 label val
    local stamps
    stamps="$(read_stamps)"
    if [ -z "$want" ]; then
        want="$(sed -n '1p' <<<"$stamps" | cut -d'|' -f2)"
    fi
    while IFS='|' read -r label val; do
        if [ "$val" = "$want" ]; then
            printf '  ok       %-34s %s\n' "$label" "$val"
        else
            printf '  MISMATCH %-34s %s (want %s)\n' "$label" "${val:-<not found>}" "$want"
            bad=1
        fi
    done <<<"$stamps"
    return "$bad"
}

ARG="${1:-}"

if [ "$ARG" = "--check" ]; then
    if show_stamps ""; then
        say "All stamps agree."
        exit 0
    fi
    die "Stamps disagree. Run: bash scripts/bump-version.sh <x.y.z>"
fi

[[ "$ARG" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "Usage: bash scripts/bump-version.sh <x.y.z> | --check"
NEW="$ARG"

# package.json and package-lock.json: replace only the first matching "version" line at each indent.
sed -i -E "0,/^  \"version\": \"[^\"]*\"/s//  \"version\": \"${NEW}\"/" "$PKG"
sed -i -E "0,/^  \"version\": \"[^\"]*\"/s//  \"version\": \"${NEW}\"/" "$LOCK"
sed -i -E "0,/^      \"version\": \"[^\"]*\"/s//      \"version\": \"${NEW}\"/" "$LOCK"

sed -i -E "s/var VERSION = 'V[0-9.]+';/var VERSION = 'V${NEW}';/" "$ABOUT"
sed -i -E "s/var release = '[0-9.]+';/var release = '${NEW}';/" "$RELEASE"
sed -i -E "s/\?v=[0-9]+\.[0-9]+\.[0-9]+/?v=${NEW}/g" "$HTML"
sed -i -E "1s#^/\* HORIZON [0-9.]+ #/* HORIZON ${NEW} #" "$CSS"
sed -i -E "1s/(Current source release: V)[0-9]+\.[0-9]+\.[0-9]+/\1${NEW}/" "$README"

say "Stamped ${NEW}. Verifying:"
if show_stamps "$NEW"; then
    say "All stamps agree on ${NEW}."
    exit 0
fi

# The only stamp that can legitimately lag is the changelog, because it needs a real entry.
STAMPS="$(read_stamps | grep -v '^horizon_about.js newest changelog|' || true)"
LAG=0
while IFS='|' read -r label val; do
    [ -n "$label" ] || continue
    [ "$val" = "$NEW" ] || LAG=1
done <<<"$STAMPS"
[ "$LAG" -eq 0 ] || die "A stamp did not take ${NEW}. See the MISMATCH lines above."
say "Add a changelog entry for V${NEW} at the top of LOG in ${ABOUT}, then run: bash scripts/bump-version.sh --check"
