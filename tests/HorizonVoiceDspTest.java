package test.voice;

import java.io.*;
import java.nio.file.*;
import java.util.*;

/** Standalone JVM signal tests: generated fixtures only, no Android runtime or model required. */
public final class HorizonVoiceDspTest {
    private static int passed;
    private static final HorizonVoiceDsp.Cancel OK=()->false;
    private static void check(boolean condition,String name){if(!condition)throw new AssertionError(name);passed++;System.out.println("PASS "+name);}
    private static float[] sine(int rate,double hz,double volume,double seconds){float[] a=new float[(int)(rate*seconds)];for(int i=0;i<a.length;i++)a[i]=(float)(volume*Math.sin(2*Math.PI*hz*i/rate));return a;}
    private static double rms(float[] a){double e=0;for(float x:a)e+=x*x;return Math.sqrt(e/a.length);}
    private static double rms(float[] a,int lo,int hi){double e=0;for(int i=lo;i<hi;i++)e+=a[i]*a[i];return Math.sqrt(e/(hi-lo));}
    private static double frequency(float[] a,int rate){double first=0,last=0;int crossings=0;for(int i=rate/5;i<a.length-rate/5-1;i++)if(a[i]<=0&&a[i+1]>0){double at=i-a[i]/(double)(a[i+1]-a[i]);if(crossings++==0)first=at;last=at;}return (crossings-1)*rate/(last-first);}
    private static float peak(float[] a){float p=0;for(float x:a)p=Math.max(p,Math.abs(x));return p;}
    private static Map<String,Float> fx(String key,float v){Map<String,Float> s=new HashMap<>();s.put(key,v);return s;}
    private static byte[] wav(float[] pcm,int rate,int channels)throws Exception{
        ByteArrayOutputStream b=new ByteArrayOutputStream();DataOutputStream out=new DataOutputStream(b);
        out.writeBytes("RIFF");out.writeInt(Integer.reverseBytes(36+pcm.length*2*channels));out.writeBytes("WAVEfmt ");out.writeInt(Integer.reverseBytes(16));out.writeShort(Short.reverseBytes((short)1));out.writeShort(Short.reverseBytes((short)channels));out.writeInt(Integer.reverseBytes(rate));out.writeInt(Integer.reverseBytes(rate*2*channels));out.writeShort(Short.reverseBytes((short)(2*channels)));out.writeShort(Short.reverseBytes((short)16));out.writeBytes("data");out.writeInt(Integer.reverseBytes(pcm.length*2*channels));
        for(float x:pcm)for(int ch=0;ch<channels;ch++)out.writeShort(Short.reverseBytes((short)Math.round(x*32767)));return b.toByteArray();
    }
    private interface Task {void run() throws Exception;}
    private static void rejects(Task t,String name)throws Exception{try{t.run();throw new AssertionError(name+" did not reject");}catch(IOException expected){passed++;System.out.println("PASS "+name);}}
    public static void main(String[] args)throws Exception{
        int rate=24000;Map<String,Float> empty=new HashMap<>();
        check(!HorizonVoiceDsp.enabled(empty),"neutral bypasses DSP");
        check(HorizonVoiceDsp.value(fx("bass",Float.NaN),"bass",-12,12)==0,"NaN is neutral");
        check(HorizonVoiceDsp.value(fx("bass",Float.POSITIVE_INFINITY),"bass",-12,12)==0,"infinity is neutral");
        check(HorizonVoiceDsp.value(fx("bass",1000),"bass",-12,12)==12,"native bounds enforced");
        float[] flat=sine(rate,440,.2,1);double raw=rms(flat);HorizonVoiceDsp.process(flat,rate,empty,OK);check(Math.abs(rms(flat)/raw-1)<.02,"neutral gain remains within 2 percent");
        float[] bass=sine(rate,100,.08,1);raw=rms(bass);HorizonVoiceDsp.process(bass,rate,fx("bass",9),OK);check(rms(bass)>raw*2,"low shelf boosts low frequencies");
        float[] bassCut=sine(rate,100,.2,1);raw=rms(bassCut);HorizonVoiceDsp.process(bassCut,rate,fx("bass",-9),OK);check(rms(bassCut)<raw*.55,"low shelf attenuates low frequencies");
        float[] high=sine(rate,8000,.08,1);raw=rms(high);HorizonVoiceDsp.process(high,rate,fx("treble",9),OK);check(rms(high)>raw*2,"high shelf boosts high frequencies");
        float[] mid=sine(rate,1500,.08,1);raw=rms(mid);HorizonVoiceDsp.process(mid,rate,fx("presence",9),OK);check(rms(mid)>raw*2,"presence bell boosts its centre frequency");
        float[] loud=sine(rate,440,.9,1);HorizonVoiceDsp.process(loud,rate,fx("compression",100),OK);check(rms(loud)<.5,"envelope compressor reduces loud signal RMS");
        float[] impulse=new float[rate];impulse[300]=.5f;HorizonVoiceDsp.process(impulse,rate,fx("reverb",90),OK);check(rms(impulse,600,rate)>0.0001,"comb reverb creates a decaying tail");
        float[] echo=new float[rate];echo[300]=.5f;HorizonVoiceDsp.process(echo,rate,fx("echo",100),OK);check(Math.abs(echo[300+(int)(rate*.19)])>.1,"feedback delay creates a 190ms echo");
        float[] robot=sine(rate,440,.2,1);HorizonVoiceDsp.process(robot,rate,fx("robot",100),OK);check(rms(robot)>.05 && Math.abs(robot[301]-flat[301])>.005,"ring modulation changes the signal without silence");
        float[] silence=new float[rate];HorizonVoiceDsp.process(silence,rate,fx("tune",100),OK);check(peak(silence)==0,"pitch-snap does not invent sound from silence");
        float[] tuned=sine(rate,225,.2,1);HorizonVoiceDsp.process(tuned,rate,fx("tune",100),OK);check(rms(tuned)>.08 && peak(tuned)<=.98,"voiced pitch-snap produces finite audible output");
        double snapped=frequency(tuned,rate);check(Math.abs(snapped-220)<1.5,"225 Hz fixture snaps toward A3 (220 Hz), measured "+snapped);
        Map<String,Float> all=new HashMap<>();for(String k:new String[]{"bass","presence","treble"})all.put(k,12f);for(String k:new String[]{"compression","reverb","echo","robot","tune"})all.put(k,100f);
        float[] extreme=sine(rate,200,.95,1);HorizonVoiceDsp.process(extreme,rate,all,OK);boolean finite=true;for(float x:extreme)finite&=Float.isFinite(x);check(finite&&peak(extreme)<=.980001,"all effects at maximum remain finite and peak-limited");
        check(extreme[0]==0&&extreme[extreme.length-1]==0,"short edge fades avoid abrupt clicks");
        for(int type=1;type<=10;type++){
            Map<String,Float> character=fx("character",(float)type);character.put("characterMix",100f);
            float[] a=sine(rate,230,.18,1);float[] b=a.clone();HorizonVoiceDsp.process(a,rate,character,OK);
            boolean finiteChar=true;double difference=0;for(int i=0;i<a.length;i++){finiteChar&=Float.isFinite(a[i]);difference+=Math.abs(a[i]-b[i]);}
            check(finiteChar&&rms(a)>.005&&difference>.01,"character "+type+" audibly transforms finite PCM");
            character.put("bass",9f);float[] eq=sine(rate,100,.08,1);HorizonVoiceDsp.process(eq,rate,character,OK);
            character.put("bass",0f);float[] noEq=sine(rate,100,.08,1);HorizonVoiceDsp.process(noEq,rate,character,OK);
            check(rms(eq)>rms(noEq)*1.5,"character "+type+" remains controllable by downstream EQ");
            float[] quiet=new float[rate/5];HorizonVoiceDsp.process(quiet,rate,character,OK);check(peak(quiet)==0,"character "+type+" preserves silence");
            character.put("characterMix",0f);float[] zero=sine(rate,440,.2,1);HorizonVoiceDsp.process(zero,rate,character,OK);check(Math.abs(rms(zero)/rms(flat)-1)<.02,"character "+type+" zero mix is neutral");
        }
        float[] limited=sine(rate,440,.9,1);HorizonVoiceDsp.process(limited,rate,fx("limiter",100),OK);check(peak(limited)<=.250001,"hard limiter obeys 0.25 ceiling at 100 percent");
        float[] normalized=sine(rate,440,.2,1);HorizonVoiceDsp.process(normalized,rate,fx("normalize",100),OK);check(Math.abs(peak(normalized)-.9)<.002,"normalize targets 0.9 peak");
        float[] zeroNormalize=new float[rate];HorizonVoiceDsp.process(zeroNormalize,rate,fx("normalize",100),OK);check(peak(zeroNormalize)==0,"normalize never invents audio from silence");
        Map<String,Float> normLimit=fx("normalize",100);normLimit.put("limiter",100f);float[] nl=sine(rate,440,.2,1);HorizonVoiceDsp.process(nl,rate,normLimit,OK);check(peak(nl)<=.250001,"limiter ceiling survives normalization");
        float[] human=sine(rate,440,.2,1);HorizonVoiceDsp.process(human,rate,fx("humanize",100),OK);double hdiff=0;for(int i=0;i<human.length;i++)hdiff+=Math.abs(human[i]-flat[i]);check(hdiff>10&&rms(human)>.1,"humanize changes microtiming without losing speech energy");
        float[] hiss=sine(rate,8000,.3,1);raw=rms(hiss);HorizonVoiceDsp.process(hiss,rate,fx("deesser",100),OK);check(rms(hiss)<raw*.8,"de-esser reduces strong high-frequency sibilance");
        float[] lowDeess=sine(rate,150,.2,1);raw=rms(lowDeess);HorizonVoiceDsp.process(lowDeess,rate,fx("deesser",100),OK);check(rms(lowDeess)>raw*.9,"de-esser preserves low-frequency speech body");
        float[] gated=sine(rate,440,.002,1);raw=rms(gated);HorizonVoiceDsp.process(gated,rate,fx("noiseGate",100),OK);check(rms(gated)<raw*.2,"noise gate attenuates sub-threshold noise");
        float[] saturation=sine(rate,440,.2,1);HorizonVoiceDsp.process(saturation,rate,fx("saturation",100),OK);check(rms(saturation)>rms(flat)*1.4&&peak(saturation)<.98,"saturation adds bounded harmonic drive");
        for(String k:new String[]{"characterMix","limiter","normalize","humanize","deesser","noiseGate","saturation"})all.put(k,100f);
        all.put("character",8f);
        for(int hz:new int[]{8000,16000,22050,24000,44100,48000}){float[] a=sine(hz,200,.2,.3);HorizonVoiceDsp.process(a,hz,all,OK);boolean good=true;for(float x:a)good&=Float.isFinite(x)&&Math.abs(x)<=.250001;check(good,"new effects combined stable at "+hz+" Hz");}
        Path dir=Files.createTempDirectory("horizon-dsp-test-");File input=dir.resolve("in.wav").toFile(),output=dir.resolve("out.wav").toFile();
        try{
            Files.write(input.toPath(),wav(sine(rate,440,.2,1),rate,1));HorizonVoiceDsp.render(input,output,fx("reverb",30),OK);check(output.length()>input.length(),"WAV render includes reverb tail");
            byte[] bytes=Files.readAllBytes(output.toPath());check(new String(bytes,0,4,"US-ASCII").equals("RIFF")&&new String(bytes,8,4,"US-ASCII").equals("WAVE"),"output is a WAV container");
            Files.write(input.toPath(),wav(sine(rate,440,.2,1),rate,2));HorizonVoiceDsp.render(input,output,fx("bass",3),OK);check(output.length()==44+2*rate,"stereo input downmixes to bounded mono PCM");
            Files.write(input.toPath(),new byte[44]);rejects(()->HorizonVoiceDsp.render(input,output,empty,OK),"malformed WAV rejected");
            bytes=wav(sine(rate,440,.2,1),rate,1);bytes[40]=(byte)255;bytes[41]=(byte)255;bytes[42]=(byte)255;bytes[43]=(byte)255;Files.write(input.toPath(),bytes);rejects(()->HorizonVoiceDsp.render(input,output,empty,OK),"overflow/truncated chunk length rejected");
            bytes=wav(sine(rate,440,.2,1),rate,1);bytes[34]=32;Files.write(input.toPath(),bytes);rejects(()->HorizonVoiceDsp.render(input,output,empty,OK),"unsupported PCM encoding rejected with direct-speech escape route");
            Files.write(input.toPath(),wav(sine(rate,440,.2,31),rate,1));rejects(()->HorizonVoiceDsp.render(input,output,empty,OK),"overlong processing input rejected");
            try(RandomAccessFile large=new RandomAccessFile(input,"rw")){large.setLength(HorizonVoiceDsp.MAX_BYTES+1L);}rejects(()->HorizonVoiceDsp.render(input,output,empty,OK),"oversized processing input rejected before allocating PCM");
            Files.write(input.toPath(),wav(sine(rate,440,.2,1),rate,1));rejects(()->HorizonVoiceDsp.render(input,output,empty,()->true),"cancellation prevents processing");
            for(int hz:new int[]{8000,16000,22050,24000,44100,48000}){float[] a=sine(hz,200,.2,.2);HorizonVoiceDsp.process(a,hz,all,OK);boolean good=true;for(float x:a)good&=Float.isFinite(x)&&Math.abs(x)<=.980001;check(good,"DSP stable at "+hz+" Hz");}
        }finally{input.delete();output.delete();Files.deleteIfExists(dir);}
        System.out.println("RESULT "+passed+" DSP tests passed");
    }
}
