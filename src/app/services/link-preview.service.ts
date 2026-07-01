import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, from, map, switchMap } from 'rxjs';
import { LinkPreview } from '../models/media-item.model';

interface MicrolinkResponse {
  status: string;
  data: {
    title?: string;
    description?: string;
    image?: { url: string };
    url?: string;
    logo?: { url: string };
  };
}

interface CachedPreview {
  timestamp: number;
  preview: LinkPreview;
}

const PREVIEW_CACHE_KEY = 'scrollix.linkPreviews';
const PREVIEW_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;
const PREVIEW_CACHE_LIMIT = 300;

@Injectable({ providedIn: 'root' })
export class LinkPreviewService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, LinkPreview>();

  getPreview(url: string): Observable<LinkPreview> {
    const cached = this.cache.get(url) ?? this.loadCachedPreview(url);
    if (cached) return of(cached);

    if (this.isAndroidApp()) {
      return this.fetchAndroidNative(url).pipe(
        map((result) => {
          const preview = result ?? this.createFallback(url);
          this.cache.set(url, preview);
          this.saveCachedPreview(url, preview);
          return preview;
        }),
        catchError(() => of(this.createFallback(url))),
      );
    }

    return this.fetchOgDirect(url).pipe(
      switchMap((result) => (result ? of(result) : this.fetchMicrolink(url))),
      map((result) => {
        const preview = result ?? this.createFallback(url);
        this.cache.set(url, preview);
        this.saveCachedPreview(url, preview);
        return preview;
      }),
      catchError(() => of(this.createFallback(url))),
    );
  }

  private fetchAndroidNative(url: string): Observable<LinkPreview | null> {
    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (!plugin?.fetchPreview) return of(null);

    return from(plugin.fetchPreview({ url })).pipe(
      map((preview) => this.normalizePreview(preview, url)),
      catchError(() => of(null)),
    );
  }

  private fetchOgDirect(url: string): Observable<LinkPreview | null> {
    return this.http.get(url, { responseType: 'text' }).pipe(
      map((html) => this.parseOgTags(html, url)),
      catchError(() => of(null)),
    );
  }

  private parseOgTags(html: string, url: string): LinkPreview | null {
    const getMeta = (prop: string): string => {
      const m =
        html.match(
          new RegExp(`<meta[^>]*property=["']${prop}["'][^>]*content=["']([^"']*)["']`, 'i'),
        ) ??
        html.match(
          new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${prop}["']`, 'i'),
        );
      return m?.[1] ?? '';
    };

    const image = getMeta('og:image');
    const title = getMeta('og:title');
    if (!image && !title) return null;

    return {
      title: title || getMeta('og:site_name'),
      description: getMeta('og:description'),
      image,
      url: getMeta('og:url') || url,
      logo: '',
    };
  }

  private fetchMicrolink(url: string): Observable<LinkPreview | null> {
    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
    return this.http.get<MicrolinkResponse>(apiUrl).pipe(
      map((res) => {
        if (res.status !== 'success') return null;
        return {
          title: res.data.title ?? '',
          description: res.data.description ?? '',
          image: res.data.image?.url ?? '',
          url: res.data.url ?? url,
          logo: res.data.logo?.url ?? '',
        };
      }),
      catchError(() => of(null)),
    );
  }

  private normalizePreview(
    preview: Partial<LinkPreview> | null | undefined,
    url: string,
  ): LinkPreview | null {
    if (!preview) return null;
    const title = preview.title?.trim() ?? '';
    const description = preview.description?.trim() ?? '';
    const image = preview.image?.trim() ?? '';
    const previewUrl = preview.url?.trim() || url;
    const logo = preview.logo?.trim() ?? '';
    if (!title && !description && !image) return null;
    return { title, description, image, url: previewUrl, logo };
  }

  private isAndroidApp(): boolean {
    const capacitor = window.Capacitor;
    return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === 'android';
  }

  private loadCachedPreview(url: string): LinkPreview | null {
    try {
      const raw = localStorage.getItem(PREVIEW_CACHE_KEY);
      if (!raw) return null;
      const cache = JSON.parse(raw) as Record<string, CachedPreview>;
      const entry = cache[url];
      if (!entry) return null;
      if (Date.now() - entry.timestamp > PREVIEW_CACHE_TTL) {
        delete cache[url];
        localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(cache));
        return null;
      }
      this.cache.set(url, entry.preview);
      return entry.preview;
    } catch {
      return null;
    }
  }

  private saveCachedPreview(url: string, preview: LinkPreview): void {
    try {
      const raw = localStorage.getItem(PREVIEW_CACHE_KEY);
      const cache = raw ? (JSON.parse(raw) as Record<string, CachedPreview>) : {};
      cache[url] = { timestamp: Date.now(), preview };
      localStorage.setItem(PREVIEW_CACHE_KEY, JSON.stringify(this.pruneCache(cache)));
    } catch {
      // Ignore storage failures; in-memory cache still works for this session.
    }
  }

  private pruneCache(cache: Record<string, CachedPreview>): Record<string, CachedPreview> {
    const now = Date.now();
    const entries = Object.entries(cache)
      .filter(([, entry]) => now - entry.timestamp <= PREVIEW_CACHE_TTL)
      .sort(([, a], [, b]) => b.timestamp - a.timestamp)
      .slice(0, PREVIEW_CACHE_LIMIT);
    return Object.fromEntries(entries);
  }

  private createFallback(url: string): LinkPreview {
    let domain = url;
    try {
      domain = new URL(url).hostname;
    } catch {
      /* keep url */
    }
    return { title: domain, description: url, image: '', url, logo: '' };
  }
}
