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
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.TimeoutCancellationException
import kotlinx.coroutines.launch
import kotlinx.coroutines.runInterruptible
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * Bounded, foreground native I/O. Does not promise survival after Android force-stop.
 * V1.63.0: jobs run as child coroutines of this service's own scope (structured concurrency). Every job has a hard timeout,
 * failures are contained per job (SupervisorJob), and onDestroy cancels the whole scope so no job can outlive the service.
 */
class HorizonAIService : Service() {
    companion object {
        @Volatile private var instance: HorizonAIService? = null
        /** V1.83.0: true while a group round or other held turn is running, so MainActivity keeps the page alive when you leave the app. */
        @JvmField @Volatile var holding = false
        fun releaseTurn() { instance?.let { service -> service.main.post { service.releaseHoldSoon() } } }
        private const val JOB_TIMEOUT_MS = 300_000L
        private class Pending(val block: () -> Unit, val onFail: (Throwable) -> Unit)
        private val jobs = ConcurrentHashMap<String, Pending>()
        /** [onFail] runs if the job is cancelled or times out before it settled its own call, so the page never waits forever. */
        fun submit(context: Context, onFail: (Throwable) -> Unit = {}, job: () -> Unit) {
            val id = UUID.randomUUID().toString()
            jobs[id] = Pending(job, onFail)
            try {
                ContextCompat.startForegroundService(context, Intent(context, HorizonAIService::class.java).putExtra("job", id))
            } catch(e: Exception) { jobs.remove(id); throw e }
        }
    }
    private val scope: CoroutineScope = HorizonScopes.child("horizon-ai-service", Dispatchers.IO)
    // At most three jobs run at once, as before; the rest wait their turn instead of piling up threads.
    private val slots = kotlinx.coroutines.sync.Semaphore(3)
    private val main = Handler(Looper.getMainLooper())
    private var active = 0
    private var held = false
    private var turnLock: PowerManager.WakeLock? = null
    private val watchdog = Runnable { releaseHold() }
    // V1.67.9: the service lingers 8 s after a turn ends. The next AI in a group, a retry, or the read-aloud service that starts when the reply lands
    // all begin inside that window, so the app never drops out of the foreground between replies while you are away from it.
    private val graceStop = Runnable { releaseHold() }
    private fun releaseHoldSoon() {
        main.removeCallbacks(graceStop)
        main.postDelayed(graceStop, 8_000L)
    }
    private fun releaseHold() {
        held = false
        holding = false
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
            holding = true
            main.removeCallbacks(graceStop)
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
        scope.launch {
            val pm = getSystemService(POWER_SERVICE) as PowerManager
            val lock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "$packageName:ai-job")
            try {
                slots.acquire()
                try {
                    lock.acquire(JOB_TIMEOUT_MS + 5_000L)
                    // runInterruptible turns cancellation into a thread interrupt, so a cancelled job stops waiting.
                    withTimeout(JOB_TIMEOUT_MS) { runInterruptible { job.block() } }
                } finally { slots.release() }
            } catch (e: TimeoutCancellationException) {
                job.onFail(e)
            } catch (e: CancellationException) {
                job.onFail(e)
                throw e
            } catch (e: Throwable) {
                job.onFail(e)
            } finally {
                if (lock.isHeld) lock.release()
                // This runs even when the scope is already cancelled, so the service always winds down.
                withContext(NonCancellable + Dispatchers.Main) { active--; if (active == 0 && !held) stopSelf() }
            }
        }
        return START_NOT_STICKY
    }
    override fun onDestroy() {
        instance = null
        holding = false
        main.removeCallbacks(watchdog)
        main.removeCallbacks(graceStop)
        turnLock?.let { if (it.isHeld) it.release() }
        turnLock = null
        HorizonScopes.cancel(scope, "HorizonAIService destroyed")   // every running job is cancelled with its service
        super.onDestroy()
    }
}
