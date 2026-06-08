import { Injectable, signal } from '@angular/core';
import { MediaItem } from '../models/media-item.model';

const STORAGE_KEY = 'scrollix.postOpenInApp';

@Injectable({ providedIn: 'root' })
export class PostOpenPreferenceService {
  readonly isAndroidApp = signal(this.detectAndroidApp());
  readonly openInApp = signal(this.readOpenInAppPreference());

  openPost(item: MediaItem): void {
    if (this.isAndroidApp() && this.openInApp()) {
      void this.openNativeReader(item);
      return;
    }

    this.openExternal(item.url);
  }

  openExternal(url: string): void {
    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (this.isAndroidApp() && plugin) {
      void plugin.openExternal({ url }).catch(() => this.openWindow(url));
      return;
    }

    this.openWindow(url);
  }

  setOpenInApp(value: boolean): void {
    this.openInApp.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  private async openNativeReader(item: MediaItem): Promise<void> {
    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (!plugin) {
      this.openExternal(item.url);
      return;
    }

    try {
      await plugin.open({
        url: item.url,
        title: item.title || this.domainFromUrl(item.url),
      });
    } catch {
      this.openExternal(item.url);
    }
  }

  private openWindow(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  private readOpenInAppPreference(): boolean {
    if (!this.detectAndroidApp()) return false;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === '0') return false;
      if (stored === '1') return true;
    } catch {
      // Fall back to the Android app default.
    }
    return true;
  }

  private detectAndroidApp(): boolean {
    const capacitor = window.Capacitor;
    const isNative = capacitor?.isNativePlatform?.() === true;
    const platform = capacitor?.getPlatform?.();
    return isNative && platform === 'android';
  }

  private domainFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'Post';
    }
  }
}
