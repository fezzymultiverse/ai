package __APPID__

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import androidx.core.app.NotificationCompat

/** V1.17.0: keeps read-aloud running when you leave the app. Foreground mediaPlayback service with a Stop button. */
class HorizonSpeakService : Service() {
    companion object {
        @JvmField @Volatile var active = false
        private const val CHANNEL = "horizon_speech"
        private const val NOTIFICATION = 4111
        private const val MAX_MS = 30L * 60L * 1000L
    }
    private var lock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
                val ch = NotificationChannel(CHANNEL, "Reading aloud", NotificationManager.IMPORTANCE_LOW)
                ch.setSound(null, null)
                ch.setShowBadge(false)
                nm.createNotificationChannel(ch)
            }
            val stop = PendingIntent.getBroadcast(
                this, 7, Intent(this, HorizonReplyReceiver::class.java).setAction("$packageName.STOP_SPEECH"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                // "this." matters: onStartCommand has its own parameter called flags
                this.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
            val builder = NotificationCompat.Builder(this, CHANNEL)
                .setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle("Horizon is reading aloud")
                .setContentText("Keeps going while you use other apps")
                .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .addAction(android.R.drawable.ic_media_pause, "Stop", stop)
            if (open != null) builder.setContentIntent(
                PendingIntent.getActivity(this, 8, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            val notification = builder.build()
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
            else startForeground(NOTIFICATION, notification)
            active = true
            if (lock == null) {
                val pm = getSystemService(POWER_SERVICE) as PowerManager
                // Bounded, so a stalled WebView can never hold the CPU awake forever.
                lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:speech").apply { acquire(MAX_MS) }
            }
        } catch (e: Exception) {
            active = false
            stopSelf()
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        active = false
        lock?.let { if (it.isHeld) it.release() }
        lock = null
        stopForeground(true)
        super.onDestroy()
    }
}
