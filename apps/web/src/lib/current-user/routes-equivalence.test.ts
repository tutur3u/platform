/**
 * Behaviour pins for the individual current-user GET routes. The file drives
 * only each route's public GET export with mocked dependencies and asserts the
 * status, body, headers and console.error lines the route produced before its
 * data read moved into `lib/current-user`. It runs unchanged on both sides of
 * that extraction.
 */
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeQuery } from './test-support';

const h = vi.hoisted(() => ({
  admin: vi.fn(),
  boardAccess: vi.fn(),
  from: vi.fn(),
  guestShares: vi.fn(),
  invitations: vi.fn(),
  membership: vi.fn(),
  normalize: vi.fn(),
  summaries: vi.fn(),
  unreadAccess: vi.fn(),
  user: {
    created_at: '2026-01-01T00:00:00Z',
    email: 'member@example.test',
    id: '00000000-0000-4000-8000-000000000001',
  } as Record<string, unknown>,
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: h.admin,
  createDynamicAdminClient: h.admin,
}));
vi.mock('next/server', async () => ({
  ...(await vi.importActual('next/server')),
  connection: vi.fn(),
}));
vi.mock('@/lib/api-auth', () => ({
  withSessionAuth:
    (
      handler: (
        request: Request,
        context: unknown,
        params: unknown
      ) => Promise<Response>
    ) =>
    async (
      request: Request,
      routeContext?: { params?: Promise<Record<string, string>> }
    ) =>
      handler(
        request,
        { supabase: { from: h.from }, user: h.user },
        routeContext?.params ? await routeContext.params : {}
      ),
}));
vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  normalizeWorkspaceId: h.normalize,
  verifyHasSecrets: vi.fn(),
  verifyWorkspaceMembershipType: h.membership,
}));
vi.mock('@tuturuuu/tasks-api/server/board-access', () => ({
  loadTaskBoardGuestSharesForWorkspace: h.guestShares,
  summarizeTaskBoardGuestShares: (shares: { count: number }) => ({
    boardCount: shares.count,
    highestPermission: 'view',
    landingPath: '/tasks',
  }),
}));
vi.mock('@/lib/workspaces/workspace-deletion', () => ({
  deleteWorkspaceForActor: vi.fn(),
}));
vi.mock('@/lib/workspace-invitations/status', () => ({
  listPendingWorkspaceInvitations: h.invitations,
}));
vi.mock('@tuturuuu/ui/lib/workspace-actions', () => ({
  fetchWorkspaceSummaries: h.summaries,
}));
vi.mock('@/legacy-api-routes/v1/notifications/access', () => ({
  buildNotificationAccessFilter: vi.fn(() => 'scope'),
  getNotificationAccessContext: h.unreadAccess,
}));
vi.mock('@/app/api/v1/users/me/hidden-workspaces/board-share-access', () => ({
  hasBoardShareWorkspaceAccess: h.boardAccess,
}));

import { GET as getOnboarding } from '@/app/api/v1/user/onboarding-progress/route';
import { GET as getHidden } from '@/app/api/v1/users/me/hidden-workspaces/route';
import { GET as getProfile } from '@/app/api/v1/users/me/profile/route';
import { GET as getUnread } from '@/legacy-api-routes/v1/notifications/unread-count/route';
import { GET as getConfig } from '@/legacy-api-routes/v1/users/me/configs/[configId]/route';
import { GET as getWorkspaces } from '@/legacy-api-routes/v1/workspaces/route';
import { GET as getInvitations } from '@/legacy-api-routes/workspaces/invitations/route';
import { GET as getWorkspace } from '@/legacy-api-routes/workspaces/[wsId]/route';

const WS = '00000000-0000-4000-8000-0000000000aa';
const call = (
  handler: (...args: never[]) => Promise<Response>,
  url: string,
  params?: Record<string, string>
) =>
  (handler as (...args: unknown[]) => Promise<Response>)(
    new NextRequest(`https://example.test${url}`),
    params ? { params: Promise.resolve(params) } : undefined
  );
const cache = (response: Response) => response.headers.get('Cache-Control');

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  h.user.email = 'member@example.test';
});

