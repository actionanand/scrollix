import { Component, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { VideoPlayerComponent } from '../video-player/video-player';
import { decodeVideoId, encodeVideoId } from '../../utils/video-id';

@Component({
  selector: 'app-video-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VideoPlayerComponent, RouterLink],
  templateUrl: './video-detail.html',
  styleUrl: './video-detail.scss',
})
export class VideoDetailComponent {
  private readonly sheetData = inject(SheetDataService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  protected readonly loading = this.sheetData.loading;
  private readonly routeId = signal('');

  protected readonly item = computed(() => {
    const id = this.routeId();
    if (!id) return null;
    const slug = decodeVideoId(id);
    if (!slug) return null;
    const found = this.sheetData.items().find((i) => {
      // Match by URL slug: the slug is either the full URL's last segment or a short ID
      if (i.url === slug) return true;
      try {
        const segments = new URL(i.url).pathname.split('/').filter(Boolean);
        return segments[segments.length - 1] === slug;
      } catch {
        return false;
      }
    });
    if (!found) return null;
    if (found.isProtected && !this.auth.isLoggedIn()) return null;
    if (found.type === 'post') return null;
    return found;
  });

  protected readonly shareUrl = computed(() => {
    const mediaItem = this.item();
    if (!mediaItem) return '';
    return `${location.origin}/video/${encodeVideoId(mediaItem.url)}`;
  });

  constructor() {
    const route = inject(ActivatedRoute);
    route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.routeId.set(params.get('id') ?? '');
    });
    this.sheetData.loadData();
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.toast.show('📋 Link copied!');
    } catch {
      this.toast.show('Failed to copy link');
    }
  }

  protected goBack(): void {
    this.router.navigate(['/videos']);
  }
}
