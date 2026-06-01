import {
  Component,
  input,
  computed,
  signal,
  effect,
  ChangeDetectionStrategy,
  inject,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DomSanitizer } from '@angular/platform-browser';
import { MediaItem, LinkPreview } from '../../models/media-item.model';
import { LinkPreviewService } from '../../services/link-preview.service';

@Component({
  selector: 'app-post-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './post-card.html',
  styleUrl: './post-card.scss',
})
export class PostCardComponent {
  readonly item = input.required<MediaItem>();

  private readonly sanitizer = inject(DomSanitizer);
  private readonly linkPreview = inject(LinkPreviewService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly preview = signal<LinkPreview | null>(null);
  protected readonly previewLoading = signal(false);

  protected readonly isFacebookPost = computed(() => this.item().url.includes('facebook.com'));

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    if (mediaItem.url.includes('facebook.com')) {
      const url = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(mediaItem.url)}&show_text=true&width=500`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }
    return null;
  });

  constructor() {
    effect(() => {
      const item = this.item();
      if (item.type === 'post' && !item.url.includes('facebook.com')) {
        this.previewLoading.set(true);
        this.linkPreview
          .getPreview(item.url)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
            next: (data) => {
              this.preview.set(data);
              this.previewLoading.set(false);
            },
            error: () => this.previewLoading.set(false),
          });
      }
    });
  }

  protected getDomain(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return url;
    }
  }

  protected openPost(): void {
    window.open(this.item().url, '_blank', 'noopener,noreferrer');
  }
}
