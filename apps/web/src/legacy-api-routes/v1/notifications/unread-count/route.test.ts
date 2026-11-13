import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const authGetUserMock = vi.fn();
  const membershipMaybeSingleMock = vi.fn();
  const membershipEqUserIdMock = vi.fn(() => ({
    maybeSingle: membershipMaybeSingleMock,
  }));
  const membershipEqWsIdMock = vi.fn(() => ({
    eq: membershipEqUserIdMock,
  }));
  const membershipSelectMock = vi.fn(() => ({
    eq: membershipEqWsIdMock,
  }));
  const fromMock = vi.fn((table: string) => {
    if (table === 'workspace_members') {
      return {
        select: membershipSelectMock,
      };
    }

    throw new Error(`Unexpected session table ${table}`);
  });

  const notificationsEqWsIdMock = vi.fn();
  const notificationsIsMock = vi.fn(() => ({
    eq: notificationsEqWsIdMock,
  }));
  const notificationsOrMock = vi.fn(() => ({
    is: notificationsIsMock,
  }));
  const notificationsSelectMock = vi.fn(() => ({
    or: notificationsOrMock,
  }));
  const adminFromMock = vi.fn((table: string) => {
    if (table === 'notifications') {
      return {
        select: notificationsSelectMock,
      };
    }

    throw new Error(`Unexpected admin table ${table}`);
  });

  return {
    adminFromMock,
    authGetUserMock,
    fromMock,
    membershipEqUserIdMock,
    membershipEqWsIdMock,
    membershipMaybeSingleMock,
    membershipSelectMock,
    notificationsEqWsIdMock,
    notificationsIsMock,
    notificationsOrMock,
    notificationsSelectMock,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      from: mocks.adminFromMock,
    })
  ),
  createClient: vi.fn((request?: Request) => {
    const authorization = request?.headers.get('authorization') ?? '';
    const cookie = request?.headers.get('cookie') ?? '';
    const isolated =
      authorization.startsWith('Bearer ttr_app_') ||
      cookie
        .split(';')
        .some((part) => part.trim().startsWith('tuturuuu_app_session='));

    return Promise.resolve({
      auth: {
        getUser: isolated
          ? vi.fn().mockResolvedValue({
              data: { user: null },
              error: { message: 'Auth session missing' },
            })
          : mocks.authGetUserMock,
      },
      from: mocks.fromMock,
    });
  }),
}));

vi.mock('../access', () => ({
  buildNotificationAccessFilter: vi.fn(() => 'scope.eq.user'),
  getNotificationAccessContext: vi.fn(() =>
    Promise.resolve({
      userEmail: 'local@tuturuuu.com',
      userId: 'user-1',
      workspaceIds: ['ws-1'],
    })
  ),
}));

import { GET } from './route';

describe('notifications unread-count route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 403 when the requested workspace has no membership row', async () => {
    mocks.authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.membershipMaybeSingleMock.mockResolvedValue({
      data: null,
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/notifications/unread-count?wsId=841a71e7-2015-47e5-8f23-0d85f6c456eb'
      )
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Access denied to workspace',
    });
    expect(mocks.membershipSelectMock).toHaveBeenCalledWith('type');
    expect(mocks.membershipEqWsIdMock).toHaveBeenCalledWith(
      'ws_id',
      '841a71e7-2015-47e5-8f23-0d85f6c456eb'
    );
    expect(mocks.membershipEqUserIdMock).toHaveBeenCalledWith(
      'user_id',
      'user-1'
    );
    expect(mocks.membershipMaybeSingleMock).toHaveBeenCalledOnce();
  });

  it('returns the unread count when workspace membership exists', async () => {
    mocks.authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.membershipMaybeSingleMock.mockResolvedValue({
      data: {
        type: 'MEMBER',
      },
      error: null,
    });
    mocks.notificationsEqWsIdMock.mockResolvedValue({
      count: 7,
      error: null,
    });

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/notifications/unread-count?wsId=841a71e7-2015-47e5-8f23-0d85f6c456eb'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ count: 7 });
    expect(mocks.notificationsSelectMock).toHaveBeenCalledWith('*', {
      count: 'exact',
      head: true,
    });
    expect(mocks.notificationsOrMock).toHaveBeenCalledWith('scope.eq.user');
    expect(mocks.notificationsIsMock).toHaveBeenCalledWith('read_at', null);
    expect(mocks.notificationsEqWsIdMock).toHaveBeenCalledWith(
      'ws_id',
      '841a71e7-2015-47e5-8f23-0d85f6c456eb'
    );
  });

  it('returns the unread count for a signed-in Chat session that also carries an app-session marker', async () => {
    const previousSupabaseUrl = process.env.SUPABASE_URL;
    process.env.SUPABASE_URL = 'https://project.supabase.co';
    mocks.authGetUserMock.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
      error: null,
    });
    mocks.membershipMaybeSingleMock.mockResolvedValue({
      data: {
        type: 'MEMBER',
      },
      error: null,
    });
    mocks.notificationsEqWsIdMock.mockResolvedValue({
      count: 4,
      error: null,
    });

    try {
      const response = await GET(
        new NextRequest(
          'https://chat.tuturuuu.com/api/v1/notifications/unread-count?wsId=841a71e7-2015-47e5-8f23-0d85f6c456eb',
          {
            headers: {
              authorization: 'Bearer ttr_app_chat-session',
              cookie:
                'tuturuuu_app_session=ttr_app_chat-session; sb-project-auth-token=signed-in',
            },
          }
        )
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ count: 4 });
    } finally {
      if (previousSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = previousSupabaseUrl;
    }
  });
});
