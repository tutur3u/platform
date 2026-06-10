import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  compareStrictSemver,
  evaluateMobileVersionPolicy,
  getMobileVersionPolicies,
  getWebOtpEnabledConfig,
  MOBILE_VERSION_POLICY_CONFIG_KEYS,
  normalizeMobileVersionPolicies,
  validateMobileVersionPolicies,
  WEB_OTP_ENABLED_CONFIG_KEY,
} from './mobile-version-policy';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

function mockSingleConfigResponse(response: {
  data: { value: unknown } | null;
  error: Error | null;
}) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    maybeSingle: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.maybeSingle.mockResolvedValue(response);

  mocks.createAdminClient.mockResolvedValue({
    from: vi.fn(() => query),
  });

  return query;
}

function mockListConfigResponse(response: {
  data: Array<{ id: string; value: unknown }>;
  error: Error | null;
}) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.in.mockResolvedValue(response);

  mocks.createAdminClient.mockResolvedValue({
    from: vi.fn(() => query),
  });

  return query;
}

describe('mobile-version-policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

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

  it('reads the web OTP flag without loading mobile policy fields', async () => {
    const query = mockSingleConfigResponse({
      data: { value: 'true' },
      error: null,
    });

    await expect(getWebOtpEnabledConfig()).resolves.toBe(true);

    expect(mocks.createAdminClient).toHaveBeenCalledWith({ noCookie: true });
    expect(query.select).toHaveBeenCalledWith('value');
    expect(query.eq).toHaveBeenCalledWith('id', WEB_OTP_ENABLED_CONFIG_KEY);
    expect(query.in).not.toHaveBeenCalled();
  });

  it('throws only the web OTP config error for web flag fetch failures', async () => {
    mockSingleConfigResponse({
      data: null,
      error: new Error('database unavailable'),
    });

    await expect(getWebOtpEnabledConfig()).rejects.toThrow(
      'Failed to fetch web OTP setting'
    );
  });

  it('still validates mobile policy fields for mobile policy loading', async () => {
    mockListConfigResponse({
      data: [
        {
          id: MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.effectiveVersion,
          value: '1.2',
        },
        {
          id: MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.storeUrl,
          value: 'https://apps.apple.com/app/id1',
        },
      ],
      error: null,
    });

    await expect(getMobileVersionPolicies()).rejects.toThrow(
      'ios: effective version must use x.y.z format'
    );
  });
});
