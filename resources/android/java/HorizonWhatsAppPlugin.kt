package __APPID__

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.TimeUnit

/** Closed viewer/editor. No RemoteInput, contacts, Accessibility sender or message-send endpoint. */
internal object HorizonWhatsAppStore {
    fun prefs(c: Context) = c.getSharedPreferences("horizon_whatsapp", Context.MODE_PRIVATE)
    fun enabled(c: Context, pkg: String): Boolean = prefs(c).getBoolean("viewer_v2", false) && when(pkg) {
        "com.whatsapp" -> prefs(c).getBoolean("personal", false)
        "com.whatsapp.w4b" -> prefs(c).getBoolean("business", false)
        else -> false
    }
    @Synchronized fun migrate(c: Context) {
        val p = prefs(c)
        if (p.getBoolean("viewer_v2", false)) return
        // Old messaging consents are NOT reused for this closed feature.
        p.edit().clear().putBoolean("viewer_v2", true).commit()
        if (Build.VERSION.SDK_INT >= 26) (c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).deleteNotificationChannel("horizon_whatsapp_v1")
    }
    @Synchronized fun rows(c: Context): JSONArray {
        val p = prefs(c)
        val input = try { HorizonCheckins.open(p.getString("sealed_previews", "") ?: "").optJSONArray("rows") ?: JSONArray() } catch (_: Exception) { JSONArray() }
        val out = JSONArray(); val cutoff = System.currentTimeMillis() - 86400000L
        for (i in maxOf(0, input.length() - 100) until input.length()) {
            val m = input.optJSONObject(i) ?: continue
            if (m.optLong("time") >= cutoff && enabled(c, m.optString("package"))) out.put(m)
        }
        return out
    }
    @Synchronized fun save(c: Context, a: JSONArray) { prefs(c).edit().putString("sealed_previews", HorizonCheckins.seal(JSONObject().put("rows", a).toString())).commit() }
    @Synchronized fun add(c: Context, row: JSONObject): Boolean {
        val a = rows(c)
        for (i in 0 until a.length()) if (a.getJSONObject(i).optString("id") == row.optString("id")) return false
        val out = JSONArray()
        for(i in maxOf(0, a.length()-99) until a.length()) out.put(a.get(i))
        out.put(row); save(c,out); return true
    }
    fun find(c: Context, id: String): JSONObject? { val a = rows(c); for(i in a.length()-1 downTo 0) if(a.getJSONObject(i).optString("id")==id) return a.getJSONObject(i); return null }
    @Synchronized fun clear(c: Context) {
        val p = prefs(c); val e = p.edit().remove("sealed_previews")
        p.all.keys.filter { it.startsWith("draft_") }.forEach { e.remove(it) }
        e.putString("draft_generation", UUID.randomUUID().toString()).commit()
        WorkManager.getInstance(c).cancelAllWorkByTag("horizon-wa-draft")
        val nm=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if(Build.VERSION.SDK_INT>=23) nm.activeNotifications.filter { it.notification.channelId == "horizon_whatsapp_drafts_v2" }.forEach { nm.cancel(it.id) }
    }
}

