import { NgOptimizedImage } from '@angular/common';
import { ChangeDetectionStrategy, Component, afterNextRender, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { AppLockService } from '../../services/app-lock.service';
import { SecuritySettingsService } from '../../services/security-settings.service';
import { SecurityService } from '../../services/security.service';

@Component({
  selector: 'app-lock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgOptimizedImage, ReactiveFormsModule],
  templateUrl: './app-lock.html',
  styleUrl: './app-lock.scss',
})
export class AppLockComponent {
  protected readonly lock = inject(AppLockService);
  protected readonly settings = inject(SecuritySettingsService);
  protected readonly security = inject(SecurityService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly error = signal('');
  protected readonly verifying = signal(false);
  protected readonly unlockForm = this.formBuilder.nonNullable.group({
    pin: ['', [Validators.required, Validators.pattern(/^\d{4,8}$/)]],
  });

  constructor() {
    afterNextRender(() => {
      if (
        this.lock.locked() &&
        this.settings.settings().biometricEnabled &&
        this.security.biometricAvailable
      ) {
        this.security.requestBiometric();
      }
    });
  }

  protected async unlockWithPin(): Promise<void> {
    if (this.unlockForm.invalid) {
      this.error.set('Enter your 4 to 8 digit PIN.');
      return;
    }

    this.verifying.set(true);
    try {
      const valid = await this.security.verifyPin(
        this.unlockForm.controls.pin.value,
        this.settings.settings(),
      );
      if (!valid) {
        this.error.set('Wrong PIN. Try again.');
        this.unlockForm.reset({ pin: '' });
        return;
      }

      this.unlockForm.reset({ pin: '' });
      this.error.set('');
      this.lock.unlock();
    } catch {
      this.error.set('PIN verification failed. Please try again.');
    } finally {
      this.verifying.set(false);
    }
  }
}
