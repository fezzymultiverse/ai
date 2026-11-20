#!/usr/bin/env bash
# Horizon V1.99.27 - removes ONLY the same-row header chip assertion from tests/browser.smoke.cjs (Option B is two-tier).
# Keeps rects.length==4 and r.w>30 on line 42. Run from repo root: bash scripts/remove_chip_align_assert.sh
set -u
F="tests/browser.smoke.cjs"
[ -f "$F" ] || { echo "FAIL: $F not found (run from repo root)"; exit 1; }
if ! grep -q 'Math\.abs(r\.y-rects\[0\]\.y)<1' "$F"; then echo "nothing to remove: y-alignment assertion not found in $F"; exit 0; fi
cp "$F" "$F.bak"
sed -i 's/assert\.ok(n(r=>Math\.abs(r\.y-rects\[0\]\.y)<1));[ ]*//' "$F"
if grep -q 'Math\.abs(r\.y-rects\[0\]\.y)<1' "$F"; then cp "$F.bak" "$F"; echo "FAIL: pattern still present, restored original"; exit 1; fi
node --check "$F" && echo "ok: y-alignment assertion removed from $F (backup: $F.bak)" || { cp "$F.bak" "$F"; echo "FAIL: restored original"; exit 1; }
