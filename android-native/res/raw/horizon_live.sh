#!/data/data/com.termux/files/usr/bin/bash
# Real Termux bash + PTY. Arguments are passed verbatim, never interpolated into code.
# Python is the only extra dependency: pkg install python
if ! command -v python >/dev/null 2>&1; then
  printf '%s\n' 'Horizon live terminal needs Python in Termux. Open Termux and run: pkg install python' >&2
  exit 127
fi
exec python - "$@" <<'HORIZON_PY'
import base64, errno, fcntl, json, os, pty, select, signal, socket, struct, sys, tempfile, termios, time
port, token, job, trace, cwd, command = sys.argv[1:7]
if not job.replace('-', '').isalnum():
    sys.exit(125)
sock = socket.create_connection(('127.0.0.1', int(port)), timeout=20)
sock.settimeout(None)
def frame(kind, payload):
    if not isinstance(payload, bytes): payload = str(payload).encode('utf-8')
    sock.sendall(kind.encode('ascii') + b' ' + str(len(payload)).encode('ascii') + b'\n' + payload)
frame('H', token + ' ' + job)
base = os.path.join(os.path.expanduser('~'), '.cache', 'horizon-terminal', 'jobs')
os.makedirs(base, mode=0o700, exist_ok=True)
os.chmod(base, 0o700)
logpath = os.path.join(base, job + '.log')
metapath = os.path.join(base, job + '.json')
cwdpath = os.path.join(base, job + '.cwd')
log = open(logpath, 'wb'); os.chmod(logpath, 0o600)
frame('N', 'Full output log: ' + logpath + '\nPlain terminal mode; full-screen editors are best opened in Termux itself.')
shell = os.environ.get('PREFIX', '/data/data/com.termux/files/usr') + '/bin/bash'
if not os.path.isfile(shell): shell = '/bin/bash'  # Test host only; Android uses PREFIX.
frame('B', shell)
# A private EXIT trap captures cd without adding markers to command stdout or altering its exit status.
script = "trap '__hz_status=$?; builtin pwd -P > \"$HZ_CWD_FILE\"; exit \"$__hz_status\"' EXIT\n" + command + '\n'
pid, master = pty.fork()
if pid == 0:
    try:
        os.chdir(os.path.expanduser(cwd) if cwd else os.path.expanduser('~'))
        env = os.environ.copy()
        env.update({'TERM': 'dumb', 'NO_COLOR': '1', 'CLICOLOR': '0', 'HZ_CWD_FILE': cwdpath})
        # The UI does not echo submitted input, and the PTY does not echo passwords.
        attrs = termios.tcgetattr(0); attrs[3] &= ~termios.ECHO; termios.tcsetattr(0, termios.TCSANOW, attrs)
        args = [shell, '-l', '-c', script]
        if trace == '1': args = [shell, '-l', '-x', '-c', script]
        os.execve(shell, args, env)
    except BaseException as exc:
        os.write(2, (str(exc) + '\n').encode('utf-8')); os._exit(126)
fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack('HHHH', 32, 100, 0, 0))
control = b''; child_status = None; ended_at = None; interrupted_at = None; pty_open = True
try:
    while True:
        watch = [sock] + ([master] if pty_open else [])
        ready, _, _ = select.select(watch, [], [], 0.08)
        if master in ready:
            try: data = os.read(master, 32768)
            except OSError as exc:
                if exc.errno == errno.EIO: data = b''
                else: raise
            if data:
                log.write(data); log.flush(); frame('O', data)
            else: pty_open = False
        if sock in ready:
            data = sock.recv(8192)
            if not data: raise ConnectionError('Horizon disconnected')
            control += data
            if len(control) > 1000000: raise ValueError('Input frame too long')
            while b'\n' in control:
                row, control = control.split(b'\n', 1)
                if row == b'K':
                    interrupted_at = time.monotonic()
                    try: os.killpg(pid, signal.SIGINT)
                    except ProcessLookupError: pass
                elif row.startswith(b'I '):
                    text = base64.b64decode(row[2:], validate=True)
                    if len(text) <= 262144 and pty_open:
                        view = memoryview(text)
                        while view:
                            n = os.write(master, view); view = view[n:]
        if child_status is None:
            got, status = os.waitpid(pid, os.WNOHANG)
            if got:
                child_status = os.waitstatus_to_exitcode(status)
                ended_at = time.monotonic()
        if interrupted_at and time.monotonic() - interrupted_at > 2 and child_status is None:
            try: os.killpg(pid, signal.SIGKILL)
            except ProcessLookupError: pass
        # Drain the PTY BEFORE X, so completion cannot drop trailing output.
        if child_status is not None and (not pty_open or time.monotonic() - ended_at > 2): break
    code = child_status if child_status >= 0 else 128 - child_status
    final_cwd = cwd or os.path.expanduser('~')
    try:
        with open(cwdpath) as f: final_cwd = f.read().rstrip('\n') or final_cwd
        os.remove(cwdpath)
    except OSError: pass
    with open(metapath, 'w') as f: json.dump({'exitCode': code, 'cwd': final_cwd, 'log': logpath}, f)
    os.chmod(metapath, 0o600)
    frame('C', final_cwd); frame('X', code)
except BaseException as exc:
    try: os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError: pass
    try: os.waitpid(pid, 0)
    except ChildProcessError: pass
    code = 125
    try: frame('N', 'Terminal transport failed: ' + str(exc)); frame('X', code)
    except OSError: pass
finally:
    log.close(); os.close(master); sock.close()
sys.exit(code & 255)
HORIZON_PY
