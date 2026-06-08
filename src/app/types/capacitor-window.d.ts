interface ScrollixPipPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  enter(options: { width: number; height: number }): Promise<void>;
}

interface ScrollixBrowserPlugin {
  open(options: { url: string; title?: string }): Promise<void>;
  openExternal(options: { url: string }): Promise<void>;
}

interface Window {
  Capacitor?: {
    getPlatform?(): string;
    isNativePlatform?(): boolean;
    Plugins?: {
      ScrollixPip?: ScrollixPipPlugin;
      ScrollixBrowser?: ScrollixBrowserPlugin;
    };
  };
}
