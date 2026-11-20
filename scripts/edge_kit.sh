#!/usr/bin/env bash
# Horizon Edge Voice KIT V1.99.120 - ONE self-contained file. Pure Bash, no root, no network.
# It carries every file the native Edge voice needs, so a zip that lost them can never stop a build again.
#
#   bash edge_kit.sh [repo-dir]            restore every missing Edge file (never overwrites yours)
#   bash edge_kit.sh [repo-dir] --force    also replace files that differ (old copy kept as .bak-TIMESTAMP)
#   bash edge_kit.sh --check <android-dir> verify the Edge plugin is really inside the android/ project (exit 1 + reason if not)
#   bash edge_kit.sh --install <android-dir> [repo-dir]   restore, then run install_edge.sh --apply on android/
#   bash edge_kit.sh --list                list the files carried in this kit
set -u
KIT_VERSION="V1.99.120"
KIT_SELF="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
STAMP="$(date +%Y%m%d-%H%M%S)"
TMP_ROOT="${TMPDIR:-/tmp}"

KIT_FILES=(  "android-native/com/festers/horizon/edge/EdgeAudioPipe.kt"
  "android-native/com/festers/horizon/edge/EdgeGec.kt"
  "android-native/com/festers/horizon/edge/EdgeProtocol.kt"
  "android-native/com/festers/horizon/edge/EdgeTtsClient.kt"
  "android-native/com/festers/horizon/edge/HorizonEdgeVoicePlugin.kt"
  "android-native/README.md"
  "android-native/NOTICE-gec.md"
  "scripts/install_edge.sh"
  "scripts/install_edge.py"
  "scripts/ci/gitlab-edge-snippet.yml"
  "scripts/ci/github-edge-snippet.yml"
  "www/horizon_edge_tts.js"
  "EDGE_VOICE_SETUP.md"
)

emit_0() {
  cat <<'KIT_EOF_0'
package com.festers.horizon.edge

import android.net.Uri
import androidx.media3.common.C
import androidx.media3.common.util.UnstableApi
import androidx.media3.datasource.BaseDataSource
import androidx.media3.datasource.DataSpec
import java.io.IOException
import java.io.InterruptedIOException
import java.util.concurrent.LinkedBlockingQueue
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicLong

/** In-memory byte hand-off from the WebSocket thread to ExoPlayer. No files, no sockets, no loopback server. */
class EdgeAudioPipe {
    private val q = LinkedBlockingQueue<ByteArray>()
    private val queued = AtomicLong(0L)
    @Volatile private var drained = false
    @Volatile var closed = false
        private set

    fun put(b: ByteArray) {
        if (closed || b.isEmpty()) return
        queued.addAndGet(b.size.toLong())
        q.offer(b)
    }

    /** No more audio is coming; the reader finishes what is queued, then sees end-of-input. */
    fun finish() {
        q.offer(END)
    }

    /** Drop everything and wake the reader. */
    fun close() {
        closed = true
        q.clear()
        queued.set(0L)
        q.offer(END)
    }

    fun pending(): Long = queued.get()

    fun isEnd(b: ByteArray): Boolean = b === END

    /** Next chunk, END at end of stream, or null after timeoutMs with nothing new. */
    fun take(timeoutMs: Long): ByteArray? {
        if (drained) return END
        val b = q.poll(timeoutMs, TimeUnit.MILLISECONDS) ?: return null
        if (b === END) {
            drained = true
            return END
        }
        queued.addAndGet(-b.size.toLong())
        return b
    }

    private companion object {
        val END = ByteArray(0)
    }
}

@androidx.annotation.OptIn(UnstableApi::class)
class EdgePipeDataSource(private val pipe: EdgeAudioPipe) : BaseDataSource(false) {
    private var cur: ByteArray? = null
    private var off = 0
    private var uri: Uri? = null
    private var opened = false

    @Throws(IOException::class)
    override fun open(dataSpec: DataSpec): Long {
        uri = dataSpec.uri
        transferInitializing(dataSpec)
        opened = true
        transferStarted(dataSpec)
        return C.LENGTH_UNSET.toLong()
    }

    @Throws(IOException::class)
    override fun read(buffer: ByteArray, offset: Int, length: Int): Int {
        if (length == 0) return 0
        while (true) {
            val c = cur
            if (c != null && off < c.size) {
                val n = minOf(length, c.size - off)
                System.arraycopy(c, off, buffer, offset, n)
                off += n
                bytesTransferred(n)
                return n
            }
            if (pipe.closed) return C.RESULT_END_OF_INPUT
            var next: ByteArray? = null
            try {
                next = pipe.take(250L)
            } catch (e: InterruptedException) {
                Thread.currentThread().interrupt()
                throw InterruptedIOException()
            }
            if (next == null) continue
            if (pipe.isEnd(next)) return C.RESULT_END_OF_INPUT
            cur = next
            off = 0
        }
    }

    override fun getUri(): Uri? = uri

    override fun close() {
        cur = null
        if (opened) {
            opened = false
            transferEnded()
        }
    }
}
KIT_EOF_0
}

