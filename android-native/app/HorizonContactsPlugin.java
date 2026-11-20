package __APPID__;

import android.Manifest;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.app.role.RoleManager;
import android.os.Build;
import androidx.activity.result.ActivityResult;
import android.content.ContentProviderOperation;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.provider.ContactsContract;
import android.provider.ContactsContract.CommonDataKinds.Phone;
import android.provider.ContactsContract.RawContacts;
import android.provider.ContactsContract.AggregationExceptions;
import android.telecom.TelecomManager;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import java.util.*;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

@CapacitorPlugin(name = "HorizonContacts", permissions = {
    @Permission(alias = "read", strings = {Manifest.permission.READ_CONTACTS}),
    @Permission(alias = "write", strings = {Manifest.permission.WRITE_CONTACTS}),
    @Permission(alias = "call", strings = {Manifest.permission.CALL_PHONE})
})
public class HorizonContactsPlugin extends Plugin {
    private static java.lang.ref.WeakReference<HorizonContactsPlugin> instance = new java.lang.ref.WeakReference<>(null);
    @Override public void load() { instance = new java.lang.ref.WeakReference<>(this); }
    static void publishCallState(JSObject data) {
        HorizonContactsPlugin plugin = instance.get();
        if (plugin != null) plugin.notifyListeners("callState", data);
    }
    private boolean isDialer() {
        TelecomManager telecom = (TelecomManager) getContext().getSystemService(android.content.Context.TELECOM_SERVICE);
        return telecom != null && getContext().getPackageName().equals(telecom.getDefaultDialerPackage());
    }
    @PluginMethod public void callState(PluginCall c) {
        getActivity().runOnUiThread(() -> c.resolve(HorizonCallService.snapshot().put("ready", isDialer())));
    }
    @PluginMethod public void control(PluginCall c) {
        getActivity().runOnUiThread(() -> {
            try { HorizonCallService.control(c.getString("id", ""), c.getString("action", "")); c.resolve(); }
            catch (Exception e) { c.reject(e.getMessage() == null ? "Call control failed." : e.getMessage()); }
        });
    }
    @PluginMethod public void consumeDialRequest(PluginCall c) {
        getActivity().runOnUiThread(() -> {
            Intent intent = getActivity().getIntent();
            String number = intent == null ? "" : intent.getStringExtra("horizon_dial_number");
            if (intent != null) intent.removeExtra("horizon_dial_number");
            c.resolve(new JSObject().put("number", number == null ? "" : number));
        });
    }
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private boolean granted(String alias) { return getPermissionState(alias) == PermissionState.GRANTED; }
    private void require(PluginCall c, String alias, String callback, Runnable work) {
        if (granted(alias)) work.run();
        else getActivity().runOnUiThread(() -> requestPermissionForAlias(alias, c, callback));
    }
    private static String nameKey(String s) { return s.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT); }
    private static String numberKey(String s) {
        String n = s == null ? "" : s.replaceAll("[\\s().-]", "");
        return n.matches("\\+?[0-9]{3,20}") ? n : "";
    }
    private static class Row {
        final String id, name, number, key;
        Row(String id, String name, String number) { this.id=id; this.name=name; this.number=number; this.key=numberKey(number); }
        JSObject json() { return new JSObject().put("id", id).put("name", name).put("number", number); }
    }
    private List<Row> rows(String id) {
        ArrayList<Row> out = new ArrayList<>();
        try (Cursor cur = getContext().getContentResolver().query(Phone.CONTENT_URI,
            new String[]{Phone.CONTACT_ID, Phone.DISPLAY_NAME_PRIMARY, Phone.NUMBER},
            id == null ? null : Phone.CONTACT_ID + "=?", id == null ? null : new String[]{id}, Phone.DISPLAY_NAME_PRIMARY + " ASC")) {
            if (cur == null) throw new IllegalStateException();
            while (cur.moveToNext()) {
                String n = cur.getString(1); if (n == null || n.trim().isEmpty()) continue;
                Row row = new Row(cur.getString(0), n, cur.getString(2));
                if (!row.key.isEmpty()) out.add(row);
            }
        }
        return out;
    }
    @PluginMethod public void search(PluginCall c) { require(c, "read", "readResult", () -> readResult(c)); }
    @PluginMethod public void duplicates(PluginCall c) { require(c, "read", "readResult", () -> readResult(c)); }
    @PermissionCallback private void readResult(PluginCall c) {
        if (!granted("read")) { c.reject("Allow Contacts in Android Settings → Apps → Horizon → Permissions."); return; }
        worker.execute(() -> {
            try {
                JSArray result = new JSArray();
                if ("duplicates".equals(c.getMethodName())) {
                    Map<String, LinkedHashMap<String, Row>> groups = new LinkedHashMap<>();
                    for (Row row : rows(null)) groups.computeIfAbsent(nameKey(row.name) + "\n" + row.key, k -> new LinkedHashMap<>()).putIfAbsent(row.id, row);
                    for (LinkedHashMap<String, Row> group : groups.values()) {
                        if (group.size() < 2) continue;
                        JSArray matches = new JSArray();
                        for (Row row : group.values()) { matches.put(row.json()); if (matches.length() == 20) break; }
                        result.put(matches); if (result.length() == 100) break;
                    }
                } else {
                    String q = nameKey(c.getString("name", ""));
                    if ((q.isEmpty() && !Boolean.TRUE.equals(c.getBoolean("browse", false))) || q.length() > 120) { c.reject("Enter a contact name first."); return; }
                    LinkedHashMap<String, Row> exact = new LinkedHashMap<>(), partial = new LinkedHashMap<>();
                    for (Row row : rows(null)) {
                        String n = nameKey(row.name), key = row.id + ":" + row.key;
                        if (n.equals(q)) exact.putIfAbsent(key, row);
                        else if (n.contains(q)) partial.putIfAbsent(key, row);
                    }
                    for (Row row : (exact.isEmpty() ? partial : exact).values()) { result.put(row.json()); if (result.length() == 50) break; }
                }
                c.resolve(new JSObject().put("rows", result));
            } catch (Exception e) { c.reject("Could not read device contacts."); }
        });
    }
    @PluginMethod public void dial(PluginCall c) {
        // V1.99.130: the chat request or a contact tap authorizes this one call. It goes through the user's
        // own default phone app; Horizon no longer asks to become the default phone app.
        prepareCall(c);
    }
    private void prepareCall(PluginCall c) {
        if (!c.getString("id", "").isEmpty() && !granted("read")) { c.reject("Allow access to contacts first."); return; }
        require(c, "call", "callResult", () -> callResult(c));
    }
    @PermissionCallback private void callResult(PluginCall c) {
        if (!granted("call")) { c.reject("Allow Phone permission for Horizon in Android Settings → Apps → Horizon → Permissions. No call was placed."); return; }
        worker.execute(() -> {
            try {
                String id = c.getString("id", ""), number = numberKey(c.getString("number"));
                if (number.isEmpty()) { c.reject("Invalid phone number."); return; }
                if (!id.isEmpty()) {
                    if (!granted("read") || rows(id).stream().noneMatch(r -> r.key.equals(number))) {
                        c.reject("Contact changed. Search for it again."); return;
                    }
                }
                getActivity().runOnUiThread(() -> {
                    try {
                        TelecomManager telecom = (TelecomManager) getContext().getSystemService(android.content.Context.TELECOM_SERVICE);
                        if (telecom == null) throw new IllegalStateException();
                        telecom.placeCall(Uri.fromParts("tel", number, null), new Bundle());
                        c.resolve(new JSObject().put("requested", true).put("handedOff", !isDialer()));
                    } catch (Exception e) { c.reject("Android could not place the call on this device."); }
                });
            } catch (Exception e) { c.reject("Could not verify this contact. No call was placed."); }
        });
    }
    private void cancel(PluginCall c) { c.resolve(new JSObject().put("cancelled", true)); }
    @PluginMethod public void link(PluginCall c) {
        if (!granted("read")) { c.reject("Allow access to contacts first."); return; }
        require(c, "write", "linkResult", () -> linkResult(c));
    }
    @PermissionCallback private void linkResult(PluginCall c) {
        if (!granted("write") || !granted("read")) { c.reject("Allow Contacts in Android Settings → Apps → Horizon → Permissions."); return; }
        worker.execute(() -> {
            try {
                JSArray arr = c.getArray("ids");
                String number = numberKey(c.getString("number"));
                if (arr == null || arr.length() < 2 || arr.length() > 20 || number.isEmpty()) throw new IllegalArgumentException();
                Set<String> ids = new LinkedHashSet<>();
                String label = "";
                for (int i = 0; i < arr.length(); i++) {
                    String id = arr.getString(i);
                    if (!id.matches("[0-9]{1,19}") || !ids.add(id)) throw new IllegalArgumentException();
                    Row match = rows(id).stream().filter(r -> r.key.equals(number)).findFirst().orElse(null);
                    if (match == null || (!label.isEmpty() && !nameKey(label).equals(nameKey(match.name)))) throw new IllegalArgumentException();
                    label = match.name;
                }
                final String name = label;
                getActivity().runOnUiThread(() -> new AlertDialog.Builder(getActivity()).setTitle("Link duplicate contacts?")
                    .setMessage(ids.size() + " entries for " + name + " · " + number + "\n\nNothing will be deleted. Android will group the matching entries.")
                    .setNegativeButton("Cancel", (d, w) -> cancel(c)).setOnCancelListener(d -> cancel(c))
                    .setPositiveButton("Link", (d, w) -> worker.execute(() -> applyLinks(c, ids, name, number))).show());
            } catch (Exception e) { c.reject("The contacts are no longer exact duplicates. Scan again."); }
        });
    }
    private void applyLinks(PluginCall c, Set<String> ids, String name, String number) {
        try {
            List<Long> anchors = new ArrayList<>();
            for (String id : ids) {
                if (rows(id).stream().noneMatch(r -> r.key.equals(number) && nameKey(name).equals(nameKey(r.name)))) throw new IllegalStateException();
                try (Cursor cur = getContext().getContentResolver().query(RawContacts.CONTENT_URI,
                        new String[]{RawContacts._ID}, RawContacts.CONTACT_ID + "=? AND " + RawContacts.DELETED + "=0", new String[]{id}, RawContacts._ID)) {
                    if (cur == null || !cur.moveToFirst()) throw new IllegalStateException();
                    anchors.add(cur.getLong(0));
                }
            }
            ArrayList<ContentProviderOperation> ops = new ArrayList<>();
            for (int i = 1; i < anchors.size(); i++) {
                ContentValues values = new ContentValues();
                values.put(AggregationExceptions.TYPE, AggregationExceptions.TYPE_KEEP_TOGETHER);
                values.put(AggregationExceptions.RAW_CONTACT_ID1, anchors.get(0));
                values.put(AggregationExceptions.RAW_CONTACT_ID2, anchors.get(i));
                ops.add(ContentProviderOperation.newUpdate(AggregationExceptions.CONTENT_URI).withValues(values).build());
            }
            getContext().getContentResolver().applyBatch(ContactsContract.AUTHORITY, ops);
            c.resolve(new JSObject().put("linked", true));
        } catch (Exception e) { c.reject("Android could not link these entries. No contacts were deleted."); }
    }
    @Override protected void handleOnDestroy() { if (instance.get() == this) instance.clear(); worker.shutdown(); }
}
