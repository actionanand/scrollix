import { Injectable, signal } from '@angular/core';
import { MediaItem } from '../models/media-item.model';

const STORAGE_KEY = 'scrollix.postOpenInApp';

@Injectable({ providedIn: 'root' })
export class PostOpenPreferenceService {
  readonly isAndroidApp = signal(this.detectAndroidApp());
  readonly openInApp = signal(this.readOpenInAppPreference());
  readonly activePost = signal<MediaItem | null>(null);

  private ignoreNextPopState = false;

  constructor() {
    window.addEventListener('popstate', this.handlePopState);
  }

  openPost(item: MediaItem): void {
    if (this.isAndroidApp() && this.openInApp()) {
      this.openReader(item);
      return;
    }

    this.openExternal(item.url);
  }

  openExternal(url: string): void {
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  setOpenInApp(value: boolean): void {
    this.openInApp.set(value);
    try {
      localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
    } catch {
      // Storage can be unavailable in restricted browser contexts.
    }
  }

  closeReader(): void {
    if (!this.activePost()) return;
    this.activePost.set(null);
    if (history.state?.scrollixPostReader === true) {
      this.ignoreNextPopState = true;
      history.back();
    }
  }

  private openReader(item: MediaItem): void {
    this.activePost.set(item);
    if (history.state?.scrollixPostReader === true) return;
    history.pushState({ scrollixPostReader: true }, '', location.href);
  }

  private readonly handlePopState = (): void => {
    if (this.ignoreNextPopState) {
      this.ignoreNextPopState = false;
      return;
    }
    if (this.activePost()) {
      this.activePost.set(null);
    }
  };

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
}
