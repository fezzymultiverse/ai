package __APPID__;

import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.net.Uri;
import android.util.Base64;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebStorage;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;
import org.json.JSONTokener;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * Horizon Browser: the native "websheet". One real Android WebView per tab, layered over the Capacitor
 * WebView inside the rectangle the JS side measures (between the Horizon top bars and the chat dock).
 * Why native: iframes cannot load most sites (X-Frame-Options / CSP), a WebView can.
 * The Eye reads the page only when JS asks (getPage / snapshot). Nothing is stored or sent from here.
 */
@CapacitorPlugin(name = "HorizonBrowser")
public class HorizonBrowserPlugin extends Plugin {

    private static HorizonBrowserPlugin instance;

    private final Map<String, WebView> views = new HashMap<>();
    private final Set<String> blockHosts = new HashSet<>();
    private String current = null;
    private boolean visible = false;
    private int topPx = 0;
    private int heightPx = 0;

    private boolean desktop = false;
    private boolean blockTrackers = true;
    private boolean forceHttps = true;
    private boolean dnt = true;
    private boolean jsOn = true;
    private boolean cookies3 = false; // third-party cookies allowed? default blocked
    private boolean popups = false;   // popups allowed? default blocked
    private int blockedCount = 0;

    private View customView = null;
    private WebChromeClient.CustomViewCallback customCb = null;

    private static final String MOBILE_UA_SUFFIX = " HorizonBrowser/1";
    private static final String DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

    @Override
    public void load() {
        instance = this;
        String[] defaults = {
            "doubleclick.net", "googlesyndication.com", "googletagmanager.com", "google-analytics.com",
            "googleadservices.com", "adservice.google.com", "facebook.net", "connect.facebook.net",
            "scorecardresearch.com", "quantserve.com", "hotjar.com", "adsrvr.org", "criteo.com", "criteo.net",
            "taboola.com", "outbrain.com", "amazon-adsystem.com", "adnxs.com", "rubiconproject.com",
            "pubmatic.com", "openx.net", "moatads.com", "mixpanel.com", "segment.io", "segment.com",
            "branch.io", "appsflyer.com", "adjust.com", "app-measurement.com", "analytics.tiktok.com",
            "ads.twitter.com", "static.ads-twitter.com", "ads.linkedin.com", "snap.licdn.com"
        };
        for (String h : defaults) blockHosts.add(h);
    }

    /** Called from MainActivity back handling. True = the browser consumed the back press. */
    public static boolean handleBack() {
        HorizonBrowserPlugin p = instance;
        if (p == null || !p.visible || p.current == null) return false;
        if (p.customView != null) { p.hideCustom(); return true; }
        WebView w = p.views.get(p.current);
        if (w != null && w.canGoBack()) { w.goBack(); return true; }
        p.notifyListeners("backRoot", new JSObject());
        return true;
    }

    private ViewGroup host() {
        View wv = getBridge().getWebView();
        return wv == null ? null : (ViewGroup) wv.getParent();
    }

