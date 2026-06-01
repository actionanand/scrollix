import { Injectable, signal } from '@angular/core';
import { environment } from '../../environments/environment';

const AUTH_KEY = 'scrollix_auth';
const USERNAME_KEY = 'scrollix_username';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly _isLoggedIn = signal(this.checkStoredAuth());
  private readonly _username = signal(localStorage.getItem(USERNAME_KEY) ?? '');

  readonly isLoggedIn = this._isLoggedIn.asReadonly();
  readonly username = this._username.asReadonly();

  async login(username: string, password: string): Promise<boolean> {
    const hash = await this.sha1(password);
    if (hash === environment.PASSWORD) {
      localStorage.setItem(AUTH_KEY, hash);
      localStorage.setItem(USERNAME_KEY, username);
      this._isLoggedIn.set(true);
      this._username.set(username);
      return true;
    }
    return false;
  }

  logout(): void {
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USERNAME_KEY);
    this._isLoggedIn.set(false);
    this._username.set('');
  }

  private checkStoredAuth(): boolean {
    const stored = localStorage.getItem(AUTH_KEY);
    return stored === environment.PASSWORD;
  }

  private async sha1(message: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
