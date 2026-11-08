package __APPID__;

import java.io.ByteArrayOutputStream;
import java.security.MessageDigest;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.Random;
import java.util.TimeZone;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;
import okio.ByteString;

/**
 * V1.62.0: Microsoft Edge "Read Aloud" neural voices, no key, no account.
 * Same WebSocket protocol as the open-source edge-tts library. A WebView cannot send the Origin header this service checks,
 * so the connection is made natively. Everything that Microsoft could rotate lives in the constants below.
 */
final class HorizonEdgeTts {
    private static final String TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
    private static final String GEC_VERSION = "1-143.0.3650.75";
    private static final String BASE = "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
    private static final String ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
    private static final String UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0";
    private static final long WIN_EPOCH = 11644473600L;
    private static volatile String tokenOverride = "", verOverride = "";   // V1.63.8: set from the app when Microsoft rotates them
    private static volatile String lastDiag = "";
    private static String token() { return tokenOverride.isEmpty() ? TOKEN : tokenOverride; }
    private static String ver() { return verOverride.isEmpty() ? GEC_VERSION : verOverride; }
    private static volatile long skewSecs = 0;   // server clock minus phone clock, learned from a 403 Date header
    private static final OkHttpClient CLIENT = new OkHttpClient.Builder()
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(30, TimeUnit.SECONDS).writeTimeout(15, TimeUnit.SECONDS).build();

    private static final class Skew extends Exception { final long secs; Skew(long s) { super("clock"); secs = s; } }

    private HorizonEdgeTts() { }

