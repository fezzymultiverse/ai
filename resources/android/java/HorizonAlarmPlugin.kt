package __APPID__

import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.AlarmClock
import android.provider.OpenableColumns
import android.provider.Settings
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.Calendar

/**
 * V1.68.0 Horizon Alarms bridge for the calendar.
 *   status()                      what is allowed: exact alarms, notifications, full-screen, battery, song
 *   schedule({id, at, title, body, mode, song?, clock?})   mode "alarm" rings with a song, "remind" is a loud banner
 *   cancel({id})  stop()  snooze()
 *   pickSong() / clearSong()      choose the wake-up song from the phone
 *   openExactSettings() / openBattery() / openFullScreenSettings()
 */
@CapacitorPlugin(name = "HorizonAlarm")
class HorizonAlarmPlugin : Plugin() {

    @PluginMethod
    fun status(call: PluginCall) {
        val c = context
        val o = JSObject()
        o.put("exact", HorizonAlarms.canExact(c))
        o.put("notifications", HorizonNotify.canNotify(c))
        o.put("fullScreen", Build.VERSION.SDK_INT < 34 || (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).canUseFullScreenIntent())
        o.put("battery", try { (c.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(c.packageName) } catch (e: Exception) { false })
        o.put("song", HorizonAlarms.songName(c) ?: "")
        o.put("pending", HorizonAlarms.list(c).length())
        call.resolve(o)
    }

    @PluginMethod
    fun schedule(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id missing")
        val at = call.getLong("at") ?: return call.reject("time missing")
        val title = call.getString("title") ?: "Horizon"
        val body = call.getString("body") ?: ""
        val mode = if (call.getString("mode") == "alarm") "alarm" else "remind"
        val rep = (call.getString("repeat") ?: "").let { if (it == "daily" || it == "weekdays") it else "" }
        val ok = HorizonAlarms.arm(context, id, at, title, body, mode, call.getString("song"), rep, call.getBoolean("brief") == true)
        var clock = false
        if (ok && mode == "alarm" && call.getBoolean("clock") == true) clock = addToClock(at, body.ifEmpty { title })
        val o = JSObject()
        o.put("ok", ok); o.put("clock", clock); o.put("exact", HorizonAlarms.canExact(context))
        call.resolve(o)
    }

    /** The stock Clock app only takes an hour, minute and weekdays (no date), so this only works for the next 24 hours. */
    private fun addToClock(at: Long, label: String): Boolean {
        if (at - System.currentTimeMillis() > 24 * 3600_000L) return false
        return try {
            val cal = Calendar.getInstance().apply { timeInMillis = at }
            val i = Intent(AlarmClock.ACTION_SET_ALARM)
                .putExtra(AlarmClock.EXTRA_HOUR, cal.get(Calendar.HOUR_OF_DAY))
                .putExtra(AlarmClock.EXTRA_MINUTES, cal.get(Calendar.MINUTE))
                .putExtra(AlarmClock.EXTRA_MESSAGE, label.take(60))
                .putExtra(AlarmClock.EXTRA_SKIP_UI, true)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(i)
            true
        } catch (e: Exception) { false }
    }

    /** The page asks, after it starts or comes back: did the user just tap Stop on an alarm with the morning brief on? */
    @PluginMethod
    fun consumeBrief(call: PluginCall) { call.resolve(JSObject().put("pending", HorizonAlarms.takeBriefPending(context))) }

    @PluginMethod
    fun nextRing(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id missing")
        val o = HorizonAlarms.find(context, id)
        call.resolve(JSObject().put("at", o?.optLong("at") ?: 0L).put("repeat", o?.optString("repeat") ?: ""))
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getInt("id") ?: return call.reject("id missing")
        HorizonAlarms.cancel(context, id)
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        context.startService(Intent(context, HorizonAlarmService::class.java).setAction(HorizonAlarmService.ACT_STOP))
        call.resolve()
    }

    @PluginMethod
    fun snooze(call: PluginCall) {
        context.startService(Intent(context, HorizonAlarmService::class.java).setAction(HorizonAlarmService.ACT_SNOOZE))
        call.resolve()
    }

    @PluginMethod
    fun pickSong(call: PluginCall) {
        val i = Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType("audio/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION)
        startActivityForResult(call, i, "songResult")
    }

    @ActivityCallback
    private fun songResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri: Uri? = result.data?.data
        if (result.resultCode != android.app.Activity.RESULT_OK || uri == null) { call.resolve(JSObject().put("ok", false)); return }
        try { context.contentResolver.takePersistableUriPermission(uri, Intent.FLAG_GRANT_READ_URI_PERMISSION) } catch (ignored: Exception) { }
        var name = uri.lastPathSegment ?: "song"
        try {
            context.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { if (it.moveToFirst()) name = it.getString(0) }
        } catch (ignored: Exception) { }
        HorizonAlarms.setSong(context, uri.toString(), name)
        call.resolve(JSObject().put("ok", true).put("name", name))
    }

    @PluginMethod
    fun clearSong(call: PluginCall) { HorizonAlarms.setSong(context, null, null); call.resolve() }

    private fun open(call: PluginCall, i: Intent) {
        try { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); context.startActivity(i); call.resolve() }
        catch (e: Exception) {
            try { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); call.resolve() }
            catch (e2: Exception) { call.reject("cannot open settings") }
        }
    }

    @PluginMethod
    fun openExactSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 31) open(call, Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + context.packageName))) else call.resolve()
    }

    @PluginMethod
    fun openFullScreenSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= 34) open(call, Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:" + context.packageName))) else call.resolve()
    }

    @PluginMethod
    fun openBattery(call: PluginCall) {
        open(call, Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + context.packageName)))
    }
}
