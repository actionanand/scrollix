import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { AppLockService } from '../../services/app-lock.service';
import { SecuritySettingsService } from '../../services/security-settings.service';
import { SecurityService } from '../../services/security.service';

@Component({
  selector: 'app-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink],
  host: {
    '(window:biometric-enabled)': 'onBiometricEnabled()',
  },
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class SettingsComponent {
  protected readonly settings = inject(SecuritySettingsService);
  protected readonly security = inject(SecurityService);
  protected readonly lock = inject(AppLockService);
  private readonly formBuilder = inject(FormBuilder);

  protected readonly pinDialogOpen = signal(false);
  protected readonly confirmRemove = signal(false);
  protected readonly formError = signal('');
  protected readonly savingPin = signal(false);
  protected readonly message = signal('');
  protected readonly pinForm = this.formBuilder.nonNullable.group({
    pin: ['', [Validators.required, Validators.pattern(/^\d{4,8}$/)]],
    confirmation: ['', [Validators.required, Validators.pattern(/^\d{4,8}$/)]],
  });
  protected readonly biometricDescription = computed(() => {
    if (!this.security.biometricAvailable) return 'Available in the Android app';
    if (!this.settings.settings().pinEnabled) return 'Create a PIN first';
    return this.settings.settings().biometricEnabled
      ? 'Enabled with PIN fallback'
      : 'Use your enrolled fingerprint';
  });

  protected openPinDialog(): void {
    this.formError.set('');
    this.pinForm.reset({ pin: '', confirmation: '' });
    this.pinDialogOpen.set(true);
  }

  protected closePinDialog(): void {
    this.pinDialogOpen.set(false);
    this.formError.set('');
  }

  protected async savePin(): Promise<void> {
    const { pin, confirmation } = this.pinForm.getRawValue();
    if (this.pinForm.invalid || pin !== confirmation) {
      this.formError.set('Use 4 to 8 digits and enter the same PIN twice.');
      return;
    }

    this.savingPin.set(true);
    try {
      const credentials = await this.security.createPin(pin);
      this.security.disableBiometric();
      this.settings.update({
        pinEnabled: true,
        biometricEnabled: false,
        ...credentials,
      });
      this.closePinDialog();
      this.showMessage('PIN protection enabled.');
    } catch {
      this.formError.set('PIN setup failed. Please try again.');
    } finally {
      this.savingPin.set(false);
    }
  }

  protected toggleBiometric(): void {
    const current = this.settings.settings();
    if (!current.pinEnabled || !current.pinVerifier || !this.security.biometricAvailable) return;

    if (current.biometricEnabled) {
      this.security.disableBiometric();
      this.settings.update({ biometricEnabled: false });
      this.showMessage('Fingerprint unlock disabled.');
      return;
    }

    if (this.security.enableBiometric(current.pinVerifier)) {
      this.showMessage('Confirm your fingerprint in the Android prompt.');
    }
  }

  protected onBiometricEnabled(): void {
    this.settings.update({ biometricEnabled: true });
    this.showMessage('Fingerprint unlock enabled.');
  }

  protected removePin(): void {
    this.security.disableBiometric();
    this.settings.removePin();
    this.confirmRemove.set(false);
    this.lock.unlock();
    this.showMessage('PIN protection removed.');
  }

  private showMessage(value: string): void {
    this.message.set(value);
    window.setTimeout(() => {
      if (this.message() === value) this.message.set('');
    }, 3500);
  }
}
