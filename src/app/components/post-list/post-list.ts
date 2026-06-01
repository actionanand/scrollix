import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { PostCardComponent } from '../post-card/post-card';

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

  protected readonly posts = computed(() => {
    const isLoggedIn = this.auth.isLoggedIn();
    return this.sheetData.items().filter((item) => {
      if (item.type !== 'post') return false;
      if (item.isProtected && !isLoggedIn) return false;
      return true;
    });
  });

  constructor() {
    this.sheetData.loadData();
  }
}
