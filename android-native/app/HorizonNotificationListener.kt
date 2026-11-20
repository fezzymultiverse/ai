package __APPID__

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject

/** On-demand active notifications only for the AI reader: no database, log, polling, network, or notification history.
 *  V1.99.137: the separate, opt-in WhatsApp auto-reply (HorizonWaBotPlugin.kt) also receives each posted WhatsApp notification. */
class HorizonNotificationListener : NotificationListenerService() {
    companion object {
        @Volatile var connected: HorizonNotificationListener? = null
            private set
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        connected = this
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        try { HorizonWaBot.onPosted(applicationContext, sbn) } catch (_: Throwable) { /* never let auto-reply break the listener */ }
    }

    override fun onListenerDisconnected() {
        if (connected === this) connected = null
        super.onListenerDisconnected()
    }

    override fun onDestroy() {
        if (connected === this) connected = null
        super.onDestroy()
    }

    fun snapshot(): JSObject {
        // Recheck both gates here, not merely in JavaScript or the bridge.
        if (!HorizonNotificationsPlugin.sharingEnabled(this) || !HorizonNotificationsPlugin.hasAccess(this)) {
            return JSObject().put("enabled", false).put("items", JSArray())
        }
        val active = (activeNotifications ?: emptyArray()).sortedByDescending { it.postTime }
        val items = JSArray()
        for (sbn in active) {
            val extras = sbn.notification.extras
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty().take(500)
            val body = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()
                ?.takeIf { it.isNotBlank() }
                ?: extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.joinToString("\n")
                    ?.takeIf { it.isNotBlank() }
                ?: extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
            val item = JSObject()
            item.put("packageName", sbn.packageName)
            item.put("title", title)
            item.put("text", body.take(4000))
            item.put("textTruncated", body.length > 4000)
            item.put("postedAt", sbn.postTime)
            items.put(item)
        }
        return JSObject().put("enabled", true).put("connected", true)
            .put("count", active.size).put("items", items)
    }
}
