package __APPID__;

import android.Manifest;
import android.app.NotificationManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.view.WindowManager;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Horizon native helpers: real permission prompts (notifications, microphone, storage/audio),
 * keep-screen-on, the background keep-alive service, and battery optimisation with fallbacks
 * for phones (Honor, Huawei) that block the standard prompt.
 */
@CapacitorPlugin(
    name = "HorizonPerms",
    permissions = {
        @Permission(alias = "notifications", strings = { "android.permission.POST_NOTIFICATIONS" }),
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "audio", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "storage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE }),
        @Permission(alias = "legacyStorage", strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE })
    }
)
public class HorizonPermsPlugin extends Plugin {

    // ---------- basics ----------

    @PluginMethod
    public void deviceInfo(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdk", Build.VERSION.SDK_INT);
        ret.put("release", Build.VERSION.RELEASE == null ? "" : Build.VERSION.RELEASE);
        ret.put("manufacturer", Build.MANUFACTURER == null ? "" : Build.MANUFACTURER);
        ret.put("brand", Build.BRAND == null ? "" : Build.BRAND);
        ret.put("model", Build.MODEL == null ? "" : Build.MODEL);
        ret.put("device", Build.DEVICE == null ? "" : Build.DEVICE);
        ret.put("abi", Build.SUPPORTED_ABIS != null && Build.SUPPORTED_ABIS.length > 0 ? Build.SUPPORTED_ABIS[0] : "");
        try {
            StringBuilder ips = new StringBuilder();
            java.util.Enumeration<java.net.NetworkInterface> ifs = java.net.NetworkInterface.getNetworkInterfaces();
            while (ifs != null && ifs.hasMoreElements()) {
                java.net.NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                java.util.Enumeration<java.net.InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    java.net.InetAddress a = addrs.nextElement();
                    if (a.isLoopbackAddress() || a.isLinkLocalAddress() || !(a instanceof java.net.Inet4Address)) continue;
                    if (ips.length() > 0) ips.append(", ");
                    ips.append(ni.getName()).append(" ").append(a.getHostAddress());
                }
            }
            ret.put("localIp", ips.toString());
        } catch (Exception ignored) {
            // shown as unknown
        }
        try {
            String pkg = getContext().getPackageName();
            ret.put("packageName", pkg);
            android.content.pm.PackageInfo pi = getContext().getPackageManager().getPackageInfo(pkg, 0);
            ret.put("versionName", pi.versionName == null ? "" : pi.versionName);
            ret.put("versionCode", Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : (long) pi.versionCode);
        } catch (Exception ignored) {
            // the check screen shows "unknown" for these
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void keepAwake(final PluginCall call) {
        Boolean flag = call.getBoolean("on", false);
        final boolean on = flag != null && flag;
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                if (on) {
                    getActivity().getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    getActivity().getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                call.resolve();
            }
        });
    }

    // ---------- notifications ----------

    private boolean notifOn() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= 33
                && ContextCompat.checkSelfPermission(ctx, "android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) {
            return false;
        }
        if (Build.VERSION.SDK_INT >= 24) {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            return nm != null && nm.areNotificationsEnabled();
        }
        return true;
    }

    private void resolveNotif(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("enabled", notifOn());
        call.resolve(ret);
    }

    @PluginMethod
    public void notificationsEnabled(PluginCall call) {
        resolveNotif(call);
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            getActivity().runOnUiThread(() -> requestPermissionForAlias("notifications", call, "notifCallback"));
            return;
        }
        resolveNotif(call);
    }

    @PermissionCallback
    private void notifCallback(PluginCall call) {
        resolveNotif(call);
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Context ctx = getContext();
        Intent i;
        if (Build.VERSION.SDK_INT >= 26) {
            i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
        } else {
            i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + ctx.getPackageName()));
        }
        if (tryStart(i)) {
            call.resolve();
        } else {
            openAppSettings(call);
        }
    }

    // ---------- microphone ----------

    private boolean micOn() {
        if (Build.VERSION.SDK_INT < 23) return true;
        return getContext().checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }

    private void resolveMic(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", micOn());
        call.resolve(ret);
    }

    @PluginMethod
    public void micStatus(PluginCall call) {
        resolveMic(call);
    }

    @PluginMethod
    public void requestMic(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 23 && !micOn()) {
            getActivity().runOnUiThread(() -> requestPermissionForAlias("microphone", call, "micCallback"));
            return;
        }
        resolveMic(call);
    }

    @PermissionCallback
    private void micCallback(PluginCall call) {
        resolveMic(call);
    }

    // ---------- storage / audio ----------

    private String storageAlias() {
        if (Build.VERSION.SDK_INT >= 33) return "audio";
        if (Build.VERSION.SDK_INT >= 29) return "storage";
        if (Build.VERSION.SDK_INT >= 23) return "legacyStorage";
        return null;
    }

    private boolean storageOn() {
        String alias = storageAlias();
        if (alias == null) return true;
        boolean read = ContextCompat.checkSelfPermission(getContext(), Build.VERSION.SDK_INT >= 33 ? "android.permission.READ_MEDIA_AUDIO" : Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        boolean write = Build.VERSION.SDK_INT >= 29 || ContextCompat.checkSelfPermission(getContext(), Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
        return read && write;
    }

    private void resolveStorage(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", storageOn());
        call.resolve(ret);
    }

    @PluginMethod
    public void storageStatus(PluginCall call) {
        resolveStorage(call);
    }

    @PluginMethod
    public void requestStorage(PluginCall call) {
        String alias = storageAlias();
        if (alias != null && !storageOn()) {
            getActivity().runOnUiThread(() -> requestPermissionForAlias(alias, call, "storageCallback"));
            return;
        }
        resolveStorage(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        resolveStorage(call);
    }

    // ---------- background keep-alive service ----------

    @PluginMethod
    public void bgStart(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(ctx, HorizonBgService.class);
            HorizonBgService.wanted = true;
            if (Build.VERSION.SDK_INT >= 26) {
                ContextCompat.startForegroundService(ctx, i);
            } else {
                ctx.startService(i);
            }
            JSObject ret = new JSObject();
            ret.put("running", true);
            call.resolve(ret);
        } catch (Exception e) {
            HorizonBgService.wanted = false;
            call.reject("Could not start the background service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void bgStop(PluginCall call) {
        try {
            HorizonBgService.wanted = false;
            getContext().stopService(new Intent(getContext(), HorizonBgService.class));
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not stop the background service: " + e.getMessage());
        }
    }

    @PluginMethod
    public void bgStatus(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("running", HorizonBgService.running || HorizonBgService.wanted);
        call.resolve(ret);
    }

    // ---------- battery optimisation (with phone-maker fallbacks) ----------

    private boolean tryStart(Intent i) {
        try {
            getActivity().startActivity(i);
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private Intent comp(String pkg, String cls) {
        Intent i = new Intent();
        i.setComponent(new ComponentName(pkg, cls));
        return i;
    }

    private boolean openMakerBatteryPage() {
        Intent[] oem = new Intent[] {
            comp("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            comp("com.hihonor.systemmanager", "com.hihonor.systemmanager.optimize.process.ProtectActivity"),
            comp("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"),
            comp("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity"),
            comp("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity"),
            comp("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity"),
            comp("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")
        };
        for (Intent i : oem) {
            if (tryStart(i)) return true;
        }
        return false;
    }

    @PluginMethod
    public void batteryStatus(PluginCall call) {
        boolean ignoring = true;
        if (Build.VERSION.SDK_INT >= 23) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        }
        JSObject ret = new JSObject();
        ret.put("ignoring", ignoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestBatteryExemption(PluginCall call) {
        Context ctx = getContext();
        JSObject ret = new JSObject();
        Intent direct = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
        direct.setData(Uri.parse("package:" + ctx.getPackageName()));
        if (tryStart(direct)) {
            ret.put("via", "prompt");
            call.resolve(ret);
            return;
        }
        if (tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))) {
            ret.put("via", "list");
            call.resolve(ret);
            return;
        }
        if (openMakerBatteryPage()) {
            ret.put("via", "maker");
            call.resolve(ret);
            return;
        }
        Intent app = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        app.setData(Uri.parse("package:" + ctx.getPackageName()));
        if (tryStart(app)) {
            ret.put("via", "app");
            call.resolve(ret);
            return;
        }
        call.reject("No battery settings page could be opened on this phone.");
    }

    @PluginMethod
    public void openBatterySettings(PluginCall call) {
        JSObject ret = new JSObject();
        if (tryStart(new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)) || openMakerBatteryPage()) {
            ret.put("via", "list");
            call.resolve(ret);
            return;
        }
        openAppSettings(call);
    }

    // V1.8.0: open Android's own text-to-speech settings so more voices and accents can be installed
    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        String[] actions = {
            "com.android.settings.TTS_SETTINGS",
            android.speech.tts.TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA,
            Settings.ACTION_SETTINGS
        };
        Exception last = null;
        for (String action : actions) {
            try {
                getActivity().startActivity(new Intent(action));
                call.resolve();
                return;
            } catch (Exception e) {
                last = e;
            }
        }
        call.reject("Could not open the voice settings: " + (last != null ? last.getMessage() : "no settings page found"));
    }

    // V1.10.0: list every audio file Android has indexed on the phone (internal storage and SD card).
    // Needs the same audio / storage permission as the downloads. Runs off the UI thread.
    @PluginMethod
    public void scanMusic(final PluginCall call) {
        if (!storageOn()) {
            call.reject("Music and audio access is not granted. Turn on File access under PERMISSIONS.");
            return;
        }
        new Thread(new Runnable() {
            @Override
            public void run() {
                Cursor c = null;
                try {
                    String[] proj = {
                        MediaStore.Audio.Media._ID, MediaStore.Audio.Media.TITLE, MediaStore.Audio.Media.ARTIST,
                        MediaStore.Audio.Media.ALBUM, MediaStore.Audio.Media.DURATION, MediaStore.Audio.Media.DATA,
                        MediaStore.Audio.Media.SIZE, MediaStore.Audio.Media.DATE_ADDED, MediaStore.Audio.Media.IS_MUSIC
                    };
                    String sel = MediaStore.Audio.Media.DURATION + " >= 20000 AND "
                        + MediaStore.Audio.Media.IS_RINGTONE + " = 0 AND "
                        + MediaStore.Audio.Media.IS_NOTIFICATION + " = 0 AND "
                        + MediaStore.Audio.Media.IS_ALARM + " = 0";
                    c = getContext().getContentResolver().query(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, proj, sel, null,
                        MediaStore.Audio.Media.DATE_ADDED + " DESC");
                    JSArray list = new JSArray();
                    int n = 0;
                    if (c != null) {
                        while (c.moveToNext() && n < 8000) {
                            String path = c.getString(5);
                            if (path == null || path.length() == 0) continue;
                            JSObject o = new JSObject();
                            o.put("id", c.getLong(0));
                            o.put("title", c.getString(1));
                            o.put("artist", c.getString(2));
                            o.put("album", c.getString(3));
                            o.put("duration", c.getLong(4));
                            o.put("path", path);
                            o.put("size", c.getLong(6));
                            o.put("added", c.getLong(7));
                            o.put("music", c.getInt(8) != 0);
                            list.put(o);
                            n++;
                        }
                    }
                    JSObject ret = new JSObject();
                    ret.put("tracks", list);
                    ret.put("count", n);
                    call.resolve(ret);
                } catch (Exception e) {
                    call.reject("Could not scan for music: " + e.getMessage());
                } finally {
                    if (c != null) c.close();
                }
            }
        }).start();
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            i.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open app settings: " + e.getMessage());
        }
    }
}
