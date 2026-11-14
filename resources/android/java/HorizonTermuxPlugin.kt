package __APPID__

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.InetAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.nio.ByteBuffer
import java.nio.CharBuffer
import java.nio.charset.CodingErrorAction
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

@CapacitorPlugin(name = "HorizonTermux", permissions = [Permission(alias = "termux", strings = ["com.termux.permission.RUN_COMMAND"])])
class HorizonTermuxPlugin : Plugin() {
    companion object {
        const val PERMISSION = "com.termux.permission.RUN_COMMAND"
        fun prefs(c: Context) = c.getSharedPreferences("horizon_termux", Context.MODE_PRIVATE)
        private val live = ConcurrentHashMap<String, LiveJob>()
        private val GUARDS: List<Pair<Regex, String>> = listOf(
            Regex("""(^|[;&|(]\s*)(sudo|su|tsu|doas)(\s|$)""") to "root / privilege escalation",
            Regex("""\brm\b[^;&|\n]*\s(/|/\*|~/?|~/\*|[$]HOME/?|[$]HOME/\*|[$]PREFIX/?|\.\.?/?|\*)(\s|$|[;&|])""") to "deletes /, home, PREFIX or the whole current folder",
            Regex(""":\(\)\s*\{""") to "fork bomb",
            Regex("""\bmkfs""") to "formats a filesystem",
            Regex("""\bdd\b[^;&|\n]*\bof=/dev/""") to "writes to a raw device",
            Regex("""(curl|wget)[^|;&\n]*\|\s*(ba|z|da|k)?sh\b""") to "pipes a download straight into a shell",
            Regex("""(chmod|chown)\s+-R\s+\S+\s+(/|~|[$]HOME)(\s|$)""") to "recursive permission change on /, home",
            Regex("""\brm\b[^;&|\n]*\s["']?(/|~|[$]HOME|[$][{]HOME[}]|[$]PREFIX|[$][{]PREFIX[}]|\.\.?|/data/data/com\.termux/files/(home|usr))/?\*?["']?(\s|$|[;&|])""") to "deletes /, home, PREFIX or the whole current folder (quoted or spelled out)",
            Regex("""\brm\b[^;&|\n]*\s["']?\./?\*["']?(\s|$|[;&|])""") to "deletes everything in the current folder",
            Regex("""\bfind\b[^;&|\n]*(-delete|-exec\s+rm)""") to "bulk delete with find",
            Regex("""(<\(|[$]\(|`)\s*(curl|wget)\b""") to "runs or sources a download (process / command substitution)",
            Regex("""\b(curl|wget)\b[^\n]*(&&|;)\s*(sudo\s+)?(ba|z|da|k)?sh\s+\S+""") to "downloads a script then runs it",
            Regex("""\.bashrc""") to "touches .bashrc (back it up first)"
        )
        fun guardReason(cmd: String): String? {
            if (cmd.contains("bashrc") && Regex("""cp\s[^;&|\n]*\.bashrc[^;&|\n]*\.(bak|backup)|\.bashrc\.(bak|backup)""").containsMatchIn(cmd)) {
                return GUARDS.filter { !it.second.startsWith("touches .bashrc") }.firstOrNull { it.first.containsMatchIn(cmd) }?.second
            }
            return GUARDS.firstOrNull { it.first.containsMatchIn(cmd) }?.second
        }
    }

