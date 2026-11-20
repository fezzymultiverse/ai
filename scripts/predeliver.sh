#!/usr/bin/env bash
# Horizon predeliver V1.0.0 - run this BEFORE you zip or push.
# Same checks CI runs: bash -n on scripts, node --check on www/*.js, then every tests/*.test.cjs.
# Exit 0 = safe to zip/push. Exit 1 = do NOT deliver. No root, no network, pure Bash + node.
# Usage: bash scripts/predeliver.sh
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT" || { echo "FAIL: cannot enter repo root"; exit 1; }
T="${TMPDIR:-/tmp}"
LOG="$T/horizon-predeliver.$$.log"
FAILS=0

say()  { printf '%s\n' "$*"; }
fail() { say "  FAIL: $*"; FAILS=$((FAILS + 1)); }

say "== Horizon predeliver in $ROOT"

# 0. obsolete files: an unzip over the repo never deletes, so delete anything listed in scripts/obsolete_files.txt
say "-- 0/3 obsolete files"
if [ -f scripts/obsolete_files.txt ]; then
  while IFS= read -r f || [ -n "$f" ]; do
    case "$f" in ''|'#'*) continue ;; esac
    if [ -e "$f" ]; then rm -f -- "$f" && say "  removed $f"; fi
  done < scripts/obsolete_files.txt
fi

# Regression failures remain blocking. No CI bypass is applied.

# 1. bash syntax of every script in scripts/
say "-- 1/3 bash -n"
n=0
for f in scripts/*.sh; do
  [ -f "$f" ] || continue
  n=$((n + 1))
  if bash -n "$f" 2> "$LOG"; then say "  ok  $f"; else fail "$f"; sed 's/^/      /' "$LOG"; fi
done
[ "$n" -gt 0 ] || fail "no scripts/*.sh found"

# 2. JavaScript syntax of every www/*.js
say "-- 2/3 node --check"
if ! command -v node > /dev/null 2>&1; then
  fail "node is not installed (pkg install nodejs)"
else
  n=0
  for f in www/*.js; do
    [ -f "$f" ] || continue
    n=$((n + 1))
    if node --check "$f" 2> "$LOG"; then say "  ok  $f"; else fail "$f"; sed 's/^/      /' "$LOG"; fi
  done
  [ "$n" -gt 0 ] || fail "no www/*.js found"
fi

# Check the large inline app program as well as standalone modules.
if command -v python3 > /dev/null 2>&1 && command -v node > /dev/null 2>&1; then
  python3 scripts/check_inline_js.py || fail "inline JavaScript syntax"
fi

# 3. the regression tests (explicit file list: 'node --test tests/' fails on Node 22; TAP reporter forced so Node 22 and 24 print the same summary)
say "-- 3/3 tests"
if command -v node > /dev/null 2>&1; then
  set -- tests/*.test.cjs
  if [ ! -f "$1" ]; then
    fail "no tests/*.test.cjs found"
  else
    node --test --test-reporter=tap "$@" > "$LOG" 2>&1
    rc=$?
    pass="$(awk '/^(# |ℹ )pass /{print $3}' "$LOG" | tail -n 1)"
    bad="$(awk '/^(# |ℹ )fail /{print $3}' "$LOG" | tail -n 1)"
    say "  files: $#   pass: ${pass:-?}   fail: ${bad:-?}"
    if [ "$rc" -ne 0 ] || [ "${bad:-1}" != "0" ]; then
      fail "tests did not all pass"
      awk '/^not ok /{print "      " $0} /^ *error:/{getline x; print "         " x}' "$LOG" | head -40
      say "      full log: $LOG"
    fi
  fi
fi

say ""
if [ "$FAILS" -eq 0 ]; then
  rm -f "$LOG"
  say "READY: all checks passed. Safe to zip and push."
  exit 0
fi
say "NOT READY: $FAILS problem(s). Do not zip or push until they are fixed."
exit 1
