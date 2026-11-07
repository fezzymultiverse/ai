package __APPID__

import android.Manifest
import android.app.DownloadManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.provider.MediaStore
import android.webkit.MimeTypeMap
import androidx.core.app.NotificationCompat
import androidx.core.app.RemoteInput
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** V1.13.0: native network jobs, private reply notifications and system downloads. */
@CapacitorPlugin(name = "HorizonAI")
class HorizonAIPlugin : Plugin() {
    companion object {
        @JvmField @Volatile var foreground = true
        const val KEY_TEXT = "horizon_reply_text"
        private const val CHANNEL = "horizon_ai_replies"
        @Volatile private var instance: HorizonAIPlugin? = null

        fun notificationId(chatId: String): Int = 5100 + (chatId.hashCode() and 0x7fff)

        private fun canNotify(context: Context): Boolean =
            Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

        private fun manager(context: Context): NotificationManager {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            if (Build.VERSION.SDK_INT >= 26) nm.createNotificationChannel(NotificationChannel(CHANNEL, "AI replies", NotificationManager.IMPORTANCE_DEFAULT))
            return nm
        }

        private fun openIntent(context: Context, chatId: String): PendingIntent {
            val open = Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
                action = "${context.packageName}.REPLY"
                data = Uri.parse("horizon://reply/${Uri.encode(chatId)}")
                putExtra("horizon_reply_chat", chatId)
            }
            return PendingIntent.getActivity(context, chatId.hashCode(), open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }

        /** Runs a window event inside the WebView. False when the app process or its WebView is not alive. */
        @JvmStatic fun dispatchToJs(event: String, detailJson: String): Boolean {
            val web = try { instance?.bridge?.webView } catch (_: Exception) { null } ?: return false
            web.post { web.evaluateJavascript("window.dispatchEvent(new CustomEvent('$event',{detail:$detailJson}))", null) }
            return true
        }

        /** Replaces the notification the user replied from (this also stops Android's reply spinner). */
        @JvmStatic fun postStatus(context: Context, chatId: String, title: String, text: String) {
            if (!canNotify(context)) return
            val extras = Bundle().apply { putBoolean("horizon_status", true) }
            val n = NotificationCompat.Builder(context, CHANNEL)
                .setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle(title).setContentText(text)
                .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOnlyAlertOnce(true).setAutoCancel(true)
                .setContentIntent(openIntent(context, chatId)).addExtras(extras).build()
            manager(context).notify(notificationId(chatId), n)
        }
    }

    override fun load() { instance = this }
    override fun handleOnDestroy() { if (instance === this) instance = null }

    @PluginMethod
    fun speechHold(call: PluginCall) {
        try {
            ContextCompat.startForegroundService(context, Intent(context, HorizonSpeakService::class.java).setAction("hold"))
            call.resolve()
        } catch (e: Exception) { call.reject("Could not start the read-aloud service: ${e.message}") }
    }

    @PluginMethod
    fun speechRelease(call: PluginCall) {
        context.stopService(Intent(context, HorizonSpeakService::class.java))
        call.resolve()
    }

    @PluginMethod
    fun consumeInlineReplies(call: PluginCall) {
        call.resolve(JSObject().put("items", HorizonInlineQueue.pending(context)))
    }

    @PluginMethod
    fun ackInlineReply(call: PluginCall) {
        HorizonInlineQueue.ack(context, call.getString("id") ?: "")
        call.resolve()
    }

    @PluginMethod
    fun beginTurn(call: PluginCall) {
        try {
            ContextCompat.startForegroundService(context, Intent(context, HorizonAIService::class.java).setAction("hold"))
            call.resolve()
        } catch (e: Exception) { call.reject("Could not start AI service: ${e.message}") }
    }

    @PluginMethod
    fun endTurn(call: PluginCall) {
        HorizonAIService.releaseTurn()
        call.resolve()
    }

