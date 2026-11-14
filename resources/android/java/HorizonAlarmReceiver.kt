package __APPID__

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat

/** Fires from AlarmManager. "pre" = a few minutes before (re-arm + check the song). "fire" = it is time. */
class HorizonAlarmReceiver : BroadcastReceiver() {

    companion object {
        const val CH_REMIND = "horizon_exact_reminders"

        @JvmStatic fun banner(c: Context, id: Int, title: String, body: String) = HorizonAlarmReceiver().postBanner(c, id, title, body)

        @JvmStatic fun ensureRemindChannel(c: Context) {
            if (Build.VERSION.SDK_INT < 26) return
            val nm = c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CH_REMIND) != null) return
            val ch = NotificationChannel(CH_REMIND, "Calendar reminders (exact)", NotificationManager.IMPORTANCE_HIGH)
            ch.description = "Reminders from the Horizon calendar, delivered on the minute."
            ch.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION),
                AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).build())
            ch.enableVibration(true)
            nm.createNotificationChannel(ch)
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getIntExtra("id", 0)
        when (intent.getStringExtra("kind")) {
            "pre" -> pre(context, id)
            "fire" -> fire(context, id)
        }
    }

    private fun pre(c: Context, id: Int) {
        val o = HorizonAlarms.find(c, id) ?: return
        // Re-arm the real alarm in case the system dropped it, and make sure the song can still be opened.
        HorizonAlarms.arm(c, id, o.optLong("at"), o.optString("title"), o.optString("body"), o.optString("mode"), o.optString("song", ""), o.optString("repeat"), o.optBoolean("brief", false))
        val song = o.optString("song", HorizonAlarms.song(c) ?: "")
        if (song.isNotEmpty()) {
            val ok = try { c.contentResolver.openInputStream(android.net.Uri.parse(song))?.use { true } ?: false } catch (e: Exception) { false }
            if (!ok) HorizonAlarms.setSong(c, null, null)   // the file is gone: the alarm will use the phone's alarm ringtone instead
        }
    }

    private fun fire(c: Context, id: Int) {
        val o = HorizonAlarms.find(c, id) ?: return
        HorizonAlarms.forget(c, id)
        val rep = o.optString("repeat")
        if (rep.isNotEmpty()) {   // V1.71.0: a repeating alarm sets up its next ring before it rings
            HorizonAlarms.arm(c, id, HorizonAlarms.nextAfter(o.optLong("at"), rep, System.currentTimeMillis() + 60_000L), o.optString("title"), o.optString("body"),
                o.optString("mode"), o.optString("song", ""), rep, o.optBoolean("brief", false))
        }
        if (o.optString("mode") == "alarm") {
            val i = Intent(c, HorizonAlarmService::class.java)
                .putExtra("id", id).putExtra("title", o.optString("title")).putExtra("body", o.optString("body"))
                .putExtra("song", o.optString("song", "")).putExtra("brief", o.optBoolean("brief", false))
            try {
                if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i) else c.startService(i)
            } catch (e: Exception) {
                postBanner(c, id, o.optString("title"), o.optString("body"))   // never lose the alarm: at least a loud banner
            }
        } else {
            postBanner(c, id, o.optString("title"), o.optString("body"))
        }
    }

    fun postBanner(c: Context, id: Int, title: String, body: String) {
        ensureRemindChannel(c)
        val open = c.packageManager.getLaunchIntentForPackage(c.packageName)
        val pi = PendingIntent.getActivity(c, id, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(c, CH_REMIND)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(title.ifEmpty { "Horizon reminder" })
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(pi)
            .build()
        (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).notify(id, n)
    }
}
