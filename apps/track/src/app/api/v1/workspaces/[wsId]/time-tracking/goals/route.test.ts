import {
  createAppSessionToken,
  verifyAppSessionToken,
} from '@tuturuuu/auth/app-session';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  resolveSessionAuthContext: vi.fn(),
  sessionSupabase: {},
  verifyWorkspaceMembershipType: vi.fn(),
}));

vi.mock('@/lib/api-auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api-auth')>();
  return {
    ...actual,
    resolveSessionAuthContext: (
      ...args: Parameters<typeof mocks.resolveSessionAuthContext>
    ) => mocks.resolveSessionAuthContext(...args),
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/workspace-helper')>();
  return {
    ...actual,
    getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
      mocks.getPermissions(...args),
    normalizeWorkspaceId: (
      ...args: Parameters<typeof mocks.normalizeWorkspaceId>
    ) => mocks.normalizeWorkspaceId(...args),
    verifyWorkspaceMembershipType: (
      ...args: Parameters<typeof mocks.verifyWorkspaceMembershipType>
    ) => mocks.verifyWorkspaceMembershipType(...args),
  };
});

function createGoalsQuery() {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn(async () => ({ data: [], error: null })),
    select: vi.fn(() => query),
  };
  return query;
}

function createRequest(userId = 'user-1') {
  return new NextRequest(
    `http://localhost/api/v1/workspaces/ws-1/time-tracking/goals?userId=${userId}`
  );
}

async function callGet(userId = 'user-1') {
  const { GET } = await import('./route');
  return GET(createRequest(userId), {
    params: Promise.resolve({ wsId: 'ws-1' }),
  });
}

describe('time tracking goals route cross-user authorization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('TUTURUUU_APP_COORDINATION_SECRET', 'test-only-secret');

    mocks.resolveSessionAuthContext.mockResolvedValue({
      ok: true,
      supabase: mocks.sessionSupabase,
      user: { id: 'user-1' },
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.verifyWorkspaceMembershipType.mockResolvedValue({ ok: true });
  });

  it('keeps cookie-session self reads available without management permission', async () => {
    const goalsQuery = createGoalsQuery();
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => goalsQuery),
    });

    const response = await callGet();

    expect(response.status).toBe(200);
    expect(mocks.getPermissions).not.toHaveBeenCalled();
    expect(goalsQuery.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('denies an ordinary member before any admin goal read', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => true),
    });

    const response = await callGet('user-2');

    expect(response.status).toBe(403);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledTimes(1);
  });

  it('allows an authorized manager to read another member goals', async () => {
    const withoutPermission = vi.fn(() => false);
    mocks.getPermissions.mockResolvedValue({ withoutPermission });
    const goalsQuery = createGoalsQuery();
    mocks.createAdminClient.mockResolvedValue({
      from: vi.fn(() => goalsQuery),
    });

    const response = await callGet('user-2');

    expect(response.status).toBe(200);
    expect(withoutPermission).toHaveBeenCalledWith(
      'manage_time_tracking_requests'
    );
    expect(mocks.verifyWorkspaceMembershipType).toHaveBeenCalledTimes(2);
    expect(goalsQuery.eq).toHaveBeenCalledWith('user_id', 'user-2');
  });

  it('returns 404 for a target outside the workspace without an admin read', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false });

    const response = await callGet('user-2');

    expect(response.status).toBe(404);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 500 when permission resolution fails without an admin read', async () => {
    mocks.getPermissions.mockResolvedValue(null);

    const response = await callGet('user-2');

    expect(response.status).toBe(500);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns 500 when target membership resolution fails without an admin read', async () => {
    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.verifyWorkspaceMembershipType
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        error: 'membership_lookup_failed',
        ok: false,
      });

    const response = await callGet('user-2');

    expect(response.status).toBe(500);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it.each(['track', 'calendar'])(
    'accepts the %s app-session audience for time-tracking routes',
    async (targetApp) => {
      const { getDefaultAppSessionVerificationOptions } = await import(
        '@/lib/api-auth'
      );
      const options = getDefaultAppSessionVerificationOptions(
        'http://localhost/api/v1/workspaces/ws-1/time-tracking/goals'
      );
      const { token } = createAppSessionToken({
        targetApp,
        userId: 'user-1',
      });

      expect(verifyAppSessionToken(token, options).ok).toBe(true);
    }
  );

  it('denies an unrelated app-session audience for time-tracking routes', async () => {
    const { getDefaultAppSessionVerificationOptions } = await import(
      '@/lib/api-auth'
    );
    const options = getDefaultAppSessionVerificationOptions(
      'http://localhost/api/v1/workspaces/ws-1/time-tracking/goals'
    );
    const { token } = createAppSessionToken({
      targetApp: 'chat',
      userId: 'user-1',
    });

    expect(verifyAppSessionToken(token, options).ok).toBe(false);
  });
});
