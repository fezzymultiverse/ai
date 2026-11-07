package __APPID__;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.util.Base64;
import android.view.PixelCopy;
import android.view.View;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

/**
 * Horizon Lens: takes a real picture of the app window (what Fezzy actually sees, WebView and
 * all) so a vision model can judge the look. The JS side blurs the Vault, keys and other private
 * fields before it asks for the picture. Nothing is saved to disk: the JPEG goes straight back
 * to the page as base64.
 */
@CapacitorPlugin(name = "HorizonLens")
public class HorizonLensPlugin extends Plugin {

    private static int clamp(int v, int lo, int hi) {
        return Math.max(lo, Math.min(hi, v));
    }

    @PluginMethod
    public void shot(final PluginCall call) {
        final int max = clamp(call.getInt("max", 1024), 320, 1600);
        final int quality = clamp(call.getInt("quality", 80), 40, 95);
        if (getActivity() == null) {
            call.reject("No activity to capture");
            return;
        }
        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    final View root = getActivity().getWindow().getDecorView();
                    final int w = root.getWidth();
                    final int h = root.getHeight();
                    if (w < 2 || h < 2) {
                        call.reject("The screen has no size yet");
                        return;
                    }
                    final Bitmap full = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        PixelCopy.request(getActivity().getWindow(), full, new PixelCopy.OnPixelCopyFinishedListener() {
                            @Override
                            public void onPixelCopyFinished(int result) {
                                if (result == PixelCopy.SUCCESS) {
                                    encodeAndResolve(call, full, max, quality, "pixelcopy");
                                } else {
                                    drawFallback(call, root, full, max, quality);
                                }
                            }
                        }, new Handler(Looper.getMainLooper()));
                    } else {
                        drawFallback(call, root, full, max, quality);
                    }
                } catch (Throwable t) {
                    call.reject("Capture failed: " + t.getMessage());
                }
            }
        });
    }

    private void drawFallback(PluginCall call, View root, Bitmap bmp, int max, int quality) {
        try {
            Canvas canvas = new Canvas(bmp);
            root.draw(canvas);
            encodeAndResolve(call, bmp, max, quality, "draw");
        } catch (Throwable t) {
            call.reject("Capture failed: " + t.getMessage());
        }
    }

    private void encodeAndResolve(final PluginCall call, final Bitmap full, final int max, final int quality, final String via) {
        new Thread(new Runnable() {
            @Override
            public void run() {
                try {
                    int w = full.getWidth();
                    int h = full.getHeight();
                    float r = Math.min(1f, (float) max / (float) Math.max(w, h));
                    Bitmap out = full;
                    if (r < 1f) {
                        out = Bitmap.createScaledBitmap(full, Math.max(1, Math.round(w * r)), Math.max(1, Math.round(h * r)), true);
                    }
                    ByteArrayOutputStream bos = new ByteArrayOutputStream();
                    out.compress(Bitmap.CompressFormat.JPEG, quality, bos);
                    byte[] bytes = bos.toByteArray();
                    JSObject ret = new JSObject();
                    ret.put("b64", Base64.encodeToString(bytes, Base64.NO_WRAP));
                    ret.put("mime", "image/jpeg");
                    ret.put("w", out.getWidth());
                    ret.put("h", out.getHeight());
                    ret.put("bytes", bytes.length);
                    ret.put("via", via);
                    if (out != full) out.recycle();
                    full.recycle();
                    call.resolve(ret);
                } catch (Throwable t) {
                    call.reject("Capture failed: " + t.getMessage());
                }
            }
        }).start();
    }
}
