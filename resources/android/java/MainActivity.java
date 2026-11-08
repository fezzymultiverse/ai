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
    @Override
    public void onCreate(Bundle savedInstanceState) {
        HorizonCanary.init(getApplication());   // V1.63.0: LeakCanary on (it hooks in by itself; this only tunes it)
        registerPlugin(HorizonPermsPlugin.class);
        registerPlugin(HorizonAIPlugin.class);
        registerPlugin(HorizonMediaPlugin.class);
        registerPlugin(HorizonSpeechPlugin.class);
        registerPlugin(HorizonLensPlugin.class);
        registerPlugin(HorizonStatsPlugin.class);
        registerPlugin(HorizonBrowserPlugin.class);
        registerPlugin(HorizonShellPlugin.class);
        registerPlugin(HorizonLockPlugin.class);
        super.onCreate(savedInstanceState);
        HorizonPermsPlugin.paintBackdrop(this);   // V1.44.0: theme colour behind the page, no white flash
        // V1.58.2: pin the keyboard behaviour (the page shrinks above the keyboard) instead of leaving it to the device default.
        getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE | WindowManager.LayoutParams.SOFT_INPUT_STATE_UNCHANGED);
        requestHighRefresh();
        watchKeyboard();

        // V1.47.0: Piper is gone. Delete the offline voices an older version downloaded (about 80 MB each).
        new Thread(() -> {
            try { deleteTree(new java.io.File(getFilesDir(), "sherpa")); } catch (Throwable ignored) { /* tries again next launch */ }
        }, "horizon-cleanup").start();

        // V1.8.0: let the WebView start audio without a fresh tap. Read-aloud with a cloud voice plays
        // seconds after the tap that asked for it, and Android refuses that unless this is false.
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
    private boolean kbWatching = false;
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
                        WindowInsetsCompat now = ViewCompat.getRootWindowInsets(decor);
                        sendKeyboard(false, now != null && now.isVisible(WindowInsetsCompat.Type.ime()));
                    }
                });
            kbWatching = true;
        } catch (Throwable ignored) {
            // the page falls back to its own resize-based guard
        }
    }

    private void sendKeyboard(boolean moving, boolean visible) {
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
            if (kbWatching) ViewCompat.setWindowInsetsAnimationCallback(getWindow().getDecorView(), null);   // the callback holds this Activity
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
        HorizonPermsPlugin.paintBackdrop(this);   // V1.44.0: repaint before Android hides the page
        super.onPause();
        // Let a reply that is still being fetched finish while the app is in the background.
        try {
            WebView wv = getBridge() != null ? getBridge().getWebView() : null;
            // Also keep the WebView running while read-aloud is playing, so cloud audio and the next chunk are not frozen.
            if (wv != null && (HorizonBgService.wanted || HorizonSpeakService.active)) { wv.onResume(); wv.resumeTimers(); }
        } catch (Exception ignored) {
            // nothing to do
        }
    }
    @Override
    public void onResume() {
        HorizonAIPlugin.foreground = true;
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
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().post(() -> getBridge().getWebView().evaluateJavascript(
                "window.dispatchEvent(new Event('horizon-reply'))", null));
        }
    }

}
