import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const AUTH_KEY = 'scrollix_auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _isLoggedIn = signal(this.checkStoredAuth());

  readonly isLoggedIn = this._isLoggedIn.asReadonly();

  async login(password: string): Promise<boolean> {
    const hash = await this.sha1(password);
    if (hash === environment.PASSWORD_SHA1) {
      localStorage.setItem(AUTH_KEY, hash);
      this._isLoggedIn.set(true);
      return true;
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem(AUTH_KEY);
    this._isLoggedIn.set(false);
  }

  private checkStoredAuth(): boolean {
    const stored = localStorage.getItem(AUTH_KEY);
    return stored === environment.PASSWORD_SHA1;
  }

  private async sha1(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
