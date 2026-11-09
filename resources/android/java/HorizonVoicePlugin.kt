package __APPID__

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKittenModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsKokoroModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.getcapacitor.JSArray
import okhttp3.OkHttpClient
import okhttp3.Request
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

/**
 * V1.75.0 Horizon Voice: the built-in Kitten voice (Settings > Voice > Natural: Built-in voice). Was Kokoro in V1.73/V1.74.
 *
 * The sherpa-onnx runtime (libsherpa-onnx-jni.so, libonnxruntime.so), its Kotlin API (com.k2fsa.sherpa.onnx.Tts.kt) and the Kitten nano
 * English model are packed into the APK by scripts/bundle-voice.sh during the build. Nothing is downloaded on the phone.
 *
 *  - status():  { bundled, unpacked, loaded }       what is in the APK / on the phone right now
 *  - load():    { ready, sampleRate, speakers }     unpacks the model from the APK once (files/horizon_voice), then loads it. Sends
 *                                                   "voiceProgress" { note } events while unpacking. Always resolves; ready=false carries error.
 *  - synth():   { wav, sampleRate, ms }             text + sid (speaker id) in, a 16-bit mono WAV (base64) out. Rejects on failure.
 *  - release(): frees the model (a small amount of memory).
 *
 * V1.86.0 VOICE LIBRARY. Besides the bundled Kitten voice (pack "builtin") the phone can hold downloaded packs (files/horizon_packs/<id>):
 *  - packs():          { installed: [id, ...] }   packs that are fully unpacked
 *  - download():       { id, url } -> { ok } | { ok:false, error }   one https .tar.bz2 from the sherpa-onnx tts-models release; sends "packProgress" { id, pct, note }
 *  - cancelDownload(), removePack({ id })
 *  - load({ pack }) / synth({ pack, sid, text, speed }) pick which model is loaded. A pack with voices.bin is Kokoro, any other pack with a .onnx is a Piper (VITS) model.
 *    Only one model is held in memory: switching pack releases the old one first.
 *
 * All model work runs on one background thread (the native object is not thread-safe, and the bridge thread must never block).
 */
@CapacitorPlugin(name = "HorizonVoice")
class HorizonVoicePlugin : Plugin() {

    companion object {
        private const val ASSET_DIR = "horizon_voice"
        private const val STAMP = "VERSION"
    }

    private val worker = Executors.newSingleThreadExecutor { r -> Thread(r, "horizon-voice").also { it.isDaemon = true } }
    @Volatile private var tts: OfflineTts? = null
    @Volatile private var activePack = ""
    @Volatile private var cancelDl = false
    private val downloading = java.util.concurrent.atomic.AtomicBoolean(false)
    @Volatile private var downloadingId = ""
    private val dlWorker = Executors.newSingleThreadExecutor { r -> Thread(r, "horizon-voice-dl").also { it.isDaemon = true } }
    private val http: OkHttpClient by lazy {
        OkHttpClient.Builder().connectTimeout(30, TimeUnit.SECONDS).readTimeout(60, TimeUnit.SECONDS).callTimeout(0, TimeUnit.SECONDS).followRedirects(true).build()
    }
    private var sampleRate = 24000
    private var speakers = 0

    private fun modelDir(): File = File(context.filesDir, ASSET_DIR)

    private fun packsRoot(): File = File(context.filesDir, "horizon_packs")
    private fun cleanId(id: String?): String = (id ?: "").lowercase().filter { it.isLetterOrDigit() || it == '-' || it == '_' }.take(60)
    private fun packDir(id: String): File = File(packsRoot(), id)
    private fun packReady(dir: File): Boolean =
        File(dir, "tokens.txt").exists() && (dir.listFiles() ?: emptyArray()).any { it.isFile && it.name.endsWith(".onnx") }

    private fun bundledList(): Array<String> = try { context.assets.list(ASSET_DIR) ?: emptyArray() } catch (e: Exception) { emptyArray() }

    private fun readAssetText(path: String): String = try {
        context.assets.open(path).bufferedReader().use { it.readText().trim() }
    } catch (e: Exception) { "" }

