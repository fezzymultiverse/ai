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
import org.json.JSONArray
import org.json.JSONObject

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

    // ---------- V1.93.29: notification tones ----------
    // Each kind of notification has its own tone, picked in Settings > Personalisation. A tone is "default", "silent"
    // or the content://media/ URI of one of the sounds the phone already has. It is kept in app preferences.
    const val CAT_ALERT = "alert"       // AI replies
    const val CAT_CHECKIN = "checkin"   // proactive check-ins
    const val CAT_REMIND = "remind"     // calendar reminders
    private const val TONE_PREFS = "horizon_tones"
    private var preview: android.media.Ringtone? = null

    @JvmStatic fun validCat(cat: String): Boolean = cat == CAT_ALERT || cat == CAT_CHECKIN || cat == CAT_REMIND

    @JvmStatic fun validTone(tone: String): Boolean = tone == "default" || tone == "silent" || tone.startsWith("content://media/")

    @JvmStatic fun toneOf(context: Context, cat: String): String {
        val t = context.getSharedPreferences(TONE_PREFS, Context.MODE_PRIVATE).getString(cat, "default") ?: "default"
        return if (validTone(t)) t else "default"
    }

    @JvmStatic fun setTone(context: Context, cat: String, tone: String) {
        context.getSharedPreferences(TONE_PREFS, Context.MODE_PRIVATE).edit().putString(cat, tone).commit()
    }

    /** null means silent. */
    private fun toneUri(tone: String): Uri? = when (tone) {
        "silent" -> null
        "default" -> soundUri()
        else -> Uri.parse(tone)
    }

    /**
     * Android freezes a channel's sound the moment it is created, so a new tone needs a new channel. The default tone keeps
     * the original channel id; any other tone gets "<base>_t<hash>". Channels of the same family for other tones are removed,
     * and the channel for the chosen tone is created if it is not there yet. Returns the channel id to post on.
     */
    @JvmStatic fun toneChannel(
        context: Context, cat: String, base: String, name: String, desc: String,
        importance: Int, vibrate: Boolean, rich: Boolean
    ): String {
        val tone = toneOf(context, cat)
        val id = if (tone == "default") base else base + "_t" + Integer.toHexString(tone.hashCode())
        if (Build.VERSION.SDK_INT < 26) return id
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        for (c in nm.notificationChannels) {
            val cid = c.id
            if (cid != id && (cid == base || cid.startsWith(base + "_t"))) nm.deleteNotificationChannel(cid)
        }
        if (nm.getNotificationChannel(id) == null) {
            val ch = NotificationChannel(id, name, importance)
            ch.description = desc
            val uri = toneUri(tone)
            if (uri == null) ch.setSound(null, null) else ch.setSound(uri, audio())
            ch.enableVibration(vibrate)
            if (vibrate && rich) ch.vibrationPattern = BUZZ
            if (rich) {
                ch.enableLights(true)
                ch.lockscreenVisibility = Notification.VISIBILITY_PRIVATE
                ch.setShowBadge(true)
            }
            nm.createNotificationChannel(ch)
        }
        return id
    }

    /** The channel AI replies are posted on, for the tone chosen now. */
    @JvmStatic fun alertChannel(context: Context): String = toneChannel(
        context, CAT_ALERT, CH_ALERT, "AI replies (pop-up + sound)",
        "Horizon's finished replies. Shown as a banner over the screen with a sound.",
        NotificationManager.IMPORTANCE_HIGH, true, true
    )

    /** The sounds this phone offers for notifications, as [{title, uri}]. Empty if the phone will not list them. */
    @JvmStatic fun toneList(context: Context): JSONArray {
        val out = JSONArray()
        try {
            val rm = RingtoneManager(context)
            rm.setType(RingtoneManager.TYPE_NOTIFICATION)
            val cur = rm.cursor
            while (cur.moveToNext()) {
                val title = cur.getString(RingtoneManager.TITLE_COLUMN_INDEX) ?: continue
                out.put(JSONObject().put("title", title).put("uri", rm.getRingtoneUri(cur.position).toString()))
            }
        } catch (e: Exception) { /* no list: Default and Silent still work */ }
        return out
    }

    /** Plays a tone once so it can be heard before it is chosen. */
    @JvmStatic fun previewTone(context: Context, tone: String) {
        try { preview?.stop() } catch (e: Exception) { /* already stopped */ }
        preview = null
        val uri = toneUri(tone) ?: return
        val r = RingtoneManager.getRingtone(context, uri) ?: return
        try { r.setAudioAttributes(audio()) } catch (e: Exception) { /* keep the default attributes */ }
        preview = r
        r.play()
    }

    /** Creates both channels (idempotent) and returns the manager. */
    @JvmStatic fun manager(context: Context): NotificationManager {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) {
            if (nm.getNotificationChannel(CH_OLD) != null) nm.deleteNotificationChannel(CH_OLD)
            alertChannel(context)
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
        val chAlert = alertChannel(context)
        val b = NotificationCompat.Builder(context, chAlert)
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle(title)
            .setContentText(text.take(180))
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setPriority(NotificationCompat.PRIORITY_MAX)               // Android 7 and older: banner
            .setDefaults(NotificationCompat.DEFAULT_ALL)                // Android 7 and older: sound + vibrate + light
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(
                NotificationCompat.Builder(context, chAlert)
                    .setSmallIcon(android.R.drawable.stat_notify_chat)
                    .setContentTitle("Horizon replied")
                    .setContentText("Unlock to read")
                    .build())
            .setOnlyAlertOnce(false)
            .setAutoCancel(true)
            .setShowWhen(true)
            .setContentIntent(open)
        if (Build.VERSION.SDK_INT < 26) {
            // Android 7 and older have no channels, so the chosen tone is set on the notification itself.
            val u = toneUri(toneOf(context, CAT_ALERT))
            b.setDefaults(NotificationCompat.DEFAULT_LIGHTS or NotificationCompat.DEFAULT_VIBRATE)
            if (u != null) b.setSound(u)
            b.setVibrate(BUZZ)
        }
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
            val ch = nm.getNotificationChannel(alertChannel(context))
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
            Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName).putExtra(Settings.EXTRA_CHANNEL_ID, alertChannel(context))
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
