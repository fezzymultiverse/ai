package com.festers.horizon.edge

import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit

class EdgeCancelled : RuntimeException("stopped")

class EdgeTtsException(message: String, val retryWithSkew: Boolean = false) : Exception(message)

/**
 * One WebSocket per text piece, straight to Microsoft. Audio frames are handed to onAudio on the CALLER's thread
 * (so the caller can apply back-pressure). Nothing is written to disk.
 */
class EdgeTtsClient(private val http: OkHttpClient) {

    @Volatile private var skewSec = 0L

    private sealed class Ev {
        class Audio(val bytes: ByteArray) : Ev()
        object TurnEnd : Ev()
        object Closed : Ev()
        class Fail(val message: String, val code: Int, val serverDateMs: Long) : Ev()
    }

    fun synthesize(
        text: String,
        voice: String,
        ratePct: Int,
        endpoint: String,
        version: String,
        cancelled: () -> Boolean,
        onAudio: (ByteArray) -> Unit
    ) {
        var retried = false
        while (true) {
            try {
                runOnce(text, voice, ratePct, endpoint, version, cancelled, onAudio)
                return
            } catch (e: EdgeTtsException) {
                if (e.retryWithSkew && !retried && !cancelled()) {
                    retried = true
                    continue
                }
                throw e
            }
        }
    }

    private fun runOnce(
        text: String,
        voice: String,
        ratePct: Int,
        endpoint: String,
        version: String,
        cancelled: () -> Boolean,
        onAudio: (ByteArray) -> Unit
    ) {
        val events = LinkedBlockingQueue<Ev>()
        val major = version.substringBefore('.')
        val url = endpoint +
            "?TrustedClientToken=" + EdgeProtocol.TRUSTED_CLIENT_TOKEN +
            "&ConnectionId=" + EdgeProtocol.randomHex(16, false) +
            "&Sec-MS-GEC=" + EdgeProtocol.secMsGec(skewSec) +
            "&Sec-MS-GEC-Version=" + EdgeProtocol.gecVersionParam(version)
        val request = Request.Builder()
            .url(url)
            .header("Pragma", "no-cache")
            .header("Cache-Control", "no-cache")
            .header("Origin", EdgeProtocol.ORIGIN)
            .header("Accept-Language", "en-US,en;q=0.9")
            .header(
                "User-Agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) " +
                    "Chrome/" + major + ".0.0.0 Safari/537.36 Edg/" + major + ".0.0.0"
            )
            .header("Cookie", "muid=" + EdgeProtocol.randomHex(16, true) + ";")
            .build()

        val requestId = EdgeProtocol.randomHex(16, false)
        val listener = object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                webSocket.send(EdgeProtocol.configMessage())
                webSocket.send(EdgeProtocol.ssmlMessage(requestId, voice, ratePct, text))
            }

            override fun onMessage(webSocket: WebSocket, text: String) {
                if (text.contains("Path:turn.end")) events.offer(Ev.TurnEnd)
            }

            override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
                val audio = EdgeProtocol.audioPayload(bytes.toByteArray())
                if (audio != null) events.offer(Ev.Audio(audio))
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
                events.offer(Ev.Closed)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                events.offer(Ev.Closed)
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                val date = response?.headers?.getDate("Date")?.time ?: 0L
                events.offer(Ev.Fail(t.message ?: "network error", response?.code ?: 0, date))
            }
        }

        val ws = http.newWebSocket(request, listener)
        var gotAudio = false
        var lastAt = System.nanoTime()
        try {
            while (true) {
                if (cancelled()) throw EdgeCancelled()
                val ev = events.poll(200, TimeUnit.MILLISECONDS)
                if (ev == null) {
                    if (System.nanoTime() - lastAt > IDLE_NS) throw EdgeTtsException("Edge voice timed out")
                    continue
                }
                lastAt = System.nanoTime()
                when (ev) {
                    is Ev.Audio -> {
                        gotAudio = true
                        onAudio(ev.bytes)
                    }
                    is Ev.TurnEnd -> {
                        if (!gotAudio) throw EdgeTtsException("Edge voice returned no audio")
                        return
                    }
                    is Ev.Closed -> throw EdgeTtsException(
                        if (gotAudio) "Edge voice connection closed early" else "Edge voice closed without audio"
                    )
                    is Ev.Fail -> {
                        if (!gotAudio && ev.code == 403 && ev.serverDateMs > 0L) {
                            // The token is time-based. A skewed phone clock gets a 403: adopt the server's clock and retry once.
                            skewSec = ev.serverDateMs / 1000L - System.currentTimeMillis() / 1000L
                            throw EdgeTtsException("Edge voice rejected the phone clock", true)
                        }
                        throw EdgeTtsException(
                            if (ev.code != 0) "Edge voice refused the connection (HTTP " + ev.code + ")" else ev.message
                        )
                    }
                }
            }
        } finally {
            ws.cancel()
        }
    }

    private companion object {
        const val IDLE_NS = 15_000_000_000L
    }
}
