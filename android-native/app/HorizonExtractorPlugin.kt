package __APPID__

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import okhttp3.RequestBody.Companion.toRequestBody
import org.schabi.newpipe.extractor.NewPipe
import org.schabi.newpipe.extractor.ServiceList
import org.schabi.newpipe.extractor.downloader.Downloader
import org.schabi.newpipe.extractor.downloader.Request
import org.schabi.newpipe.extractor.downloader.Response
import org.schabi.newpipe.extractor.stream.StreamInfo
import org.schabi.newpipe.extractor.stream.Stream
import org.schabi.newpipe.extractor.stream.StreamInfoItem
import org.schabi.newpipe.extractor.stream.DeliveryMethod
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** NewPipe extraction in native Kotlin, not a dependency on dead public proxy servers. */
@CapacitorPlugin(name = "HorizonExtractor")
class HorizonExtractorPlugin : Plugin() {
    companion object {
        private val worker = java.util.concurrent.ThreadPoolExecutor(2, 2, 0, TimeUnit.SECONDS,
            java.util.concurrent.ArrayBlockingQueue<Runnable>(8), java.util.concurrent.ThreadPoolExecutor.AbortPolicy())
        private val http = OkHttpClient.Builder().connectTimeout(15, TimeUnit.SECONDS).readTimeout(25, TimeUnit.SECONDS)
            .callTimeout(45, TimeUnit.SECONDS).build()
        const val UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36"
        @Volatile private var ready = false
        @Synchronized private fun initExtractor() {
            if (ready) return
            NewPipe.init(object : Downloader() {
                override fun execute(request: Request): Response {
                    val builder = okhttp3.Request.Builder().url(request.url()).header("User-Agent", UA)
                    request.headers().forEach { (key, values) -> values.forEach { builder.addHeader(key, it) } }
                    val method = request.httpMethod()
                    val body = request.dataToSend()?.toRequestBody() ?: if (method == "POST" || method == "PUT" || method == "PATCH") ByteArray(0).toRequestBody() else null
                    builder.method(method, body)
                    http.newCall(builder.build()).execute().use { r ->
                        return Response(r.code, r.message, r.headers.toMultimap(), r.body?.string() ?: "", r.request.url.toString())
                    }
                }
            })
            ready = true
        }
    }
    private fun job(call: PluginCall, fn: () -> JSObject) {
        try { worker.execute { try { initExtractor(); call.resolve(fn()) } catch (e: Exception) {
            call.reject("NewPipe extraction failed: ${e.message ?: e.javaClass.simpleName}. YouTube may require an extractor update or login; try the Termux yt-dlp fallback.")
        } } } catch (_: java.util.concurrent.RejectedExecutionException) { call.reject("Extractor busy; retry after current requests finish") }
    }
    @PluginMethod fun search(call: PluginCall) {
        val query = call.getString("query")?.trim() ?: ""
        if (query.isBlank() || query.length > 300) { call.reject("Search needs 1–300 characters"); return }
        job(call) {
            val extractor = ServiceList.YouTube.getSearchExtractor(query)
            extractor.fetchPage()
            val items = JSArray()
            extractor.initialPage.items.filterIsInstance<StreamInfoItem>().take(10).forEach { item ->
                val id = android.net.Uri.parse(item.url).getQueryParameter("v") ?: item.url.substringAfterLast('/')
                if (Regex("[\\w-]{11}").matches(id)) items.put(JSObject().put("id", id).put("title", item.name).put("artist", item.uploaderName).put("dur", item.duration))
            }
            JSObject().put("items", items).put("via", "NewPipe native")
        }
    }
    @PluginMethod fun stream(call: PluginCall) {
        val id = call.getString("id") ?: ""; val video = call.getString("kind") == "video"
        if (!Regex("[\\w-]{11}").matches(id)) { call.reject("Invalid YouTube video ID"); return }
        job(call) {
            val info = StreamInfo.getInfo(ServiceList.YouTube, "https://www.youtube.com/watch?v=$id")
            val stream: Stream = if (video) {
                info.videoStreams.filter { it.isUrl && !it.isVideoOnly && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
                    .maxByOrNull { it.height } ?: throw IllegalStateException("No combined video/audio stream; use Termux yt-dlp + FFmpeg for adaptive video")
            } else {
                info.audioStreams.filter { it.isUrl && it.deliveryMethod == DeliveryMethod.PROGRESSIVE_HTTP }
                    .sortedWith(compareByDescending<org.schabi.newpipe.extractor.stream.AudioStream> { it.format?.suffix == "m4a" }.thenByDescending { it.averageBitrate })
                    .firstOrNull() ?: throw IllegalStateException("No downloadable audio stream")
            }
            JSObject().put("url", stream.content).put("ext", stream.format?.suffix ?: if (video) "mp4" else "m4a")
                .put("title", info.name).put("artist", info.uploaderName).put("dur", info.duration)
                .put("ua", UA).put("client", "newpipe").put("via", "NewPipe native")
        }
    }
}
