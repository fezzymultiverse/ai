package __APPID__

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Re-arms every saved alarm after a reboot, an app update, or a clock / time-zone change. */
class HorizonAlarmBootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED, Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED, Intent.ACTION_TIMEZONE_CHANGED -> Unit
            else -> return // Exported for protected system broadcasts, not arbitrary external intents.
        }
        val missed = HorizonAlarms.rearmAll(context)
        // An alarm whose time passed while the phone was off: say so, so it is never silently lost.
        for (o in missed) {
            val i = Intent(context, HorizonAlarmService::class.java)
            if (System.currentTimeMillis() - o.optLong("at") > 15 * 60_000L) {
                HorizonAlarmReceiver.ensureRemindChannel(context)
                val n = androidx.core.app.NotificationCompat.Builder(context, HorizonAlarmReceiver.CH_REMIND)
                    .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
                    .setContentTitle("Missed: " + o.optString("title"))
                    .setContentText(o.optString("body"))
                    .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
                    .setAutoCancel(true).build()
                (context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager).notify(o.optInt("id"), n)
            } else {
                i.putExtra("id", o.optInt("id")).putExtra("title", o.optString("title")).putExtra("body", o.optString("body")).putExtra("song", o.optString("song", ""))
                try { context.startForegroundService(i) } catch (e: Exception) { HorizonAlarmReceiver.banner(context, o.optInt("id"), o.optString("title"), o.optString("body")) }   // Android 15 blocks media services started from boot
            }
        }
    }
}
