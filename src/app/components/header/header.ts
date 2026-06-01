import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormControl } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent {
  protected readonly auth = inject(AuthService);
  protected readonly showLoginForm = signal(false);
  protected readonly passwordControl = new FormControl('');
  protected readonly loginError = signal(false);

  protected toggleLoginForm(): void {
    this.showLoginForm.update((v) => !v);
    this.loginError.set(false);
    this.passwordControl.reset();
  }

  protected async onLogin(): Promise<void> {
    const success = await this.auth.login(this.passwordControl.value ?? '');
    if (success) {
      this.showLoginForm.set(false);
      this.passwordControl.reset();
      this.loginError.set(false);
    } else {
      this.loginError.set(true);
    }
  }

  protected onLogout(): void {
    this.auth.logout();
  }
}
