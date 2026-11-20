package __APPID__;

import android.content.*;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.annotation.ActivityCallback;
import android.content.pm.*;
import android.net.Uri;
import android.provider.Settings;
import android.provider.DocumentsContract;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.util.*;
import org.json.*;

/** Permission, UI and policy lifecycle bridge; exposes no arbitrary file operation. */
@CapacitorPlugin(name = "HorizonFilesAccess")
public class HorizonFilesAccessPlugin extends Plugin {
    @Override public void load() {
        HorizonFilesState.WORKER.execute(() -> { synchronized (HorizonFilesState.LOCK) {
            try { HorizonFilesState.recover(getContext()); } catch (Exception e) { /* History returns the persistent log error, never erases it. */ }
        } });
    }
    interface Work { JSObject run() throws Exception; }
    private void run(PluginCall c, Work work) {
        try { c.resolve(work.run()); } catch (Exception e) { c.resolve(HorizonFilesState.error(e)); }
    }
    @PluginMethod public void status(PluginCall c) { run(c, () -> {
        boolean requested = getContext().getSharedPreferences("horizon_file_admin", 0).getBoolean("enabled", false);
        boolean granted = HorizonFilesState.granted();
        if (requested && !granted) getContext().getSharedPreferences("horizon_file_admin", 0).edit().putBoolean("enabled", false).commit();
        JSObject out = HorizonFilesState.ok(); out.put("enabled", requested && granted); out.put("granted", granted); out.put("revoked", requested && !granted); return out;
    }); }
    @PluginMethod public void setEnabled(PluginCall c) { run(c, () -> {
        boolean on = c.getBoolean("enabled", false);
        if (on && !HorizonFilesState.granted()) throw new HorizonFilesState.Fault("PERMISSION_DENIED", "All files access was not granted");
        if (!getContext().getSharedPreferences("horizon_file_admin", 0).edit().putBoolean("enabled", on).commit()) throw new HorizonFilesState.Fault("IO_ERROR", "Permission preference could not be saved");
        if (!on) { HorizonFilesState.retreated = true; HorizonFilesState.roots = Collections.emptyList(); }
        JSObject out = HorizonFilesState.ok(); out.put("enabled", on); return out;
    }); }
    @PluginMethod public void requestAccess(PluginCall c) {
        getActivity().runOnUiThread(() -> run(c, () -> {
            if (android.os.Build.VERSION.SDK_INT < 30) throw new HorizonFilesState.Fault("PERMISSION_DENIED", "File administration requires Android 11 or later");
            try {
                Intent app = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                    Uri.fromParts("package", getContext().getPackageName(), null));
                getActivity().startActivity(app);
            } catch (ActivityNotFoundException | SecurityException unsupported) {
                getActivity().startActivity(new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION));
            }
            return HorizonFilesState.ok();
        }));
    }
    @PluginMethod public void beginMessage(PluginCall c) { run(c, () -> {
        // Synchronous invalidation also interrupts a worker currently inspecting a large folder.
        HorizonFilesState.roots = Collections.emptyList(); HorizonFilesState.retreated = true;
        HorizonFilesState.userMessage = c.getString("userMessage", ""); HorizonFilesState.messageId = c.getString("messageId", "");
        HorizonFilesState.retreated = c.getBoolean("retreat", false); return HorizonFilesState.ok();
    }); }
    @PluginMethod public void declareScope(PluginCall c) { run(c, () -> {
        HorizonFilesState.permission(getContext());
        if (HorizonFilesState.retreated) throw new HorizonFilesState.Fault("RETREATED", "Run retreated");
        if (HorizonFilesState.messageId.isEmpty() || !HorizonFilesState.messageId.equals(c.getString("messageId", "")) || !HorizonFilesState.userMessage.equals(c.getString("userMessage", ""))) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "Stale user message");
        JSArray values = c.getArray("scopeRoots", new JSArray()); Set<String> accepted = new LinkedHashSet<>();
        List<String> wanted = new ArrayList<>();
        for (int i = 0; i < values.length(); i++) wanted.add(values.getString(i));
        if (wanted.isEmpty()) wanted.addAll(HorizonFilesState.chosen(getContext())); // No typing needed: use the folders picked in Permissions.
        if (wanted.isEmpty() || wanted.size() > 32) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "No folders chosen. Tap Choose folder in Permissions, or name a folder in your message");
        for (String raw : wanted) {
            File f = HorizonFilesState.path(raw);
            if (!f.isDirectory()) throw new HorizonFilesState.Fault("NOT_FOUND", "Scope root is not an existing folder");
            if (!HorizonFilesState.allowedRoot(getContext(), f.getPath(), HorizonFilesState.userMessage)) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "Folder was not chosen in Permissions or named in the latest user message");
            HorizonFilesState.protect(getContext(), f, false); accepted.add(f.getPath());
        }
        HorizonFilesState.roots = Collections.unmodifiableList(new ArrayList<>(accepted));
        JSObject out = HorizonFilesState.ok(); out.put("scopeRoots", new JSArray(HorizonFilesState.roots)); return out;
    }); }
    private JSObject folderList() throws Exception {
        JSArray rows = new JSArray();
        for (String p : HorizonFilesState.chosen(getContext())) { JSObject r = new JSObject(); r.put("path", p); r.put("exists", new File(p).isDirectory()); rows.put(r); }
        JSObject out = HorizonFilesState.ok(); out.put("folders", rows); return out;
    }
    @PluginMethod public void folders(PluginCall c) { run(c, this::folderList); }
    @PluginMethod public void pickFolder(PluginCall c) {
        try {
            HorizonFilesState.permission(getContext());
            Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            startActivityForResult(c, intent, "pickResult");
        } catch (Exception e) { c.resolve(HorizonFilesState.error(e)); }
    }
    @ActivityCallback
    private void pickResult(PluginCall c, ActivityResult result) {
        if (c == null) return;
        try {
            Uri uri = result.getData() == null ? null : result.getData().getData();
            if (result.getResultCode() != android.app.Activity.RESULT_OK || uri == null) { JSObject o = HorizonFilesState.ok(); o.put("cancelled", true); c.resolve(o); return; }
            String id = DocumentsContract.getTreeDocumentId(uri); int colon = id.indexOf(':');
            String volume = colon < 0 ? id : id.substring(0, colon), rel = colon < 0 ? "" : id.substring(colon + 1);
            if (rel.isEmpty()) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "Pick a folder inside storage, not the whole storage");
            File base = volume.equals("primary") ? android.os.Environment.getExternalStorageDirectory() : new File("/storage/" + volume);
            File f = HorizonFilesState.path(new File(base, rel).getPath());
            if (!f.isDirectory()) throw new HorizonFilesState.Fault("NOT_FOUND", "That folder cannot be reached by path");
            if (java.util.regex.Pattern.compile("(?i)(?:^|/)android/(?:data|obb)(?:/|$)").matcher(f.getPath()).find()) throw new HorizonFilesState.Fault("PROTECTED_PATH", "Android/data and Android/obb are always blocked");
            List<String> list = HorizonFilesState.chosen(getContext());
            if (!list.contains(f.getPath())) {
                if (list.size() >= 24) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "Up to 24 folders. Remove one first");
                list.add(f.getPath());
                if (!HorizonFilesState.saveChosen(getContext(), list)) throw new HorizonFilesState.Fault("IO_ERROR", "Folder list could not be saved");
            }
            JSObject out = folderList(); out.put("added", f.getPath()); c.resolve(out);
        } catch (Exception e) { c.resolve(HorizonFilesState.error(e)); }
    }
    @PluginMethod public void removeFolder(PluginCall c) { run(c, () -> {
        List<String> list = HorizonFilesState.chosen(getContext()); list.remove(c.getString("path", ""));
        if (!HorizonFilesState.saveChosen(getContext(), list)) throw new HorizonFilesState.Fault("IO_ERROR", "Folder list could not be saved");
        HorizonFilesState.roots = Collections.emptyList(); // Next message must re-declare scope without the removed folder.
        return folderList();
    }); }
    @PluginMethod public void retreat(PluginCall c) { run(c, () -> { HorizonFilesState.retreated = true; return HorizonFilesState.ok(); }); }
    @PluginMethod public void history(PluginCall c) {
        HorizonFilesState.WORKER.execute(() -> { synchronized (HorizonFilesState.LOCK) { run(c, () -> {
            JSObject out = HorizonFilesState.ok(); out.put("entries", new JSArray(HorizonFilesState.read(getContext()).toString())); return out;
        }); } });
    }
    private Intent view(String mime) { return new Intent(Intent.ACTION_VIEW).setType(mime); }
    @PluginMethod public void managers(PluginCall c) { run(c, () -> {
        // Android has no official "list all file managers" API: best-effort folder intent query plus fallback.
        PackageManager pm = getContext().getPackageManager(); Map<String, String> packages = new TreeMap<>();
        for (String mime : new String[]{"vnd.android.document/directory", "resource/folder"}) {
            for (ResolveInfo item : pm.queryIntentActivities(view(mime), PackageManager.MATCH_DEFAULT_ONLY)) {
                if (item.activityInfo != null && item.activityInfo.exported) packages.put(item.activityInfo.packageName, item.loadLabel(pm).toString());
            }
        }
        JSArray apps = new JSArray(); String preferred = "";
        for (Map.Entry<String, String> item : packages.entrySet()) {
            JSObject row = new JSObject(); row.put("packageName", item.getKey()); row.put("label", item.getValue()); apps.put(row);
            if (item.getValue().toLowerCase(Locale.ROOT).contains("conduint")) preferred = item.getKey();
        }
        JSObject out = HorizonFilesState.ok(); out.put("apps", apps); out.put("preferred", preferred); return out;
    }); }
    @PluginMethod public void openFolder(PluginCall c) { getActivity().runOnUiThread(() -> run(c, () -> {
        HorizonFilesState.permission(getContext()); String raw = c.getString("path", "");
        File f;
        if (raw.equals("trash")) f = HorizonFilesState.trashTarget(getContext(), null);
        else {
            // UI can view only a currently accepted folder or the parent of a logged result; never execute a file.
            f = HorizonFilesState.path(raw); boolean allowed = false;
            for (String root : HorizonFilesState.roots) if (HorizonFilesState.within(f, new File(root))) allowed = true;
            JSONArray history = HorizonFilesState.read(getContext());
            for (int i = 0; i < history.length(); i++) {
                JSONObject row = history.getJSONObject(i);
                for (String key : new String[]{"from", "to"}) {
                    File logged = new File(row.optString(key));
                    if (f.equals(logged.getParentFile())) allowed = true;
                }
            }
            if (!allowed) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "No accepted folder or logged result");
        }
        if (!f.isDirectory()) throw new HorizonFilesState.Fault("NOT_FOUND", "Folder does not exist");
        String external = android.os.Environment.getExternalStorageDirectory().getCanonicalPath();
        if (!f.getCanonicalPath().startsWith(external + "/")) throw new HorizonFilesState.Fault("OUT_OF_SCOPE", "Folder viewer supports primary shared storage only");
        String relative = f.getCanonicalPath().substring(external.length() + 1);
        Uri uri = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:" + relative);
        String preferred = c.getString("packageName", "");
        for (String mime : new String[]{"vnd.android.document/directory", "resource/folder"}) {
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (!preferred.isEmpty()) {
                intent.setPackage(preferred);
                try { getActivity().startActivity(intent); return HorizonFilesState.ok(); } catch (ActivityNotFoundException | SecurityException unavailable) { /* Try next MIME, then chooser. */ }
            }
        }
        Intent fallback = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "vnd.android.document/directory").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        getActivity().startActivity(Intent.createChooser(fallback, "Open folder")); return HorizonFilesState.ok();
    })); }
}