describe('GET /api/v1/users/me/profile', () => {
  const tables = (
    users: unknown,
    usersError: unknown,
    details: unknown,
    detailsError: unknown
  ) =>
    h.from.mockImplementation((table: string) =>
      table === 'users'
        ? fakeQuery({ data: users, error: usersError })
        : fakeQuery({ data: details, error: detailsError })
    );

  it('returns the profile body without cache headers', async () => {
    tables(
      {
        id: 'u',
        display_name: 'D',
        avatar_url: 'a',
        banner_url: 'b',
        bio: 'x',
        handle: 'h',
        created_at: 'c',
      },
      null,
      { full_name: 'F', new_email: 'n', email: 'e', default_workspace_id: 'w' },
      null
    );
    const response = await call(getProfile, '/api/v1/users/me/profile');
    expect(response.status).toBe(200);
    expect(cache(response)).toBeNull();
    expect(await response.json()).toEqual({
      id: 'u',
      email: 'e',
      display_name: 'D',
      avatar_url: 'a',
      banner_url: 'b',
      bio: 'x',
      handle: 'h',
      full_name: 'F',
      new_email: 'n',
      created_at: 'c',
      default_workspace_id: 'w',
    });
  });

  it('fills nulls and the auth user creation time when rows are absent', async () => {
    tables(null, null, null, null);
    const response = await call(getProfile, '/api/v1/users/me/profile');
    expect(await response.json()).toEqual({
      id: h.user.id,
      email: null,
      display_name: null,
      avatar_url: null,
      banner_url: null,
      bio: null,
      handle: null,
      full_name: null,
      new_email: null,
      created_at: '2026-01-01T00:00:00Z',
      default_workspace_id: null,
    });
  });

  it('retries without banner_url on a missing-column error', async () => {
    let usersCalls = 0;
    h.from.mockImplementation((table: string) => {
      if (table !== 'users') return fakeQuery({ data: null, error: null });
      usersCalls += 1;
      return usersCalls === 1
        ? fakeQuery({ data: null, error: { code: '42703' } })
        : fakeQuery({
            data: { id: 'u', display_name: 'L', created_at: 'c' },
            error: null,
          });
    });
    const response = await call(getProfile, '/api/v1/users/me/profile');
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      banner_url: null,
      display_name: 'L',
    });
  });

  it.each([
    ['users', { code: 'X' }, null],
    ['details', null, { message: 'm' }],
  ])(
    'returns 500 when the %s read fails',
    async (_name, usersError, detailsError) => {
      tables(null, usersError, null, detailsError);
      const response = await call(getProfile, '/api/v1/users/me/profile');
      expect(response.status).toBe(500);
      expect(await response.json()).toEqual({
        message: 'Error fetching user profile',
      });
      expect(console.error).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        ...(usersError
          ? ['Error fetching user profile:', { code: 'X' }]
          : [
              'Error fetching user private profile details:',
              { error: 'm', userId: h.user.id },
            ])
      );
    }
  );
});

describe('GET /api/v1/users/me/configs/:configId', () => {
  it('returns the stored value or null', async () => {
    h.from.mockReturnValue(fakeQuery({ data: { value: 'dark' }, error: null }));
    const found = await call(getConfig, '/x', { configId: 'SORBET_THEME' });
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ value: 'dark' });

    h.from.mockReturnValue(fakeQuery({ data: null, error: null }));
    const missing = await call(getConfig, '/x', { configId: 'SORBET_THEME' });
    expect(await missing.json()).toEqual({ value: null });
  });

  it('returns 500 on a read error', async () => {
    h.from.mockReturnValue(fakeQuery({ data: null, error: { code: 'X' } }));
    const response = await call(getConfig, '/x', { configId: 'SORBET_THEME' });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching user config',
    });
    expect(console.error).toHaveBeenCalledWith('Error fetching user config:', {
      code: 'X',
    });
  });

  it('returns 403 for the version badge outside Tuturuuu staff, before any read', async () => {
    const response = await call(getConfig, '/x', {
      configId: 'SHOW_VERSION_BADGE',
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ message: 'Forbidden' });
    expect(h.from).not.toHaveBeenCalled();
  });
});

describe('GET /api/v1/user/onboarding-progress', () => {
  it('returns the row, or null when there is none', async () => {
    h.from.mockReturnValue(
      fakeQuery({ data: { user_id: 'u', current_step: 2 }, error: null })
    );
    const found = await call(getOnboarding, '/x');
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ user_id: 'u', current_step: 2 });

    h.from.mockReturnValue(fakeQuery({ data: null, error: null }));
    expect(await (await call(getOnboarding, '/x')).json()).toBeNull();
  });

  it('returns 500 on a read error', async () => {
    h.from.mockReturnValue(fakeQuery({ data: null, error: { code: 'X' } }));
    const response = await call(getOnboarding, '/x');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Failed to fetch onboarding progress',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Error fetching onboarding progress:',
      { code: 'X' }
    );
  });
});

