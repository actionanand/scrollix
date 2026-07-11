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
  getSystemBars(): Promise<ScrollixSystemBars>;
}

interface ScrollixLinkPreview {
  title: string;
  description: string;
  image: string;
  url: string;
  logo: string;
}

interface ScrollixSystemBars {
  top: number;
  bottom: number;
  left: number;
  right: number;
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
