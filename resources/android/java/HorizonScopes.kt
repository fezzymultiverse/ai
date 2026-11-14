package __APPID__

import android.util.Log
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.CoroutineName
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.CancellationException

/**
 * V1.63.0: structured concurrency for Horizon's native side.
 *
 * Rules every coroutine here follows:
 *  1. Nothing uses GlobalScope or a bare Thread. Every launch happens inside an owned scope.
 *  2. Each owner (the app, a service, a plugin) makes a child scope with [child] and cancels it in its own teardown
 *     (onDestroy / handleOnDestroy). When the owner dies, all of its work is cancelled with it, so a coroutine can no
 *     longer outlive and leak the Activity, Service or Plugin that started it.
 *  3. Scopes use SupervisorJob: one failed job does not cancel its siblings. Failures are caught per job and logged
 *     by [handler], so a crash in one reply never takes the process down.
 *  4. Blocking I/O runs on Dispatchers.IO, UI work on Dispatchers.Main. Blocking loops call ensureActive() so
 *     cancellation actually stops them.
 */
object HorizonScopes {
    private const val TAG = "HorizonScopes"

    /** Last-resort logger: cancellation is normal and silent, anything else is logged and contained. */
    val handler = CoroutineExceptionHandler { ctx, e ->
        if (e !is CancellationException) Log.e(TAG, "Uncaught in ${ctx[CoroutineName]?.name ?: "coroutine"}: ${e.message}", e)
    }

    /** Process-wide root. Children are created from it and cancelled by their owners; the root itself lives as long as the process. */
    private val root: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.Default + CoroutineName("horizon") + handler)

    /** A named child scope owned by one component. Cancel it in that component's teardown. */
    @JvmStatic fun child(name: String, dispatcher: kotlinx.coroutines.CoroutineDispatcher = Dispatchers.IO): CoroutineScope =
        CoroutineScope(SupervisorJob(root.coroutineContext[kotlinx.coroutines.Job]) + dispatcher + CoroutineName(name) + handler)

    @JvmStatic fun cancel(scope: CoroutineScope?, why: String) {
        try { scope?.cancel(CancellationException(why)) } catch (_: Throwable) { /* already cancelled */ }
    }
}
