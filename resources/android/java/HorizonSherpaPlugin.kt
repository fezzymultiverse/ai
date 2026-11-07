package __APPID__

import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.k2fsa.sherpa.onnx.OfflineTts
import com.k2fsa.sherpa.onnx.OfflineTtsConfig
import com.k2fsa.sherpa.onnx.OfflineTtsModelConfig
import com.k2fsa.sherpa.onnx.OfflineTtsVitsModelConfig
import org.apache.commons.compress.archivers.tar.TarArchiveInputStream
import org.apache.commons.compress.compressors.bzip2.BZip2CompressorInputStream
import java.io.BufferedInputStream
import java.io.File
import java.io.FilterInputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.Executors

/**
 * V1.37.0: offline neural voices (Piper) through sherpa-onnx. V1.44.0: Kokoro removed.
 * Models download once from the k2-fsa/sherpa-onnx "tts-models" release into app storage, then run fully offline.
 * synthesize() returns a WAV (base64) that the web side plays through its existing audio path.
 */
@CapacitorPlugin(name = "HorizonSherpa")
class HorizonSherpaPlugin : Plugin() {
    private class Model(val id: String, val name: String, val file: String, val kind: String, val mb: Int, val speakers: Int)

    private val base = "https://github.com/k2-fsa/sherpa-onnx/releases/download/tts-models/"
    private val catalog = listOf(
        Model("piper-amy-low", "Amy, US female (small, fast)", "vits-piper-en_US-amy-low", "vits", 65, 1),
        Model("piper-lessac-medium", "Lessac, US (clear, natural)", "vits-piper-en_US-lessac-medium", "vits", 80, 1),
        Model("piper-ryan-medium", "Ryan, US male", "vits-piper-en_US-ryan-medium", "vits", 80, 1),
        Model("piper-alan-medium", "Alan, UK male", "vits-piper-en_GB-alan-medium", "vits", 80, 1)
    )

    private val worker = Executors.newSingleThreadExecutor()
    private val loader = Executors.newSingleThreadExecutor()
    @Volatile private var engine: OfflineTts? = null
    @Volatile private var engineId: String = ""
    @Volatile private var downloading = false
    @Volatile private var cancelDownload = false

    private fun root(): File = File(context.filesDir, "sherpa").apply { mkdirs() }
    private fun dirOf(m: Model) = File(root(), m.id)
    private fun installed(m: Model) = File(dirOf(m), "tokens.txt").isFile && (dirOf(m).listFiles { f -> f.name.endsWith(".onnx") }?.isNotEmpty() == true)
    private fun find(id: String?) = catalog.firstOrNull { it.id == id }

    @PluginMethod
    fun status(call: PluginCall) {
        // V1.44.0: Kokoro is gone. Remove a copy downloaded by an older version so its space comes back.
        worker.execute { try { File(root(), "kokoro-en-v0_19").takeIf { it.exists() }?.deleteRecursively() } catch (t: Throwable) { /* next status call tries again */ } }
        val out = JSObject()
        var available = true
        try { Class.forName("com.k2fsa.sherpa.onnx.OfflineTts") } catch (t: Throwable) { available = false }
        val arr = JSArray()
        for (m in catalog) {
            val o = JSObject()
            o.put("id", m.id); o.put("name", m.name); o.put("sizeMB", m.mb); o.put("speakers", m.speakers)
            o.put("installed", installed(m))
            arr.put(o)
        }
        out.put("available", available)
        out.put("downloading", downloading)
        out.put("models", arr)
        call.resolve(out)
    }

    private fun progress(id: String, pct: Int, phase: String) {
        val o = JSObject(); o.put("id", id); o.put("pct", pct); o.put("phase", phase)
        notifyListeners("sherpaProgress", o)
    }

    private class Counting(i: InputStream, val onBytes: (Long) -> Unit) : FilterInputStream(i) {
        var n = 0L
        override fun read(): Int { val r = super.read(); if (r >= 0) { n++; onBytes(n) }; return r }
        override fun read(b: ByteArray, off: Int, len: Int): Int { val r = super.read(b, off, len); if (r > 0) { n += r; onBytes(n) }; return r }
    }

