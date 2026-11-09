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
import org.json.JSONObject
import java.util.UUID

@CapacitorPlugin(name = "HorizonTermux", permissions = [Permission(alias = "termux", strings = ["com.termux.permission.RUN_COMMAND"])])
class HorizonTermuxPlugin : Plugin() {
    companion object {
        const val PERMISSION = "com.termux.permission.RUN_COMMAND"
        fun prefs(c: Context) = c.getSharedPreferences("horizon_termux", Context.MODE_PRIVATE)
    }
    @PluginMethod fun status(call: PluginCall) {
        val installed = try { context.packageManager.getPackageInfo("com.termux", 0); true } catch (_: Exception) { false }
        call.resolve(JSObject().put("installed", installed).put("enabled", prefs(context).getBoolean("enabled", false))
            .put("aiEnabled", prefs(context).getBoolean("aiEnabled", false))
            .put("permission", ContextCompat.checkSelfPermission(context, PERMISSION) == PackageManager.PERMISSION_GRANTED)
            .put("setup", "Termux must be initialized once and allow-external-apps=true enabled in ~/.termux/termux.properties. Android prevents Horizon changing that private setting."))
    }
    @PluginMethod fun configure(call: PluginCall) {
        val e = prefs(context).edit()
        for (key in arrayOf("enabled", "aiEnabled")) call.getBoolean(key)?.let { e.putBoolean(key, it) }
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
        activity.runOnUiThread {
            android.app.AlertDialog.Builder(activity).setTitle("Run in your Termux")
                .setMessage("This runs with Termux's access to your files and network. Only approve commands you trust.\n\n$cmd")
                .setNegativeButton("Cancel") { _, _ -> call.reject("Termux command cancelled") }
                .setOnCancelListener { call.reject("Termux command cancelled") }
                .setPositiveButton("Run") { _, _ -> submit(call, cmd) }.show()
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
