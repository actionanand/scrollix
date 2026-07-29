import { Injectable, signal } from '@angular/core';

export interface SecuritySettings {
  readonly pinEnabled: boolean;
  readonly pinSalt?: string;
  readonly pinVerifier?: string;
  readonly pinIterations?: number;
  readonly biometricEnabled: boolean;
}

const STORAGE_KEY = 'scrollix_security';
const DEFAULT_SETTINGS: SecuritySettings = {
  pinEnabled: false,
  biometricEnabled: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

@Injectable({ providedIn: 'root' })
export class SecuritySettingsService {
  private readonly state = signal<SecuritySettings>(this.read());

  readonly settings = this.state.asReadonly();

  update(patch: Partial<SecuritySettings>): void {
    this.state.update((current) => {
      const next = { ...current, ...patch };
      this.persist(next);
      return next;
    });
  }

  removePin(): void {
    this.update({
      pinEnabled: false,
      pinSalt: undefined,
      pinVerifier: undefined,
      pinIterations: undefined,
      biometricEnabled: false,
    });
  }

  private read(): SecuritySettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return DEFAULT_SETTINGS;

      const parsed: unknown = JSON.parse(raw);
      if (!isRecord(parsed)) return DEFAULT_SETTINGS;

      const pinSalt = typeof parsed['pinSalt'] === 'string' ? parsed['pinSalt'] : undefined;
      const pinVerifier =
        typeof parsed['pinVerifier'] === 'string' ? parsed['pinVerifier'] : undefined;
      const pinIterations =
        typeof parsed['pinIterations'] === 'number' ? parsed['pinIterations'] : undefined;
      const pinEnabled =
        parsed['pinEnabled'] === true &&
        Boolean(pinSalt) &&
        Boolean(pinVerifier) &&
        typeof pinIterations === 'number';

      return {
        pinEnabled,
        pinSalt,
        pinVerifier,
        pinIterations,
        biometricEnabled: pinEnabled && parsed['biometricEnabled'] === true,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private persist(settings: SecuritySettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Keep the in-memory setting available for the current session.
    }
  }
}
