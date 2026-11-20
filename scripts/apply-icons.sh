#!/usr/bin/env bash
# Horizon V1.99.117 - launcher icon + splash generator. Pure Bash. Runs the same in Termux and in CI.
#
#   bash scripts/apply-icons.sh [android-dir]        default android-dir: android
#
# Source:  assets/icon.png             finished 1024x1024 tile (legacy + round icons, web favicon)
#          assets/icon-foreground.png  1024x1024 transparent artwork (adaptive icon + splash)
#          Fallback when icon.png is missing: assets/icon.svg  (then resources/icon.svg  icon.svg  www/icon.svg, or HZ_ICON_SVG=/path/to.svg)
#          Keep the artwork inside the middle 60%: Android crops adaptive icons to a circle/squircle.
# Writes:  res/mipmap-*/ic_launcher.png  ic_launcher_round.png  ic_launcher_foreground.png
#          res/mipmap-anydpi-v26/ic_launcher.xml  ic_launcher_round.xml   res/values/ic_launcher_background.xml
#          res/drawable*/splash.png (every one Capacitor created, same pixel size)   www/icon.png
# Why: Android cannot show an SVG as a launcher icon. Without these PNGs the app keeps the default Capacitor icon.
# Needs:   rsvg-convert  (Termux: pkg install librsvg   Ubuntu: apt install librsvg2-bin). Installed for you when possible.
# Env:     HZ_ICON_SVG (force the SVG fallback)  HZ_ICON_BG (default #000000, adaptive-icon + splash background)
set -euo pipefail
cd "$(dirname "$0")/.."

ANDROID="${1:-android}"
BG="${HZ_ICON_BG:-#000000}"
RES="$ANDROID/app/src/main/res"

die() { echo "ERROR: $*" >&2; exit 1; }
say() { echo "icons: $*"; }

[[ "$BG" =~ ^#[0-9A-Fa-f]{6}$ ]] || die "HZ_ICON_BG must look like #000000"
[ -d "$RES" ] || die "$RES not found. Run: npx cap add android"

SRC=""; FGSRC=""
if [ -z "${HZ_ICON_SVG:-}" ] && [ -s assets/icon.png ]; then
  SRC="assets/icon.png"
  [ -s assets/icon-foreground.png ] && FGSRC="assets/icon-foreground.png"
else
  for c in "${HZ_ICON_SVG:-}" assets/icon.svg resources/icon.svg icon.svg www/icon.svg; do
    if [ -n "$c" ] && [ -s "$c" ]; then SRC="$c"; break; fi
  done
fi
[ -n "$SRC" ] || die "no icon source. Put your tile at assets/icon.png (and assets/icon-foreground.png) or an SVG at assets/icon.svg"
PNGSIG="89504e470d0a1a0a"
sig() { od -An -tx1 -N8 "$1" | tr -d ' \n'; }
case "$SRC" in
  *.png) [ "$(sig "$SRC")" = "$PNGSIG" ] || die "$SRC is not a PNG file" ;;
  *) grep -q "<svg" "$SRC" || die "$SRC is not an SVG file" ;;
esac
if [ -n "$FGSRC" ] && [ "$(sig "$FGSRC")" != "$PNGSIG" ]; then die "$FGSRC is not a PNG file"; fi
RX=22; [[ "$SRC" == *.png ]] && RX=0   # a PNG tile already carries its own rounded corners
HAVE_FG=1
if [ -z "$FGSRC" ]; then FGSRC="$SRC"; HAVE_FG=0; fi

if ! command -v rsvg-convert >/dev/null 2>&1; then
  say "rsvg-convert missing, trying to install it"
  if command -v pkg >/dev/null 2>&1; then
    pkg install -y librsvg >/dev/null 2>&1 || true
  elif command -v apt-get >/dev/null 2>&1; then
    if [ "$(id -u)" -eq 0 ]; then apt-get install -y -q librsvg2-bin >/dev/null 2>&1 || true
    else sudo -n apt-get install -y -q librsvg2-bin >/dev/null 2>&1 || true; fi
  fi
