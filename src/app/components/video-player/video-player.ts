import {
  Component,
  input,
  computed,
  signal,
  ChangeDetectionStrategy,
  inject,
  viewChild,
  ElementRef,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import { MediaItem } from '../../models/media-item.model';

@Component({
  selector: 'app-video-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './video-player.html',
  styleUrl: './video-player.scss',
})
export class VideoPlayerComponent {
  readonly item = input.required<MediaItem>();

  private readonly sanitizer = inject(DomSanitizer);
  protected readonly muted = signal(false);
  protected readonly pipSupported = 'documentPictureInPicture' in window;

  private readonly iframeRef = viewChild<ElementRef<HTMLIFrameElement>>('playerIframe');

  protected readonly embedUrl = computed(() => {
    const mediaItem = this.item();
    const url = this.buildEmbedUrl(mediaItem, this.muted());
    return this.sanitizer.bypassSecurityTrustResourceUrl(url);
  });

  protected readonly originalUrl = computed(() => this.buildOriginalUrl(this.item()));

  protected toggleMute(): void {
    this.muted.update((v) => !v);
  }

  protected openOriginal(): void {
    window.open(this.originalUrl(), '_blank', 'noopener,noreferrer');
  }

  protected requestFullscreen(): void {
    const iframe = this.iframeRef()?.nativeElement;
    iframe?.requestFullscreen?.();
  }

  protected async requestPip(): Promise<void> {
    if (!('documentPictureInPicture' in window)) return;
    try {
      const iframe = this.iframeRef()?.nativeElement;
      if (!iframe) return;
      const pipWindow = await (window as any).documentPictureInPicture.requestWindow({
        width: 400,
        height: 225,
      });
      const pipIframe = pipWindow.document.createElement('iframe');
      pipIframe.src = iframe.src;
      pipIframe.style.cssText = 'width:100%;height:100%;border:none';
      pipIframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      pipWindow.document.body.style.margin = '0';
      pipWindow.document.body.appendChild(pipIframe);
    } catch {
      // PIP denied or not supported
    }
  }

  private buildEmbedUrl(item: MediaItem, muted: boolean): string {
    const params = new URLSearchParams();

    switch (item.type) {
      case 'youtube':
      case 'youtube-short': {
        if (item.startTime) params.set('start', String(item.startTime));
        if (muted) params.set('mute', '1');
        const qs = params.toString();
        return `https://www.youtube.com/embed/${item.url}${qs ? '?' + qs : ''}`;
      }
      case 'instagram':
        return `https://www.instagram.com/p/${item.url}/embed/`;
      case 'facebook-reel':
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/reel/${item.url}`)}&show_text=false&mute=${muted}`;
      case 'facebook':
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(`https://www.facebook.com/share/v/${item.url}/`)}&show_text=false&mute=${muted}`;
      case 'dailymotion': {
        if (muted) params.set('mute', 'true');
        const qs = params.toString();
        return `https://www.dailymotion.com/embed/video/${item.url}${qs ? '?' + qs : ''}`;
      }
      case 'vimeo': {
        if (muted) params.set('muted', '1');
        const qs = params.toString();
        return `https://player.vimeo.com/video/${item.url}${qs ? '?' + qs : ''}`;
      }
      case 'other-video':
        return item.url;
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
      case 'facebook-reel':
        return `https://www.facebook.com/reel/${item.url}`;
      case 'facebook':
        return `https://www.facebook.com/share/v/${item.url}/`;
      case 'dailymotion':
        return `https://www.dailymotion.com/video/${item.url}`;
      case 'vimeo':
        return `https://vimeo.com/${item.url}`;
      case 'other-video':
        return item.url;
      default:
        return item.url;
    }
  }
}