emit_1() {
  cat <<'KIT_EOF_1'
package com.festers.horizon.edge

/**
 * Sec-MS-GEC v2 token for the Edge read-aloud service.
 *
 * Microsoft stopped accepting the old SHA-256 token (v1) around 13 Oct 2026: every voice then fails with HTTP 403.
 * The service now wants "<16 hex CS64>-<64 hex salted SHA-256>" together with Sec-MS-GEC-Version=2-<edge version>.
 *
 * This is a Kotlin port of generate_sec_ms_gec_v2 from the edge_tts Python package 7.3.1 (drm.py) by rany2,
 * licensed LGPL-3.0. Source and licence note: android-native/NOTICE-gec.md.
 * All arithmetic is unsigned 32-bit with wrap-around, which Kotlin Int gives for free.
 */
internal object EdgeGec {
    private val SHA256_INITIAL: IntArray = longArrayOf(
        0x6A09E667L, 0xBB67AE85L, 0x3C6EF372L, 0xA54FF53AL,
        0x510E527FL, 0x9B05688CL, 0x1F83D9ABL, 0x5BE0CD19L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val SHA256_STATE: IntArray = longArrayOf(
        0xFD9FBEA2L, 0x91243CE7L, 0xBE499094L, 0xCD2E1E0AL,
        0x6C006F49L, 0x04BD35ABL, 0xFEB0A7E4L, 0x03EFFBD2L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val SHA256_SCHEDULE: IntArray = longArrayOf(
        0xEB24BF9EL, 0x1558691FL, 0xA0C09EE2L, 0x0CFA32BAL,
        0xA622EE8CL, 0xD1DD9491L, 0xC0DD25A0L, 0xF9E70AB6L,
        0xF0C31573L, 0x7058CE4EL, 0x7188E606L, 0x00E5AB33L,
        0xD258B060L, 0x72766564L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val K: IntArray = longArrayOf(
        0x428A2F98L, 0x71374491L, 0xB5C0FBCFL, 0xE9B5DBA5L,
        0x3956C25BL, 0x59F111F1L, 0x923F82A4L, 0xAB1C5ED5L,
        0xD807AA98L, 0x12835B01L, 0x243185BEL, 0x550C7DC3L,
        0x72BE5D74L, 0x80DEB1FEL, 0x9BDC06A7L, 0xC19BF174L,
        0xE49B69C1L, 0xEFBE4786L, 0x0FC19DC6L, 0x240CA1CCL,
        0x2DE92C6FL, 0x4A7484AAL, 0x5CB0A9DCL, 0x76F988DAL,
        0x983E5152L, 0xA831C66DL, 0xB00327C8L, 0xBF597FC7L,
        0xC6E00BF3L, 0xD5A79147L, 0x06CA6351L, 0x14292967L,
        0x27B70A85L, 0x2E1B2138L, 0x4D2C6DFCL, 0x53380D13L,
        0x650A7354L, 0x766A0ABBL, 0x81C2C92EL, 0x92722C85L,
        0xA2BFE8A1L, 0xA81A664BL, 0xC24B8B70L, 0xC76C51A3L,
        0xD192E819L, 0xD6990624L, 0xF40E3585L, 0x106AA070L,
        0x19A4C116L, 0x1E376C08L, 0x2748774CL, 0x34B0BCB5L,
        0x391C0CB3L, 0x4ED8AA4AL, 0x5B9CCA4FL, 0x682E6FF3L,
        0x748F82EEL, 0x78A5636FL, 0x84C87814L, 0x8CC70208L,
        0x90BEFFFAL, 0xA4506CEBL, 0xBEF9A3F7L, 0xC67178F2L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val K_BLOCK: IntArray = longArrayOf(
        0x428A2F98L, 0x71374491L, 0xB5C0FBCFL, 0xE9B5DBA5L,
        0x3956C25BL, 0x59F111F1L, 0x923F82A4L, 0xAB1C5ED5L,
        0xD807AA98L, 0x12835B01L, 0x243185BEL, 0x550C7DC3L,
        0x72BE5D74L, 0x80DEB1FEL, 0xC9DC06A7L, 0xC19BF174L,
        0xE49B69C1L, 0xEFBE4786L, 0x0FC19DC6L, 0x240CA1CCL,
        0x2DE92C6FL, 0x4A7484AAL, 0x5CB0A9DCL, 0x76F988DAL,
        0x983E5152L, 0xA831C66DL, 0xB00327C8L, 0xBF597FC7L,
        0xC6E00BF3L, 0xD5A79147L, 0x06CA6351L, 0x14292967L,
        0x27B70A85L, 0x2E1B2138L, 0x4D2C6DFCL, 0x53380D13L,
        0x650A7354L, 0x766A0ABBL, 0x81C2C92EL, 0x92722C85L,
        0xA2BFE8A1L, 0xA81A664BL, 0xC24B8B70L, 0xC76C51A3L,
        0xD192E819L, 0xD6990624L, 0xF40E3585L, 0x106AA070L,
        0x19A4C116L, 0x1E376C08L, 0x2748774CL, 0x34B0BCB5L,
        0x391C0CB3L, 0x4ED8AA4AL, 0x5B9CCA4FL, 0x682E6FF3L,
        0x748F82EEL, 0x78A5636FL, 0x84C87814L, 0x8CC70208L,
        0x90BEFFFAL, 0xA4506CEBL, 0xBEF9A3F7L, 0xC67178F2L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val CS64_COEF: IntArray = longArrayOf(
        0xE82E91B1L, 0x44DE24C6L, 0x3BEB65BCL, 0xC89C5933L,
        0x8D1EC211L, 0x314EF5D5L, 0xE92491B1L, 0xF0A5B9D5L,
        0x06064CF3L, 0xDA79FA60L, 0xBED20560L, 0x89F9C9F8L,
        0x35FA38C6L, 0xCB49E3C6L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private val CS64_OFF: IntArray = longArrayOf(
        0xB32700D0L, 0x88DFF51DL, 0x29514038L, 0xB328CBDFL,
        0xD405B4D5L, 0x26E55F3CL, 0x607801C6L, 0x82B2C1FBL,
        0xFA51A3DAL, 0x207CC464L, 0x3C3C74F3L, 0xD2D14B61L,
        0xBB04A2C1L, 0xC5626167L
    ).let { a -> IntArray(a.size) { a[it].toInt() } }

    private const val SHA256_ADJUSTMENT = 0xC9DC06A7L
    private const val SIGMA0_ADJUSTMENT = 0x059C0B80L
    private const val SIGMA1_ADJUSTMENT = 0x000B92C0L
    private const val CS64_FACTOR = 0x82893933L
    private const val CS64_ADJUSTMENT0 = 0xF2F90B1AL
    private const val CS64_ADJUSTMENT1 = 0x0B1A0000L

    private fun rol16(v: Int): Int = (v shl 16) or (v ushr 16)
    private fun sigma0(x: Int): Int = (x ushr 7) xor (x shl 25) xor (x ushr 18) xor (x shl 14) xor (x ushr 3)
    private fun sigma1(x: Int): Int = (x ushr 17) xor (x shl 15) xor (x ushr 19) xor (x shl 13) xor (x ushr 10)

    private fun be32(b: ByteArray, o: Int): Int =
        ((b[o].toInt() and 0xFF) shl 24) or ((b[o + 1].toInt() and 0xFF) shl 16) or ((b[o + 2].toInt() and 0xFF) shl 8) or (b[o + 3].toInt() and 0xFF)

    private fun le32(b: ByteArray, o: Int): Int =
        (b[o].toInt() and 0xFF) or ((b[o + 1].toInt() and 0xFF) shl 8) or ((b[o + 2].toInt() and 0xFF) shl 16) or ((b[o + 3].toInt() and 0xFF) shl 24)

    private fun expandSchedule(w: IntArray, from: Int) {
        for (i in from until 64) w[i] = sigma1(w[i - 2]) + w[i - 7] + sigma0(w[i - 15]) + w[i - 16]
    }

    private fun rounds(state: IntArray, w: IntArray, first: Int, k: IntArray): IntArray {
        var a = state[0]; var b = state[1]; var c = state[2]; var d = state[3]
        var e = state[4]; var f = state[5]; var g = state[6]; var h = state[7]
        for (i in first until 64) {
            val s1 = Integer.rotateRight(e, 6) xor Integer.rotateRight(e, 11) xor Integer.rotateRight(e, 25)
            val ch = g xor (e and (f xor g))
            val t1 = h + s1 + ch + k[i] + w[i]
            val s0 = Integer.rotateRight(a, 2) xor Integer.rotateRight(a, 13) xor Integer.rotateRight(a, 22)
            val maj = (a and b) or (c and (a or b))
            val t2 = s0 + maj
            h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2
        }
        return intArrayOf(a, b, c, d, e, f, g, h)
    }

    /** State after the hidden 57-byte salt block, resumed from the 7 data bytes that finish it. */
    private fun shaInit(data7: ByteArray): IntArray {
        val w = IntArray(64)
        w[14] = ((data7[0].toInt() and 0xFF) shl 16) or ((data7[1].toInt() and 0xFF) shl 8) or (data7[2].toInt() and 0xFF)
        w[15] = be32(data7, 3)
        for (index in 16..29) {
            var v = SHA256_SCHEDULE[index - 16]
            if (index - 2 >= 14) v += if (index == 16) sigma1(w[index - 2]) xor SIGMA1_ADJUSTMENT.toInt() else sigma1(w[index - 2])
            if (index - 7 >= 14) v += w[index - 7]
            if (index - 15 >= 14) v += if (index == 29) sigma0(w[index - 15]) xor SIGMA0_ADJUSTMENT.toInt() else sigma0(w[index - 15])
            w[index] = v
        }
        w[30] = sigma1(w[28]) + w[23] + sigma0(w[15]) + w[14] + SHA256_ADJUSTMENT.toInt() - K[14]
        expandSchedule(w, 31)
        val working = rounds(SHA256_STATE, w, 14, K_BLOCK)
        return IntArray(8) { SHA256_INITIAL[it] + working[it] }
    }

    private fun shaDigest(data: ByteArray): ByteArray {
        require(data.size >= 7) { "token data too short" }
        val length = 57L + data.size
        val tail = data.size - 7
        val zeros = Math.floorMod(55L - length, 64L).toInt()
        val padded = ByteArray(tail + 1 + zeros + 8)
        System.arraycopy(data, 7, padded, 0, tail)
        padded[tail] = 0x80.toByte()
        val bits = length * 8L
        for (i in 0 until 8) padded[padded.size - 1 - i] = (bits ushr (8 * i)).toByte()
        var state = shaInit(data.copyOfRange(0, 7))
        var off = 0
        while (off < padded.size) {
            val w = IntArray(64)
            for (i in 0 until 16) w[i] = be32(padded, off + i * 4)
            expandSchedule(w, 16)
            val working = rounds(state, w, 0, K)
            state = IntArray(8) { state[it] + working[it] }
            off += 64
        }
        val out = ByteArray(32)
        for (i in 0 until 8) for (j in 0 until 4) out[i * 4 + j] = (state[i] ushr (24 - 8 * j)).toByte()
        return out
    }

    private fun wordsLe4Even(data: ByteArray): IntArray {
        val padded = data.copyOf(data.size + Math.floorMod(-data.size, 4))
        if (padded.isEmpty()) return IntArray(0)
        var n = padded.size / 4
        if (n % 2 == 1) n++
        return IntArray(n) { if (it * 4 < padded.size) le32(padded, it * 4) else 0 }
    }

    private fun cs64(data: ByteArray, digest: ByteArray): IntArray {
        val keyA = le32(digest, 0) or 1
        val keyB = le32(digest, 4) or 1
        val factor = CS64_FACTOR.toInt()
        val f0 = keyA * factor
        val f1 = keyB * factor
        val words = wordsLe4Even(byteArrayOf(0) + data)
        val count = CS64_COEF.size + words.size
        val terms = IntArray(count)
        val offsets = IntArray(count)
        for (i in CS64_COEF.indices) {
            terms[i] = CS64_COEF[i] * (if (i % 2 == 0) f0 else f1)
            offsets[i] = CS64_OFF[i]
        }
        for (i in words.indices) {
            val word = words[i]
            var term = word * (if (i % 2 == 0) keyA else keyB)
            var offset = rol16(word) * (if (i % 2 == 0) 0xEF0569FBL.toInt() else 0xC31713DBL.toInt())
            if (i == 0) {
                term += CS64_ADJUSTMENT0.toInt() * f0
                offset += CS64_ADJUSTMENT1.toInt()
            }
            terms[CS64_COEF.size + i] = term
            offsets[CS64_COEF.size + i] = offset
        }
        var swapAcc = 0; var swapLast = 0; var state = 0; var acc = 0
        var index = 0
        while (index < count) {
            val x = terms[index]
            val y = terms[index + 1]
            var t = rol16(offsets[index] + x)
            var q = t * 0x76F50F34
            swapAcc += rol16(q) * 0xC3EFEA97L.toInt() + q
            t = rol16(offsets[index + 1] + y)
            q = t * 0x1881CE3C
            swapLast = rol16(q) * 0x35BD1EC9 + q
            swapAcc += swapLast

            state = state * keyA + x
            state = rol16(state) * 0xCF98B111L.toInt()
            state = rol16(state) * 0x87085B9FL.toInt()
            state = rol16(state) * 0x12CEB96D
            state = rol16(state) * 0x257E1D83
            acc += state
            t = state * keyB + y
            t = rol16(t) * 0xA27416F5L.toInt()
            t = rol16(t) * 0xD38396FFL.toInt()
            state = rol16(rol16(t) * 0x7C932B89) * 0xBFA49F69L.toInt()
            acc += state
            index += 2
        }
        return intArrayOf(swapLast xor state, swapAcc xor acc)
    }

    private fun hexLe(v: Int, sb: StringBuilder) {
        for (j in 0 until 4) sb.append(String.format(java.util.Locale.US, "%02X", (v ushr (8 * j)) and 0xFF))
    }

    /** data = the Windows file-time ticks (rounded to 5 minutes) glued to the trusted client token, ASCII. */
    fun token(data: ByteArray): String {
        val digest = shaDigest(data)
        val pair = cs64(data, digest)
        val sb = StringBuilder(81)
        hexLe(pair[0], sb); hexLe(pair[1], sb)
        sb.append('-')
        for (b in digest) sb.append(String.format(java.util.Locale.US, "%02X", b.toInt() and 0xFF))
        return sb.toString()
    }
}
KIT_EOF_1
}

emit_2() {
  cat <<'KIT_EOF_2'
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
KIT_EOF_2
}

emit_3() {
  cat <<'KIT_EOF_3'
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
KIT_EOF_3
}

emit_4() {
  cat <<'KIT_EOF_4'
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
KIT_EOF_4
}

emit_5() {
  cat <<'KIT_EOF_5'
# Horizon native Edge voice (Kotlin) - V1.99.27

Cloud to phone, nothing in between: Microsoft WebSocket -> OkHttp -> RAM pipe -> ExoPlayer. No Termux, no edge-tts, no temp files.

## 1. Copy
Copy `com/festers/horizon/edge/*.kt` to `android/app/src/main/java/com/festers/horizon/edge/`.
If your MainActivity package is not `com.festers.horizon`, change line 1 of each file.

## 2. Gradle (android/app/build.gradle, dependencies block; skip lines you already have)
```
implementation "com.squareup.okhttp3:okhttp:4.12.0"
implementation "androidx.media3:media3-exoplayer:1.5.1"
```
Needs the INTERNET permission (already there for the AI providers).

## 3. Register the plugin (MainActivity, BEFORE super.onCreate)
Kotlin:
```
registerPlugin(com.festers.horizon.edge.HorizonEdgeVoicePlugin::class.java)
```
Java:
```
registerPlugin(com.festers.horizon.edge.HorizonEdgeVoicePlugin.class);
```
Then `npx cap sync android` and build.

## Notes
- Endpoint: wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1 with TrustedClientToken and a rotating
  Sec-MS-GEC token (built in EdgeProtocol.secMsGec). The api.msedgeservices.com / cognitiveservices URL is not the keyless Edge service.
- Microsoft bumps the Edge version string now and then. If voices start failing with HTTP 403, JS can pass a newer
  `gecVersion` to `speak()` (no rebuild); the default is in EdgeProtocol.DEFAULT_VERSION.
- A phone clock that is off gets one automatic retry on the server's clock.
- Unofficial service: no SLA. Any failure falls back to the Android voice in JS, as before.


## Stats plugin — V1.99.37

The Stats native plugin is in `com/festers/horizon/stats/HorizonStatsPlugin.kt`.
From this source package run `python3 scripts/install_stats.py /path/to/existing/android` for a dry run;
review it, then add `--apply` to install and register the plugin. Run Capacitor sync and rebuild your existing host.
The supplied archive has no complete Gradle host, Android SDK or signing configuration, so it is not an APK.
Wi-Fi/cell details require the explicit in-app network-details action and OS location permission.
Cleanup is token-bound, expires after five minutes, skips changed files and is limited to the private
`cacheDir/horizon-transient` directory. Put only disposable app-owned cache there. Other cache/audio,
chats, keys, databases, user files and external downloads are excluded. Browser cleanup is independently
restricted to `horizon-transient-*` CacheStorage buckets. Native compilation and physical device behavior
must be validated in your Android build. See `TEST_REPORT.html` in the package root.


## V1.99.39: Edge voices were all failing with HTTP 403 (token v2)

Microsoft started rejecting the old Sec-MS-GEC token around 13 Oct 2026. `EdgeGec.kt` (new) builds the v2 token and the
client now sends `Sec-MS-GEC-Version=2-<version>`. Copy ALL `com/festers/horizon/edge/*.kt` again (EdgeGec.kt is new),
then `npx cap sync android` and REBUILD THE APK. A web-only update (www/) does not fix this: the token lives in the native plugin.
The voice catalogue request now carries the token too. See NOTICE-gec.md for the licence note.


## All native plugins - V1.99.66

`android-native/` now holds the source of EVERY Horizon native plugin, not only Stats and Edge voice.

| Path | Content |
|---|---|
| `app/` | 27 plugin / service / receiver sources (Kotlin + Java) incl. `MainActivity.java`. The package line is `__APPID__`; the installer writes your app namespace there. |
| `com/festers/horizon/stats/` | Kotlin Stats plugin (snapshot, netChange watch, token-bound cache clean). |
| `com/festers/horizon/edge/` | Kotlin Edge voice plugin (5 files). |
| `manifest/` | `permissions.txt`, `queries.xml` (Termux and TTS visibility), `components.xml` (services and receivers). |
| `res/xml/network_security_config.xml` | HTTPS only; plain HTTP only to 127.0.0.1 and localhost (your local G4F server). |

Install into an `android/` folder (the GitHub workflow does this on every build; every command is safe to repeat):
```
bash scripts/install_native.sh android            # dry run, writes nothing
bash scripts/install_native.sh android --apply    # sources, manifest, permissions, Gradle, network config
bash scripts/install_edge.sh android --apply
bash scripts/install_native.sh --check android    # exit 1 and the reason if anything is missing
bash scripts/edge_kit.sh --check android
```
Gradle changes it makes: Kotlin 1.9.25, JitPack, core-library desugaring, coroutines, WorkManager, biometrics, OkHttp, Media3 and
NewPipeExtractor v0.27.1, plus 3 GB Gradle heap. `scripts/install_stats.py` is only for older hosts; `install_native.sh` installs Stats too.

The old Java `HorizonStatsPlugin` is retired: it and the Kotlin one both register as `HorizonStats`, and Capacitor allows a name once.
A leftover copy is kept as `.native-backup`, and `--check` fails on any duplicate plugin name.

Maintenance: `scripts/edge_kit.sh` carries copies of the Edge files and this README. After editing any of them run
`python3 scripts/regen_edge_kit.py`, otherwise the kit test fails.

Not verified: no Kotlin or Java compile, no APK build, nothing run on a phone. The first CI run is the real test.
KIT_EOF_5
}

emit_6() {
  cat <<'KIT_EOF_6'
# Third-party notice: Sec-MS-GEC v2 token

`com/festers/horizon/edge/EdgeGec.kt` is a Kotlin port of `generate_sec_ms_gec_v2` and its helpers
from `src/edge_tts/drm.py` in **edge-tts 7.3.1** by rany2 (https://github.com/rany2/edge-tts), licensed LGPL-3.0.
Constants were generated from that file, not typed by hand. The port was checked against the Python reference on 62
timestamps, including the published vector: unix 1791888000 -> 492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876.
KIT_EOF_6
}

emit_7() {
  cat <<'KIT_EOF_7'
#!/usr/bin/env bash
# Horizon V1.99.49 - install the native Edge voice plugin into a Capacitor android/ folder. Pure Bash.
# Usage: bash scripts/install_edge.sh <android-dir> [--apply]
# Dry run by default. Safe to run on every CI build: it only changes what is missing.
# Env: KOTLIN_VERSION (default 1.9.25), JVM_TARGET (default: read from app/capacitor.build.gradle, else 17)
set -u

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(dirname "$HERE")"
SRC="$REPO/android-native/com/festers/horizon/edge"
ANDROID="${1:-}"
APPLY=0
[ "${2:-}" = "--apply" ] && APPLY=1
KOTLIN_VERSION="${KOTLIN_VERSION:-1.9.25}"
FAILED=0
CHANGED=0

die() { echo "ERROR: $*" >&2; echo "No further changes made." >&2; exit 2; }

[ -n "$ANDROID" ] || die "usage: bash scripts/install_edge.sh <android-dir> [--apply]"
[ -d "$ANDROID" ] || die "'$ANDROID' is not a folder. In CI run 'npx cap add android' first."
ANDROID="$(cd "$ANDROID" && pwd)"
MAIN="$ANDROID/app/src/main"
MANIFEST="$MAIN/AndroidManifest.xml"
[ -f "$MANIFEST" ] || die "missing app/src/main/AndroidManifest.xml"
ls "$SRC"/*.kt >/dev/null 2>&1 || die "Kotlin sources not found at $SRC"

APPG="$ANDROID/app/build.gradle"
ROOTG="$ANDROID/build.gradle"
[ -f "$APPG" ] || die "app/build.gradle not found (Kotlin DSL .kts is not supported by this helper)"
[ -f "$ROOTG" ] || die "android/build.gradle not found"

# exactly one MainActivity
ACTS=()
while IFS= read -r f; do ACTS+=("$f"); done < <(find "$MAIN/java" \( -name MainActivity.java -o -name MainActivity.kt \) 2>/dev/null)
[ "${#ACTS[@]}" -eq 1 ] || die "expected one MainActivity under app/src/main/java, found ${#ACTS[@]}"
ACT="${ACTS[0]}"

# write_if_changed <path> <new content>
write_if_changed() {
  local path="$1" content="$2" old="" oldn newn
  if [ -f "$path" ]; then old="$(cat "$path")"; fi
  oldn="$old"; newn="$content"
  if [ -f "$path" ] && [ "$oldn" = "$newn" ]; then return 0; fi
  echo "Update: $path"
  CHANGED=$((CHANGED + 1))
  if [ "$APPLY" -eq 1 ]; then
    if [ -f "$path" ] && [ ! -f "$path.edge-backup" ]; then cp -p "$path" "$path.edge-backup"; fi
    mkdir -p "$(dirname "$path")"
    printf '%s\n' "$content" > "$path"
  fi
}

# ---- 1. register the plugin in MainActivity ----
S="$(cat "$ACT"; printf x)"; S="${S%x}"
REG='com.festers.horizon.edge.HorizonEdgeVoicePlugin'
if [[ "$S" =~ registerPlugin[[:space:]]*\([[:space:]]*(com\.festers\.horizon\.edge\.)?HorizonEdgeVoicePlugin ]]; then
  :
else
  case "$ACT" in
    *.java) CALL="registerPlugin($REG.class);"; SEMI=";" ;;
    *)      CALL="registerPlugin($REG::class.java)"; SEMI="" ;;
  esac
  if [[ "$S" =~ super\.onCreate[[:space:]]*\([[:space:]]*savedInstanceState[[:space:]]*\)[[:space:]]*\;? ]]; then
    M="${BASH_REMATCH[0]}"; PRE="${S%%"$M"*}"; POST="${S#"$PRE$M"}"
    S="$PRE$CALL"$'\n        '"$M$POST"
  elif [[ "$S" == *"onCreate"* ]]; then
    die "MainActivity has a custom onCreate. Register $REG manually before super.onCreate."
  else
    case "$ACT" in
      *.java) RE='class[[:space:]]+MainActivity[[:space:]]+extends[[:space:]]+BridgeActivity[[:space:]]*\{'
              BLK=$'\n    @Override\n    public void onCreate(android.os.Bundle savedInstanceState) {\n        '"$CALL"$'\n        super.onCreate(savedInstanceState);\n    }\n' ;;
      *)      RE='class[[:space:]]+MainActivity[[:space:]]*:[[:space:]]*BridgeActivity\(\)[[:space:]]*\{'
              BLK=$'\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        '"$CALL"$'\n        super.onCreate(savedInstanceState)\n    }\n' ;;
    esac
    [[ "$S" =~ $RE ]] || die "unrecognised MainActivity. Register $REG manually."
    M="${BASH_REMATCH[0]}"; PRE="${S%%"$M"*}"; POST="${S#"$PRE$M"}"
    S="$PRE$M$BLK$POST"
  fi
fi
write_if_changed "$ACT" "${S%$'\n'}"

# ---- 2. INTERNET permission ----
X="$(cat "$MANIFEST"; printf x)"; X="${X%x}"
if [[ "$X" != *"android.permission.INTERNET"* ]]; then
  HEAD="${X%%<manifest*}"; TAIL="${X#*<manifest}"; ATTRS="${TAIL%%>*}"; REST="${TAIL#*>}"
  X="$HEAD<manifest$ATTRS>"$'\n    <uses-permission android:name="android.permission.INTERNET"/>'"$REST"
fi
write_if_changed "$MANIFEST" "${X%$'\n'}"

# ---- 3. Kotlin plugin in the root build.gradle ----
R="$(cat "$ROOTG"; printf x)"; R="${R%x}"
if [[ "$R" != *"kotlin-gradle-plugin"* && "$R" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"com.android.tools.build:gradle"* ]]; then
      OUT+="        classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\""$'\n'; DONE=1
    fi
  done <<< "$R"
  if [ "$DONE" -eq 0 ]; then echo "ERROR: could not find the Android Gradle plugin line in android/build.gradle. Add: classpath \"org.jetbrains.kotlin:kotlin-gradle-plugin:$KOTLIN_VERSION\"" >&2; FAILED=1
  else R="${OUT%$'\n'}"; fi
fi
write_if_changed "$ROOTG" "${R%$'\n'}"

# ---- 4. app/build.gradle: kotlin plugin, java/kotlin target, dependencies ----
G="$(cat "$APPG"; printf x)"; G="${G%x}"
if [[ "$G" != *"kotlin-android"* && "$G" != *"org.jetbrains.kotlin.android"* ]]; then
  OUT=""; DONE=0
  while IFS= read -r line || [ -n "$line" ]; do
    OUT+="$line"$'\n'
    if [ "$DONE" -eq 0 ] && [[ "$line" == *"apply plugin: 'com.android.application'"* || "$line" == *'apply plugin: "com.android.application"'* ]]; then
      OUT+="apply plugin: 'kotlin-android'"$'\n'; DONE=1
    fi
  done <<< "$G"
  if [ "$DONE" -eq 0 ]; then echo "ERROR: app/build.gradle does not use 'apply plugin: com.android.application'. Add the Kotlin Android plugin by hand." >&2; FAILED=1
  else G="${OUT%$'\n'}"; fi
fi
if [[ "$G" != *"kotlinOptions"* && "$G" != *"jvmToolchain"* ]]; then
  JV="${JVM_TARGET:-}"
  if [ -z "$JV" ] && [ -f "$ANDROID/app/capacitor.build.gradle" ]; then
    CB="$(cat "$ANDROID/app/capacitor.build.gradle")"
    [[ "$CB" =~ JavaVersion\.VERSION_([0-9]+) ]] && JV="${BASH_REMATCH[1]}"
  fi
  JV="${JV:-17}"
  G+=$'\n\n// Horizon Edge: Kotlin target matches the Java target.\nandroid {\n    kotlinOptions {\n        jvmTarget = "'"$JV"$'"\n    }\n}'
fi
MISSING=""
for dep in "com.squareup.okhttp3:okhttp:4.12.0" "androidx.media3:media3-exoplayer:1.5.1"; do
  [[ "$G" == *"${dep%:*}"* ]] || MISSING+="    implementation \"$dep\""$'\n'
done
if [ -n "$MISSING" ]; then
  G+=$'\n\n// Horizon Edge: streamed speech, no external CLI.\ndependencies {\n'"${MISSING}}"
fi
write_if_changed "$APPG" "${G%$'\n'}"

# ---- 5. Kotlin sources ----
for f in "$SRC"/*.kt; do
  C="$(cat "$f")"
  write_if_changed "$MAIN/java/com/festers/horizon/edge/$(basename "$f")" "$C"
done

echo
if [ "$FAILED" -ne 0 ]; then echo "Finished WITH ERRORS (see above)." >&2; exit 3; fi
if [ "$APPLY" -eq 1 ]; then echo "Applied. $CHANGED file(s) changed. Now: npx cap sync android, then build."
else echo "Dry run: $CHANGED file(s) would change. Nothing written. Repeat with --apply."; fi
exit 0
KIT_EOF_7
}

emit_8() {
  cat <<'KIT_EOF_8'
#!/usr/bin/env python3
"""Install Edge native sources into an EXISTING Capacitor Android project. Dry-run by default."""
from pathlib import Path
import argparse
import re
import shutil
import xml.etree.ElementTree as ET

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('android', type=Path, help='Existing Capacitor android directory')
parser.add_argument('--apply', action='store_true', help='Apply reviewed changes, retaining .edge-backup files')
a = parser.parse_args()
base = a.android.resolve()
main = base / 'app/src/main'
manifest = main / 'AndroidManifest.xml'
if not manifest.is_file():
    parser.error('Expected app/src/main/AndroidManifest.xml. No files changed.')
repo = Path(__file__).resolve().parents[1]
source = repo / 'android-native/com/festers/horizon/edge'
activities = list((main/'java').rglob('MainActivity.java')) + list((main/'java').rglob('MainActivity.kt'))
if len(activities) != 1:
    parser.error('Expected one MainActivity under app/src/main/java. Install manually for custom source sets.')
activity = activities[0]
s = activity.read_text()
registration = 'com.festers.horizon.edge.HorizonEdgeVoicePlugin'
registered = re.search(r'registerPlugin\s*\(\s*(?:com\.festers\.horizon\.edge\.)?HorizonEdgeVoicePlugin(?:\.class|::class\.java)\s*\)', s)
if not registered:
    java = activity.suffix == '.java'
    call = 'registerPlugin(' + registration + ('.class);' if java else '::class.java)')
    marker = re.search(r'super\.onCreate\s*\(\s*savedInstanceState\s*\)\s*' + (';' if java else ''), s)
    if marker:
        s = s[:marker.start()] + call + '\n        ' + s[marker.start():]
    elif 'onCreate(' in s or 'onCreate (' in s:
        parser.error('Custom onCreate signature found. Register HorizonEdgeVoicePlugin manually; no files changed.')
    else:
        pattern = r'class\s+MainActivity\s+extends\s+BridgeActivity\s*\{' if java else r'class\s+MainActivity\s*:\s*BridgeActivity\(\)\s*\{'
        m = re.search(pattern, s)
        if not m:
            parser.error('Unrecognised MainActivity. Install manually; no files changed.')
        block = ('\n    @Override public void onCreate(android.os.Bundle savedInstanceState) {\n        ' if java else '\n    override fun onCreate(savedInstanceState: android.os.Bundle?) {\n        ') + call + '\n        super.onCreate(savedInstanceState)' + (';' if java else '') + '\n    }\n'
        s = s[:m.end()] + block + s[m.end():]
xml = manifest.read_text()
ET.fromstring(xml)
if 'android.permission.INTERNET' not in xml:
    i = xml.find('>', xml.find('<manifest')) + 1
    if i < 1:
        parser.error('Invalid manifest')
    xml = xml[:i] + '\n    <uses-permission android:name="android.permission.INTERNET"/>' + xml[i:]
ET.fromstring(xml)
gradle = next((f for f in [base/'app/build.gradle',base/'app/build.gradle.kts'] if f.is_file()), None)
if not gradle:
    parser.error('No app/build.gradle(.kts). No files changed.')
g = gradle.read_text()
deps = ['com.squareup.okhttp3:okhttp:4.12.0','androidx.media3:media3-exoplayer:1.5.1']
missing = [d for d in deps if d.rsplit(':',1)[0] not in g]
if missing:
    g += '\n// Horizon Edge: streamed speech, no external CLI.\ndependencies {\n' + ''.join(('    implementation("'+d+'")\n') if gradle.suffix=='.kts' else ('    implementation "'+d+'"\n') for d in missing) + '}\n'
print(('APPLY' if a.apply else 'DRY RUN') + ': HorizonEdgeVoice native integration')
print('Activity:', activity)
print('Manifest:', manifest)
print('Dependencies:', ', '.join(missing) or 'already present')
print('Kotlin support is a prerequisite; this helper does not change your Gradle plugin versions.')
print('Back up your host project before applying. Web assets must also be synced before rebuilding.')
changes = [(activity,s),(manifest,xml),(gradle,g)]
for f in sorted(source.glob('*.kt')):
    changes.append((main/'java/com/festers/horizon/edge'/f.name,f.read_text()))
for target, content in changes:
    if target.exists() and target.read_text()==content:
        continue
    print('Update:', target)
    if a.apply:
        if target.exists():
            backup=target.with_name(target.name+'.edge-backup')
            if not backup.exists():
                shutil.copy2(target,backup)
        target.parent.mkdir(parents=True,exist_ok=True)
        target.write_text(content)
print('Installed. Sync web assets, rebuild and install the APK; then use Check native connection in Voice settings.' if a.apply else 'No files written. Repeat with --apply only after reviewing the plan.')
KIT_EOF_8
}

emit_9() {
  cat <<'KIT_EOF_9'
# Horizon V1.99.49 - paste these lines into your existing APK build job's script:, in this order.
# They go AFTER the android/ folder exists and BEFORE ./gradlew assembleDebug (or assembleRelease).
#
#   - npm ci
#   - npx cap add android || true        # skip this line if android/ is committed in your repo
#   - npx cap sync android
#   - bash scripts/install_edge.sh android --apply
#   - cd android && ./gradlew assembleDebug
#
# Optional variables (Settings -> CI/CD -> Variables, or a variables: block):
#   KOTLIN_VERSION: "1.9.25"     # change only if Gradle complains about the Kotlin version
#   JVM_TARGET: "21"             # normally read from android/app/capacitor.build.gradle
#
# Example job:
build-apk:
  script:
    - npm ci
    - npx cap add android || true
    - npx cap sync android
    - bash scripts/install_edge.sh android --apply
    - cd android && ./gradlew assembleDebug
  artifacts:
    paths:
      - android/app/build/outputs/apk/debug/*.apk
KIT_EOF_9
}

emit_10() {
  cat <<'KIT_EOF_10'
# Horizon V1.99.54 - GitHub Actions: put these steps in your existing APK build job, in this order.
# They go AFTER actions/checkout, Node and Java are set up, and BEFORE the gradle build step.
# If android/ is committed in your repo, delete the "cap add" line.
#
#      - run: npm ci
#      - run: npx cap add android || true
#      - run: npx cap sync android
#      - run: bash scripts/install_edge.sh android --apply
#      - run: bash scripts/edge_kit.sh --check android
#      - run: cd android && ./gradlew assembleDebug
#
# The --check step FAILS the build with a plain reason when the Edge plugin is not really inside android/,
# so you never again get an APK that says "HorizonEdgeVoice is missing".
#
# Example job:
name: build-apk
on: [push, workflow_dispatch]
jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: 21
      - run: npm ci
      - run: npx cap add android || true
      - run: npx cap sync android
      - run: bash scripts/install_edge.sh android --apply
      - run: bash scripts/edge_kit.sh --check android
      - run: cd android && ./gradlew assembleDebug
      - uses: actions/upload-artifact@v4
        with:
          name: horizon-apk
          path: android/app/build/outputs/apk/debug/*.apk
KIT_EOF_10
}

emit_11() {
  cat <<'KIT_EOF_11'
/* HORIZON · Microsoft Edge voices, native · V2.0.0 (app V1.99.27)
 *
 * Cloud straight to the phone. The Kotlin plugin HorizonEdgeVoice opens the WebSocket to Microsoft, receives the mp3 stream and feeds it
 * to ExoPlayer from memory. No shell script, no CLI, no files.
 *
 * Flow for one reply:
 *   1. HorizonTTS.speak() asks wants() whether Edge should read it. Off, or plugin missing = Android voice, exactly as before.
 *   2. play() hands the reply (already split into sentence-sized chunks) to the plugin with ONE speak() call.
 *   3. The plugin streams chunk after chunk into one continuous audio stream, so playback starts on the first audio bytes and there are no gaps.
 *   4. The plugin sends back "edgeVoice" events: playing, ended, error. play() resolves on ended.
 *   Any failure before the first sound throws back into HorizonTTS, which falls through to the Android voice. After a failure Edge is
 *   skipped for 3 minutes so auto-read does not wait on a broken connection for every reply. A failure after sound started ends quietly
 *   (no second read from the top).
 *
 * Public API: window.HorizonEdgeTTS = { wants, play, stop, setPaused, failed, voiceFor, setVoice, setDefault, enabled, setEnabled,
 *   voices, providers, sanitizeVoice, ratePct, DEFAULT_VOICE }
 */
(function (root) {
    'use strict';
    var PLUGIN = 'HorizonEdgeVoice';
    var DEFAULT_VOICE = 'en-US-AriaNeural';
    var CHUNK_CHARS = 700;
    var STARTUP_MS = 30000;
    var COOLDOWN_MS = 180000;

    var VOICES = [
        ['en-US-AriaNeural', 'Aria · US female'], ['en-US-JennyNeural', 'Jenny · US female'], ['en-US-AvaNeural', 'Ava · US female'],
        ['en-US-EmmaNeural', 'Emma · US female'], ['en-US-MichelleNeural', 'Michelle · US female'],
        ['en-US-GuyNeural', 'Guy · US male'], ['en-US-AndrewNeural', 'Andrew · US male'], ['en-US-BrianNeural', 'Brian · US male'],
        ['en-US-ChristopherNeural', 'Christopher · US male'], ['en-US-EricNeural', 'Eric · US male'], ['en-US-RogerNeural', 'Roger · US male'],
        ['en-US-SteffanNeural', 'Steffan · US male'],
        ['en-GB-SoniaNeural', 'Sonia · UK female'], ['en-GB-LibbyNeural', 'Libby · UK female'],
        ['en-GB-RyanNeural', 'Ryan · UK male'], ['en-GB-ThomasNeural', 'Thomas · UK male'],
        ['en-ZA-LeahNeural', 'Leah · South Africa female'], ['en-ZA-LukeNeural', 'Luke · South Africa male'],
        ['en-AU-NatashaNeural', 'Natasha · Australia female'], ['en-AU-WilliamNeural', 'William · Australia male'],
        ['en-IN-NeerjaNeural', 'Neerja · India female'], ['en-IN-PrabhatNeural', 'Prabhat · India male'],
        ['en-IE-EmilyNeural', 'Emily · Ireland female'], ['en-IE-ConnorNeural', 'Connor · Ireland male']
    ].map(function (v) { return { id: v[0], label: v[1] }; });
    var PROVIDERS = [
        { id: 'gemini', name: 'Gemini' }, { id: 'cohere', name: 'Cohere' },
        { id: 'mistral', name: 'Mistral' }, { id: 'pollinations', name: 'Pollinations' }
    ];

    [ ['routeway','Routeway'], ['requesty','Requesty'], ['githubmodels','GitHub Models'], ['kilo','Kilo'], ['ovh','OVH'], ['chatat','Chatat'], ['blockrun','Blockrun'], ['aihorde','AI Horde'], ['g4flocal','G4F Local'], ['llm7','LLM7'], ['cloudflare','Cloudflare'] ].forEach(function (p) { PROVIDERS.push({id:p[0], name:p[1]}); });

    var ls = {
        get: function (k) { try { return root.localStorage.getItem(k); } catch (_) { return null; } },
        set: function (k, v) { try { root.localStorage.setItem(k, String(v)); } catch (_) { /* storage full or blocked */ } },
        remove: function (k) { try { root.localStorage.removeItem(k); } catch (_) { /* ignore */ } }
    };
    var K_ON = 'horizon_edge_on', K_DEF = 'horizon_edge_default', K_VOICE = 'horizon_edge_v_';

    var seq = 0, epoch = 0, coolUntil = 0, lastError = '', cur = null, listening = null, active = {};
    var statusEl = null;

    function noop() { /* nothing to do */ }
    function msg(e) { return String(e && e.message || e || 'Edge voice failed').replace(/\s+/g, ' ').slice(0, 220); }
    // Letters, digits and dashes only. A bad stored value just becomes the default voice.
    function sanitizeVoice(v) { v = String(v == null ? '' : v).trim(); return /^[A-Za-z0-9-]{3,64}$/.test(v) ? v : ''; }
    function provKey(prov) { return String(prov || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20); }

    function enabled() { return ls.get(K_ON) === '1'; }
    function setEnabled(on) { ls.set(K_ON, on ? '1' : '0'); coolUntil = 0; }
    function defaultVoice() { return sanitizeVoice(ls.get(K_DEF)) || DEFAULT_VOICE; }
    function setDefault(v) { var s = sanitizeVoice(v); if (s) ls.set(K_DEF, s); else ls.remove(K_DEF); return s || DEFAULT_VOICE; }
    function voiceFor(prov) { var k = provKey(prov); return (k && sanitizeVoice(ls.get(K_VOICE + k))) || defaultVoice(); }
    function setVoice(prov, v) { var k = provKey(prov); if (!k) return ''; var s = sanitizeVoice(v); if (s) ls.set(K_VOICE + k, s); else ls.remove(K_VOICE + k); return voiceFor(prov); }

    // The Speed slider of the Android voice also drives Edge: 1.0x = +0%, 1.25x = +25%, limits -50% to +100%.
    function ratePct() {
        try {
            var r = Number(root.HorizonTTS && root.HorizonTTS.settings && root.HorizonTTS.settings().rate);
            if (!isFinite(r) || r <= 0) return 0;
            return Math.max(-50, Math.min(100, Math.round((r - 1) * 100)));
        } catch (_) { return 0; }
    }

    /* ---------- native plugin ---------- */
    var cachedPlugin = null;
    function plugin() {
        var C = root.Capacitor;
        try {
            if (!C) return null;
            if (C.isNativePlatform && !C.isNativePlatform()) return null;
            if (C.Plugins && C.Plugins[PLUGIN]) return C.Plugins[PLUGIN];
            if (C.isPluginAvailable && !C.isPluginAvailable(PLUGIN)) return null;
            if (cachedPlugin) return cachedPlugin;
            if (C.registerPlugin) return (cachedPlugin = C.registerPlugin(PLUGIN));
            if (typeof C.nativePromise === 'function' && typeof C.addListener === 'function') {
                cachedPlugin = new Proxy({}, {get: function (_, method) {
                    if (method === 'then') return undefined;
                    if (method === 'addListener') return function (event, listener) { return C.addListener(PLUGIN, event, listener); };
                    return function (args) { return C.nativePromise(PLUGIN, String(method), args || {}); };
                }});
                return cachedPlugin;
            }
            return null;
        } catch (_) { return null; }
    }
    function deadline(promise, ms, message) {
        var timer; return Promise.race([promise, new Promise(function (_, reject) { timer = root.setTimeout(function () { reject(new Error(message)); }, ms); })]).finally(function () { root.clearTimeout(timer); });
    }
    function listen(P) {
        if (listening) return listening;
        listening = Promise.resolve(P.addListener('edgeVoice', function (ev) {
            var h = ev && active[ev.id];
            if (h) h(ev);
        })).catch(function (e) { listening = null; throw e; });
        return listening;
    }

    /* ---------- engine hooks used by HorizonTTS ---------- */
    function wants(opts) {
        if (!plugin()) return false;
        if (opts && opts.forceEdge) return true;
        return enabled() && Date.now() >= coolUntil;
    }
    async function play(job) {
        var P = plugin();
        if (!P) throw new Error('The native Edge voice plugin is missing from this build');
        if (cur) stop();
        var my = ++epoch, cancelled = function () { return my !== epoch || job.cancelled(); };
        var voice = sanitizeVoice(job.voice) || voiceFor(job.prov);
        var chunks = job.chunk(job.text, CHUNK_CHARS).filter(function (c) { return String(c).trim(); });
        if (!chunks.length) throw new Error('Nothing to speak');
        await deadline(listen(P), 8000, 'Edge event listener did not connect. Rebuild with HorizonEdgeVoice registered.');
        await job.waitResume();
        if (cancelled()) return false;
        var id = 'edge_' + Date.now() + '_' + (++seq), started = false;
        return new Promise(function (ok, no) {
            var done = false;
            var startup = root.setTimeout(function () {
                if (started || done) return;
                Promise.resolve(P.stop()).catch(noop);
                end(new Error('Edge did not start within 30 seconds. Try another voice or connection.'));
            }, STARTUP_MS);
            function end(err, val) {
                if (done) return;
                done = true; root.clearTimeout(startup); delete active[id]; if (cur && cur.id === id) cur = null;
                if (err) no(err); else ok(val);
            }
            active[id] = function (ev) {
                if (ev.event === 'playing') {
                    if (!started) { root.clearTimeout(startup); started = true; if (!cancelled() && job.onPlaying) job.onPlaying(); }
                } else if (ev.event === 'ended') {
                    lastError = ''; paint(); end(null, true);
                } else if (ev.event === 'error') {
                    var e = new Error(msg(ev.message));
                    if (ev.started || started) { failed(e); end(null, true); } else end(e);
                }
            };
            cur = { id: id, end: function () { end(null, false); } };
            Promise.resolve(P.speak({ id: id, text: job.text, chunks: chunks, voice: voice, ratePct: ratePct() }))
                .catch(function (e) { end(e instanceof Error ? e : new Error(msg(e))); });
        });
    }
    function stop() {
        epoch++;
        var c = cur;
        if (!c) return;
        c.end();
        var P = plugin();
        if (P) Promise.resolve(P.stop()).catch(noop);
    }
    function setPaused(on) {
        var P = plugin();
        if (!P || !cur) return;
        Promise.resolve(on ? P.pause() : P.resume()).catch(noop);
    }
    function failed(e) { lastError = msg(e); coolUntil = Date.now() + COOLDOWN_MS; paint(); }

    /* ---------- settings UI (injected into the Voice card; nothing in index.html to maintain) ---------- */
    function paint() {
        if (!statusEl) return;
        var on = enabled();
        statusEl.textContent = !on ? 'Off. Replies use the Android voice.'
            : !plugin() ? 'On, but this build has no native Edge voice plugin. Using the Android voice.'
            : lastError ? 'On, but the last try failed: ' + lastError + (Date.now() < coolUntil ? ' Using the Android voice for a few minutes.' : '')
            : 'On. Tap Check native connection, then Test Edge voice to verify this build.';
    }
    function el(tag, cls, text) { var n = root.document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
    function fillSelect(sel, current, firstLabel) {
        sel.textContent = '';
        var o = el('option', '', firstLabel); o.value = ''; sel.appendChild(o);
        var known = false;
        VOICES.forEach(function (v) { var op = el('option', '', v.label); op.value = v.id; if (v.id === current) known = true; sel.appendChild(op); });
        if (current && !known) { var c = el('option', '', current + ' · custom'); c.value = current; sel.appendChild(c); }
        sel.value = current || '';
    }
    var catalogueAt = 0, catalogueBusy = null;
    function refreshVoices() {
        if (catalogueBusy) return catalogueBusy;
        catalogueBusy = (async function () {
            var P = plugin(), list;
            if (P && typeof P.listVoices === 'function') list = (await deadline(P.listVoices(), 25000, 'Edge catalogue timed out. Check internet and the installed native plugin.')).voices;
            else {
                if (root.Capacitor && root.Capacitor.isNativePlatform && root.Capacitor.isNativePlatform()) throw new Error('HorizonEdgeVoice is missing. Install/register the native plugin and rebuild the APK.');
                var ctl = new AbortController(), timer = root.setTimeout(function () { ctl.abort(); }, 10000);
                try {
                    var response = await root.fetch('https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list?trustedclienttoken=6A5AA1D4EAFF4E9FB37E23D68491D6F4', {signal: ctl.signal});
                    if (!response.ok) throw new Error('Voice catalogue HTTP ' + response.status);
                    list = await response.json();
                } finally { root.clearTimeout(timer); }
            }
            var mapped = (list || []).map(function (v) {
                var id = sanitizeVoice(v.ShortName || v.id);
                return {id: id, label: (v.FriendlyName || v.label || id) + (v.Locale ? ' · ' + v.Locale : '')};
            }).filter(function (v) { return !!v.id; });
            if (!mapped.length) throw new Error('No voices returned; keeping the built-in list.');
            var seen = {};
            VOICES.splice(0, VOICES.length);
            mapped.sort(function (a,b) { return a.label.localeCompare(b.label); }).forEach(function (v) { if (!seen[v.id]) { seen[v.id] = true; VOICES.push(v); } });
            catalogueAt = Date.now(); return VOICES;
        })().finally(function () { catalogueBusy = null; });
        return catalogueBusy;
    }
    function testVoice(prov, voice) {
        var T = root.HorizonTTS;
        if (!T) { if (statusEl) statusEl.textContent = 'The speech engine has not loaded. Reload Horizon.'; return Promise.resolve(false); }
        lastError = ''; coolUntil = 0;
        if (!plugin()) { if (statusEl) statusEl.textContent = 'Voice testing needs the Android app with HorizonEdgeVoice installed.'; return; }
        T.stop();
        var selected = sanitizeVoice(voice) || voiceFor(prov);
        if (statusEl) statusEl.textContent = 'Connecting · ' + selected;
        return Promise.resolve(T.toggle('edge-test-' + (prov || 'default'), 'Hello. This is ' + selected.replace(/Neural$/, '').replace(/-/g, ' ') + ', speaking in Horizon.', {forceEdge: true, prov: prov || '', voice: selected})).then(function (ok) {
            if (statusEl) statusEl.textContent = lastError ? 'Edge test failed: ' + lastError + ' Android fallback was attempted.' : ok ? 'Edge test complete · ' + selected : 'Edge test stopped or could not play. Check Android speech settings.';
            return ok;
        }).catch(function (e) { failed(e); return false; });
    }
    function mount() {
        var doc = root.document, card = doc && doc.getElementById('ttsCard');
        if (!card || doc.getElementById('ttsEdgeGroup')) return;
        var group = el('details', 'hz-voice-group'); group.id = 'ttsEdgeGroup';
        group.appendChild(el('summary', '', 'Microsoft Edge voices · direct from the cloud'));
        group.appendChild(el('p', 'hint', 'Natural neural voices streamed straight from Microsoft to Horizon. Needs internet and the native HorizonEdgeVoice plugin in this APK. If Edge cannot connect, Horizon tries your Android speech engine and reports the error.'));
        var row = el('label', 'opt-row'); row.appendChild(el('span', '', 'Use Edge voices'));
        var chk = el('input'); chk.type = 'checkbox'; chk.id = 'ttsEdgeOn'; chk.checked = enabled(); row.appendChild(chk); group.appendChild(row);
        statusEl = el('p', 'hint'); statusEl.id = 'ttsEdgeStatus'; group.appendChild(statusEl);

        var defLbl = el('label', 'field-label', 'Default voice (used when an AI has none of its own)'); defLbl.setAttribute('for', 'ttsEdgeDef'); group.appendChild(defLbl);
        var def = el('select'); def.id = 'ttsEdgeDef'; fillSelect(def, ls.get(K_DEF) ? defaultVoice() : '', 'Aria · US female (built-in default)'); group.appendChild(def);
        var custLbl = el('label', 'field-label', 'Or type any Edge voice name, e.g. en-ZA-LeahNeural'); custLbl.setAttribute('for', 'ttsEdgeCustom'); group.appendChild(custLbl);
        var cust = el('input'); cust.type = 'text'; cust.id = 'ttsEdgeCustom'; cust.autocomplete = 'off'; cust.spellcheck = false; cust.placeholder = DEFAULT_VOICE; group.appendChild(cust);

        group.appendChild(el('h4', '', 'Voice for each AI'));
        PROVIDERS.forEach(function (p) {
            var entry = el('div', 'hz-edge-provider'); group.appendChild(entry);
            var l = el('label', 'field-label', p.name); l.setAttribute('for', 'ttsEdge_' + p.id); entry.appendChild(l);
            var s = el('select'); s.id = 'ttsEdge_' + p.id; fillSelect(s, sanitizeVoice(ls.get(K_VOICE + p.id)), 'Default voice'); entry.appendChild(s);
            s.addEventListener('change', function () { setVoice(p.id, s.value); });
            var test = el('button', 'use-btn hz-edge-test', 'Test ' + p.name); test.type = 'button'; test.dataset.edgeTest = p.id;
            test.addEventListener('click', function () { testVoice(p.id, s.value); }); entry.appendChild(test);
        });

        var find = el('input'); find.type = 'search'; find.id = 'ttsEdgeSearch'; find.placeholder = 'Find voices · name, language or country'; find.setAttribute('aria-label', 'Filter Edge voice catalogue');
        group.insertBefore(find, defLbl);
        function refill() {
            group.querySelectorAll('select').forEach(function (s) {
                var current = s.value; fillSelect(s, current, s === def ? 'Aria · built-in default' : 'Default voice');
                var q = find.value.toLowerCase().trim();
                Array.from(s.options).forEach(function (o) { o.hidden = !!(q && o.value && o.value !== current && (o.textContent + ' ' + o.value).toLowerCase().indexOf(q) < 0); });
            });
        }
        find.addEventListener('input', refill);
        var more = el('button', 'use-btn', 'Load / refresh all Edge voices'); more.id = 'ttsEdgeRefresh'; more.type = 'button'; group.insertBefore(more, find);
        var catalog = el('p', 'hint', VOICES.length + ' built-in voices. Refresh for Microsoft’s current multilingual catalogue.'); catalog.id = 'ttsEdgeCatalogueStatus'; group.insertBefore(catalog, find);
        more.addEventListener('click', async function () {
            more.disabled = true; catalog.textContent = 'Loading Microsoft voice catalogue…';
            try { await refreshVoices(); refill(); catalog.textContent = VOICES.length + ' voices · updated ' + new Date(catalogueAt).toLocaleTimeString(); }
            catch (e) { catalog.textContent = msg(e) + ' Built-in and custom voices are still available.'; }
            finally { more.disabled = false; }
        });
        var probe = el('button','use-btn','Check native connection'); probe.type='button'; probe.id='ttsEdgeProbe';
        probe.addEventListener('click', async function () {
            var P=plugin(); if(!P) { statusEl.textContent='HorizonEdgeVoice is missing. Install/register it in your Android project, then sync and rebuild the APK. A web-asset update alone cannot add this plugin.'; return; }
            probe.disabled=true; statusEl.textContent='Checking native Edge bridge…';
            try {
                var s=await deadline(P.status(), 8000, 'Native Edge bridge did not respond. Rebuild with the included plugin.');
                statusEl.textContent=s && s.available ? 'Native Edge connected · build ' + s.version + '. Ready to test a voice.' : 'Native Edge did not report readiness.';
            } catch(e) { statusEl.textContent='Native check failed: '+msg(e)+' Install the included V1.99.42 plugin and rebuild.'; }
            finally { probe.disabled=false; }
        }); group.insertBefore(probe, group.querySelector('h4'));
        var actions = el('div', 'card-actions');
        var testBtn = el('button', 'use-btn', 'Test Edge voice'); testBtn.type = 'button';
        actions.appendChild(testBtn); group.insertBefore(actions, group.querySelector('h4'));
        var stopTest = el('button', 'use-btn', 'Stop voice test'); stopTest.type = 'button';
        stopTest.addEventListener('click', function () { if (root.HorizonTTS) root.HorizonTTS.stop(); }); actions.appendChild(stopTest);

        chk.addEventListener('change', function () { setEnabled(chk.checked); lastError = ''; paint(); });
        def.addEventListener('change', function () { setDefault(def.value); cust.value = ''; });
        cust.addEventListener('change', function () {
            var s = sanitizeVoice(cust.value);
            if (!cust.value.trim()) return;
            if (!s) { statusEl.textContent = 'That is not a voice name. Use letters, numbers and dashes only.'; return; }
            setDefault(s); fillSelect(def, s, 'Aria · US female (built-in default)'); paint();
        });
        testBtn.addEventListener('click', function () {
            testVoice('', sanitizeVoice(cust.value) || def.value || defaultVoice());
        });
        var android = doc.getElementById('ttsAndroidGroup');
        if (android && android.parentNode === card) card.insertBefore(group, android); else card.appendChild(group);
        if (root.HorizonTTS && root.HorizonTTS.onState) root.HorizonTTS.onState(function (s) {
            if (s.engine === 'edge' && s.state === 'playing') statusEl.textContent = 'Playing Edge voice…';
            if (s.note && /Edge voice failed/.test(s.note)) statusEl.textContent = s.note;
        });
        root.document.addEventListener('deviceready', paint);
        paint();
    }

    /* V1.99.130: render a whole script to ONE mp3 blob (no playback). Needs HorizonEdgeVoicePlugin.renderMp3 in the APK. */
    async function renderMp3(text, opts) {
        var P = plugin();
        if (!P) throw new Error('The native Edge voice plugin is missing from this build');
        var raw = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
        if (!raw) throw new Error('Nothing to render');
        if (raw.length > 30000) throw new Error('Script too long: 30000 characters at most');
        var chunks = raw.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) || [raw], out = [], cur = '';
        chunks.forEach(function (c) { if ((cur + c).length > CHUNK_CHARS && cur) { out.push(cur.trim()); cur = c; } else cur += c; });
        if (cur.trim()) out.push(cur.trim());
        var voice = sanitizeVoice(opts && opts.voice) || defaultVoice();
        var onProgress = opts && typeof opts.onProgress === 'function' ? opts.onProgress : null;
        var tell = function (d) { if (onProgress) { try { onProgress(d, out.length); } catch (_) { /* progress display is best effort */ } } };
        /* V1.99.131: render ONE part at a time (the plugin call is unchanged, it just gets one part) so the app can show real progress.
           MP3 frames join by simple concatenation, the same way the plugin already joins its own pieces. */
        var parts = [];
        tell(0);
        for (var ci = 0; ci < out.length; ci++) {
            var res;
            try {
                res = await deadline(Promise.resolve(P.renderMp3({ text: out[ci], chunks: [out[ci]], voice: voice, ratePct: ratePct() })), 120000, 'Edge render timed out on part ' + (ci + 1) + ' of ' + out.length + '. Check your internet and try again.');
            } catch (e) {
                var m = String(e && e.message || e);
                if (/not implemented|no such method|UNIMPLEMENTED/i.test(m)) throw new Error('This APK has no Edge render support yet. Rebuild with the V1.99.130 HorizonEdgeVoicePlugin.kt.');
                throw e;
            }
            if (!res || !res.base64) throw new Error('Edge voice returned no audio for part ' + (ci + 1) + ' of ' + out.length);
            var bin = root.atob(res.base64), bytes = new Uint8Array(bin.length);
            for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            parts.push(bytes);
            tell(ci + 1);
        }
        return new root.Blob(parts, { type: 'audio/mpeg' });
    }

    root.HorizonEdgeTTS = {
        wants: wants, play: play, stop: stop, setPaused: setPaused, failed: failed,
        voiceFor: voiceFor, setVoice: setVoice, setDefault: setDefault, enabled: enabled, setEnabled: setEnabled,
        voices: VOICES, providers: PROVIDERS, refreshVoices: refreshVoices, testVoice: testVoice, sanitizeVoice: sanitizeVoice, ratePct: ratePct, DEFAULT_VOICE: DEFAULT_VOICE, renderMp3: renderMp3
    };
    if (root.HorizonTTS && root.HorizonTTS.registerEdge) root.HorizonTTS.registerEdge(root.HorizonEdgeTTS);
    if (root.document) {
        if (root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', mount); else mount();
    }
})(typeof window !== 'undefined' ? window : globalThis);
KIT_EOF_11
}

emit_12() {
  cat <<'KIT_EOF_12'
# Horizon Edge Voice - setup and recovery (V1.99.54)

Settings shows "HorizonEdgeVoice is missing" when the APK was built WITHOUT the native Edge plugin.
Web files (www/) can never add it. The plugin is 5 Kotlin files that must be copied into the Android project and registered at build time.

## The 5 files (android-native/com/festers/horizon/edge/)
EdgeAudioPipe.kt, EdgeGec.kt, EdgeProtocol.kt, EdgeTtsClient.kt, HorizonEdgeVoicePlugin.kt

## Files the build needs in the repo (all are in this zip)
- android-native/com/festers/horizon/edge/*.kt  (the 5 above)
- scripts/install_edge.sh   (copies the 5 files into android/, registers the plugin, adds OkHttp + Media3 + Kotlin)
- scripts/edge_kit.sh       (restores ANY missing Edge file from itself, and checks the android/ folder)
- www/horizon_edge_tts.js   (the Settings > Voice screen)
- scripts/ci/gitlab-edge-snippet.yml, scripts/ci/github-edge-snippet.yml (the CI lines)

## If any of these are missing from a zip you were given
bash scripts/edge_kit.sh            # run in the repo root: restores every missing Edge file, never overwrites yours
bash scripts/edge_kit.sh --force    # also replaces files that differ with the V1.99.54 versions (old copy kept as .bak-TIMESTAMP)
edge_kit.sh is ONE self-contained file. Keep a copy of it on your phone and you never have to hunt for an old zip again.

## Put these lines in your APK build job (GitLab or GitHub), after the android/ folder exists and before gradle
npm ci
npx cap add android || true        # skip if android/ is committed
npx cap sync android
bash scripts/install_edge.sh android --apply
bash scripts/edge_kit.sh --check android   # FAILS the build with a plain reason if the plugin is not really inside android/
cd android && ./gradlew assembleDebug

## Check by hand
bash scripts/edge_kit.sh --check android
It verifies: 5 Kotlin files in android/app/src/main/java/com/festers/horizon/edge/, the plugin registered BEFORE super.onCreate in MainActivity,
INTERNET permission, OkHttp and Media3 in app/build.gradle, and the Kotlin plugin.

## After installing the new APK
Settings > Voice > Microsoft Edge voices > Check native connection > Load / refresh all Edge voices > Test Edge voice > tick Use Edge voices.

## If voices fail with HTTP 403
EdgeGec.kt holds the v2 token (Microsoft changed it on 13 Oct 2026). Make sure ALL 5 files are the V1.99.54 ones (edge_kit.sh --force) and rebuild the APK.

## Not verified
The Kotlin was not compiled here and no Android project was supplied. The first build on your side is the real test.

## GitHub Actions (V1.99.64)
.github/workflows/build-apk.yml is in the zip root and already runs install_edge.sh and edge_kit.sh --check before Gradle.
Commit .github/, scripts/, android-native/ and www/ to the repo, push, then download the "horizon-apk" artifact from the run.
If the check step fails, its log line names exactly what is missing from android/.

V1.99.66: the workflow now runs scripts/install_native.sh --apply first (every other plugin, the manifest entries and the Gradle dependencies),
then install_edge.sh, then install_native.sh --check and edge_kit.sh --check, and keeps a Gradle cache.
If a build fails, download the "gradle-reports" artifact from the run.
KIT_EOF_12
}

emit_file() {
  case "$1" in
    "android-native/com/festers/horizon/edge/EdgeAudioPipe.kt") emit_0 ;;
    "android-native/com/festers/horizon/edge/EdgeGec.kt") emit_1 ;;
    "android-native/com/festers/horizon/edge/EdgeProtocol.kt") emit_2 ;;
    "android-native/com/festers/horizon/edge/EdgeTtsClient.kt") emit_3 ;;
    "android-native/com/festers/horizon/edge/HorizonEdgeVoicePlugin.kt") emit_4 ;;
    "android-native/README.md") emit_5 ;;
    "android-native/NOTICE-gec.md") emit_6 ;;
    "scripts/install_edge.sh") emit_7 ;;
    "scripts/install_edge.py") emit_8 ;;
    "scripts/ci/gitlab-edge-snippet.yml") emit_9 ;;
    "scripts/ci/github-edge-snippet.yml") emit_10 ;;
    "www/horizon_edge_tts.js") emit_11 ;;
    "EDGE_VOICE_SETUP.md") emit_12 ;;
    *) return 1 ;;
  esac
}


say() { printf '%s\n' "$*"; }
FORCE=0; MODE=restore; ARG1=""; ARG2=""
pos=()
for a in "$@"; do
  case "$a" in
    --force) FORCE=1 ;;
    --check) MODE=check ;;
    --install) MODE=install ;;
    --list) MODE=list ;;
    -h|--help) sed -n 2,10p "$KIT_SELF"; exit 0 ;;
    *) pos+=("$a") ;;
  esac
done
ARG1="${pos[0]:-}"; ARG2="${pos[1]:-}"

restore_into() {
  local root="$1" f dest tmp made=0 kept=0 same=0 repl=0
  mkdir -p "$root" || { say "ERROR: cannot create $root"; return 2; }
  tmp="$TMP_ROOT/edge_kit.$$.tmp"
  for f in "${KIT_FILES[@]}"; do
    dest="$root/$f"
    emit_file "$f" > "$tmp" || { say "ERROR: kit cannot produce $f"; rm -f "$tmp"; return 2; }
    if [ ! -f "$dest" ]; then
      mkdir -p "$(dirname "$dest")" && cp "$tmp" "$dest" && { say "  restored  $f"; made=$((made+1)); }
    elif cmp -s "$tmp" "$dest"; then
      same=$((same+1))
    elif [ "$FORCE" -eq 1 ]; then
      cp -p "$dest" "$dest.bak-$STAMP" && cp "$tmp" "$dest" && { say "  replaced  $f  (old copy: $f.bak-$STAMP)"; repl=$((repl+1)); }
    else
      say "  differs   $f  (kept yours; --force installs the $KIT_VERSION copy)"; kept=$((kept+1))
    fi
  done
  rm -f "$tmp"
  # the kit also keeps a copy of itself in scripts/, so the repo carries its own recovery tool
  if [ ! -f "$root/scripts/edge_kit.sh" ]; then
    mkdir -p "$root/scripts" && cp "$KIT_SELF" "$root/scripts/edge_kit.sh" && { say "  restored  scripts/edge_kit.sh (this kit)"; made=$((made+1)); }
  fi
  say ""
  say "Edge kit $KIT_VERSION in $root: $made restored, $repl replaced, $kept differ (kept), $same already identical."
  return 0
}

check_android() {
  local A="$1" bad=0 main edge act line_reg line_sup f
  [ -d "$A" ] || { say "FAIL: '$A' is not a folder. Run 'npx cap add android' first."; return 1; }
  A="$(cd "$A" && pwd)"; main="$A/app/src/main"; edge="$main/java/com/festers/horizon/edge"
  say "Checking the Edge plugin inside $A"
  for f in EdgeAudioPipe.kt EdgeGec.kt EdgeProtocol.kt EdgeTtsClient.kt HorizonEdgeVoicePlugin.kt; do
    if [ -f "$edge/$f" ]; then say "  ok    $f"; else say "  FAIL  $f is missing from android/app/src/main/java/com/festers/horizon/edge/  (run: bash scripts/install_edge.sh android --apply)"; bad=1; fi
  done
  act="$(find "$main/java" \( -name MainActivity.java -o -name MainActivity.kt \) 2>/dev/null | head -n 1)"
  if [ -z "$act" ]; then say "  FAIL  no MainActivity found under app/src/main/java"; bad=1
  else
    line_reg="$(grep -n 'HorizonEdgeVoicePlugin' "$act" | grep -n 'registerPlugin' | head -n 1)"
    if [ -z "$line_reg" ]; then say "  FAIL  MainActivity does not call registerPlugin(...HorizonEdgeVoicePlugin...)"; bad=1
    else
      line_reg="$(grep -n 'registerPlugin' "$act" | grep 'HorizonEdgeVoicePlugin' | head -n 1 | cut -d: -f1)"
      line_sup="$(grep -n 'super.onCreate' "$act" | head -n 1 | cut -d: -f1)"
      if [ -n "$line_sup" ] && [ "$line_reg" -gt "$line_sup" ]; then say "  FAIL  the plugin is registered AFTER super.onCreate (line $line_reg > $line_sup). It must come BEFORE."; bad=1
      else say "  ok    plugin registered in $(basename "$act") before super.onCreate"; fi
    fi
  fi
  if grep -q 'android.permission.INTERNET' "$main/AndroidManifest.xml" 2>/dev/null; then say "  ok    INTERNET permission"; else say "  FAIL  INTERNET permission missing in AndroidManifest.xml"; bad=1; fi
  f="$A/app/build.gradle"; [ -f "$f" ] || f="$A/app/build.gradle.kts"
  if [ ! -f "$f" ]; then say "  FAIL  app/build.gradle not found"; bad=1
  else
    grep -q 'com.squareup.okhttp3:okhttp' "$f" && say "  ok    OkHttp dependency" || { say "  FAIL  OkHttp dependency missing in $(basename "$f")"; bad=1; }
    grep -q 'androidx.media3:media3-exoplayer' "$f" && say "  ok    Media3 ExoPlayer dependency" || { say "  FAIL  Media3 ExoPlayer dependency missing in $(basename "$f")"; bad=1; }
    if grep -q -E "kotlin-android|org.jetbrains.kotlin.android" "$f"; then say "  ok    Kotlin plugin in app/build.gradle"; else say "  FAIL  Kotlin plugin missing in app/build.gradle"; bad=1; fi
  fi
  local repo; repo="$(dirname "$A")"
  if [ -f "$repo/www/horizon_edge_tts.js" ]; then say "  ok    www/horizon_edge_tts.js"; else say "  FAIL  www/horizon_edge_tts.js is missing (run: bash scripts/edge_kit.sh)"; bad=1; fi
  say ""
  if [ "$bad" -eq 0 ]; then say "EDGE PLUGIN PRESENT. This APK will contain HorizonEdgeVoice."; return 0; fi
  say "EDGE PLUGIN NOT READY. Fix the FAIL lines above, then build. (Web files alone can never add this plugin.)"; return 1
}

case "$MODE" in
  list) for f in "${KIT_FILES[@]}"; do say "$f"; done ;;
  check)
    [ -n "$ARG1" ] || { say "usage: bash edge_kit.sh --check <android-dir>"; exit 2; }
    check_android "$ARG1"; exit $? ;;
  install)
    [ -n "$ARG1" ] || { say "usage: bash edge_kit.sh --install <android-dir> [repo-dir]"; exit 2; }
    REPO="${ARG2:-$PWD}"
    restore_into "$REPO" || exit 2
    bash "$REPO/scripts/install_edge.sh" "$ARG1" --apply || exit $?
    check_android "$ARG1"; exit $? ;;
  *)
    REPO="${ARG1:-$PWD}"
    restore_into "$REPO"; exit $? ;;
esac
