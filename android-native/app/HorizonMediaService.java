package __APPID__;

import android.app.*;
import android.content.*;
import android.content.pm.ServiceInfo;
import android.media.*;
import android.media.session.*;
import android.net.Uri;
import android.os.*;
import com.getcapacitor.JSObject;

/** Android owns playback, audio focus and lock-screen controls, not the WebView. */
public class HorizonMediaService extends Service {
    static volatile HorizonMediaService instance;
    static volatile HorizonMediaPlugin bridge;
    private static final String CHANNEL = "horizon_music";
    private static final int NOTIFICATION = 4110;
    private final Handler main = new Handler(Looper.getMainLooper());
    private MediaPlayer player;
    private MediaSession session;
    private AudioManager audio;
    private AudioFocusRequest focus;
    private boolean prepared, playing, resumeOnFocus, playWhenReady;
    private String title = "Horizon Music", artist = "", album = "", trackId = "", source = "";
    private long position, duration;
    private android.graphics.Bitmap albumArt;
    private final Runnable tick = new Runnable() { @Override public void run() { publish("timeupdate"); main.postDelayed(this, 1000); } };
    private final BroadcastReceiver noisy = new BroadcastReceiver() { @Override public void onReceive(Context c, Intent i) { pause(); } };
    @Override public IBinder onBind(Intent i) { return null; }
    @Override public void onCreate() {
        super.onCreate(); instance = this;
        audio = (AudioManager)getSystemService(AUDIO_SERVICE);
        session = new MediaSession(this, "HorizonMusic");
        session.setCallback(new MediaSession.Callback() {
            @Override public void onPlay() { resume(); }
            @Override public void onPause() { pause(); }
            @Override public void onStop() { stopSelf(); }
            @Override public void onSkipToNext() { command("next"); }
            @Override public void onSkipToPrevious() { command("prev"); }
            @Override public void onSeekTo(long p) { seek(p); }
        }, main);
        session.setActive(true);
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel ch = new NotificationChannel(CHANNEL, "Horizon music playback", NotificationManager.IMPORTANCE_LOW);
            ch.setSound(null, null); ch.setShowBadge(false);
            ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).createNotificationChannel(ch);
        }
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(noisy, f, Context.RECEIVER_NOT_EXPORTED); else registerReceiver(noisy, f);
        main.post(tick);
    }
    @Override public int onStartCommand(Intent i, int flags, int startId) {
        try {
            // Meet the foreground deadline before any file IO or asynchronous preparation.
            if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            else startForeground(NOTIFICATION, notification());
            if (i == null) { stopSelf(); return START_NOT_STICKY; }
            String action = i.getAction();
            if ("load".equals(action)) load(i);
            else if ("play".equals(action)) resume();
            else if ("pause".equals(action)) pause();
            else if ("next".equals(action) || "prev".equals(action) || "identify".equals(action)) command(action);
            else if ("stop".equals(action)) stopSelf();
        } catch (Exception e) { error(e.toString()); stopSelf(); }
        return START_NOT_STICKY;
    }
    private void load(Intent i) throws Exception {
        if (player != null) { player.release(); player = null; }
        prepared = false; playing = false; playWhenReady = true; position = 0; duration = 0; albumArt = null;
        trackId = i.getStringExtra("id"); source = i.getStringExtra("source");
        title = i.getStringExtra("title"); artist = i.getStringExtra("artist"); album = i.getStringExtra("album");
        player = new MediaPlayer();
        player.setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build());
        player.setWakeMode(this, PowerManager.PARTIAL_WAKE_LOCK);
        player.setOnPreparedListener(p -> { prepared = true; duration = p.getDuration(); publish("loadedmetadata"); if (playWhenReady) resume(); });
        player.setOnCompletionListener(p -> { playing = false; position = duration; abandonFocus(); update(); publish("ended"); });
        player.setOnErrorListener((p, what, extra) -> { playing = false; error("Android media error " + what + "/" + extra); stopSelf(); return true; });
        player.setDataSource(this, Uri.parse(source)); player.prepareAsync(); update();
        final String forSource = source;
        new Thread(() -> {
            android.graphics.Bitmap art = null;
            try { art = HorizonArt.bitmap(HorizonMediaService.this, forSource, 512); } catch (Throwable ignored) {}
            final android.graphics.Bitmap got = art;
            if (got != null) main.post(() -> { if (forSource != null && forSource.equals(source)) { albumArt = got; update(); } });
        }).start();
    }
    private final AudioManager.OnAudioFocusChangeListener focusChange = change -> main.post(() -> {
        if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK) { if (player != null && prepared) player.setVolume(.2f,.2f); }
        else if (change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) { resumeOnFocus = playing; pauseInternal(false); }
        else if (change == AudioManager.AUDIOFOCUS_LOSS) { resumeOnFocus = false; pause(); }
        else if (change == AudioManager.AUDIOFOCUS_GAIN) { if (player != null && prepared) player.setVolume(1f,1f); if (resumeOnFocus) { resumeOnFocus = false; resume(); } }
    });
    private boolean requestFocus() {
        if (Build.VERSION.SDK_INT >= 26) {
            if (focus == null) focus = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAudioAttributes(new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_MUSIC).build())
                .setOnAudioFocusChangeListener(focusChange, main).build();
            return audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
        }
        return audio.requestAudioFocus(focusChange, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED;
    }
    private void abandonFocus() {
        if (Build.VERSION.SDK_INT >= 26 && focus != null) audio.abandonAudioFocusRequest(focus);
        else audio.abandonAudioFocus(focusChange);
    }
    void resume() {
        playWhenReady = true;
        if (!prepared || player == null || playing) return;
        if (!requestFocus()) { error("Audio focus is unavailable. Try playing again after the other audio ends."); return; }
        player.start(); playing = true; update(); publish("play");
    }
    void pause() { playWhenReady = false; resumeOnFocus = false; pauseInternal(true); }
    private void pauseInternal(boolean releaseFocus) {
        if (player != null && prepared) { player.pause(); position = player.getCurrentPosition(); }
        playing = false; if (releaseFocus) abandonFocus(); update(); publish("pause");
    }
    void seek(long p) { if (player != null && prepared) { player.seekTo((int)Math.max(0, Math.min(duration, p))); position = p; update(); publish("timeupdate"); } }
    private void command(String action) { if (bridge != null) { JSObject o = new JSObject(); o.put("action", action); bridge.send("mediaCommand", o); } }
    private PendingIntent action(String a, int code) {
        return PendingIntent.getService(this, code, new Intent(this, HorizonMediaService.class).setAction(a), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    private Notification notification() {
        Intent open = getPackageManager().getLaunchIntentForPackage(getPackageName());
        Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        b.setSmallIcon(android.R.drawable.ic_media_play).setContentTitle(title == null ? "Horizon Music" : title)
            .setContentText((artist == null ? "" : artist) + (album == null || album.isEmpty() ? "" : " · " + album))
            .setCategory(Notification.CATEGORY_TRANSPORT).setVisibility(Notification.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true).setOngoing(playing).setShowWhen(false)
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_previous, "Previous", action("prev", 1)).build())
            .addAction(new Notification.Action.Builder(playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play, playing ? "Pause" : "Play", action(playing ? "pause" : "play", 2)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_media_next, "Next", action("next", 3)).build())
            .addAction(new Notification.Action.Builder(android.R.drawable.ic_btn_speak_now, "What's this?", action("identify", 5)).build())
            .setStyle(new Notification.MediaStyle().setMediaSession(session.getSessionToken()).setShowActionsInCompactView(0,1,2));
        if (albumArt != null) b.setLargeIcon(albumArt);
        if (open != null) b.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        b.setDeleteIntent(action("stop", 4)); return b.build();
    }
    private void update() {
        if (session == null) return;
        MediaMetadata.Builder md = new MediaMetadata.Builder().putString(MediaMetadata.METADATA_KEY_TITLE,title)
            .putString(MediaMetadata.METADATA_KEY_ARTIST,artist).putString(MediaMetadata.METADATA_KEY_ALBUM,album)
            .putLong(MediaMetadata.METADATA_KEY_DURATION,duration);
        if (albumArt != null) md.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, albumArt).putBitmap(MediaMetadata.METADATA_KEY_ART, albumArt);
        session.setMetadata(md.build());
        session.setPlaybackState(new PlaybackState.Builder().setActions(PlaybackState.ACTION_PLAY | PlaybackState.ACTION_PAUSE | PlaybackState.ACTION_PLAY_PAUSE | PlaybackState.ACTION_SKIP_TO_NEXT | PlaybackState.ACTION_SKIP_TO_PREVIOUS | PlaybackState.ACTION_SEEK_TO | PlaybackState.ACTION_STOP)
            .setState(playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,position,playing ? 1f : 0f).build());
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION,notification());
    }
    JSObject state(String event) {
        if (player != null && prepared) { try { position = player.getCurrentPosition(); duration = player.getDuration(); } catch (Exception ignored) {} }
        JSObject o = new JSObject(); o.put("event",event); o.put("id",trackId); o.put("source",source); o.put("title",title); o.put("artist",artist); o.put("album",album);
        o.put("paused",!playing); o.put("position",position / 1000.0); o.put("duration",duration / 1000.0); return o;
    }
    private void publish(String event) { if (bridge != null) bridge.send("mediaState",state(event)); }
    private void error(String text) { if (bridge != null) { JSObject o = state("error"); o.put("message",text); bridge.send("mediaState",o); } }
    @Override public void onDestroy() {
        main.removeCallbacksAndMessages(null); abandonFocus();
        if (player != null) { player.release(); player = null; }
        playing = false; prepared = false; publish("pause");
        if (session != null) session.release();
        try { unregisterReceiver(noisy); } catch (Exception ignored) {}
        stopForeground(true); instance = null; super.onDestroy();
    }
}
