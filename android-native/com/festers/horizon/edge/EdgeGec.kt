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
