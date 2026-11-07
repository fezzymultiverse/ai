package __APPID__

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/** Bounded, foreground native I/O. Does not promise survival after Android force-stop. */
class HorizonAIService : Service() {
    companion object {
        @Volatile private var instance: HorizonAIService? = null
        fun releaseTurn() { instance?.let { service -> service.main.post { service.releaseHold() } } }
        private val jobs = ConcurrentHashMap<String, () -> Unit>()
        fun submit(context: Context, job: () -> Unit) {
            val id = UUID.randomUUID().toString()
            jobs[id] = job
            try {
                ContextCompat.startForegroundService(context, Intent(context, HorizonAIService::class.java).putExtra("job", id))
            } catch(e: Exception) { jobs.remove(id); throw e }
        }
    }
    private val executor = Executors.newFixedThreadPool(3)
    private val main = Handler(Looper.getMainLooper())
    private var active = 0
    private var held = false
    private var turnLock: PowerManager.WakeLock? = null
    private val watchdog = Runnable { releaseHold() }
    private fun releaseHold() {
        held = false
        main.removeCallbacks(watchdog)
        turnLock?.let { if (it.isHeld) it.release() }
        turnLock = null
        if (active == 0) stopSelf()
    }
    override fun onCreate() { super.onCreate(); instance = this }
    override fun onBind(intent: Intent?): IBinder? = null
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(NotificationChannel("horizon_ai_jobs", "AI working", NotificationManager.IMPORTANCE_LOW))
        val notification = NotificationCompat.Builder(this, "horizon_ai_jobs")
            .setSmallIcon(android.R.drawable.stat_notify_chat)
            .setContentTitle("Horizon is thinking")
            .setContentText("Working on your AI reply in the background")
            .setOngoing(true).setOnlyAlertOnce(true).build()
        if (Build.VERSION.SDK_INT >= 29) startForeground(4108, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        else startForeground(4108, notification)
        if (intent?.action == "hold") {
            held = true
            if (turnLock == null) {
                val pm = getSystemService(POWER_SERVICE) as PowerManager
                turnLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:ai-turn").apply { acquire(900000L) }
            }
            main.removeCallbacks(watchdog)
            main.postDelayed(watchdog, 900000L) // Bound a stalled WebView / abandoned turn to 15 minutes.
            return START_NOT_STICKY
        }
        val job = intent?.getStringExtra("job")?.let { jobs.remove(it) }
        if (job == null) { if (active == 0 && !held) stopSelf(); return START_NOT_STICKY }
        active++
        executor.execute {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:ai-job")
            try {
                lock.acquire(300000L)
                job()
            } finally {
                if (lock.isHeld) lock.release()
                main.post { active--; if (active == 0 && !held) stopSelf() }
            }
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        instance = null
        main.removeCallbacks(watchdog)
        turnLock?.let { if (it.isHeld) it.release() }
        turnLock = null
        executor.shutdown() // Let an already-started HTTP operation close normally.
        super.onDestroy()
    }
}
