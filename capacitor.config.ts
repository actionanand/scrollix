import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.actionanand.scrollix.app',
  appName: 'Scrollix',
  webDir: 'dist/scrollix/browser',
  server: {
    androidScheme: 'https',
  },
  android: {
    backgroundColor: '#f1f8e9',
  },
};

export default config;