@CapacitorPlugin(name="HorizonWhatsApp")
class HorizonWhatsAppPlugin: Plugin() {
    private val io = java.util.concurrent.Executors.newSingleThreadExecutor()
    override fun load() { super.load(); io.execute { HorizonWhatsAppStore.migrate(context) } }
    override fun handleOnDestroy() { io.shutdown(); super.handleOnDestroy() }
    private fun unlocked(call: PluginCall): Boolean { if(Build.VERSION.SDK_INT<23){call.reject("Encrypted preview drafts require Android 6 or newer");return false};if(HorizonLockPlugin.locked){call.reject("Unlock Horizon first");return false};return true }
    @PluginMethod fun status(call: PluginCall) {
        val p=HorizonWhatsAppStore.prefs(context)
        val out=JSObject().put("access", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName))
            .put("notifications", NotificationManagerCompat.from(context).areNotificationsEnabled()).put("connected", HorizonWhatsAppListener.connected)
        for(k in arrayOf("personal","business","toasts","aiSee","askDraft","alerts")) out.put(k,p.getBoolean(k,false))
        call.resolve(out)
    }
    @PluginMethod fun configure(call: PluginCall) {
        if(!unlocked(call))return
        io.execute {
            try {
                HorizonWhatsAppStore.migrate(context)
                val p=HorizonWhatsAppStore.prefs(context);val e=p.edit()
                for(k in arrayOf("personal","business","toasts","aiSee","askDraft","alerts"))call.getBoolean(k)?.let{e.putBoolean(k,it)}
                e.commit()
                if(call.getBoolean("aiSee")==false || call.getBoolean("personal")==false || call.getBoolean("business")==false) HorizonWhatsAppStore.clear(context)
                HorizonWhatsAppStore.save(context,HorizonWhatsAppStore.rows(context))
                if(Build.VERSION.SDK_INT>=24&&!HorizonWhatsAppListener.connected) NotificationListenerService.requestRebind(android.content.ComponentName(context,HorizonWhatsAppListener::class.java))
                call.resolve()
            }catch(e:Exception){call.reject(e.message?:"Could not update permissions")}
        }
    }
    @PluginMethod fun openAccess(call:PluginCall){if(!unlocked(call))return;activity.runOnUiThread { try{activity.startActivity(Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));call.resolve()}catch(e:Exception){call.reject("Could not open Android notification access")} }}
    @PluginMethod fun consumeOpen(call:PluginCall){if(!unlocked(call))return;activity.runOnUiThread {
        val id=activity.intent?.getStringExtra("horizon_whatsapp_preview");activity.intent?.removeExtra("horizon_whatsapp_preview")
        io.execute { val m=id?.let {HorizonWhatsAppStore.find(context,it)};call.resolve(JSObject().put("message",m)) }
    }}
    @PluginMethod fun clear(call:PluginCall){if(!unlocked(call))return;io.execute{try{HorizonWhatsAppStore.clear(context);call.resolve()}catch(e:Exception){call.reject(e.message)}}}
    @PluginMethod fun read(call:PluginCall){if(!unlocked(call))return;io.execute{
        try {val id=call.getString("id")?:"";val m=HorizonWhatsAppStore.find(context,id)
            if(call.getBoolean("forAI",false)==true&&!HorizonWhatsAppStore.prefs(context).getBoolean("aiSee",false)){call.reject("AI preview access is off");return@execute}
            call.resolve(JSObject().put("message",m))
        }catch(e:Exception){call.reject(e.message)}
    }}
    // Explicit user action only; never called by model tools, never pre-fills or sends.
    @PluginMethod fun openSource(call:PluginCall){if(!unlocked(call))return;io.execute{
        val m=HorizonWhatsAppStore.find(context,call.getString("id")?:"")
        if(m==null){call.reject("Preview expired or its source is off");return@execute}
        activity.runOnUiThread { try {val intent=context.packageManager.getLaunchIntentForPackage(m.getString("package"))?:throw IllegalStateException("Selected WhatsApp is not installed");activity.startActivity(intent);call.resolve()}catch(e:Exception){call.reject(e.message)} }
    }}
    @PluginMethod fun requestDraft(call:PluginCall){if(!unlocked(call))return;io.execute{
        try {
            val p=HorizonWhatsAppStore.prefs(context)
            require(p.getBoolean("aiSee",false)){"Enable AI access to pinned messages first"}
            val m=HorizonWhatsAppStore.find(context,call.getString("messageId")?:"")?:throw IllegalStateException("Preview expired or source disabled")
            val provider=call.getString("provider")?:"";require(provider=="gemini"||HorizonCheckins.endpoints.containsKey(provider)){"Provider is not supported in background"}
            val model=call.getString("model")?:"";require(model.isNotBlank()&&model.length<=200){"Choose a model"}
            if(provider in setOf("anyapi","routeway"))require(model.endsWith(":free")){"Only free models allowed for this provider"}
            val key=call.getString("key")?:"";require(key.length<=4096&&(provider=="pollinations"||key.isNotBlank())){"Add a valid API key"}
            val active=p.all.keys.count{it.startsWith("draft_request_")};require(active<3){"Three drafts are already queued. Wait or clear drafts first"}
            val id=UUID.randomUUID().toString();val generation=p.getString("draft_generation",null)?:UUID.randomUUID().toString()
            val config=JSONObject().put("provider",provider).put("model",model).put("key",key).put("message",m)
                .put("instruction",(call.getString("instruction")?:"Write a short natural reply draft.").take(2000))
                .put("chatId",(call.getString("chatId")?:"").take(200)).put("generation",generation).put("created",System.currentTimeMillis())
            p.edit().putString("draft_generation",generation).putString("draft_request_$id",HorizonCheckins.seal(config.toString())).commit()
            val work=OneTimeWorkRequestBuilder<HorizonWhatsAppDraftWorker>().setInputData(Data.Builder().putString("id",id).build())
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()).addTag("horizon-wa-draft")
                .setBackoffCriteria(androidx.work.BackoffPolicy.EXPONENTIAL,30,TimeUnit.SECONDS).build()
            WorkManager.getInstance(context).enqueueUniqueWork("horizon-wa-draft-$id",ExistingWorkPolicy.KEEP,work)
            call.resolve(JSObject().put("id",id))
        }catch(e:Exception){call.reject(e.message?:"Could not queue draft")}
    }}
    @PluginMethod fun drafts(call:PluginCall){if(!unlocked(call))return;io.execute{
        try {val p=HorizonWhatsAppStore.prefs(context);val a=JSArray();val e=p.edit();val now=System.currentTimeMillis()
            p.all.filterKeys{it.startsWith("draft_result_")}.forEach{(k,v)->try{val result=HorizonCheckins.open(v as String);if(now-result.optLong("time")<86400000L)a.put(result)else e.remove(k)}catch(_:Exception){e.remove(k)}}
            e.apply();call.resolve(JSObject().put("results",a).put("pending",p.all.keys.any{it.startsWith("draft_request_")}))
        }catch(e:Exception){call.reject(e.message)}
    }}
    @PluginMethod fun ackDraft(call:PluginCall){if(!unlocked(call))return;val id=call.getString("id")?:"";HorizonWhatsAppStore.prefs(context).edit().remove("draft_result_$id").apply();call.resolve()}
    // Fail closed for stale clients or injected / old tool names.
    @PluginMethod fun reply(call:PluginCall){call.reject("Viewer/editor only. Horizon cannot send WhatsApp messages.")}
    @PluginMethod fun sendToContact(call:PluginCall){call.reject("Viewer/editor only. Sending is disabled.")}
    @PluginMethod fun compose(call:PluginCall){call.reject("Viewer/editor only. Use Open WhatsApp explicitly.")}
}

