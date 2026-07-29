import { Injectable, inject, signal } from '@angular/core';

import { SecuritySettingsService } from './security-settings.service';

@Injectable({ providedIn: 'root' })
export class AppLockService {
  private readonly securitySettings = inject(SecuritySettingsService);
  private readonly state = signal(this.securitySettings.settings().pinEnabled);

  readonly locked = this.state.asReadonly();

  lockNow(): void {
    if (this.securitySettings.settings().pinEnabled) this.state.set(true);
  }

  unlock(): void {
    this.state.set(false);
  }

  handleVisibilityChange(): void {
    if (document.visibilityState === 'hidden') this.lockNow();
  }
}
