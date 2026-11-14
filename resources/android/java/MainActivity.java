package __APPID__;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // V1.93.5: lets the AI service wake the page while the app is in the background (a held group round must keep running)
    private static java.lang.ref.WeakReference<MainActivity> liveRef = new java.lang.ref.WeakReference<>(null);
    public static void keepPageRunning() {
        try {
            final MainActivity a = liveRef.get();
            if (a == null) return;
            a.runOnUiThread(() -> {
                try {
                    WebView wv = a.getBridge() != null ? a.getBridge().getWebView() : null;
                    if (wv != null) { wv.onResume(); wv.resumeTimers(); }
                } catch (Exception ignored) { /* the next 5 s check tries again */ }
            });
        } catch (Exception ignored) { /* nothing to do */ }
    }
    // V1.93.9: "Bigger" UI size. Raises only this app's density, before any view exists, so the WebView lays out at the new width.
    @Override
    protected void attachBaseContext(android.content.Context base) {
        try {
            int dens = HorizonDisplayPlugin.densityFor(base);
            if (dens > 0) {
                android.content.res.Configuration c = new android.content.res.Configuration(base.getResources().getConfiguration());
                c.densityDpi = dens;
                super.attachBaseContext(base.createConfigurationContext(c));
                return;
            }
        } catch (Exception ignored) { /* fall through to the normal size */ }
        super.attachBaseContext(base);
    }
    @Override
    public void onCreate(Bundle savedInstanceState) {
        liveRef = new java.lang.ref.WeakReference<>(this);
        installCrashRecorder();                 // V1.63.2: if Horizon crashes, the next launch shows why (no adb needed)
        registerPlugin(HorizonPermsPlugin.class);
        registerPlugin(HorizonAIPlugin.class);
        registerPlugin(HorizonMediaPlugin.class);
        registerPlugin(HorizonSpeechPlugin.class);
        registerPlugin(HorizonDaemonPlugin.class);   // V1.74.0: Proactive Daemon (battery + heat watcher)
        registerPlugin(HorizonLensPlugin.class);
        registerPlugin(HorizonStatsPlugin.class);
        registerPlugin(HorizonBrowserPlugin.class);
        registerPlugin(HorizonWhatsAppPlugin.class);
        registerPlugin(HorizonCheckinPlugin.class);
        registerPlugin(HorizonTermuxPlugin.class);
        registerPlugin(HorizonExtractorPlugin.class);
        registerPlugin(HorizonLockPlugin.class);
        registerPlugin(HorizonAlarmPlugin.class);   // V1.68.0: calendar wake-up alarms
        registerPlugin(HorizonDisplayPlugin.class);   // V1.93.9: UI size and refresh rate (Personalisation)
        super.onCreate(savedInstanceState);
        try {
            String release = getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            android.content.SharedPreferences assets = getSharedPreferences("horizon_assets", MODE_PRIVATE);
            if (!release.equals(assets.getString("release", "")) || !assets.getBoolean("android_voice_studio_v1", false)) {
                if (getBridge() != null && getBridge().getWebView() != null) getBridge().getWebView().clearCache(true);
                assets.edit().putString("release", release).putBoolean("android_voice_studio_v1", true).apply();
            }
        } catch (Exception ignored) { /* Do not erase user storage or block launch. */ }
        handleAlarmIntent(getIntent());           // V1.68.0: opened by a ringing alarm: show over the lock screen
        showLastCrash();                          // V1.63.2: a saved crash report from the last run, if any
        HorizonPermsPlugin.paintBackdrop(this);   // V1.44.0: theme colour behind the page, no white flash
        // V1.58.2: pin the keyboard behaviour (the page shrinks above the keyboard) instead of leaving it to the device default.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNCHANGED);
        requestHighRefresh();
        watchKeyboard();

        // One-time Android-only migration. No chats, keys, attachments or recordings are touched.
        final android.content.SharedPreferences migration = getSharedPreferences("horizon_voice_migration", MODE_PRIVATE);
        if (!migration.getBoolean("android_only_v1", false)) {
            new Thread(() -> {
                boolean cleaned = true;
                for (String dir : new String[]{"horizon_voice", "horizon_packs", "sherpa"}) {
                    try { java.io.File oldVoice = new java.io.File(getFilesDir(), dir); deleteTree(oldVoice); if (oldVoice.exists()) cleaned = false; }
                    catch (Throwable ignored) { cleaned = false; }
                }
                if (cleaned) migration.edit().putBoolean("android_only_v1", true).apply();
            }, "horizon-voice-cleanup").start();
        }

        // Keep existing music/voice-note autoplay behaviour; Android TTS no longer uses WebView audio.
        try {
            WebView media = getBridge() != null ? getBridge().getWebView() : null;
            if (media != null) media.getSettings().setMediaPlaybackRequiresUserGesture(false);
        } catch (Exception ignored) {
            // the JS side falls back to other audio paths
        }

        // Back never closes Horizon: it steps back through panels, then sends the app to the
        // background (instead of destroying the activity, which restarts the app next time).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (HorizonLockPlugin.locked) { moveTaskToBack(true); return; }   // V1.43.0: Back never gets past the lock screen
                if (HorizonBrowserPlugin.handleBack()) return;
                WebView wv = getBridge() != null ? getBridge().getWebView() : null;
                if (wv != null && wv.canGoBack()) {
                    wv.goBack();
                } else {
                    moveTaskToBack(true);
                }
            }
        });
    }

    // V1.63.0: tell the page exactly when the keyboard starts and stops sliding. The page used to guess from resize events
    // (an 80 px change, then 220 ms of quiet), which left the interface busy or stuck while the keyboard lifted and collapsed.
    // Android reports the real start and end of the slide, so the page can pause its work for exactly that long.
    // V1.63.2: crash recorder. A crash writes its stack trace into private storage; the next launch shows it in a dialog
    // with a Copy button, so the cause can be read on the phone without a computer.
    private void installCrashRecorder() {
        try {
            final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
            final android.content.Context app = getApplicationContext();
            Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
                try {
                    java.io.StringWriter sw = new java.io.StringWriter();
                    e.printStackTrace(new java.io.PrintWriter(sw));
                    String s = sw.toString();
                    if (s.length() > 6000) s = s.substring(0, 6000);
                    app.getSharedPreferences("horizon_crash", 0).edit().putString("trace", "Thread: " + t.getName() + "\n" + s).commit();
                } catch (Throwable ignored) {
                    // recording must never make a crash worse
                }
                if (prev != null) prev.uncaughtException(t, e);
            });
        } catch (Throwable ignored) {
            // no recorder: Android shows its normal crash behaviour
        }
    }

    private void showLastCrash() {
        try {
            final android.content.SharedPreferences sp = getSharedPreferences("horizon_crash", 0);
            final String trace = sp.getString("trace", null);
            if (trace == null) return;
            sp.edit().remove("trace").apply();
            android.widget.TextView tv = new android.widget.TextView(this);
            tv.setText(trace);
            tv.setTextSize(11f);
            tv.setTextIsSelectable(true);
            tv.setPadding(32, 24, 32, 24);
            android.widget.ScrollView sv = new android.widget.ScrollView(this);
            sv.addView(tv);
            new android.app.AlertDialog.Builder(this)
                .setTitle("Horizon crashed last time")
                .setView(sv)
                .setPositiveButton("Copy", (d, w) -> {
                    try {
                        android.content.ClipboardManager cm = (android.content.ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                        cm.setPrimaryClip(android.content.ClipData.newPlainText("Horizon crash", trace));
                    } catch (Throwable ignored) {
                        // nothing to do
                    }
                })
                .setNegativeButton("Close", null)
                .show();
        } catch (Throwable ignored) {
            // the report is already cleared; nothing else to do
        }
    }


    // V1.68.0: a ringing alarm opens Horizon over the lock screen with Stop and Snooze buttons.
    private void handleAlarmIntent(android.content.Intent i) {
        if (i != null && i.getBooleanExtra("hz_stop", false)) {   // "Stop + brief" from the notification
            i.removeExtra("hz_stop");
            startService(new android.content.Intent(this, HorizonAlarmService.class).setAction(HorizonAlarmService.ACT_STOP));
            if (i.getBooleanExtra("hz_brief", false)) { HorizonAlarms.setBriefPending(this); HorizonAIPlugin.dispatchToJs("horizon-brief", "{}"); }
            return;
        }
        if (i == null || !i.getBooleanExtra("hz_alarm", false)) return;
        i.removeExtra("hz_alarm");
        try {
            if (Build.VERSION.SDK_INT >= 27) { setShowWhenLocked(true); setTurnScreenOn(true); }
            else getWindow().addFlags(WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON);
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            if (!HorizonAlarmService.ringing) return;   // already stopped from the notification
            String title = i.getStringExtra("hz_title"), body = i.getStringExtra("hz_body");
            final boolean brief = i.getBooleanExtra("hz_brief", false);
            new android.app.AlertDialog.Builder(this)
                .setTitle(title == null ? "Alarm" : title)
                .setMessage(body == null ? "" : body)
                .setCancelable(false)
                .setPositiveButton(brief ? "Stop + brief" : "Stop", (d, w) -> { startService(new android.content.Intent(this, HorizonAlarmService.class).setAction(HorizonAlarmService.ACT_STOP)); if (brief) { HorizonAlarms.setBriefPending(this); HorizonAIPlugin.dispatchToJs("horizon-brief", "{}"); } })
                .setNegativeButton("Snooze 10 min", (d, w) -> startService(new android.content.Intent(this, HorizonAlarmService.class).setAction(HorizonAlarmService.ACT_SNOOZE)))
                .show();
        } catch (Throwable ignored) {
            // the notification buttons still stop it
        }
    }

    private boolean kbWatching = false;
    private boolean kbAnimating = false;
    private final Runnable kbWatchdog = () -> {
        if (!kbAnimating) return;
        kbAnimating = false;
        WindowInsetsCompat now = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
        sendKeyboard(false, now != null && now.isVisible(WindowInsetsCompat.Type.ime()));
        reportCover();
    };
    private void watchKeyboard() {
        try {
            final View decor = getWindow().getDecorView();
            ViewCompat.setWindowInsetsAnimationCallback(decor,
                new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                    @Override
                    public void onPrepare(WindowInsetsAnimationCompat animation) {
                        if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) sendKeyboard(true, true);
                    }
                    @Override
                    public WindowInsetsCompat onProgress(WindowInsetsCompat insets, java.util.List<WindowInsetsAnimationCompat> running) {
                        return insets;   // the page is not touched per frame
                    }
                    @Override
                    public void onEnd(WindowInsetsAnimationCompat animation) {
                        if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) == 0) return;
                        kbAnimating = false;
                        WindowInsetsCompat now = ViewCompat.getRootWindowInsets(decor);
                        sendKeyboard(false, now != null && now.isVisible(WindowInsetsCompat.Type.ime()));
                        decor.postDelayed(coverRunner, 60);    // V1.67.1: measure once the layout has settled
                        decor.postDelayed(coverRunner, 350);
                    }
                });
            // V1.67.1: any layout change (the page resizing for the keyboard) re-measures how much of the page the keyboard covers
            coverListener = new android.view.ViewTreeObserver.OnGlobalLayoutListener() {
                @Override
                public void onGlobalLayout() { reportCover(); }
            };
            decor.getViewTreeObserver().addOnGlobalLayoutListener(coverListener);
            kbWatching = true;
        } catch (Throwable ignored) {
            // the page falls back to its own resize-based guard
        }
    }

    // V1.67.1: how many CSS pixels of the bottom of the WebView the keyboard covers (0 when the page already shrank above it).
    // The page (horizon_lift.js) uses this to keep the message box on top of the keyboard on phones that do not resize the page.
    private android.view.ViewTreeObserver.OnGlobalLayoutListener coverListener = null;
    private int lastCoverPx = -1;
    private final Runnable coverRunner = new Runnable() {
        @Override
        public void run() { reportCover(); }
    };
    private void reportCover() {
        if (kbAnimating) return;
        try {
            final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv == null) return;
            final View decor = getWindow().getDecorView();
            WindowInsetsCompat ins = ViewCompat.getRootWindowInsets(decor);
            int imeBottom = 0;
            if (ins != null && ins.isVisible(WindowInsetsCompat.Type.ime())) {
                imeBottom = ins.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            }
            int cover = 0;
            if (imeBottom > 0) {
                int[] wl = new int[2];
                int[] dl = new int[2];
                wv.getLocationOnScreen(wl);
                decor.getLocationOnScreen(dl);
                int webBottom = wl[1] + wv.getHeight();
                int keyboardTop = dl[1] + decor.getHeight() - imeBottom;
                cover = Math.max(0, webBottom - keyboardTop);
            }
            final float density = getResources().getDisplayMetrics().density;
            if (cover < Math.round(4 * density)) cover = 0;
            if (cover == lastCoverPx) return;
            lastCoverPx = cover;
            final int css = Math.round(cover / density);
            final String js = "window.hzKbCover&&window.hzKbCover(" + css + ")";
            wv.post(() -> wv.evaluateJavascript(js, null));
        } catch (Throwable ignored) {
            // the page falls back to its own measurement
        }
    }

    private void sendKeyboard(boolean moving, boolean visible) {
        final View decor = getWindow().getDecorView();
        if (moving && !kbAnimating) decor.postDelayed(kbWatchdog, 1200);
        if (!moving) decor.removeCallbacks(kbWatchdog);
        kbAnimating = moving;
        try {
            final WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            if (wv == null) return;
            final String js = "window.hzKbNative&&window.hzKbNative(" + moving + "," + visible + ")";
            wv.post(() -> wv.evaluateJavascript(js, null));
        } catch (Throwable ignored) {
            // nothing to do
        }
    }

    @Override
    public void onDestroy() {
        try {
            getWindow().getDecorView().removeCallbacks(kbWatchdog);
            getWindow().getDecorView().removeCallbacks(coverRunner);
            if (kbWatching) {
                ViewCompat.setWindowInsetsAnimationCallback(getWindow().getDecorView(), null);   // the callback holds this Activity
                if (coverListener != null) getWindow().getDecorView().getViewTreeObserver().removeOnGlobalLayoutListener(coverListener);
            }
        } catch (Throwable ignored) {
            // already torn down
        }
        super.onDestroy();
    }

    // V1.58.2: ask Android for a 90 Hz display mode. A web page cannot force a refresh rate; the window can ask for one.
    // Android still decides (Battery saver or a fixed 60 Hz setting wins), so this only helps when the screen supports it.
    @SuppressWarnings("deprecation")
    private void requestHighRefresh() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            Display d = getWindowManager().getDefaultDisplay();
            if (d == null) return;
            Display.Mode cur = d.getMode();
            Display.Mode pick = null;
            for (Display.Mode m : d.getSupportedModes()) {
                if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                float hz = m.getRefreshRate();
                if (hz < 89.5f) continue;
                if (pick == null || hz < pick.getRefreshRate()) pick = m;   // the lowest rate that is still 90 or more
            }
            if (pick == null) {   // no 90 Hz mode on this screen: take the fastest one there is
                for (Display.Mode m : d.getSupportedModes()) {
                    if (m.getPhysicalWidth() != cur.getPhysicalWidth() || m.getPhysicalHeight() != cur.getPhysicalHeight()) continue;
                    if (pick == null || m.getRefreshRate() > pick.getRefreshRate()) pick = m;
                }
            }
            if (pick == null) return;
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            if (lp.preferredDisplayModeId == pick.getModeId()) return;
            lp.preferredDisplayModeId = pick.getModeId();
            getWindow().setAttributes(lp);
        } catch (Throwable ignored) {
            // no preferred mode: Android keeps its own choice
        }
    }

    private static void deleteTree(java.io.File f) {
        if (f == null || !f.exists()) return;
        java.io.File[] kids = f.listFiles();
        if (kids != null) for (java.io.File k : kids) deleteTree(k);
        //noinspection ResultOfMethodCallIgnored
        f.delete();
    }

    @Override
    public void onPause() {
        HorizonAIPlugin.foreground = false;
        HorizonWhatsAppListener.uiVisible = false;
        HorizonPermsPlugin.paintBackdrop(this);   // V1.44.0: repaint before Android hides the page
        super.onPause();
        // Let a reply that is still being fetched finish while the app is in the background.
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            // Also keep the WebView running while read-aloud is playing, so cloud audio and the next chunk are not frozen.
            if (wv != null && (HorizonBgService.wanted || HorizonSpeakService.active || HorizonAIService.holding)) { wv.onResume(); wv.resumeTimers(); }   // V1.83.0: a held group round keeps the page running too
        } catch (Exception ignored) {
            // nothing to do
        }
    }
    @Override
    public void onResume() {
        HorizonAIPlugin.foreground = true;
        HorizonWhatsAppListener.uiVisible = true;
        super.onResume();
        HorizonPermsPlugin.paintBackdrop(this);
        requestHighRefresh();
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('horizon-resume'))", null));
        }
    }

    @Override
    protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleAlarmIntent(intent);
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('horizon-reply'))", null));
        }
    }

}