    private fun note(text: String) {
        val o = JSObject()
        o.put("note", text)
        notifyListeners("voiceProgress", o)
    }

    private fun countFiles(path: String): Int {
        val kids = try { context.assets.list(path) } catch (e: Exception) { null }
        if (kids == null || kids.isEmpty()) return 1
        var n = 0
        for (k in kids) n += countFiles("$path/$k")
        return n
    }

    /** Copies one asset file or a whole asset folder into dest. Returns how many files were copied so far. */
    private fun copyTree(path: String, dest: File, total: Int, done: IntArray) {
        val kids = try { context.assets.list(path) } catch (e: Exception) { null }
        if (kids == null || kids.isEmpty()) {
            dest.parentFile?.mkdirs()
            context.assets.open(path).use { input ->
                FileOutputStream(dest).use { out ->
                    val buf = ByteArray(256 * 1024)
                    while (true) {
                        val n = input.read(buf)
                        if (n < 0) break
                        out.write(buf, 0, n)
                    }
                }
            }
            done[0]++
            if (done[0] % 40 == 0 || done[0] == total) note("Unpacking the voice, first time only: " + (done[0] * 100 / total) + "%")
            return
        }
        dest.mkdirs()
        for (k in kids) copyTree("$path/$k", File(dest, k), total, done)
    }

    /** Makes sure files/horizon_voice matches the model packed in the APK. Throws a readable message if it cannot. */
    private fun ensureUnpacked(): File {
        val dir = modelDir()
        val want = readAssetText("$ASSET_DIR/$STAMP")
        if (bundledList().isEmpty() || want.isEmpty()) {
            throw IllegalStateException("The voice model is not inside this APK. The build step bundle-voice.sh did not run.")
        }
        val have = try { File(dir, STAMP).readText().trim() } catch (e: Exception) { "" }
        if (have == want && File(dir, "tokens.txt").exists()) return dir
        note("Unpacking the voice, first time only: 0%")
        dir.deleteRecursively()
        val total = countFiles(ASSET_DIR).coerceAtLeast(1)
        copyTree(ASSET_DIR, dir, total, intArrayOf(0))
        if (!File(dir, "tokens.txt").exists()) throw IllegalStateException("Unpacking the voice failed: tokens.txt is missing")
        return dir
    }

    private fun buildTts(dir: File): OfflineTts {
        val model = (dir.listFiles() ?: emptyArray()).filter { it.name.startsWith("model") && it.name.endsWith(".onnx") }.minByOrNull { it.name }
            ?: throw IllegalStateException("No Kitten model file was found in the unpacked voice")
        val kitten = OfflineTtsKittenModelConfig(
            model = model.absolutePath,
            voices = File(dir, "voices.bin").absolutePath,
            tokens = File(dir, "tokens.txt").absolutePath,
            dataDir = File(dir, "espeak-ng-data").absolutePath
        )
        val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        val cfg = OfflineTtsConfig(
            model = OfflineTtsModelConfig(kitten = kitten, numThreads = threads, debug = false, provider = "cpu")
        )
        return OfflineTts(null, cfg)
    }

