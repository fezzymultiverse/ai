# Horizon V1.90.0 live runner. Passed to Termux as: bash -lc "<this script>" horizon-live PORT TOKEN JOB TRACE CWD COMMAND
HZ_PORT=$1; HZ_TOK=$2; HZ_JOB=$3; HZ_TRACE=$4; HZ_CWD=$5; HZ_CMD=$6
export PYTHONUNBUFFERED=1 PAGER=cat GIT_PAGER=cat MANPAGER=cat DEBIAN_FRONTEND=noninteractive NO_COLOR=1 PIP_NO_INPUT=1 PIP_PROGRESS_BAR=off COLUMNS=96 HORIZON_LIVE=1
trap '' PIPE
HZ_LIVE=0
if { exec 3<>"/dev/tcp/127.0.0.1/$HZ_PORT"; } 2>/dev/null; then HZ_LIVE=1; fi
hz_send() {
  local LC_ALL=C
  [ "$HZ_LIVE" = 1 ] || return 0
  printf '%s %d\n%s' "$1" "${#2}" "$2" >&3 2>/dev/null || HZ_LIVE=0
  return 0
}
hz_send H "$HZ_TOK $HZ_JOB"
hz_send B "$$ ${BASH_VERSION:-unknown}"
if ! HZ_SYN=$(bash -n -c "$HZ_CMD" 2>&1); then
  hz_send N "bash -n found a syntax error, nothing was run: $HZ_SYN"
  printf 'bash -n found a syntax error, nothing was run:\n%s\n' "$HZ_SYN"
  hz_send X 2
  exit 2
fi
HZ_TMP=${TMPDIR:-${PREFIX:-$HOME}/tmp}
[ -d "$HZ_TMP" ] && [ -w "$HZ_TMP" ] || HZ_TMP=$HOME
HZ_DIR=$(mktemp -d "$HZ_TMP/hzlive.XXXXXX" 2>/dev/null)
if [ -z "$HZ_DIR" ] || ! mkfifo "$HZ_DIR/out" 2>/dev/null; then
  cd "$HZ_CWD" 2>/dev/null || cd "$HOME"
  bash -c "$HZ_CMD"; HZ_RC=$?
  hz_send C "$PWD"; hz_send X "$HZ_RC"
  exit "$HZ_RC"
fi
HZ_HDR="trap 'pwd >\"$HZ_DIR/cwd\" 2>/dev/null' EXIT; "
if [ "$HZ_TRACE" = 1 ]; then HZ_HDR="${HZ_HDR}set -x; "; fi
printf '%s%s\n' "$HZ_HDR" "$HZ_CMD" > "$HZ_DIR/job.sh"
hz_reader() {
  local LC_ALL=C c rc echoed=0
  exec 5<"$HZ_DIR/out"
  while :; do
    c=""
    IFS= read -r -t 0.2 -N 2048 c <&5; rc=$?
    if [ -n "$c" ]; then
      hz_send O "$c"
      if [ "$echoed" -lt 262144 ]; then printf '%s' "$c"; echoed=$((echoed + ${#c})); fi
    fi
    if [ "$rc" -ne 0 ] && [ "$rc" -le 128 ]; then break; fi
  done
}
set -m
hz_reader &
HZ_RPID=$!
(
  cd "$HZ_CWD" 2>/dev/null || cd "$HOME"
  trap - PIPE
  export PS4='›› '
  exec bash "$HZ_DIR/job.sh"
) < /dev/null > "$HZ_DIR/out" 2>&1 3>&- &
HZ_JPID=$!
(
  while IFS= read -r HZ_M <&3; do
    if [ "$HZ_M" = K ]; then
      kill -TERM -- "-$HZ_JPID" 2>/dev/null || kill -TERM "$HZ_JPID" 2>/dev/null
      command -v pkill >/dev/null 2>&1 && pkill -TERM -P "$HZ_JPID" 2>/dev/null
      ( sleep 3; kill -KILL -- "-$HZ_JPID" 2>/dev/null ) &
    fi
  done
) &
HZ_CPID=$!
wait "$HZ_JPID"; HZ_RC=$?
HZ_I=0
while kill -0 "$HZ_RPID" 2>/dev/null && [ "$HZ_I" -lt 20 ]; do sleep 0.1; HZ_I=$((HZ_I + 1)); done
kill "$HZ_RPID" "$HZ_CPID" 2>/dev/null
HZ_FIN=$(cat "$HZ_DIR/cwd" 2>/dev/null)
hz_send C "${HZ_FIN:-$HZ_CWD}"
hz_send X "$HZ_RC"
exec 3>&-
rm -rf "$HZ_DIR"
exit "$HZ_RC"
