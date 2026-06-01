import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { LoginDialogComponent } from '../login-dialog/login-dialog';

@Component({
  selector: 'app-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LoginDialogComponent],
  templateUrl: './header.html',
  styleUrl: './header.scss',
})
export class HeaderComponent {
  protected readonly auth = inject(AuthService);
  protected readonly showLoginDialog = signal(false);

  protected openLogin(): void {
    this.showLoginDialog.set(true);
  }

  protected closeLogin(): void {
    this.showLoginDialog.set(false);
  }

  protected onLogout(): void {
    this.auth.logout();
  }
}
