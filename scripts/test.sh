#!/usr/bin/env bash
# Universal OpenAI-compatible key + model tester · Strategy Over Impulse · 999
# Usage: ./llm_test.sh            (asks for base URL and key)
#        ./llm_test.sh https://cheapllm.shop/v1
OUT="${TMPDIR:-/tmp}"
T="$OUT/llm_test.$$"
mkdir -p "$T"
trap 'rm -rf "$T"' EXIT

command -v curl >/dev/null 2>&1 || { echo "curl missing: pkg install curl"; exit 1; }
command -v jq   >/dev/null 2>&1 || { echo "jq missing: pkg install jq"; exit 1; }

BASE="${1:-${LLM_BASE:-}}"
if [ -z "$BASE" ]; then read -r -p "Base URL (ends in /v1): " BASE; fi
BASE="${BASE%/}"
case "$BASE" in https://*|http://*) ;; *) echo "Base URL must start with https://"; exit 1 ;; esac

KEY="${LLM_KEY:-}"
if [ -z "$KEY" ]; then read -r -s -p "API key: " KEY; echo; fi
[ -n "$KEY" ] || { echo "No key given"; exit 1; }

PASS=0; FAIL=0
ok()  { echo "  [PASS] $1"; PASS=$((PASS+1)); }
bad() { echo "  [FAIL] $1"; FAIL=$((FAIL+1)); }

call() {  # call KEY METHOD PATH [BODY]  -> CODE TIME, response in $T/body.json
  local k="$1" m="$2" p="$3" b="${4:-}" out
  : > "$T/body.json"
  if [ -n "$b" ]; then
    out=$(curl -sS -m 90 -o "$T/body.json" -w '%{http_code} %{time_total}' -X "$m" "$BASE$p" \
      -H "Authorization: Bearer $k" -H "Content-Type: application/json" -d "$b" 2>"$T/err")
  else
    out=$(curl -sS -m 30 -o "$T/body.json" -w '%{http_code} %{time_total}' -X "$m" "$BASE$p" \
      -H "Authorization: Bearer $k" 2>"$T/err")
  fi
  CODE="${out%% *}"; TIME="${out##* }"
  [ -n "$CODE" ] || CODE=000
}
errmsg() { jq -r '(.error.message // .error // .message // .detail // .) | tostring' "$T/body.json" 2>/dev/null | head -c 300; }

echo "== 1. Server reachable"
call "$KEY" GET /models
if [ "$CODE" = "000" ]; then bad "no connection: $(cat "$T/err")"; exit 1; fi
echo "   GET /models -> $CODE in ${TIME}s"
KEYCODE="$CODE"
cp "$T/body.json" "$T/models_raw.json"

echo "== 2. Does /models check the key?"
call "rc_invalid_key_for_test" GET /models
BADCODE="$CODE"
if [ "$KEYCODE" = "200" ] && { [ "$BADCODE" = "401" ] || [ "$BADCODE" = "403" ]; }; then
  ok "bad key -> $BADCODE, your key -> 200: your key is VALID"
  VALID=yes
elif [ "$KEYCODE" = "200" ] && [ "$BADCODE" = "200" ]; then
  echo "  [INFO] /models answers 200 even with a bad key, so it proves nothing. Step 4 decides."
  VALID=unknown
elif [ "$KEYCODE" = "401" ] || [ "$KEYCODE" = "403" ]; then
  bad "your key was rejected ($KEYCODE): $(cp "$T/models_raw.json" "$T/body.json"; errmsg)"
  VALID=no
else
  echo "  [INFO] /models -> $KEYCODE (bad key -> $BADCODE). Step 4 decides."
  VALID=unknown
fi

echo "== 3. Models"
jq -r '(.data // .models // [])[]? | (.id // .name // empty)' "$T/models_raw.json" 2>/dev/null | sort -u > "$T/models.txt"
N=$(wc -l < "$T/models.txt" | tr -d ' ')
if [ "$N" -gt 0 ]; then
  SAVE="$OUT/llm_models.txt"; cp "$T/models.txt" "$SAVE"
  ok "$N models. Full list saved to $SAVE"
  echo "   Chat-looking models (first 40):"
  grep -v -i -E 'embed|whisper|tts|asr|rerank|moderation|image|video|flux|dall|sora|veo|kling|seedance|stable-diffusion' "$T/models.txt" | head -n 40 | sed 's/^/     /'
  echo "   Search the list:  grep -i NAME $SAVE"
else
  bad "no models parsed from /models"; cp "$T/models_raw.json" "$T/body.json"; head -c 300 "$T/body.json"; echo
fi

MODEL="${LLM_MODEL:-}"
if [ -z "$MODEL" ]; then
  read -r -p "Model id for the chat test (Enter = first chat-looking one): " MODEL
  [ -n "$MODEL" ] || MODEL=$(grep -v -i -E 'embed|whisper|tts|asr|rerank|moderation|image|video|flux|dall|sora|veo|kling|seedance|stable-diffusion' "$T/models.txt" | head -n 1)
fi
[ -n "$MODEL" ] || { echo "No model to test"; exit 1; }

echo "== 4. Real chat call with: $MODEL"
BODY=$(jq -n --arg m "$MODEL" '{model:$m,messages:[{role:"user",content:"Reply with exactly: pong"}],max_tokens:32,temperature:0}')
call "$KEY" POST /chat/completions "$BODY"
case "$CODE" in
  200)
    R=$(jq -r '.choices[0].message.content // empty' "$T/body.json")
    if [ -n "$R" ]; then ok "reply in ${TIME}s: $R"; echo "  >> KEY IS VALID and the model works"; VALID=yes
    else bad "200 but no reply text"; head -c 300 "$T/body.json"; echo; fi
    jq -r '.usage // empty | "     tokens: prompt=\(.prompt_tokens) completion=\(.completion_tokens) total=\(.total_tokens)"' "$T/body.json" 2>/dev/null ;;
  401|403) bad "key rejected ($CODE): $(errmsg)"; VALID=no ;;
  402) bad "402: key is fine but no credit/balance: $(errmsg)" ;;
  404) bad "404: model id or path not found: $(errmsg)" ;;
  429) bad "429: rate limited or allowance used: $(errmsg)" ;;
  *)   bad "$CODE: $(errmsg)" ;;
esac

echo "== 5. Streaming"
BODY=$(jq -n --arg m "$MODEL" '{model:$m,messages:[{role:"user",content:"Count 1 to 3"}],max_tokens:40,stream:true}')
curl -sS -N -m 60 -X POST "$BASE/chat/completions" -H "Authorization: Bearer $KEY" \
  -H "Content-Type: application/json" -H "Accept: text/event-stream" -d "$BODY" -o "$T/stream.txt" 2>"$T/err"
CH=$(grep -c '^data: {' "$T/stream.txt" 2>/dev/null)
if [ "${CH:-0}" -gt 0 ]; then ok "$CH stream chunks"; else bad "no stream chunks"; head -c 200 "$T/stream.txt"; echo; fi

echo
echo "KEY VERDICT: $VALID   ($PASS passed, $FAIL failed)"
[ "$VALID" = "yes" ]

