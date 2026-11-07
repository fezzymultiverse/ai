package __APPID__;

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
    @PluginMethod public void pause(PluginCall call) { getActivity().runOnUiThread(() -> { if (HorizonMediaService.instance != null) HorizonMediaService.instance.pause(); call.resolve(); }); }
    @PluginMethod public void seek(PluginCall call) { getActivity().runOnUiThread(() -> { if (HorizonMediaService.instance != null) HorizonMediaService.instance.seek((long)(call.getDouble("position",0.0)*1000)); call.resolve(); }); }
    @PluginMethod public void state(PluginCall call) { getActivity().runOnUiThread(() -> { call.resolve(HorizonMediaService.instance == null ? new JSObject() : HorizonMediaService.instance.state("state")); }); }
    @PluginMethod public void stop(PluginCall call) { getActivity().runOnUiThread(() -> { getContext().stopService(new Intent(getContext(), HorizonMediaService.class)); call.resolve(); }); }
    @Override protected void handleOnDestroy() { if (HorizonMediaService.bridge == this) HorizonMediaService.bridge = null; }
}
