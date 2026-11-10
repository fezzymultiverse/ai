package __APPID__

import android.app.Notification
import android.Manifest
import android.content.pm.PackageManager
import android.provider.ContactsContract
import android.telephony.PhoneNumberUtils
import androidx.core.content.ContextCompat
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.app.RemoteInput
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/** Notification capture plus an explicitly approved, package-scoped Accessibility fallback. Never private database access.
 * All capture/retention/reply gates are enforced natively, not only by the WebView. */
internal object HorizonWhatsAppStore {
    val replies = ConcurrentHashMap<String, Notification.Action>()
    fun prefs(c: Context) = c.getSharedPreferences("horizon_whatsapp", Context.MODE_PRIVATE)
    fun enabled(c: Context, pkg: String): Boolean = when (pkg) {
        "com.whatsapp" -> prefs(c).getBoolean("personal", false)
        "com.whatsapp.w4b" -> prefs(c).getBoolean("business", false)
        else -> false
    }
    @Synchronized fun rows(c: Context): JSONArray {
        val a = try { JSONArray(prefs(c).getString("messages", "[]")) } catch (_: Exception) { JSONArray() }
        val out = JSONArray()
        val cutoff = System.currentTimeMillis() - 7 * 86400000L
        for (i in 0 until a.length()) {
            val r = a.optJSONObject(i) ?: continue
            if (r.optLong("time") >= cutoff && enabled(c, r.optString("package"))) out.put(r)
        }
        if (out.length() != a.length()) prefs(c).edit().putString("messages", out.toString()).apply()
        return out
    }
    @Synchronized fun add(c: Context, row: JSONObject): Boolean {
        val a = rows(c)
        for (i in 0 until a.length()) if (a.getJSONObject(i).optString("id") == row.optString("id")) return false
        val out = JSONArray()
        for (i in maxOf(0, a.length() - 299) until a.length()) out.put(a.get(i))
        out.put(row)
        prefs(c).edit().putString("messages", out.toString()).apply()
        return true
    }
    @Synchronized fun clear(c: Context) {
        prefs(c).edit().remove("messages").apply()
        replies.clear()
    }
}

