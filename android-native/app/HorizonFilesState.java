package __APPID__;

import android.content.Context;
import android.os.Environment;
import android.os.Build;
import android.util.AtomicFile;
import com.getcapacitor.*;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.regex.*;

/** Native policy boundary. No user-file content is read or written by this class. */
final class HorizonFilesState {
    static final Object LOCK = new Object();
    static final ExecutorService WORKER = Executors.newSingleThreadExecutor();
    static final ThreadLocal<String> journalId = new ThreadLocal<>();
    static final ThreadLocal<Boolean> undoing = ThreadLocal.withInitial(() -> false);
    static volatile boolean retreated = false;
    static volatile String messageId = "", userMessage = "";
    static volatile List<String> roots = Collections.emptyList();
    static class Fault extends IOException {
        final String code;
        Fault(String code, String message) { super(message); this.code = code; }
    }
    static JSObject ok() { JSObject o = new JSObject(); o.put("ok", true); return o; }
    static JSObject error(Exception e) {
        JSObject o = new JSObject(); o.put("ok", false);
        String code = e instanceof Fault ? ((Fault)e).code : e instanceof SecurityException || e instanceof AccessDeniedException ? "PERMISSION_DENIED" : e instanceof NoSuchFileException ? "NOT_FOUND" : "IO_ERROR";
        if (e instanceof FileSystemException) {
            String reason = ((FileSystemException)e).getReason();
            if (reason != null && reason.toLowerCase(Locale.ROOT).contains("cross-device")) code = "CROSS_VOLUME";
            if (reason != null && reason.toLowerCase(Locale.ROOT).contains("too long")) code = "NAME_TOO_LONG";
        }
        o.put("code", code); o.put("message", e.getMessage() == null ? "File operation failed" : e.getMessage()); return o;
    }
    static boolean granted() { return Build.VERSION.SDK_INT >= 30 && Environment.isExternalStorageManager(); }
    static boolean enabled(Context c) { return c.getSharedPreferences("horizon_file_admin", 0).getBoolean("enabled", false) && granted(); }
    static void permission(Context c) throws Fault {
        if (!enabled(c)) throw new Fault("PERMISSION_DENIED", "File access is off");
    }
    static void validate(Context c, PluginCall call) throws Exception {
        permission(c);
        if (retreated && !undoing.get()) throw new Fault("RETREATED", "Run retreated; completed operations remain undoable");
        if (messageId.isEmpty() || !messageId.equals(call.getString("messageId", "")) || !userMessage.equals(call.getString("userMessage", "")))
            throw new Fault("OUT_OF_SCOPE", "A new user message requires a fresh scope declaration");
        JSArray values = call.getArray("scopeRoots", new JSArray());
        if (values.length() == 0 || values.length() != roots.size()) throw new Fault("OUT_OF_SCOPE", "Declare scope for the latest message first");
        Set<String> actual = new HashSet<>();
        for (int i = 0; i < values.length(); i++) {
            String raw = values.getString(i); File root = path(raw);
            if (!roots.contains(root.getPath()) || !allowedRoot(c, root.getPath(), userMessage) || !root.isDirectory()) throw new Fault("OUT_OF_SCOPE", "Scope is stale, missing or no longer mounted");
            protect(c, root, false); actual.add(root.getPath());
        }
        if (actual.size() != roots.size()) throw new Fault("OUT_OF_SCOPE", "Invalid scope roots");
    }
    static File path(String raw) throws Exception {
        if (raw == null || raw.isEmpty() || raw.indexOf('\0') >= 0 || !new File(raw).isAbsolute()) throw new Fault("OUT_OF_SCOPE", "An absolute path is required");
        if (raw.getBytes(StandardCharsets.UTF_8).length > 4096) throw new Fault("NAME_TOO_LONG", "Path exceeds 4096 UTF-8 bytes");
        for (String part : raw.split("/")) {
            if (part.equals("..")) throw new Fault("OUT_OF_SCOPE", "Parent traversal is not allowed");
            if (!part.isEmpty()) name(part);
        }
        return new File(raw).getCanonicalFile();
    }
    static void name(String name) throws Exception {
        if (name.isEmpty() || name.equals(".") || name.equals("..") || name.indexOf('/') >= 0 || name.indexOf('\\') >= 0 || name.indexOf('\0') >= 0)
            throw new Fault("IO_ERROR", "Invalid file name");
        if (name.getBytes(StandardCharsets.UTF_8).length > 255) throw new Fault("NAME_TOO_LONG", "Filename exceeds 255 UTF-8 bytes");
        // Java replaces undecodable filesystem names with U+FFFD. Fail closed instead of addressing a different file.
        if (name.indexOf('\uFFFD') >= 0 || !StandardCharsets.UTF_8.newEncoder().canEncode(name)) throw new Fault("IO_ERROR", "Filename cannot be represented safely as UTF-8");
    }
    static boolean within(File f, File root) { return f.toPath().startsWith(root.toPath()); }
    /** Folders the user picked with the system folder chooser (Permissions panel). Persisted; a pick counts as naming the folder. */
    static List<String> chosen(Context c) {
        List<String> out = new ArrayList<>();
        try {
            JSONArray a = new JSONArray(c.getSharedPreferences("horizon_file_admin", 0).getString("folders", "[]"));
            for (int i = 0; i < a.length(); i++) { String p = a.optString(i, ""); if (!p.isEmpty() && !out.contains(p)) out.add(p); }
        } catch (Exception ignored) { /* Unreadable list behaves as no chosen folders. */ }
        return out;
    }
    static boolean saveChosen(Context c, List<String> folders) {
        return c.getSharedPreferences("horizon_file_admin", 0).edit().putString("folders", new JSONArray(folders).toString()).commit();
    }
    static boolean chosenRoot(Context c, String path) {
        File f = new File(path);
        for (String s : chosen(c)) if (within(f, new File(s))) return true;
        return false;
    }
    static boolean allowedRoot(Context c, String path, String text) { return named(path, text) || chosenRoot(c, path); }
    static boolean mentioned(String text, String term) {
        return Pattern.compile("(?iu)(?<![\\p{L}\\p{N}_])" + Pattern.quote(term) + "(?![\\p{L}\\p{N}_])").matcher(text).find();
    }
    static boolean named(String path, String text) {
        String name = new File(path).getName();
        return mentioned(text, path) || (!name.isEmpty() && mentioned(text, name));
    }
    static final String[] EXCLUSION_PATTERNS = {
        "(?iu)\\bleave\\s+(.+?)\\s+(?:alone|untouched|as[- ]is|out)\\b",
        "(?iu)\\b(?:do not|don't|don’t|never)\\s+(?:touch|move|rename|change|include|alter|access|modify)\\s+(.+?)(?=\\.(?:\\s|$)|[,;\\n!?]|$)",
        "(?iu)\\b(?:except(?:\\s+for)?|excluding|exclude|skip|ignore|avoid|without touching|hands off)\\s+(.+?)(?=\\.(?:\\s|$)|[,;\\n!?]|$)",
        "(?iu)\\bkeep\\s+(.+?)\\s+(?:unchanged|untouched|intact|as[- ]is)\\b"
    };
    static List<String> exclusions(String text) {
        List<String> out = new ArrayList<>();
        for (String regex : EXCLUSION_PATTERNS) {
            Matcher m = Pattern.compile(regex).matcher(text);
            while (m.find()) {
                String clause = m.group(1).trim().replaceAll("^[\\\"'`]+|[\\\"'`]+$", "");
                for (String item : clause.split("(?iu)\\s+(?:and|or)\\s+|\\s*&\\s*")) {
                    item = item.trim().replaceFirst("(?iu)^(?:the|my|a|any|all)\\s+", "").replaceFirst("(?iu)^folder\\s+", "").replaceFirst("(?iu)\\s+folders?$", "").trim();
                    if (!item.isEmpty()) out.add(item);
                }
            }
        }
        return out;
    }
    // V1.99.123: phrases that describe HOW the work is done ("without Termux", "don't use root"), not which folder to spare.
    // They are not exclusions, so they must not trip the fail-closed ambiguity guard below.
    static final String[] METHOD_PATTERNS = {
        "(?iu)\\b(?:without|don't|don\u2019t|do not|never)\\s+(?:to\\s+)?(?:use|using|need|needing|require|requiring|run|running|rely|relying)\\b[^.,;!?\\n]*",
        "(?iu)\\bwithout\\s+(?:the\\s+|a\\s+|an\\s+|any\\s+)?(?:termux|com\\.termux|root|sudo|adb|pc|computer|laptop|desktop|internet|wi-?fi|network|vpn|app|apps|script|scripts|command|commands|shell|terminal|ai|model)\\b"
    };
    // Returns the word that made the exclusion wording unparseable, or null when the message is safe to act on.
    static String ambiguousWord(String text) {
        String masked = text;
        for (String regex : EXCLUSION_PATTERNS) masked = Pattern.compile(regex).matcher(masked).replaceAll(" ");
        for (String regex : METHOD_PATTERNS) masked = Pattern.compile(regex).matcher(masked).replaceAll(" ");
        // Never guess at a negative constraint which has no mechanically identifiable folder name.
        Matcher m = Pattern.compile("(?iu)\\b(?:leave|except|excluding|exclude|untouched|unchanged|don't|don\u2019t|do not|never|not|hands off|skip|ignore|avoid|without)\\b").matcher(masked);
        if (m.find()) return m.group();
        for (String exclusion : exclusions(text)) {
            Matcher v = Pattern.compile("(?iu)\\b(?:then|instead|but|after|before|move|rename|create|sort|organize|inspect)\\b").matcher(exclusion);
            if (v.find()) return exclusion;
        }
        return null;
    }
    static boolean ambiguousExclusions(String text) { return ambiguousWord(text) != null; }
    static void protect(Context c, File f, boolean trashRestore) throws Exception {
        String full = f.getPath(), low = full.toLowerCase(Locale.ROOT);
        if (Pattern.compile("(?i)(?:^|/)android/(?:data|obb)(?:/|$)").matcher(full).find()) throw new Fault("PROTECTED_PATH", "Android/data and Android/obb are always blocked");
        for (String excluded : exclusions(userMessage)) {
            if (excluded.startsWith("/")) {
                File ex = path(excluded);
                if (within(f, ex)) throw new Fault("PROTECTED_PATH", "User asked to leave this path alone");
            } else {
                for (String segment : full.split("/")) if (segment.equalsIgnoreCase(excluded)) throw new Fault("PROTECTED_PATH", "User asked to leave " + excluded + " alone");
            }
        }
        // Reject exclusion language that cannot be parsed safely, rather than silently ignoring it.
        String unclear = ambiguousWord(userMessage);
        if (unclear != null)
            throw new Fault("PROTECTED_PATH", "NOT a protected folder: the wording \"" + (unclear.length() > 40 ? unclear.substring(0, 40) : unclear) + "\" in the request looks like an exclusion Horizon cannot read. The path itself is fine. Ask Fezzy to resend it as 'leave Folder alone' or 'except Folder', or without that word, then retry.");
        // A folder the user picked in Permissions is explicitly named: only segments BELOW it stay protected.
        String below = full;
        for (String ch : chosen(c)) if (within(f, new File(ch)) && full.startsWith(ch)) { below = full.substring(ch.length()); break; }
        for (String segment : below.split("/")) {
            String s = segment.toLowerCase(Locale.ROOT);
            if ((s.contains("vault") || s.equals("termux") || s.equals("com.termux")) && !mentioned(userMessage, segment) && !(s.equals("com.termux") && mentioned(userMessage, "termux")) && !mentioned(userMessage, full))
                throw new Fault("PROTECTED_PATH", "Protected folder must be explicitly named");
        }
        File privateRoot = new File(c.getApplicationInfo().dataDir).getCanonicalFile();
        File extPrivate = c.getExternalFilesDir(null);
        if ((within(f, privateRoot) || extPrivate != null && within(f, extPrivate.getCanonicalFile())) && !mentioned(userMessage, privateRoot.getPath()) && !mentioned(userMessage, full))
            throw new Fault("PROTECTED_PATH", "App-private data must be explicitly named by full path");
    }
    static File checked(Context c, PluginCall call, String raw, boolean restore) throws Exception {
        validate(c, call); File f = path(raw); boolean accepted = false;
        for (String root : roots) if (within(f, new File(root))) { accepted = true; break; }
        if (!accepted && !restore) throw new Fault("OUT_OF_SCOPE", "Path is outside the declared scope");
        // Check lexical path too: symlink aliases must not bypass protected or excluded names.
        protect(c, new File(raw).getAbsoluteFile(), restore); protect(c, f, restore); return f;
    }
    static File available(File target) throws Exception {
        File candidate = target; int suffix = 0; String name = target.getName();
        int dot = name.lastIndexOf('.'); String stem = dot > 0 && !target.isDirectory() ? name.substring(0, dot) : name;
        String ext = dot > 0 && !target.isDirectory() ? name.substring(dot) : "";
        while (Files.exists(candidate.toPath(), LinkOption.NOFOLLOW_LINKS)) {
            if (++suffix > 100000) throw new Fault("IO_ERROR", "Too many filename conflicts");
            String next = stem + " (" + suffix + ")" + ext; name(next); candidate = new File(target.getParentFile(), next);
        }
        return candidate.getCanonicalFile();
    }
    static File trashTarget(Context c, File candidate) throws Exception {
        File docs = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS);
        File lexical = new File(docs, "Trash"), canonical = lexical.getCanonicalFile();
        if (!lexical.getAbsolutePath().equals(canonical.getPath())) throw new Fault("PROTECTED_PATH", "Trash cannot be a symbolic-link alias");
        if (candidate != null && (!candidate.getCanonicalFile().getParentFile().equals(canonical) || Files.isSymbolicLink(candidate.toPath())))
            throw new Fault("PROTECTED_PATH", "Only direct logged items inside Documents/Trash are allowed");
        return canonical;
    }
    static void checkTree(Context c, PluginCall call, File start) throws Exception { tree(c, call, start, false); }
    static void checkTrashTree(Context c, PluginCall call, File start) throws Exception { tree(c, call, start, true); }
    private static void tree(Context c, PluginCall call, File start, boolean restore) throws Exception {
        Deque<File> q = new ArrayDeque<>(); q.add(start); int count = 0;
        while (!q.isEmpty()) {
            validate(c, call); File f = q.removeFirst();
            if (++count > 2000) throw new Fault("IO_ERROR", "Folder operation exceeds the 2000-entry safety inspection cap");
            if (Files.isSymbolicLink(f.toPath())) throw new Fault("PROTECTED_PATH", "Folder moves containing symbolic links are rejected");
            checked(c, call, f.getPath(), restore);
            if (f.isDirectory()) {
                try (DirectoryStream<Path> entries = Files.newDirectoryStream(f.toPath())) {
                    for (Path p : entries) {
                        if (q.size() + count >= 2000) throw new Fault("IO_ERROR", "Folder operation exceeds the 2000-entry safety inspection cap");
                        q.addLast(p.toFile());
                    }
                }
            }
        }
    }
    private static native int renameNoReplace(byte[] source, byte[] target);
    static void renameOnly(File source, File target) throws Exception {
        // Kernel RENAME_NOREPLACE prevents a competing app from racing an overwrite.
        try { System.loadLibrary("horizon_files"); }
        catch (LinkageError e) { throw new Fault("IO_ERROR", "Atomic rename library missing from APK; no unsafe fallback"); }
        int error;
        try { error = renameNoReplace(source.getPath().getBytes(StandardCharsets.UTF_8), target.getPath().getBytes(StandardCharsets.UTF_8)); }
        catch (LinkageError e) { throw new Fault("IO_ERROR", "Atomic rename entry point unavailable; no unsafe fallback"); }
        if (error == 0) return;
        String code = error == 18 ? "CROSS_VOLUME" : error == 13 || error == 1 ? "PERMISSION_DENIED" : error == 2 ? "NOT_FOUND" : error == 36 ? "NAME_TOO_LONG" : "IO_ERROR";
        throw new Fault(code, error == 17 ? "Destination appeared during operation; retry for a suffixed name" : "Same-volume no-overwrite rename failed (errno " + error + "); no copy fallback");
    }

    private static AtomicFile log(Context c) { return new AtomicFile(new File(c.getFilesDir(), "horizon-file-activity.json")); }
    static JSONArray read(Context c) throws Exception {
        AtomicFile file = log(c);
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile().getPath() + ".bak").exists()) return new JSONArray();
        try (InputStream in = file.openRead(); ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] b = new byte[8192]; int n;
            while ((n = in.read(b)) != -1) { if (bytes.size() + n > 32 * 1024 * 1024) throw new Fault("IO_ERROR", "Activity log exceeds safety limit"); bytes.write(b, 0, n); }
            return new JSONArray(bytes.toString("UTF-8"));
        }
    }
    static void write(Context c, JSONArray entries) throws Exception {
        AtomicFile file = log(c); FileOutputStream stream = null;
        try { stream = file.startWrite(); stream.write(entries.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(stream); }
        catch (Exception e) { if (stream != null) file.failWrite(stream); throw e; }
    }
    static void record(Context c, String id, String action, String from, String to, String reason, String status) throws Exception {
        JSONArray entries = read(c), next = new JSONArray();
        for (int i = Math.max(0, entries.length() - 1999); i < entries.length(); i++) next.put(entries.getJSONObject(i));
        JSONObject row = new JSONObject(); row.put("id", id); row.put("time", System.currentTimeMillis()); row.put("action", action);
        row.put("from", from.length() > 4096 ? from.substring(0, 4096) : from); row.put("to", to.length() > 4096 ? to.substring(0, 4096) : to); row.put("reason", reason != null && reason.length() > 4096 ? reason.substring(0, 4096) : reason); row.put("status", status);
        if (status.equals("pending") && !from.isEmpty()) {
            android.system.StructStat st = android.system.Os.lstat(from);
            row.put("sourceInode", st.st_ino); row.put("sourceDevice", st.st_dev);
        }
        next.put(row); write(c, next);
    }
    static void failEntry(Context c, String id, String status) throws Exception {
        JSONArray entries = read(c); boolean found = false;
        for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.getJSONObject(i);
            if (!row.optString("id").equals(id)) continue;
            found = true;
            boolean moved = false;
            if (row.has("sourceInode") && !new File(row.optString("from")).exists() && new File(row.optString("to")).exists()) {
                android.system.StructStat st = android.system.Os.lstat(row.getString("to"));
                moved = st.st_ino == row.getLong("sourceInode") && st.st_dev == row.getLong("sourceDevice");
            }
            row.put("status", moved ? "completed" : status);
            if (moved && row.has("undoOf")) for (int j = 0; j < entries.length(); j++) {
                JSONObject original = entries.getJSONObject(j);
                if (original.optString("id").equals(row.optString("undoOf"))) original.put("status", "undone");
            }
        }
        if (found) write(c, entries);
        else throw new Fault("NOT_FOUND", "Operation has no journal entry yet");
    }
    static void linkUndo(Context c, String id, String undoId) throws Exception {
        if (undoId == null) return;
        JSONArray entries = read(c);
        for (int i = 0; i < entries.length(); i++) if (entries.getJSONObject(i).optString("id").equals(id)) entries.getJSONObject(i).put("undoOf", undoId);
        write(c, entries);
    }
    static void finish(Context c, String id, String status, String undoId) throws Exception {
        JSONArray entries = read(c);
        for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.getJSONObject(i);
            if (id.equals(row.optString("id"))) { row.put("status", status); if (undoId != null) row.put("undoOf", undoId); }
            if (undoId != null && undoId.equals(row.optString("id"))) row.put("status", "undone");
        }
        write(c, entries);
    }
    static JSONObject entry(Context c, String id) throws Exception {
        JSONArray entries = read(c);
        for (int i = 0; i < entries.length(); i++) if (entries.getJSONObject(i).optString("id").equals(id)) return entries.getJSONObject(i);
        throw new Fault("NOT_FOUND", "Activity entry not found (log retains 2000 entries)");
    }
    static void recover(Context c) throws Exception {
        JSONArray entries = read(c); boolean changed = false;
        for (int i = 0; i < entries.length(); i++) {
            JSONObject row = entries.getJSONObject(i);
            if (!row.optString("status").equals("pending")) continue;
            File from = new File(row.getString("from")), to = new File(row.getString("to"));
            boolean completed = false;
            if (!from.exists() && to.exists() && row.has("sourceInode")) {
                android.system.StructStat st = android.system.Os.lstat(to.getPath());
                completed = st.st_ino == row.getLong("sourceInode") && st.st_dev == row.getLong("sourceDevice");
            }
            row.put("status", completed ? "completed" : "interrupted: review required");
            if (completed && row.has("undoOf")) for (int j = 0; j < entries.length(); j++) {
                JSONObject original = entries.getJSONObject(j);
                if (original.optString("id").equals(row.optString("undoOf"))) original.put("status", "undone");
            }
            changed = true;
        }
        if (changed) write(c, entries);
    }
}
