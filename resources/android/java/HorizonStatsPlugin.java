package __APPID__;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.NetworkRequest;
import android.os.Handler;
import android.os.Looper;
import android.os.BatteryManager;
import android.os.Environment;
import android.os.Process;
import android.os.StatFs;
import android.os.SystemClock;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.BufferedReader;
import java.io.FileReader;

/**
 * Horizon Stats: one cheap read of RAM, storage, battery, CPU and "is a VPN up".
 * Nothing is stored or sent anywhere; the JS side only paints it in the left panel.
 * CPU: Android 8+ hides /proc/stat from apps, so when it cannot be read the plugin reports
 * Horizon's own share of the CPU (cpuApp) and leaves the system-wide figure at -1.
 */
@CapacitorPlugin(name = "HorizonStats")
public class HorizonStatsPlugin extends Plugin {

    private long lastBusy = -1;
    private long lastTotal = -1;
    private long lastProcCpu = -1;
    private long lastWall = -1;

    private int sysCpuPercent() {
        BufferedReader r = null;
        try {
            r = new BufferedReader(new FileReader("/proc/stat"));
            String line = r.readLine();
            if (line == null || !line.startsWith("cpu")) return -1;
            String[] p = line.trim().split("\\s+");
            long total = 0;
            long idle = 0;
            for (int i = 1; i < p.length && i <= 8; i++) {
                long v = Long.parseLong(p[i]);
                total += v;
                if (i == 4 || i == 5) idle += v;
            }
            long busy = total - idle;
            int out = -1;
            if (lastTotal >= 0 && total > lastTotal) {
                out = (int) Math.round(100.0 * (busy - lastBusy) / (double) (total - lastTotal));
                if (out < 0) out = 0;
                if (out > 100) out = 100;
            }
            lastBusy = busy;
            lastTotal = total;
            return out;
        } catch (Exception e) {
            return -1;
        } finally {
            try { if (r != null) r.close(); } catch (Exception ignored) { /* nothing to close */ }
        }
    }

    private int appCpuPercent() {
        long cpu = Process.getElapsedCpuTime();
        long wall = SystemClock.elapsedRealtime();
        int out = -1;
        if (lastWall >= 0 && wall > lastWall) {
            int cores = Math.max(1, Runtime.getRuntime().availableProcessors());
            out = (int) Math.round(100.0 * (cpu - lastProcCpu) / (double) ((wall - lastWall) * cores));
            if (out < 0) out = 0;
            if (out > 100) out = 100;
        }
        lastProcCpu = cpu;
        lastWall = wall;
        return out;
    }

    private boolean vpnUp(Context ctx) {
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm == null) return false;
            Network[] all = cm.getAllNetworks();
            for (Network n : all) {
                NetworkCapabilities caps = cm.getNetworkCapabilities(n);
                if (caps != null && caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) return true;
            }
        } catch (Exception ignored) {
            // permission missing or service unavailable: report "no VPN seen"
        }
        return false;
    }


    // V1.43.0: link details. type = the physical link under any VPN (wifi, cellular, ethernet, none).
    private JSObject netInfo(Context ctx) {
        JSObject o = new JSObject();
        boolean vpn = false;
        String type = "none";
        boolean online = false;
        boolean metered = false;
        try {
            ConnectivityManager cm = (ConnectivityManager) ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                for (Network n : cm.getAllNetworks()) {
                    NetworkCapabilities c = cm.getNetworkCapabilities(n);
                    if (c == null) continue;
                    if (c.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) { vpn = true; continue; }
                    if (!c.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)) continue;
                    boolean ok = c.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED);
                    if (ok || type.equals("none")) {
                        if (c.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) type = "wifi";
                        else if (c.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) type = "cellular";
                        else if (c.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) type = "ethernet";
                        else type = "other";
                        online = online || ok;
                        metered = !c.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED);
                    }
                }
            }
        } catch (Exception ignored) {
            // permission missing or service unavailable: report what we have
        }
        o.put("vpn", vpn);
        o.put("netType", type);
        o.put("netOnline", online);
        o.put("netMetered", metered);
        return o;
    }

    private ConnectivityManager.NetworkCallback watcher;
    private final Handler mainH = new Handler(Looper.getMainLooper());
    private final Runnable pushNet = new Runnable() {
        @Override public void run() {
            try { notifyListeners("netChange", netInfo(getContext())); } catch (Exception ignored) { /* bridge gone */ }
        }
    };

    /** Pushes a "netChange" event the moment Wi-Fi, mobile data or a VPN comes or goes (debounced). */
    @PluginMethod
    public synchronized void startWatch(PluginCall call) {
        try {
            if (watcher == null) {
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) {
                    watcher = new ConnectivityManager.NetworkCallback() {
                        private void kick() { mainH.removeCallbacks(pushNet); mainH.postDelayed(pushNet, 500); }
                        @Override public void onAvailable(Network n) { kick(); }
                        @Override public void onLost(Network n) { kick(); }
                        @Override public void onCapabilitiesChanged(Network n, NetworkCapabilities c) { kick(); }
                    };
                    cm.registerNetworkCallback(new NetworkRequest.Builder().build(), watcher);
                }
            }
            JSObject o = netInfo(getContext());
            o.put("watching", watcher != null);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Watch failed: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (watcher != null) {
                ConnectivityManager cm = (ConnectivityManager) getContext().getSystemService(Context.CONNECTIVITY_SERVICE);
                if (cm != null) cm.unregisterNetworkCallback(watcher);
                watcher = null;
            }
        } catch (Exception ignored) {
            // already unregistered
        }
        super.handleOnDestroy();
    }

    @PluginMethod
    public synchronized void snapshot(PluginCall call) {
        try {
            Context ctx = getContext();
            JSObject o = new JSObject();

            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                am.getMemoryInfo(mi);
                o.put("ramTotal", mi.totalMem);
                o.put("ramAvail", mi.availMem);
            }

            StatFs fs = new StatFs(Environment.getDataDirectory().getPath());
            o.put("storTotal", fs.getTotalBytes());
            o.put("storFree", fs.getAvailableBytes());

            Intent b = ctx.registerReceiver(null, new IntentFilter(Intent.ACTION_BATTERY_CHANGED));
            if (b != null) {
                int level = b.getIntExtra(BatteryManager.EXTRA_LEVEL, -1);
                int scale = b.getIntExtra(BatteryManager.EXTRA_SCALE, 100);
                int status = b.getIntExtra(BatteryManager.EXTRA_STATUS, -1);
                int temp = b.getIntExtra(BatteryManager.EXTRA_TEMPERATURE, -1);
                if (level >= 0 && scale > 0) o.put("batPct", Math.round(100f * level / scale));
                o.put("batCharging", status == BatteryManager.BATTERY_STATUS_CHARGING || status == BatteryManager.BATTERY_STATUS_FULL);
                if (temp > 0) o.put("batTempC", temp / 10.0);
            }

            o.put("cpuSys", sysCpuPercent());
            o.put("cpuApp", appCpuPercent());
            o.put("cores", Runtime.getRuntime().availableProcessors());
            o.put("vpn", vpnUp(ctx));
            JSObject ni = netInfo(ctx);
            o.put("netType", ni.getString("netType"));
            o.put("netOnline", ni.getBool("netOnline"));
            o.put("netMetered", ni.getBool("netMetered"));
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Stats failed: " + e.getMessage());
        }
    }
}
