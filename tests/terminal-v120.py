#!/usr/bin/env python3
"""Host verification of the actual shipped Termux PTY transport, not an Android device test."""
import base64, hashlib, http.server, json, os, pathlib, shutil, socket, subprocess, tempfile, threading, time, unittest, uuid
SCRIPT = pathlib.Path(__file__).resolve().parents[1] / 'android-native/res/raw/horizon_live.sh'
class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.home = pathlib.Path(self.tmp.name)
    def tearDown(self): self.tmp.cleanup()
    def run_job(self, command, input_after=None, interrupt=False):
        listener=socket.socket(); listener.bind(('127.0.0.1',0)); listener.listen(1); listener.settimeout(15)
        job=str(uuid.uuid4()); token=uuid.uuid4().hex
        env=dict(os.environ,HOME=str(self.home),PREFIX='/usr')
        proc=subprocess.Popen(['bash',str(SCRIPT),str(listener.getsockname()[1]),token,job,'0',str(self.home),command],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        connection,_=listener.accept(); connection.settimeout(20); stream=connection.makefile('rb'); frames=[]; output=b''; sent=False
        try:
            while True:
                line=stream.readline()
                if not line: break
                kind,size=line.decode('ascii').strip().split(' '); data=stream.read(int(size)); frames.append((kind,data))
                if len(frames)==1: self.assertEqual((kind,data),('H',(token+' '+job).encode()))
                if kind=='O':
                    output+=data
                    if not sent and input_after and input_after[0] in output:
                        connection.sendall(b'I '+base64.b64encode(input_after[1])+b'\n');sent=True
                    if interrupt and not sent and b'READY' in output: connection.sendall(b'K\n');sent=True
                if kind=='X': break
            rc=proc.wait(timeout=10)
            self.assertTrue(any(k=='X' for k,d in frames),str(frames)+str(proc.stderr.read()))
            code=int([d for k,d in frames if k=='X'][-1]); self.assertEqual(rc,code)
            log=(self.home/'.cache/horizon-terminal/jobs'/f'{job}.log').read_bytes();self.assertEqual(log,output)
            self.assertEqual(frames[-1][0],'X','Exit must follow all drained output')
            return code,output.decode('utf-8'),[d.decode() for k,d in frames if k=='C'][-1]
        finally:
            stream.close();connection.close();listener.close()
            if proc.poll() is None: proc.kill();proc.wait()
            proc.stdout.close();proc.stderr.close()
    def test_01_original_quoting_unicode_multiline(self):
        code,out,cwd=self.run_job("printf '%s\\n' 'quotes: \"a b\" $HOME `literal`' '日本語 🎵 café'; printf 'line2\\n'")
        self.assertEqual(code,0);self.assertIn('日本語 🎵 café',out);self.assertIn('$HOME `literal`',out)
    def test_02_exit_codes_not_wrapper_exit_one(self):
        for command,code in [('true',0),('false',1),('exit 7',7),('printf \"x\\n\"; exit 23',23),('if then',2)]:
            with self.subTest(command=command): self.assertEqual(self.run_job(command)[0],code)
    def test_03_large_output_not_cut_off(self):
        code,out,_=self.run_job("python -c \"import sys; sys.stdout.write('A'*1200000+'THE_END\\n')\"")
        self.assertEqual(code,0);self.assertIn('THE_END',out);self.assertGreater(len(out),1200000)
    def test_04_input_and_hidden_password(self):
        code,out,_=self.run_job("printf 'PASSWORD: '; read -r secret; [ \"$secret\" = 'sensitive value' ] && printf '\\nAUTH_OK\\n'",(b'PASSWORD:',b'sensitive value\n'))
        self.assertEqual(code,0);self.assertIn('AUTH_OK',out);self.assertNotIn('sensitive value',out)
    def test_05_cwd_and_interrupt(self):
        (self.home/'sub folder').mkdir();code,out,cwd=self.run_job("cd 'sub folder'; pwd")
        self.assertEqual(code,0);self.assertEqual(cwd,str(self.home/'sub folder'))
        code,out,_=self.run_job("printf 'READY\\n'; sleep 60",interrupt=True);self.assertEqual(code,130)
    def test_06_actual_download_and_upload(self):
        if not shutil.which('curl'): self.skipTest('curl unavailable')
        payload=os.urandom(250000);received=[]
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(s): s.send_response(200);s.send_header('Content-Length',str(len(payload)));s.end_headers();s.wfile.write(payload)
            def do_PUT(s): received.append(s.rfile.read(int(s.headers['Content-Length'])));s.send_response(200);s.end_headers();s.wfile.write(b'UPLOADED')
            def log_message(*args): pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);t=threading.Thread(target=server.serve_forever,daemon=True);t.start()
        try:
            base=f'http://127.0.0.1:{server.server_port}'
            code,out,_=self.run_job(f'curl --fail -sS -o downloaded.bin {base}/file && curl --fail -sS --upload-file downloaded.bin {base}/upload')
            self.assertEqual(code,0);self.assertEqual((self.home/'downloaded.bin').read_bytes(),payload);self.assertEqual(received,[payload]);self.assertIn('UPLOADED',out)
        finally: server.shutdown();server.server_close()
    def test_07_actual_git_push(self):
        if not shutil.which('git'): self.skipTest('git unavailable')
        command='git init -q --bare remote.git && git init -q work && cd work && git config user.name HorizonTest && git config user.email test@example.invalid && printf test > file.txt && git add file.txt && git commit -qm Initial && git remote add origin ../remote.git && git push -u origin HEAD'
        code,out,_=self.run_job(command);self.assertEqual(code,0);self.assertIn('new branch',out)
        self.assertTrue(any((self.home/'remote.git/refs/heads').iterdir()))
if __name__=='__main__': unittest.main(verbosity=2)
