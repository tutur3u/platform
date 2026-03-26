import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  getMobileVersionPoliciesMock,
  getPermissionsMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getMobileVersionPoliciesMock: vi.fn(),
  getPermissionsMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
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
  const authGetUserMock = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: {
        getUser: authGetUserMock,
      },
    });
  });

  it('rejects unauthenticated requests', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: null } });

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
    expect(createClientMock).toHaveBeenCalledWith(request);
  });

  it('rejects authenticated users without root permission', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getPermissionsMock.mockResolvedValue(createPermissionsResult());

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      request,
    });
  });

  it('returns stored policies for platform admins', async () => {
    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_workspace_roles'])
    );
    getMobileVersionPoliciesMock.mockResolvedValue({
      ios: {
        effectiveVersion: '1.2.0',
        minimumVersion: '1.1.0',
        storeUrl: 'https://apps.apple.com/app/id1',
      },
      android: {
        effectiveVersion: '1.2.0',
        minimumVersion: '1.1.0',
        storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
      },
    });

    const request = createTestRequest();
    const response = await GET(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ios: { effectiveVersion: '1.2.0' },
      android: { minimumVersion: '1.1.0' },
    });
  });

  it('persists validated policy updates for platform admins', async () => {
    const upsertMock = vi.fn().mockResolvedValue({ error: null });

    authGetUserMock.mockResolvedValue({ data: { user: { id: 'user-1' } } });
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
          storeUrl: 'https://apps.apple.com/app/id1',
        },
        android: {
          effectiveVersion: '1.2.0',
          minimumVersion: '1.1.0',
          storeUrl: 'https://play.google.com/store/apps/details?id=example.app',
        },
      }),
    });

    const response = await PUT(request);

    expect(response.status).toBe(200);
    expect(upsertMock).toHaveBeenCalledOnce();
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      request,
    });
  });
});