    /** A downloaded pack: voices.bin means Kokoro, otherwise a Piper (VITS) model. Both read espeak-ng-data from the pack itself. */
    private fun buildPackTts(dir: File): OfflineTts {
        val model = (dir.listFiles() ?: emptyArray()).filter { it.isFile && it.name.endsWith(".onnx") }.minByOrNull { it.name }
            ?: throw IllegalStateException("No model file was found in this voice pack")
        val tokens = File(dir, "tokens.txt")
        if (!tokens.exists()) throw IllegalStateException("This voice pack has no tokens.txt")
        val espeak = File(dir, "espeak-ng-data")
        val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        val voices = File(dir, "voices.bin")
        val mc = if (voices.exists()) {
            val lex = listOf("lexicon-us-en.txt", "lexicon-zh.txt").map { File(dir, it) }.filter { it.exists() }.joinToString(",") { it.absolutePath }
            val dict = File(dir, "dict")
            val kokoro = OfflineTtsKokoroModelConfig(
                model = model.absolutePath,
                voices = voices.absolutePath,
                tokens = tokens.absolutePath,
                dataDir = if (espeak.exists()) espeak.absolutePath else File(modelDir(), "espeak-ng-data").absolutePath,
                dictDir = if (dict.exists()) dict.absolutePath else "",
                lexicon = lex
            )
            OfflineTtsModelConfig(kokoro = kokoro, numThreads = threads, debug = false, provider = "cpu")
        } else {
            val vits = OfflineTtsVitsModelConfig(
                model = model.absolutePath,
                tokens = tokens.absolutePath,
                dataDir = if (espeak.exists()) espeak.absolutePath else File(modelDir(), "espeak-ng-data").absolutePath
            )
            OfflineTtsModelConfig(vits = vits, numThreads = threads, debug = false, provider = "cpu")
        }
        return OfflineTts(null, OfflineTtsConfig(model = mc))
    }

    /** Runs on the worker thread. pack = "builtin" (the bundled Kitten voice) or the id of a downloaded pack. */
    private fun loadNow(pack: String = "builtin"): OfflineTts {
        val want = if (pack.isBlank()) "builtin" else pack
        tts?.let { if (activePack == want) return it }
        // only one model lives in memory: let the old one go before the new one loads
        try { tts?.release() } catch (e: Throwable) { /* already gone */ }
        tts = null
        activePack = ""
        note("Starting the voice...")
        val t = if (want == "builtin") {
            buildTts(ensureUnpacked())
        } else {
            val dir = packDir(cleanId(want))
            if (!packReady(dir)) throw IllegalStateException("That voice is not downloaded on this phone. Download it again from the Voice library")
            if (!File(dir, "espeak-ng-data").exists() && bundledList().isNotEmpty()) ensureUnpacked()
            buildPackTts(dir)
        }
        try {
            sampleRate = t.sampleRate()
            speakers = t.numSpeakers()
            if (sampleRate <= 0 || speakers <= 0) throw IllegalStateException("Voice pack has invalid audio metadata")
        } catch (e: Throwable) { t.release(); throw e }
        tts = t
        activePack = want
        return t
    }

    private fun wavBase64(samples: FloatArray, rate: Int): String {
        val n = samples.size
        val buf = ByteBuffer.allocate(44 + n * 2).order(ByteOrder.LITTLE_ENDIAN)
        buf.put("RIFF".toByteArray()); buf.putInt(36 + n * 2); buf.put("WAVE".toByteArray())
        buf.put("fmt ".toByteArray()); buf.putInt(16); buf.putShort(1); buf.putShort(1)
        buf.putInt(rate); buf.putInt(rate * 2); buf.putShort(2); buf.putShort(16)
        buf.put("data".toByteArray()); buf.putInt(n * 2)
        for (f in samples) {
            val v = (f * 32767f).toInt().coerceIn(-32768, 32767)
            buf.putShort(v.toShort())
        }
        return Base64.encodeToString(buf.array(), Base64.NO_WRAP)
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val o = JSObject()
        o.put("bundled", bundledList().isNotEmpty())
        o.put("unpacked", File(modelDir(), "tokens.txt").exists())
        o.put("loaded", tts != null)
        o.put("pack", activePack)
        call.resolve(o)
    }

    @PluginMethod
    fun load(call: PluginCall) {
        worker.execute {
            val o = JSObject()
            try {
                loadNow(call.getString("pack", "builtin") ?: "builtin")
                o.put("ready", true)
                o.put("sampleRate", sampleRate)
                o.put("speakers", speakers)
            } catch (e: UnsatisfiedLinkError) {
                o.put("ready", false)
                o.put("error", "The voice library is missing from this APK (" + (e.message ?: "link error") + ")")
            } catch (e: Throwable) {
                o.put("ready", false)
                o.put("error", e.message ?: e.javaClass.simpleName)
            }
            call.resolve(o)
        }
    }

