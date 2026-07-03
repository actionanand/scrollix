import {
  Component,
  ChangeDetectionStrategy,
  signal,
  afterNextRender,
  inject,
  DestroyRef,
} from '@angular/core';
import { environment } from '../../../environments/environment';

const DISMISS_KEY = 'scrollix.installBannerDismissed';
const AUTO_HIDE_MS = 15000;

function buildAppDeepLink(base: string, path: string): string {
  const trimmed = (base ?? '').trim();
  if (trimmed.endsWith('://') || trimmed.endsWith('/')) return `${trimmed}${path}`;
  return `${trimmed}/${path}`;
}

// Derived from the single source of truth in the environment file.
const APP_DEEP_LINK = buildAppDeepLink(environment.ANDROID_PUBLIC_BASE_URL, 'home');

@Component({
  selector: 'app-install-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (visible()) {
      <div class="install-banner" role="region" aria-label="Open in the Scrollix Android app">
        <div class="install-banner__text">
          <strong>Open in the Scrollix app</strong>
          <span>Get a faster, full-screen experience on Android.</span>
        </div>
        <div class="install-banner__actions">
          <button type="button" class="install-banner__open" (click)="openApp()">Open</button>
          <button
            type="button"
            class="install-banner__close"
            (click)="dismiss()"
            aria-label="Dismiss app suggestion"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
      </div>
    }
  `,
  styles: `
    .install-banner {
      position: fixed;
      bottom: calc(1rem + env(safe-area-inset-bottom));
      left: 50%;
      transform: translateX(-50%);
      width: min(30rem, calc(100vw - 1.5rem));
      display: flex;
      align-items: center;
      gap: 0.75rem;
      background: #172033;
      color: #fff;
      padding: 0.75rem 0.9rem;
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 16px;
      z-index: 2500;
      box-shadow: 0 16px 40px rgba(10, 18, 32, 0.32);
      animation: bannerIn 0.3s ease;
    }
    .install-banner__text {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
      flex: 1;
      min-width: 0;
    }
    .install-banner__text strong {
      font-size: 0.95rem;
      font-weight: 700;
    }
    .install-banner__text span {
      font-size: 0.8rem;
      color: rgba(255, 255, 255, 0.82);
    }
    .install-banner__actions {
      display: flex;
      align-items: center;
      gap: 0.4rem;
    }
    .install-banner__open {
      background: #2847c7;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 0.55rem 1.1rem;
      font-size: 0.9rem;
      font-weight: 700;
      cursor: pointer;
      min-height: 44px;
    }
    .install-banner__open:hover {
      background: #1f3aa8;
    }
    .install-banner__close {
      background: transparent;
      color: rgba(255, 255, 255, 0.85);
      border: 1px solid rgba(255, 255, 255, 0.28);
      border-radius: 10px;
      width: 44px;
      height: 44px;
      font-size: 1rem;
      line-height: 1;
      cursor: pointer;
    }
    .install-banner__open:focus-visible,
    .install-banner__close:focus-visible {
      outline: 3px solid #9db2ff;
      outline-offset: 2px;
    }
    @keyframes bannerIn {
      from {
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
      }
      to {
        transform: translateX(-50%) translateY(0);
        opacity: 1;
      }
    }
  `,
})
export class InstallBannerComponent {
  protected readonly visible = signal(false);
  private readonly destroyRef = inject(DestroyRef);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    afterNextRender(() => {
      if (!this.shouldShow()) return;
      this.visible.set(true);
      this.timerId = setTimeout(() => this.hide(), AUTO_HIDE_MS);
      this.destroyRef.onDestroy(() => this.clearTimer());
    });
  }

  protected openApp(): void {
    this.dismiss();
    window.location.href = APP_DEEP_LINK;
  }

  protected dismiss(): void {
    this.hide();
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Session storage can be unavailable in restricted browser contexts.
    }
  }

  private hide(): void {
    this.visible.set(false);
    this.clearTimer();
  }

  private clearTimer(): void {
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
  }

  private shouldShow(): boolean {
    const capacitor = window.Capacitor;
    if (capacitor?.isNativePlatform?.() === true) return false;
    if (!/android/i.test(navigator.userAgent || '')) return false;
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === '1') return false;
    } catch {
      // Treat storage failures as "not dismissed".
    }
    return true;
  }
}
