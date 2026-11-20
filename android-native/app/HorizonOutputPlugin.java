package __APPID__;

import android.Manifest;
import android.content.ContentValues;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.webkit.MimeTypeMap;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.util.Locale;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

@CapacitorPlugin(name = "HorizonOutput", permissions = {
    @Permission(alias = "storage", strings = {Manifest.permission.WRITE_EXTERNAL_STORAGE})
})
public class HorizonOutputPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private static String mime(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
        if (lower.endsWith(".csv")) return "text/csv";
        String ext = lower.substring(lower.lastIndexOf('.') + 1);
        String type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        return type == null ? "application/octet-stream" : type;
    }
    private boolean valid(PluginCall c) {
        String name = c.getString("name", ""), data = c.getString("data", "");
        if (name.trim().isEmpty() || name.length() > 120 || name.startsWith(".") || name.matches("(?s).*[\\\\/:*?\"<>|\\p{Cntrl}].*") || data.isEmpty() || data.length() > 90000000) {
            c.reject("Invalid download name or size (maximum 64 MiB)."); return false;
        }
        return true;
    }
    // Both artifact buttons obey the Downloads-only rule; never open a Documents picker.
    @PluginMethod public void saveAs(PluginCall c) { download(c); }
    @PluginMethod public void download(PluginCall c) {
        if (!valid(c)) return;
        if (Build.VERSION.SDK_INT < 29 && getPermissionState("storage") != PermissionState.GRANTED) {
            getActivity().runOnUiThread(() -> requestPermissionForAlias("storage", c, "storageResult")); return;
        }
        writeDownload(c);
    }
    @PermissionCallback private void storageResult(PluginCall c) {
        if (getPermissionState("storage") != PermissionState.GRANTED) { c.reject("Allow storage access to save to Downloads."); return; }
        writeDownload(c);
    }
    private void writeDownload(PluginCall c) {
        worker.execute(() -> {
            Uri uri = null; File legacy = null;
            try {
                byte[] bytes = Base64.decode(c.getString("data"), Base64.DEFAULT);
                if (bytes.length == 0 || bytes.length > 64 * 1024 * 1024) throw new IllegalArgumentException();
                String name = c.getString("name"), type = mime(name);
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, type);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    uri = getContext().getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (uri == null) throw new IllegalStateException();
                    try (OutputStream out = getContext().getContentResolver().openOutputStream(uri, "w")) {
                        if (out == null) throw new IllegalStateException();
                        out.write(bytes); out.flush();
                    }
                    values.clear(); values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    if (getContext().getContentResolver().update(uri, values, null, null) != 1) throw new IllegalStateException();
                    try (android.database.Cursor cursor = getContext().getContentResolver().query(uri, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null)) {
                        if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0);
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.isDirectory() && !dir.mkdirs()) throw new IllegalStateException();
                    int dot = name.lastIndexOf('.'), suffix = 0;
                    String stem = dot > 0 ? name.substring(0, dot) : name, ext = dot > 0 ? name.substring(dot) : "";
                    File candidate = new File(dir, name);
                    while (!candidate.createNewFile()) {
                        if (++suffix > 10000) throw new IllegalStateException();
                        name = stem + " (" + suffix + ")" + ext; candidate = new File(dir, name);
                    }
                    legacy = candidate;
                    try (OutputStream out = new FileOutputStream(legacy)) { out.write(bytes); out.flush(); }
                    MediaScannerConnection.scanFile(getContext(), new String[]{legacy.getAbsolutePath()}, new String[]{type}, null);
                    uri = Uri.fromFile(legacy);
                }
                c.resolve(new JSObject().put("saved", true).put("location", "Download").put("name", name).put("uri", uri.toString()).put("bytes", bytes.length));
            } catch (Exception e) {
                try { if (Build.VERSION.SDK_INT >= 29 && uri != null) getContext().getContentResolver().delete(uri, null, null); } catch (Exception ignored) {}
                if (legacy != null) legacy.delete();
                c.reject("Could not write to Android Downloads. Check free space and storage permission.");
            }
        });
    }
    @Override protected void handleOnDestroy() { worker.shutdown(); }
}
