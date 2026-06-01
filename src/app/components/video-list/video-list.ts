import { Component, inject, computed, ChangeDetectionStrategy } from '@angular/core';
import { SheetDataService } from '../../services/sheet-data.service';
import { AuthService } from '../../services/auth.service';
import { VideoPlayerComponent } from '../video-player/video-player';

@Component({
  selector: 'app-video-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [VideoPlayerComponent],
  templateUrl: './video-list.html',
  styleUrl: './video-list.scss',
})
export class VideoListComponent {
  private readonly sheetData = inject(SheetDataService);
  private readonly auth = inject(AuthService);

  protected readonly loading = this.sheetData.loading;
  protected readonly error = this.sheetData.error;

  protected readonly videos = computed(() => {
    const isLoggedIn = this.auth.isLoggedIn();
    return this.sheetData.items().filter((item) => {
      if (item.type === 'post') return false;
      if (item.isProtected && !isLoggedIn) return false;
      return true;
    });
  });

  constructor() {
    this.sheetData.loadData();
  }
}