describe('GET /api/v1/users/me/hidden-workspaces', () => {
  const url = (actor: string) =>
    `/api/v1/users/me/hidden-workspaces?expectedActorId=${actor}`;

  it('returns 409 with private, no-store for another actor', async () => {
    const response = await call(
      getHidden,
      url('00000000-0000-4000-8000-0000000000ff')
    );
    expect(response.status).toBe(409);
    expect(cache(response)).toBe('private, no-store');
    expect(await response.json()).toEqual({ message: 'Account changed' });
  });

  it('returns member and guest hidden ids, de-duplicated, private, no-store', async () => {
    h.from.mockImplementation((table: string) =>
      table === 'user_workspace_configs'
        ? fakeQuery({ data: [{ ws_id: WS }], error: null })
        : fakeQuery({
            data: [
              { id: `HIDDEN_WORKSPACE:${WS}` },
              { id: 'HIDDEN_WORKSPACE:not-a-uuid' },
            ],
            error: null,
          })
    );
    const response = await call(getHidden, url(h.user.id as string));
    expect(response.status).toBe(200);
    expect(cache(response)).toBe('private, no-store');
    expect(await response.json()).toEqual({ hiddenWorkspaceIds: [WS] });
  });

  it('returns 500 with private, no-store on a read error', async () => {
    h.from.mockReturnValue(fakeQuery({ data: null, error: { code: 'X' } }));
    const response = await call(getHidden, url(h.user.id as string));
    expect(response.status).toBe(500);
    expect(cache(response)).toBe('private, no-store');
    expect(await response.json()).toEqual({
      message: 'Unable to read Hidden workspaces',
    });
  });
});

describe('GET /api/workspaces/:wsId', () => {
  beforeEach(() => {
    h.normalize.mockImplementation(async (id: string) => id);
    h.admin.mockResolvedValue({
      from: () =>
        fakeQuery({ data: { id: WS, name: 'Guest WS' }, error: null }),
    });
  });
  const member = { id: WS, name: 'WS', workspace_members: [{ user_id: 'u' }] };

  it('returns the workspace without the membership join and with cache headers', async () => {
    h.from.mockReturnValue(fakeQuery({ data: member, error: null }));
    const response = await call(getWorkspace, '/x', { wsId: WS });
    expect(response.status).toBe(200);
    expect(cache(response)).toBe(
      'private, max-age=60, stale-while-revalidate=30'
    );
    expect(await response.json()).toEqual({ id: WS, name: 'WS' });
  });

  it('returns the guest shape for a board-share guest', async () => {
    h.from.mockReturnValue(
      fakeQuery({ data: null, error: { code: 'PGRST116' } })
    );
    h.guestShares.mockResolvedValue({ count: 2 });
    const response = await call(getWorkspace, '/x', { wsId: WS });
    expect(response.status).toBe(200);
    expect(cache(response)).toBe(
      'private, max-age=60, stale-while-revalidate=30'
    );
    expect(await response.json()).toEqual({
      id: WS,
      name: 'Guest WS',
      access_type: 'guest',
      guest_board_count: 2,
      guest_highest_permission: 'view',
      guest_landing_path: '/tasks',
      guest_products: ['tasks'],
    });
  });

  it('returns the same 500 when the workspace lookup itself fails', async () => {
    h.from.mockReturnValue(fakeQuery({ data: null, error: { code: 'XX000' } }));
    h.guestShares.mockResolvedValue({ count: 0 });
    const response = await call(getWorkspace, '/x', { wsId: WS });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching workspaces',
    });
  });

  it('returns 500 when a guest workspace read fails', async () => {
    h.from.mockReturnValue(
      fakeQuery({ data: null, error: { code: 'PGRST116' } })
    );
    h.guestShares.mockResolvedValue({ count: 2 });
    h.admin.mockResolvedValue({
      from: () => fakeQuery({ data: null, error: { code: 'XX000' } }),
    });
    const response = await call(getWorkspace, '/x', { wsId: WS });
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      message: 'Error fetching workspaces',
    });
  });

  it('keeps returning 500 for a non-member without a guest share', async () => {
    h.from.mockReturnValue(
      fakeQuery({ data: null, error: { code: 'PGRST116' } })
    );
    h.guestShares.mockResolvedValue({ count: 0 });
    const response = await call(getWorkspace, '/x', { wsId: WS });
    expect(response.status).toBe(500);
    expect(cache(response)).toBeNull();
    expect(await response.json()).toEqual({
      message: 'Error fetching workspaces',
    });
  });
});

