package __APPID__;

import android.os.Bundle;
import android.webkit.WebView;

import androidx.activity.OnBackPressedCallback;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
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
