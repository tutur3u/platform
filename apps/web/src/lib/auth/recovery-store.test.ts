import { describe, expect, it } from 'vitest';
import {
  getAuthRecoveryLocalizedPath,
  sanitizeAuthRecoveryRedirectPath,
} from './recovery-store';

describe('auth recovery redirect sanitization', () => {
  it('omits the default locale from fallback recovery redirects', () => {
    expect(sanitizeAuthRecoveryRedirectPath(undefined)).toBe('/onboarding');
    expect(sanitizeAuthRecoveryRedirectPath(null, 'en')).toBe('/onboarding');
  });

  it('canonicalizes old default-locale recovery redirects', () => {
    expect(sanitizeAuthRecoveryRedirectPath('/en/onboarding')).toBe(
      '/onboarding'
    );
    expect(sanitizeAuthRecoveryRedirectPath('/en/personal?tab=home')).toBe(
      '/personal?tab=home'
    );
  });

  it('falls back for unsafe absolute redirects', () => {
    expect(
      sanitizeAuthRecoveryRedirectPath('https://evil.example/onboarding')
    ).toBe('/onboarding');
  });

  it('keeps non-default locale fallback paths explicit', () => {
    expect(sanitizeAuthRecoveryRedirectPath(undefined, 'vi')).toBe(
      '/vi/onboarding'
    );
    expect(getAuthRecoveryLocalizedPath('/auth/recovery', 'vi')).toBe(
      '/vi/auth/recovery'
    );
  });
});