    @PluginMethod
    fun synth(call: PluginCall) {
        val text = call.getString("text", "") ?: ""
        val sid = call.getInt("sid", 0) ?: 0
        val speed = (call.getFloat("speed", 1.0f) ?: 1.0f).coerceIn(0.5f, 2.0f)
        val pack = call.getString("pack", "builtin") ?: "builtin"
        if (text.isBlank()) { call.reject("There is no text to speak"); return }
        worker.execute {
            try {
                val t = loadNow(pack)
                val t0 = System.currentTimeMillis()
                if (sid < 0 || sid >= speakers) throw IllegalArgumentException("Speaker $sid is unavailable in $activePack (valid: 0–${speakers - 1})")
                val audio = t.generate(text, sid, speed)
                if (audio.samples.isEmpty()) { call.reject("The voice made no sound"); return@execute }
                val o = JSObject()
                o.put("wav", wavBase64(audio.samples, audio.sampleRate))
                o.put("sampleRate", audio.sampleRate)
                o.put("ms", System.currentTimeMillis() - t0)
                call.resolve(o)
            } catch (e: Throwable) {
                call.reject(e.message ?: e.javaClass.simpleName)
            }
        }
    }

    private fun packNote(id: String, pct: Int, text: String) {
        val o = JSObject()
        o.put("id", id)
        o.put("pct", pct)
        o.put("note", text)
        notifyListeners("packProgress", o)
    }

    @PluginMethod
    fun packs(call: PluginCall) {
        val arr = JSArray()
        (packsRoot().listFiles() ?: emptyArray()).filter { it.isDirectory && !it.name.startsWith(".") && packReady(it) }.sortedBy { it.name }.forEach { arr.put(it.name) }
        val o = JSObject()
        o.put("installed", arr)
        call.resolve(o)
    }

    @PluginMethod
    fun cancelDownload(call: PluginCall) {
        cancelDl = true
        call.resolve()
    }

    @PluginMethod
    fun removePack(call: PluginCall) {
        val id = cleanId(call.getString("id", ""))
        if (id.isEmpty()) { call.reject("No voice pack was named"); return }
        if (downloadingId == id) { call.reject("Wait for this voice download to finish before removing it"); return }
        worker.execute {
            val o = JSObject()
            try {
                if (activePack == id) {
                    try { tts?.release() } catch (e: Throwable) { /* already gone */ }
                    tts = null
                    activePack = ""
                }
                packDir(id).deleteRecursively()
                File(packsRoot(), ".$id.part").deleteRecursively()
                o.put("ok", true)
            } catch (e: Throwable) {
                o.put("ok", false)
                o.put("error", e.message ?: e.javaClass.simpleName)
            }
            call.resolve(o)
        }
    }

