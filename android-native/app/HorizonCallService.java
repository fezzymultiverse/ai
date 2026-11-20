package __APPID__;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.telecom.Call;
import android.telecom.CallAudioState;
import android.telecom.InCallService;
import android.telecom.VideoProfile;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import java.util.LinkedHashMap;
import java.util.Map;

/** Android Telecom owns the cellular audio. Horizon supplies the in-chat call UI. */
public class HorizonCallService extends InCallService {
    private static HorizonCallService live;
    private static final Map<String, Call> calls = new LinkedHashMap<>();
    private final Map<Call, Call.Callback> callbacks = new LinkedHashMap<>();
    private static long sequence;
    private static final int NOTICE = 99127;
    static JSObject snapshot() {
        JSArray rows = new JSArray();
        for (Map.Entry<String, Call> e : calls.entrySet()) {
            Call call = e.getValue(); Call.Details details = call.getDetails();
            String number = details != null && details.getHandle() != null ? details.getHandle().getSchemeSpecificPart() : "";
            String name = details != null && details.getCallerDisplayName() != null ? details.getCallerDisplayName() : "";
            JSObject row = new JSObject().put("id", e.getKey()).put("number", number).put("name", name).put("state", label(call.getState()));
            if (details != null) {
                row.put("connectedAt", details.getConnectTimeMillis());
                if (details.getDisconnectCause() != null) row.put("reason", details.getDisconnectCause().getCode());
            }
            rows.put(row);
        }
        CallAudioState audio = live == null ? null : live.getCallAudioState();
        return new JSObject().put("full", true).put("calls", rows).put("muted", audio != null && audio.isMuted())
            .put("speaker", audio != null && audio.getRoute() == CallAudioState.ROUTE_SPEAKER)
            .put("speakerSupported", audio != null && (audio.getSupportedRouteMask() & CallAudioState.ROUTE_SPEAKER) != 0);
    }
    private static String label(int state) {
        switch (state) {
            case Call.STATE_NEW: return "starting";
            case Call.STATE_CONNECTING: return "connecting";
            case Call.STATE_SELECT_PHONE_ACCOUNT: return "select_account";
            case Call.STATE_DIALING: return "dialing";
            case Call.STATE_RINGING: return "ringing";
            case Call.STATE_ACTIVE: return "active";
            case Call.STATE_HOLDING: return "holding";
            case Call.STATE_DISCONNECTING: return "disconnecting";
            case Call.STATE_DISCONNECTED: return "ended";
            default: return "connecting";
        }
    }
    static void control(String id, String action) {
        Call call = calls.get(id);
        if (call == null || live == null) throw new IllegalStateException("This call is no longer available.");
        switch (action) {
            case "hangup": call.disconnect(); break;
            case "answer": call.answer(VideoProfile.STATE_AUDIO_ONLY); break;
            case "reject": call.reject(false, null); break;
            case "mute": live.setMuted(!live.getCallAudioState().isMuted()); break;
            case "speaker":
                CallAudioState audio = live.getCallAudioState();
                if (audio == null) throw new IllegalStateException("Call audio is not ready.");
                int route = audio.getRoute() == CallAudioState.ROUTE_SPEAKER ? CallAudioState.ROUTE_WIRED_OR_EARPIECE : CallAudioState.ROUTE_SPEAKER;
                if ((audio.getSupportedRouteMask() & route) == 0) throw new IllegalStateException("That audio route is unavailable.");
                live.setAudioRoute(route); break;
            default: throw new IllegalArgumentException("Unknown call control.");
        }
    }
    private void changed() {
        HorizonContactsPlugin.publishCallState(snapshot());
        updateNotification();
    }
    @Override public void onCallAdded(Call call) {
        super.onCallAdded(call); live = this;
        String id = "call-" + System.currentTimeMillis() + "-" + (++sequence);
        calls.put(id, call);
        Call.Callback cb = new Call.Callback() {
            @Override public void onStateChanged(Call c, int state) { changed(); }
            @Override public void onDetailsChanged(Call c, Call.Details details) { changed(); }
        };
        callbacks.put(call, cb); call.registerCallback(cb);
        changed();
    }
    @Override public void onCallRemoved(Call call) {
        // Send the terminal state before removing it, so the correct card is retained in history.
        String id = null;
        for (Map.Entry<String, Call> e : calls.entrySet()) if (e.getValue() == call) { id = e.getKey(); break; }
        if (id != null) {
            JSObject ended = new JSObject().put("id", id).put("state", "ended");
            JSArray terminal = new JSArray(); terminal.put(ended);
            HorizonContactsPlugin.publishCallState(new JSObject().put("calls", terminal));
            calls.remove(id);
        }
        Call.Callback cb = callbacks.remove(call); if (cb != null) call.unregisterCallback(cb);
        changed(); super.onCallRemoved(call);
    }
    @Override public void onCallAudioStateChanged(CallAudioState audio) { super.onCallAudioStateChanged(audio); changed(); }
    @Override public void onBringToForeground(boolean showDialpad) {
        super.onBringToForeground(showDialpad);
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(open);
    }
    private void updateNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;
        if (calls.isEmpty()) { nm.cancel(NOTICE); return; }
        boolean ringing = false;
        for (Call call : calls.values()) if (call.getState() == Call.STATE_RINGING) ringing = true;
        String channel = "horizon_calls";
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel nc = new NotificationChannel(channel, "Horizon calls", NotificationManager.IMPORTANCE_HIGH);
            nm.createNotificationChannel(nc);
        }
        Intent intent = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pending = PendingIntent.getActivity(this, NOTICE, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, channel) : new Notification.Builder(this);
        builder.setSmallIcon(android.R.drawable.sym_action_call).setContentTitle(ringing ? "Incoming Horizon call" : "Horizon call")
            .setContentText("Tap to open the Calling Card in Horizon chat.").setCategory(Notification.CATEGORY_CALL)
            .setContentIntent(pending).setOngoing(true).setOnlyAlertOnce(true);
        if (ringing) builder.setFullScreenIntent(pending, true);
        try { nm.notify(NOTICE, builder.build()); } catch (SecurityException ignored) { /* App still shows its live chat card. */ }
    }
    @Override public void onDestroy() {
        for (Map.Entry<Call, Call.Callback> e : callbacks.entrySet()) e.getKey().unregisterCallback(e.getValue());
        callbacks.clear(); calls.clear(); live = null;
        HorizonContactsPlugin.publishCallState(new JSObject().put("full", true).put("calls", new JSArray()));
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE); if (nm != null) nm.cancel(NOTICE);
        super.onDestroy();
    }
}
