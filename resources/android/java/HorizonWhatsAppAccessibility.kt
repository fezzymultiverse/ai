package __APPID__

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import java.lang.ref.WeakReference

/** One confirmed direct-chat send, not a general screen automation API.
 * No screenshots, cross-app scraping, overlays, PiP coercion or persistent node references. */
class HorizonWhatsAppAccessibility : AccessibilityService() {
    companion object {
        private var service = WeakReference<HorizonWhatsAppAccessibility>(null)
        fun connected(): Boolean = service.get() != null
        fun begin(context: Context, pkg: String, phone: String, name: String, text: String, done: (Boolean, String) -> Unit): Boolean {
            val s = service.get() ?: return false
            if (s.pending != null || HorizonLockPlugin.locked ||
                !HorizonWhatsAppStore.enabled(context, pkg) ||
                !HorizonWhatsAppStore.prefs(context).getBoolean("accessibility", false) ||
                !HorizonWhatsAppStore.prefs(context).getBoolean("replies", false)) return false
            s.pending = Send(pkg, phone.filter { it.isDigit() }, name, text, done)
            s.main.postDelayed(s.timeout, 20000L)
            return true
        }
        fun cancel(reason: String) { service.get()?.finish(false, reason) }
    }
    private data class Send(val pkg: String, val phone: String, val name: String, val text: String,
                            val done: (Boolean, String) -> Unit, var phase: Int = 0)
    private val main = Handler(Looper.getMainLooper())
    private var pending: Send? = null
    private val timeout = Runnable { finish(false, "Accessibility timed out. Inspect WhatsApp before retrying; a draft may remain") }
    private fun finish(ok: Boolean, reason: String) {
        val job = pending ?: return
        pending = null; main.removeCallbacks(timeout); main.removeCallbacks(tick)
        job.done(ok, reason)
    }
    override fun onServiceConnected() { service = WeakReference(this) }
    override fun onInterrupt() { finish(false, "Accessibility interrupted; inspect WhatsApp before retrying") }
    override fun onDestroy() {
        finish(false, "Accessibility disconnected")
        if (service.get() === this) service.clear()
        main.removeCallbacksAndMessages(null); super.onDestroy()
    }
    private val tick = Runnable { attempt() }
    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        val job = pending ?: return
        if (event?.packageName?.toString() != job.pkg) return
        main.removeCallbacks(tick); main.postDelayed(tick, 120L)
    }
    // Never hold a node across callbacks; older Android versions need explicit recycling.
    @Suppress("DEPRECATION") private fun release(n: AccessibilityNodeInfo?) { n?.recycle() }
    private fun exactHeader(root: AccessibilityNodeInfo, job: Send): Boolean {
        val nodes = root.findAccessibilityNodeInfosByViewId(job.pkg + ":id/conversation_contact_name")
        return try {
            nodes.size == 1 && nodes[0].isVisibleToUser && nodes[0].text?.toString()?.trim()?.let { title ->
                val digits = title.filter { it.isDigit() }
                (digits.length >= 7 && digits == job.phone) || (job.name != job.phone && title.equals(job.name, true))
            } == true
        } finally { nodes.forEach { release(it) } }
    }
    private fun attempt() {
        val job = pending ?: return
        if (HorizonLockPlugin.locked || !HorizonWhatsAppStore.enabled(this, job.pkg) ||
            !HorizonWhatsAppStore.prefs(this).getBoolean("replies", false) ||
            !HorizonWhatsAppStore.prefs(this).getBoolean("accessibility", false)) {
            finish(false, "Reply permission revoked or Horizon locked"); return
        }
        val root = rootInActiveWindow ?: return
        try {
            if (root.packageName?.toString() != job.pkg || !exactHeader(root, job)) return
            val fields = root.findAccessibilityNodeInfosByViewId(job.pkg + ":id/entry")
            try {
                if (fields.size != 1) return
                val field = fields[0]
                if (!field.isEditable || !field.isVisibleToUser || !field.isEnabled) return
                if (job.phase == 0) {
                    // Never overwrite an unrelated draft.
                    if (!field.text.isNullOrBlank()) { finish(false, "An existing WhatsApp draft was left untouched"); return }
                    val args = Bundle().apply { putCharSequence(AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE, job.text) }
                    job.phase = 1
                    if (!field.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)) { finish(false, "WhatsApp refused text entry"); return }
                    main.postDelayed(tick, 200L); return
                }
                if (job.phase != 1 || field.text?.toString() != job.text) return
                val buttons = root.findAccessibilityNodeInfosByViewId(job.pkg + ":id/send")
                try {
                    if (buttons.size != 1 || !buttons[0].isVisibleToUser || !buttons[0].isEnabled || !buttons[0].isClickable) return
                    // Mark before clicking: at most one send attempt, never retry after an ambiguous result.
                    job.phase = 2
                    val ok = buttons[0].performAction(AccessibilityNodeInfo.ACTION_CLICK)
                    finish(ok, if (ok) "Submitted; delivery not confirmed" else "Send click failed; inspect WhatsApp before retrying")
                } finally { buttons.forEach { release(it) } }
            } finally { fields.forEach { release(it) } }
        } catch (_: Exception) { finish(false, "WhatsApp screen changed; inspect the draft before retrying") }
        finally { release(root) }
    }
}
