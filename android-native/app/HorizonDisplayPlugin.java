package __APPID__;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.TreeSet;

/**
 * Horizon Display (V1.93.9): the two Personalisation choices that need Android itself.
 *  - UI size: Normal or Bigger. Bigger raises this app's own screen density (never the whole phone) by about one
 *    Android "Display size" step, and never so far that the screen gets narrower than 320 dp (that is where rows start to squeeze).
 *  - Refresh rate: Auto, 30, 60 or 90 Hz, as a request to Android. The screen only offers the rates it really has.
 * Nothing is stored except two small numbers in this app's private preferences.
 */
@CapacitorPlugin(name = "HorizonDisplay")
public class HorizonDisplayPlugin extends Plugin {

    static final String PREFS = "horizon_display";
    static final int MIN_WIDTH_DP = 320;

    /** The biggest percentage that keeps the short screen side at 320 dp or more, capped at one display-size step (112%). */
    static int bigPct(Context appCtx) {
        try {
            DisplayMetrics m = appCtx.getResources().getDisplayMetrics();
            int dens = appCtx.getResources().getConfiguration().densityDpi;
            if (dens <= 0) return 100;
            float widthDp = Math.min(m.widthPixels, m.heightPixels) * 160f / dens;
            int pct = 112;
            if (widthDp * 100f / pct < MIN_WIDTH_DP) pct = (int) Math.floor(widthDp * 100f / MIN_WIDTH_DP);
            return Math.max(100, Math.min(pct, 125));
        } catch (Exception e) {
            return 100;
        }
    }

    /** Called by MainActivity before the screen is built: the density this app should use, or 0 for "leave it alone". */
    static int densityFor(Context base) {
        try {
            int saved = base.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("ui_pct", 100);
            if (saved <= 100) return 0;
            int pct = Math.min(saved, bigPct(base));   // a saved value can never push the screen below 320 dp
            if (pct <= 100) return 0;
            int dens = base.getResources().getConfiguration().densityDpi;
            return Math.round(dens * pct / 100f);
        } catch (Exception e) {
            return 0;
        }
    }

    private Display display() {
        return getActivity().getWindowManager().getDefaultDisplay();
    }

    @PluginMethod
    public void info(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                Context app = getActivity().getApplicationContext();
                DisplayMetrics m = app.getResources().getDisplayMetrics();
                int dens = app.getResources().getConfiguration().densityDpi;
                int base = Math.min(m.widthPixels, m.heightPixels);
                int big = bigPct(app);
                JSObject o = new JSObject();
                o.put("pxWide", base);
                o.put("normalDp", Math.round(base * 160f / Math.max(1, dens)));
                o.put("bigPct", big);
                o.put("bigDp", Math.round(base * 160f / Math.max(1, dens) * 100f / Math.max(100, big)));
                o.put("pct", getActivity().getSharedPreferences(PREFS, Context.MODE_PRIVATE).getInt("ui_pct", 100));
                Display d = display();
                o.put("current", Math.round(d.getRefreshRate()));
                TreeSet<Integer> rates = new TreeSet<>();
                if (Build.VERSION.SDK_INT >= 23) {
                    Display.Mode cur = d.getMode();
                    for (Display.Mode md : d.getSupportedModes()) {
                        if (md.getPhysicalWidth() == cur.getPhysicalWidth() && md.getPhysicalHeight() == cur.getPhysicalHeight()) {
                            rates.add(Math.round(md.getRefreshRate()));
                        }
                    }
                }
                if (rates.isEmpty()) rates.add(Math.round(d.getRefreshRate()));
                JSArray arr = new JSArray();
                for (Integer r : rates) arr.put(r);
                o.put("supported", arr);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Could not read the display: " + e.getMessage());
            }
        });
    }

    /** hz = 0 means Auto. Picks the screen mode closest to the request (an exact match, else a multiple such as 30 on a 60 Hz mode, else the nearest). */
    @PluginMethod
    public void setRate(final PluginCall call) {
        final int hz = call.getInt("hz", 0);
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                WindowManager.LayoutParams p = w.getAttributes();
                int chosen = 0;
                boolean exact = true;
                if (hz <= 0) {
                    p.preferredRefreshRate = 0f;
                    if (Build.VERSION.SDK_INT >= 23) p.preferredDisplayModeId = 0;
                } else {
                    p.preferredRefreshRate = hz;
                    if (Build.VERSION.SDK_INT >= 23) {
                        Display d = display();
                        Display.Mode cur = d.getMode();
                        Display.Mode best = null;
                        float bestScore = Float.MAX_VALUE;
                        for (Display.Mode md : d.getSupportedModes()) {
                            if (md.getPhysicalWidth() != cur.getPhysicalWidth() || md.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                            float r = md.getRefreshRate();
                            float diff = Math.abs(r - hz);
                            boolean mult = Math.abs(r / hz - Math.round(r / hz)) < 0.03f;
                            float score = diff < 0.5f ? 0f : (mult ? 1000f + r : 5000f + diff);
                            if (best == null || score < bestScore) { best = md; bestScore = score; }
                        }
                        if (best != null) {
                            p.preferredDisplayModeId = best.getModeId();
                            chosen = Math.round(best.getRefreshRate());
                            exact = Math.abs(best.getRefreshRate() - hz) < 0.5f;
                        }
                    }
                }
                w.setAttributes(p);
                getActivity().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("refresh_hz", hz).apply();
                JSObject o = new JSObject();
                o.put("requested", hz);
                o.put("chosen", chosen);
                o.put("exact", exact);
                call.resolve(o);
            } catch (Exception e) {
                call.reject("Could not set the refresh rate: " + e.getMessage());
            }
        });
    }

    /** big=true saves the Bigger size; either way the screen is rebuilt a moment later so the new density takes effect. */
    @PluginMethod
    public void setUiSize(final PluginCall call) {
        final boolean big = Boolean.TRUE.equals(call.getBoolean("big", false));
        try {
            int pct = big ? bigPct(getActivity().getApplicationContext()) : 100;
            getActivity().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putInt("ui_pct", pct).apply();
            JSObject o = new JSObject();
            o.put("pct", pct);
            call.resolve(o);
            new Handler(Looper.getMainLooper()).postDelayed(() -> {
                try { getActivity().recreate(); } catch (Exception ignored) { /* the next launch picks it up */ }
            }, 250);
        } catch (Exception e) {
            call.reject("Could not change the size: " + e.getMessage());
        }
    }
}
