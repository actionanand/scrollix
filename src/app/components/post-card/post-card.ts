import { Component, input, computed, ChangeDetectionStrategy, inject } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MediaItem } from '../../models/media-item.model';

@Component({
  selector: 'app-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCardComponent {
  readonly item = input.required<MediaItem>();

  private readonly sanitizer = inject(DomSanitizer);

  protected readonly isFacebookPost = computed(() => this.item().url.includes('facebook.com'));

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    if (mediaItem.url.includes('facebook.com')) {
      const url = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(mediaItem.url)}&show_text=true&width=500`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return null;
  });

  protected openPost(): void {
    window.open(this.item().url, '_blank', 'noopener,noreferrer');
  }
}
