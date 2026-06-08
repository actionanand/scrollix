interface ScrollixPipPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  enter(options: { width: number; height: number }): Promise<void>;
}

interface Window {
  Capacitor?: {
    getPlatform?(): string;
    isNativePlatform?(): boolean;
    Plugins?: {
      ScrollixPip?: ScrollixPipPlugin;
    };
  };
}
