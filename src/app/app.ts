import {
  Component,
  signal,
  ChangeDetectionStrategy,
  inject,
  afterNextRender,
  DestroyRef,
} from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { HeaderComponent } from './components/header/header';
import { ToastComponent } from './components/toast/toast';
import { InstallBannerComponent } from './components/install-banner/install-banner';
import { AuthService } from './services/auth.service';

const APP_LINK_HOST = 'actionanand.github.io';
const APP_LINK_BASE_PATH = '/scrollix';
const APP_LINK_VIDEO_PREFIX = `${APP_LINK_BASE_PATH}/video/`;
const CUSTOM_LINK_SCHEME = 'scrollix:';
const CUSTOM_LINK_VIDEO_HOST = 'video';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    HeaderComponent,
    ToastComponent,
    InstallBannerComponent,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('Scrollix');
  protected readonly auth = inject(AuthService);

  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      void this.consumePendingAppLink();

      const handleFocus = (): void => {
        void this.consumePendingAppLink();
      };
      const handleVisibility = (): void => {
        if (document.visibilityState === 'visible') void this.consumePendingAppLink();
      };

      window.addEventListener('focus', handleFocus);
      document.addEventListener('visibilitychange', handleVisibility);
      this.destroyRef.onDestroy(() => {
        window.removeEventListener('focus', handleFocus);
        document.removeEventListener('visibilitychange', handleVisibility);
      });
    });
  }

  private async consumePendingAppLink(): Promise<void> {
    if (!this.isAndroidApp()) return;
    const plugin = window.Capacitor?.Plugins?.ScrollixBrowser;
    if (!plugin?.consumeAppLink) return;

    try {
      const result = await plugin.consumeAppLink();
      const route = this.routeFromAppLink(result.url);
      if (route) await this.router.navigateByUrl(route);
    } catch {
      // App links should never block normal app startup.
    }
  }

  private routeFromAppLink(rawUrl: string): string | null {
    if (!rawUrl) return null;
    try {
      const url = new URL(rawUrl);
      if (url.protocol === CUSTOM_LINK_SCHEME && url.hostname === CUSTOM_LINK_VIDEO_HOST) {
        const hash = url.pathname.replace(/^\/+/, '');
        return hash ? `/video/${hash}${url.search}${url.hash}` : null;
      }
      if (url.hostname !== APP_LINK_HOST) return null;
      if (!url.pathname.startsWith(APP_LINK_VIDEO_PREFIX)) return null;
      return url.pathname.slice(APP_LINK_BASE_PATH.length) + url.search + url.hash;
    } catch {
      return null;
    }
  }

  private isAndroidApp(): boolean {
    const capacitor = window.Capacitor;
    return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === 'android';
  }
}
