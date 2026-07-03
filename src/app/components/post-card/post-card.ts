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
import { PostOpenPreferenceService } from '../../services/post-open-preference.service';
import { OfflinePostService } from '../../services/offline-post.service';

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
  private readonly postOpenPreference = inject(PostOpenPreferenceService);
  protected readonly offlinePosts = inject(OfflinePostService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly preview = signal<LinkPreview | null>(null);
  protected readonly previewLoading = signal(false);
  private readonly previewOpenUrl = computed(() => this.preview()?.url || this.item().url);

  protected readonly postEmbedKind = computed<'facebook' | 'instagram' | null>(() => {
    // On Android every post (including Facebook/Instagram) is rendered through the
    // native OG preview instead of an iframe embed, so processing stays local.
    if (this.postOpenPreference.isAndroidApp()) return null;
    const url = this.item().url;
    if (this.isFacebookPostUrl(url)) return 'facebook';
    if (this.instagramEmbedPath(url)) return 'instagram';
    return null;
  });

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    const kind = this.postEmbedKind();
    if (kind === 'facebook') {
      const url = `https://www.facebook.com/plugins/post.php?href=${encodeURIComponent(mediaItem.url)}&show_text=true&width=500`;
      return this.sanitizer.bypassSecurityTrustResourceUrl(url);
    }

    const instagramPath = this.instagramEmbedPath(mediaItem.url);
    if (kind === 'instagram' && instagramPath) {
      return this.sanitizer.bypassSecurityTrustResourceUrl(
        `https://www.instagram.com/${instagramPath}/embed/`,
      );
    }

    return null;
  });

  constructor() {
    effect(() => {
      const item = this.item();
      if (item.type !== 'post' || this.postEmbedKind()) {
        this.preview.set(null);
        this.previewLoading.set(false);
        return;
      }

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
    if (this.offlinePosts.showOfflineOnly() && this.offlinePosts.openSaved(this.item())) return;
    this.postOpenPreference.openUrl(this.previewOpenUrl(), this.item().title);
  }

  protected toggleOffline(): void {
    const item = this.item();
    if (this.offlinePosts.isSaved(item.url)) {
      this.offlinePosts.remove(item.url);
      return;
    }
    void this.offlinePosts.save(item);
  }

  protected hideBrokenPreviewImage(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement) image.hidden = true;
  }

  private isFacebookPostUrl(rawUrl: string): boolean {
    try {
      const url = new URL(rawUrl);
      if (!/(^|\.)facebook\.com$/i.test(url.hostname)) return false;
      const path = url.pathname.toLowerCase();
      const isGroupPostPath =
        path.includes('/groups/') && (path.includes('/posts/') || path.includes('/permalink/'));
      return (
        path.includes('/share/p/') ||
        path.includes('/posts/') ||
        isGroupPostPath ||
        path.includes('/permalink.php') ||
        path.includes('/story.php') ||
        path.includes('/photo.php')
      );
    } catch {
      return false;
    }
  }

  private instagramEmbedPath(rawUrl: string): string {
    try {
      const url = new URL(rawUrl);
      if (!/(^|\.)instagram\.com$/i.test(url.hostname)) return '';
      const [kind, code] = url.pathname.split('/').filter(Boolean);
      if (!code || (kind !== 'p' && kind !== 'reel')) return '';
      return `${kind}/${code}`;
    } catch {
      return '';
    }
  }
}
