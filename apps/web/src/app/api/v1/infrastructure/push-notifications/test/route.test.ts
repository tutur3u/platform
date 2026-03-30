import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createAdminClientMock,
  createClientMock,
  getPermissionsMock,
  sendCustomPushMessageBatchMock,
} = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
  createClientMock: vi.fn(),
  getPermissionsMock: vi.fn(),
  sendCustomPushMessageBatchMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
  createClient: createClientMock,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: getPermissionsMock,
}));

vi.mock('@/lib/notifications/push-delivery', () => ({
  sendCustomPushMessageBatch: sendCustomPushMessageBatchMock,
}));

import { POST } from './route';

function createPermissionsResult(permissions: string[] = []) {
  return {
    permissions,
    containsPermission: (permission: string) =>
      permissions.includes(permission),
    withoutPermission: (permission: string) =>
      !permissions.includes(permission),
  };
}

function createRequest(init?: RequestInit) {
  return new Request(
    'http://localhost/api/v1/infrastructure/push-notifications/test',
    {
      method: 'POST',
      ...init,
    }
  ) as NextRequest;
}

describe('infrastructure push notifications test route', () => {
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
    authGetUserMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(
      createRequest({
        body: JSON.stringify({
          appFlavor: 'production',
          body: 'Test body',
          deliveryKind: 'notification',
          platform: 'ios',
          sendToAll: true,
          title: 'Test push',
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: 'Unauthorized' });
  });

  it('rejects callers without platform admin permissions', async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    getPermissionsMock.mockResolvedValue(createPermissionsResult());

    const request = createRequest({
      body: JSON.stringify({
        appFlavor: 'production',
        body: 'Test body',
        deliveryKind: 'notification',
        platform: 'ios',
        sendToAll: true,
        title: 'Test push',
      }),
    });
    const response = await POST(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(getPermissionsMock).toHaveBeenCalledWith({
      wsId: '00000000-0000-0000-0000-000000000000',
      request,
    });
  });

  it('sends a test push and removes invalid tokens', async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_workspace_roles'])
    );

    const deleteInMock = vi.fn().mockResolvedValue({ error: null });
    const deleteMock = vi.fn(() => ({
      in: deleteInMock,
    }));
    const queryResult = {
      data: [{ token: 'token-1' }, { token: 'token-2' }],
      error: null,
    };
    const queryBuilder = Object.assign(Promise.resolve(queryResult), {
      eq: vi.fn(() => queryBuilder),
      order: vi.fn(() => queryBuilder),
      limit: vi.fn(() => queryBuilder),
    });
    const selectMock = vi.fn(() => ({
      eq: queryBuilder.eq,
    }));

    createAdminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'notification_push_devices') {
          return {
            delete: deleteMock,
            select: selectMock,
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });

    sendCustomPushMessageBatchMock.mockResolvedValue({
      deliveredCount: 1,
      invalidTokens: ['token-2'],
    });

    const response = await POST(
      createRequest({
        body: JSON.stringify({
          appFlavor: 'production',
          body: 'Test body',
          data: {
            source: 'dashboard',
          },
          deliveryKind: 'notification',
          platform: 'ios',
          sendToAll: false,
          title: 'Test push',
          userId: '123e4567-e89b-12d3-a456-426614174000',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      deliveredCount: 1,
      invalidTokens: ['token-2'],
      invalidTokensRemoved: 1,
      matchedDevices: 2,
      message: 'Push notification test sent.',
      success: true,
      truncated: false,
    });
    expect(sendCustomPushMessageBatchMock).toHaveBeenCalledWith({
      devices: [{ token: 'token-1' }, { token: 'token-2' }],
      message: {
        body: 'Test body',
        data: { source: 'dashboard' },
        dataOnly: false,
        title: 'Test push',
      },
    });
    expect(selectMock).toHaveBeenCalledWith('token');
    expect(queryBuilder.eq).toHaveBeenCalledWith('app_flavor', 'production');
    expect(queryBuilder.order).toHaveBeenCalledWith('last_seen_at', {
      ascending: false,
    });
    expect(queryBuilder.eq).toHaveBeenCalledWith('platform', 'ios');
    expect(queryBuilder.eq).toHaveBeenCalledWith(
      'user_id',
      '123e4567-e89b-12d3-a456-426614174000'
    );
    expect(deleteInMock).toHaveBeenCalledWith('token', ['token-2']);
  });

  it('rejects requests without a broadcast toggle or a target filter', async () => {
    authGetUserMock.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    getPermissionsMock.mockResolvedValue(
      createPermissionsResult(['manage_workspace_roles'])
    );

    const response = await POST(
      createRequest({
        body: JSON.stringify({
          appFlavor: 'production',
          body: 'Test body',
          deliveryKind: 'notification',
          platform: 'all',
          sendToAll: false,
          title: 'Test push',
        }),
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Invalid request body',
    });
  });
});
