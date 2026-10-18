import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.khr.production',
  appName: 'KHR Production',
  webDir: 'dist',
  android: {
    backgroundColor: '#0E151B',
    // Android 15+ par content status bar ke neeche na chhupe
    adjustMarginsForEdgeToEdge: 'auto'
  }
};

export default config;
