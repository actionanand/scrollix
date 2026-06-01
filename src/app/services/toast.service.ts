import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _message = signal('');
  private readonly _visible = signal(false);
  private timerId: ReturnType<typeof setTimeout> | null = null;

  readonly message = this._message.asReadonly();
  readonly visible = this._visible.asReadonly();

  show(message: string, duration = 3000): void {
    if (this.timerId) clearTimeout(this.timerId);
    this._message.set(message);
    this._visible.set(true);
    this.timerId = setTimeout(() => {
      this._visible.set(false);
      this.timerId = null;
    }, duration);
  }
}
