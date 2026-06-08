import { Injectable, computed, inject, signal } from '@angular/core';
import { MediaItem } from '../models/media-item.model';
import { environment } from '../../environments/environment';
import { PostOpenPreferenceService } from './post-open-preference.service';
import { ToastService } from './toast.service';

interface OfflinePost {
  url: string;
  title: string;
  desc: string;
  html: string;
  savedAt: number;
}

const STORAGE_KEY = 'scrollix.offlinePosts';
const OFFLINE_SNO_BASE = 900000;

@Injectable({ providedIn: 'root' })
export class OfflinePostService {
  private readonly postOpenPreference = inject(PostOpenPreferenceService);
  private readonly toast = inject(ToastService);
  private readonly limit = environment.SCROLLIX_CONFIG.offlinePostLimit;

  readonly savedPosts = signal<OfflinePost[]>(this.readSavedPosts());
  readonly showOfflineOnly = signal(false);
  readonly savingUrl = signal<string | null>(null);
  readonly canUseOffline = this.postOpenPreference.isAndroidApp;
  readonly offlineLimit = signal(this.limit);

  readonly savedMediaItems = computed<MediaItem[]>(() =>
    this.savedPosts().map((post, index) => ({
      sNo: OFFLINE_SNO_BASE + index,
      type: 'post',
      url: post.url,
      isProtected: false,
      title: post.title,
      desc: post.desc,
      startTime: null,
      resolvedUrl: '',
    })),
  );

  isSaved(url: string): boolean {
    return this.savedPosts().some((post) => post.url === url);
  }

  setShowOfflineOnly(value: boolean): void {
    this.showOfflineOnly.set(value);
  }

  async save(item: MediaItem): Promise<void> {
    if (!this.canUseOffline()) return;
    if (this.isSaved(item.url)) return;
    if (this.savedPosts().length >= this.limit) {
      this.toast.show(`Maximum ${this.limit} offline posts reached. Delete saved content first.`);
      return;
    }

    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (!plugin) {
      this.toast.show('Offline save is unavailable on this device');
      return;
    }

    this.savingUrl.set(item.url);
    try {
      const result = await plugin.fetchHtml({ url: item.url });
      const nextPosts = [
        ...this.savedPosts(),
        {
          url: item.url,
          title: item.title || this.domainFromUrl(item.url),
          desc: item.desc,
          html: result.html,
          savedAt: Date.now(),
        },
      ];
      this.writeSavedPosts(nextPosts);
      this.savedPosts.set(nextPosts);
      this.toast.show('Post saved offline');
    } catch {
      this.toast.show('Unable to save this post offline');
    } finally {
      this.savingUrl.set(null);
    }
  }

  remove(url: string): void {
    const nextPosts = this.savedPosts().filter((post) => post.url !== url);
    this.writeSavedPosts(nextPosts);
    this.savedPosts.set(nextPosts);
    this.toast.show('Offline post removed');
  }

  openSaved(item: MediaItem): boolean {
    const saved = this.savedPosts().find((post) => post.url === item.url);
    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (!saved || !plugin) return false;

    void plugin
      .openOffline({
        url: saved.url,
        baseUrl: saved.url,
        title: saved.title,
        html: saved.html,
      })
      .catch(() => this.toast.show('Unable to open saved post'));
    return true;
  }

  private readSavedPosts(): OfflinePost[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as OfflinePost[];
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (post) =>
          typeof post.url === 'string' &&
          typeof post.title === 'string' &&
          typeof post.desc === 'string' &&
          typeof post.html === 'string' &&
          typeof post.savedAt === 'number',
      );
    } catch {
      return [];
    }
  }

  private writeSavedPosts(posts: OfflinePost[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
    } catch {
      this.toast.show('Offline storage is full. Remove saved posts and try again.');
      throw new Error('Offline storage write failed');
    }
  }

  private domainFromUrl(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return 'Post';
    }
  }
}