    /** Downloads one https .tar.bz2 and unpacks it into files/horizon_packs/<id>. Never leaves a half-unpacked pack behind. */
    @PluginMethod
    fun download(call: PluginCall) {
        val id = cleanId(call.getString("id", ""))
        val url = call.getString("url", "") ?: ""
        if (id.isEmpty()) { call.reject("No voice pack was named"); return }
        if (!url.startsWith("https://")) { call.reject("A voice pack must come from an https address"); return }
        if (!downloading.compareAndSet(false, true)) { call.reject("Another voice download is already running"); return }
        downloadingId = id
        cancelDl = false
        dlWorker.execute {
            val o = JSObject()
            val tmp = File(context.cacheDir, "pack-$id.tar.bz2")
            val stage = File(packsRoot(), ".$id.part")
            try {
                packsRoot().mkdirs()
                tmp.delete()
                stage.deleteRecursively()
                packNote(id, 0, "Downloading: 0%")
                http.newCall(Request.Builder().url(url).header("User-Agent", "Horizon").build()).execute().use { resp ->
                    if (!resp.isSuccessful) throw IllegalStateException("The download server answered " + resp.code + ". The voice link may have moved")
                    val body = resp.body ?: throw IllegalStateException("The download was empty")
                    val total = body.contentLength()
                    var got = 0L
                    var lastPct = -1
                    body.byteStream().use { input ->
                        FileOutputStream(tmp).use { out ->
                            val buf = ByteArray(256 * 1024)
                            while (true) {
                                if (cancelDl) throw IllegalStateException("Cancelled")
                                val n = input.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                                got += n
                                val pct = if (total > 0) (got * 100 / total).toInt() else -1
                                if (pct != lastPct && (pct < 0 || pct % 2 == 0)) {
                                    lastPct = pct
                                    packNote(id, pct, if (pct >= 0) "Downloading: $pct%" else "Downloading: " + (got / (1024 * 1024)) + " MB")
                                }
                            }
                        }
                    }
                }
                if (tmp.length() < 1024) throw IllegalStateException("The download is too small to be a voice")
                packNote(id, -1, "Unpacking, this can take a minute...")
                stage.mkdirs()
                val stageCanon = stage.canonicalPath
                var files = 0
                TarArchiveInputStream(BZip2CompressorInputStream(BufferedInputStream(FileInputStream(tmp), 256 * 1024))).use { tar ->
                    while (true) {
                        if (cancelDl) throw IllegalStateException("Cancelled")
                        val entry = tar.nextTarEntry ?: break
                        // drop the archive's top folder: vits-piper-xxx/tokens.txt -> tokens.txt
                        val rel = entry.name.replace('\\', '/').trimStart('/').substringAfter('/', "")
                        if (rel.isEmpty()) continue
                        val dest = File(stage, rel)
                        if (!dest.canonicalPath.startsWith(stageCanon + File.separator)) continue   // never write outside the pack folder
                        if (entry.isDirectory) { dest.mkdirs(); continue }
                        if (!entry.isFile) continue
                        dest.parentFile?.mkdirs()
                        FileOutputStream(dest).use { out ->
                            val buf = ByteArray(256 * 1024)
                            while (true) {
                                val n = tar.read(buf)
                                if (n < 0) break
                                out.write(buf, 0, n)
                            }
                        }
                        files++
                        if (files % 200 == 0) packNote(id, -1, "Unpacking: $files files...")
                    }
                }
                if (!packReady(stage)) throw IllegalStateException("The archive did not hold a usable voice (no model or tokens.txt)")
                // The download thread NEVER releases an engine in use by synthesis.
                worker.submit(java.util.concurrent.Callable<Boolean> {
                    if (cancelDl) throw IllegalStateException("Cancelled")
                    if (activePack == id) {
                        try { tts?.release() } catch (_: Throwable) { }
                        tts = null; activePack = ""
                    }
                    val dest = packDir(id)
                    val backup = File(packsRoot(), ".$id.previous")
                    backup.deleteRecursively()
                    if (dest.exists() && !dest.renameTo(backup)) throw IllegalStateException("Could not preserve the previous voice")
                    if (!stage.renameTo(dest)) {
                        backup.renameTo(dest)
                        throw IllegalStateException("Could not move the voice into place")
                    }
                    backup.deleteRecursively()
                    true
                }).get()
                o.put("ok", true)
            } catch (e: Throwable) {
                stage.deleteRecursively()
                o.put("ok", false)
                o.put("error", if (e is OutOfMemoryError) "The phone ran out of memory while unpacking" else (e.message ?: e.javaClass.simpleName))
            } finally {
                downloadingId = ""
                downloading.set(false)
                tmp.delete()
            }
            call.resolve(o)
        }
    }

    @PluginMethod
    fun release(call: PluginCall) {
        worker.execute {
            try { tts?.release() } catch (e: Throwable) { /* already gone */ }
            tts = null
            activePack = ""
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        cancelDl = true
        // Drain download/installation first; it may still submit its atomic swap to worker.
        dlWorker.shutdown()
        Thread {
            try { dlWorker.awaitTermination(90, TimeUnit.SECONDS) } catch (_: InterruptedException) { }
            try {
                worker.execute {
                    try { tts?.release() } catch (_: Throwable) { }
                    tts = null; activePack = ""
                }
            } finally { worker.shutdown() }
        }.start()
        super.handleOnDestroy()
    }
}
