import { describe, expect, it } from 'vitest';
import {
  compareStrictSemver,
  evaluateMobileVersionPolicy,
  normalizeMobileVersionPolicies,
  validateMobileVersionPolicies,
} from './mobile-version-policy';

describe('mobile-version-policy', () => {
  it('compares semantic versions correctly', () => {
    expect(compareStrictSemver('1.2.3', '1.2.3')).toBe(0);
    expect(compareStrictSemver('1.2.4', '1.2.3')).toBeGreaterThan(0);
    expect(compareStrictSemver('1.3.0', '1.2.9')).toBeGreaterThan(0);
    expect(compareStrictSemver('2.0.0', '1.9.9')).toBeGreaterThan(0);
  });

  it('rejects malformed policy versions', () => {
    const validation = validateMobileVersionPolicies(
      normalizeMobileVersionPolicies({
        ios: {
          effectiveVersion: '1.2',
          storeUrl: 'https://apps.apple.com/app/id1',
        },
      })
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'ios: effective version must use x.y.z format'
    );
  });

  it('rejects policies where effective is less than minimum', () => {
    const validation = validateMobileVersionPolicies(
      normalizeMobileVersionPolicies({
        android: {
          effectiveVersion: '1.2.2',
          minimumVersion: '1.2.3',
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        },
      })
    );

    expect(validation.valid).toBe(false);
    expect(validation.errors).toContain(
      'android: effective version must be greater than or equal to minimum version'
    );
  });

  it('returns supported when no thresholds are configured', () => {
    const result = evaluateMobileVersionPolicy({
      currentVersion: '1.0.0',
      platform: 'ios',
      policies: normalizeMobileVersionPolicies({}),
    });

    expect(result.status).toBe('supported');
    expect(result.shouldUpdate).toBe(false);
    expect(result.requiresUpdate).toBe(false);
    expect(result.otpEnabled).toBe(false);
  });

  it('returns update-required when the app is below minimum version', () => {
    const result = evaluateMobileVersionPolicy({
      currentVersion: '1.0.0',
      platform: 'android',
      policies: normalizeMobileVersionPolicies({
        android: {
          effectiveVersion: '1.3.0',
          minimumVersion: '1.1.0',
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        },
      }),
    });

    expect(result.status).toBe('update-required');
    expect(result.shouldUpdate).toBe(true);
    expect(result.requiresUpdate).toBe(true);
    expect(result.otpEnabled).toBe(false);
  });

  it('returns update-recommended when the app is below effective version but above minimum', () => {
    const result = evaluateMobileVersionPolicy({
      currentVersion: '1.1.0',
      platform: 'android',
      policies: normalizeMobileVersionPolicies({
        android: {
          effectiveVersion: '1.3.0',
          minimumVersion: '1.1.0',
          otpEnabled: true,
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        },
      }),
    });

    expect(result.status).toBe('update-recommended');
    expect(result.shouldUpdate).toBe(true);
    expect(result.requiresUpdate).toBe(false);
    expect(result.otpEnabled).toBe(true);
  });

  it('normalizes OTP rollout booleans from config payloads', () => {
    const result = normalizeMobileVersionPolicies({
      ios: {
        otpEnabled: 'true',
      },
      webOtpEnabled: '1',
    });

    expect(result.ios.otpEnabled).toBe(true);
    expect(result.android.otpEnabled).toBe(false);
    expect(result.webOtpEnabled).toBe(true);
  });
});
