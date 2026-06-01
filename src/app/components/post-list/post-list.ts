import { Component, inject, computed, signal, ChangeDetectionStrategy } from '@angular/core';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { PostCardComponent } from '../post-card/post-card';

const PAGE_SIZE = 6;

@Component({
  selector: 'app-post-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PostCardComponent],
  templateUrl: './post-list.html',
  styleUrl: './post-list.scss',
})
export class PostListComponent {
  private readonly sheetData = inject(SheetDataService);
  private readonly auth = inject(AuthService);

  protected readonly loading = this.sheetData.loading;
  protected readonly error = this.sheetData.error;
  protected readonly isOffline = this.sheetData.isOffline;

  protected readonly searchQuery = signal('');
  protected readonly currentPage = signal(1);

  private readonly allPosts = computed(() => {
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
    Math.max(1, Math.ceil(this.searchedPosts().length / PAGE_SIZE)),
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
    const start = (this.currentPage() - 1) * PAGE_SIZE;
    return this.searchedPosts().slice(start, start + PAGE_SIZE);
  });

  constructor() {
    this.sheetData.loadData();
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
}
