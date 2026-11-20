package com.festers.horizon.edge

import android.os.Handler
import android.os.Looper
import androidx.media3.common.AudioAttributes
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.DataSource
import androidx.media3.exoplayer.DefaultLoadControl
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import androidx.media3.extractor.Extractor
import androidx.media3.extractor.ExtractorsFactory
import androidx.media3.extractor.mp3.Mp3Extractor
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * JS name: HorizonEdgeVoice
 *   speak({ id, text, chunks?, voice?, ratePct?, endpoint?, gecVersion? })  starts streaming, resolves at once
 *   stop() / pause() / resume() / state()
 *   event "edgeVoice": { id, event: "playing" | "ended" | "error", message, started }
 *
 * Path of the audio: Microsoft WebSocket -> OkHttp thread -> EdgeAudioPipe (RAM) -> ExoPlayer. No temp files, no shell commands.
 */
@androidx.annotation.OptIn(UnstableApi::class)
@CapacitorPlugin(name = "HorizonEdgeVoice")
class HorizonEdgeVoicePlugin : Plugin() {

    private class Session(val id: String) {
        val pipe = EdgeAudioPipe()
        val cancelled = AtomicBoolean(false)
        val done = AtomicBoolean(false)
        @Volatile var playing = false
        @Volatile var paused = false
        @Volatile var gotAudio = false
        @Volatile var failure: String? = null
        @Volatile var worker: Thread? = null
        var player: ExoPlayer? = null   // main thread only
    }