    @PluginMethod
    fun request(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("Missing request URL")
        // Only the existing AI provider endpoints may receive stored credentials.
        val host = try { URL(url).host } catch (_: Exception) { "" }
        if (!url.startsWith("https://") || host !in setOf("generativelanguage.googleapis.com", "api.groq.com", "api.cohere.com", "text.pollinations.ai")) {
            call.reject("Unsupported AI endpoint")
            return
        }
        try {
            HorizonAIService.submit(context) {
                var connection: HttpURLConnection? = null
                try {
                    connection = URL(url).openConnection() as HttpURLConnection
                    connection.connectTimeout = 30000
                    connection.readTimeout = 240000
                    connection.instanceFollowRedirects = false // Never forward API keys to a redirect host.
                    connection.requestMethod = call.getString("method", "POST") ?: "POST"
                    val headers = call.getObject("headers") ?: JSObject()
                    val keys = headers.keys()
                    while (keys.hasNext()) {
                        val key = keys.next()
                        connection.setRequestProperty(key, headers.optString(key))
                    }
                    if (connection.requestMethod != "GET") {
                        connection.doOutput = true
                        connection.outputStream.use { it.write((call.getString("body") ?: "").toByteArray(Charsets.UTF_8)) }
                    }
                    val status = connection.responseCode
                    val stream = if (status >= 400) connection.errorStream else connection.inputStream
                    val body = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
                    val result = JSObject()
                    result.put("status", status)
                    result.put("body", body)
                    // Notify from native I/O even if Android has suspended the WebView's JS timers.
                    if (status in 200..299 && call.getBoolean("notifyOnResponse", false) == true && !foreground) {
                        try {
                            val data = org.json.JSONObject(body)
                            val text = when (host) {
                                "generativelanguage.googleapis.com" -> {
                                    val parts = data.optJSONArray("candidates")?.optJSONObject(0)?.optJSONObject("content")?.optJSONArray("parts")
                                    (0 until (parts?.length() ?: 0)).joinToString("") { parts?.optJSONObject(it)?.optString("text", "") ?: "" }
                                }
                                "api.cohere.com" -> {
                                    val parts = data.optJSONObject("message")?.optJSONArray("content")
                                    (0 until (parts?.length() ?: 0)).joinToString("") { parts?.optJSONObject(it)?.optString("text", "") ?: "" }
                                }
                                else -> data.optJSONArray("choices")?.optJSONObject(0)?.optJSONObject("message")?.optString("content", "") ?: ""
                            }
                            // Tool calls are intermediate, not a finished reply.
                            if (text.isNotBlank() && !text.contains("[[") && !text.contains("<artifact")) {
                                publishReply(call.getString("chatId") ?: "", text)
                            }
                        } catch (_: Exception) { /* Rendering/parser failures never fail the provider request. */ }
                    }
                    call.resolve(result)
                } catch (e: Exception) {
                    call.reject("AI request failed: ${e.message}")
                } finally { connection?.disconnect() }
            }
        } catch (e: Exception) { call.reject("Could not start background AI job: ${e.message}") }
    }

