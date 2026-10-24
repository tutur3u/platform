import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const rangeMock = vi.fn();
  const orderByIdMock = vi.fn(() => ({
    range: rangeMock,
  }));
  const orderByCreatedAtMock = vi.fn(() => ({
    order: orderByIdMock,
  }));
  const isMock = vi.fn(() => ({
    order: orderByCreatedAtMock,
  }));
  const eqWsIdMock = vi.fn(() => ({
    is: isMock,
    order: orderByCreatedAtMock,
  }));
  const orMock = vi.fn((_filter?: string) => ({
    eq: eqWsIdMock,
    is: isMock,
    order: orderByCreatedAtMock,
  }));
  const selectMock = vi.fn(() => ({
    or: orMock,
  }));

  return {
    eqWsIdMock,
    isMock,
    orderByCreatedAtMock,
    orderByIdMock,
    orMock,
    rangeMock,
    selectMock,
    serverLoggerError: vi.fn(),
    supabase: { from: vi.fn() },
    user: { email_confirmed_at: null, id: 'user-1' },
    withSessionAuth: vi.fn(),
  };
});

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() =>
    Promise.resolve({
      auth: { admin: { getUserById: vi.fn() } },
      from: vi.fn((table: string) => {
        if (table === 'notifications') {
          return {
            select: mocks.selectMock,
          };
        }

        throw new Error(`Unexpected admin table ${table}`);
      }),
    })
  ),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: mocks.withSessionAuth,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: mocks.serverLoggerError,
  },
}));

describe('notifications route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.rangeMock.mockResolvedValue({
      count: 0,
      data: [],
      error: null,
    });
    mocks.supabase.from.mockImplementation((table: string) => {
      if (table === 'workspace_members') {
        return {
          select: () => ({
            eq: async () => ({ data: [], error: null }),
          }),
        };
      }

      throw new Error(`Unexpected request table ${table}`);
    });
    mocks.withSessionAuth.mockImplementation(
      (
        handler: (
          request: NextRequest,
          context: { supabase: typeof mocks.supabase; user: typeof mocks.user }
        ) => unknown
      ) =>
        (request: NextRequest) =>
          handler(request, { supabase: mocks.supabase, user: mocks.user })
    );
  });

  it('accepts the chat notification query shape without validation 400', async () => {
    const route = await import('./route');

    const response = await route.GET(
      new NextRequest(
        'http://localhost/api/v1/notifications?limit=15&offset=0&unreadOnly=true&readOnly=false&wsId=42529372-c669-4833-bb32-2cab1f4ffd83'
      )
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      count: 0,
      limit: 15,
      notifications: [],
      offset: 0,
    });
    expect(mocks.eqWsIdMock).toHaveBeenCalledWith(
      'ws_id',
      '42529372-c669-4833-bb32-2cab1f4ffd83'
    );
    expect(mocks.isMock).toHaveBeenCalledWith('read_at', null);
    expect(mocks.rangeMock).toHaveBeenCalledWith(0, 14);
    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });

  it('returns 200 for an unconfirmed user with only user-owned notification access', async () => {
    const route = await import('./route');

    const response = await route.GET(
      new NextRequest('http://localhost/api/v1/notifications')
    );

    expect(response.status).toBe(200);
    const accessFilter = mocks.orMock.mock.calls[0]?.[0];
    expect(accessFilter).toContain('user_id.eq.user-1');
    expect(accessFilter).not.toContain('type.eq.workspace_invite');
    expect(accessFilter).not.toContain('email.ilike.');
  });
});
