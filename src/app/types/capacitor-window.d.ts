interface ScrollixPipPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  enter(options: { width: number; height: number }): Promise<void>;
}

interface ScrollixBrowserPlugin {
  open(options: { url: string; title?: string }): Promise<void>;
  openOffline(options: {
    url: string;
    baseUrl: string;
    title?: string;
    html: string;
  }): Promise<void>;
  openExternal(options: { url: string }): Promise<void>;
  fetchHtml(options: { url: string }): Promise<{ html: string }>;
  fetchPreview(options: { url: string }): Promise<ScrollixLinkPreview>;
  consumeAppLink(): Promise<{ url: string }>;
}

interface ScrollixLinkPreview {
  title: string;
  description: string;
  image: string;
  url: string;
  logo: string;
}

interface ScrollixNativeBridge {
  isBiometricAvailable(): boolean;
  enableBiometric(secret: string): void;
  authenticateBiometric(): void;
  disableBiometric(): void;
}

interface Window {
  ScrollixNative?: ScrollixNativeBridge;
  Capacitor?: {
    getPlatform?(): string;
    isNativePlatform?(): boolean;
    Plugins?: {
      ScrollixPip?: ScrollixPipPlugin;
      ScrollixBrowser?: ScrollixBrowserPlugin;
    };
  };
}