    private void applyBounds(WebView w) {
        ViewGroup parent = host();
        if (parent == null || w == null) return;
        int ph = parent.getHeight();
        int bottom = Math.max(0, ph - (topPx + heightPx));
        ViewGroup.LayoutParams raw = w.getLayoutParams();
        ViewGroup.MarginLayoutParams lp = raw instanceof ViewGroup.MarginLayoutParams
            ? (ViewGroup.MarginLayoutParams) raw
            : new ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT);
        lp.width = ViewGroup.LayoutParams.MATCH_PARENT;
        lp.height = ViewGroup.LayoutParams.MATCH_PARENT;
        lp.topMargin = Math.max(0, topPx);
        lp.bottomMargin = bottom;
        w.setLayoutParams(lp);
    }

    private void applySettings(WebView w) {
        WebSettings s = w.getSettings();
        s.setJavaScriptEnabled(jsOn);
        s.setDomStorageEnabled(true);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(true);
        s.setBuiltInZoomControls(true);
        s.setDisplayZoomControls(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(popups);
        s.setSupportMultipleWindows(false);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setGeolocationEnabled(false);
        String base = WebSettings.getDefaultUserAgent(getContext());
        s.setUserAgentString(desktop ? DESKTOP_UA : base + MOBILE_UA_SUFFIX);
        CookieManager.getInstance().setAcceptThirdPartyCookies(w, cookies3);
    }

    private JSObject state(String id, WebView w, int progress) {
        JSObject o = new JSObject();
        o.put("id", id);
        o.put("url", w.getUrl() == null ? "" : w.getUrl());
        o.put("title", w.getTitle() == null ? "" : w.getTitle());
        o.put("progress", progress);
        o.put("canGoBack", w.canGoBack());
        o.put("canGoForward", w.canGoForward());
        o.put("blocked", blockedCount);
        return o;
    }

    private boolean isTracker(String host) {
        if (host == null) return false;
        String h = host.toLowerCase();
        while (true) {
            if (blockHosts.contains(h)) return true;
            int dot = h.indexOf('.');
            if (dot < 0 || h.indexOf('.', dot + 1) < 0) return blockHosts.contains(h);
            h = h.substring(dot + 1);
        }
    }

    private WebView create(final String id) {
        final WebView w = new WebView(getActivity());
        w.setBackgroundColor(Color.BLACK);
        applySettings(w);
        w.setDownloadListener((url, ua, cd, mime, len) -> {
            try {
                Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(i);
            } catch (Exception ignored) { }
        });
        w.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest req) {
                Uri u = req.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (scheme.equals("http") && forceHttps && req.isForMainFrame()) {
                    view.loadUrl(u.buildUpon().scheme("https").build().toString(), headers());
                    return true;
                }
                if (scheme.equals("http") || scheme.equals("https")) return false;
                if (req.isForMainFrame() && req.hasGesture() && (scheme.equals("tel") || scheme.equals("mailto"))) {
                    try {
                        Intent i = new Intent(Intent.ACTION_VIEW, u);
                        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                        getContext().startActivity(i);
                    } catch (Exception ignored) { }
                }
                return true; // intent:, market:, custom schemes never launch other apps from a page
            }

            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest req) {
                if (blockTrackers && req.getUrl() != null && isTracker(req.getUrl().getHost())) {
                    blockedCount++;
                    return new WebResourceResponse("text/plain", "utf-8", new ByteArrayInputStream(new byte[0]));
                }
                return null;
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                notifyListeners("page", state(id, view, 5));
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (dnt) {
                    view.evaluateJavascript("try{Object.defineProperty(navigator,'globalPrivacyControl',{value:true});}catch(e){}", null);
                }
                notifyListeners("page", state(id, view, 100));
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest req, WebResourceError err) {
                if (req.isForMainFrame()) {
                    JSObject o = state(id, view, 100);
                    o.put("error", String.valueOf(err.getDescription()));
                    o.put("failedUrl", req.getUrl().toString());
                    notifyListeners("page", o);
                }
            }

            @Override
            public void onReceivedSslError(WebView view, android.webkit.SslErrorHandler handler, android.net.http.SslError error) {
                handler.cancel();
                JSObject o = state(id, view, 100);
                o.put("error", "Certificate problem: connection refused");
                o.put("failedUrl", error.getUrl());
                notifyListeners("page", o);
            }
        });
        w.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int p) {
                if (p < 100) notifyListeners("page", state(id, view, p));
            }

            @Override
            public void onReceivedTitle(WebView view, String title) {
                notifyListeners("page", state(id, view, view.getProgress()));
            }

            @Override
            public void onShowCustomView(View view, CustomViewCallback cb) {
                ViewGroup parent = host();
                if (parent == null) { cb.onCustomViewHidden(); return; }
                if (customView != null) { cb.onCustomViewHidden(); return; }
                customView = view;
                customCb = cb;
                view.setBackgroundColor(Color.BLACK);
                parent.addView(view, new ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            }

            @Override
            public void onHideCustomView() { hideCustom(); }
        });
        ViewGroup parent = host();
        if (parent != null) {
            parent.addView(w, new ViewGroup.MarginLayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        }
        applyBounds(w);
        views.put(id, w);
        return w;
    }

    private void hideCustom() {
        ViewGroup parent = host();
        if (customView != null && parent != null) parent.removeView(customView);
        customView = null;
        if (customCb != null) { try { customCb.onCustomViewHidden(); } catch (Exception ignored) { } }
        customCb = null;
    }

    private Map<String, String> headers() {
        Map<String, String> h = new HashMap<>();
        if (dnt) { h.put("DNT", "1"); h.put("Sec-GPC", "1"); }
        return h;
    }

    private void showOnly(String id) {
        current = id;
        for (Map.Entry<String, WebView> e : views.entrySet()) {
            e.getValue().setVisibility(visible && e.getKey().equals(id) ? View.VISIBLE : View.GONE);
            if (e.getKey().equals(id)) { e.getValue().onResume(); } else { e.getValue().onPause(); }
        }
        WebView w = views.get(id);
        if (w != null) { applyBounds(w); w.bringToFront(); }
    }

    private String normalise(String url) {
        if (url == null) return "";
        String u = url.trim();
        if (forceHttps && u.toLowerCase().startsWith("http://")) u = "https://" + u.substring(7);
        return u;
    }

    @PluginMethod
    public void open(final PluginCall call) {
        final String id = call.getString("id", "t0");
        final String url = normalise(call.getString("url", ""));
        getActivity().runOnUiThread(() -> {
            try {
                WebView w = views.get(id);
                if (w == null) w = create(id);
                visible = true;
                showOnly(id);
                if (!url.isEmpty()) w.loadUrl(url, headers());
                call.resolve();
            } catch (Exception e) {
                call.reject("open failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void navigate(final PluginCall call) {
        final String id = call.getString("id", current);
        final String url = normalise(call.getString("url", ""));
        getActivity().runOnUiThread(() -> {
            WebView w = views.get(id);
            if (w == null) { call.reject("no such tab"); return; }
            w.loadUrl(url, headers());
            call.resolve();
        });
    }

    @PluginMethod
    public void show(final PluginCall call) {
        final String id = call.getString("id", current);
        getActivity().runOnUiThread(() -> {
            if (id == null || !views.containsKey(id)) { call.resolve(); return; }
            visible = true;
            showOnly(id);
            WebView w = views.get(id);
            notifyListeners("page", state(id, w, 100));
            call.resolve();
        });
    }

    @PluginMethod
    public void hide(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            visible = false;
            for (WebView w : views.values()) w.setVisibility(View.GONE);
            call.resolve();
        });
    }

    @PluginMethod
    public void close(final PluginCall call) {
        final String id = call.getString("id", "");
        getActivity().runOnUiThread(() -> {
            WebView w = views.remove(id);
            if (w != null) {
                ViewGroup p = (ViewGroup) w.getParent();
                if (p != null) p.removeView(w);
                w.stopLoading();
                w.destroy();
            }
            if (id.equals(current)) current = null;
            call.resolve();
        });
    }

    @PluginMethod
    public void closeAll(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            hideCustom();
            for (WebView w : views.values()) {
                ViewGroup p = (ViewGroup) w.getParent();
                if (p != null) p.removeView(w);
                w.stopLoading();
                w.destroy();
            }
            views.clear();
            current = null;
            visible = false;
            call.resolve();
        });
    }

    @PluginMethod
    public void back(final PluginCall call) { nav(call, 0); }

    @PluginMethod
    public void forward(final PluginCall call) { nav(call, 1); }

    @PluginMethod
    public void reload(final PluginCall call) { nav(call, 2); }

    @PluginMethod
    public void stop(final PluginCall call) { nav(call, 3); }

    private void nav(final PluginCall call, final int what) {
        final String id = call.getString("id", current);
        getActivity().runOnUiThread(() -> {
            WebView w = views.get(id);
            if (w != null) {
                if (what == 0 && w.canGoBack()) w.goBack();
                else if (what == 1 && w.canGoForward()) w.goForward();
                else if (what == 2) w.reload();
                else if (what == 3) w.stopLoading();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void setBounds(final PluginCall call) {
        final int top = call.getInt("top", 0);
        final int height = call.getInt("height", 0);
        getActivity().runOnUiThread(() -> {
            topPx = top;
            heightPx = height;
            for (WebView w : views.values()) applyBounds(w);
            call.resolve();
        });
    }

    @PluginMethod
    public void setOptions(final PluginCall call) {
        final JSObject o = call.getData();
        getActivity().runOnUiThread(() -> {
            if (o.has("trackers")) blockTrackers = o.optBoolean("trackers", true);
            if (o.has("https")) forceHttps = o.optBoolean("https", true);
            if (o.has("dnt")) dnt = o.optBoolean("dnt", true);
            if (o.has("js")) jsOn = o.optBoolean("js", true);
            if (o.has("cookies3")) cookies3 = !o.optBoolean("cookies3", true); // JS sends "block third-party cookies"
            if (o.has("popups")) popups = !o.optBoolean("popups", true);       // JS sends "block popups"
            boolean wasDesktop = desktop;
            if (o.has("desktop")) desktop = o.optBoolean("desktop", false);
            if (o.has("blockList")) {
                try {
                    org.json.JSONArray a = o.getJSONArray("blockList");
                    Set<String> next = new HashSet<>();
                    for (int i = 0; i < a.length(); i++) {
                        String h = a.getString(i).trim().toLowerCase();
                        if (!h.isEmpty()) next.add(h);
                    }
                    if (!next.isEmpty()) { blockHosts.clear(); blockHosts.addAll(next); }
                } catch (Exception ignored) { }
            }
            for (WebView w : views.values()) {
                applySettings(w);
                if (wasDesktop != desktop) w.reload();
            }
            call.resolve();
        });
    }

    @PluginMethod
    public void getPage(final PluginCall call) {
        final String id = call.getString("id", current);
        final int max = Math.max(500, Math.min(call.getInt("maxChars", 6000), 30000));
        getActivity().runOnUiThread(() -> {
            final WebView w = views.get(id);
            if (w == null) { call.reject("no page"); return; }
            String js = "(function(){try{var b=document.body;var t=b?(b.innerText||''):'';"
                + "var pw=!!document.querySelector('input[type=password]');"
                + "var pay=!!document.querySelector('input[autocomplete^=cc-],input[name*=card i],input[name*=cvv i]');"
                + "var sel=''+(window.getSelection?window.getSelection():'');"
                + "return JSON.stringify({url:location.href,title:document.title,text:t.slice(0," + max + "),len:t.length,login:pw,payment:pay,selection:sel.slice(0,2000)});"
                + "}catch(e){return JSON.stringify({error:String(e)});}})()";
            w.evaluateJavascript(js, value -> {
                try {
                    if (value == null || value.equals("null")) { call.reject("page not readable yet"); return; }
                    Object parsed = new JSONTokener(value).nextValue();
                    String inner = parsed instanceof String ? (String) parsed : value;
                    call.resolve(new JSObject(new JSONObject(inner).toString()));
                } catch (Exception e) {
                    call.reject("read failed: " + e.getMessage());
                }
            });
        });
    }

    @PluginMethod
    public void snapshot(final PluginCall call) {
        final String id = call.getString("id", current);
        final int maxW = Math.max(200, Math.min(call.getInt("maxWidth", 720), 1440));
        final int quality = Math.max(30, Math.min(call.getInt("quality", 70), 95));
        getActivity().runOnUiThread(() -> {
            WebView w = views.get(id);
            if (w == null || w.getWidth() <= 0 || w.getHeight() <= 0) { call.reject("nothing to capture"); return; }
            try {
                float scale = Math.min(1f, (float) maxW / (float) w.getWidth());
                int bw = Math.max(1, Math.round(w.getWidth() * scale));
                int bh = Math.max(1, Math.round(w.getHeight() * scale));
                Bitmap bmp = Bitmap.createBitmap(bw, bh, Bitmap.Config.ARGB_8888);
                Canvas c = new Canvas(bmp);
                c.drawColor(Color.BLACK);
                c.scale(scale, scale);
                w.draw(c);
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                bmp.compress(Bitmap.CompressFormat.JPEG, quality, out);
                bmp.recycle();
                JSObject r = new JSObject();
                r.put("data", Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP));
                r.put("mime", "image/jpeg");
                call.resolve(r);
            } catch (Throwable t) {
                call.reject("snapshot failed: " + t.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearData(final PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                CookieManager.getInstance().removeAllCookies(null);
                CookieManager.getInstance().flush();
                WebStorage.getInstance().deleteAllData();
                for (WebView w : views.values()) { w.clearCache(true); w.clearHistory(); w.clearFormData(); }
                call.resolve();
            } catch (Exception e) {
                call.reject("clear failed: " + e.getMessage());
            }
        });
    }

    @Override
    protected void handleOnDestroy() {
        for (WebView w : views.values()) { try { w.destroy(); } catch (Exception ignored) { } }
        views.clear();
        if (instance == this) instance = null;
    }
}
