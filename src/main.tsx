import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyTheme, desktop, onThemeChange } from './lib/theme';
import { initKeyboard } from './lib/keyboard';
import { initPixeldrainAuth } from './lib/audio';
import { applySavedPrefs, reapplyTint } from './lib/appearance';
import './styles.css';

// Web / PC par offline-ready + "Install app" support. Android app ke andar service worker ki zaroorat nahi.
if (!Capacitor.isNativePlatform() && location.protocol.startsWith('http')) registerSW({ immediate: true });

// Windows app: apni upar wali patti (app ke rang mein), Windows ke buttons iske daayein taraf
const isDesktop = !!desktop();
if (isDesktop) document.documentElement.classList.add('desktop');

applyTheme();
onThemeChange(() => {
  applyTheme();
  reapplyTint();
});
initKeyboard();
// v16: Pixeldrain ki files app ke andar chalein (owner ki key — free account ka hotlink rok nahi lagta)
initPixeldrainAuth();
applySavedPrefs();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isDesktop && (
      <div className="titlebar" aria-hidden="true">
        <img src="./brand/khr-circle.png" alt="" width={18} height={18} />
        <span>KHR Production</span>
      </div>
    )}
    <App />
  </StrictMode>
);
