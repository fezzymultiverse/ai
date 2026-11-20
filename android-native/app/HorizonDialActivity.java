package __APPID__;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

/** Role qualification and external tel links enter Horizon; never launch another dialer. */
public class HorizonDialActivity extends Activity {
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Uri uri = getIntent() == null ? null : getIntent().getData();
        String number = uri != null && "tel".equals(uri.getScheme()) ? uri.getSchemeSpecificPart() : "";
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        open.putExtra("horizon_dial_number", number);
        startActivity(open);
        finish();
    }
}
