import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { applyTheme, onThemeChange } from './lib/theme';
import './styles.css';

// Web / PC par offline-ready + "Install app" support. Android app ke andar service worker ki zaroorat nahi.
if (!Capacitor.isNativePlatform() && location.protocol.startsWith('http')) registerSW({ immediate: true });

applyTheme();
onThemeChange(() => applyTheme());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