    private fun publishReply(chatId: String, rawText: String): Boolean {
        if (foreground || !canNotify(context)) return false
        val text = rawText.take(3500)
        val nm = manager(context)
        val nid = notificationId(chatId)
        // A "Horizon is thinking" status sits on this id after an inline reply. Remove it so the answer alerts.
        if (Build.VERSION.SDK_INT >= 23 && nm.activeNotifications.any { it.id == nid && it.notification.extras.getBoolean("horizon_status", false) }) nm.cancel(nid)
        val replyIntent = Intent(context, HorizonReplyReceiver::class.java)
            .setAction("${context.packageName}.INLINE_REPLY").putExtra("chatId", chatId)
        // Android fills the typed text into this intent, so it has to be mutable (API 31+).
        val replyPending = PendingIntent.getBroadcast(context, chatId.hashCode(), replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0))
        val remote = RemoteInput.Builder(KEY_TEXT).setLabel("Reply to Horizon").build()
        val reply = NotificationCompat.Action.Builder(android.R.drawable.ic_menu_send, "Reply", replyPending)
            .addRemoteInput(remote).setAllowGeneratedReplies(false)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY).setShowsUserInterface(false).build()
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(android.R.drawable.stat_notify_chat).setContentTitle("Horizon replied")
            .setContentText(text.take(180)).setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setOnlyAlertOnce(true)
            .setContentIntent(openIntent(context, chatId)).addAction(reply)
            .setAutoCancel(true).build()
        nm.notify(nid, notification)
        return true
    }

    @PluginMethod
    fun notifyReply(call: PluginCall) {
        try {
            val shown = publishReply(call.getString("chatId") ?: "", call.getString("text") ?: "Your reply is ready")
            call.resolve(JSObject().put("shown", shown))
        } catch(e: Exception) { call.reject("Could not show reply notification: ${e.message}") }
    }

    @PluginMethod
    fun consumeReply(call: PluginCall) {
        activity.runOnUiThread {
            val intent = activity.intent
            val chatId = intent?.getStringExtra("horizon_reply_chat")
            intent?.removeExtra("horizon_reply_chat")
            call.resolve(JSObject().put("chatId", chatId ?: ""))
        }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        try {
            val url = call.getString("url") ?: throw IllegalArgumentException("Missing URL")
            if (!url.startsWith("https://")) throw IllegalArgumentException("Downloads require HTTPS")
            val filename = (call.getString("filename") ?: "horizon-media").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(120)
            val video = call.getBoolean("video", false) == true
            val folder = if (video) "Movies/Horizon" else "Music/Horizon"
            // V1.23.0: DownloadManager wants a STANDARD directory type plus a sub-path. "Music/Horizon" as the type threw "Not one of standard directories".
            val stdDir = if (video) Environment.DIRECTORY_MOVIES else Environment.DIRECTORY_MUSIC
            val request = DownloadManager.Request(Uri.parse(url))
                .setTitle(call.getString("title") ?: filename)
                .setDescription("Horizon · ${if (video) "video" else "audio"}")
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(stdDir, "Horizon/" + filename)
                .setAllowedOverMetered(true)
                .setAllowedOverRoaming(false)
            val manager = context.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            val id = manager.enqueue(request)
            call.resolve(JSObject().put("id", id.toString()).put("path", "$folder/$filename"))
        } catch (e: Exception) { call.reject("Could not queue download: ${e.message}") }
    }

    /** V1.21.1: saves a media URL into Music/Horizon or Movies/Horizon through MediaStore. Android 10+ needs no storage permission and no folder is created by hand,
     *  which is what made the direct /storage/emulated/0/Music/Horizon write fail with ENOENT. Progress arrives as "mediaProgress". */
    @PluginMethod
    fun saveMedia(call: PluginCall) {
        val url = call.getString("url")
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) { call.reject("Missing or unsupported URL"); return }
        val filename = (call.getString("filename") ?: "horizon-media").replace(Regex("[\\\\/:*?\"<>|\\p{Cntrl}]"), "_").take(120)
        val video = call.getBoolean("video", false) == true
        // V1.23.0: optional kind = audio | video | image | file. Without it the old video flag decides, so older callers behave the same.
        val kind = (call.getString("kind") ?: (if (video) "video" else "audio")).lowercase().let { if (it == "audio" || it == "video" || it == "image" || it == "file") it else "file" }
        Thread {
            val resolver = context.contentResolver
            var target: Uri? = null
            try {
                if (Build.VERSION.SDK_INT < 29) throw IllegalStateException("needs Android 10 or newer")
                val ext = filename.substringAfterLast('.', "").lowercase()
                val mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext) ?: when (kind) { "video" -> "video/mp4"; "image" -> "image/jpeg"; "file" -> "application/octet-stream"; else -> "audio/mp4" }
                val rel = when (kind) { "video" -> "Movies/Horizon"; "image" -> "Pictures/Horizon"; "file" -> "Download/Horizon"; else -> "Music/Horizon" }
                val cv = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, filename)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, rel)
                    put(MediaStore.MediaColumns.IS_PENDING, 1)
                }
                val coll = when (kind) {
                    "video" -> MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    "image" -> MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    "file" -> MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                    else -> MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                }
                val out0 = resolver.insert(coll, cv) ?: throw IOException("Android refused to create the file in $rel")
                target = out0
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 20000
                conn.readTimeout = 60000
                conn.instanceFollowRedirects = true
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36")
                conn.setRequestProperty("Accept", "*/*")
                val code = conn.responseCode
                if (code !in 200..299) throw IOException("the server answered $code")
                val total = conn.contentLengthLong
                var got = 0L
                var last = 0L
                conn.inputStream.use { input ->
                    (resolver.openOutputStream(out0) ?: throw IOException("could not open the new file")).use { out ->
                        val buf = ByteArray(65536)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            got += n
                            val now = System.currentTimeMillis()
                            if (now - last > 300) {
                                last = now
                                notifyListeners("mediaProgress", JSObject().put("url", url).put("bytes", got).put("contentLength", total))
                            }
                        }
                    }
                }
                if (got == 0L) throw IOException("the server sent an empty file")
                if (total > 0 && got < total) throw IOException("the connection closed early")
                resolver.update(out0, ContentValues().apply { put(MediaStore.MediaColumns.IS_PENDING, 0) }, null, null)
                notifyListeners("mediaProgress", JSObject().put("url", url).put("bytes", got).put("contentLength", if (total > 0) total else got))
                call.resolve(JSObject().put("path", "$rel/$filename").put("uri", out0.toString()).put("mime", mime).put("kind", kind))
            } catch (e: Exception) {
                try { target?.let { resolver.delete(it, null, null) } } catch (_: Exception) { }
                call.reject("Could not save the media: ${e.message ?: e.javaClass.simpleName}")
            }
        }.start()
    }

    /** V1.23.0: opens a saved file (the content:// uri saveMedia returned) in whatever app on the phone handles its type. */
    @PluginMethod
    fun openMedia(call: PluginCall) {
        val uriStr = call.getString("uri")
        if (uriStr == null || !uriStr.startsWith("content://")) { call.reject("There is no saved file to open"); return }
        val mime = call.getString("mime") ?: "*/*"
        try {
            val intent = Intent(Intent.ACTION_VIEW).setDataAndType(Uri.parse(uriStr), mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (e: android.content.ActivityNotFoundException) {
            call.reject("No app on this phone can open that kind of file")
        } catch (e: Exception) { call.reject("Could not open the file: ${e.message ?: e.javaClass.simpleName}") }
    }

    /** V1.23.0: hands a magnet: or http(s) link to the matching app (a torrent app for magnets). Horizon has no torrent engine of its own. */
    @PluginMethod
    fun openLink(call: PluginCall) {
        val url = call.getString("url")?.trim()
        if (url == null || !(url.startsWith("magnet:?") || url.startsWith("https://") || url.startsWith("http://"))) { call.reject("Only magnet and web links can be opened"); return }
        try {
            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            call.resolve()
        } catch (e: android.content.ActivityNotFoundException) {
            call.reject(if (url.startsWith("magnet:")) "No torrent app is installed. Install one such as LibreTorrent or Flud, then try again" else "No app can open that link")
        } catch (e: Exception) { call.reject("Could not open the link: ${e.message ?: e.javaClass.simpleName}") }
    }
}
