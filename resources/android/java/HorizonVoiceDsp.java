package __APPID__;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;

/** Local, bounded PCM processing. No network, models, microphone, JNI or third-party audio library. */
public final class HorizonVoiceDsp {
    private HorizonVoiceDsp() { }
    public interface Cancel { boolean cancelled(); }
    public static final int MAX_BYTES = 8 * 1024 * 1024;
    private static final String[] FX = {"bass", "presence", "treble", "compression", "reverb", "echo", "robot", "tune", "characterMix", "limiter", "normalize", "humanize", "deesser", "noiseGate", "saturation"};
    public static float value(Map<String, Float> settings, String key, float low, float high) {
        Float n = settings.get(key);
        return n == null || (Float.isNaN(n) || Float.isInfinite(n)) ? 0 : Math.max(low, Math.min(high, n));
    }
    public static boolean enabled(Map<String, Float> settings) {
        for (String key : FX) if (Math.abs(value(settings, key, key.equals("bass") || key.equals("presence") || key.equals("treble") ? -12 : 0, key.equals("bass") || key.equals("presence") || key.equals("treble") ? 12 : 100)) > .001f) return true;
        return false;
    }
    private static void check(Cancel cancel) throws InterruptedIOException {
        if (Thread.currentThread().isInterrupted() || cancel.cancelled()) throw new InterruptedIOException("Speech cancelled");
    }
    private static String four(RandomAccessFile f) throws IOException {
        byte[] b = new byte[4]; f.readFully(b); return new String(b, StandardCharsets.US_ASCII);
    }
    private static long u32(RandomAccessFile f) throws IOException { return (Integer.reverseBytes(f.readInt()) & 0xffffffffL); }
    private static int u16(RandomAccessFile f) throws IOException { return (Short.reverseBytes(f.readShort()) & 0xffff); }
    private static void le16(RandomAccessFile f, int n) throws IOException { f.writeShort(Short.reverseBytes((short)n)); }
    private static void le32(RandomAccessFile f, int n) throws IOException { f.writeInt(Integer.reverseBytes(n)); }
    private static void ascii(RandomAccessFile f, String s) throws IOException { f.write(s.getBytes(StandardCharsets.US_ASCII)); }

    public static void render(File input, File output, Map<String, Float> settings, Cancel cancel) throws IOException {
        check(cancel);
        float[] pcm; int rate;
        try (RandomAccessFile f = new RandomAccessFile(input, "r")) {
            if (f.length() < 44 || f.length() > MAX_BYTES) throw new IOException("Android voice WAV exceeds the safe size limit");
            if (!four(f).equals("RIFF")) throw new IOException("Android engine did not return WAV audio");
            long riffEnd = 8 + u32(f);
            if (riffEnd > f.length() || riffEnd < 44 || !four(f).equals("WAVE")) throw new IOException("Malformed Android WAV header");
            int format = 0, channels = 0, bits = 0, block = 0; rate = 0;
            long data = -1, size = 0;
            while (f.getFilePointer() + 8 <= riffEnd) {
                String name = four(f); long length = u32(f), at = f.getFilePointer();
                if (length > riffEnd - at) throw new IOException("Truncated Android WAV chunk");
                if (name.equals("fmt ")) {
                    if (length < 16) throw new IOException("Invalid WAV format chunk");
                    format = u16(f); channels = u16(f); long hz = u32(f); u32(f); block = u16(f); bits = u16(f);
                    if (hz < 8000 || hz > 48000) throw new IOException("Unsupported Android speech sample rate");
                    rate = (int)hz;
                } else if (name.equals("data")) { data = at; size = length; }
                long next = at + length + (length & 1);
                if (next > riffEnd) throw new IOException("Invalid WAV chunk padding");
                f.seek(next);
            }
            if (format != 1 || bits != 16 || channels < 1 || channels > 2 || block != channels * 2 || data < 0 || rate == 0 || size % block != 0 || size < block)
                throw new IOException("Effects need 16-bit PCM WAV from your Android engine. Reset effects to use direct speech.");
            int samples = (int)(size / block);
            if (samples > rate * 30) throw new IOException("Speech effect segment exceeds 30 seconds; use neutral or a faster voice");
            int tail = (value(settings,"reverb",0,100) > 0 || value(settings,"echo",0,100) > 0) ? (int)(rate * .7) : 0;
            pcm = new float[samples + tail];
            f.seek(data);
            byte[] buffer = new byte[8192]; int done = 0;
            while (done < samples) {
                check(cancel); int count = Math.min(samples - done, buffer.length / block);
                f.readFully(buffer, 0, count * block);
                for (int j = 0; j < count; j++) {
                    int sum = 0;
                    for (int c = 0; c < channels; c++) { int off = j * block + c * 2; sum += (short)((buffer[off] & 255) | (buffer[off + 1] << 8)); }
                    pcm[done++] = sum / (32768f * channels);
                }
            }
        }
        process(pcm, rate, settings, cancel);
        check(cancel);
        try (RandomAccessFile f = new RandomAccessFile(output, "rw")) {
            f.setLength(0);
            ascii(f,"RIFF"); le32(f,36 + pcm.length * 2); ascii(f,"WAVEfmt "); le32(f,16);
            le16(f,1); le16(f,1); le32(f,rate); le32(f,rate * 2); le16(f,2); le16(f,16);
            ascii(f,"data"); le32(f,pcm.length * 2);
            byte[] buffer = new byte[8192]; int used = 0;
            for (int i = 0; i < pcm.length; i++) {
                if ((i & 4095) == 0) check(cancel);
                int s = Math.round(Math.max(-.98f,Math.min(.98f,pcm[i])) * 32767);
                buffer[used++] = (byte)s; buffer[used++] = (byte)(s >> 8);
                if (used == buffer.length) { f.write(buffer); used = 0; }
            }
            if (used > 0) f.write(buffer,0,used);
        } catch (IOException e) { output.delete(); throw e; }
    }

