import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
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

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isOffline = this._isOffline.asReadonly();

  constructor() {
    window.addEventListener('online', () => this._isOffline.set(false));
    window.addEventListener('offline', () => this._isOffline.set(true));
  }

  loadData(forceRefresh = false): void {
    if (this._loading()) return;

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
          this.resolveShareItems(items).subscribe({
            next: (resolvedItems) => {
              this._items.set(resolvedItems);
              this.saveToCache(resolvedItems);
              if (forceRefresh) this.toast.show('Content refreshed');
              this._loading.set(false);
            },
            error: () => {
              this._items.set(items);
              this.saveToCache(items);
              if (forceRefresh) this.toast.show('Content refreshed');
              this._loading.set(false);
            },
          });
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

  private resolveShareItems(items: MediaItem[]): Observable<MediaItem[]> {
    if (items.length === 0) return of([]);
    return forkJoin(items.map((item) => this.resolveShareItem(item)));
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
        resolvedUrl: '',
      }));
  }
}
