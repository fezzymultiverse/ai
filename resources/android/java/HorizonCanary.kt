package __APPID__

import android.app.Activity
import android.app.Application
import android.content.Context
import android.content.Intent
import android.util.Log
import leakcanary.AppWatcher
import leakcanary.LeakCanary

/**
 * V1.63.0: LeakCanary. It watches every destroyed Activity, Fragment, View and ViewModel; when one is still in memory five
 * seconds after it should be gone it dumps the heap, finds the reference chain that is holding it, and posts a "leak found"
 * notification. This is how a coroutine or plugin that outlives its Activity gets caught.
 *
 * LeakCanary installs itself through a ContentProvider, so there is no Application class to edit. This object only tunes it:
 * it hides LeakCanary's own second launcher icon, and lets Horizon switch the heap dumping off (it pauses the phone for a
 * second or two) without removing the watcher.
 */
object HorizonCanary {
    private const val TAG = "HorizonCanary"
    private const val PREFS = "horizon_canary"
    private const val KEY_ON = "on"

    @JvmStatic fun isOn(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ON, true)

    @JvmStatic fun init(app: Application) {
        try {
            // Horizon opens the leak list from its own Settings, so no extra icon in the launcher.
            LeakCanary.showLeakDisplayActivityLauncherIcon(false)
            apply(isOn(app))
        } catch (t: Throwable) {
            Log.w(TAG, "LeakCanary not started: ${t.message}")
        }
    }

    @JvmStatic fun set(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON, on).apply()
        apply(on)
    }

    private fun apply(on: Boolean) {
        try {
            AppWatcher.config = AppWatcher.config.copy(enabled = on)
            LeakCanary.config = LeakCanary.config.copy(dumpHeap = on)
        } catch (t: Throwable) {
            Log.w(TAG, "Could not change LeakCanary: ${t.message}")
        }
    }

    /** Tell LeakCanary an object should now be garbage. If it is still reachable in 5 s it is reported as a leak. */
    @JvmStatic fun expectWeaklyReachable(obj: Any, why: String) {
        try { AppWatcher.objectWatcher.expectWeaklyReachable(obj, why) } catch (_: Throwable) { /* watcher off */ }
    }

    /** Opens LeakCanary's own leak list. */
    @JvmStatic fun openLeaks(context: Context) {
        val i: Intent = LeakCanary.newLeakDisplayActivityIntent()
        if (context !is Activity) i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(i)
    }
}
