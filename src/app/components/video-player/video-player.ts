import {
  Component,
  input,
  computed,
  signal,
  ChangeDetectionStrategy,
  inject,
  viewChild,
  ElementRef,
  afterNextRender,
  DestroyRef,
  NgZone,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MediaItem } from '../../models/media-item.model';
import { ToastService } from '../../services/toast.service';
import { YoutubeService, YtPlayer } from '../../services/youtube.service';
import { encodeVideoId } from '../../utils/video-id';

interface DocumentPipApi {
  requestWindow(options: { width: number; height: number }): Promise<{ document: Document }>;
}

@Component({
  selector: 'app-video-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
})
export class VideoPlayerComponent {
  readonly item = input.required<MediaItem>();
  readonly vertical = input(false);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  private readonly ytService = inject(YoutubeService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly muted = signal(false);
  protected readonly iframeLoading = signal(true);
  protected readonly pipSupported = 'documentPictureInPicture' in window;

  private readonly iframeRef = viewChild<ElementRef<HTMLIFrameElement>>('playerIframe');
  private ytPlayer: YtPlayer | undefined;

  protected readonly isYoutube = computed(() => {
    const t = this.item().type;
    return t === 'youtube' || t === 'youtube-short';
  });

  protected readonly ytPlayerId = computed(() => `yt-player-${this.item().sNo}`);

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    const url = this.buildEmbedUrl(mediaItem, this.muted());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly originalUrl = computed(() => this.buildOriginalUrl(this.item()));

  constructor() {
    afterNextRender(() => {
      if (!this.isYoutube()) return;
      this.ytService.load().then(() => {
        this.ngZone.runOutsideAngular(() => {
          const item = this.item();
          this.ytPlayer = new window.YT!.Player(this.ytPlayerId(), {
            videoId: item.url,
            playerVars: {
              origin: window.location.origin,
              autoplay: 0,
              mute: this.muted() ? 1 : 0,
              rel: 0,
              playsinline: 1,
              ...(item.startTime ? { start: item.startTime } : {}),
            },
            events: {
              onReady: () => {
                this.ngZone.run(() => this.iframeLoading.set(false));
              },
            },
          });
        });
      });
    });

    this.destroyRef.onDestroy(() => {
      this.ytPlayer?.destroy();
      this.ytPlayer = undefined;
    });
  }

  protected onIframeLoad(): void {
    this.iframeLoading.set(false);
  }

  protected toggleMute(): void {
    const next = !this.muted();
    this.muted.set(next);
    if (this.isYoutube()) {
      if (next) this.ytPlayer?.mute();
      else this.ytPlayer?.unMute();
    } else {
      this.iframeLoading.set(true);
    }
  }

  protected openOriginal(): void {
    window.open(this.originalUrl(), '_blank', 'noopener,noreferrer');
  }

  protected async copyLink(): Promise<void> {
    const id = encodeVideoId(this.item().sNo);
    const url = `${location.origin}/video/${id}`;
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show('📋 Link copied!');
    } catch {
      this.toast.show('Failed to copy link');
    }
  }

  protected requestFullscreen(): void {
    const iframe = this.isYoutube() ? this.ytPlayer?.getIframe() : this.iframeRef()?.nativeElement;
    iframe?.requestFullscreen?.();
  }

  protected async requestPip(): Promise<void> {
    const pipApi = (window as unknown as { documentPictureInPicture?: DocumentPipApi })
      .documentPictureInPicture;
    if (!pipApi) return;
    const srcIframe = this.isYoutube()
      ? this.ytPlayer?.getIframe()
      : this.iframeRef()?.nativeElement;
    if (!srcIframe) return;
    try {
      const pipWindow = await pipApi.requestWindow({ width: 400, height: 225 });
      const pipIframe = pipWindow.document.createElement('iframe');
      pipIframe.src = srcIframe.src;
      pipIframe.style.cssText = 'width:100%;height:100%;border:none';
      pipIframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.appendChild(pipIframe);
    } catch {
      // PIP denied or not supported
    }
  }

  private normalizeFacebookUrl(raw: string): string {
    let url = raw.trim().replace(/#.*$/, ''); // strip fragment
    if (!url.startsWith('http')) {
      url = 'https://www.' + url.replace(/^(www\.)?/, '');
    } else if (/^https?:\/\/(?!www\.)facebook\.com/.test(url)) {
      url = url.replace(/^(https?:\/\/)/, '$1www.');
    }
    try {
      const u = new URL(url);
      url = u.origin + u.pathname; // strip query params
    } catch {
      /* keep as-is */
    }
    return url;
  }

  private buildEmbedUrl(item: MediaItem, muted: boolean): string {
    const muteVal = muted ? 1 : 0;

    switch (item.type) {
      case 'youtube':
      case 'youtube-short':
        // Handled by YT.Player API — this fallback is never shown in the template
        return '';

      case 'instagram':
        return `https://www.instagram.com/p/${item.url}/embed/`;

      case 'facebook':
      case 'facebook-reel':
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/reel/${item.url}`)}&show_text=false&mute=${muteVal}`;

      case 'facebook-share': {
        const clean = this.normalizeFacebookUrl(item.url);
        const reelMatch = clean.match(/facebook\.com\/reel\/(\d+)/);
        const href = reelMatch ? `https://www.facebook.com/reel/${reelMatch[1]}/` : clean;
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&mute=${muteVal}`;
      }

      case 'dailymotion': {
        const p = new URLSearchParams({ autoplay: 'false', 'queue-autoplay-next': 'false' });
        if (muted) p.set('mute', 'true');
        return `https://www.dailymotion.com/embed/video/${item.url}?${p.toString()}`;
      }

      case 'vimeo': {
        const p = new URLSearchParams({ autoplay: '0' });
        if (muted) p.set('muted', '1');
        return `https://player.vimeo.com/video/${item.url}?${p.toString()}`;
      }

      case 'other-video':
      default:
        return item.url;
    }
  }

  private buildOriginalUrl(item: MediaItem): string {
    switch (item.type) {
      case 'youtube':
        return `https://www.youtube.com/watch?v=${item.url}${item.startTime ? `&t=${item.startTime}` : ''}`;
      case 'youtube-short':
        return `https://www.youtube.com/shorts/${item.url}`;
      case 'instagram':
        return `https://www.instagram.com/p/${item.url}/`;
      case 'facebook':
      case 'facebook-reel':
        return `https://www.facebook.com/reel/${item.url}`;
      case 'facebook-share':
        return this.normalizeFacebookUrl(item.url);
      case 'dailymotion':
        return `https://www.dailymotion.com/video/${item.url}`;
      case 'vimeo':
        return `https://vimeo.com/${item.url}`;
      case 'other-video':
      default:
        return item.url;
    }
  }
}