    private val main = Handler(Looper.getMainLooper())
    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS)
            .build()
    }
    private val client: EdgeTtsClient by lazy { EdgeTtsClient(http) }
    @Volatile private var session: Session? = null

    @PluginMethod
    fun speak(call: PluginCall) {
        val text = (call.getString("text") ?: "").trim()
        if (text.isEmpty()) {
            call.reject("Nothing to speak")
            return
        }
        val id = call.getString("id") ?: ("edge_" + System.nanoTime())
        val voice = call.getString("voice") ?: ""
        val rate = (call.getInt("ratePct") ?: 0).coerceIn(-50, 100)
        val endpoint = (call.getString("endpoint") ?: "").let {
            if (it.startsWith("wss://")) it else EdgeProtocol.DEFAULT_ENDPOINT
        }
        val version = (call.getString("gecVersion") ?: "").let {
            if (Regex("^\\d+(\\.\\d+){3}$").matches(it)) it else EdgeProtocol.DEFAULT_VERSION
        }
        val chunks = readChunks(call, text)

        endSession(session)
        val s = Session(id)
        session = s
        main.post { startPlayer(s) }
        s.worker = thread(start = true, isDaemon = true, name = "edge-tts-pump") {
            pump(s, chunks, voice, rate, endpoint, version)
        }
        call.resolve()
    }

    // V1.99.130: render the whole script to one MP3 and hand it back as base64 (no playback). Not compiled here.
    @PluginMethod
    fun renderMp3(call: PluginCall) {
        val text = (call.getString("text") ?: "").trim()
        if (text.isEmpty()) { call.reject("Nothing to render"); return }
        if (text.length > 30000) { call.reject("Script too long: 30000 characters at most"); return }
        val voice = call.getString("voice") ?: ""
        val rate = (call.getInt("ratePct") ?: 0).coerceIn(-50, 100)
        val endpoint = (call.getString("endpoint") ?: "").let {
            if (it.startsWith("wss://")) it else EdgeProtocol.DEFAULT_ENDPOINT
        }
        val version = (call.getString("gecVersion") ?: "").let {
            if (Regex("^\\d+(\\.\\d+){3}$").matches(it)) it else EdgeProtocol.DEFAULT_VERSION
        }
        val chunks = readChunks(call, text)
        thread(start = true, isDaemon = true, name = "edge-render") {
            try {
                val out = java.io.ByteArrayOutputStream()
                for (chunk in chunks) {
                    for (piece in EdgeProtocol.split(chunk, EdgeProtocol.MAX_PIECE_BYTES)) {
                        client.synthesize(piece, voice, rate, endpoint, version, { false }) { bytes -> out.write(bytes) }
                    }
                }
                if (out.size() == 0) throw EdgeTtsException("Edge voice returned no audio")
                val res = JSObject()
                res.put("base64", android.util.Base64.encodeToString(out.toByteArray(), android.util.Base64.NO_WRAP))
                res.put("bytes", out.size())
                call.resolve(res)
            } catch (e: Exception) {
                call.reject(e.message ?: "Edge render failed")
            }
        }
    }

    @PluginMethod
    fun status(call: PluginCall) {
        call.resolve(JSObject().put("version", "1.99.42").put("available", true).put("engine", "Edge WebSocket / Media3"))
    }

    @PluginMethod
    fun listVoices(call: PluginCall) {
        thread(start = true, isDaemon = true, name = "edge-voice-catalogue") {
            try {
                val client = http.newBuilder().callTimeout(10, TimeUnit.SECONDS).build()
                val major = EdgeProtocol.DEFAULT_VERSION.substringBefore('.')
                var skew = 0L
                var result: org.json.JSONArray? = null
                for (attempt in 0..1) {
                    val request = okhttp3.Request.Builder().url(
                        "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=" + EdgeProtocol.TRUSTED_CLIENT_TOKEN +
                            "&Sec-MS-GEC=" + EdgeProtocol.secMsGec(skew) +
                            "&Sec-MS-GEC-Version=" + EdgeProtocol.gecVersionParam(EdgeProtocol.DEFAULT_VERSION)
                    )
                        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/" + major + ".0.0.0 Safari/537.36 Edg/" + major + ".0.0.0")
                        .header("Accept", "application/json")
                        .header("Accept-Language", "en-US,en;q=0.9")
                        .header("Cookie", "muid=" + EdgeProtocol.randomHex(16, true) + ";").build()
                    client.newCall(request).execute().use { response ->
                        if (response.code == 403 && attempt == 0) {
                            val date = response.headers.getDate("Date")?.time
                            if (date != null) skew = date / 1000L - System.currentTimeMillis() / 1000L
                        } else {
                            if (!response.isSuccessful) throw Exception("Voice catalogue HTTP " + response.code)
                            result = org.json.JSONArray(response.body?.string() ?: "[]")
                        }
                    }
                    if (result != null) break
                }
                call.resolve(JSObject().put("voices", result ?: throw Exception("Voice catalogue returned no data")))
            } catch (e: Exception) { call.reject(e.message ?: "Voice catalogue unavailable") }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        endSession(session)
        session = null
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        val s = session
        if (s != null) {
            s.paused = true
            main.post { s.player?.pause() }
        }
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        val s = session
        if (s != null) {
            s.paused = false
            main.post { s.player?.play() }
        }
        call.resolve()
    }

    @PluginMethod
    fun state(call: PluginCall) {
        val s = session
        val out = JSObject()
        out.put("active", s != null && !s.done.get())
        out.put("playing", s?.playing ?: false)
        out.put("paused", s?.paused ?: false)
        call.resolve(out)
    }

    override fun handleOnDestroy() {
        endSession(session)
        session = null
        super.handleOnDestroy()
    }

    private fun readChunks(call: PluginCall, text: String): List<String> {
        val list = ArrayList<String>()
        try {
            val arr = call.getArray("chunks")
            if (arr != null) {
                for (i in 0 until arr.length()) {
                    val piece = arr.optString(i, "").trim()
                    if (piece.isNotEmpty()) list.add(piece)
                }
            }
        } catch (e: Exception) {
            list.clear()
        }
        if (list.isEmpty()) list.add(text)
        return list
    }

    private fun emit(id: String, event: String, message: String, started: Boolean) {
        val o = JSObject()
        o.put("id", id)
        o.put("event", event)
        o.put("message", message)
        o.put("started", started)
        notifyListeners("edgeVoice", o)
    }

    // ---- network side (worker thread) ----

    private fun pump(s: Session, chunks: List<String>, voice: String, ratePct: Int, endpoint: String, version: String) {
        try {
            for (chunk in chunks) {
                for (piece in EdgeProtocol.split(chunk, EdgeProtocol.MAX_PIECE_BYTES)) {
                    while (!s.cancelled.get() && s.pipe.pending() > MAX_PENDING_BYTES) Thread.sleep(100L)
                    if (s.cancelled.get()) return
                    client.synthesize(piece, voice, ratePct, endpoint, version, { s.cancelled.get() }) { bytes ->
                        s.gotAudio = true
                        s.pipe.put(bytes)
                    }
                }
            }
            if (!s.gotAudio) throw EdgeTtsException("Edge voice returned no audio")
            s.pipe.finish()
        } catch (e: EdgeCancelled) {
            // stopped on purpose
        } catch (e: Exception) {
            if (s.cancelled.get()) return
            s.failure = e.message ?: "Edge voice failed"
            if (s.playing) s.pipe.finish() else finish(s)   // mid-reply failure: let the buffered audio play out, then report
        }
    }

    // ---- playback side (main thread) ----

    private fun startPlayer(s: Session) {
        if (s.cancelled.get()) return
        val load = DefaultLoadControl.Builder()
            .setBufferDurationsMs(1500, 30000, 200, 500)   // start after 200 ms of audio, rebuffer after 500 ms
            .build()
        val attrs = AudioAttributes.Builder()
            .setUsage(C.USAGE_MEDIA)
            .setContentType(C.AUDIO_CONTENT_TYPE_SPEECH)
            .build()
        val p = ExoPlayer.Builder(context)
            .setLoadControl(load)
            .setAudioAttributes(attrs, true)
            .setHandleAudioBecomingNoisy(true)
            .build()
        p.addListener(object : Player.Listener {
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                if (isPlaying && !s.playing) {
                    s.playing = true
                    if (!s.cancelled.get()) emit(s.id, "playing", "", true)
                }
            }

            override fun onPlaybackStateChanged(playbackState: Int) {
                if (playbackState == Player.STATE_ENDED) finish(s)
            }

            override fun onPlayerError(error: PlaybackException) {
                if (s.failure == null) s.failure = error.message ?: "Playback error"
                finish(s)
            }
        })
        val dataSources = DataSource.Factory { EdgePipeDataSource(s.pipe) }
        val extractors = ExtractorsFactory { arrayOf<Extractor>(Mp3Extractor()) }
        val source = ProgressiveMediaSource.Factory(dataSources, extractors)
            .setContinueLoadingCheckIntervalBytes(4096) // unblock preparation promptly on an open-ended speech stream
            .createMediaSource(MediaItem.fromUri("edge://voice/" + s.id))
        s.player = p
        p.setMediaSource(source)
        p.prepare()
        p.playWhenReady = !s.paused
    }

    // ---- shared ----

    /** Emits exactly one terminal event (ended or error), then frees the player. */
    private fun finish(s: Session) {
        if (!s.done.compareAndSet(false, true)) return
        if (!s.cancelled.get()) {
            val f = s.failure
            emit(s.id, if (f != null) "error" else "ended", f ?: "", s.playing)
        }
        s.cancelled.set(true)
        s.pipe.close()
        release(s)
    }

    private fun endSession(s: Session?) {
        if (s == null) return
        s.cancelled.set(true)
        s.done.set(true)
        s.pipe.close()
        s.worker?.interrupt()
        release(s)
    }

    private fun release(s: Session) {
        main.post {
            val p = s.player
            s.player = null
            if (p != null) {
                try {
                    p.stop()
                } catch (e: Exception) {
                }
                p.release()
            }
        }
    }

    private companion object {
        const val MAX_PENDING_BYTES = 1_500_000L
    }
}
