package __APPID__;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
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
            call.resolve(o);
        } catch (Exception e) {
            call.reject("Stats failed: " + e.getMessage());
        }
    }
}