    @PluginMethod
    fun download(call: PluginCall) {
        val m = find(call.getString("id")) ?: run { call.reject("Unknown voice"); return }
        if (downloading) { call.reject("Another voice is already downloading"); return }
        downloading = true; cancelDownload = false
        loader.execute {
            val part = File(root(), m.id + ".part")
            try {
                part.deleteRecursively(); part.mkdirs()
                val conn = URL(base + m.file + ".tar.bz2").openConnection() as HttpURLConnection
                conn.instanceFollowRedirects = true
                conn.connectTimeout = 20000; conn.readTimeout = 30000
                if (conn.responseCode !in 200..299) throw RuntimeException("Download failed (HTTP " + conn.responseCode + ")")
                val total = conn.contentLengthLong.let { if (it > 0) it else m.mb * 1024L * 1024L }
                var last = -1
                val counting = Counting(BufferedInputStream(conn.inputStream, 1 shl 16)) { n ->
                    if (cancelDownload) throw RuntimeException("Download cancelled")
                    val pct = (n * 100 / total).toInt().coerceIn(0, 99)
                    if (pct != last) { last = pct; progress(m.id, pct, "download") }
                }
                val canonical = part.canonicalPath + File.separator
                TarArchiveInputStream(BZip2CompressorInputStream(counting)).use { tar ->
                    while (true) {
                        val e = tar.nextTarEntry ?: break
                        val rel = e.name.substringAfter('/', "")          // drop the top folder
                        if (rel.isEmpty()) continue
                        val out = File(part, rel).canonicalFile
                        if (!out.path.startsWith(canonical)) continue    // never write outside the model folder
                        if (e.isDirectory) { out.mkdirs(); continue }
                        out.parentFile?.mkdirs()
                        out.outputStream().use { o -> tar.copyTo(o, 1 shl 16) }
                    }
                }
                progress(m.id, 100, "install")
                if (!File(part, "tokens.txt").isFile || part.listFiles { f -> f.name.endsWith(".onnx") }.isNullOrEmpty())
                    throw RuntimeException("The download did not contain a usable voice")
                val dest = dirOf(m)
                if (engineId == m.id) { engine?.release(); engine = null; engineId = "" }
                dest.deleteRecursively()
                if (!part.renameTo(dest)) throw RuntimeException("Could not store the voice")
                progress(m.id, 100, "done")
                call.resolve(JSObject().put("id", m.id))
            } catch (t: Throwable) {
                part.deleteRecursively()
                call.reject((t.message ?: t.javaClass.simpleName))
            } finally {
                downloading = false
            }
        }
    }

    @PluginMethod
    fun cancel(call: PluginCall) { cancelDownload = true; call.resolve() }

    @PluginMethod
    fun remove(call: PluginCall) {
        val m = find(call.getString("id")) ?: run { call.reject("Unknown voice"); return }
        worker.execute {
            try {
                if (engineId == m.id) { engine?.release(); engine = null; engineId = "" }
                dirOf(m).deleteRecursively()
                call.resolve()
            } catch (t: Throwable) { call.reject(t.message ?: "Could not remove the voice") }
        }
    }

    private fun load(m: Model): OfflineTts {
        if (engine != null && engineId == m.id) return engine!!
        engine?.release(); engine = null; engineId = ""
        val dir = dirOf(m)
        if (!installed(m)) throw RuntimeException("That voice is not downloaded yet")
        val onnx = dir.listFiles { f -> f.name.endsWith(".onnx") }!!.maxByOrNull { it.length() }!!
        val tokens = File(dir, "tokens.txt").path
        val data = File(dir, "espeak-ng-data").path
        val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 4)
        val model = OfflineTtsModelConfig(
            vits = OfflineTtsVitsModelConfig(model = onnx.path, tokens = tokens, dataDir = data),
            numThreads = threads, debug = false, provider = "cpu")
        val tts = OfflineTts(config = OfflineTtsConfig(model = model))
        engine = tts; engineId = m.id
        return tts
    }

    private fun wav(samples: FloatArray, rate: Int): ByteArray {
        val n = samples.size
        val bb = ByteBuffer.allocate(44 + n * 2).order(ByteOrder.LITTLE_ENDIAN)
        bb.put("RIFF".toByteArray()); bb.putInt(36 + n * 2); bb.put("WAVE".toByteArray())
        bb.put("fmt ".toByteArray()); bb.putInt(16); bb.putShort(1); bb.putShort(1)
        bb.putInt(rate); bb.putInt(rate * 2); bb.putShort(2); bb.putShort(16)
        bb.put("data".toByteArray()); bb.putInt(n * 2)
        for (s in samples) bb.putShort((s.coerceIn(-1f, 1f) * 32767f).toInt().toShort())
        return bb.array()
    }

    @PluginMethod
    fun synthesize(call: PluginCall) {
        val m = find(call.getString("id")) ?: run { call.reject("Unknown voice"); return }
        val text = call.getString("text") ?: ""
        val sidIn = call.getInt("sid") ?: 0
        val speed = (call.getFloat("speed") ?: 1f).coerceIn(0.5f, 2f)
        if (text.isBlank()) { call.reject("Nothing to say"); return }
        worker.execute {
            try {
                val tts = load(m)
                val sid = sidIn.coerceIn(0, (tts.numSpeakers() - 1).coerceAtLeast(0))
                val audio = tts.generate(text = text, sid = sid, speed = speed)
                val bytes = wav(audio.samples, audio.sampleRate)
                val out = JSObject()
                out.put("wav", Base64.encodeToString(bytes, Base64.NO_WRAP))
                out.put("sampleRate", audio.sampleRate)
                call.resolve(out)
            } catch (t: Throwable) {
                call.reject(t.message ?: t.javaClass.simpleName)
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) { call.resolve() }

    override fun handleOnDestroy() {
        try { engine?.release() } catch (_: Throwable) { }
        engine = null
        super.handleOnDestroy()
    }
}
