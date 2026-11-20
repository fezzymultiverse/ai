package __APPID__

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * V1.74.0 Horizon Daemon: the native half of the Proactive Daemon (Settings > Proactive Daemon).
 *
 * Watches two things for as long as Horizon's process is alive (open, in the background with music or a reply running, or kept alive by
 * the media / AI services). It does NOT run when Android has killed Horizon.
 *  - Battery: when the level falls to the threshold while NOT charging, it fires once ("batteryLow") and re-arms when the phone is
 *    plugged in or the level climbs 5 points above the threshold. At most one alert per 30 minutes, even across app restarts.
 *  - Heat: when Android reports a SEVERE (or worse) thermal status it fires "thermalHot". This stands in for CPU load, because since
 *    Android 8 an app is not allowed to read /proc/stat, so real CPU usage is invisible to Horizon.
 *
 * The page decides what to do about it (pause the music, stop reading aloud) and then calls notify() with the truth about what it did.
 * If the page does not answer within 4 seconds, a plain notification is posted from here, so the alert is never lost.
 *
 *  - start({ threshold }):   begin watching. Resolves { level, charging, thermal, running }.
 *  - stop():                 stop watching.
 *  - status():               { running, level, charging, thermal, threshold }
 *  - notify({ title, text }): post a banner notification (the same loud channel as a finished reply).
 *  - test({ kind }):         fire the same event a real alert would ("battery" or "heat") without waiting for the phone to drain.
 */
@CapacitorPlugin(name = "HorizonDaemon")
class HorizonDaemonPlugin : Plugin() {

    companion object {
        private const val PREFS = "horizon_daemon"
        private const val KEY_LAST_BATTERY = "last_battery_alert"
        private const val COOLDOWN_MS = 30L * 60L * 1000L
        private const val NOTE_BATTERY = 7301
        private const val NOTE_HEAT = 7302
        private const val FALLBACK_MS = 4000L
    }

    private val main = Handler(Looper.getMainLooper())
    private var receiver: BroadcastReceiver? = null
    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
    private var threshold = 15
    private var armed = true
    private var lastHeatAt = 0L
    private var pendingBattery: Runnable? = null
    private var pendingHeat: Runnable? = null
    private var pendingBatteryText = ""
    private var pendingHeatText = ""

    private fun battery(): Triple<Int, Boolean, Int> {
        val i = context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        if (i == null) return Triple(-1, false, 0)
        val level = i.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
        val scale = i.getIntExtra(BatteryManager.EXTRA_SCALE, 100)
        val pct = if (level >= 0 && scale > 0) level * 100 / scale else -1
        val plugged = i.getIntExtra(BatteryManager.EXTRA_PLUGGED, 0) != 0
        val status = i.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
        val charging = plugged || status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL
        return Triple(pct, charging, 0)
    }

    private fun thermal(): Int {
        if (Build.VERSION.SDK_INT < 29) return -1
        return try { (context.getSystemService(Context.POWER_SERVICE) as PowerManager).currentThermalStatus } catch (e: Throwable) { -1 }
    }

