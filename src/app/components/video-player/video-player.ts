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
import { buildFacebookVideoUrl, encodeVideoId, extractFacebookVideoId } from '../../utils/video-id';
import { MediaItem } from '../../models/media-item.model';
import { ToastService } from '../../services/toast.service';
import { YoutubeService, YtPlayer } from '../../services/youtube.service';

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
  readonly showMetadata = input(true);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly toast = inject(ToastService);
  private readonly ytService = inject(YoutubeService);
  private readonly ngZone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly muted = signal(false);
  protected readonly iframeLoading = signal(true);
  protected readonly pipSupported = 'documentPictureInPicture' in window;
  private readonly resolvedFacebookVideoUrl = signal<string | null>(null);

  private readonly iframeRef = viewChild<ElementRef<HTMLIFrameElement>>('playerIframe');
  private ytPlayer: YtPlayer | undefined;

  protected readonly isYoutube = computed(() => {
    const t = this.item().type;
    return t === 'youtube' || t === 'youtube-short';
  });

  protected readonly isVertical = computed(() => {
    const type = this.item().type;
    return (
      this.vertical() ||
      type === 'youtube-short' ||
      type === 'instagram' ||
      type === 'facebook-reel' ||
      type === 'facebook-share'
    );
  });

  protected readonly canUsePip = computed(() => this.pipSupported && !this.isYoutube());

  private readonly facebookVideoUrl = computed(
    () => this.resolvedFacebookVideoUrl() ?? buildFacebookVideoUrl(this.item().url),
  );

  protected readonly ytPlayerId = computed(() => `yt-player-${this.item().sNo}`);

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    const url = this.buildEmbedUrl(mediaItem, this.muted());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly originalUrl = computed(() => this.buildOriginalUrl(this.item()));

  constructor() {
    afterNextRender(() => {
      void this.resolveFacebookShareRedirect();
      if (!this.isYoutube()) return;
      this.ytService.load().then(() => {
        this.ngZone.runOutsideAngular(() => {
          const item = this.item();
          this.ytPlayer = new window.YT!.Player(this.ytPlayerId(), {
            videoId: item.url,
            width: '100%',
            height: '100%',
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
    const id = encodeVideoId(this.item().url);
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
      const vertical = this.isVertical();
      const pipWindow = await pipApi.requestWindow({
        width: vertical ? 360 : 400,
        height: vertical ? 640 : 225,
      });
      const pipIframe = pipWindow.document.createElement('iframe');
      pipIframe.src = srcIframe.src;
      pipIframe.style.cssText = 'display:block;width:100%;height:100%;border:0;margin:0';
      pipIframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      pipIframe.allowFullscreen = true;
      pipWindow.document.documentElement.style.cssText =
        'width:100%;height:100%;margin:0;background:#000';
      pipWindow.document.body.style.cssText =
        'width:100%;height:100%;margin:0;padding:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center';
      pipWindow.document.body.appendChild(pipIframe);
    } catch {
      // PIP denied or not supported
    }
  }

  private async resolveFacebookShareRedirect(): Promise<void> {
    const item = this.item();
    if (item.type !== 'facebook-share' || extractFacebookVideoId(item.url)) return;

    try {
      const response = await fetch(this.facebookVideoUrl(), {
        redirect: 'follow',
        mode: 'no-cors',
        credentials: 'omit',
      });
      const id = extractFacebookVideoId(response.url);
      if (id) {
        this.resolvedFacebookVideoUrl.set(buildFacebookVideoUrl(id));
      }
    } catch {
      // Some browsers do not expose cross-origin redirect targets for share links.
    }
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
        const href = this.facebookVideoUrl();
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&mute=${muteVal}`;
      }

      case 'dailymotion': {
        const p = new URLSearchParams({
          autoplay: '0',
          mute: muted ? '1' : '0',
          'queue-autoplay-next': '0',
        });
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
        return this.facebookVideoUrl();
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
