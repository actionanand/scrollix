import {
  Component,
  input,
  computed,
  signal,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  inject,
  viewChild,
  ElementRef,
  afterNextRender,
  DestroyRef,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import {
  buildFacebookVideoUrl,
  buildTikTokEmbedUrl,
  buildTikTokVideoUrl,
  extractFacebookVideoId,
  extractTikTokVideoId,
} from '../../utils/video-id';
import { MediaItem } from '../../models/media-item.model';
import { ToastService } from '../../services/toast.service';
import { YoutubeService, YtPlayer } from '../../services/youtube.service';
import { buildVideoShareUrl } from '../../utils/share-url';

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
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly muted = signal(false);
  protected readonly iframeLoading = signal(true);
  protected readonly dailymotionActivated = signal(false);
  protected readonly appFullscreen = signal(false);
  protected readonly miniPipUrl = signal<string | null>(null);
  private readonly resolvedFacebookVideoUrl = signal<string | null>(null);
  private readonly resolvedTikTokVideoUrl = signal<string | null>(null);
  private ignoreNextPopState = false;

  private readonly iframeRef = viewChild<ElementRef<HTMLIFrameElement>>('playerIframe');
  private ytPlayer: YtPlayer | undefined;

  protected readonly isYoutube = computed(() => {
    const t = this.item().type;
    return t === 'youtube' || t === 'youtube-short';
  });

  protected readonly isDailymotion = computed(() => this.item().type === 'dailymotion');

  protected readonly isDeferredDailymotion = computed(
    () => this.isDailymotion() && !this.dailymotionActivated(),
  );

  protected readonly isVertical = computed(() => {
    const type = this.item().type;
    return (
      this.vertical() ||
      type === 'youtube-short' ||
      type === 'instagram' ||
      type === 'facebook-reel' ||
      type === 'facebook-share' ||
      type === 'tiktok' ||
      type === 'tiktok-share'
    );
  });

  protected readonly formattedStartTime = computed(() =>
    this.formatStartTime(this.item().startTime),
  );

  protected readonly miniPipSafeUrl = computed(() => {
    const url = this.miniPipUrl();
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  });

  private readonly facebookVideoUrl = computed(() => {
    const item = this.item();
    const source = item.type === 'facebook-share' && item.resolvedUrl ? item.resolvedUrl : item.url;
    return this.resolvedFacebookVideoUrl() ?? buildFacebookVideoUrl(source);
  });

  private readonly tiktokVideoUrl = computed(() => {
    const item = this.item();
    const source = item.type === 'tiktok-share' && item.resolvedUrl ? item.resolvedUrl : item.url;
    return this.resolvedTikTokVideoUrl() ?? buildTikTokVideoUrl(source);
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
      void this.resolveFacebookShareRedirect();
      void this.resolveTikTokShareRedirect();
      if (!this.isYoutube()) return;
      this.ytService.load().then(() => {
        const item = this.item();
        this.ytPlayer = new window.YT!.Player(this.ytPlayerId(), {
          videoId: item.url,
          width: '100%',
          height: '100%',
          playerVars: {
            origin: location.origin,
            widget_referrer: location.href,
            enablejsapi: 1,
            autoplay: 0,
            mute: this.muted() ? 1 : 0,
            rel: 0,
            playsinline: 1,
            ...(item.startTime ? { start: item.startTime } : {}),
          },
          events: {
            onReady: (event) => {
              const iframe = event.target.getIframe();
              iframe.referrerPolicy = 'strict-origin-when-cross-origin';
              iframe.allow =
                'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
              this.iframeLoading.set(false);
              this.cdr.markForCheck();
            },
            onError: () => {
              this.iframeLoading.set(false);
              this.cdr.markForCheck();
            },
          },
        });
      });
    });

    this.destroyRef.onDestroy(() => {
      this.ytPlayer?.destroy();
      this.ytPlayer = undefined;
      window.removeEventListener('popstate', this.handlePopState);
    });

    window.addEventListener('popstate', this.handlePopState);
  }

  private readonly handlePopState = (): void => {
    if (this.ignoreNextPopState) {
      this.ignoreNextPopState = false;
      return;
    }
    if (this.appFullscreen()) {
      this.appFullscreen.set(false);
    }
  };

  protected onIframeLoad(): void {
    this.iframeLoading.set(false);
  }

  protected activateDailymotion(): void {
    this.iframeLoading.set(true);
    this.dailymotionActivated.set(true);
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
    const url = buildVideoShareUrl(this.item().hash);
    try {
      await navigator.clipboard.writeText(url);
      this.toast.show('Link copied');
    } catch {
      this.toast.show('Failed to copy link');
    }
  }

  protected requestFullscreen(): void {
    this.enterAppFullscreen();
  }

  protected exitFullscreen(): void {
    if (!this.appFullscreen()) return;
    this.appFullscreen.set(false);
    if (history.state?.scrollixFullscreen === true) {
      this.ignoreNextPopState = true;
      history.back();
    }
  }

  protected async requestPip(): Promise<void> {
    const pipApi = (window as unknown as { documentPictureInPicture?: DocumentPipApi })
      .documentPictureInPicture;
    const vertical = this.isVertical();
    const size = {
      width: vertical ? 360 : 400,
      height: vertical ? 640 : 225,
    };

    const srcIframe = this.isYoutube()
      ? this.ytPlayer?.getIframe()
      : this.iframeRef()?.nativeElement;
    const src = this.isYoutube()
      ? this.buildYoutubePipUrl(this.item(), this.youtubePipStart())
      : srcIframe?.src;
    if (!src) return;

    if (this.isYoutube()) {
      const androidStarted = await this.requestAndroidPip(size.width, size.height);
      if (!androidStarted) this.openMiniPip(src);
      return;
    }

    if (pipApi) {
      try {
        const pipWindow = await pipApi.requestWindow(size);
        const referrerMeta = pipWindow.document.createElement('meta');
        referrerMeta.name = 'referrer';
        referrerMeta.content = 'strict-origin-when-cross-origin';
        pipWindow.document.head.appendChild(referrerMeta);
        const pipIframe = pipWindow.document.createElement('iframe');
        pipIframe.style.cssText = 'display:block;width:100%;height:100%;border:0;margin:0';
        pipIframe.allow =
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        pipIframe.allowFullscreen = true;
        pipIframe.referrerPolicy = 'strict-origin-when-cross-origin';
        pipIframe.src = src;
        pipWindow.document.documentElement.style.cssText =
          'width:100%;height:100%;margin:0;background:#000';
        pipWindow.document.body.style.cssText =
          'width:100%;height:100%;margin:0;padding:0;background:#000;overflow:hidden;display:flex;align-items:center;justify-content:center';
        pipWindow.document.body.appendChild(pipIframe);
        this.miniPipUrl.set(null);
        return;
      } catch {
        // Fall through to Android native PIP or the web mini-player.
      }
    }

    const androidStarted = await this.requestAndroidPip(size.width, size.height);
    if (!androidStarted) this.openMiniPip(src);
  }

  protected closeMiniPip(): void {
    this.miniPipUrl.set(null);
  }

  private openMiniPip(src: string): void {
    this.miniPipUrl.set(src);
    this.toast.show('Mini player opened');
  }

  private async requestAndroidPip(width: number, height: number): Promise<boolean> {
    const plugin = this.androidPipPlugin();
    if (!plugin) {
      return false;
    }

    try {
      const result = await plugin.isSupported();
      if (!result.supported) {
        return false;
      }
      this.enterAppFullscreen();
      await plugin.enter({ width, height });
      return true;
    } catch {
      return false;
    }
  }

  private androidPipPlugin(): ScrollixPipPlugin | undefined {
    return window.Capacitor?.Plugins?.ScrollixPip;
  }

  private enterAppFullscreen(): void {
    if (this.appFullscreen()) return;
    this.appFullscreen.set(true);
    history.pushState({ scrollixFullscreen: true }, '', location.href);
  }

  private async resolveFacebookShareRedirect(): Promise<void> {
    const item = this.item();
    if (item.type !== 'facebook-share' || item.resolvedUrl || extractFacebookVideoId(item.url)) {
      return;
    }

    try {
      const response = await fetch(item.url, {
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

  private async resolveTikTokShareRedirect(): Promise<void> {
    const item = this.item();
    if (item.type !== 'tiktok-share' || item.resolvedUrl || extractTikTokVideoId(item.url)) {
      return;
    }

    try {
      const response = await fetch(item.url, {
        redirect: 'follow',
        mode: 'no-cors',
        credentials: 'omit',
      });
      const id = extractTikTokVideoId(response.url);
      if (id) {
        this.resolvedTikTokVideoUrl.set(buildTikTokVideoUrl(response.url));
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
        // Handled by YT.Player API; this fallback is never shown in the template.
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

      case 'tiktok':
      case 'tiktok-share':
        return buildTikTokEmbedUrl(item.type === 'tiktok-share' ? this.tiktokVideoUrl() : item.url);

      case 'dailymotion': {
        const p = new URLSearchParams({
          autoplay: '0',
          autostart: 'off',
          mute: muted ? '1' : '0',
          'endscreen-enable': 'false',
          'queue-autoplay-next': 'false',
          'queue-enable': 'false',
          'sharing-enable': 'false',
          'ui-start-screen-info': 'false',
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
      case 'tiktok':
        return buildTikTokVideoUrl(item.url);
      case 'tiktok-share':
        return this.tiktokVideoUrl();
      case 'dailymotion':
        return `https://www.dailymotion.com/video/${item.url}`;
      case 'vimeo':
        return `https://vimeo.com/${item.url}`;
      case 'other-video':
      default:
        return item.url;
    }
  }

  private buildYoutubePipUrl(item: MediaItem, startOverride: number | null = null): string {
    const params = new URLSearchParams({
      autoplay: '1',
      enablejsapi: '1',
      origin: window.location.origin,
      playsinline: '1',
      rel: '0',
      widget_referrer: location.href,
    });
    const start = startOverride ?? item.startTime;
    if (start) params.set('start', String(start));
    return `https://www.youtube.com/embed/${item.url}?${params.toString()}`;
  }

  private youtubePipStart(): number | null {
    const currentTime = this.ytPlayer?.getCurrentTime?.();
    if (currentTime == null || !Number.isFinite(currentTime) || currentTime <= 0) return null;
    return Math.floor(currentTime);
  }

  private formatStartTime(seconds: number | null): string {
    if (seconds == null || seconds <= 0) return '';
    const totalSeconds = Math.floor(seconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const remainingSeconds = totalSeconds % 60;
    const parts: string[] = [];
    if (hours > 0) parts.push(`${hours} Hr`);
    if (minutes > 0) parts.push(`${minutes} Min`);
    if (remainingSeconds > 0 || parts.length === 0) parts.push(`${remainingSeconds} Sec`);
    return parts.join(' ');
  }
}
