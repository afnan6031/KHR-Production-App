import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.khr.production',
  appName: 'KHR Production',
  webDir: 'dist',
  plugins: {
    // App band ho tab bhi notification (Firebase) — foreground mein app khud dikhati hai
    PushNotifications: { presentationOptions: [] }
  },
  android: {
    backgroundColor: '#090C24',
    // har Android par content status/navigation bar ke neeche na chhupe (keyboard KHR plugin sambhalta hai)
    adjustMarginsForEdgeToEdge: 'force'
  }
};

export default config;