    private class LiveJob(val id: String, val token: String, val server: ServerSocket) {
        @Volatile var out: java.io.OutputStream? = null
    }
    private class Utf8Stream {
        private val dec = Charsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPLACE).onUnmappableCharacter(CodingErrorAction.REPLACE)
        private var carry = ByteArray(0)
        fun feed(b: ByteArray): String {
            val inb = ByteBuffer.wrap(carry + b)
            val outb = CharBuffer.allocate(inb.remaining() + 4)
            dec.reset(); dec.decode(inb, outb, false)
            carry = ByteArray(inb.remaining()).also { inb.get(it) }
            outb.flip(); return outb.toString()
        }
    }
    private data class Approval(val call: PluginCall, val expires: Long, val run: () -> Unit, val timeout: Runnable)
    private val approvals = ConcurrentHashMap<String, Approval>()
    private val approvalHandler = android.os.Handler(android.os.Looper.getMainLooper())
    private fun approveInPage(call: PluginCall, cmd: String, title: String, warning: String = "", run: () -> Unit) {
        activity.runOnUiThread {
            if (approvals.isNotEmpty()) { call.reject("Review the pending Termux command first"); return@runOnUiThread }
            val token = UUID.randomUUID().toString()
            val timeout = Runnable { approvals.remove(token)?.call?.reject("Termux approval expired") }
            approvals[token] = Approval(call, android.os.SystemClock.elapsedRealtime() + 120000L, run, timeout)
            approvalHandler.postDelayed(timeout, 120000L)
            val payload = JSONObject().put("token", token).put("title", title).put("command", cmd).put("warning", warning)
            val script = "window.dispatchEvent(new CustomEvent('horizon-termux-approval',{detail:" + payload.toString() + "}))"
            bridge.webView.evaluateJavascript(script, null)
        }
    }
    @PluginMethod fun resolveApproval(call: PluginCall) {
        activity.runOnUiThread {
            val token = call.getString("token") ?: ""
            val pending = approvals.remove(token)
            if (pending == null) { call.reject("Unknown or expired approval"); return@runOnUiThread }
            approvalHandler.removeCallbacks(pending.timeout)
            if (call.getBoolean("approved", false) != true || HorizonLockPlugin.locked || android.os.SystemClock.elapsedRealtime() > pending.expires) {
                pending.call.reject("Termux command cancelled or approval expired"); call.resolve(); return@runOnUiThread
            }
            // startLive/submit recheck permissions, lock and enabled state at execution time.
            pending.run(); call.resolve()
        }
    }
    override fun handleOnDestroy() {
        approvals.values.forEach { approvalHandler.removeCallbacks(it.timeout); it.call.reject("Termux approval cancelled: page closed") }
        approvals.clear(); super.handleOnDestroy()
    }
    @PluginMethod fun status(call: PluginCall) {
        val installed = try { context.packageManager.getPackageInfo("com.termux", 0); true } catch (_: Exception) { false }
        call.resolve(JSObject().put("installed", installed).put("enabled", prefs(context).getBoolean("enabled", false))
            .put("aiEnabled", prefs(context).getBoolean("aiEnabled", false))
            .put("aiAuto", prefs(context).getBoolean("aiAuto", false))
            .put("manualAuto", prefs(context).getBoolean("manualAuto", false))
            .put("live", true)
            .put("permission", ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED)
            .put("setup", "Termux must be initialized once and allow-external-apps=true enabled in ~/.termux/termux.properties. Android prevents Horizon changing that private setting."))
    }
    @PluginMethod fun configure(call: PluginCall) {
        val e = prefs(context).edit()
        for (key in arrayOf("enabled", "aiEnabled", "aiAuto", "manualAuto")) call.getBoolean(key)?.let { e.putBoolean(key, it) }
        e.commit(); call.resolve()
    }
    @PluginMethod fun requestAccess(call: PluginCall) { requestPermissionForAlias("termux", call, "permissionResult") }
    @PermissionCallback private fun permissionResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("termux") == PermissionState.GRANTED))
    }
    @PluginMethod fun openTermux(call: PluginCall) {
        try {
            val intent = context.packageManager.getLaunchIntentForPackage("com.termux") ?: throw IllegalStateException("Install the standard Termux app first")
            activity.startActivity(intent); call.resolve()
        } catch (e: Exception) { call.reject(e.message) }
    }
    @PluginMethod fun execute(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon to run commands"); return }
        if (call.getBoolean("fromAI", false) == true && !prefs(context).getBoolean("aiEnabled", false)) { call.reject("AI commands are off in Terminal Controls"); return }
        if (!prefs(context).getBoolean("enabled", false)) { call.reject("Termux bridge is off in Terminal Controls"); return }
        if (ContextCompat.checkSelfPermission(context, PERMISSION) != PackageManager.PERMISSION_GRANTED) { call.reject("Grant the Termux Run commands permission first"); return }
        val cmd = call.getString("cmd")?.trim() ?: ""
        if (cmd.isEmpty() || cmd.length > 8000 || cmd.contains('\u0000')) { call.reject("Command must contain 1–8000 characters"); return }
        approveInPage(call, cmd, "Run in your Termux", "Runs with Termux's file and network access. Android's Run commands permission is still required.") { submit(call, cmd) }
    }

    // V1.90.0: live run. Termux connects back to a one-shot 127.0.0.1 socket (token protected) and streams merged output as it happens.
    @PluginMethod fun executeLive(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon to run commands"); return }
        val fromAI = call.getBoolean("fromAI", false) == true
        val p = prefs(context)
        if (fromAI && !p.getBoolean("aiEnabled", false)) { call.reject("AI commands are off in Terminal Controls"); return }
        if (!p.getBoolean("enabled", false)) { call.reject("Termux bridge is off in Terminal Controls"); return }
        if (ContextCompat.checkSelfPermission(context, PERMISSION) != PackageManager.PERMISSION_GRANTED) { call.reject("Grant the Termux Run commands permission first"); return }
        val cmd = call.getString("cmd")?.trim() ?: ""
        if (cmd.isEmpty() || cmd.length > 64000 || cmd.contains('\u0000')) { call.reject("Command must contain 1–64000 characters"); return }
        val trace = call.getBoolean("trace", true) == true
        val cwd = call.getString("cwd") ?: ""
        val reason = guardReason(cmd)
        val auto = reason == null && ((fromAI && p.getBoolean("aiAuto", false)) || (!fromAI && p.getBoolean("manualAuto", false)))
        if (auto) { startLive(call, cmd, fromAI, trace, cwd); return }
        approveInPage(call, cmd, if (fromAI) "AI wants to run in your Termux" else "Run in your Termux",
            if (reason != null) "GUARD: $reason. Auto-run is paused for this command." else "Output streams live into Horizon. Runs as Termux, not root.") {
            startLive(call, cmd, fromAI, trace, cwd)
        }
    }
    private fun startLive(call: PluginCall, cmd: String, fromAI: Boolean, trace: Boolean, cwd: String) {
        var pending: PendingIntent? = null
        var server: ServerSocket? = null
        val id = UUID.randomUUID().toString()
        try {
            if (HorizonLockPlugin.locked) throw IllegalStateException("Unlock Horizon to run commands")
            val p = prefs(context)
            if (fromAI && !p.getBoolean("aiEnabled", false)) throw IllegalStateException("AI command permission was revoked")
            if (!p.getBoolean("enabled", false)) throw IllegalStateException("Termux bridge was switched off")
            val script = context.resources.openRawResource(context.resources.getIdentifier("horizon_live", "raw", context.packageName)).bufferedReader().use { it.readText() }
            server = ServerSocket(0, 1, InetAddress.getByName("127.0.0.1"))
            val token = UUID.randomUUID().toString().replace("-", "")
            val job = LiveJob(id, token, server); live[id] = job
            val callback = Intent(context, HorizonTermuxResultReceiver::class.java).apply {
                action = "${context.packageName}.TERMUX_RESULT"; data = Uri.parse("horizon://termux/$id")
            }
            var flags = PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT
            if (Build.VERSION.SDK_INT >= 31) flags = flags or PendingIntent.FLAG_MUTABLE
            pending = PendingIntent.getBroadcast(context, id.hashCode(), callback, flags)
            val edit = p.edit()
            p.all.forEach { (key, value) -> if (key.startsWith("job:")) {
                val age = try { System.currentTimeMillis() - JSONObject(value.toString()).optLong("created") } catch (_: Exception) { Long.MAX_VALUE }
                if (age > 86400000L) edit.remove(key)
            } }
            edit.putString("job:$id", JSONObject().put("id", id).put("status", "submitted").put("created", System.currentTimeMillis()).toString()).commit()
            Thread { serve(job) }.start()
            val intent = Intent("com.termux.RUN_COMMAND").apply {
                setClassName("com.termux", "com.termux.app.RunCommandService")
                putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash")
                putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-lc", script, "horizon-live", server.localPort.toString(), token, id, if (trace) "1" else "0", cwd, cmd))
                putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "Horizon live command")
                putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pending)
            }
            context.startService(intent)
            call.resolve(JSObject().put("jobId", id).put("submitted", true).put("live", true))
        } catch (e: Exception) {
            pending?.cancel(); live.remove(id); try { server?.close() } catch (_: Exception) {}
            prefs(context).edit().remove("job:$id").apply()
            call.reject("Termux refused the command: ${e.message}. Check its Run commands permission and allow-external-apps setting.")
        }
    }
    @PluginMethod fun liveKill(call: PluginCall) {
        val job = live[call.getString("jobId") ?: ""]
        val out = job?.out
        if (out == null) { call.reject("No live channel for that job; stop it in Termux itself"); return }
        Thread { try { synchronized(out) { out.write("K\n".toByteArray()); out.flush() } } catch (_: Exception) {} }.start()
        call.resolve()
    }
    private fun emit(id: String, batch: JSONArray) {
        if (batch.length() > 0) HorizonAIPlugin.dispatchToJs("horizon-termux-live", JSONObject().put("id", id).put("ev", batch).toString())
    }
    private fun serve(job: LiveJob) {
        var sock: Socket? = null
        var batch = JSONArray()
        var batchChars = 0
        var total = 0
        var lastFlush = System.currentTimeMillis()
        fun flush() { emit(job.id, batch); batch = JSONArray(); batchChars = 0; lastFlush = System.currentTimeMillis() }
        fun add(t: String, d: String) { batch.put(JSONObject().put("t", t).put("d", d)); batchChars += d.length }
        try {
            job.server.soTimeout = 30000
            val s: Socket = try { job.server.accept() } catch (_: SocketTimeoutException) { add("N", "Live channel did not connect; the final result will still arrive."); flush(); return }
            sock = s
            s.soTimeout = 80
            job.out = s.getOutputStream()
            val input = s.getInputStream()
            val acc = ByteArrayOutputStream()
            val buf = ByteArray(8192)
            val utf = Utf8Stream()
            var type = ""; var need = -1; var authed = false; var capped = false
            while (true) {
                val n = try { input.read(buf) } catch (_: SocketTimeoutException) { if (batchChars > 0) flush(); continue }
                if (n < 0) break
                acc.write(buf, 0, n)
                var data = acc.toByteArray(); var pos = 0
                while (true) {
                    if (need < 0) {
                        var nl = -1
                        for (i in pos until data.size) if (data[i] == 10.toByte()) { nl = i; break }
                        if (nl < 0) { if (data.size - pos > 64) return; break }
                        val hdr = String(data, pos, nl - pos).split(" ")
                        pos = nl + 1
                        if (hdr.size != 2) return
                        type = hdr[0]; need = hdr[1].toIntOrNull() ?: return
                    }
                    if (data.size - pos < need) break
                    val payload = data.copyOfRange(pos, pos + need); pos += need; need = -1
                    if (!authed) {
                        if (type != "H" || String(payload) != "${job.token} ${job.id}") return
                        authed = true; continue
                    }
                    if (type == "O") {
                        val txt = utf.feed(payload); total += txt.length
                        if (total <= 4_000_000) add("O", txt) else if (!capped) { capped = true; add("N", "[output cap reached, the rest is not shown live]") }
                    } else add(type, String(payload))
                    if (type == "C" || type == "X" || batchChars > 24000) flush()
                }
                acc.reset(); if (pos < data.size) acc.write(data, pos, data.size - pos)
                if (System.currentTimeMillis() - lastFlush >= 80) flush()
            }
        } catch (_: Exception) {
        } finally {
            try { flush() } catch (_: Exception) {}
            try { sock?.close() } catch (_: Exception) {}
            try { job.server.close() } catch (_: Exception) {}
            job.out = null; live.remove(job.id)
        }
    }

    private fun submit(call: PluginCall, cmd: String) {
        var pending: PendingIntent? = null
        val id = UUID.randomUUID().toString()
        try {
            if (HorizonLockPlugin.locked) throw IllegalStateException("Unlock Horizon to run commands")
            if (call.getBoolean("fromAI", false) == true && !prefs(context).getBoolean("aiEnabled", false)) throw IllegalStateException("AI command permission was revoked")
            if (!prefs(context).getBoolean("enabled", false)) throw IllegalStateException("Termux bridge was switched off")
            val callback = Intent(context, HorizonTermuxResultReceiver::class.java).apply {
                action = "${context.packageName}.TERMUX_RESULT"
                data = Uri.parse("horizon://termux/$id")
            }
            var flags = PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT
            if (Build.VERSION.SDK_INT >= 31) flags = flags or PendingIntent.FLAG_MUTABLE
            pending = PendingIntent.getBroadcast(context, id.hashCode(), callback, flags)
            val record = JSONObject().put("id", id).put("status", "submitted").put("created", System.currentTimeMillis())
            val p = prefs(context)
            val edit = p.edit()
            // Results survive a killed WebView but are bounded to one day.
            p.all.forEach { (key, value) -> if (key.startsWith("job:")) {
                val age = try { System.currentTimeMillis() - JSONObject(value.toString()).optLong("created") } catch (_: Exception) { Long.MAX_VALUE }
                if (age > 86400000L) edit.remove(key)
            } }
            edit.putString("job:$id", record.toString()).commit()
            val intent = Intent("com.termux.RUN_COMMAND").apply {
                setClassName("com.termux", "com.termux.app.RunCommandService")
                putExtra("com.termux.RUN_COMMAND_PATH", "/data/data/com.termux/files/usr/bin/bash")
                putExtra("com.termux.RUN_COMMAND_ARGUMENTS", arrayOf("-lc", cmd))
                putExtra("com.termux.RUN_COMMAND_WORKDIR", "/data/data/com.termux/files/home")
                putExtra("com.termux.RUN_COMMAND_BACKGROUND", true)
                putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "Horizon command")
                putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pending)
            }
            context.startService(intent)
            call.resolve(JSObject().put("jobId", id).put("submitted", true))
        } catch (e: Exception) {
            pending?.cancel(); prefs(context).edit().remove("job:$id").apply()
            call.reject("Termux refused the command: ${e.message}. Check its Run commands permission and allow-external-apps setting.")
        }
    }
    @PluginMethod fun jobs(call: PluginCall) {
        val rows = prefs(context).all.filter { it.key.startsWith("job:") }.values.mapNotNull {
            try { JSONObject(it.toString()) } catch (_: Exception) { null }
        }.sortedByDescending { it.optLong("created") }.take(20)
        val items = com.getcapacitor.JSArray(); rows.forEach { items.put(it) }
        call.resolve(JSObject().put("jobs", items))
    }
    @PluginMethod fun result(call: PluginCall) {
        val id = call.getString("jobId") ?: ""
        val raw = prefs(context).getString("job:$id", null)
        if (raw == null) { call.reject("Unknown Termux job"); return }
        call.resolve(JSObject(raw))
    }
}

class HorizonTermuxResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != "${context.packageName}.TERMUX_RESULT") return
        val id = intent.data?.lastPathSegment ?: return
        val p = HorizonTermuxPlugin.prefs(context)
        val old = p.getString("job:$id", null) ?: return
        val result = intent.getBundleExtra("result") ?: return
        val out = JSONObject(old)
        if (out.optString("status") != "submitted") return
        val err = result.getInt("err", -1)
        out.put("status", "complete").put("stdout", (result.getString("stdout") ?: "").take(32768))
            .put("stderr", (result.getString("stderr") ?: "").take(32768))
            .put("exitCode", result.getInt("exitCode", -1)).put("error", if (err == -1) "" else result.getString("errmsg") ?: "Termux error $err")
            .put("finished", System.currentTimeMillis())
        p.edit().putString("job:$id", out.toString()).commit()
        HorizonAIPlugin.dispatchToJs("horizon-termux-result", out.toString())
    }
}
