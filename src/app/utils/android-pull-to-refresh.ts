import { DestroyRef, signal } from '@angular/core';

const PULL_REFRESH_THRESHOLD = 64;
const PULL_REFRESH_MAX_DISTANCE = 96;

export class AndroidPullToRefresh {
  readonly distance = signal(0);
  readonly threshold = PULL_REFRESH_THRESHOLD;
  readonly enabled = isAndroidApp();

  private startY: number | null = null;
  private startedAtTop = false;

  constructor(
    private readonly refresh: () => void,
    private readonly loading: () => boolean,
  ) {}

  start(event: TouchEvent): void {
    if (!this.enabled || this.loading() || getScrollTop() > 1 || isFormControl(event.target)) {
      this.reset();
      return;
    }

    this.startY = event.touches[0]?.clientY ?? null;
    this.startedAtTop = this.startY != null;
    this.distance.set(0);
  }

  move(event: TouchEvent): void {
    if (!this.enabled || this.loading() || !this.startedAtTop || this.startY == null) return;
    if (getScrollTop() > 1) {
      this.reset();
      return;
    }

    const currentY = event.touches[0]?.clientY;
    if (currentY == null) return;

    const pullDistance = currentY - this.startY;
    if (pullDistance <= 0) {
      this.distance.set(0);
      return;
    }

    this.distance.set(Math.min(pullDistance * 0.45, PULL_REFRESH_MAX_DISTANCE));
  }

  end(): void {
    const shouldRefresh = this.enabled && !this.loading() && this.distance() >= this.threshold;
    this.reset();
    if (shouldRefresh) this.refresh();
  }

  cancel(): void {
    this.reset();
  }

  private reset(): void {
    this.startY = null;
    this.startedAtTop = false;
    this.distance.set(0);
  }
}

export function attachAndroidPullToRefresh(
  element: HTMLElement,
  controller: AndroidPullToRefresh,
  destroyRef: DestroyRef,
): void {
  if (!controller.enabled) return;

  const options: AddEventListenerOptions = { passive: true };
  const onStart = (event: TouchEvent): void => controller.start(event);
  const onMove = (event: TouchEvent): void => controller.move(event);
  const onEnd = (): void => controller.end();
  const onCancel = (): void => controller.cancel();

  element.addEventListener('touchstart', onStart, options);
  element.addEventListener('touchmove', onMove, options);
  element.addEventListener('touchend', onEnd, options);
  element.addEventListener('touchcancel', onCancel, options);

  destroyRef.onDestroy(() => {
    element.removeEventListener('touchstart', onStart);
    element.removeEventListener('touchmove', onMove);
    element.removeEventListener('touchend', onEnd);
    element.removeEventListener('touchcancel', onCancel);
  });
}

function isAndroidApp(): boolean {
  const capacitor = window.Capacitor;
  return capacitor?.isNativePlatform?.() === true && capacitor.getPlatform?.() === 'android';
}

function getScrollTop(): number {
  return document.scrollingElement?.scrollTop ?? document.documentElement.scrollTop;
}

function isFormControl(target: EventTarget | null): boolean {
  return target instanceof Element && !!target.closest('input, select, textarea');
}
