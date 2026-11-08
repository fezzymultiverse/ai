package __APPID__;

import android.media.AudioAttributes;
import android.util.Base64;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.*;

/** Speech readiness, cancellation and start events are explicit; never report queued speech as audible. */
@CapacitorPlugin(name = "HorizonSpeech")
public class HorizonSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private TextToSpeech tts;
    private int generation = 0;
    private int ready = 0; // 0 initializing, 1 ready, -1 unavailable, -2 released while idle (restarts on the next request)
    private int initSeq = 0;
    private String enginePkg = "";      // "" = the phone's default speech engine
    private String failedEngine = "";   // an engine that would not start (the plugin fell back to the default)
    private final Map<String, PluginCall> pending = new HashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();
    private static final long IDLE_RELEASE_MS = 45000;
    private final Runnable releaseTask = () -> {
        // A third-party engine app (Kokoro, Samsung...) stays alive while this object is bound to it. Let it go when idle.
        if (!enginePkg.isEmpty() && pending.isEmpty() && tts != null && ready == 1) {
            try { tts.shutdown(); } catch (Exception ignored) { }
            tts = null; ready = -2;
        }
    };
    @Override public void load() { main.post(() -> initTts("")); }
    /** Creates the engine object. Must run on the main thread. A stale init callback (older seq) is ignored. */
    private void initTts(String pkg) {
        main.removeCallbacks(releaseTask);
        final int seq = ++initSeq;
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) { } tts = null; }
        ready = 0;
        try {
            TextToSpeech.OnInitListener l = status -> main.post(() -> onInit(status, pkg, seq));
            tts = pkg.isEmpty() ? new TextToSpeech(getContext(), l) : new TextToSpeech(getContext(), l, pkg);
        } catch (Exception e) { tts = null; onInit(TextToSpeech.ERROR, pkg, seq); }
    }
    private void onInit(int status, String pkg, int seq) {
        if (seq != initSeq) return;
        if (status != TextToSpeech.SUCCESS) {
            if (!pkg.isEmpty()) { failedEngine = pkg; enginePkg = ""; initTts(""); return; }   // fall back to the default; queued jobs keep waiting
            ready = -1;
        } else {
            ready = 1;
            tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override public void onStart(String id) { main.post(() -> {
                    JSObject o = new JSObject(); o.put("id", id); notifyListeners("speechStart", o);
                }); }
                @Override public void onDone(String id) { main.post(() -> finish(id, null)); }
                @Override public void onError(String id) { main.post(() -> finish(id, "Android could not speak. Check your installed voice data and media volume.")); }
                @Override public void onError(String id, int code) { main.post(() -> finish(id, "Android speech error " + code + ". Check Speech Services and downloaded voice data.")); }
                @Override public void onStop(String id, boolean interrupted) { main.post(() -> finish(id, "Speech cancelled")); }
            });
        }
        List<Runnable> jobs = new ArrayList<>(waiting); waiting.clear();
        for (Runnable r : jobs) r.run();
    }
    private void whenReady(PluginCall call, Runnable run) {
        main.post(() -> {
            main.removeCallbacks(releaseTask);
            if (ready == -2) initTts(enginePkg);
            Runnable job = () -> {
                if (ready != 1 || tts == null) call.reject("No Android speech engine is ready. Install or enable Speech Services and download a voice in Android Text-to-speech settings.");
                else { try { run.run(); } catch (Exception e) { call.reject(e.toString()); } }
            };
            if (ready != 0) job.run();
            else {
                waiting.add(job);
                main.postDelayed(() -> { if (waiting.remove(job)) call.reject("Android speech initialization timed out. Check Text-to-speech settings and voice data."); }, 12000);
            }
        });
    }
    private List<Voice> voices() {
        Set<Voice> all = tts.getVoices();
        List<Voice> list = all == null ? new ArrayList<>() : new ArrayList<>(all);
        list.sort(Comparator.comparing(Voice::getName)); return list;
    }
    private void finish(String id, String error) {
        PluginCall c = pending.remove(id);
        if (c != null) { if (error == null) c.resolve(); else c.reject(error); }
        if (pending.isEmpty() && !enginePkg.isEmpty()) { main.removeCallbacks(releaseTask); main.postDelayed(releaseTask, IDLE_RELEASE_MS); }
    }
    private void cancel() {
        generation++;
        if (tts != null) tts.stop();
        for (String id : new ArrayList<>(pending.keySet())) finish(id, "Speech cancelled");
    }
    private void afterInit(PluginCall call, Runnable r) {
        waiting.add(r);
        main.postDelayed(() -> { if (waiting.remove(r)) call.reject("The speech engine took too long to start."); }, 12000);
    }
    private void resolveEngine(PluginCall call) {
        JSObject o = new JSObject();
        o.put("engine", enginePkg); o.put("failed", failedEngine);
        call.resolve(o);
    }
    /** Every speech engine installed on the phone (Google, Samsung, a Kokoro engine app...). */
    @PluginMethod public void getEngines(PluginCall call) { whenReady(call, () -> {
        JSArray a = new JSArray();
        for (TextToSpeech.EngineInfo e : tts.getEngines()) { JSObject o = new JSObject(); o.put("name", e.name); o.put("label", e.label == null ? e.name : e.label); a.put(o); }
        JSObject r = new JSObject(); r.put("engines", a);
        String def = tts.getDefaultEngine(); r.put("default", def == null ? "" : def); r.put("selected", enginePkg);
        call.resolve(r);
    }); }
    /** Switch engine ("" = phone default). If the engine will not start, it falls back to the default and reports failed. */
    @PluginMethod public void setEngine(PluginCall call) {
        final String want = call.getString("engine", "").trim();
        main.post(() -> {
            Runnable go = new Runnable() { @Override public void run() {
                if (want.equals(enginePkg) && ready == 1) { resolveEngine(call); return; }
                if (!want.isEmpty() && ready == 1 && tts != null) {
                    boolean found = false;
                    for (TextToSpeech.EngineInfo e : tts.getEngines()) if (want.equals(e.name)) found = true;
                    if (!found) { call.reject("That speech engine is not installed on this phone."); return; }
                }
                cancel(); enginePkg = want; failedEngine = "";
                initTts(want);
                afterInit(call, () -> resolveEngine(call));
            } };
            if (ready == 0) afterInit(call, go); else go.run();
        });
    }
    @PluginMethod public void getSupportedVoices(PluginCall call) { whenReady(call, () -> {
        JSArray a = new JSArray();
        for (Voice v : voices()) { JSObject o = new JSObject(); o.put("name", v.getName()); o.put("voiceURI", v.getName()); o.put("lang", v.getLocale().toLanguageTag()); a.put(o); }
        JSObject r = new JSObject(); r.put("voices", a); call.resolve(r);
    }); }
    @PluginMethod public void speak(PluginCall call) { final int requestedGeneration = generation; whenReady(call, () -> {
        if (requestedGeneration != generation) { call.reject("Speech cancelled"); return; }
        String text = call.getString("text", "");
        if (text.trim().isEmpty()) { call.reject("Nothing to speak"); return; }
        Locale lang = Locale.forLanguageTag(call.getString("lang", "en-US"));
        int support = tts.isLanguageAvailable(lang);
        if (support < TextToSpeech.LANG_AVAILABLE) { call.reject("Language not supported or voice data missing: " + lang.toLanguageTag()); return; }
        cancel(); tts.setLanguage(lang);
        List<Voice> list = voices(); int index = call.getInt("voice", -1);
        if (index >= 0 && index < list.size()) tts.setVoice(list.get(index));
        tts.setSpeechRate(call.getFloat("rate", 1f)); tts.setPitch(call.getFloat("pitch", 1f));
        Bundle params = new Bundle(); params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, 1f);
        String id = call.getString("utteranceId", UUID.randomUUID().toString()); pending.put(id, call);
        if (tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, id) == TextToSpeech.ERROR) finish(id, "Android rejected speech. Check installed voice data.");
    }); }
    /** V1.62.0: Microsoft Edge neural voice (no key). Returns { data: base64 mp3 }. */
    @PluginMethod public void edgeSynth(PluginCall call) {
        final String text = call.getString("text", ""), voice = call.getString("voice", "en-US-AvaMultilingualNeural");
        final int rate = call.getInt("rate", 0), pitch = call.getInt("pitch", 0);
        if (text == null || text.trim().isEmpty()) { call.reject("Nothing to say"); return; }
        new Thread(() -> {
            try {
                byte[] mp3 = HorizonEdgeTts.synth(text, voice, rate, pitch, call.getString("token", ""), call.getString("ver", ""));
                JSObject o = new JSObject(); o.put("data", Base64.encodeToString(mp3, Base64.NO_WRAP));
                call.resolve(o);
            } catch (Throwable e) { call.reject(e.getMessage() == null ? e.toString() : e.getMessage()); }
        }).start();
    }
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { cancel(); call.resolve(); }); }
    @Override protected void handleOnDestroy() { main.post(() -> { cancel(); if (tts != null) tts.shutdown(); }); }
}
