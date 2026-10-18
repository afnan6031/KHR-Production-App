import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.khr.production',
  appName: 'KHR Production',
  webDir: 'dist',
  plugins: {
    // keyboard ki jagah app khud sambhalti hai (src/lib/keyboard.ts)
    Keyboard: { resizeOnFullScreen: true }
  },
  android: {
    backgroundColor: '#090C24',
    // Android 15+ par content status bar ke neeche na chhupe
    adjustMarginsForEdgeToEdge: 'auto'
  }
};

export default config;
