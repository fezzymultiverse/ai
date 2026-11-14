package __APPID__;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadataRetriever;
import android.net.Uri;
import android.os.Build;
import android.util.Size;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.security.MessageDigest;

/** Album artwork for a local song: embedded picture, then the Android thumbnail, then cover.jpg next to the file. Cached as small JPEGs. */
final class HorizonArt {
    private HorizonArt() {}

    private static File cacheFile(Context c, String source, int px, String ext) {
        File dir = new File(c.getCacheDir(), "art");
        if (!dir.exists()) dir.mkdirs();
        String h;
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] d = md.digest((source + "|" + px).getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : d) sb.append(String.format("%02x", b));
            h = sb.toString();
        } catch (Exception e) { h = Integer.toHexString((source + px).hashCode()); }
        return new File(dir, h + ext);
    }

    private static byte[] readAll(File f) {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return out.toByteArray();
        } catch (Exception e) { return null; }
    }

    private static Bitmap decodeScaled(byte[] data, int px) {
        if (data == null || data.length == 0) return null;
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(data, 0, data.length, o);
        if (o.outWidth <= 0 || o.outHeight <= 0) return null;
        int sample = 1;
        while ((o.outWidth / (sample * 2)) >= px && (o.outHeight / (sample * 2)) >= px) sample *= 2;
        BitmapFactory.Options d = new BitmapFactory.Options();
        d.inSampleSize = sample;
        Bitmap b = BitmapFactory.decodeByteArray(data, 0, data.length, d);
        if (b == null) return null;
        int big = Math.max(b.getWidth(), b.getHeight());
        if (big > px) {
            float k = px / (float) big;
            Bitmap s = Bitmap.createScaledBitmap(b, Math.max(1, Math.round(b.getWidth() * k)), Math.max(1, Math.round(b.getHeight() * k)), true);
            if (s != b) b.recycle();
            b = s;
        }
        return b;
    }

    private static Bitmap fromSource(Context c, String source, int px) {
        Bitmap bmp = null;
        MediaMetadataRetriever r = new MediaMetadataRetriever();
        try {
            r.setDataSource(c, Uri.parse(source));
            bmp = decodeScaled(r.getEmbeddedPicture(), px);
        } catch (Throwable ignored) {
        } finally {
            try { r.release(); } catch (Throwable ignored) {}
        }
        if (bmp != null) return bmp;
        if (Build.VERSION.SDK_INT >= 29 && source.startsWith("content://")) {
            try { bmp = c.getContentResolver().loadThumbnail(Uri.parse(source), new Size(px, px), null); } catch (Throwable ignored) {}
            if (bmp != null) return bmp;
        }
        try {
            String path = source.startsWith("file://") ? Uri.parse(source).getPath() : (source.startsWith("/") ? source : null);
            if (path != null) {
                File dir = new File(path).getParentFile();
                if (dir != null) {
                    String[] names = {"cover.jpg", "folder.jpg", "albumart.jpg", "front.jpg", "cover.png", "folder.png", "albumart.png", "AlbumArtSmall.jpg", "Cover.jpg", "Folder.jpg"};
                    for (String n : names) {
                        File f = new File(dir, n);
                        if (f.isFile() && f.length() > 0 && f.length() < 8 * 1024 * 1024) {
                            bmp = decodeScaled(readAll(f), px);
                            if (bmp != null) return bmp;
                        }
                    }
                }
            }
        } catch (Throwable ignored) {}
        return null;
    }

    /** JPEG bytes for the song's artwork, or null when it has none. A miss is remembered so it is not retried on every scroll. */
    static byte[] jpeg(Context c, String source, int px) {
        File hit = cacheFile(c, source, px, ".jpg");
        File miss = cacheFile(c, source, px, ".none");
        if (hit.isFile() && hit.length() > 0) return readAll(hit);
        if (miss.isFile()) return null;
        Bitmap b = fromSource(c, source, px);
        if (b == null) { try { miss.createNewFile(); } catch (Throwable ignored) {} return null; }
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        b.compress(Bitmap.CompressFormat.JPEG, 86, out);
        b.recycle();
        byte[] bytes = out.toByteArray();
        try (FileOutputStream fo = new FileOutputStream(hit)) { fo.write(bytes); } catch (Throwable ignored) {}
        return bytes;
    }

    static Bitmap bitmap(Context c, String source, int px) {
        byte[] b = jpeg(c, source, px);
        return b == null ? null : BitmapFactory.decodeByteArray(b, 0, b.length);
    }
}
