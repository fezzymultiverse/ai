package __APPID__;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.media.PlaybackParams;
import java.io.File;
import java.io.FileOutputStream;
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
    private MediaPlayer audio;
    private File audioFile;
    private PluginCall audioCall;
    private boolean audioPrepared = false, audioPaused = false;
    private final Runnable audioTimeout = () -> finishAudio("Voice audio playback timed out");
    private void finishAudio(String error) {
        main.removeCallbacks(audioTimeout);
        PluginCall call = audioCall; audioCall = null; audioPrepared = false; audioPaused = false;
        if (audio != null) { try { audio.reset(); audio.release(); } catch (Exception ignored) { } audio = null; }
        if (audioFile != null) { audioFile.delete(); audioFile = null; }
        if (call != null) { if (error == null) call.resolve(); else call.reject(error); }
    }
    /** Native WAV playback avoids WebView autoplay/AudioContext locks, including background replies. */
    @PluginMethod public void playAudio(PluginCall call) {
        main.post(() -> {
            finishAudio("Speech cancelled");
            try {
                String wav = call.getString("wav", "");
                if (wav.length() > 24000000) { call.reject("Voice audio is too large"); return; }
                byte[] bytes = Base64.decode(wav, Base64.DEFAULT);
                if (bytes.length < 44 || bytes[0] != 'R' || bytes[1] != 'I' || bytes[2] != 'F' || bytes[3] != 'F') { call.reject("Invalid WAV audio"); return; }
                audioCall = call;
                audioFile = File.createTempFile("horizon-voice-", ".wav", getContext().getCacheDir());
                try (FileOutputStream out = new FileOutputStream(audioFile)) { out.write(bytes); }
                final MediaPlayer player = new MediaPlayer(); audio = player;
                player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                player.setDataSource(audioFile.getAbsolutePath());
                player.setVolume(1f, 1f);
                player.setOnPreparedListener(mp -> {
                    if (audio != mp || audioCall != call) return;
                    try {
                        float rate = Math.max(.5f, Math.min(2f, call.getFloat("rate", 1f)));
                        float pitch = Math.max(.5f, Math.min(2f, call.getFloat("pitch", 1f)));
                        if (android.os.Build.VERSION.SDK_INT >= 23) mp.setPlaybackParams(new PlaybackParams().setSpeed(rate).setPitch(pitch));
                        audioPrepared = true;
                        if (audioPaused) return;
                        mp.start();
                        JSObject started = new JSObject(); started.put("id", call.getString("utteranceId", "audio"));
                        notifyListeners("speechStart", started);
                    } catch (Exception e) { finishAudio("Native voice audio failed to start"); }
                });
                player.setOnCompletionListener(mp -> { if (audio == mp) finishAudio(null); });
                player.setOnErrorListener((mp, what, extra) -> { if (audio == mp) finishAudio("Native voice audio error " + what); return true; });
                main.postDelayed(audioTimeout, 300000);
                player.prepareAsync();
            } catch (Exception e) { boolean pending = audioCall != null; finishAudio("Could not play native voice audio"); if (!pending) call.reject("Could not play native voice audio"); }
        });
    }
    @PluginMethod public void pauseAudio(PluginCall call) { main.post(() -> {
        try { audioPaused = true; if (audio != null && audioPrepared && audio.isPlaying()) audio.pause(); main.removeCallbacks(audioTimeout); call.resolve(); }
        catch (Exception e) { call.reject("Could not pause voice audio"); }
    }); }
    @PluginMethod public void resumeAudio(PluginCall call) { main.post(() -> {
        try { audioPaused = false; if (audio != null && audioPrepared) {
            audio.start(); main.removeCallbacks(audioTimeout); main.postDelayed(audioTimeout, 300000);
            if (audioCall != null) { JSObject started = new JSObject(); started.put("id", audioCall.getString("utteranceId", "audio")); notifyListeners("speechStart", started); }
        } call.resolve(); }
        catch (Exception e) { call.reject("Could not resume voice audio"); }
    }); }

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
            if (ready == -2 || ready == -1) initTts(enginePkg);
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
        finishAudio("Speech cancelled");
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
        if (ready != 1 || tts == null) { call.reject("Android speech engine is unavailable. Enable Speech Services and download voice data."); return; }
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
    @PluginMethod public void stop(PluginCall call) { main.post(() -> { cancel(); call.resolve(); }); }
    @Override protected void handleOnDestroy() { main.post(() -> { cancel(); if (tts != null) tts.shutdown(); }); }
}
