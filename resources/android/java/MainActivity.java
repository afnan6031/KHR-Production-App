package com.khr.production;

import android.os.Build;
import android.os.Bundle;
import android.view.Display;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // KHR ka apna chhota plugin: keyboard ke saath smooth movement + status bar ka rang
        registerPlugin(KhrNativePlugin.class);
        super.onCreate(savedInstanceState);
        // App poori screen leti hai; status/navigation bar ki jagah Capacitor margins se chhorta hai
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        preferHighRefresh();
    }

    @Override
    public void onResume() {
        super.onResume();
        preferHighRefresh();
    }

    /**
     * v15: phone ka sab se tez refresh rate (60 / 90 / 120 / 144 Hz) — bahut se phone app ko
     * khud 60 (ya battery bachane ke liye kam) par chalate hain jab tak app khud na maange.
     */
    private void preferHighRefresh() {
        try {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
            Display display = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R ? getDisplay() : getWindowManager().getDefaultDisplay();
            if (display == null) return;
            Display.Mode cur = display.getMode();
            Display.Mode best = cur;
            for (Display.Mode m : display.getSupportedModes()) {
                boolean sameSize = m.getPhysicalWidth() == cur.getPhysicalWidth() && m.getPhysicalHeight() == cur.getPhysicalHeight();
                if (sameSize && m.getRefreshRate() > best.getRefreshRate() + 0.5f) best = m;
            }
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            if (lp.preferredDisplayModeId == best.getModeId()) return;
            lp.preferredDisplayModeId = best.getModeId();
            lp.preferredRefreshRate = best.getRefreshRate();
            getWindow().setAttributes(lp);
        } catch (Throwable ignored) {
            // purana / alag phone — normal refresh rate par hi chalegi
        }
    }
}