fi
command -v rsvg-convert >/dev/null 2>&1 || die "rsvg-convert is not installed. Termux: pkg install librsvg   Ubuntu: sudo apt install librsvg2-bin"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

mime_of() { case "$1" in *.png) echo image/png ;; *) echo image/svg+xml ;; esac; }
B64T="$(base64 < "$SRC" | tr -d '\n')";   MIMET="$(mime_of "$SRC")"
B64F="$(base64 < "$FGSRC" | tr -d '\n')"; MIMEF="$(mime_of "$FGSRC")"
NS='xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
# IMG = the finished tile, IMF = the foreground artwork   (args: x y size)
IMG() { echo "<image x=\"$1\" y=\"$2\" width=\"$3\" height=\"$3\" preserveAspectRatio=\"xMidYMid slice\" xlink:href=\"data:$MIMET;base64,$B64T\"/>"; }
IMF() { echo "<image x=\"$1\" y=\"$2\" width=\"$3\" height=\"$3\" preserveAspectRatio=\"xMidYMid slice\" xlink:href=\"data:$MIMEF;base64,$B64F\"/>"; }

# raster <w> <h> <out.png>   SVG text on stdin
raster() { rsvg-convert -w "$1" -h "$2" -f png -o "$3" - || die "rsvg-convert failed for $3"; }

png_ok() { # png_ok <file> <w> <h>
  local f="$1" w h
  [ -s "$f" ] || return 1
  [ "$(od -An -tx1 -N8 "$f" | tr -d ' \n')" = "89504e470d0a1a0a" ] || return 1
  read -r w h < <(od -An -tu1 -j16 -N8 "$f" | awk '{print $1*16777216+$2*65536+$3*256+$4, $5*16777216+$6*65536+$7*256+$8}')
  [ "$w" = "$2" ] && [ "$h" = "$3" ]
}
png_size() { od -An -tu1 -j16 -N8 "$1" | awk '{print $1*16777216+$2*65536+$3*256+$4, $5*16777216+$6*65536+$7*256+$8}'; }

if [[ "$SRC" == *.png ]]; then
  read -r sw sh < <(png_size "$SRC"); [ "$sw" = "$sh" ] || die "$SRC must be square (it is ${sw}x${sh})"
  [ "$sw" -ge 512 ] || die "$SRC is only ${sw}px, use at least 512"
fi
if [ "$HAVE_FG" = 1 ]; then
  read -r fw fh < <(png_size "$FGSRC"); [ "$fw" = "$fh" ] || die "$FGSRC must be square (it is ${fw}x${fh})"
fi

# 1. prove the source renders before touching anything
raster 64 64 "$TMP/probe.png" <<EOF
<svg $NS width="64" height="64" viewBox="0 0 64 64">$(IMG 0 0 64)</svg>
EOF
png_ok "$TMP/probe.png" 64 64 || die "$SRC did not render. Nothing was changed."
# a blank render means the SVG parsed but drew nothing
if [ "$(wc -c < "$TMP/probe.png")" -lt 400 ]; then die "$SRC rendered blank. Nothing was changed."; fi
say "source $SRC renders"

# 2. launcher icons
declare -A LEG=( [mdpi]=48 [hdpi]=72 [xhdpi]=96 [xxhdpi]=144 [xxxhdpi]=192 )
declare -A FG=(  [mdpi]=108 [hdpi]=162 [xhdpi]=216 [xxhdpi]=324 [xxxhdpi]=432 )
n=0
for d in mdpi hdpi xhdpi xxhdpi xxxhdpi; do
  dir="$RES/mipmap-$d"; mkdir -p "$dir"
  s="${LEG[$d]}"; f="${FG[$d]}"
  raster "$s" "$s" "$dir/ic_launcher.png" <<EOF
