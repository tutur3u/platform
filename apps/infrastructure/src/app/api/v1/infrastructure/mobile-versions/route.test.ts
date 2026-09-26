import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  getSatelliteAppSessionUserMock,
  getMobileVersionPoliciesMock,
  getPermissionsMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  getSatelliteAppSessionUserMock: vi.fn(),
  getMobileVersionPoliciesMock: vi.fn(),
  getPermissionsMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('@tuturuuu/satellite/auth', () => ({
  getSatelliteAppSessionUser: getSatelliteAppSessionUserMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

vi.mock('@/lib/mobile-version-policy', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/mobile-version-policy')
  >('@/lib/mobile-version-policy');

  return {
    ...actual,
    getMobileVersionPolicies: getMobileVersionPoliciesMock,
  };
});

import { GET, PUT } from './route';

function createPermissionsResult(permissions: string[] = []) {
  return {
    permissions,
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

function createTestRequest(init?: RequestInit) {
  return new Request('http://localhost/api/v1/infrastructure/mobile-versions', {
    method: 'GET',
    ...init,
  }) as NextRequest;
}

describe('infrastructure mobile-versions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSatelliteAppSessionUserMock.mockResolvedValue({ id: 'user-1' });
  });

  it('rejects unauthenticated requests', async () => {
    getSatelliteAppSessionUserMock.mockResolvedValue(null);

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('rejects authenticated users without root permission', async () => {
    getPermissionsMock.mockResolvedValue(createPermissionsResult());

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Infrastructure permission required',
    });
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      user: { id: 'user-1' },
    });
  });

  it('returns stored policies for platform admins', async () => {
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_workspace_roles'])
    );
    getMobileVersionPoliciesMock.mockResolvedValue({
      ios: {
        effectiveVersion: '1.2.0',
        minimumVersion: '1.1.0',
        otpEnabled: true,
        storeUrl: 'https://apps.apple.com/app/id1',
      },
      android: {
        effectiveVersion: '1.2.0',
        minimumVersion: '1.1.0',
        otpEnabled: false,
        storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
      },
      webOtpEnabled: true,
    });

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ios: { effectiveVersion: '1.2.0', otpEnabled: true },
      android: { minimumVersion: '1.1.0', otpEnabled: false },
      webOtpEnabled: true,
    });
  });

  it('persists validated policy updates for platform admins', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_workspace_roles'])
    );
    createAdminClientMock.mockResolvedValue({
      from: vi.fn(() => ({
        upsert: upsertMock,
      })),
    });

    const request = createTestRequest({
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ios: {
          effectiveVersion: '1.2.0',
          minimumVersion: '1.1.0',
          otpEnabled: true,
          storeUrl: 'https://apps.apple.com/app/id1',
        },
        android: {
          effectiveVersion: '1.2.0',
          minimumVersion: '1.1.0',
          otpEnabled: false,
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        },
        webOtpEnabled: true,
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      user: { id: 'user-1' },
    });
  });
});
