package com.festers.horizon.edge

import java.security.SecureRandom
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Microsoft Edge "Read Aloud" wire protocol. Pure functions, no Android, no files.
 * Endpoint, token and message layout follow the Edge read-aloud service (the keyless service behind the browser Read Aloud feature).
 * NOTE: wss://api.msedgeservices.com/tts/cognitiveservices/websocket/v1 is NOT this service. The keyless Edge
 * endpoint is speech.platform.bing.com, and it demands the rotating Sec-MS-GEC token built below.
 */
object EdgeProtocol {
    const val TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4"
    const val DEFAULT_VERSION = "143.0.3650.75"
    const val DEFAULT_ENDPOINT = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1"
    const val ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold"
    const val OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3"
    const val MAX_PIECE_BYTES = 3500

    private const val WIN_EPOCH = 11_644_473_600L
    private val rng = SecureRandom()
    private val voiceRe = Regex("^([a-z]{2,})-([A-Z]{2,})-(.+Neural)$")

    /**
     * Sec-MS-GEC v2: Windows file-time ticks rounded down to 5 minutes, glued to the trusted token, run through
     * EdgeGec (CS64 + salted SHA-256). Format "<16 hex>-<64 hex>". The v1 token (plain SHA-256) is rejected since Oct 2026.
     */
    fun secMsGec(skewSec: Long, nowMs: Long = System.currentTimeMillis()): String {
        var ticks = nowMs / 1000L + skewSec + WIN_EPOCH
        ticks -= ticks % 300L
        val src = (ticks * 10_000_000L).toString() + TRUSTED_CLIENT_TOKEN
        return EdgeGec.token(src.toByteArray(Charsets.US_ASCII))
    }

    /** Sec-MS-GEC-Version value: the "2-" prefix is what selects the v2 token, the number after it is only cosmetic. */
    fun gecVersionParam(version: String): String = "2-" + version

    fun randomHex(bytes: Int, upper: Boolean): String {
        val raw = ByteArray(bytes)
        rng.nextBytes(raw)
        val sb = StringBuilder(bytes * 2)
        for (b in raw) sb.append(String.format(Locale.US, if (upper) "%02X" else "%02x", b.toInt() and 0xFF))
        return sb.toString()
    }

    fun stamp(): String {
        val f = SimpleDateFormat("EEE MMM dd yyyy HH:mm:ss", Locale.US)
        f.timeZone = TimeZone.getTimeZone("UTC")
        return f.format(Date()) + " GMT+0000 (Coordinated Universal Time)"
    }

    /** en-US-AriaNeural -> Microsoft Server Speech Text to Speech Voice (en-US, AriaNeural) */
    fun fullVoiceName(short: String): String {
        val v = short.trim().ifEmpty { "en-US-AriaNeural" }
        if (v.startsWith("Microsoft Server Speech")) return v
        val m = voiceRe.matchEntire(v) ?: return v
        val lang = m.groupValues[1]
        var region = m.groupValues[2]
        var name = m.groupValues[3]
        val dash = name.indexOf('-')
        if (dash >= 0) {
            region = region + "-" + name.substring(0, dash)
            name = name.substring(dash + 1)
        }
        return "Microsoft Server Speech Text to Speech Voice ($lang-$region, $name)"
    }

    /** XML-escape and drop control characters the service rejects. */
    fun escapeXml(s: String): String {
        val sb = StringBuilder(s.length + 16)
        for (ch in s) {
            val c = ch.code
            when {
                (c in 0..8) || c == 11 || c == 12 || (c in 14..31) -> sb.append(' ')
                ch == '&' -> sb.append("&amp;")
                ch == '<' -> sb.append("&lt;")
                ch == '>' -> sb.append("&gt;")
                ch == '"' -> sb.append("&quot;")
                ch == '\'' -> sb.append("&apos;")
                else -> sb.append(ch)
            }
        }
        return sb.toString()
    }

    fun rateString(pct: Int): String = (if (pct >= 0) "+" else "") + pct + "%"

    fun configMessage(): String =
        "X-Timestamp:" + stamp() + "\r\n" +
            "Content-Type:application/json; charset=utf-8\r\n" +
            "Path:speech.config\r\n\r\n" +
            "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"true\"," +
            "\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"" + OUTPUT_FORMAT + "\"}}}}\r\n"

    fun ssmlMessage(requestId: String, voice: String, ratePct: Int, text: String): String {
        val ssml = "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>" +
            "<voice name='" + fullVoiceName(voice) + "'>" +
            "<prosody pitch='+0Hz' rate='" + rateString(ratePct) + "' volume='+0%'>" +
            escapeXml(text) +
            "</prosody></voice></speak>"
        return "X-RequestId:" + requestId + "\r\n" +
            "Content-Type:application/ssml+xml\r\n" +
            "X-Timestamp:" + stamp() + "Z\r\n" +
            "Path:ssml\r\n\r\n" + ssml
    }

    /** Binary frame = 2-byte big-endian header length, header text, payload. Returns the mp3 bytes of an audio frame, else null. */
    fun audioPayload(frame: ByteArray): ByteArray? {
        if (frame.size < 2) return null
        val headerLen = ((frame[0].toInt() and 0xFF) shl 8) or (frame[1].toInt() and 0xFF)
        val start = 2 + headerLen
        if (start > frame.size) return null
        val headers = String(frame, 2, headerLen, Charsets.UTF_8)
        if (!headers.contains("Path:audio")) return null
        if (start >= frame.size) return null
        return frame.copyOfRange(start, frame.size)
    }

    private fun escapedBytes(cp: Int): Int = when (cp) {
        '&'.code -> 5
        '<'.code, '>'.code -> 4
        '"'.code, '\''.code -> 6
        else -> when {
            cp < 0x80 -> 1
            cp < 0x800 -> 2
            cp < 0x10000 -> 3
            else -> 4
        }
    }

    /** Splits so each piece stays under the service's per-message size limit (measured after escaping, in UTF-8 bytes). */
    fun split(text: String, maxBytes: Int = MAX_PIECE_BYTES): List<String> {
        val out = ArrayList<String>()
        var rest = text.trim()
        while (rest.isNotEmpty()) {
            var bytes = 0
            var i = 0
            while (i < rest.length) {
                val cp = rest.codePointAt(i)
                val b = escapedBytes(cp)
                if (bytes + b > maxBytes) break
                bytes += b
                i += Character.charCount(cp)
            }
            if (i >= rest.length) {
                out.add(rest)
                break
            }
            var cut = i
            val window = rest.substring(0, cut)
            var br = maxOf(window.lastIndexOf(". "), window.lastIndexOf("? "), window.lastIndexOf("! "), window.lastIndexOf('\n'))
            if (br < cut / 2) br = window.lastIndexOf(' ')
            if (br > cut / 3) cut = br + 1
            if (cut <= 0) cut = Character.charCount(rest.codePointAt(0))
            val piece = rest.substring(0, cut).trim()
            if (piece.isNotEmpty()) out.add(piece)
            rest = rest.substring(cut).trim()
        }
        return out
    }
}
