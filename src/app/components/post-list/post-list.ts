import {
  Component,
  inject,
  computed,
  signal,
  ChangeDetectionStrategy,
  afterNextRender,
  DestroyRef,
  ElementRef,
} from '@angular/core';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { PostOpenPreferenceService } from '../../services/post-open-preference.service';
import { OfflinePostService } from '../../services/offline-post.service';
import { PostCardComponent } from '../post-card/post-card';
import { environment } from '../../../environments/environment';
import {
  AndroidPullToRefresh,
  attachAndroidPullToRefresh,
} from '../../utils/android-pull-to-refresh';

@Component({
  selector: 'app-post-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostCardComponent],
  templateUrl: './post-list.html',
  styleUrl: './post-list.scss',
})
export class PostListComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly sheetData = inject(SheetDataService);
  private readonly auth = inject(AuthService);
  private readonly pageSize = environment.SCROLLIX_CONFIG.postsPerPage;
  protected readonly postOpenPreference = inject(PostOpenPreferenceService);
  protected readonly offlinePosts = inject(OfflinePostService);

  protected readonly loading = this.sheetData.loading;
  protected readonly error = this.sheetData.error;
  protected readonly isOffline = this.sheetData.isOffline;

  protected readonly searchQuery = signal('');
  protected readonly currentPage = signal(1);
  protected readonly pullToRefresh = new AndroidPullToRefresh(
    () => this.onRefresh(),
    () => this.loading(),
  );

  private readonly allPosts = computed(() => {
    if (this.offlinePosts.showOfflineOnly()) return this.offlinePosts.savedMediaItems();

    const isLoggedIn = this.auth.isLoggedIn();
    return this.sheetData.items().filter((item) => {
      if (item.type !== 'post') return false;
      if (item.isProtected && !isLoggedIn) return false;
      return true;
    });
  });

  protected readonly searchedPosts = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const posts = this.allPosts();
    if (!q) return posts;
    return posts.filter(
      (p) => p.title.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q),
    );
  });

  protected readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.searchedPosts().length / this.pageSize)),
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

  protected readonly paginatedPosts = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize;
    return this.searchedPosts().slice(start, start + this.pageSize);
  });

  constructor() {
    this.sheetData.loadData();
    afterNextRender(() => {
      attachAndroidPullToRefresh(this.host.nativeElement, this.pullToRefresh, this.destroyRef);
    });
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

  protected onPostOpenModeChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.postOpenPreference.setOpenInApp(checked);
  }

  protected onOfflineOnlyChange(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.offlinePosts.setShowOfflineOnly(checked);
    this.currentPage.set(1);
  }
}