    private static String gec() throws Exception {
        long t = System.currentTimeMillis() / 1000 + skewSecs + WIN_EPOCH;
        t -= t % 300;
        byte[] h = MessageDigest.getInstance("SHA-256").digest(((t * 10000000L) + token()).getBytes("US-ASCII"));
        StringBuilder sb = new StringBuilder();
        for (byte b : h) sb.append(String.format(Locale.US, "%02X", b & 0xff));
        return sb.toString();
    }
    private static String stamp() {
        SimpleDateFormat f = new SimpleDateFormat("EEE MMM dd yyyy HH:mm:ss 'GMT+0000 (Coordinated Universal Time)'", Locale.US);
        f.setTimeZone(TimeZone.getTimeZone("UTC"));
        return f.format(new Date());
    }
    private static String hex(int n) {
        Random r = new Random(); StringBuilder sb = new StringBuilder();
        while (sb.length() < n) sb.append(Integer.toHexString(r.nextInt(16)).toUpperCase(Locale.US));
        return sb.toString();
    }
    private static String esc(String s) {
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '&') sb.append("&amp;"); else if (c == '<') sb.append("&lt;"); else if (c == '>') sb.append("&gt;");
            else if (c == '"') sb.append("&quot;"); else if (c == '\'') sb.append("&apos;");
            else if (c < 32 && c != '\n' && c != '\t') sb.append(' '); else sb.append(c);
        }
        return sb.toString();
    }
    /** en-US-AvaMultilingualNeural -> Microsoft Server Speech Text to Speech Voice (en-US, AvaMultilingualNeural) */
    private static String longName(String v) {
        String[] p = v.split("-", 3);
        return "Microsoft Server Speech Text to Speech Voice (" + p[0] + "-" + p[1] + ", " + p[2] + ")";
    }

    static byte[] synth(String text, String voice, int rate, int pitch, String tok, String ver) throws Exception {
        tokenOverride = tok == null ? "" : tok.trim(); verOverride = ver == null ? "" : ver.trim();
        lastDiag = "";
        if (!voice.matches("^[A-Za-z]{2,3}-[A-Za-z]{2,4}-[A-Za-z0-9-]+$")) throw new IllegalArgumentException("Bad voice name");
        rate = Math.max(-90, Math.min(200, rate)); pitch = Math.max(-100, Math.min(100, pitch));
        Skew last = null;
        for (int attempt = 0; attempt < 2; attempt++) {
            try { return once(text, voice, rate, pitch); }
            catch (Skew s) { skewSecs = s.secs; last = s; }   // the phone's clock is off: retry once with the server's time
        }
        throw new Exception("Edge voice refused the connection (HTTP 403" + (lastDiag.isEmpty() ? "" : ", " + lastDiag) + "). Microsoft may have changed the service.");
    }

    private static byte[] once(String text, String voice, int rate, int pitch) throws Exception {
        final ByteArrayOutputStream audio = new ByteArrayOutputStream();
        final CountDownLatch done = new CountDownLatch(1);
        final Throwable[] fail = new Throwable[1];
        final long[] skew = new long[] { Long.MIN_VALUE };
        final String reqId = UUID.randomUUID().toString().replace("-", "");
        String url = BASE + "?TrustedClientToken=" + token() + "&ConnectionId=" + reqId + "&Sec-MS-GEC=" + gec() + "&Sec-MS-GEC-Version=" + ver();
        Request req = new Request.Builder().url(url)
            .header("Pragma", "no-cache").header("Cache-Control", "no-cache").header("Origin", ORIGIN)
            .header("User-Agent", UA).header("Accept-Language", "en-US,en;q=0.9").header("Cookie", "muid=" + hex(32) + ";").build();
        final String config = "X-Timestamp:" + stamp() + "\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n"
            + "{\"context\":{\"synthesis\":{\"audio\":{\"metadataoptions\":{\"sentenceBoundaryEnabled\":\"false\",\"wordBoundaryEnabled\":\"false\"},\"outputFormat\":\"audio-24khz-48kbitrate-mono-mp3\"}}}}\r\n";
        final String ssml = "X-RequestId:" + reqId + "\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:" + stamp() + "Z\r\nPath:ssml\r\n\r\n"
            + "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'><voice name='" + longName(voice) + "'>"
            + "<prosody pitch='" + String.format(Locale.US, "%+dHz", pitch) + "' rate='" + String.format(Locale.US, "%+d%%", rate) + "' volume='+0%'>" + esc(text) + "</prosody></voice></speak>";
        WebSocket ws = CLIENT.newWebSocket(req, new WebSocketListener() {
            @Override public void onOpen(WebSocket w, Response r) { w.send(config); w.send(ssml); }
            @Override public void onMessage(WebSocket w, String t) { if (t.contains("Path:turn.end")) done.countDown(); }
            @Override public void onMessage(WebSocket w, ByteString b) {
                byte[] d = b.toByteArray();
                if (d.length < 2) return;
                int hl = ((d[0] & 0xff) << 8) | (d[1] & 0xff);
                if (2 + hl > d.length) return;
                String head = new String(d, 2, hl);
                if (head.contains("Path:audio") && d.length > 2 + hl) audio.write(d, 2 + hl, d.length - 2 - hl);
            }
            @Override public void onFailure(WebSocket w, Throwable t, Response r) {
                if (r != null && r.code() == 403) {
                    String date = r.header("Date");
                    String body = "";
                    try { if (r.body() != null) body = r.body().string(); } catch (Exception ignored) { }
                    if (body.length() > 80) body = body.substring(0, 80);
                    lastDiag = "server time " + date + (body.isEmpty() ? "" : ", " + body.replaceAll("[\\r\\n]+", " "));
                    try {
                        SimpleDateFormat f = new SimpleDateFormat("EEE, dd MMM yyyy HH:mm:ss zzz", Locale.US);
                        skew[0] = f.parse(date).getTime() / 1000 - System.currentTimeMillis() / 1000;
                    } catch (Exception e) { skew[0] = 0; }
                }
                fail[0] = t; done.countDown();
            }
            @Override public void onClosed(WebSocket w, int code, String reason) { done.countDown(); }
        });
        boolean finished = done.await(30, TimeUnit.SECONDS);
        try { ws.close(1000, null); } catch (Exception ignored) { }
        if (skew[0] != Long.MIN_VALUE) throw new Skew(skew[0]);
        if (fail[0] != null && audio.size() == 0) throw new Exception("Edge voice connection failed: " + fail[0].getMessage());
        if (!finished && audio.size() == 0) throw new Exception("Edge voice took too long");
        if (audio.size() == 0) throw new Exception("Edge voice sent no audio");
        return audio.toByteArray();
    }
}
