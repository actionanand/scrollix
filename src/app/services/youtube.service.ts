import { Injectable } from '@angular/core';

export interface YtPlayer {
  mute(): void;
  unMute(): void;
  destroy(): void;
  getIframe(): HTMLIFrameElement;
  getCurrentTime?(): number;
}

export interface YtPlayerConfig {
  videoId: string;
  width?: number | string;
  height?: number | string;
  playerVars?: {
    autoplay?: 0 | 1;
    enablejsapi?: 0 | 1;
    mute?: 0 | 1;
    start?: number;
    origin?: string;
    rel?: 0 | 1;
    playsinline?: 0 | 1;
    widget_referrer?: string;
  };
  events?: {
    onReady?: (e: { target: YtPlayer }) => void;
    onError?: (e: { data: number }) => void;
  };
}

declare global {
  interface Window {
    YT?: {
      Player: new (idOrEl: string | HTMLElement, config: YtPlayerConfig) => YtPlayer;
      loaded?: number;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

@Injectable({ providedIn: 'root' })
export class YoutubeService {
  private ready$: Promise<void> | null = null;

  load(): Promise<void> {
    if (this.ready$) return this.ready$;
    if (window.YT?.loaded) return (this.ready$ = Promise.resolve());

    this.ready$ = new Promise<void>((resolve) => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      const script = document.createElement('script');
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    });

    return this.ready$;
  }
}