    /** Three RBJ biquads, envelope compressor, ring modulation, damped comb room and feedback delay. */
    static void process(float[] pcm, int rate, Map<String, Float> s, Cancel cancel) throws IOException {
        // Transform a single synthesized stream BEFORE the user EQ; never mix a second TTS player.
        int character = Math.round(value(s,"character",0,10));
        float mix = value(s,"characterMix",0,100) / 100;
        if (character > 0 && mix > 0) shapeCharacter(pcm,rate,character,mix,cancel);
        float humanize = value(s,"humanize",0,100) / 100;
        if (humanize > 0) humanize(pcm,rate,humanize,cancel);
        float tune = value(s,"tune",0,100) / 100;
        if (tune > 0) snapPitch(pcm,rate,tune,cancel);
        Biquad bass = Biquad.shelf(rate,180,value(s,"bass",-12,12),false);
        Biquad mid = Biquad.peak(rate,1500,value(s,"presence",-12,12));
        Biquad high = Biquad.shelf(rate,Math.min(5000,rate * .4),value(s,"treble",-12,12),true);
        double comp = value(s,"compression",0,100) / 100.0, room = value(s,"reverb",0,100) / 100.0;
        double echo = value(s,"echo",0,100) / 100.0, robot = value(s,"robot",0,100) / 100.0;
        double env = 0, attack = Math.exp(-1.0 / (.004 * rate)), release = Math.exp(-1.0 / (.085 * rate));
        double ratio = 1 + 7 * comp, threshold = .24, makeup = 1 + .7 * comp;
        float[][] comb = room > 0 ? new float[][] {new float[(int)(rate*.0297)],new float[(int)(rate*.0371)],new float[(int)(rate*.0411)],new float[(int)(rate*.0437)]} : null;
        int[] pointers = new int[4]; double[] damp = new double[4];
        float[] delay = echo > 0 ? new float[(int)(rate*.19)] : null; int dp = 0;
        double step = 2*Math.PI*73/rate, phase = 0;
        double deess = value(s,"deesser",0,100)/100.0, gate = value(s,"noiseGate",0,100)/100.0;
        double saturation = value(s,"saturation",0,100)/100.0;
        double deessLow = 0, sibEnv = 0, gateEnv = 0, gateGain = 1;
        double split = 1-Math.exp(-2*Math.PI*Math.min(3600,rate*.36)/rate);
        double sibRelease = Math.exp(-1.0/(.035*rate));
        double gateAttack = Math.exp(-1.0/(.002*rate)), gateRelease = Math.exp(-1.0/(.07*rate));
        float peak = 0;
        for (int i = 0; i < pcm.length; i++) {
            if ((i & 4095) == 0) check(cancel);
            double x = high.run(mid.run(bass.run(pcm[i])));
            if (deess > 0) {
                deessLow += split*(x-deessLow);
                double hiss=x-deessLow;
                sibEnv=Math.max(Math.abs(hiss),sibEnv*sibRelease);
                double sibThreshold=.055-.035*deess;
                double reduction=sibEnv>sibThreshold ? Math.min(.9,deess*(1-sibThreshold/sibEnv)) : 0;
                x-=hiss*reduction;
            }
            if (gate > 0) {
                double a=Math.abs(x), k=a>gateEnv?gateAttack:gateRelease;
                gateEnv=k*gateEnv+(1-k)*a;
                double gateThreshold=.001+gate*.024;
                double target=Math.min(1,Math.pow(gateEnv/gateThreshold,2));
                gateGain+=(target-gateGain)*(target>gateGain?.08:.002);
                x*=gateGain;
            }
            if (comp > 0) {
                double abs = Math.abs(x), k = abs > env ? attack : release; env = k*env+(1-k)*abs;
                double gain = env > threshold ? Math.pow(env/threshold,1/ratio-1) : 1;
                x *= gain * makeup;
            }
            if (saturation > 0) x=(1-saturation)*x+saturation*Math.tanh(x*(1+5*saturation))/Math.tanh(1+5*saturation);
            if (robot > 0) { x *= (1-robot) + robot*Math.sin(phase); phase += step; if (phase > 2*Math.PI) phase -= 2*Math.PI; }
            if (room > 0) {
                double wet = 0;
                for (int c=0;c<4;c++) {
                    int at = pointers[c]; double y = comb[c][at]; damp[c] = .65*damp[c]+.35*y;
                    comb[c][at] = (float)(x + .64*damp[c]);
                    pointers[c] = (at+1)%comb[c].length; wet += y;
                }
                x = x*(1-.3*room) + wet*.13*room;
            }
            if (echo > 0) { double y = delay[dp]; delay[dp] = (float)(x + y*.3); dp=(dp+1)%delay.length; x=x*(1-.2*echo)+y*.5*echo; }
            // Finite guard and one segment-wide peak limiter (no hard clipped samples).
            if ((Double.isNaN(x) || Double.isInfinite(x))) x=0;
            pcm[i]=(float)x; peak=Math.max(peak,Math.abs(pcm[i]));
        }
        double normalize=value(s,"normalize",0,100)/100.0;
        double gain=1;
        // Never amplify digital silence; cap lift at 8x to avoid magnifying a noise floor.
        if (normalize>0 && peak>1e-5) gain=1+normalize*(Math.min(8,.9/peak)-1);
        if (peak*gain>.98) gain=.98/peak;
        double limiter=value(s,"limiter",0,100)/100.0, ceiling=.98-.73*limiter;
        int fade = Math.min(rate/200,pcm.length/2);
        for (int i=0;i<pcm.length;i++) {
            if ((i & 4095)==0) check(cancel);
            double edge = Math.min(1,Math.min(i/(double)Math.max(1,fade),(pcm.length-1-i)/(double)Math.max(1,fade)));
            double sample=pcm[i]*gain;
            if (limiter>0) sample=Math.max(-ceiling,Math.min(ceiling,sample));
            pcm[i]=(float)(sample*edge);
        }
    }

