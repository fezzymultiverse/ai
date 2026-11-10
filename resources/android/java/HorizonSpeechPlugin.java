package __APPID__;

import android.media.AudioAttributes;
import android.media.MediaPlayer;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.*;
import java.util.concurrent.*;

/** Android's default TTS service only. Direct speech bypasses DSP; effects use private temporary PCM files. */
@CapacitorPlugin(name = "HorizonSpeech")
public class HorizonSpeechPlugin extends Plugin {
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ThreadPoolExecutor worker = new ThreadPoolExecutor(1,1,30,TimeUnit.SECONDS,
        new ArrayBlockingQueue<>(1), r -> { Thread t = new Thread(r,"horizon-voice-dsp"); t.setDaemon(true); return t; });
    private TextToSpeech tts;
    private boolean ready, initializing, destroyed, playbackPaused;
    private int initSeq;
    private volatile int generation;
    private Job active;
    private final List<ReadyJob> waiting = new ArrayList<>();
    private static final long IDLE_MS = 45000;
    private final Runnable idle = () -> { if (active == null && waiting.isEmpty()) shutdownTts(); };
    private final Runnable initTimeout = () -> {
        if (!initializing) return;
        ++initSeq; shutdownTts(); drainReady("Android TTS initialization timed out. Check Android text-to-speech settings.");
    };
    private static final class ReadyJob {
        final PluginCall call; final Runnable run; final int generation; final boolean speech;
        ReadyJob(PluginCall c,Runnable r,int g,boolean s){call=c;run=r;generation=g;speech=s;}
    }
    private static final class Job {
        final PluginCall call; final String id; final Map<String,Float> fx; final boolean render;
        volatile boolean cancelled, processing;
        File input, output; MediaPlayer player; Runnable timeout;
        Job(PluginCall call,String id,Map<String,Float> fx){this.call=call;this.id=id;this.fx=fx;render=HorizonVoiceDsp.enabled(fx);}
        void files(){if(input!=null)input.delete();if(output!=null)output.delete();}
    }
    private static float bounded(Float f,float lo,float hi,float fallback){return f==null || (Float.isNaN(f) || Float.isInfinite(f))?fallback:Math.max(lo,Math.min(hi,f));}
    private void shutdownTts(){
        main.removeCallbacks(idle); main.removeCallbacks(initTimeout);
        if(tts!=null){try{tts.stop();tts.shutdown();}catch(Exception ignored){}tts=null;}
        ready=false;initializing=false;
    }
    private void init(){
        if(initializing || ready || destroyed)return;
        initializing=true;final int seq=++initSeq;
        main.postDelayed(initTimeout,12000);
        try {
            tts=new TextToSpeech(getContext(),status -> main.post(() -> {
                if(destroyed || seq!=initSeq)return;
                main.removeCallbacks(initTimeout);initializing=false;
                if(status!=TextToSpeech.SUCCESS || tts==null){shutdownTts();drainReady("Enable Android's text-to-speech service and download voice data.");return;}
                ready=true;
                tts.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener(){
                    @Override public void onStart(String id){main.post(() -> {Job j=active;if(j!=null && j.id.equals(id) && !j.render) started(j);});}
                    @Override public void onDone(String id){main.post(() -> {Job j=active;if(j==null || !j.id.equals(id))return;if(j.render)process(j);else finish(j,null);});}
                    @Override public void onError(String id){onError(id,-1);}
                    @Override public void onError(String id,int code){main.post(() -> {Job j=active;if(j!=null && j.id.equals(id))finish(j,"Android speech error "+code+". Check installed voice data and media volume.");});}
                    @Override public void onStop(String id,boolean interrupted){main.post(() -> {Job j=active;if(j!=null && j.id.equals(id))finish(j,"Speech cancelled");});}
                });
                drainReady(null);scheduleIdle();
            }));
        }catch(Exception e){shutdownTts();drainReady("Could not initialize Android speech");}
    }
    private void scheduleIdle(){main.removeCallbacks(idle);if(active==null && waiting.isEmpty())main.postDelayed(idle,IDLE_MS);}
    private void drainReady(String error){
        List<ReadyJob> jobs=new ArrayList<>(waiting);waiting.clear();
        for(ReadyJob j:jobs){
            if(error!=null)j.call.reject(error);
            else if(j.speech && j.generation!=generation)j.call.reject("Speech cancelled");
            else try{j.run.run();}catch(Exception e){j.call.reject("Android speech request failed: "+e.getMessage());}
        }
    }
    private void whenReady(PluginCall call,boolean speech,Runnable run){
        final int request=generation;
        main.post(() -> {
            main.removeCallbacks(idle);
            if(destroyed){call.reject("Speech service is closed");return;}
            if(speech && request!=generation){call.reject("Speech cancelled");return;}
            if(ready){try{run.run();}catch(Exception e){call.reject("Android speech request failed: "+e.getMessage());}scheduleIdle();}
            else if(waiting.size()>=16)call.reject("Too many pending speech requests");
            else {waiting.add(new ReadyJob(call,run,request,speech));init();}
        });
    }
    private List<Voice> voices(){Set<Voice> all=tts.getVoices();List<Voice> v=all==null?new ArrayList<>():new ArrayList<>(all);v.sort(Comparator.comparing(Voice::getName));return v;}
    @PluginMethod public void getSupportedVoices(PluginCall call){whenReady(call,false,() -> {
        JSArray result=new JSArray();for(Voice v:voices()){JSObject x=new JSObject();x.put("name",v.getName());x.put("voiceURI",v.getName());x.put("lang",v.getLocale().toLanguageTag());x.put("network",v.isNetworkConnectionRequired());result.put(x);}
        JSObject r=new JSObject();r.put("voices",result);call.resolve(r);
    });}
    @PluginMethod public void getEngines(PluginCall call){whenReady(call,false,() -> {
        JSObject r=new JSObject();String name=tts.getDefaultEngine();r.put("default",name==null?"":name);
        for(TextToSpeech.EngineInfo e:tts.getEngines())if(e.name.equals(name))r.put("label",e.label);
        r.put("engines",new JSArray());r.put("selected","");call.resolve(r);
    });}
    @PluginMethod public void setEngine(PluginCall call){
        if(!call.getString("engine","").isEmpty()){call.reject("Horizon uses Android's default TTS service only. Change it in Android settings.");return;}
        whenReady(call,false,() -> {JSObject r=new JSObject();r.put("engine","");r.put("failed","");call.resolve(r);});
    }
    private void started(Job j){if(active!=j || j.cancelled)return;JSObject event=new JSObject();event.put("id",j.call.getString("utteranceId",j.id));notifyListeners("speechStart",event);}
    private void arm(Job j,long ms){if(j.timeout!=null)main.removeCallbacks(j.timeout);j.timeout=() -> {if(active==j){if(tts!=null)tts.stop();finish(j,"Android speech timed out");}};main.postDelayed(j.timeout,ms);}
    private void finish(Job j,String error){
        if(active!=j)return;active=null;j.cancelled=true;
        if(j.timeout!=null)main.removeCallbacks(j.timeout);
        if(j.player!=null){try{j.player.reset();j.player.release();}catch(Exception ignored){}j.player=null;}
        if(!j.processing)j.files();
        if(error==null)j.call.resolve();else j.call.reject(error);
        scheduleIdle();
    }
    private void cancel(){
        ++generation;playbackPaused=false;
        if(active!=null)finish(active,"Speech cancelled");
        if(tts!=null)tts.stop();
        Iterator<ReadyJob> it=waiting.iterator();while(it.hasNext()){ReadyJob j=it.next();if(j.speech){it.remove();j.call.reject("Speech cancelled");}}
        scheduleIdle();
    }
    @PluginMethod public void speak(PluginCall call){whenReady(call,true,() -> {
        String text=call.getString("text","");
        if(text.trim().isEmpty()){call.reject("Nothing to speak");return;}
        if(text.length()>Math.min(2000,TextToSpeech.getMaxSpeechInputLength()-1)){call.reject("Speech segment is too long");return;}
        String tag=call.getString("lang","en-US");Locale lang=Locale.forLanguageTag(tag);
        if(tts.isLanguageAvailable(lang)<TextToSpeech.LANG_AVAILABLE){call.reject("Language not supported or Android voice data missing: "+tag);return;}
        // Do not route through another model or provider. Android owns voice installation and selection.
        cancel();
        tts.setLanguage(lang);String name=call.getString("voiceName","");int oldIndex=call.getInt("voice",-1);
        List<Voice> available=voices();
        Voice chosen=null;for(Voice v:available)if(v.getName().equals(name)){chosen=v;break;}
        if(chosen==null && name.isEmpty() && oldIndex>=0 && oldIndex<available.size())chosen=available.get(oldIndex);
        if(chosen!=null && tts.setVoice(chosen)==TextToSpeech.ERROR){call.reject("Selected Android voice is unavailable");return;}
        float rate=bounded(call.getFloat("rate",1f),.5f,2f,1f),pitch=bounded(call.getFloat("pitch",1f),.5f,2f,1f);
        tts.setSpeechRate(rate);tts.setPitch(pitch);
        JSObject effects=call.getObject("effects",new JSObject());Map<String,Float> fx=new HashMap<>();
        for(String k:new String[]{"bass","presence","treble","compression","reverb","echo","robot","tune"}){
            double n=effects.optDouble(k,0);fx.put(k,(!Double.isNaN(n) && !Double.isInfinite(n))?(float)Math.max(-12,Math.min(100,n)):0f);
        }
        String id="native-"+UUID.randomUUID(); // Never let caller-supplied/reused IDs settle another request.
        Job j=new Job(call,id,fx);active=j;arm(j,j.render?45000:180000);
        Bundle params=new Bundle();params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME,1f);
        try{
            int result;
            if(j.render){
                j.input=File.createTempFile("hz-android-tts-",".wav",getContext().getCacheDir());
                j.output=File.createTempFile("hz-android-fx-",".wav",getContext().getCacheDir());
                result=tts.synthesizeToFile(text,params,j.input,id);
            }else result=tts.speak(text,TextToSpeech.QUEUE_FLUSH,params,id);
            if(result==TextToSpeech.ERROR)finish(j,"Android rejected speech. Check installed voice data.");
        }catch(Exception e){finish(j,"Could not start Android voice: "+e.getMessage());}
    });}
    private void process(Job j){
        if(j.processing)return;j.processing=true;
        try{worker.execute(() -> {
            String error=null;
            try{HorizonVoiceDsp.render(j.input,j.output,j.fx,() -> j.cancelled);}
            catch(Exception e){error="Voice effects: "+e.getMessage();}
            final String result=error;
            main.post(() -> {
                j.processing=false;
                if(active!=j || j.cancelled){j.files();return;}
                if(result!=null){finish(j,result);return;}
                j.input.delete();play(j);
            });
        });}catch(RejectedExecutionException e){j.processing=false;finish(j,"Voice processor is busy; try again");}
    }
    private void play(Job j){
        try{
            MediaPlayer mp=new MediaPlayer();j.player=mp;
            mp.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build());
            mp.setDataSource(j.output.getAbsolutePath());
            mp.setOnPreparedListener(player -> {if(active!=j || j.cancelled)return;try{arm(j,180000);if(playbackPaused){main.removeCallbacks(j.timeout);return;}player.start();started(j);}catch(Exception e){finish(j,"Could not play processed Android speech");}});
            mp.setOnCompletionListener(player -> finish(j,null));
            mp.setOnErrorListener((player,what,extra) -> {finish(j,"Android voice playback error "+what);return true;});
            mp.prepareAsync();
        }catch(Exception e){finish(j,"Could not play processed Android speech");}
    }
    @PluginMethod public void pauseAudio(PluginCall call){main.post(() -> {
        playbackPaused=true;Job j=active;
        if(j!=null && j.player!=null){try{if(j.player.isPlaying())j.player.pause();if(j.timeout!=null)main.removeCallbacks(j.timeout);}catch(IllegalStateException ignored){/* Preparing: onPrepared honours playbackPaused. */}}
        call.resolve();
    });}
    @PluginMethod public void resumeAudio(PluginCall call){main.post(() -> {
        playbackPaused=false;Job j=active;
        if(j!=null && j.player!=null){try{j.player.start();arm(j,180000);started(j);}catch(IllegalStateException ignored){/* Preparing: onPrepared starts playback. */}}
        call.resolve();
    });}
    @PluginMethod public void stop(PluginCall call){main.post(() -> {cancel();call.resolve();});}
    @Override protected void handleOnResume(){main.post(() -> {if(active==null && !initializing){++initSeq;shutdownTts();}});}
    @Override protected void handleOnDestroy(){main.post(() -> {
        destroyed=true;cancel();++initSeq;shutdownTts();drainReady("Speech service closed");worker.shutdown();
    });}
}
