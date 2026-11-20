package __APPID__;

import android.location.Address;
import android.location.Geocoder;
import android.webkit.MimeTypeMap;
import androidx.exifinterface.media.ExifInterface;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.nio.file.Files;
import java.util.*;
import org.json.*;

/** Metadata and same-volume administration only. Permission/UI controls live in HorizonFilesAccess. */
@CapacitorPlugin(name = "HorizonFiles")
public class HorizonFilesPlugin extends Plugin {
    interface Work { JSObject run() throws Exception; }
    private void execute(PluginCall call, String action, Work work) {
        // Serial worker keeps disk/EXIF/geocoding off the UI thread; Retreat remains independently responsive.
        HorizonFilesState.WORKER.execute(() -> {
            synchronized (HorizonFilesState.LOCK) {
                String id = UUID.randomUUID().toString();
                try {
                    HorizonFilesState.journalId.set(id);
                    HorizonFilesState.undoing.set(action.equals("undo"));
                    HorizonFilesState.validate(getContext(), call);
                    JSObject result = work.run();
                    if (!result.has("entryId")) HorizonFilesState.record(getContext(), id, action,
                        call.getString("path", call.getString("from", "")), "", "", "completed");
                    call.resolve(result);
                } catch (Exception e) {
                    JSObject result = HorizonFilesState.error(e);
                    try {
                        try { HorizonFilesState.failEntry(getContext(), id, "error:" + result.optString("code")); }
                        catch (HorizonFilesState.Fault missing) {
                            if (!missing.code.equals("NOT_FOUND")) throw missing;
                            HorizonFilesState.record(getContext(), id, action,
                                call.getString("path", call.getString("from", "")), call.getString("to", ""),
                                call.getString("reason", ""), "error:" + result.optString("code"));
                        }
                    } catch (Exception logError) { result.put("logError", "Activity log could not be persisted; review source and destination before retrying"); }
                    call.resolve(result);
                } finally { HorizonFilesState.undoing.remove(); HorizonFilesState.journalId.remove(); }
            }
        });
    }
    private File checked(PluginCall c, String path) throws Exception {
        return HorizonFilesState.checked(getContext(), c, path, false);
    }
    private void exists(File f) throws Exception {
        if (!f.exists()) throw new HorizonFilesState.Fault("NOT_FOUND", "Item no longer exists");
    }
    private String reason(PluginCall c) throws Exception {
        String s = c.getString("reason", "").trim();
        if (s.isEmpty()) throw new HorizonFilesState.Fault("IO_ERROR", "A nonempty reason is required");
        return s;
    }
    @PluginMethod public void list(PluginCall c) { execute(c, "list", () -> {
        File root = checked(c, c.getString("path")); exists(root);
        if (!root.isDirectory()) throw new HorizonFilesState.Fault("IO_ERROR", "Not a folder");
        JSArray entries = new JSArray(); Deque<File> queue = new ArrayDeque<>(); queue.add(root);
        Set<String> visited = new HashSet<>(); boolean recursive = c.getBoolean("recursive", false), truncated = false;
        int scanned = 0;
        outer: while (!queue.isEmpty()) {
            HorizonFilesState.validate(getContext(), c);
            File dir = queue.removeFirst(); if (!visited.add(dir.getCanonicalPath())) continue;
            // DirectoryStream is lazy: a huge folder cannot allocate an unbounded File[] array.
            try (java.nio.file.DirectoryStream<java.nio.file.Path> stream = Files.newDirectoryStream(dir.toPath())) {
                for (java.nio.file.Path p : stream) {
                    if (++scanned > 2000) { truncated = true; break outer; }
                    HorizonFilesState.validate(getContext(), c);
                    File f;
                    try { f = checked(c, p.toString()); }
                    catch (HorizonFilesState.Fault denied) {
                        if (denied.code.equals("PROTECTED_PATH") || denied.code.equals("OUT_OF_SCOPE")) continue;
                        throw denied;
                    }
                    JSObject row = basic(f); row.put("type", f.isDirectory() ? "directory" : "file");
                    row.put("path", f.getPath()); entries.put(row);
                    if (recursive && f.isDirectory() && !Files.isSymbolicLink(p)) queue.addLast(f);
                }
            }
        }
        JSObject out = HorizonFilesState.ok(); out.put("entries", entries); out.put("truncated", truncated); out.put("limit", 2000); return out;
    }); }
    private JSObject basic(File f) {
        String name = f.getName(); int dot = name.lastIndexOf('.');
        String extension = dot > 0 ? name.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        JSObject out = new JSObject(); out.put("name", name); out.put("extension", extension);
        String mime = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        out.put("mime", f.isDirectory() ? "vnd.android.document/directory" : mime == null ? "application/octet-stream" : mime);
        out.put("size", f.isDirectory() ? 0L : f.length()); out.put("modified", f.lastModified()); return out;
    }
    @PluginMethod public void stat(PluginCall c) { execute(c, "stat", () -> {
        File f = checked(c, c.getString("path")); exists(f); JSObject out = basic(f);
        if (!f.isDirectory() && out.optString("mime").startsWith("image/")) {
            JSObject header = new JSObject();
            try {
                // ExifInterface parses image headers only: never BitmapFactory, pixels, thumbnail, OCR or content APIs.
                ExifInterface exif = new ExifInterface(f);
                header.put("dateTaken", exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL));
                header.put("cameraMake", exif.getAttribute(ExifInterface.TAG_MAKE));
                header.put("cameraModel", exif.getAttribute(ExifInterface.TAG_MODEL));
                header.put("width", exif.getAttributeInt(ExifInterface.TAG_IMAGE_WIDTH, 0));
                header.put("height", exif.getAttributeInt(ExifInterface.TAG_IMAGE_LENGTH, 0));
                double[] gps = exif.getLatLong();
                if (gps != null) {
                    String place = "location: present, unresolved";
                    try {
                        if (Geocoder.isPresent()) {
                            List<Address> addresses = new Geocoder(getContext(), Locale.getDefault()).getFromLocation(gps[0], gps[1], 1);
                            if (addresses != null && !addresses.isEmpty()) {
                                Address address = addresses.get(0); String city = address.getLocality();
                                if (city == null || city.trim().isEmpty()) city = address.getSubAdminArea();
                                if (city == null || city.trim().isEmpty()) city = address.getAdminArea();
                                if (city != null && !city.trim().isEmpty()) place = city;
                            }
                        }
                    } catch (Exception unresolved) { /* Only coarse place names cross the bridge. */ }
                    header.put("location", place);
                }
            } catch (java.io.IOException unsupported) { header.put("metadataStatus", "Header unavailable or unsupported"); }
            out.put("image", header);
        }
        out.put("ok", true); return out;
    }); }
    @PluginMethod public void makeFolder(PluginCall c) { execute(c, "makeFolder", () -> {
        reason(c); File f = checked(c, c.getString("path"));
        String id = HorizonFilesState.journalId.get();
        HorizonFilesState.record(getContext(), id, "makeFolder", "", f.getPath(), c.getString("reason"), "pending");
        if (f.exists()) { if (!f.isDirectory()) throw new HorizonFilesState.Fault("IO_ERROR", "Destination exists and is not a folder"); }
        else if (!f.mkdirs()) throw new HorizonFilesState.Fault("IO_ERROR", "Folder could not be created");
        HorizonFilesState.finish(getContext(), id, "completed", null);
        JSObject out = HorizonFilesState.ok(); out.put("path", f.getPath()); out.put("entryId", id); return out;
    }); }
    // V1.99.132: Files.getFileStore() throws AccessDeniedException on Android (the mount table is not readable), which blocked every move with
    // "PERMISSION_DENIED: getFileStore". Compare device ids with Os.stat instead. If stat itself fails, answer true: the native
    // RENAME_NOREPLACE call still fails with EXDEV (CROSS_VOLUME) on a real volume mismatch, so nothing unsafe can slip through.
    private static boolean sameVolume(File a, File b) {
        try { return android.system.Os.stat(a.getPath()).st_dev == android.system.Os.stat(b.getPath()).st_dev; }
        catch (Exception e) { return true; }
    }
    private JSObject transfer(PluginCall c, File source, File destination, String action, boolean trash, JSONObject undoEntry) throws Exception {
        exists(source); reason(c);
        HorizonFilesState.checkTree(getContext(), c, source);
        if (Files.isSymbolicLink(new File(c.getString("from", c.getString("path", source.getPath()))).toPath()))
            throw new HorizonFilesState.Fault("PROTECTED_PATH", "Moving symbolic links is not supported");
        if (!destination.getParentFile().isDirectory()) throw new HorizonFilesState.Fault("NOT_FOUND", "Destination parent does not exist");
        if (destination.equals(source) || destination.toPath().startsWith(source.toPath()))
            throw new HorizonFilesState.Fault("IO_ERROR", "Source and destination must differ and not be nested");
        destination = HorizonFilesState.available(destination);
        if (trash) HorizonFilesState.trashTarget(getContext(), destination); else checked(c, destination.getPath());
        if (!sameVolume(source, destination.getParentFile()))
            throw new HorizonFilesState.Fault("CROSS_VOLUME", "Same-volume rename only; no copy fallback");
        String id = HorizonFilesState.journalId.get();
        HorizonFilesState.record(getContext(), id, action, source.getPath(), destination.getPath(), c.getString("reason"), "pending");
        HorizonFilesState.linkUndo(getContext(), id, undoEntry == null ? null : undoEntry.optString("id"));
        HorizonFilesState.validate(getContext(), c);
        HorizonFilesState.renameOnly(source, destination);
        if (source.exists() || !destination.exists()) throw new HorizonFilesState.Fault("VERIFY_FAILED", "Move was not confirmed on disk; inspect File activity before retrying");
        HorizonFilesState.finish(getContext(), id, "completed", undoEntry == null ? null : undoEntry.optString("id"));
        JSObject out = HorizonFilesState.ok(); out.put("entryId", id); out.put("path", destination.getPath()); out.put("name", destination.getName()); return out;
    }
    @PluginMethod public void move(PluginCall c) { execute(c, "move", () -> transfer(c, checked(c, c.getString("from")), checked(c, c.getString("to")), "move", false, null)); }
    @PluginMethod public void rename(PluginCall c) { execute(c, "rename", () -> {
        File source = checked(c, c.getString("path")); String name = c.getString("newName", "");
        HorizonFilesState.name(name); return transfer(c, source, checked(c, new File(source.getParentFile(), name).getPath()), "rename", false, null);
    }); }
    // V1.99.138: a reversible delete. Only a rename into Documents/Trash (same volume, journaled, Undo works). Never erases. It runs only
    // when the app sets userConfirmed after the person ticked this exact item in the Delete confirmation panel.
    @PluginMethod public void moveToTrash(PluginCall c) { execute(c, "moveToTrash", () -> {
        if (!c.getBoolean("userConfirmed", false))
            throw new HorizonFilesState.Fault("OPERATION_DENIED", "Moving to Trash needs the user to confirm it first");
        File source = checked(c, c.getString("path"));
        File trash = HorizonFilesState.trashTarget(getContext(), null);
        if (!trash.isDirectory() && !trash.mkdirs()) throw new HorizonFilesState.Fault("IO_ERROR", "Trash folder could not be created");
        return transfer(c, source, new File(trash, source.getName()), "moveToTrash", true, null);
    }); }
    @PluginMethod public void undo(PluginCall c) { execute(c, "undo", () -> {
        JSONObject entry = HorizonFilesState.entry(getContext(), c.getString("entryId", ""));
        if (!entry.optString("status").equals("completed") || !Arrays.asList("move", "rename", "moveToTrash").contains(entry.optString("action")))
            throw new HorizonFilesState.Fault("IO_ERROR", "Entry is already undone, incomplete, or not reversible");
        File source = new File(entry.getString("to"));
        // Only the exact logged Trash source is an exception; original destination must be in fresh user scope.
        if (entry.optString("action").equals("moveToTrash")) {
            HorizonFilesState.trashTarget(getContext(), source);
        } else checked(c, source.getPath());
        File destination = checked(c, entry.getString("from"));
        c.getData().put("reason", "Undo: " + entry.optString("reason"));
        c.getData().put("path", source.getPath());
        // Validate descendants against policy even for a logged Trash restore.
        boolean restore = entry.optString("action").equals("moveToTrash");
        if (restore) {
            exists(source); HorizonFilesState.checkTrashTree(getContext(), c, source);
            destination = HorizonFilesState.available(destination); checked(c, destination.getPath());
            if (!destination.getParentFile().isDirectory()) throw new HorizonFilesState.Fault("NOT_FOUND", "Original parent no longer exists");
            if (!sameVolume(source, destination.getParentFile())) throw new HorizonFilesState.Fault("CROSS_VOLUME", "Same-volume restore only");
            String id = HorizonFilesState.journalId.get();
            HorizonFilesState.record(getContext(), id, "undo", source.getPath(), destination.getPath(), c.getString("reason"), "pending");
            HorizonFilesState.linkUndo(getContext(), id, entry.getString("id"));
            HorizonFilesState.validate(getContext(), c); HorizonFilesState.renameOnly(source, destination);
            HorizonFilesState.finish(getContext(), id, "completed", entry.getString("id"));
            JSObject out = HorizonFilesState.ok(); out.put("entryId", id); out.put("path", destination.getPath()); return out;
        }
        return transfer(c, source, destination, "undo", false, entry);
    }); }
}
