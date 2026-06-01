import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { MediaItem, MediaType } from '../models/media-item.model';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SheetDataService {
  private readonly http = inject(HttpClient);
  private readonly _items = signal<MediaItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _error = signal<string | null>(null);

  readonly items = this._items.asReadonly();
  readonly loading = this._loading.asReadonly();
  readonly error = this._error.asReadonly();

  loadData(): void {
    if (this._items().length > 0 || this._loading()) return;

    this._loading.set(true);
    this._error.set(null);

    const url = `https://docs.google.com/spreadsheets/d/${environment.GOOGLE_SHEET_ID}/gviz/tq?tqx=out:json&gid=${environment.RESOURCE_GID}`;

    this.http.get(url, { responseType: 'text' }).subscribe({
      next: (text) => {
        try {
          const items = this.parseGvizResponse(text);
          this._items.set(items);
        } catch {
          this._error.set('Failed to parse sheet data');
        }
        this._loading.set(false);
      },
      error: () => {
        this._error.set('Failed to fetch sheet data');
        this._loading.set(false);
      },
    });
  }

  private parseGvizResponse(text: string): MediaItem[] {
    const jsonStr = text
      .replace(/^\/\*O_o\*\/\s*/, '')
      .replace(/^google\.visualization\.Query\.setResponse\(/, '')
      .replace(/\);?\s*$/, '');

    const data = JSON.parse(jsonStr);
    const rows: unknown[] = data.table.rows;

    return rows.map((row: any) => ({
      sNo: row.c[0]?.v ?? 0,
      type: (row.c[1]?.v ?? '') as MediaType,
      url: row.c[2]?.v ?? '',
      isProtected: (row.c[3]?.v ?? '').toLowerCase() === 'yes',
      title: row.c[4]?.v ?? '',
      desc: row.c[5]?.v ?? '',
      startTime: row.c[6]?.v ?? null,
    }));
  }
}
