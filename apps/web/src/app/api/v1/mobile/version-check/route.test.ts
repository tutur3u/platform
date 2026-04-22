import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { evaluateMobileVersionPolicyMock, getMobileVersionPoliciesMock } =
  vi.hoisted(() => ({
    evaluateMobileVersionPolicyMock: vi.fn(),
    getMobileVersionPoliciesMock: vi.fn(),
  }));

vi.mock('@/lib/mobile-version-policy', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/mobile-version-policy')
  >('@/lib/mobile-version-policy');

  return {
    ...actual,
    evaluateMobileVersionPolicy: evaluateMobileVersionPolicyMock,
    getMobileVersionPolicies: getMobileVersionPoliciesMock,
  };
});

import { GET } from './route';

describe('mobile version-check route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns supported responses from the policy evaluator', async () => {
    getMobileVersionPoliciesMock.mockResolvedValue({});
    evaluateMobileVersionPolicyMock.mockReturnValue({
      platform: 'ios',
      currentVersion: '1.2.3',
      effectiveVersion: null,
      minimumVersion: null,
      otpEnabled: false,
      storeUrl: null,
      status: 'supported',
      shouldUpdate: false,
      requiresUpdate: false,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/mobile/version-check?platform=ios&version=1.2.3'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      otpEnabled: false,
      status: 'supported',
      shouldUpdate: false,
      requiresUpdate: false,
    });
  });

  it('returns update-recommended when the evaluator marks the version as outdated', async () => {
    getMobileVersionPoliciesMock.mockResolvedValue({});
    evaluateMobileVersionPolicyMock.mockReturnValue({
      platform: 'android',
      currentVersion: '1.2.0',
      effectiveVersion: '1.3.0',
      minimumVersion: '1.1.0',
      otpEnabled: true,
      storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
      status: 'update-recommended',
      shouldUpdate: true,
      requiresUpdate: false,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/mobile/version-check?platform=android&version=1.2.0'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      otpEnabled: true,
      status: 'update-recommended',
      shouldUpdate: true,
      requiresUpdate: false,
    });
  });

  it('returns update-required when the evaluator marks the version as unsupported', async () => {
    getMobileVersionPoliciesMock.mockResolvedValue({});
    evaluateMobileVersionPolicyMock.mockReturnValue({
      platform: 'android',
      currentVersion: '1.0.0',
      effectiveVersion: '1.3.0',
      minimumVersion: '1.1.0',
      otpEnabled: false,
      storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
      status: 'update-required',
      shouldUpdate: true,
      requiresUpdate: true,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/mobile/version-check?platform=android&version=1.0.0'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: 'update-required',
      shouldUpdate: true,
      requiresUpdate: true,
    });
  });
});