    /** Ten original timbre designs, not trained models or exact character/actor impersonations.
     * Only the transformed stream is played; blend controls timbre within that stream.
     * All accesses and loops are bounded by the same PCM duration/cancellation limits.
     */
    private static void shapeCharacter(float[] pcm,int rate,int type,float mix,Cancel cancel) throws IOException {
        float[] dry=pcm.clone();
        Biquad body=Biquad.shelf(rate,260,type==1?4:type==2?5:type==10?8:0,false);
        Biquad low=Biquad.shelf(rate,Math.min(3300,rate*.38),type==1?-3:type==2?-5:type==10?-8:0,true);
        Biquad phoneBass=Biquad.shelf(rate,500,-24,false);
        Biquad phoneHigh=Biquad.shelf(rate,Math.min(2700,rate*.36),-24,true);
        Biquad phoneMid=Biquad.peak(rate,1600,6);
        long noise=0x999L; double env=0, last=0;
        for (int i=0;i<pcm.length;i++) {
            if ((i&4095)==0) check(cancel);
            double x=dry[i],t=i/(double)rate,y=x;
            switch(type) {
                case 1: // Low, gravelly baritone texture. Pitch is set once by Android TTS.
                    y=low.run(body.run(x)); y=.72*Math.tanh(2.6*y)*(1+.16*Math.sin(2*Math.PI*37*t)); break;
                case 2: // Rounded warm storyteller.
                    y=low.run(body.run(x)); y=.8*Math.tanh(1.8*y); break;
                case 3: // Masked, mechanical undertone.
                    y=.8*x+.32*x*Math.sin(2*Math.PI*48*t); y=Math.tanh(2*y)*.7; break;
                case 4: // Digital carrier + low-resolution timbre.
                    y=x*(.5+.5*Math.sin(2*Math.PI*115*t)); y=Math.rint(y*48)/48; break;
                case 5: // Band-limited, driven vintage handset.
                    y=phoneHigh.run(phoneMid.run(phoneBass.run(x))); y=Math.tanh(3*y)*.7; break;
                case 6: // Breath-driven whisper, retaining consonants for intelligibility.
                    env=Math.max(Math.abs(x),env*Math.exp(-1.0/(.008*rate)));
                    noise=(noise*1664525+1013904223)&0xffffffffL;
                    y=.42*(x-last)+.38*x+(((noise>>>8)/8388607.5)-1)*env*.42; last=x; break;
                case 7: // Two modulated short delays form a double-tracked texture.
                    y=.65*x+.22*sample(dry,i-rate*(.018+.002*Math.sin(2*Math.PI*.7*t)))+.22*sample(dry,i-rate*(.026+.003*Math.sin(2*Math.PI*.93*t))); break;
                case 8: // Fractional-delay vibrato + a light alien carrier.
                    y=sample(dry,i-rate*(.003+.0025*Math.sin(2*Math.PI*5.8*t)))*(1+.22*Math.sin(2*Math.PI*31*t)); break;
                case 9: // Held samples and five-bit quantization.
                    int hold=Math.max(1,rate/6000); y=Math.rint(dry[i-i%hold]*24)/24; break;
                case 10: // Low resonance and non-linear rumble.
                    y=low.run(body.run(x)); y=.75*Math.tanh(3*y)*( .84+.16*Math.sin(2*Math.PI*24*t)); break;
                default: break;
            }
            if (!Double.isFinite(y)) y=0;
            pcm[i]=(float)(x*(1-mix)+y*mix);
        }
    }
    private static double sample(float[] pcm,double position) {
        if(position<0 || position>=pcm.length-1)return 0;
        int at=(int)position; double part=position-at;
        return pcm[at]*(1-part)+pcm[at+1]*part;
    }
    private static void humanize(float[] pcm,int rate,float amount,Cancel cancel) throws IOException {
        float[] dry=pcm.clone();
        for(int i=0;i<pcm.length;i++) {
            if((i&4095)==0)check(cancel);
            double t=i/(double)rate;
            double delay=amount*rate*.0006*(1+Math.sin(2*Math.PI*1.7*t));
            double dynamics=1+amount*(.035*Math.sin(2*Math.PI*2.3*t)+.02*Math.sin(2*Math.PI*.61*t));
            pcm[i]=(float)(sample(dry,i-delay)*dynamics);
        }
    }