class HorizonWhatsAppListener: NotificationListenerService() {
    private val io=java.util.concurrent.ThreadPoolExecutor(1,1,0L,TimeUnit.MILLISECONDS,java.util.concurrent.ArrayBlockingQueue<Runnable>(32),java.util.concurrent.ThreadPoolExecutor.DiscardOldestPolicy())
    companion object {
        @Volatile var connected=false
        @JvmField @Volatile var uiVisible=false
        fun refreshActive() { /* Captures only new notifications; never imports old history. */ }
    }
    override fun onListenerConnected(){connected=true;io.execute{HorizonWhatsAppStore.migrate(this)}}
    override fun onListenerDisconnected(){connected=false}
    override fun onDestroy(){connected=false;io.shutdown();super.onDestroy()}
    override fun onNotificationPosted(sbn:StatusBarNotification){
        if(!HorizonWhatsAppStore.enabled(this,sbn.packageName))return
        if(sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY!=0||sbn.notification.category==Notification.CATEGORY_CALL)return
        io.execute {
            var wake:PowerManager.WakeLock?=null
            try {
                wake=(getSystemService(Context.POWER_SERVICE) as PowerManager).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"Horizon:preview").apply{setReferenceCounted(false);acquire(10000)}
                val n=sbn.notification;val style=NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(n)
                val msg=style?.messages?.lastOrNull();val extras=n.extras?:return@execute
                val hasReply=n.actions?.any{a->a.remoteInputs?.any{it.allowFreeFormInput}==true}==true
                if(msg==null&&!hasReply)return@execute
                val title=extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?:"WhatsApp"
                val sender=msg?.person?.name?.toString()?:title
                val text=msg?.text?.toString()?:(extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?:extras.getCharSequence(Notification.EXTRA_TEXT))?.toString()?:""
                if(text.isBlank())return@execute
                val time=msg?.timestamp?:sbn.postTime
                val id=UUID.nameUUIDFromBytes("${sbn.key}|$sender|$time|$text".toByteArray()).toString()
                val row=JSONObject().put("id",id).put("package",sbn.packageName).put("sender",sender.take(200)).put("conversation",title.take(200))
                    .put("text",text.take(8000)).put("time",time).put("business",sbn.packageName=="com.whatsapp.w4b")
                if(!HorizonWhatsAppStore.add(this,row))return@execute
                val p=HorizonWhatsAppStore.prefs(this)
                if(!HorizonLockPlugin.locked&&p.getBoolean("toasts",false))HorizonAIPlugin.dispatchToJs("horizon-whatsapp",row.toString())
                if(!uiVisible&&p.getBoolean("alerts",false))showAlert(row)
            }catch(_:Exception){ /* no crash / no retry loop for revoked permission */ }
            finally{if(wake?.isHeld==true)wake.release()}
        }
    }
    private fun showAlert(row:JSONObject){
        if(!NotificationManagerCompat.from(this).areNotificationsEnabled())return
        val nm=getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if(Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(NotificationChannel("horizon_whatsapp_drafts_v2","Notification draft invitations",NotificationManager.IMPORTANCE_HIGH).apply{lockscreenVisibility=Notification.VISIBILITY_PRIVATE})
        val id=7400+(row.getString("id").hashCode() and 0x7fff)
        val pi=PendingIntent.getActivity(this,id,Intent(this,MainActivity::class.java).apply{flags=Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP;putExtra("horizon_whatsapp_preview",row.getString("id"))},PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val text=if(HorizonLockPlugin.locked)"Unlock Horizon to view" else if(HorizonWhatsAppStore.prefs(this).getBoolean("askDraft",false))"Need a reply draft? Tap to view, then pin the preview." else "Tap to view and pin this notification preview in Horizon."
        nm.notify(id,NotificationCompat.Builder(this,"horizon_whatsapp_drafts_v2").setSmallIcon(R.drawable.ic_horizon_whatsapp)
            .setContentTitle(if(HorizonLockPlugin.locked)"New notification preview" else row.optString("sender"))
            .setContentText(text).setContentIntent(pi).setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH).setOnlyAlertOnce(true).build())
    }
}