<svg $NS width="$s" height="$s" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="100" height="100" rx="$RX"/></clipPath></defs><g clip-path="url(#c)">$(IMG 0 0 100)</g></svg>
EOF
  raster "$s" "$s" "$dir/ic_launcher_round.png" <<EOF
<svg $NS width="$s" height="$s" viewBox="0 0 100 100"><defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs><g clip-path="url(#c)">$(IMG 0 0 100)</g></svg>
EOF
  raster "$f" "$f" "$dir/ic_launcher_foreground.png" <<EOF
<svg $NS width="$f" height="$f" viewBox="0 0 108 108">$(IMF 0 0 108)</svg>
EOF
  png_ok "$dir/ic_launcher.png" "$s" "$s" || die "bad $dir/ic_launcher.png"
  png_ok "$dir/ic_launcher_round.png" "$s" "$s" || die "bad $dir/ic_launcher_round.png"
  png_ok "$dir/ic_launcher_foreground.png" "$f" "$f" || die "bad $dir/ic_launcher_foreground.png"
  n=$((n + 3))
done

mkdir -p "$RES/mipmap-anydpi-v26" "$RES/values"
for x in ic_launcher ic_launcher_round; do
  cat > "$RES/mipmap-anydpi-v26/$x.xml" <<'EOF'
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
</adaptive-icon>
EOF
done
cat > "$RES/values/ic_launcher_background.xml" <<EOF
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">$BG</color>
</resources>
EOF
say "$n launcher PNGs + adaptive icon XML written"

# 3. splash: regenerate every splash.png Capacitor created, same pixel size
sp=0
while IFS= read -r -d '' f; do
  read -r w h < <(png_size "$f")
  [ "${w:-0}" -gt 0 ] && [ "${h:-0}" -gt 0 ] || continue
  m=$(( w < h ? w : h ))
  sz=$(( m * 80 / 100 ))
  x=$(( (w - sz) / 2 )); y=$(( (h - sz) / 2 ))
  cx=$(( w / 2 )); cy=$(( h / 2 )); r=$(( sz / 2 ))
  if [ "$HAVE_FG" = 1 ]; then
    raster "$w" "$h" "$f.new" <<EOF
<svg $NS width="$w" height="$h" viewBox="0 0 $w $h"><rect width="$w" height="$h" fill="$BG"/>$(IMF "$x" "$y" "$sz")</svg>
EOF
  else
    raster "$w" "$h" "$f.new" <<EOF
<svg $NS width="$w" height="$h" viewBox="0 0 $w $h"><defs><radialGradient id="g"><stop offset="0.55" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient><mask id="m"><circle cx="$cx" cy="$cy" r="$r" fill="url(#g)"/></mask></defs><rect width="$w" height="$h" fill="$BG"/><g mask="url(#m)">$(IMG "$x" "$y" "$sz")</g></svg>
EOF
  fi
  png_ok "$f.new" "$w" "$h" || die "bad splash for $f"
  mv -f "$f.new" "$f"
  sp=$((sp + 1))
done < <(find "$RES" -type f -name splash.png -print0)
say "$sp splash images regenerated"

# 4. web favicon referenced by www/index.html
if [ -d www ]; then
  raster 192 192 www/icon.png <<EOF
<svg $NS width="192" height="192" viewBox="0 0 100 100"><defs><clipPath id="c"><rect width="100" height="100" rx="$RX"/></clipPath></defs><g clip-path="url(#c)">$(IMG 0 0 100)</g></svg>
EOF
  png_ok www/icon.png 192 192 || die "bad www/icon.png"
fi

# 5. the manifest must point at the icons we just wrote
MF="$ANDROID/app/src/main/AndroidManifest.xml"
if [ -f "$MF" ]; then
  grep -q 'android:icon="@mipmap/ic_launcher"' "$MF" || die "AndroidManifest.xml does not use @mipmap/ic_launcher"
fi
say "done. Rebuild the APK to see the new icon."
