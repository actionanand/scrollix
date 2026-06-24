import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of } from 'rxjs';
import { MediaItem, MediaType, GvizResponse } from '../models/media-item.model';
import { ToastService } from './toast.service';
import { environment } from '../../environments/environment';
import {
  buildFacebookVideoUrl,
  buildTikTokVideoUrl,
  extractFacebookVideoId,
  extractTikTokVideoId,
} from '../utils/video-id';

const CACHE_KEY = 'scrollix_sheet_data';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  timestamp: number;
  items: MediaItem[];
}

interface MicrolinkResolveResponse {
  status: string;
  data?: {
    url?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class SheetDataService {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly _items = signal<MediaItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);
  private readonly _isOffline = signal(!navigator.onLine);
  private readonly _resolvingIds = signal<ReadonlySet<number>>(new Set());

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isOffline = this._isOffline.asReadonly();
  readonly resolvingIds = this._resolvingIds.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._isOffline.set(false));
    window.addEventListener('offline', () => this._isOffline.set(true));
  }

  loadData(forceRefresh = false): void {
    if (this._loading()) return;
    if (forceRefresh) this.resetResolutionState();

    if (!forceRefresh) {
      if (this._items().length > 0) return;
      const cached = this.loadFromCache();
      if (cached) {
        this._items.set(cached);
        return;
      }
    }

    if (!navigator.onLine) {
      const cached = this.loadFromCache(true);
      if (cached && cached.length > 0) {
        this._items.set(cached);
        this.toast.show('Showing offline content');
        return;
      }
      this._error.set('No internet connection and no cached content');
      return;
    }

    this._loading.set(true);
    this._error.set(null);

    const url = `https://docs.google.com/spreadsheets/d/${environment.GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&gid=${environment.RESOURCE_GID}`;

    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (text) => {
        try {
          const items = this.parseGvizResponse(text);
          this._items.set(items);
          this.saveToCache(items);
          if (forceRefresh) this.toast.show('Content refreshed');
          this._loading.set(false);
        } catch {
          this._error.set('Failed to parse sheet data');
          this._loading.set(false);
        }
      },
      error: () => {
        const cached = this.loadFromCache(true);
        if (cached && cached.length > 0) {
          this._items.set(cached);
          this.toast.show('Showing cached content');
        } else {
          this._error.set('Failed to fetch data. Check your connection.');
        }
        this._loading.set(false);
      },
    });
  }

  private loadFromCache(ignoreTTL = false): MediaItem[] | null {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      if (!ignoreTTL && Date.now() - entry.timestamp > CACHE_TTL) return null;
      if (!entry.items.every((item) => typeof item.hash === 'string' && item.hash.length > 0)) {
        return null;
      }
      return entry.items;
    } catch {
      return null;
    }
  }

  private saveToCache(items: MediaItem[]): void {
    try {
      const entry: CacheEntry = { timestamp: Date.now(), items };
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
    } catch {
      // Storage unavailable
    }
  }

  ensureResolved(items: readonly MediaItem[]): void {
    for (const item of items) {
      this.ensureResolvedItem(item);
    }
  }

  private resolveShareItem(item: MediaItem): Observable<MediaItem> {
    if (item.type === 'facebook-share') {
      return this.resolveRedirectShareItem(item, extractFacebookVideoId, buildFacebookVideoUrl);
    }

    if (item.type === 'tiktok-share') {
      return this.resolveRedirectShareItem(item, extractTikTokVideoId, buildTikTokVideoUrl);
    }

    return of(item);
  }

  private ensureResolvedItem(item: MediaItem): void {
    if (!this.needsRedirectResolution(item)) return;
    this.resolveAndStoreItem(item);
  }

  private needsRedirectResolution(item: MediaItem): boolean {
    if (item.resolvedUrl || this._resolvingIds().has(item.sNo)) return false;
    return item.type === 'facebook-share' || item.type === 'tiktok-share';
  }

  private resolveAndStoreItem(item: MediaItem, onDone?: () => void): void {
    const synchronous = this.resolveSynchronously(item);
    if (synchronous) {
      this.updateResolvedItem(synchronous);
      onDone?.();
      return;
    }

    this.addResolvingId(item.sNo);
    this.resolveShareItem(item).subscribe({
      next: (resolvedItem) => {
        this.updateResolvedItem(resolvedItem);
      },
      error: () => {
        this.removeResolvingId(item.sNo);
        onDone?.();
      },
      complete: () => {
        this.removeResolvingId(item.sNo);
        onDone?.();
      },
    });
  }

  private resolveSynchronously(item: MediaItem): MediaItem | null {
    if (item.type === 'facebook-share') {
      const id = extractFacebookVideoId(item.url);
      return id ? { ...item, resolvedUrl: buildFacebookVideoUrl(item.url) } : null;
    }

    if (item.type === 'tiktok-share') {
      const id = extractTikTokVideoId(item.url);
      return id ? { ...item, resolvedUrl: buildTikTokVideoUrl(item.url) } : null;
    }

    return null;
  }

  private updateResolvedItem(resolvedItem: MediaItem): void {
    if (!resolvedItem.resolvedUrl) return;
    this._items.update((items) =>
      items.map((item) => (item.sNo === resolvedItem.sNo ? resolvedItem : item)),
    );
    this.saveToCache(this._items());
  }

  private resolveRedirectShareItem(
    item: MediaItem,
    extractId: (urlOrId: string) => string | null,
    buildUrl: (urlOrId: string) => string,
  ): Observable<MediaItem> {
    const existingId = extractId(item.url);
    if (existingId) {
      return of({ ...item, resolvedUrl: buildUrl(item.url) });
    }

    const apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(item.url)}`;
    return this.http.get<MicrolinkResolveResponse>(apiUrl).pipe(
      map((res) => {
        const resolvedUrl = res.status === 'success' ? (res.data?.url ?? '') : '';
        const resolvedId = extractId(resolvedUrl);
        return resolvedId ? { ...item, resolvedUrl: buildUrl(resolvedUrl) } : item;
      }),
      catchError(() => of(item)),
    );
  }

  private parseGvizResponse(text: string): MediaItem[] {
    const jsonStr = text
      .replace(/^\/\*O_o\*\/\s*/, '')
      .replace(/^google\.visualization\.Query\.setResponse\(/, '')
      .replace(/\);?\s*$/, '');

    const data = JSON.parse(jsonStr) as GvizResponse;

    return data.table.rows
      .filter((row) => {
        const sNo = Number(row.c[0]?.v);
        return Number.isFinite(sNo) && sNo > 0;
      })
      .map((row) => ({
        sNo: Number(row.c[0]!.v),
        type: String(row.c[1]?.v ?? '') as MediaType,
        url: String(row.c[2]?.v ?? ''),
        isProtected: String(row.c[3]?.v ?? '').toLowerCase() === 'yes',
        title: String(row.c[4]?.v ?? ''),
        desc: String(row.c[5]?.v ?? ''),
        startTime: row.c[6]?.v != null ? Number(row.c[6]!.v) : null,
        hash: String(row.c[7]?.v ?? ''),
        resolvedUrl: '',
      }));
  }

  private addResolvingId(sNo: number): void {
    this._resolvingIds.update((ids) => new Set(ids).add(sNo));
  }

  private removeResolvingId(sNo: number): void {
    this._resolvingIds.update((ids) => {
      const next = new Set(ids);
      next.delete(sNo);
      return next;
    });
  }

  private resetResolutionState(): void {
    this._resolvingIds.set(new Set());
  }
}
