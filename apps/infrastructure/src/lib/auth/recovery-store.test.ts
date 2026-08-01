import { describe, expect, it } from 'vitest';
import {
  getAuthRecoveryLocalizedPath,
  sanitizeAuthRecoveryRedirectPath,
} from './recovery-store';

describe('auth recovery redirect sanitization', () => {
  it('omits the default locale from fallback recovery redirects', () => {
    expect(sanitizeAuthRecoveryRedirectPath(undefined)).toBe('/personal');
    expect(sanitizeAuthRecoveryRedirectPath(null, 'en')).toBe('/personal');
  });

  it('canonicalizes old default-locale recovery redirects', () => {
    expect(sanitizeAuthRecoveryRedirectPath('/en/onboarding')).toBe(
      '/personal'
    );
    expect(sanitizeAuthRecoveryRedirectPath('/en/personal?tab=home')).toBe(
      '/personal?tab=home'
    );
  });

  it('falls back for unsafe absolute redirects', () => {
    expect(
      sanitizeAuthRecoveryRedirectPath('https://evil.example/onboarding')
    ).toBe('/personal');
  });

  it('keeps non-default locale fallback paths explicit', () => {
    expect(sanitizeAuthRecoveryRedirectPath(undefined, 'vi')).toBe(
      '/vi/personal'
    );
    expect(getAuthRecoveryLocalizedPath('/auth/recovery', 'vi')).toBe(
      '/vi/auth/recovery'
    );
  });
});
