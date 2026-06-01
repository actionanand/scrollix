import { Component, input, output, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
})
export class LoginDialogComponent {
  readonly open = input.required<boolean>();
  readonly closed = output<void>();

  private readonly auth = inject(AuthService);

  protected readonly usernameControl = new FormControl('', { nonNullable: true });
  protected readonly passwordControl = new FormControl('', { nonNullable: true });
  protected readonly showPassword = signal(false);
  protected readonly loginError = signal(false);
  protected readonly usernameError = signal(false);

  protected toggleShowPassword(): void {
    this.showPassword.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    const username = this.usernameControl.value.trim();
    if (!username) {
      this.usernameError.set(true);
      return;
    }
    this.usernameError.set(false);

    const success = await this.auth.login(username, this.passwordControl.value);
    if (success) {
      this.loginError.set(false);
      this.resetAndClose();
    } else {
      this.loginError.set(true);
    }
  }

  protected onClose(): void {
    this.resetAndClose();
  }

  private resetAndClose(): void {
    this.loginError.set(false);
    this.usernameError.set(false);
    this.usernameControl.reset();
    this.passwordControl.reset();
    this.showPassword.set(false);
    this.closed.emit();
  }
}
