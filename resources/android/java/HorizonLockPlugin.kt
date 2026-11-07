package __APPID__

import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * V1.43.0 Horizon Lock: the native half of the app lock (Settings > SECURITY > App lock).
 * The PIN lives in the JS side (salted PBKDF2 hash). This plugin only adds three things Android must do:
 *  - available():  is a fingerprint / face enrolled and usable (BiometricManager)
 *  - authenticate(): the system fingerprint prompt (BiometricPrompt). Always resolves, never rejects: {ok, cancelled, code, error}
 *  - setSecure():  FLAG_SECURE, hides Horizon in the recent-apps list (and blocks screenshots while on)
 *  - setLocked():  tells MainActivity the lock screen is up, so Back sends the app to the background instead of stepping through panels
 * The system prompt has a "Use PIN" button; the PIN keypad is always there as the fallback.
 */
@CapacitorPlugin(name = "HorizonLock")
class HorizonLockPlugin : Plugin() {

    companion object {
        @JvmField @Volatile var locked = false
    }

    private fun fail(msg: String, code: Int = -1, cancelled: Boolean = false): JSObject {
        val o = JSObject()
        o.put("ok", false)
        o.put("code", code)
        o.put("error", msg)
        o.put("cancelled", cancelled)
        return o
    }

    @PluginMethod
    fun available(call: PluginCall) {
        val o = JSObject()
        try {
            val r = BiometricManager.from(context).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK)
            o.put("biometric", r == BiometricManager.BIOMETRIC_SUCCESS)
            o.put("enrolled", r != BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED)
            o.put("code", r)
        } catch (e: Exception) {
            o.put("biometric", false)
            o.put("enrolled", false)
            o.put("code", -1)
        }
        call.resolve(o)
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val act = activity as? FragmentActivity
        if (act == null) {
            call.resolve(fail("no activity"))
            return
        }
        val title = call.getString("title") ?: "Unlock Horizon"
        val subtitle = call.getString("subtitle") ?: "Bojack Security"
        val negative = call.getString("negative") ?: "Use PIN"
        act.runOnUiThread {
            try {
                val executor = ContextCompat.getMainExecutor(act)
                val prompt = BiometricPrompt(act, executor, object : BiometricPrompt.AuthenticationCallback() {
                    override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                        val o = JSObject()
                        o.put("ok", true)
                        call.resolve(o)
                    }

                    override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                        val gone = errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                            errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON ||
                            errorCode == BiometricPrompt.ERROR_CANCELED
                        call.resolve(fail(errString.toString(), errorCode, gone))
                    }
                })
                val info = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setSubtitle(subtitle)
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK)
                    .setNegativeButtonText(negative)
                    .setConfirmationRequired(false)
                    .build()
                prompt.authenticate(info)
            } catch (e: Exception) {
                call.resolve(fail(e.message ?: "prompt failed"))
            }
        }
    }

    @PluginMethod
    fun setSecure(call: PluginCall) {
        val on = call.getBoolean("on", false) == true
        val act = activity
        if (act == null) {
            call.resolve()
            return
        }
        act.runOnUiThread {
            try {
                if (on) act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                else act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
            } catch (ignored: Exception) {
                // the window may be gone; the next call sets it again
            }
            call.resolve()
        }
    }

    @PluginMethod
    fun setLocked(call: PluginCall) {
        locked = call.getBoolean("locked", false) == true
        call.resolve()
    }
}
