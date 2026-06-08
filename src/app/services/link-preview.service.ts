import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, catchError, map, switchMap } from 'rxjs';
import { LinkPreview } from '../models/media-item.model';
import { PostOpenPreferenceService } from './post-open-preference.service';

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

@Injectable({ providedIn: 'root' })
export class LinkPreviewService {
  private readonly http = inject(HttpClient);
  private readonly postOpenPreference = inject(PostOpenPreferenceService);
  private readonly cache = new Map<string, LinkPreview>();

  getPreview(url: string): Observable<LinkPreview> {
    const cached = this.cache.get(url);
    if (cached) return of(cached);

    const firstFetch = this.postOpenPreference.isAndroidApp()
      ? this.fetchMicrolink(url)
      : this.fetchOgDirect(url);
    const fallbackFetch = this.postOpenPreference.isAndroidApp()
      ? of(null)
      : this.fetchMicrolink(url);

    return firstFetch.pipe(
      switchMap((result) => (result ? of(result) : fallbackFetch)),
      map((result) => {
        const preview = result ?? this.createFallback(url);
        this.cache.set(url, preview);
        return preview;
      }),
      catchError(() => of(this.createFallback(url))),
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