@CapacitorPlugin(name = "HorizonWhatsApp", permissions = [Permission(alias = "contacts", strings = [Manifest.permission.READ_CONTACTS])])
class HorizonWhatsAppPlugin : Plugin() {
    private val contactWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
    private fun samePhone(a: String, b: String): Boolean {
        // Android's loose compare can match only a trailing subscriber fragment.
        // Never send to a different country/number on that basis. Ambiguous local
        // versus international formatting fails closed instead of guessing.
        val left = PhoneNumberUtils.normalizeNumber(a).filter { it.isDigit() }
        val right = PhoneNumberUtils.normalizeNumber(b).filter { it.isDigit() }
        return left.length >= 8 && left == right
    }
    private fun requireContacts(call: PluginCall): Boolean {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon to use contacts"); return false }
        if (getPermissionState("contacts") != PermissionState.GRANTED) { call.reject("Grant Contacts in Terminal Controls first"); return false }
        return true
    }
    @PluginMethod fun requestContacts(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon first"); return }
        requestPermissionForAlias("contacts", call, "contactsResult")
    }
    @PermissionCallback private fun contactsResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("contacts") == PermissionState.GRANTED))
    }
    // Bounded device-only search. No address book is sent to a provider.
    @PluginMethod fun contacts(call: PluginCall) {
        if (!requireContacts(call)) return
        val query = (call.getString("query") ?: "").trim().take(100)
        val offset = (call.getInt("offset", 0) ?: 0).coerceAtLeast(0)
        contactWorker.execute {
            try {
                val phone = ContactsContract.CommonDataKinds.Phone.CONTENT_URI
                val uri = if (query.isBlank()) phone else android.net.Uri.withAppendedPath(ContactsContract.CommonDataKinds.Phone.CONTENT_FILTER_URI, android.net.Uri.encode(query))
                val cols = arrayOf("_id", "display_name", "data1", "contact_id")
                val out = JSArray(); var skipped = 0; var hasMore = false
                context.contentResolver.query(uri, cols, null, null, "display_name COLLATE LOCALIZED ASC, _id ASC")?.use { c ->
                    while (c.moveToNext()) {
                        if (skipped++ < offset) continue
                        if (out.length() >= 50) { hasMore = true; break }
                        out.put(JSObject().put("id", c.getString(0)).put("name", c.getString(1) ?: "Contact").put("phone", c.getString(2) ?: "").put("contactId", c.getString(3)))
                    }
                }
                if (!requireContacts(call)) return@execute
                call.resolve(JSObject().put("contacts", out).put("hasMore", hasMore).put("nextOffset", offset + out.length()))
            } catch (e: Exception) { call.reject("Could not read contacts: ${e.message}") }
        }
    }
    // Strict identity matching: duplicate display names/numbers must be selected by phone-row id.
    @PluginMethod fun sendToContact(call: PluginCall) {
        if (!requireContacts(call)) return
        val id = call.getString("contactId") ?: ""
        val name = (call.getString("name") ?: "").trim()
        val text = (call.getString("text") ?: "").trim()
        val requestedBusiness = call.getBoolean("business")
        if (text.isEmpty() || text.length > 4000) { call.reject("Message must contain 1–4000 characters"); return }
        if (id.isBlank() && name.isBlank()) { call.reject("Select a contact or provide an exact contact name"); return }
        contactWorker.execute {
            try {
                val cols = arrayOf("_id", "display_name", "data1", "contact_id")
                val selection = if (id.isNotBlank()) "_id = ?" else "display_name = ? COLLATE NOCASE"
                val arg = if (id.isNotBlank()) id else name
                val matches = mutableListOf<Pair<String, String>>()
                context.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, cols, selection, arrayOf(arg), null)?.use { c ->
                    while (c.moveToNext()) {
                        val pair = Pair(c.getString(1) ?: "", c.getString(2) ?: "")
                        if (pair !in matches) matches.add(pair)
                        if (matches.size > 1) break
                    }
                }
                if (matches.size != 1) throw IllegalStateException(if (matches.isEmpty()) "No matching contact" else "Ambiguous contact. Select the exact number in Contacts")
                if (!requireContacts(call)) return@execute
                val (resolvedName, number) = matches.single()
                val requestedPackage = requestedBusiness?.let { if (it) "com.whatsapp.w4b" else "com.whatsapp" }
                val identities = mutableSetOf<String>()
                context.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf("contact_id", "data1"), "display_name = ? COLLATE NOCASE", arrayOf(resolvedName), null)?.use { c ->
                    while (c.moveToNext()) identities.add(c.getString(0) + ":" + PhoneNumberUtils.normalizeNumber(c.getString(1) ?: ""))
                }
                val uniqueNameAndNumber = identities.size == 1
                val rows = HorizonWhatsAppStore.rows(context)
                val candidates = mutableListOf<JSONObject>()
                for (i in rows.length() - 1 downTo 0) {
                    val row = rows.getJSONObject(i)
                    if ((requestedPackage != null && row.optString("package") != requestedPackage) || row.optBoolean("group", true)) continue
                    val remotePhone = row.optString("phone")
                    // Prefer notification Person URI. Exact saved-name matching is allowed only for a direct chat.
                    val same = if (remotePhone.isNotBlank()) samePhone(remotePhone, number)
                        else uniqueNameAndNumber && row.optString("conversation").equals(resolvedName, true) && row.optString("sender").equals(resolvedName, true)
                    if (same) candidates.add(row)
                }
                val conversations = candidates.map { it.optString("key") }.distinct()
                if (conversations.isEmpty()) {
                    val enabledPackages = listOf("com.whatsapp", "com.whatsapp.w4b").filter { HorizonWhatsAppStore.enabled(context, it) }
                    val pkg = requestedPackage ?: enabledPackages.singleOrNull()
                        ?: throw IllegalStateException("Select Personal or Business: no unambiguous notification route")
                    if (HorizonWhatsAppStore.prefs(context).getBoolean("accessibility", false)) {
                        requestFallback(call, pkg, number, resolvedName, text); return@execute
                    }
                    notifyManual(resolvedName, number, text, pkg)
                    throw IllegalStateException("Cannot send silently: $resolvedName has no live WhatsApp reply notification (they must message first, and Allow confirmed replies must be ON). WhatsApp was not opened. A tap-to-send notification was posted for the user; tell the user to tap it. Nothing was sent")
                }
                if (conversations.size != 1) throw IllegalStateException("Multiple matching chats. Use an explicit inbox reply instead")
                val row = candidates.first()
                if (!HorizonWhatsAppStore.replies.containsKey(row.optString("key"))) {
                    requestFallback(call, row.optString("package"), number, resolvedName, text); return@execute
                }
                if (HorizonWhatsAppStore.prefs(context).getBoolean("silent", false)) submitSilently(call, row, text)
                else activity.runOnUiThread { confirmReply(call, row.optString("id"), text, row) }
            } catch (e: Exception) { call.reject(e.message ?: "Contact send failed") }
        }
    }
    override fun handleOnDestroy() { contactWorker.shutdown(); super.handleOnDestroy() }
    // V1.92.0 silent path: no dialog, no activity, WhatsApp never opens. Off unless the user enables it.
    private fun submitSilently(call: PluginCall, found: JSONObject, text: String) {
        try {
            val p = HorizonWhatsAppStore.prefs(context)
            if (HorizonLockPlugin.locked) throw IllegalStateException("Unlock Horizon to send")
            if (!p.getBoolean("replies", false) || !HorizonWhatsAppStore.enabled(context, found.optString("package"))) throw IllegalStateException("WhatsApp permission was switched off")
            val now = System.currentTimeMillis()
            val recent = (p.getString("sent_log", "") ?: "").split(',').mapNotNull { it.toLongOrNull() }.filter { now - it < 3600000L }
            if (recent.size >= 10) throw IllegalStateException("Silent send limit reached (10 per hour)")
            val action = HorizonWhatsAppStore.replies[found.optString("key")] ?: throw IllegalStateException("Reply notification expired; WhatsApp was not opened")
            val inputs = action.remoteInputs?.filter { it.allowFreeFormInput }?.toTypedArray()
            if (inputs.isNullOrEmpty()) throw IllegalStateException("WhatsApp did not expose a text reply action")
            val intent = Intent(); val bundle = Bundle()
            inputs.forEach { bundle.putCharSequence(it.resultKey, text) }
            android.app.RemoteInput.addResultsToIntent(inputs, intent, bundle)
            if (Build.VERSION.SDK_INT >= 31 && action.actionIntent.isActivity) throw IllegalStateException("Reply action would open WhatsApp; background send refused")
            if (action.actionIntent.creatorPackage != found.optString("package")) throw IllegalStateException("Reply action package mismatch")
            if (Build.VERSION.SDK_INT >= 28) android.app.RemoteInput.setResultsSource(intent, android.app.RemoteInput.SOURCE_FREE_FORM_INPUT)
            action.actionIntent.send(context, 0, intent)
            p.edit().putString("sent_log", (recent + now).joinToString(",")).apply()
            call.resolve(JSObject().put("submitted", true).put("delivered", false))
        } catch (_: PendingIntent.CanceledException) {
            HorizonWhatsAppStore.replies.remove(found.optString("key"))
            fallbackForRow(call, found, text)
        } catch (e: Exception) { call.reject("WhatsApp reply failed: ${e.message}. Nothing was sent") }
    }
    // Tells the user when a silent send is impossible: one tap opens the prepared draft.
    private fun notifyManual(name: String, number: String, text: String, pkg: String) {
        try {
            val digits = number.filter { it.isDigit() }
            if (digits.length < 7 || !NotificationManagerCompat.from(context).areNotificationsEnabled()) return
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("horizon_whatsapp_v1", "WhatsApp message alerts", NotificationManager.IMPORTANCE_HIGH))
            val id = digits.hashCode() and 0x7fff
            val pi = PendingIntent.getActivity(context, 7500 + id, getWhatsAppIntent(number, text, pkg), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val locked = HorizonLockPlugin.locked
            val body = if (locked) "Unlock Horizon, then tap to send" else "Tap to open the draft, then press Send: $text"
            nm.notify(7600 + id, NotificationCompat.Builder(context, "horizon_whatsapp_v1")
                .setSmallIcon(R.drawable.ic_horizon_whatsapp).setColor(0xff25d366.toInt())
                .setContentTitle(if (locked) "Horizon could not send silently" else "Horizon could not send silently to $name")
                .setContentText(body).setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setContentIntent(pi).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPriority(NotificationCompat.PRIORITY_HIGH).build())
        } catch (_: Exception) { }
    }

    @PluginMethod fun status(call: PluginCall) {
        val p = HorizonWhatsAppStore.prefs(context)
        call.resolve(JSObject().put("access", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName))
            .put("personal", p.getBoolean("personal", false)).put("business", p.getBoolean("business", false))
            .put("alerts", p.getBoolean("alerts", true)).put("replies", p.getBoolean("replies", false)).put("silent", p.getBoolean("silent", false))
            .put("contacts", getPermissionState("contacts") == PermissionState.GRANTED)
            .put("accessibility", p.getBoolean("accessibility", false)).put("accessibilityConnected", HorizonWhatsAppAccessibility.connected())
            .put("connected", HorizonWhatsAppListener.connected)
            .put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled()))
    }
    @PluginMethod fun configure(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon first"); return }
        val p = HorizonWhatsAppStore.prefs(context)
        val e = p.edit()
        for (key in arrayOf("personal", "business", "alerts", "replies", "silent", "accessibility")) call.getBoolean(key)?.let { e.putBoolean(key, it) }
        e.commit()
        // Turning either source off purges its captured content immediately.
        synchronized(HorizonWhatsAppStore) { p.edit().putString("messages", HorizonWhatsAppStore.rows(context).toString()).apply() }
        HorizonWhatsAppStore.replies.keys.removeAll { key ->
            val pkg = key.split('|').getOrNull(1) ?: ""
            !HorizonWhatsAppStore.enabled(context, pkg) || !p.getBoolean("replies", false)
        }
        if (!p.getBoolean("personal", false) && !p.getBoolean("business", false)) HorizonWhatsAppStore.clear(context)
        HorizonWhatsAppListener.refreshActive()
        if (Build.VERSION.SDK_INT >= 24 && !HorizonWhatsAppListener.connected) NotificationListenerService.requestRebind(android.content.ComponentName(context, HorizonWhatsAppListener::class.java))
        call.resolve()
    }
    @PluginMethod fun openAccessibility(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon first"); return }
        try { activity.startActivity(Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)); call.resolve() }
        catch (e: Exception) { call.reject("Could not open Accessibility settings") }
    }
    private fun getWhatsAppIntent(phone: String, text: String, pkg: String): Intent {
        require(pkg == "com.whatsapp" || pkg == "com.whatsapp.w4b") { "Invalid WhatsApp package" }
        require(HorizonWhatsAppStore.enabled(context, pkg)) { "Enable the selected WhatsApp source first" }
        val digits = phone.filter { it.isDigit() }
        require(Regex("[0-9]{7,15}").matches(digits)) { "Use a full international number" }
        context.packageManager.getPackageInfo(pkg, 0)
        return Intent(Intent.ACTION_VIEW, UriBuilder(digits, text)).setPackage(pkg).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    private fun requestFallback(call: PluginCall, pkg: String, phone: String, name: String, text: String) {
        if (!HorizonWhatsAppStore.prefs(context).getBoolean("accessibility", false) || !HorizonWhatsAppAccessibility.connected()) {
            call.reject("No live reply action. Enable Horizon's Accessibility fallback and Android Accessibility access; nothing was sent"); return
        }
        activity.runOnUiThread {
            android.app.AlertDialog.Builder(activity).setTitle("Send visibly in ${if (pkg.endsWith("w4b")) "WhatsApp Business" else "WhatsApp"}?")
                .setMessage("To: $name ($phone)\n\n$text\n\nWhatsApp will open. Horizon will verify the chat and tap Send once. This is not a silent send.")
                .setNegativeButton("Cancel") { _, _ -> call.reject("Reply cancelled") }
                .setOnCancelListener { call.reject("Reply cancelled") }
                .setPositiveButton("Send") { _, _ ->
                    try {
                        if (HorizonLockPlugin.locked || !HorizonWhatsAppStore.prefs(context).getBoolean("replies", false)) throw IllegalStateException("Unlock Horizon and enable replies")
                        val intent = getWhatsAppIntent(phone, "", pkg)
                        if (!HorizonWhatsAppAccessibility.begin(context, pkg, phone, name, text, { ok, reason ->
                            if (ok) call.resolve(JSObject().put("submitted", true).put("delivered", false).put("fallback", true)) else call.reject(reason)
                        })) throw IllegalStateException("Accessibility is disconnected or a send is already pending")
                        try { activity.startActivity(intent) } catch (e: Exception) { HorizonWhatsAppAccessibility.cancel("Could not open WhatsApp"); throw e }
                    } catch (e: Exception) { call.reject(e.message ?: "Fallback failed") }
                }.show()
        }
    }
    private fun fallbackForRow(call: PluginCall, row: JSONObject, text: String) {
        if (row.optBoolean("group", true)) { call.reject("Accessibility fallback supports verified direct contacts only"); return }
        val phone = row.optString("phone")
        if (phone.isNotBlank() && getPermissionState("contacts") != PermissionState.GRANTED) { requestFallback(call, row.optString("package"), phone, phone, text); return }
        if (!requireContacts(call)) return
        val name = row.optString("conversation")
        contactWorker.execute {
            try {
                val matches = mutableSetOf<Pair<String, String>>()
                context.contentResolver.query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI, arrayOf("contact_id", "data1"), "display_name = ? COLLATE NOCASE", arrayOf(name), null)?.use { c ->
                    while (c.moveToNext()) matches.add(Pair(c.getString(0), c.getString(1)))
                }
                if (phone.isNotBlank() && (matches.size != 1 || !samePhone(matches.single().second, phone))) {
                    requestFallback(call, row.optString("package"), phone, phone, text); return@execute
                }
                if (matches.size != 1) throw IllegalStateException("Select the exact contact number: recipient is ambiguous")
                if (!requireContacts(call)) return@execute
                requestFallback(call, row.optString("package"), matches.single().second, name, text)
            } catch (e: Exception) { call.reject(e.message ?: "Could not verify recipient") }
        }
    }
    @PluginMethod fun openAccess(call: PluginCall) {
        try { activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); call.resolve() } catch (e: Exception) { call.reject("Could not open Android notification access: ${e.message}") }
    }
    @PluginMethod fun consumeOpen(call: PluginCall) {
        activity.runOnUiThread {
            val open = activity.intent?.getBooleanExtra("horizon_whatsapp_inbox", false) == true
            activity.intent?.removeExtra("horizon_whatsapp_inbox")
            call.resolve(JSObject().put("open", open))
        }
    }
    @PluginMethod fun clear(call: PluginCall) { if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon first"); return }; HorizonWhatsAppStore.clear(context); call.resolve() }
    @PluginMethod fun read(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon to read WhatsApp previews"); return }
        val q = (call.getString("query") ?: "").lowercase().take(200)
        val limit = (call.getInt("limit", 50) ?: 50).coerceIn(1, 300)
        val a = HorizonWhatsAppStore.rows(context); val out = JSArray()
        val offset = (call.getInt("offset", 0) ?: 0).coerceIn(0, 300)
        val maxChars = (call.getInt("maxChars", 2500000) ?: 2500000).coerceIn(8000, 2500000)
        var matched = 0; var chars = 0; var pageFull = false
        for (i in a.length() - 1 downTo 0) {
            val r = a.getJSONObject(i)
            if (q.isNotBlank() && q != "all" && !(r.optString("sender") + " " + r.optString("conversation") + " " + r.optString("text")).lowercase().contains(q)) continue
            matched++
            if (matched <= offset || pageFull) continue
            r.put("canReply", HorizonWhatsAppStore.replies.containsKey(r.optString("key")))
            val size = r.toString().length
            if (out.length() > 0 && (out.length() >= limit || chars + size > maxChars)) { pageFull = true; continue }
            out.put(r); chars += size
        }
        val next = offset + out.length()
        call.resolve(JSObject().put("messages", out).put("capturedOnly", true).put("totalMatches", matched)
            .put("offset", offset).put("nextOffset", next).put("hasMore", next < matched))
    }
    @PluginMethod fun compose(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon first"); return }
        val business = call.getBoolean("business", false) == true
        val pkg = if (business) "com.whatsapp.w4b" else "com.whatsapp"
        if (!HorizonWhatsAppStore.enabled(context, pkg)) { call.reject("Enable this WhatsApp source in Permissions first"); return }
        val number = (call.getString("phone") ?: "").replace(Regex("[ +()\\-]"), "")
        val text = call.getString("text")?.trim() ?: ""
        if (!Regex("[0-9]{7,15}").matches(number) || text.isBlank() || text.length > 4000) { call.reject("Use an international phone number and 1–4000 message characters"); return }
        activity.runOnUiThread {
            android.app.AlertDialog.Builder(activity).setTitle("Prepare WhatsApp message to +$number")
                .setMessage(text + "\n\nWhatsApp will open. Review the recipient and tap Send there; this does not send silently.")
                .setNegativeButton("Cancel") { _, _ -> call.reject("Message cancelled") }
                .setOnCancelListener { call.reject("Message cancelled") }
                .setPositiveButton("Open draft") { _, _ ->
                    try {
                        activity.startActivity(getWhatsAppIntent(number, text, pkg))
                        call.resolve(JSObject().put("prepared", true).put("sent", false))
                    } catch (e: Exception) { call.reject("Could not open WhatsApp: ${e.message}") }
                }.show()
        }
    }
    private fun UriBuilder(number: String, text: String) = android.net.Uri.parse("https://wa.me/$number").buildUpon().appendQueryParameter("text", text).build()
    @PluginMethod fun reply(call: PluginCall) {
        if (HorizonLockPlugin.locked) { call.reject("Unlock Horizon to reply"); return }
        val id = call.getString("id") ?: ""; val text = call.getString("text")?.trim() ?: ""
        if (text.isEmpty() || text.length > 4000) { call.reject("Reply must contain 1–4000 characters"); return }
        if (!HorizonWhatsAppStore.prefs(context).getBoolean("replies", false)) { call.reject("Enable WhatsApp replies in Permissions"); return }
        val rows = HorizonWhatsAppStore.rows(context)
        var row: JSONObject? = null
        for (i in 0 until rows.length()) if (rows.getJSONObject(i).optString("id") == id) row = rows.getJSONObject(i)
        val found = row ?: run { call.reject("Message no longer available"); return }
        if (!HorizonWhatsAppStore.replies.containsKey(found.optString("key"))) fallbackForRow(call, found, text)
        else if (HorizonWhatsAppStore.prefs(context).getBoolean("silent", false)) submitSilently(call, found, text)
        else confirmReply(call, id, text, found)
    }
    private fun confirmReply(call: PluginCall, id: String, text: String, found: JSONObject) {
        if (HorizonLockPlugin.locked || !HorizonWhatsAppStore.prefs(context).getBoolean("replies", false) || !HorizonWhatsAppStore.enabled(context, found.optString("package"))) { call.reject("Unlock Horizon and enable confirmed replies in Terminal Controls"); return }
        if (!HorizonWhatsAppStore.replies.containsKey(found.optString("key"))) { call.reject("No active reply notification; WhatsApp was not opened"); return }
        activity.runOnUiThread {
            android.app.AlertDialog.Builder(activity).setTitle("Reply to ${found.optString("conversation")}")
                .setMessage(text).setNegativeButton("Cancel") { _, _ -> call.reject("Reply cancelled") }
                .setOnCancelListener { call.reject("Reply cancelled") }
                .setPositiveButton("Send") { _, _ ->
                    try {
                        if (HorizonLockPlugin.locked) throw IllegalStateException("Unlock Horizon to send replies")
                        if ((call.getString("contactId") != null || call.getString("name") != null) && getPermissionState("contacts") != PermissionState.GRANTED) throw IllegalStateException("Contacts permission was revoked")
                        if (!HorizonWhatsAppStore.enabled(context, found.optString("package")) || !HorizonWhatsAppStore.prefs(context).getBoolean("replies", false)) throw IllegalStateException("WhatsApp permission was switched off")
                        // Re-read after approval: an action may expire while the dialog is open.
                        val action = HorizonWhatsAppStore.replies[found.optString("key")] ?: throw IllegalStateException("Reply notification expired; WhatsApp was not opened")
                        val inputs = action.remoteInputs?.filter { it.allowFreeFormInput }?.toTypedArray()
                        if (inputs.isNullOrEmpty()) throw IllegalStateException("WhatsApp did not expose a text reply action")
                        val intent = Intent(); val bundle = Bundle()
                        inputs.forEach { bundle.putCharSequence(it.resultKey, text) }
                        android.app.RemoteInput.addResultsToIntent(inputs, intent, bundle)
                        if (Build.VERSION.SDK_INT >= 31 && action.actionIntent.isActivity) throw IllegalStateException("Reply action would open WhatsApp; background send refused")
                        if (action.actionIntent.creatorPackage != found.optString("package")) throw IllegalStateException("Reply action package mismatch")
                        if (Build.VERSION.SDK_INT >= 28) android.app.RemoteInput.setResultsSource(intent, android.app.RemoteInput.SOURCE_FREE_FORM_INPUT)
                        action.actionIntent.send(context, 0, intent)
                        call.resolve(JSObject().put("submitted", true).put("delivered", false))
                    } catch (_: PendingIntent.CanceledException) {
                        HorizonWhatsAppStore.replies.remove(found.optString("key"))
                        fallbackForRow(call, found, text)
                    } catch (e: Exception) { call.reject("WhatsApp reply failed: ${e.message}") }
                }.show()
        }
    }
}

