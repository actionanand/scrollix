import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { VideoPlayerComponent } from '../video-player/video-player';
import { MediaItem, MediaType } from '../../models/media-item.model';
import { encodeVideoId } from '../../utils/video-id';
import { environment } from '../../../environments/environment';

const TYPE_LABELS: Record<string, string> = {
  all: 'All Types',
  youtube: 'YouTube',
  'youtube-short': 'YouTube Shorts',
  instagram: 'Instagram',
  facebook: 'Facebook',
  'facebook-reel': 'Facebook Reel',
  'facebook-share': 'Facebook Share',
  dailymotion: 'Dailymotion',
  vimeo: 'Vimeo',
  'other-video': 'Other',
};

@Component({
  selector: 'app-video-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VideoPlayerComponent, RouterLink],
  templateUrl: './video-list.html',
  styleUrl: './video-list.scss',
  host: {
    '(touchstart)': 'onTouchStart($event)',
    '(touchmove)': 'onTouchMove($event)',
    '(touchend)': 'onTouchEnd()',
  },
})
export class VideoListComponent {
  private readonly sheetData = inject(SheetDataService);
  private readonly auth = inject(AuthService);
  private readonly pageSize = environment.SCROLLIX_CONFIG.videosPerPage;

  protected readonly loading = this.sheetData.loading;
  protected readonly error = this.sheetData.error;
  protected readonly isOffline = this.sheetData.isOffline;

  protected readonly selectedType = signal<MediaType | 'all'>('all');
  protected readonly searchQuery = signal('');
  protected readonly currentPage = signal(1);
  protected readonly pullDistance = signal(0);
  protected readonly typeLabels = TYPE_LABELS;

  private touchStartY = 0;

  private readonly allVideos = computed(() => {
    const isLoggedIn = this.auth.isLoggedIn();
    return this.sheetData.items().filter((item) => {
      if (item.type === 'post') return false;
      if (item.isProtected && !isLoggedIn) return false;
      return true;
    });
  });

  protected readonly availableTypes = computed(() => {
    const types = new Set(this.allVideos().map((v) => v.type));
    return ['all', ...Array.from(types)] as (MediaType | 'all')[];
  });

  private readonly typeFiltered = computed(() => {
    const type = this.selectedType();
    return type === 'all' ? this.allVideos() : this.allVideos().filter((v) => v.type === type);
  });

  protected readonly searchedVideos = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const vids = this.typeFiltered();
    if (!q) return vids;
    return vids.filter(
      (v) => v.title.toLowerCase().includes(q) || v.desc.toLowerCase().includes(q),
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.searchedVideos().length / this.pageSize)),
  );

  protected readonly pageNumbers = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: number[] = [];
    if (total <= 5) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      if (start > 2) pages.push(-1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < total - 1) pages.push(-1);
      pages.push(total);
    }
    return pages;
  });

  protected readonly paginatedVideos = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.searchedVideos().slice(start, start + this.pageSize);
  });

  protected readonly isTallGrid = computed(() => {
    const type = this.selectedType();
    return (
      type === 'instagram' ||
      type === 'youtube-short' ||
      type === 'facebook-reel' ||
      type === 'facebook-share'
    );
  });

  constructor() {
    this.sheetData.loadData();
  }

  protected encodeId(video: MediaItem): string {
    return encodeVideoId(this.shareSource(video));
  }

  protected isVerticalVideo(video: MediaItem): boolean {
    return (
      video.type === 'instagram' ||
      video.type === 'youtube-short' ||
      video.type === 'facebook-reel' ||
      video.type === 'facebook-share'
    );
  }

  private shareSource(video: MediaItem): string {
    return video.type === 'facebook-share' && video.resolvedUrl ? video.resolvedUrl : video.url;
  }

  protected onFilterChange(event: Event): void {
    this.selectedType.set((event.target as HTMLSelectElement).value as MediaType | 'all');
    this.currentPage.set(1);
  }

  protected onSearchInput(event: Event): void {
    this.searchQuery.set((event.target as HTMLInputElement).value);
    this.currentPage.set(1);
  }

  protected goToPage(page: number): void {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  protected onRefresh(): void {
    this.sheetData.loadData(true);
    this.currentPage.set(1);
  }

  protected onTouchStart(e: TouchEvent): void {
    if (window.scrollY === 0) {
      this.touchStartY = e.touches[0].clientY;
    }
  }

  protected onTouchMove(e: TouchEvent): void {
    if (this.touchStartY > 0 && window.scrollY === 0) {
      const diff = e.touches[0].clientY - this.touchStartY;
      if (diff > 0) this.pullDistance.set(Math.min(diff * 0.4, 80));
    }
  }

  protected onTouchEnd(): void {
    if (this.pullDistance() > 50) this.onRefresh();
    this.pullDistance.set(0);
    this.touchStartY = 0;
  }
}
