package com.khr.production;

import android.app.Activity;
import android.graphics.Color;
import android.view.View;
import android.view.Window;
import android.webkit.WebView;
import androidx.annotation.NonNull;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsAnimationCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.List;

/**
 * KHR Production native helper.
 * 1) "keyboard" event: keyboard ki animation ke HAR frame par batata hai ke WebView ka kitna hissa
 *    keyboard ke neeche hai, taake typing box keyboard ke saath smooth upar/neeche chale.
 * 2) setBars(): status bar / navigation bar ka rang app ke theme ke mutabiq.
 */
@CapacitorPlugin(name = "KhrNative")
public class KhrNativePlugin extends Plugin {
    private int lastPx = -1;
    private boolean animating = false;

    @Override
    public void load() {
        final Activity act = getActivity();
        final View root = act.getWindow().getDecorView();
        // v14: scroll karte waqt daayein taraf wali patli line (scrollbar) nazar na aaye — jaise baqi apps
        try {
            WebView web = getBridge().getWebView();
            if (web != null) {
                web.setVerticalScrollBarEnabled(false);
                web.setHorizontalScrollBarEnabled(false);
                web.setScrollbarFadingEnabled(true);
            }
        } catch (Exception ignored) {
            // koi baat nahi
        }
        ViewCompat.setWindowInsetsAnimationCallback(
            root,
            new WindowInsetsAnimationCompat.Callback(WindowInsetsAnimationCompat.Callback.DISPATCH_MODE_CONTINUE_ON_SUBTREE) {
                @Override
                public void onPrepare(@NonNull WindowInsetsAnimationCompat animation) {
                    if ((animation.getTypeMask() & WindowInsetsCompat.Type.ime()) != 0) animating = true;
                }

                @NonNull
                @Override
                public WindowInsetsCompat onProgress(@NonNull WindowInsetsCompat insets, @NonNull List<WindowInsetsAnimationCompat> running) {
                    emit(insets, true);
                    return insets;
                }

                @Override
                public void onEnd(@NonNull WindowInsetsAnimationCompat animation) {
                    animating = false;
                    WindowInsetsCompat now = ViewCompat.getRootWindowInsets(root);
                    if (now != null) emit(now, false);
                }
            }
        );
        // purane phones / bina animation wale keyboard ke liye
        root.getViewTreeObserver().addOnGlobalLayoutListener(() -> {
            if (animating) return;
            WindowInsetsCompat now = ViewCompat.getRootWindowInsets(root);
            if (now != null) emit(now, false);
        });
    }

    private void emit(WindowInsetsCompat insets, boolean anim) {
        try {
            if (getBridge() == null) return;
            WebView wv = getBridge().getWebView();
            View root = getActivity().getWindow().getDecorView();
            if (wv == null || root == null) return;
            int ime = insets.getInsets(WindowInsetsCompat.Type.ime()).bottom;
            int[] loc = new int[2];
            wv.getLocationInWindow(loc);
            int webBottom = loc[1] + wv.getHeight();
            int keyboardTop = root.getHeight() - ime;
            int overlap = Math.max(0, webBottom - keyboardTop);
            float density = getActivity().getResources().getDisplayMetrics().density;
            int px = Math.round(overlap / density);
            if (px == lastPx) return;
            lastPx = px;
            JSObject o = new JSObject();
            o.put("height", px);
            o.put("animating", anim);
            notifyListeners("keyboard", o);
        } catch (Exception ignored) {
            // kuch na ho to app chalti rahe
        }
    }

    @PluginMethod
    public void setBars(final PluginCall call) {
        final String color = call.getString("color", "#090C24");
        final Boolean darkObj = call.getBoolean("dark", true);
        final boolean dark = darkObj == null || darkObj;
        getActivity().runOnUiThread(() -> {
            try {
                Window w = getActivity().getWindow();
                int c = Color.parseColor(color);
                w.getDecorView().setBackgroundColor(c);
                WebView wv = getBridge().getWebView();
                if (wv != null && wv.getParent() instanceof View) ((View) wv.getParent()).setBackgroundColor(c);
                try {
                    w.setStatusBarColor(Color.TRANSPARENT);
                    w.setNavigationBarColor(c);
                } catch (Exception ignored) {
                    // naye Android par ye system khud karta hai
                }
                WindowInsetsControllerCompat ctl = WindowCompat.getInsetsController(w, w.getDecorView());
                ctl.setAppearanceLightStatusBars(!dark);
                ctl.setAppearanceLightNavigationBars(!dark);
            } catch (Exception ignored) {
                // galat rang ho to kuch na karein
            }
            call.resolve();
        });
    }
}
