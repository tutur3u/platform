import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { withSessionAuthMock } = vi.hoisted(() => ({
  withSessionAuthMock: vi.fn((handler: unknown, _options?: unknown) => handler),
}));

vi.mock('@/lib/api-auth', () => ({
  withSessionAuth: (handler: unknown, options?: unknown) =>
    withSessionAuthMock(handler, options),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: vi.fn(),
  },
}));

type QueryResult<T> = {
  data: T | null;
  error: { message: string } | null;
};

function createProfileSupabase({
  privateResult,
  userResult,
}: {
  privateResult: QueryResult<{
    default_workspace_id: string | null;
    email: string | null;
    full_name: string | null;
    new_email: string | null;
  }>;
  userResult: QueryResult<{
    avatar_url: string | null;
    created_at: string;
    display_name: string | null;
    id: string;
  }>;
}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() =>
          table === 'users'
            ? { maybeSingle: vi.fn().mockResolvedValue(userResult) }
            : { maybeSingle: vi.fn().mockResolvedValue(privateResult) }
        ),
      })),
    })),
  };
}

describe('current user profile route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('wires GET and PATCH with scoped internal-or-external profile auth policies', async () => {
    await import('@/legacy-api-routes/v1/users/me/profile/route');

    expect(withSessionAuthMock).toHaveBeenCalledTimes(2);
    expect(withSessionAuthMock.mock.calls[0]?.[1]).toEqual({
      allowAppSessionAuth: [
        {
          targetApp: [
            'calendar',
            'chat',
            'cms',
            'drive',
            'finance',
            'hive',
            'inventory',
            'learn',
            'mail',
            'meet',
            'mind',
            'mira',
            'nova',
            'rewise',
            'tasks',
            'teach',
            'track',
            'platform',
          ],
        },
        { requiredScope: 'users:profile:read' },
        { requiredScope: 'users:profile:write' },
      ],
      cache: { maxAge: 60, swr: 30 },
    });
    expect(withSessionAuthMock.mock.calls[1]?.[1]).toEqual({
      allowAppSessionAuth: [
        {
          targetApp: [
            'calendar',
            'chat',
            'cms',
            'drive',
            'finance',
            'hive',
            'inventory',
            'learn',
            'mail',
            'meet',
            'mind',
            'mira',
            'nova',
            'rewise',
            'tasks',
            'teach',
            'track',
            'platform',
          ],
        },
        { requiredScope: 'users:profile:write' },
      ],
      skipAppSessionStepUpChallenge: true,
    });
  });

  it('returns public profile fields with email from private user details', async () => {
    const route = await import('@/legacy-api-routes/v1/users/me/profile/route');
    const supabase = createProfileSupabase({
      userResult: {
        data: {
          id: 'user-1',
          display_name: 'Public Name',
          avatar_url: 'https://example.com/avatar.png',
          created_at: '2026-05-13T00:00:00.000Z',
        },
        error: null,
      },
      privateResult: {
        data: {
          email: 'private@example.com',
          full_name: 'Private Full Name',
          new_email: null,
          default_workspace_id: 'workspace-1',
        },
        error: null,
      },
    });

    const response = await (route.GET as any)(
      new NextRequest('http://localhost/api/v1/users/me/profile'),
      {
        user: { id: 'user-1', email: 'auth@example.com' },
        supabase,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'user-1',
      email: 'private@example.com',
      display_name: 'Public Name',
      avatar_url: 'https://example.com/avatar.png',
      full_name: 'Private Full Name',
      default_workspace_id: 'workspace-1',
    });
  });

  it('does not fall back to auth email when private email is missing', async () => {
    const route = await import('@/legacy-api-routes/v1/users/me/profile/route');
    const supabase = createProfileSupabase({
      userResult: {
        data: {
          id: 'user-1',
          display_name: 'Public Name',
          avatar_url: null,
          created_at: '2026-05-13T00:00:00.000Z',
        },
        error: null,
      },
      privateResult: {
        data: {
          email: null,
          full_name: null,
          new_email: null,
          default_workspace_id: null,
        },
        error: null,
      },
    });

    const response = await (route.GET as any)(
      new NextRequest('http://localhost/api/v1/users/me/profile'),
      {
        user: { id: 'user-1', email: 'auth@example.com' },
        supabase,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'user-1',
      email: null,
      display_name: 'Public Name',
    });
  });

  it('returns current app-session identity when the public profile row is absent', async () => {
    const route = await import('@/legacy-api-routes/v1/users/me/profile/route');
    const supabase = createProfileSupabase({
      userResult: {
        data: null,
        error: null,
      },
      privateResult: {
        data: {
          email: 'private@example.com',
          full_name: 'Private Full Name',
          new_email: null,
          default_workspace_id: 'workspace-1',
        },
        error: null,
      },
    });

    const response = await (route.GET as any)(
      new NextRequest('http://localhost/api/v1/users/me/profile'),
      {
        user: {
          id: 'app-session-user-1',
          email: 'auth@example.com',
          created_at: '2026-05-13T00:00:00.000Z',
        },
        supabase,
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      id: 'app-session-user-1',
      email: 'private@example.com',
      display_name: null,
      avatar_url: null,
      full_name: 'Private Full Name',
      created_at: '2026-05-13T00:00:00.000Z',
      default_workspace_id: 'workspace-1',
    });
  });
});
