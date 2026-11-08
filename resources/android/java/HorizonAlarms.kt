package __APPID__

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import org.json.JSONArray
import org.json.JSONObject

/**
 * V1.68.0 Horizon Alarms: the engine behind calendar wake-up alarms and exact reminders.
 *
 * Why this survives sleep, Doze and a closed app:
 *  - "alarm" mode uses AlarmManager.setAlarmClock(): the same call the stock Clock app uses. Android treats it as a real
 *    alarm clock (exempt from Doze, shows in the status bar and lock screen as the next alarm, needs no special permission).
 *  - "remind" mode uses setExactAndAllowWhileIdle() when exact alarms are allowed, otherwise the nearest inexact one.
 *  - Every alarm is also saved in SharedPreferences, so a reboot, an app update or a clock/time-zone change re-arms it
 *    (HorizonAlarmBootReceiver).
 *  - 3 minutes before an alarm a "pre-wake" fires: it re-arms the real alarm and checks the song can still be read.
 */
object HorizonAlarms {
    private const val PREFS = "horizon_alarms"
    private const val KEY_LIST = "list"
    private const val KEY_SONG = "song"
    private const val KEY_SONG_NAME = "song_name"
    const val PRE_MS = 3 * 60_000L

    private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    @JvmStatic @Synchronized fun list(c: Context): JSONArray =
        try { JSONArray(prefs(c).getString(KEY_LIST, "[]")) } catch (e: Exception) { JSONArray() }

    @Synchronized private fun save(c: Context, a: JSONArray) { prefs(c).edit().putString(KEY_LIST, a.toString()).apply() }

    @JvmStatic @Synchronized fun find(c: Context, id: Int): JSONObject? {
        val a = list(c)
        for (i in 0 until a.length()) { val o = a.optJSONObject(i); if (o != null && o.optInt("id") == id) return o }
        return null
    }

    @Synchronized private fun put(c: Context, o: JSONObject) {
        val a = list(c); val out = JSONArray()
        for (i in 0 until a.length()) { val x = a.optJSONObject(i); if (x != null && x.optInt("id") != o.optInt("id")) out.put(x) }
        out.put(o); save(c, out)
    }

    @JvmStatic @Synchronized fun forget(c: Context, id: Int) {
        val a = list(c); val out = JSONArray()
        for (i in 0 until a.length()) { val x = a.optJSONObject(i); if (x != null && x.optInt("id") != id) out.put(x) }
        save(c, out)
    }

    // ---- default song (a content:// uri the user picked, with a persistable read grant) ----
    @JvmStatic fun song(c: Context): String? = prefs(c).getString(KEY_SONG, null)
    @JvmStatic fun songName(c: Context): String? = prefs(c).getString(KEY_SONG_NAME, null)
    @JvmStatic fun setSong(c: Context, uri: String?, name: String?) {
        prefs(c).edit().putString(KEY_SONG, uri).putString(KEY_SONG_NAME, name).apply()
    }

    @JvmStatic fun canExact(c: Context): Boolean {
        if (Build.VERSION.SDK_INT < 31) return true
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return am.canScheduleExactAlarms()
    }

    private fun receiverIntent(c: Context, id: Int, kind: String): Intent =
        Intent(c, HorizonAlarmReceiver::class.java)
            .setData(Uri.parse("horizon://alarm/$id/$kind"))   // a different data uri makes fire and pre-wake two separate alarms
            .putExtra("id", id).putExtra("kind", kind)

    private fun pending(c: Context, id: Int, kind: String): PendingIntent =
        PendingIntent.getBroadcast(c, id, receiverIntent(c, id, kind), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    private fun openApp(c: Context, id: Int): PendingIntent {
        val i = c.packageManager.getLaunchIntentForPackage(c.packageName) ?: Intent()
        i.putExtra("hz_alarm_open", id)
        return PendingIntent.getActivity(c, id, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /** Arms (or re-arms) one alarm and stores it. mode = "alarm" (rings with a song) or "remind" (loud banner). */
    @JvmStatic fun arm(c: Context, id: Int, at: Long, title: String, body: String, mode: String, song: String?): Boolean {
        if (at <= System.currentTimeMillis() + 1000) return false
        val o = JSONObject().put("id", id).put("at", at).put("title", title).put("body", body).put("mode", mode)
        if (!song.isNullOrEmpty()) o.put("song", song)
        put(c, o)
        return schedule(c, o)
    }

    private fun schedule(c: Context, o: JSONObject): Boolean {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val id = o.optInt("id"); val at = o.optLong("at"); val mode = o.optString("mode", "remind")
        return try {
            val fire = pending(c, id, "fire")
            if (mode == "alarm") {
                am.setAlarmClock(AlarmManager.AlarmClockInfo(at, openApp(c, id)), fire)
            } else if (canExact(c)) {
                am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
            } else {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, fire)
            }
            // pre-wake a few minutes before, only when there is time for one
            val pre = at - PRE_MS
            if (pre > System.currentTimeMillis() + 5000) {
                if (canExact(c)) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, pre, pending(c, id, "pre"))
                else am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, pre, pending(c, id, "pre"))
            }
            true
        } catch (e: SecurityException) {
            false
        }
    }

    @JvmStatic fun cancel(c: Context, id: Int) {
        val am = c.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        try { am.cancel(pending(c, id, "fire")); am.cancel(pending(c, id, "pre")) } catch (ignored: Exception) { }
        forget(c, id)
    }

    /** Re-arms everything stored: after boot, an app update, or a time / time-zone change. Past ones that were missed are returned. */
    @JvmStatic fun rearmAll(c: Context): List<JSONObject> {
        val missed = ArrayList<JSONObject>()
        val a = list(c); val now = System.currentTimeMillis()
        for (i in 0 until a.length()) {
            val o = a.optJSONObject(i) ?: continue
            if (o.optLong("at") > now + 1000) schedule(c, o) else missed.add(o)
        }
        for (o in missed) forget(c, o.optInt("id"))
        return missed
    }
}