    /** Experimental chromatic pitch snap: normalized autocorrelation + pitch-synchronous overlap-add.
     * Voiced grains move to semitone-spaced synthesis marks without changing segment duration.
     * Unvoiced/low-confidence grains stay at their original positions. This is not a studio vocoder.
     */
    private static void snapPitch(float[] pcm,int rate,float amount,Cancel cancel) throws IOException {
        int frame = Math.max(512,(int)(rate*.046)), hop = Math.max(1,rate/50), down = Math.max(1,rate/8000);
        int lo = Math.max(2,rate/(450*down)), hi = rate/(65*down);
        float[] out = new float[pcm.length], weight = new float[pcm.length];
        double[] correlations = new double[hi+2];
        double period = rate*.01, ratio = 1, mark = 0;
        boolean voiced = false; int analyseAt = -1;
        while(mark<pcm.length){
            check(cancel); int center=(int)Math.round(mark);
            if(center>=analyseAt){
                analyseAt=center+hop;
                int from=Math.max(0,center-frame/2),end=Math.min(pcm.length,center+frame/2);
                double energy=0;for(int i=from;i<end;i+=down)energy+=pcm[i]*pcm[i];
                double best=0;int bestLag=0;
                if(energy/Math.max(1,(end-from)/down)>.0001){
                    for(int lag=lo;lag<=hi;lag++){
                        double xy=0,xx=0,yy=0;int shift=lag*down;
                        for(int j=from;j+shift<end;j+=down){double x=pcm[j],y=pcm[j+shift];xy+=x*y;xx+=x*x;yy+=y*y;}
                        double c=xy/Math.sqrt(xx*yy+1e-15);correlations[lag]=c;
                        if(c>best){best=c;bestLag=lag;}
                    }
                    // Earliest near-global local maximum avoids choosing a subharmonic period.
                    for(int lag=lo+1;lag<hi;lag++)if(correlations[lag]>.8 && correlations[lag]>=best-.025 && correlations[lag]>=correlations[lag-1] && correlations[lag]>=correlations[lag+1]){bestLag=lag;break;}
                }
                voiced=best>.8 && bestLag>lo && bestLag<hi;
                ratio=1;period=rate*.01;
                if(voiced){
                    double left=correlations[bestLag-1],mid=correlations[bestLag],right=correlations[bestLag+1];
                    double denominator=left-2*mid+right;
                    double delta=Math.abs(denominator)>1e-9?.5*(left-right)/denominator:0;
                    delta=Math.max(-.5,Math.min(.5,delta));period=(bestLag+delta)*down;
                    double hz=rate/period,midi=69+12*Math.log(hz/440)/Math.log(2);
                    ratio=Math.pow(2,(Math.rint(midi)-midi)*amount/12);
                }
            }
            int anchor=center,radius=Math.max(2,(int)Math.ceil(period));
            if(voiced){
                int from=Math.max(0,center-radius/2),end=Math.min(pcm.length,center+radius/2+1);float best=-Float.MAX_VALUE;
                for(int i=from;i<end;i++)if(pcm[i]>best){best=pcm[i];anchor=i;}
            }
            for(int j=-radius;j<=radius;j++){
                int target=center+j,source=anchor+j;
                if(target<0||target>=pcm.length||source<0||source>=pcm.length)continue;
                float w=(float)(.5+.5*Math.cos(Math.PI*j/radius));
                out[target]+=pcm[source]*w;weight[target]+=w;
            }
            mark+=Math.max(1,period/ratio);
        }
        for(int i=0;i<pcm.length;i++){if((i&4095)==0)check(cancel);if(weight[i]>.001)pcm[i]=out[i]/weight[i];}
    }

