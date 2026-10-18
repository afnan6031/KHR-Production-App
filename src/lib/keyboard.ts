/**
 * Phone ka keyboard khule to typing box keyboard ke saath SMOOTH upar aaye (jhatka nahi).
 * --kb CSS variable = screen ka kitna hissa keyboard ke neeche hai; body.kb-open = keyboard khula hai.
 *
 * Android app: KHR ka apna native plugin (KhrNative) keyboard ki animation ke har frame par
 * unchai bhejta hai, is liye box bilkul keyboard ke saath chalta hai.
 * Browser / installed web app: visualViewport se, chhoti CSS animation ke saath.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

interface KhrNativePlugin {
  setBars(o: { color: string; dark: boolean }): Promise<void>;
  addListener(ev: 'keyboard', fn: (e: { height: number; animating: boolean }) => void): Promise<PluginListenerHandle>;
}
export const KhrNative = registerPlugin<KhrNativePlugin>('KhrNative');

let wasOpen = false;
function apply(offset: number, live: boolean) {
  const px = Math.max(0, Math.round(offset));
  const open = px > 40;
  const root = document.documentElement;
  // native har frame bhejta hai -> CSS animation ki zaroorat nahi; warna chhoti smooth animation
  root.classList.toggle('kb-live', live);
  root.style.setProperty('--kb', px + 'px');
  document.body.classList.toggle('kb-open', open);
  if (open && !wasOpen) {
    // jis input par likh rahe hain wo nazar aaye (chat ke ilawa forms mein)
    const el = document.activeElement as HTMLElement | null;
    window.setTimeout(() => {
      if (el && !el.closest('.composer')) el.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
    }, 260);
  }
  wasOpen = open;
}

export function initKeyboard() {
  if (Capacitor.isNativePlatform()) {
    document.documentElement.classList.add('native');
    KhrNative.addListener('keyboard', (e) => apply(e.height, e.animating)).catch(() => {});
    return;
  }
  document.documentElement.classList.add('kb-web');
  const vv = window.visualViewport;
  if (!vv) return;
  const onResize = () => {
    const covered = window.innerHeight - vv.height - vv.offsetTop;
    const typing = !!document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    apply(typing ? covered : 0, false);
  };
  vv.addEventListener('resize', onResize);
  vv.addEventListener('scroll', onResize);
  document.addEventListener('focusout', () => window.setTimeout(onResize, 120));
}

/** Android status bar / navigation bar ka rang app ke theme jaisa */
export function syncSystemBars(dark: boolean) {
  if (!Capacitor.isNativePlatform()) return;
  KhrNative.setBars({ color: dark ? '#0E1430' : '#FFFFFF', dark }).catch(() => {});
}
