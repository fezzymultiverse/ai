package __APPID__

import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.InputStream
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * V1.33.0 Horizon Shell: runs one shell command through /system/bin/sh with ProcessBuilder, off the UI thread,
 * inside the app's private folder (filesDir/shell). No root, no Termux, no bridge.
 * Limits, stated plainly: the process runs as Horizon's own Android user, so it can read Horizon's own data;
 * it can only use what Android ships (toybox: ls, cat, grep, sed, find, ps, ...); on Android 10+ files written
 * to filesDir cannot be executed as programs. The JS side gates it (off by default, asks before every AI command).
 */
@CapacitorPlugin(name = "HorizonShell")
class HorizonShellPlugin : Plugin() {
    private val pool = Executors.newFixedThreadPool(2)
    private val running = AtomicInteger(0)

    private fun workDir(): File {
        val d = File(context.filesDir, "shell")
        if (!d.exists()) d.mkdirs()
        return d
    }

    private fun drain(input: InputStream, cap: Int, flag: BooleanArray): ByteArrayOutputStream {
        val out = ByteArrayOutputStream()
        val buf = ByteArray(4096)
        try {
            while (true) {
                val n = input.read(buf)
                if (n < 0) break
                val room = cap - out.size()
                if (room > 0) out.write(buf, 0, minOf(n, room))
                if (n > room) flag[0] = true   // keep reading so the process never blocks on a full pipe
            }
        } catch (_: Exception) { /* stream closed */ }
        return out
    }

    @PluginMethod
    fun cwd(call: PluginCall) {
        val r = JSObject()
        r.put("cwd", workDir().absolutePath)
        r.put("sdk", Build.VERSION.SDK_INT)
        call.resolve(r)
    }

    @PluginMethod
    fun execute(call: PluginCall) {
        val cmd = call.getString("cmd", "") ?: ""
        if (cmd.isBlank()) { call.reject("empty command"); return }
        if (cmd.length > 4000) { call.reject("command too long"); return }
        val timeoutMs = (call.getInt("timeoutMs", 15000) ?: 15000).coerceIn(500, 60000).toLong()
        val maxBytes = (call.getInt("maxBytes", 65536) ?: 65536).coerceIn(1024, 262144)
        if (running.get() >= 2) { call.reject("two commands are already running"); return }
        running.incrementAndGet()
        pool.execute {
            val started = System.currentTimeMillis()
            var proc: Process? = null
            try {
                val dir = workDir()
                val pb = ProcessBuilder("/system/bin/sh", "-c", cmd)
                pb.directory(dir)
                val env = pb.environment()
                env["HOME"] = dir.absolutePath
                env["TMPDIR"] = context.cacheDir.absolutePath
                env["PATH"] = "/system/bin:/system/xbin"
                env["TERM"] = "dumb"
                pb.redirectErrorStream(false)
                proc = pb.start()
                try { proc.outputStream.close() } catch (_: Exception) { }   // no stdin: commands that wait for input end at once
                val p = proc
                val oFlag = BooleanArray(1)
                val eFlag = BooleanArray(1)
                var outBuf: ByteArrayOutputStream? = null
                var errBuf: ByteArrayOutputStream? = null
                val t1 = Thread { outBuf = drain(p.inputStream, maxBytes, oFlag) }
                val t2 = Thread { errBuf = drain(p.errorStream, maxBytes, eFlag) }
                t1.start(); t2.start()
                var timedOut = false
                var code = -1
                val deadline = started + timeoutMs
                while (true) {
                    try { code = p.exitValue(); break } catch (_: IllegalThreadStateException) { /* still running */ }
                    if (System.currentTimeMillis() > deadline) { timedOut = true; p.destroyForcibly(); break }
                    Thread.sleep(25)
                }
                t1.join(1500); t2.join(1500)
                val r = JSObject()
                r.put("stdout", String(outBuf?.toByteArray() ?: ByteArray(0), Charsets.UTF_8))
                r.put("stderr", String(errBuf?.toByteArray() ?: ByteArray(0), Charsets.UTF_8))
                r.put("exitCode", if (timedOut) -1 else code)
                r.put("timedOut", timedOut)
                r.put("truncated", oFlag[0] || eFlag[0])
                r.put("cwd", dir.absolutePath)
                r.put("ms", System.currentTimeMillis() - started)
                call.resolve(r)
            } catch (e: Exception) {
                try { proc?.destroyForcibly() } catch (_: Exception) { }
                call.reject("shell failed: " + (e.message ?: e.javaClass.simpleName))
            } finally {
                running.decrementAndGet()
            }
        }
    }

    override fun handleOnDestroy() {
        pool.shutdownNow()
        super.handleOnDestroy()
    }
}
