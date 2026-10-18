/**
 * Phone ka keyboard khule to typing box keyboard ke upar aaye.
 * --kb CSS variable = keyboard ki unchai (jitni screen keyboard ne dhaki hai), body.kb-open = keyboard khula hai.
 * Android app (edge-to-edge) mein WebView khud chhota nahi hota, is liye ye hum khud sambhalte hain.
 */
import { Capacitor } from '@capacitor/core';
import { Keyboard } from '@capacitor/keyboard';

let base = window.innerHeight;

function apply(offset: number) {
  const px = Math.max(0, Math.round(offset));
  const open = px > 60;
  document.documentElement.style.setProperty('--kb', open ? px + 'px' : '0px');
  document.body.classList.toggle('kb-open', open);
  if (open) {
    // jis input par likh rahe hain wo nazar aaye
    const el = document.activeElement as HTMLElement | null;
    window.setTimeout(() => el?.scrollIntoView?.({ block: 'nearest' }), 60);
  }
}

export function initKeyboard() {
  window.addEventListener('orientationchange', () => window.setTimeout(() => { base = window.innerHeight; }, 400));
  if (Capacitor.isNativePlatform()) {
    Keyboard.addListener('keyboardWillShow', (info) => {
      // agar WebView khud chhota ho gaya ho to sirf baaqi hissa
      apply(info.keyboardHeight - Math.max(0, base - window.innerHeight));
    }).catch(() => {});
    Keyboard.addListener('keyboardDidShow', (info) => {
      apply(info.keyboardHeight - Math.max(0, base - window.innerHeight));
    }).catch(() => {});
    Keyboard.addListener('keyboardWillHide', () => apply(0)).catch(() => {});
    window.addEventListener('resize', () => {
      if (!document.body.classList.contains('kb-open')) base = window.innerHeight;
    });
    return;
  }
  // Browser / installed web app
  const vv = window.visualViewport;
  if (!vv) return;
  const onResize = () => {
    const covered = window.innerHeight - vv.height - vv.offsetTop;
    const typing = !!document.activeElement && /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName);
    apply(typing ? covered : 0);
  };
  vv.addEventListener('resize', onResize);
  vv.addEventListener('scroll', onResize);
  document.addEventListener('focusout', () => window.setTimeout(onResize, 120));
}
