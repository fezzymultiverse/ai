package __APPID__

import android.content.Context
import android.util.Log

/**
 * V1.63.2: LeakCanary is out of the build. V1.63.1 closed on launch right after it first shipped, and LeakCanary is the
 * heaviest thing that version added. This object keeps the same calls so the HorizonAI plugin and the /canary menu still
 * compile and run, but nothing is watched or dumped and no library is loaded.
 */
object HorizonCanary {
    private const val TAG = "HorizonCanary"
    private const val PREFS = "horizon_canary"
    private const val KEY_ON = "on"

    @JvmStatic fun isOn(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ON, false)

    @JvmStatic fun init(app: android.app.Application) {
        Log.i(TAG, "LeakCanary is not part of this build")
    }

    @JvmStatic fun set(context: Context, on: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ON, on).apply()
    }

    @JvmStatic fun expectWeaklyReachable(obj: Any, why: String) { /* nothing watches */ }

    @JvmStatic fun openLeaks(context: Context) {
        throw IllegalStateException("the leak list is not part of this build")
    }
}
