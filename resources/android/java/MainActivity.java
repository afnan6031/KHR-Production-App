package com.khr.production;

import android.os.Bundle;
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
    }
}
