package __APPID__

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.app.RemoteInput
import org.json.JSONArray
import org.json.JSONObject

/** V1.17.0: handles the notification Reply box and the Stop button of the read-aloud notification. */
class HorizonReplyReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pkg = context.packageName
        when (intent.action) {
            "$pkg.INLINE_REPLY" -> {
                val chatId = intent.getStringExtra("chatId") ?: ""
                val text = RemoteInput.getResultsFromIntent(intent)
                    ?.getCharSequence(HorizonAIPlugin.KEY_TEXT)?.toString()?.trim().orEmpty().take(4000)
                if (text.isEmpty()) {
                    // Always update the notification, otherwise Android keeps the reply spinner forever.
                    HorizonAIPlugin.postStatus(context, chatId, "Horizon", "Your reply was empty.")
                    return
                }
                val id = HorizonInlineQueue.add(context, chatId, text)
                val detail = JSONObject().put("id", id).put("chatId", chatId).put("text", text)
                val delivered = HorizonAIPlugin.dispatchToJs("horizon-inline-reply", detail.toString())
                if (delivered) HorizonAIPlugin.postStatus(context, chatId, "You: ${text.take(60)}", "Horizon is thinking...")
                else HorizonAIPlugin.postStatus(context, chatId, "Reply saved", "Open Horizon and it will send: ${text.take(80)}")
            }
            "$pkg.STOP_SPEECH" -> {
                HorizonAIPlugin.dispatchToJs("horizon-tts-stop", "{}")
                context.stopService(Intent(context, HorizonSpeakService::class.java))
            }
        }
    }
}

/** Replies typed in the notification wait here until the WebView confirms it sent them. */
object HorizonInlineQueue {
    private const val PREFS = "horizon_inline"
    private const val KEY = "queue"
    private const val MAX_AGE = 60L * 60L * 1000L

    private fun load(context: Context): JSONArray = try {
        JSONArray(context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "[]"))
    } catch (_: Exception) { JSONArray() }

    private fun save(context: Context, list: JSONArray) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, list.toString()).apply()
    }

    private fun fresh(list: JSONArray, keepId: String? = null): JSONArray {
        val now = System.currentTimeMillis()
        val out = JSONArray()
        for (i in 0 until list.length()) {
            val o = list.optJSONObject(i) ?: continue
            if (now - o.optLong("ts", 0L) > MAX_AGE) continue
            if (keepId != null && o.optString("id") == keepId) continue
            out.put(o)
        }
        return out
    }

    @Synchronized fun add(context: Context, chatId: String, text: String): String {
        val id = java.util.UUID.randomUUID().toString()
        val list = fresh(load(context))
        list.put(JSONObject().put("id", id).put("chatId", chatId).put("text", text).put("ts", System.currentTimeMillis()))
        save(context, list)
        return id
    }

    @Synchronized fun ack(context: Context, id: String) { save(context, fresh(load(context), id)) }

    @Synchronized fun pending(context: Context): JSONArray {
        val list = fresh(load(context))
        save(context, list)
        return list
    }
}
