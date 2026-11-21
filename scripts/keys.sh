#!/usr/bin/env bash
# Runcrate API tester · Strategy Over Impulse · 999
BASE="https://api.runcrate.ai/v1"
T="${TMPDIR:-/tmp}/runcrate_test.$$"
mkdir -p "$T"
trap 'rm -rf "$T"' EXIT

command -v curl >/dev/null 2>&1 || { echo "curl missing: pkg install curl"; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "jq missing: pkg install jq"; exit 1; }

KEY="${RUNCRATE_API_KEY:-}"
if [ -z "$KEY" ]; then
  read -r -s -p "Runcrate API key: " KEY; echo
fi
[ -n "$KEY" ] || { echo "No key given"; exit 1; }

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

call() {  # call METHOD PATH [JSON_BODY] -> sets CODE, BODYFILE, TIME
  local m="$1" p="$2" b="${3:-}"
  BODYFILE="$T/body.json"
  if [ -n "$b" ]; then
    out=$(curl -sS -m 90 -o "$BODYFILE" -w '%{http_code} %{time_total}' -X "$m" "$BASE$p" \
      -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" -d "$b" 2>"$T/err")
  else
    out=$(curl -sS -m 30 -o "$BODYFILE" -w '%{http_code} %{time_total}' -X "$m" "$BASE$p" \
      -H "Authorization: Bearer $KEY" 2>"$T/err")
  fi
  CODE="${out%% *}"; TIME="${out##* }"
  [ -n "$CODE" ] || CODE=000
}

echo "== 1. Reach the server"
call GET /models
case "$CODE" in
  000) bad "no connection: $(cat "$T/err")"; exit 1 ;;
  200) ok "GET /models -> 200 in ${TIME}s" ;;
  401|403) bad "GET /models -> $CODE (key rejected)"; jq -r '.error.message // .message // .' "$BODYFILE" 2>/dev/null; exit 1 ;;
  *) bad "GET /models -> $CODE"; head -c 400 "$BODYFILE"; echo; ;;
esac

echo "== 2. List models"
jq -r '(.data // .models // [])[]? | (.id // .name)' "$BODYFILE" 2>/dev/null | sort > "$T/models.txt"
N=$(wc -l < "$T/models.txt" | tr -d ' ')
if [ "$N" -gt 0 ]; then ok "$N models listed"; head -n 25 "$T/models.txt" | sed 's/^/     /'; else bad "no models parsed"; fi

MODEL="${RUNCRATE_MODEL:-}"
if [ -z "$MODEL" ]; then
  echo
  read -r -p "Model id to test (Enter = first chat-looking one): " MODEL
  if [ -z "$MODEL" ]; then
    MODEL=$(grep -v -i -E 'image|video|tts|asr|whisper|embed|flux|kling|veo|seedance' "$T/models.txt" | head -n 1)
  fi
fi
[ -n "$MODEL" ] || { echo "No model to test"; exit 1; }
echo "   using: $MODEL"

echo "== 3. Chat completion"
BODY=$(jq -n --arg m "$MODEL" '{model:$m,messages:[{role:"user",content:"Reply with exactly: pong"}],max_tokens:32,temperature:0}')
call POST /chat/completions "$BODY"
if [ "$CODE" = "200" ]; then
  R=$(jq -r '.choices[0].message.content // empty' "$BODYFILE")
  if [ -n "$R" ]; then ok "reply in ${TIME}s: $R"; else bad "200 but no content"; head -c 400 "$BODYFILE"; echo; fi
  jq -r '.usage // empty | "     tokens: prompt=\(.prompt_tokens) completion=\(.completion_tokens) total=\(.total_tokens)"' "$BODYFILE" 2>/dev/null
else
  bad "POST /chat/completions -> $CODE"
  jq -r '.error.message // .message // .' "$BODYFILE" 2>/dev/null | head -c 400; echo
fi

echo "== 4. Streaming (SSE)"
BODY=$(jq -n --arg m "$MODEL" '{model:$m,messages:[{role:"user",content:"Count 1 to 3"}],max_tokens:40,stream:true}')
curl -sS -N -m 60 -X POST "$BASE/chat/completions" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" -d "$BODY" -o "$T/stream.txt" 2>"$T/err"
CH=$(grep -c '^data: {' "$T/stream.txt" 2>/dev/null)
if [ "${CH:-0}" -gt 0 ] && grep -q '^data: \[DONE\]' "$T/stream.txt"; then ok "$CH chunks, ended with [DONE]"
elif [ "${CH:-0}" -gt 0 ]; then ok "$CH chunks (no [DONE] line)"
else bad "no stream chunks"; head -c 300 "$T/stream.txt"; echo; fi

echo "== 5. Bad key must be refused"
SAVE="$KEY"; KEY="rc_invalid_test_key"
call GET /models
KEY="$SAVE"
case "$CODE" in 401|403) ok "bad key -> $CODE" ;; *) bad "bad key returned $CODE (expected 401/403)" ;; esac

echo
echo "Result: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]

