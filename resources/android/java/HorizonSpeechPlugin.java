package __APPID__;

import android.media.AudioAttributes;
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
    private int ready = 0; // 0 initializing, 1 ready, -1 unavailable
    private final Map<String, PluginCall> pending = new HashMap<>();
    private final List<Runnable> waiting = new ArrayList<>();
    @Override public void load() {
        main.post(() -> {
            try {
                tts = new TextToSpeech(getContext(), status -> main.post(() -> {
                    ready = status == TextToSpeech.SUCCESS ? 1 : -1;
                    if (ready == 1) {
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
                }));
            } catch (Exception e) { ready = -1; }
        });
    }
    private void whenReady(PluginCall call, Runnable run) {
        main.post(() -> {
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
    }
    private void cancel() {
        generation++;
        if (tts != null) tts.stop();
        for (String id : new ArrayList<>(pending.keySet())) finish(id, "Speech cancelled");
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