    private fun openIntent(): PendingIntent {
        val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: Intent()
        launch.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP
        return PendingIntent.getActivity(context, 7300, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun post(id: Int, title: String, text: String) {
        try { HorizonNotify.alert(context, id, title, text, openIntent()) } catch (e: Throwable) { /* no notification permission or channel problem */ }
    }

    private fun fireBattery(level: Int, force: Boolean) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val now = System.currentTimeMillis()
        if (!force) {
            if (now - prefs.getLong(KEY_LAST_BATTERY, 0L) < COOLDOWN_MS) return
            prefs.edit().putLong(KEY_LAST_BATTERY, now).apply()
        }
        pendingBatteryText = "Battery is at $level%. Plug in soon."
        val o = JSObject()
        o.put("level", level)
        o.put("test", force)
        notifyListeners("batteryLow", o)
        pendingBattery?.let { main.removeCallbacks(it) }
        val fallback = Runnable { post(NOTE_BATTERY, "Battery low", pendingBatteryText); pendingBattery = null }
        pendingBattery = fallback
        main.postDelayed(fallback, FALLBACK_MS)
    }

    private fun fireHeat(status: Int, force: Boolean) {
        val now = System.currentTimeMillis()
        if (!force) {
            if (now - lastHeatAt < COOLDOWN_MS) return
            lastHeatAt = now
        }
        pendingHeatText = "The phone is running hot. Let it cool down."
        val o = JSObject()
        o.put("status", status)
        o.put("test", force)
        notifyListeners("thermalHot", o)
        pendingHeat?.let { main.removeCallbacks(it) }
        val fallback = Runnable { post(NOTE_HEAT, "Phone is hot", pendingHeatText); pendingHeat = null }
        pendingHeat = fallback
        main.postDelayed(fallback, FALLBACK_MS)
    }

    private fun onBattery() {
        val (level, charging, _) = battery()
        if (level < 0) return
        if (charging) { armed = true; return }
        if (level >= threshold + 5) { armed = true; return }
        if (level <= threshold && armed) {
            armed = false
            fireBattery(level, false)
        }
    }

    private fun begin() {
        if (receiver == null) {
            val r = object : BroadcastReceiver() {
                override fun onReceive(c: Context?, i: Intent?) { onBattery() }
            }
            receiver = r
            ContextCompat.registerReceiver(context, r, IntentFilter(Intent.ACTION_BATTERY_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED)
        }
        if (thermalListener == null && Build.VERSION.SDK_INT >= 29) {
            try {
                val l = PowerManager.OnThermalStatusChangedListener { s ->
                    if (s >= PowerManager.THERMAL_STATUS_SEVERE) main.post { fireHeat(s, false) }
                }
                (context.getSystemService(Context.POWER_SERVICE) as PowerManager).addThermalStatusListener(l)
                thermalListener = l
            } catch (e: Throwable) { thermalListener = null }
        }
    }

    private fun end() {
        receiver?.let { try { context.unregisterReceiver(it) } catch (e: Throwable) { /* already gone */ } }
        receiver = null
        thermalListener?.let { l ->
            try { (context.getSystemService(Context.POWER_SERVICE) as PowerManager).removeThermalStatusListener(l) } catch (e: Throwable) { /* already gone */ }
        }
        thermalListener = null
    }

    private fun snapshot(): JSObject {
        val (level, charging, _) = battery()
        val o = JSObject()
        o.put("running", receiver != null)
        o.put("level", level)
        o.put("charging", charging)
        o.put("thermal", thermal())
        o.put("threshold", threshold)
        return o
    }

    @PluginMethod
    fun start(call: PluginCall) {
        threshold = (call.getInt("threshold", 15) ?: 15).coerceIn(5, 50)
        main.post {
            try {
                begin()
                // already below the threshold on start and not charging: say so once (the 30 minute cooldown stops a repeat on every launch)
                armed = true
                onBattery()
                call.resolve(snapshot())
            } catch (e: Throwable) {
                call.reject(e.message ?: e.javaClass.simpleName)
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        main.post { end(); call.resolve(snapshot()) }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(snapshot())
    }

    @PluginMethod
    fun notify(call: PluginCall) {
        val kind = call.getString("kind", "battery") ?: "battery"
        val title = call.getString("title", "Horizon") ?: "Horizon"
        val text = call.getString("text", "") ?: ""
        if (kind == "heat") { pendingHeat?.let { main.removeCallbacks(it) }; pendingHeat = null }
        else { pendingBattery?.let { main.removeCallbacks(it) }; pendingBattery = null }
        if (text.isBlank()) { call.reject("There is no text to show"); return }
        post(if (kind == "heat") NOTE_HEAT else NOTE_BATTERY, title, text)
        call.resolve()
    }

    @PluginMethod
    fun test(call: PluginCall) {
        val kind = call.getString("kind", "battery") ?: "battery"
        main.post {
            if (kind == "heat") fireHeat(thermal().coerceAtLeast(0), true)
            else fireBattery(battery().first.coerceAtLeast(0), true)
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        end()
        super.handleOnDestroy()
    }
}
