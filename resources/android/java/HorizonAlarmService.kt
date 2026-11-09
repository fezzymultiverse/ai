package __APPID__

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import androidx.core.app.NotificationCompat

/**
 * V1.68.0 The wake-up. Started by HorizonAlarmReceiver at the alarm time as a foreground (media playback) service, so it
 * may start from the background and keep playing with the screen off. Plays the chosen song on the ALARM audio stream
 * (loops, fades in over 30 s), vibrates, holds the CPU awake, and shows a full-screen alert with Stop and Snooze.
 * If the song cannot be opened it falls back to the phone's own alarm ringtone, so it never rings silently.
 * It stops itself after 10 minutes.
 */
class HorizonAlarmService : Service() {

    companion object {
        const val CH = "horizon_wake_alarm"
        const val ACT_STOP = "horizon.alarm.STOP"
        const val ACT_SNOOZE = "horizon.alarm.SNOOZE"
        const val NOTIF = 6801
        const val SNOOZE_MIN = 10
        @JvmField @Volatile var ringing = false
    }

    private var player: MediaPlayer? = null
    private var wake: PowerManager.WakeLock? = null
    private val ui = Handler(Looper.getMainLooper())
    private var vol = 0.15f
    private var curId = 0
    private var curTitle = ""
    private var curBody = ""
    private var curSong = ""
    private var curBrief = false

    private val ramp = object : Runnable {
        override fun run() {
            vol = (vol + 0.03f).coerceAtMost(1f)
            try { player?.setVolume(vol, vol) } catch (ignored: Exception) { }
            if (vol < 1f) ui.postDelayed(this, 1000)
        }
    }
    private val giveUp = Runnable { stopAll(); stopSelf() }

    override fun onBind(i: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACT_STOP -> { stopAll(); stopSelf(); return START_NOT_STICKY }
            ACT_SNOOZE -> {
                val at = System.currentTimeMillis() + SNOOZE_MIN * 60_000L
                HorizonAlarms.arm(this, 6900001, at, curTitle, "Snoozed: $curBody", "alarm", curSong, "", curBrief)   // its own id, so a repeating alarm keeps its schedule
                stopAll(); stopSelf(); return START_NOT_STICKY
            }
        }
        curId = intent?.getIntExtra("id", 0) ?: 0
        curTitle = intent?.getStringExtra("title") ?: "Horizon alarm"
        curBody = intent?.getStringExtra("body") ?: ""
        curSong = intent?.getStringExtra("song") ?: ""
        curBrief = intent?.getBooleanExtra("brief", false) ?: false
        val n = buildNotification()
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK)
        else startForeground(NOTIF, n)
        ringing = true
        hold(); play(); buzz()
        ui.removeCallbacks(giveUp); ui.postDelayed(giveUp, 10 * 60_000L)
        return START_NOT_STICKY
    }

    private fun channel() {
        if (Build.VERSION.SDK_INT < 26) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CH) != null) return
        val ch = NotificationChannel(CH, "Wake-up alarms", NotificationManager.IMPORTANCE_HIGH)
        ch.description = "Calendar alarms that ring with your song."
        ch.setSound(null, null)            // the service plays the sound itself
        ch.enableVibration(false)
        ch.lockscreenVisibility = Notification.VISIBILITY_PUBLIC
        nm.createNotificationChannel(ch)
    }

    private fun act(action: String, code: Int): PendingIntent =
        PendingIntent.getService(this, code, Intent(this, HorizonAlarmService::class.java).setAction(action),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)

    /** Stop with the morning brief opens the app (allowed from a notification button only as an activity), which stops the alarm and reads the brief. */
    private fun stopAction(): PendingIntent {
        if (!curBrief) return act(ACT_STOP, 6804)
        val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent())
            .putExtra("hz_stop", true).putExtra("hz_brief", true)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        return PendingIntent.getActivity(this, 6805, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun buildNotification(): Notification {
        channel()
        val open = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent())
            .putExtra("hz_alarm", true).putExtra("hz_title", curTitle).putExtra("hz_body", curBody).putExtra("hz_brief", curBrief)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        val full = PendingIntent.getActivity(this, 6802, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return NotificationCompat.Builder(this, CH)
            .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
            .setContentTitle(curTitle)
            .setContentText(curBody)
            .setStyle(NotificationCompat.BigTextStyle().bigText(curBody))
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setContentIntent(full)
            .setFullScreenIntent(full, true)
            .addAction(0, "Snooze $SNOOZE_MIN min", act(ACT_SNOOZE, 6803))
            .addAction(0, if (curBrief) "Stop + brief" else "Stop", stopAction())
            .build()
    }

    private fun hold() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "horizon:alarm").also { it.acquire(11 * 60_000L) }
        } catch (ignored: Exception) { }
    }

    private fun play() {
        val attrs = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build()
        val chosen = if (curSong.isNotEmpty()) curSong else (HorizonAlarms.song(this) ?: "")
        val sources = ArrayList<Uri>()
        if (chosen.isNotEmpty()) sources.add(Uri.parse(chosen))
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)?.let { sources.add(it) }
        RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)?.let { sources.add(it) }
        for (u in sources) {
            try {
                val mp = MediaPlayer()
                mp.setAudioAttributes(attrs)
                mp.setDataSource(this, u)
                mp.isLooping = true
                mp.setVolume(vol, vol)
                mp.prepare()
                mp.start()
                player = mp
                ui.removeCallbacks(ramp); ui.postDelayed(ramp, 1000)
                return
            } catch (e: Exception) {
                try { player?.release() } catch (ignored: Exception) { }
                player = null          // try the next source: song, then alarm ringtone, then ringtone
            }
        }
    }

    @Suppress("DEPRECATION")
    private fun buzz() {
        try {
            val v = getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            val pattern = longArrayOf(0, 700, 500, 700, 1500)
            if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createWaveform(pattern, 0), attrs()) else v.vibrate(pattern, 0)
        } catch (ignored: Exception) { }
    }

    private fun attrs(): AudioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build()

    private fun stopAll() {
        ringing = false
        ui.removeCallbacks(ramp); ui.removeCallbacks(giveUp)
        try { player?.stop() } catch (ignored: Exception) { }
        try { player?.release() } catch (ignored: Exception) { }
        player = null
        try { (getSystemService(Context.VIBRATOR_SERVICE) as Vibrator).cancel() } catch (ignored: Exception) { }
        try { if (wake?.isHeld == true) wake?.release() } catch (ignored: Exception) { }
        wake = null
        stopForeground(true)
    }

    override fun onDestroy() { stopAll(); super.onDestroy() }
}
