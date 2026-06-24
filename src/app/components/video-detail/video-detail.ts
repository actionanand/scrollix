import {
  Component,
  inject,
  signal,
  computed,
  effect,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { ToastService } from '../../services/toast.service';
import { VideoPlayerComponent } from '../video-player/video-player';
import { buildVideoShareUrl } from '../../utils/share-url';

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
    const hash = this.routeId();
    if (!hash) return null;
    const found = this.sheetData.items().find((i) => i.hash === hash);
    if (!found) return null;
    if (found.isProtected && !this.auth.isLoggedIn()) return null;
    if (found.type === 'post') return null;
    return found;
  });

  protected readonly resolvingDynamicItem = computed(() => {
    const mediaItem = this.item();
    return !!mediaItem && this.sheetData.resolvingIds().has(mediaItem.sNo);
  });

  protected readonly shareUrl = computed(() => {
    const mediaItem = this.item();
    if (!mediaItem) return '';
    return buildVideoShareUrl(mediaItem.hash);
  });

  constructor() {
    const route = inject(ActivatedRoute);
    route.paramMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      this.routeId.set(params.get('id') ?? '');
    });
    this.sheetData.loadData();
    effect(() => {
      const loading = this.loading();
      const item = this.item();
      if (loading || !item) return;
      queueMicrotask(() => this.sheetData.ensureResolved([item]));
    });
  }

  protected async copyLink(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.shareUrl());
      this.toast.show('Link copied');
    } catch {
      this.toast.show('Failed to copy link');
    }
  }

  protected goBack(): void {
    this.router.navigate(['/videos']);
  }

  protected formatStartTime(seconds: number | null): string {
    if (seconds == null || seconds <= 0) return '';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} Hr`);
    if (minutes > 0) parts.push(`${minutes} Min`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} Sec`);
    return parts.join(' ');
  }
}