class HorizonWhatsAppListener : NotificationListenerService() {
    private val previewIds = ConcurrentHashMap<String, String>()
    private val inboxWorker = java.util.concurrent.Executors.newSingleThreadExecutor()
    companion object {
        @Volatile var connected = false
        @JvmField @Volatile var uiVisible = false
        private var live = java.lang.ref.WeakReference<HorizonWhatsAppListener>(null)
        fun refreshActive() { live.get()?.let { service -> service.enqueue { service.reload() } } }
    }
    private fun enqueue(work: () -> Unit) { try { inboxWorker.execute { try { work() } catch (_: Exception) { } } } catch (_: java.util.concurrent.RejectedExecutionException) { } }
    override fun onDestroy() { connected = false; live.clear(); HorizonWhatsAppStore.replies.clear(); inboxWorker.shutdownNow(); super.onDestroy() }
    private fun reload() { try { activeNotifications?.forEach { capture(it, false) } } catch (_: Exception) { } }
    override fun onListenerConnected() {
        connected = true
        live = java.lang.ref.WeakReference(this)
        enqueue { reload() }
    }
    override fun onListenerDisconnected() {
        connected = false; live.clear(); HorizonWhatsAppStore.replies.clear()
        if (Build.VERSION.SDK_INT >= 24) requestRebind(android.content.ComponentName(this, javaClass))
    }
    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val previewed = fastPreview(sbn)
        enqueue { capture(sbn, true, previewed) }
    }
    // Immediate alert before the persistence worker walks retained messages. No AI/network work here.
    private fun fastPreview(sbn: StatusBarNotification): Boolean {
        if (!HorizonWhatsAppStore.enabled(this, sbn.packageName)) return false
        val n = sbn.notification
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0 || n.category == Notification.CATEGORY_CALL) return false
        val parsed = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        val message = parsed?.messages?.lastOrNull()
        val hasReply = n.actions?.any { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true } == true
        if (message == null && !hasReply) return false // Ignore background service/status notifications.
        val e = n.extras ?: return false
        val title = e.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "WhatsApp"
        val sender = message?.person?.name?.toString() ?: title
        val body = message?.text?.toString() ?: (e.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: e.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: ""
        if (body.isBlank()) return false
        val time = message?.timestamp ?: sbn.postTime
        val id = java.util.UUID.nameUUIDFromBytes("${sbn.key}|$sender|$time|$body".toByteArray()).toString()
        if (previewIds.put(sbn.key, id) == id) return true
        if (previewIds.size > 300) previewIds.keys.firstOrNull { it != sbn.key }?.let { previewIds.remove(it) }
        val row = JSONObject().put("id", id).put("key", sbn.key).put("package", sbn.packageName)
            .put("sender", sender.take(200)).put("conversation", title.take(200)).put("text", body.take(8000))
            .put("time", time).put("business", sbn.packageName == "com.whatsapp.w4b")
        if (!HorizonLockPlugin.locked) HorizonAIPlugin.dispatchToJs("horizon-whatsapp", row.toString())
        if (!uiVisible && HorizonWhatsAppStore.prefs(this).getBoolean("alerts", true)) showAlert(row)
        return true
    }
    override fun onNotificationRemoved(sbn: StatusBarNotification) { enqueue { HorizonWhatsAppStore.replies.remove(sbn.key) } }
    private fun capture(sbn: StatusBarNotification, alert: Boolean, previewed: Boolean = false) {
        val pkg = sbn.packageName
        if (!HorizonWhatsAppStore.enabled(this, pkg)) return
        val n = sbn.notification
        if (n.flags and Notification.FLAG_GROUP_SUMMARY != 0 || n.category == Notification.CATEGORY_CALL) return
        val e = n.extras ?: return
        val title = e.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: "WhatsApp"
        val action = n.actions?.firstOrNull { a -> a.remoteInputs?.any { it.allowFreeFormInput } == true }
        if (action == null) HorizonWhatsAppStore.replies.remove(sbn.key)
        if (action != null && HorizonWhatsAppStore.prefs(this).getBoolean("replies", false)) HorizonWhatsAppStore.replies[sbn.key] = action
        val parsed = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
        val group = parsed == null || parsed.isGroupConversation
        val msgs = parsed?.messages
        if (msgs.isNullOrEmpty() && action == null) return
        val items = if (!msgs.isNullOrEmpty()) msgs.map { Triple(it.person?.name?.toString() ?: title, it.text?.toString() ?: "[Attachment]", it.timestamp) }
            else listOf(Triple(title, (e.getCharSequence(Notification.EXTRA_BIG_TEXT) ?: e.getCharSequence(Notification.EXTRA_TEXT))?.toString() ?: "", sbn.postTime))
        for ((index, item) in items.withIndex()) {
            val (sender, body, time) = item
            if (body.isBlank()) continue
            val personUri = parsed?.messages?.lastOrNull { it.person?.name?.toString() == sender }?.person?.uri ?: ""
            val phone = if (personUri.startsWith("tel:")) personUri.removePrefix("tel:").substringBefore('?') else ""
            val row = JSONObject().put("group", group).put("phone", phone).put("id", java.util.UUID.nameUUIDFromBytes("${sbn.key}|$sender|$time|$body".toByteArray()).toString())
                .put("key", sbn.key).put("package", pkg).put("sender", sender.take(200)).put("conversation", title.take(200))
                .put("text", body.take(8000)).put("time", time).put("business", pkg.endsWith("w4b"))
            if (!HorizonWhatsAppStore.add(this, row)) continue
            if (!previewed && !HorizonLockPlugin.locked && alert && index == items.lastIndex) HorizonAIPlugin.dispatchToJs("horizon-whatsapp", row.toString())
            if (!previewed && alert && index == items.lastIndex && !uiVisible && HorizonWhatsAppStore.prefs(this).getBoolean("alerts", true)) showAlert(row)
        }
    }
    private fun showAlert(row: JSONObject) {
        try {
            if (!HorizonWhatsAppStore.enabled(this, row.optString("package"))) return
            if (!NotificationManagerCompat.from(this).areNotificationsEnabled()) return
            val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel("horizon_whatsapp_v1", "WhatsApp message alerts", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Sender and message preview, only for the WhatsApp sources you enable"
                lockscreenVisibility = Notification.VISIBILITY_PRIVATE
            })
            val open = PendingIntent.getActivity(this, 7401, Intent(this, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("horizon_whatsapp_inbox", true)
            }, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            val pkg = row.getString("package")
            val builder = NotificationCompat.Builder(this, "horizon_whatsapp_v1")
                .setSmallIcon(R.drawable.ic_horizon_whatsapp).setColor(0xff25d366.toInt())
                .setContentTitle(if (HorizonLockPlugin.locked) "New WhatsApp message" else "${if (row.optBoolean("business")) "WhatsApp Business" else "WhatsApp"} · ${row.optString("sender")}")
                .setContentText(if (HorizonLockPlugin.locked) "Unlock Horizon to view" else row.optString("text"))
                .setStyle(NotificationCompat.BigTextStyle().bigText(if (HorizonLockPlugin.locked) "Unlock Horizon to view" else row.optString("text")))
                .setContentIntent(open).setAutoCancel(true).setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
                .setPublicVersion(NotificationCompat.Builder(this, "horizon_whatsapp_v1").setSmallIcon(R.drawable.ic_horizon_whatsapp)
                    .setContentTitle("New WhatsApp message").setContentText("Unlock to view").build())
                .setPriority(NotificationCompat.PRIORITY_HIGH).setGroup("horizon_whatsapp").setOnlyAlertOnce(true)
            try { builder.setLargeIcon(packageManager.getApplicationIcon(pkg).let { d ->
                val bitmap = android.graphics.Bitmap.createBitmap(96, 96, android.graphics.Bitmap.Config.ARGB_8888)
                d.setBounds(0, 0, 96, 96); d.draw(android.graphics.Canvas(bitmap)); bitmap
            }) } catch (_: Exception) { }
            nm.notify(7400 + (row.optString("key").hashCode() and 0x7fff), builder.build())
        } catch (_: Exception) { /* permission, channel or OEM restrictions: inbox still retained */ }
    }
}
