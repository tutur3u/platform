import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const adminFromMock = vi.fn();
  const authGetUserMock = vi.fn();

  return {
    adminFromMock,
    authGetUserMock,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: mocks.adminFromMock,
    })
  ),
  createClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: mocks.authGetUserMock,
      },
    })
  ),
}));

import { DELETE, POST } from './route';

describe('notification push-devices route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when the caller is unauthenticated', async () => {
    mocks.authGetUserMock.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const response = await POST(
      new Request('http://localhost/api/v1/notifications/push-devices', {
        method: 'POST',
        body: JSON.stringify({
          appFlavor: 'production',
          deviceId: 'device-1',
          platform: 'ios',
          token: 'token-1',
        }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: 'Unauthorized',
    });
  });

  it('upserts a push device for the authenticated user', async () => {
    mocks.authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });

    const cleanupNeqMock = vi.fn().mockResolvedValue({ error: null });
    const cleanupEqMock = vi.fn(() => ({
      neq: cleanupNeqMock,
    }));
    const deleteMock = vi.fn(() => ({
      eq: cleanupEqMock,
    }));

    const singleMock = vi.fn().mockResolvedValue({
      data: {
        app_flavor: 'production',
        device_id: 'device-1',
        id: 'push-device-1',
        last_seen_at: '2026-03-28T00:00:00.000Z',
        platform: 'ios',
        token: 'token-1',
        user_id: 'user-1',
      },
      error: null,
    });
    const selectMock = vi.fn(() => ({
      single: singleMock,
    }));
    const upsertMock = vi.fn(() => ({
      select: selectMock,
    }));

    mocks.adminFromMock.mockReturnValue({
      delete: deleteMock,
      upsert: upsertMock,
    });

    const response = await POST(
      new Request('http://localhost/api/v1/notifications/push-devices', {
        method: 'POST',
        body: JSON.stringify({
          appFlavor: 'production',
          deviceId: 'device-1',
          platform: 'ios',
          token: 'token-1',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      device: expect.objectContaining({
        device_id: 'device-1',
        id: 'push-device-1',
        platform: 'ios',
        token: 'token-1',
        user_id: 'user-1',
      }),
    });
    expect(deleteMock).toHaveBeenCalledOnce();
    expect(cleanupEqMock).toHaveBeenCalledWith('token', 'token-1');
    expect(cleanupNeqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        app_flavor: 'production',
        device_id: 'device-1',
        platform: 'ios',
        token: 'token-1',
        user_id: 'user-1',
      }),
      {
        onConflict: 'user_id,device_id,app_flavor',
      }
    );
  });

  it('deletes the caller device registration', async () => {
    mocks.authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });

    const finalEqMock = vi.fn().mockResolvedValue({ error: null });
    const secondEqMock = vi.fn(() => ({
      eq: finalEqMock,
    }));
    const firstEqMock = vi.fn(() => ({
      eq: secondEqMock,
    }));
    const deleteMock = vi.fn(() => ({
      eq: firstEqMock,
    }));

    mocks.adminFromMock.mockReturnValue({
      delete: deleteMock,
    });

    const response = await DELETE(
      new Request('http://localhost/api/v1/notifications/push-devices', {
        method: 'DELETE',
        body: JSON.stringify({
          appFlavor: 'production',
          deviceId: 'device-1',
        }),
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(firstEqMock).toHaveBeenCalledWith('user_id', 'user-1');
    expect(secondEqMock).toHaveBeenCalledWith('device_id', 'device-1');
    expect(finalEqMock).toHaveBeenCalledWith('app_flavor', 'production');
  });
});
