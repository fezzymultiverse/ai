package __APPID__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "HorizonMedia")
public class HorizonMediaPlugin extends Plugin {
    @Override public void load() { HorizonMediaService.bridge = this; }
    void send(String name, JSObject data) { notifyListeners(name, data); }
    @PluginMethod public void play(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                String source = call.getString("source", "");
                if (source.isEmpty()) { if (HorizonMediaService.instance != null) HorizonMediaService.instance.resume(); else throw new IllegalStateException("No track loaded"); }
                else {
                    if (!source.startsWith("file://") && !source.startsWith("content://")) throw new IllegalArgumentException("Only local audio files are accepted");
                    Intent i = new Intent(getContext(), HorizonMediaService.class).setAction("load");
                    for (String key : new String[]{"source","title","artist","album","id"}) i.putExtra(key, call.getString(key, ""));
                    if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(i); else getContext().startService(i);
                }
                call.resolve();
            } catch (Exception e) { call.reject(e.toString()); }
        });
    }
    /** V1.61.0: a plain notification with Gemini's answer for the "What's this?" button on the music notification (same id each time, so Listening... is replaced by the answer). */
    @PluginMethod public void songNote(PluginCall call) {
        try {
            Context c = getContext();
            String title = call.getString("title", "Horizon"), text = call.getString("text", "");
            boolean busy = Boolean.TRUE.equals(call.getBoolean("busy", false));
            NotificationManager nm = (NotificationManager) c.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm == null) { call.resolve(); return; }
            if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel("horizon_songnote") == null) {
                NotificationChannel ch = new NotificationChannel("horizon_songnote", "Song notes", NotificationManager.IMPORTANCE_DEFAULT);
                ch.setShowBadge(false); nm.createNotificationChannel(ch);
            }
            Notification.Builder b = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(c, "horizon_songnote") : new Notification.Builder(c);
            b.setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle(title).setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text)).setOnlyAlertOnce(true).setShowWhen(true);
            if (busy) b.setProgress(0, 0, true).setOngoing(true); else b.setAutoCancel(true);
            Intent open = c.getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (open != null) b.setContentIntent(PendingIntent.getActivity(c, 5, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
            nm.notify(4111, b.build());
            call.resolve();
        } catch (Exception e) { call.reject(e.toString()); }
    }
    /** Album artwork as a small JPEG data URL (embedded picture, Android thumbnail or cover.jpg). Empty result when the song has none. */
    @PluginMethod public void art(PluginCall call) {
        final String source = call.getString("source", "");
        final Integer asked = call.getInt("size", 256);
        final int px = Math.max(64, Math.min(1024, asked == null ? 256 : asked));
        if (source == null || source.isEmpty()) { call.resolve(new JSObject()); return; }
        new Thread(() -> {
            JSObject o = new JSObject();
            try {
                byte[] b = HorizonArt.jpeg(getContext(), source, px);
                if (b != null) o.put("data", "data:image/jpeg;base64," + android.util.Base64.encodeToString(b, android.util.Base64.NO_WRAP));
            } catch (Throwable ignored) {}
            call.resolve(o);
        }).start();
    }
    @PluginMethod public void pause(PluginCall call) { getActivity().runOnUiThread(() -> { if (HorizonMediaService.instance != null) HorizonMediaService.instance.pause(); call.resolve(); }); }
    @PluginMethod public void seek(PluginCall call) { getActivity().runOnUiThread(() -> { if (HorizonMediaService.instance != null) HorizonMediaService.instance.seek((long)(call.getDouble("position",0.0)*1000)); call.resolve(); }); }
    @PluginMethod public void state(PluginCall call) { getActivity().runOnUiThread(() -> { call.resolve(HorizonMediaService.instance == null ? new JSObject() : HorizonMediaService.instance.state("state")); }); }
    @PluginMethod public void stop(PluginCall call) { getActivity().runOnUiThread(() -> { getContext().stopService(new Intent(getContext(), HorizonMediaService.class)); call.resolve(); }); }
    @Override protected void handleOnDestroy() { if (HorizonMediaService.bridge == this) HorizonMediaService.bridge = null; }
}
