package __APPID__

import android.app.AlertDialog
import android.app.NotificationManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import android.service.notification.NotificationListenerService
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** OS notification access and AI sharing are distinct gates. Neither is granted by POST_NOTIFICATIONS. */
@CapacitorPlugin(name = "HorizonNotifications")
class HorizonNotificationsPlugin : Plugin() {
    companion object {
        private const val PREFS = "horizon_notification_access"
        private const val SHARING = "share_with_selected_ai"

        fun sharingEnabled(ctx: Context): Boolean =
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(SHARING, false)

        fun hasAccess(ctx: Context): Boolean {
            val component = ComponentName(ctx, HorizonNotificationListener::class.java)
            return try {
                if (Build.VERSION.SDK_INT >= 27) {
                    ctx.getSystemService(NotificationManager::class.java).isNotificationListenerAccessGranted(component)
                } else {
                    Settings.Secure.getString(ctx.contentResolver, "enabled_notification_listeners")
                        ?.split(':')?.any { ComponentName.unflattenFromString(it) == component } == true
                }
            } catch (_: Exception) { false }
        }
    }

    private fun statusObject(): JSObject {
        val access = hasAccess(context)
        return JSObject().put("access", access).put("sharing", sharingEnabled(context))
            .put("enabled", access && sharingEnabled(context))
            .put("connected", HorizonNotificationListener.connected != null)
    }

    @PluginMethod
    fun status(call: PluginCall) { call.resolve(statusObject()) }

    @PluginMethod
    fun requestAccess(call: PluginCall) {
        val act = activity
        if (act == null) { call.reject("Notification access needs the app on screen"); return }
        act.runOnUiThread {
            try {
                AlertDialog.Builder(act)
                    .setTitle("Allow AI to read notifications?")
                    .setMessage("Horizon can read notification titles and text Android makes available from all your apps. On each private AI chat turn, notification text is sent to your selected AI provider to answer you. It may contain private messages or codes. Android may hide sensitive or work-profile content. No notification history is stored, and People chats are excluded.\n\nContinue only if you agree. You must also grant Horizon Notification access in Android Settings. You can stop AI sharing at any time in Horizon Permissions.")
                    .setNegativeButton("Cancel") { _, _ -> call.resolve(JSObject().put("accepted", false)) }
                    .setOnCancelListener { call.resolve(JSObject().put("accepted", false)) }
                    .setPositiveButton("Agree and continue") { _, _ ->
                        try {
                            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(SHARING, true).apply()
                            if (!hasAccess(context)) openSettings() else rebind()
                            call.resolve(statusObject().put("accepted", true))
                        } catch (_: Exception) {
                            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(SHARING, false).apply()
                            call.reject("Could not open Android notification access settings")
                        }
                    }.show()
            } catch (_: Exception) { call.reject("Could not show notification consent") }
        }
    }

    private fun rebind() {
        if (Build.VERSION.SDK_INT >= 24) {
            try { NotificationListenerService.requestRebind(ComponentName(context, HorizonNotificationListener::class.java)) }
            catch (_: Exception) { /* status will expose a disconnected listener */ }
        }
    }

    private fun openSettings() {
        val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(intent)
    }

    @PluginMethod
    fun settings(call: PluginCall) {
        try { openSettings(); call.resolve(JSObject().put("opened", true)) }
        catch (_: Exception) { call.reject("Android notification settings are unavailable") }
    }

    @PluginMethod
    fun disable(call: PluginCall) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(SHARING, false).apply()
        call.resolve(statusObject())
    }

    @PluginMethod
    fun read(call: PluginCall) {
        if (!sharingEnabled(context) || !hasAccess(context)) {
            call.resolve(statusObject().put("items", JSArray()))
            return
        }
        val listener = HorizonNotificationListener.connected
        if (listener == null) {
            rebind()
            call.resolve(statusObject().put("items", JSArray()).put("error", "Notification listener is connecting; try again shortly"))
            return
        }
        try { call.resolve(listener.snapshot()) }
        catch (_: SecurityException) { call.reject("Notification access was revoked") }
        catch (_: Exception) { call.reject("Android could not read active notifications") }
    }
}
