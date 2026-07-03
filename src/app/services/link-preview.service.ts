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
    if (cached && this.canUseCachedPreview(url, cached)) return of(cached);
    if (cached) this.cache.delete(url);

    // ...cache check...
    if (this.isAndroidApp()) {
      return this.fetchAndroidNative(url).pipe(
        map((result) => {
          const preview = result ?? this.createFallback(url, this.isFacebookSharePostUrl(url));
          this.cache.set(url, preview);
          this.saveCachedPreview(url, preview);
          return preview;
        }),
        catchError(() => of(this.createFallback(url, this.isFacebookSharePostUrl(url)))),
      );
    }

    // web only ↓ — this branch never runs on Android
    return this.fetchOgDirect(url).pipe(
      switchMap((result) => (result ? of(result) : this.fetchMicrolink(url))),
      map((result) => {
        const preview = result ?? this.createFallback(url, this.isFacebookSharePostUrl(url));
        this.cache.set(url, preview);
        this.saveCachedPreview(url, preview);
        return preview;
      }),
      catchError(() => of(this.createFallback(url, this.isFacebookSharePostUrl(url)))),
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
    const title = this.decodeHtmlEntities(preview.title?.trim() ?? '');
    const description = this.decodeHtmlEntities(preview.description?.trim() ?? '');
    const image = this.sanitizePreviewImage(preview.image?.trim() ?? '', url);
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
      if (!this.canUseCachedPreview(url, entry.preview)) {
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
      // Inlined data-URI images can be large; keep them in-memory only so we never
      // blow the localStorage quota. The stripped entry is re-fetched on next load.
      const persisted = preview.image.startsWith('data:') ? { ...preview, image: '' } : preview;
      cache[url] = { timestamp: Date.now(), preview: persisted };
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

  private createFallback(url: string, facebookSharePost = false): LinkPreview {
    if (facebookSharePost) {
      return {
        title: 'Facebook shared post',
        description: 'Preview is unavailable. Open the post to view it on Facebook.',
        image: '',
        url,
        logo: '',
      };
    }

    let domain = url;
    try {
      domain = new URL(url).hostname;
    } catch {
      /* keep url */
    }
    return { title: domain, description: url, image: '', url, logo: '' };
  }

  private canUseCachedPreview(url: string, preview: LinkPreview): boolean {
    if (!this.isMetaContentUrl(url)) return true;
    return !!this.sanitizePreviewImage(preview.image, url);
  }

  private isFacebookSharePostUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return /(^|\.)facebook\.com$/i.test(parsed.hostname) && parsed.pathname.includes('/share/p/');
    } catch {
      return false;
    }
  }

  private isMetaContentUrl(url: string): boolean {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return (
        /(^|\.)facebook\.com$/.test(host) ||
        /(^|\.)fb\.com$/.test(host) ||
        /(^|\.)instagram\.com$/.test(host) ||
        /(^|\.)reddit\.com$/.test(host) ||
        /(^|\.)redd\.it$/.test(host)
      );
    } catch {
      return false;
    }
  }

  private sanitizePreviewImage(image: string, sourceUrl: string): string {
    if (!image) return '';
    const trimmed = image.trim();
    // Images inlined by the Android native layer are already fetched and trusted.
    if (/^data:image\//i.test(trimmed)) return trimmed;
    const normalized = this.decodeHtmlEntities(trimmed);
    let parsed: URL;
    try {
      parsed = new URL(normalized, sourceUrl);
    } catch {
      return '';
    }

    const href = parsed.href;
    const lower = href.toLowerCase();
    if (lower.startsWith('data:')) return '';
    if (lower.includes('emoji')) return '';
    if (lower.includes('static.xx.fbcdn.net/rsrc.php')) return '';
    if (lower.includes('/images/emoji.php')) return '';
    if (this.isFacebookSharePostUrl(sourceUrl) && !lower.includes('fbcdn.net')) return '';
    return href;
  }

  private decodeHtmlEntities(value: string): string {
    if (!value) return '';
    const textarea = document.createElement('textarea');
    let decoded = value;
    for (let index = 0; index < 3; index++) {
      textarea.innerHTML = decoded;
      const next = textarea.value;
      if (next === decoded) break;
      decoded = next;
    }
    return decoded.replace(/\s+/g, ' ').trim();
  }
}