    private static final class Biquad {
        double b0,b1,b2,a1,a2,z1,z2;
        Biquad(double b0,double b1,double b2,double a0,double a1,double a2){this.b0=b0/a0;this.b1=b1/a0;this.b2=b2/a0;this.a1=a1/a0;this.a2=a2/a0;}
        double run(double x){double y=b0*x+z1;z1=b1*x-a1*y+z2;z2=b2*x-a2*y;return y;}
        static Biquad peak(int rate,double hz,double db){double a=Math.pow(10,db/40),w=2*Math.PI*hz/rate,c=Math.cos(w),alpha=Math.sin(w)/2;return new Biquad(1+alpha*a,-2*c,1-alpha*a,1+alpha/a,-2*c,1-alpha/a);}
        static Biquad shelf(int rate,double hz,double db,boolean high){
            double a=Math.pow(10,db/40),w=2*Math.PI*hz/rate,c=Math.cos(w),alpha=Math.sin(w)/Math.sqrt(2),r=2*Math.sqrt(a)*alpha;
            if(high)return new Biquad(a*((a+1)+(a-1)*c+r),-2*a*((a-1)+(a+1)*c),a*((a+1)+(a-1)*c-r),(a+1)-(a-1)*c+r,2*((a-1)-(a+1)*c),(a+1)-(a-1)*c-r);
            return new Biquad(a*((a+1)-(a-1)*c+r),2*a*((a-1)-(a+1)*c),a*((a+1)-(a-1)*c-r),(a+1)+(a-1)*c+r,-2*((a-1)+(a+1)*c),(a+1)+(a-1)*c-r);
        }
    }
}
