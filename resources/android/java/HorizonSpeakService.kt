package __APPID__

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.app.Notification
import android.content.pm.ServiceInfo
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager

/** V1.17.0: keeps read-aloud running when you leave the app. Foreground mediaPlayback service with a Stop button.
 *  V1.64.0: also owns a MediaSession, so the lock screen and Bluetooth buttons get Play, Pause and Next for read-aloud,
 *  and the notification gets a Next button that skips to the next queued reply. */
class HorizonSpeakService : Service() {
    companion object {
        @JvmField @Volatile var active = false
        /** V1.63.7: set by the app when it pauses or resumes, so the notification shows Resume or Pause. */
        @JvmField @Volatile var paused = false
        /** V1.64.0: replies waiting behind the one being read, shown in the notification text. */
        @JvmField @Volatile var queued = 0
        private const val CHANNEL = "horizon_speech"
        private const val NOTIFICATION = 4111
        private const val MAX_MS = 30L * 60L * 1000L
    }
    private var lock: PowerManager.WakeLock? = null
    private var session: MediaSession? = null

    /** V1.64.0: lock-screen / headset buttons call straight into the page, the same events the notification buttons use. */
    private fun ensureSession(): MediaSession {
        session?.let { return it }
        val s = MediaSession(this, "HorizonSpeech")
        s.setCallback(object : MediaSession.Callback() {
            override fun onPlay() { HorizonAIPlugin.dispatchToJs("horizon-tts-set", "{\"paused\":false}") }
            override fun onPause() { HorizonAIPlugin.dispatchToJs("horizon-tts-set", "{\"paused\":true}") }
            override fun onSkipToNext() { HorizonAIPlugin.dispatchToJs("horizon-tts-next", "{}") }
            override fun onStop() {
                HorizonAIPlugin.dispatchToJs("horizon-tts-stop", "{}")
                stopSelf()
            }
        }, Handler(Looper.getMainLooper()))
        s.isActive = true
        session = s
        return s
    }

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
            val toggle = PendingIntent.getBroadcast(
                this, 9, Intent(this, HorizonReplyReceiver::class.java).setAction("$packageName.PAUSE_SPEECH"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val next = PendingIntent.getBroadcast(
                this, 10, Intent(this, HorizonReplyReceiver::class.java).setAction("$packageName.NEXT_SPEECH"),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val open = packageManager.getLaunchIntentForPackage(packageName)?.apply {
                // "this." matters: onStartCommand has its own parameter called flags
                this.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
            }
            val sess = ensureSession()
            val waiting = queued
            val subtitle = when {
                paused -> "Paused" + if (waiting > 0) " · $waiting more waiting" else ""
                waiting > 0 -> "$waiting more waiting"
                else -> "Keeps going while you use other apps"
            }
            sess.setMetadata(MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, if (paused) "Horizon is paused" else "Horizon is reading aloud")
                .putString(MediaMetadata.METADATA_KEY_ARTIST, subtitle)
                .build())
            sess.setPlaybackState(PlaybackState.Builder()
                .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE or PlaybackState.ACTION_PLAY_PAUSE or
                    PlaybackState.ACTION_SKIP_TO_NEXT or PlaybackState.ACTION_STOP)
                .setState(if (paused) PlaybackState.STATE_PAUSED else PlaybackState.STATE_PLAYING, PlaybackState.PLAYBACK_POSITION_UNKNOWN, if (paused) 0f else 1f)
                .build())
            val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
            builder.setSmallIcon(android.R.drawable.ic_lock_silent_mode_off)
                .setContentTitle(if (paused) "Horizon is paused" else "Horizon is reading aloud")
                .setContentText(subtitle)
                .setCategory(Notification.CATEGORY_TRANSPORT)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setOngoing(true).setOnlyAlertOnce(true).setShowWhen(false)
                .addAction(Notification.Action.Builder(
                    if (paused) android.R.drawable.ic_media_play else android.R.drawable.ic_media_pause,
                    if (paused) "Resume" else "Pause", toggle).build())
                .addAction(Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", next).build())
                .addAction(Notification.Action.Builder(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stop).build())
                .setStyle(Notification.MediaStyle().setMediaSession(sess.sessionToken).setShowActionsInCompactView(0, 1, 2))
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
        paused = false
        queued = 0
        try { session?.let { it.isActive = false; it.release() } } catch (_: Exception) { /* already gone */ }
        session = null
        lock?.let { if (it.isHeld) it.release() }
        lock = null
        stopForeground(true)
        super.onDestroy()
    }
}