describe('GET /api/v1/notifications/unread-count', () => {
  beforeEach(() => {
    h.unreadAccess.mockResolvedValue({});
  });
  const admin = (count: number | null, error: unknown = null) =>
    h.admin.mockResolvedValue({
      from: () => fakeQuery({ data: null, error, ...{ count } } as never),
    });

  it('returns the count', async () => {
    h.admin.mockResolvedValue({
      from: () => fakeQuery({ count: 4, data: null, error: null } as never),
    });
    const response = await call(getUnread, '/x');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ count: 4 });
  });

  it('returns 0 when the count is empty', async () => {
    admin(null);
    expect(await (await call(getUnread, '/x')).json()).toEqual({ count: 0 });
  });

  it('returns 400 for an invalid workspace id', async () => {
    const response = await call(getUnread, '/x?wsId=nope');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: 'Invalid query parameters',
    });
  });

  it('returns 403 for a workspace the caller is not a member of', async () => {
    admin(0);
    h.membership.mockResolvedValue({ ok: false, error: 'membership_missing' });
    const response = await call(getUnread, `/x?wsId=${WS}`);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: 'Access denied to workspace',
    });
  });

  it('returns 500 when membership cannot be verified', async () => {
    admin(0);
    h.membership.mockResolvedValue({
      ok: false,
      error: 'membership_lookup_failed',
    });
    const response = await call(getUnread, `/x?wsId=${WS}`);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to verify workspace access',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Error checking workspace membership:',
      'membership_lookup_failed'
    );
  });

  it('returns 500 on a count error', async () => {
    admin(null, { code: 'X' });
    const response = await call(getUnread, '/x');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to fetch unread count',
    });
    expect(console.error).toHaveBeenCalledWith('Error fetching unread count:', {
      code: 'X',
    });
  });

  it('returns 500 when the notification access lookup throws', async () => {
    admin(0);
    h.unreadAccess.mockRejectedValue(new Error('lookup failed'));
    const response = await call(getUnread, '/x');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledWith(
      'Error in unread count API:',
      expect.any(Error)
    );
  });
});

describe('GET /api/workspaces/invitations', () => {
  beforeEach(() => h.admin.mockResolvedValue({}));

  it('returns invitations with private, no-store', async () => {
    h.invitations.mockResolvedValue([{ source: 'direct' }]);
    const response = await call(getInvitations, '/x');
    expect(response.status).toBe(200);
    expect(cache(response)).toBe('private, no-store');
    expect(await response.json()).toEqual({
      invitations: [{ source: 'direct' }],
    });
    expect(h.invitations).toHaveBeenCalledWith(
      {},
      {
        authEmail: 'member@example.test',
        userId: h.user.id,
      }
    );
  });

  it('returns the lookup failure code', async () => {
    h.invitations.mockRejectedValue(new Error('boom'));
    const response = await call(getInvitations, '/x');
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: 'Failed to list workspace invitations',
      errorCode: 'WORKSPACE_INVITATIONS_LOOKUP_FAILED',
    });
    expect(console.error).toHaveBeenCalledWith(
      'Failed to list workspace invitations:',
      { error: expect.any(Error), userId: h.user.id }
    );
  });
});

describe('GET /api/v1/workspaces', () => {
  it('lists summaries for the caller with the parsed search options', async () => {
    h.summaries.mockResolvedValue([{ id: WS }]);
    const response = await call(getWorkspaces, '/x?q=%20ab%20&limit=500');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual([{ id: WS }]);
    expect(h.summaries).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 100,
        query: 'ab',
        requireAuth: true,
        userId: h.user.id,
      })
    );
  });

  it('maps the unauthorized sentinel to 401 and other errors to 500', async () => {
    h.summaries.mockRejectedValueOnce(
      new Error('WORKSPACE_SUMMARY_UNAUTHORIZED')
    );
    const unauthorized = await call(getWorkspaces, '/x');
    expect(unauthorized.status).toBe(401);
    expect(await unauthorized.json()).toEqual({ error: 'Unauthorized' });

    h.summaries.mockRejectedValueOnce(new Error('boom'));
    const failed = await call(getWorkspaces, '/x');
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'Internal server error' });
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith(
      'Error in workspaces API:',
      expect.any(Error)
    );
  });
});
