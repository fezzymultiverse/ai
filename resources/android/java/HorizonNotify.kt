package __APPID__

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject

/**
 * V1.63.0: heads-up notifications. A reply now drops in front of whatever is on screen (banner), makes the
 * notification sound and vibrates. Android freezes a channel's importance and sound the moment it is first created,
 * so the old "horizon_ai_replies" channel (IMPORTANCE_DEFAULT, no banner) is deleted and replaced by "horizon_ai_alerts".
 * Progress and status updates live on their own quiet channel so they never ring.
 */
object HorizonNotify {
    const val CH_ALERT = "horizon_ai_alerts"
    const val CH_STATUS = "horizon_ai_status"
    private const val CH_OLD = "horizon_ai_replies"
    private val BUZZ = longArrayOf(0L, 220L, 110L, 220L)

    fun canNotify(context: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun soundUri(): Uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)

    private fun audio(): AudioAttributes = AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_NOTIFICATION)
        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
        .build()

    /** Creates both channels (idempotent) and returns the manager. */
    @JvmStatic fun manager(context: Context): NotificationManager {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CH_OLD) != null) nm.deleteNotificationChannel(CH_OLD)
            if (nm.getNotificationChannel(CH_ALERT) == null) {
                val ch = NotificationChannel(CH_ALERT, "AI replies (pop-up + sound)", NotificationManager.IMPORTANCE_HIGH)
                ch.description = "Horizon's finished replies. Shown as a banner over the screen with a sound."
                ch.setSound(soundUri(), audio())
                ch.enableVibration(true)
                ch.vibrationPattern = BUZZ
                ch.enableLights(true)
                ch.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                ch.setShowBadge(true)
                nm.createNotificationChannel(ch)
            }
            if (nm.getNotificationChannel(CH_STATUS) == null) {
                val ch = NotificationChannel(CH_STATUS, "AI status (quiet)", NotificationManager.IMPORTANCE_LOW)
                ch.description = "Silent progress lines such as \"Horizon is thinking\"."
                ch.setSound(null, null)
                ch.enableVibration(false)
                ch.setShowBadge(false)
                nm.createNotificationChannel(ch)
            }
        }
        return nm
    }

    @JvmStatic fun canFullScreen(context: Context): Boolean {
        if (Build.VERSION.SDK_INT < 29) return false
        if (Build.VERSION.SDK_INT >= 34) {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            return nm.canUseFullScreenIntent()
        }
        return ContextCompat.checkSelfPermission(context, "android.permission.USE_FULL_SCREEN_INTENT") == PackageManager.PERMISSION_GRANTED
    }

    /** A finished reply: banner + sound + vibration, every time (never "only alert once"). */
    @JvmStatic fun alert(
        context: Context, id: Int, title: String, text: String,
        open: PendingIntent, vararg actions: NotificationCompat.Action
    ): Boolean {
        if (!canNotify(context)) return false
        val nm = manager(context)
        val b = NotificationCompat.Builder(context, CH_ALERT)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(text.take(180))
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_MAX)               // Android 7 and older: banner
            .setDefaults(NotificationCompat.DEFAULT_ALL)                // Android 7 and older: sound + vibrate + light
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(
                NotificationCompat.Builder(context, CH_ALERT)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setContentTitle("Horizon replied")
                    .setContentText("Unlock to read")
                    .build())
            .setOnlyAlertOnce(false)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setContentIntent(open)
        if (Build.VERSION.SDK_INT < 26) b.setSound(soundUri()).setVibrate(BUZZ)
        // Full-screen intent is what lets the banner open straight over a locked or busy screen.
        // Android 14+ asks the user for this one in Settings; without it the banner still drops down.
        if (canFullScreen(context)) b.setFullScreenIntent(open, true)
        for (a in actions) b.addAction(a)
        nm.notify(id, b.build())
        return true
    }

    /** A quiet status line (no sound, no banner). */
    @JvmStatic fun status(context: Context, id: Int, title: String, text: String, open: PendingIntent) {
        if (!canNotify(context)) return
        val extras = Bundle().apply { putBoolean("horizon_status", true) }
        val n = NotificationCompat.Builder(context, CH_STATUS)
            .setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title).setContentText(text)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOnlyAlertOnce(true).setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setContentIntent(open).addExtras(extras).build()
        manager(context).notify(id, n)
    }

    /** What the phone will really do with a reply, so the app can tell the user why a banner did not show. */
    @JvmStatic fun report(context: Context): JSObject {
        val nm = manager(context)
        val o = JSObject()
        o.put("permission", canNotify(context))
        o.put("appEnabled", nm.areNotificationsEnabled())
        var importance = -1
        var sound = false
        if (Build.VERSION.SDK_INT >= 26) {
            val ch = nm.getNotificationChannel(CH_ALERT)
            if (ch != null) { importance = ch.importance; sound = ch.sound != null }
        }
        o.put("importance", importance)
        o.put("banner", importance >= NotificationManager.IMPORTANCE_HIGH)
        o.put("sound", sound && importance >= NotificationManager.IMPORTANCE_DEFAULT)
        o.put("fullScreen", canFullScreen(context))
        o.put("sdk", Build.VERSION.SDK_INT)
        return o
    }

    @JvmStatic fun openChannelSettings(context: Context) {
        val i = if (Build.VERSION.SDK_INT >= 26)
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, CH_ALERT)
        else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra("app_package", context.packageName).putExtra("app_uid", context.applicationInfo.uid)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
    }

    @JvmStatic fun openFullScreenSettings(context: Context) {
        val i = if (Build.VERSION.SDK_INT >= 34)
            Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${context.packageName}"))
        else Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
    }
}
