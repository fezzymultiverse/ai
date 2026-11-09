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
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import java.io.File
import java.io.FileOutputStream
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
    private var sampleRate = 24000
    private var speakers = 0

    private fun modelDir(): File = File(context.filesDir, ASSET_DIR)

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

    /** Runs on the worker thread. */
    private fun loadNow(): OfflineTts {
        tts?.let { return it }
        note("Starting the voice...")
        val dir = ensureUnpacked()
        val t = buildTts(dir)
        tts = t
        sampleRate = t.sampleRate()
        speakers = t.numSpeakers()
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
        call.resolve(o)
    }

    @PluginMethod
    fun load(call: PluginCall) {
        worker.execute {
            val o = JSObject()
            try {
                loadNow()
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
        if (text.isBlank()) { call.reject("There is no text to speak"); return }
        worker.execute {
            try {
                val t = loadNow()
                val t0 = System.currentTimeMillis()
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

    @PluginMethod
    fun release(call: PluginCall) {
        worker.execute {
            try { tts?.release() } catch (e: Throwable) { /* already gone */ }
            tts = null
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        try { tts?.release() } catch (e: Throwable) { /* process is ending */ }
        tts = null
        super.handleOnDestroy()
    }
}
