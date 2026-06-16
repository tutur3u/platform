import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
  listHiveAccessRequests: vi.fn(),
  listHiveMembers: vi.fn(),
  resolveAuthenticatedSessionUser: vi.fn(),
  resolveWebHiveAccess: vi.fn(),
}));

vi.mock('server-only', () => ({}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: (
    ...args: Parameters<typeof mocks.resolveAuthenticatedSessionUser>
  ) => mocks.resolveAuthenticatedSessionUser(...args),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof mocks.createAdminClient>) =>
    mocks.createAdminClient(...args),
  createClient: (...args: Parameters<typeof mocks.createClient>) =>
    mocks.createClient(...args),
}));

vi.mock('@/lib/hive-page-context', () => ({
  resolveWebHiveAccess: (
    ...args: Parameters<typeof mocks.resolveWebHiveAccess>
  ) => mocks.resolveWebHiveAccess(...args),
}));

vi.mock('@/lib/hive/hive-db', () => ({
  listHiveAccessRequests: (
    ...args: Parameters<typeof mocks.listHiveAccessRequests>
  ) => mocks.listHiveAccessRequests(...args),
  listHiveMembers: (...args: Parameters<typeof mocks.listHiveMembers>) =>
    mocks.listHiveMembers(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('notFound');
  }),
}));

import { getHiveAccessState } from './data';

describe('getHiveAccessState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: {} });
    mocks.createAdminClient.mockResolvedValue({ from: vi.fn() });
    mocks.resolveAuthenticatedSessionUser.mockResolvedValue({
      user: { id: 'user-1' },
    });
  });

  it('does not read Hive member lists for non-Hive admins', async () => {
    const sbAdmin = { from: vi.fn() };
    mocks.createAdminClient.mockResolvedValue(sbAdmin);
    mocks.resolveWebHiveAccess.mockResolvedValue({
      hasAccess: true,
      isAdmin: false,
      isMember: true,
    });

    await expect(getHiveAccessState()).resolves.toEqual({
      available: false,
      members: [],
      requests: [],
    });

    expect(mocks.resolveWebHiveAccess).toHaveBeenCalledWith({
      sbAdmin,
      userId: 'user-1',
    });
    expect(mocks.listHiveMembers).not.toHaveBeenCalled();
    expect(mocks.listHiveAccessRequests).not.toHaveBeenCalled();
  });

  it('returns Hive member state for Hive admins', async () => {
    mocks.resolveWebHiveAccess.mockResolvedValue({
      hasAccess: true,
      isAdmin: true,
      isMember: true,
    });
    mocks.listHiveMembers.mockResolvedValue([
      {
        created_at: '2026-06-16T00:00:00.000Z',
        enabled: true,
        id: 'member-1',
        notes: 'Research admin',
        user_id: 'user-1',
      },
    ]);
    mocks.listHiveAccessRequests.mockResolvedValue([
      {
        created_at: '2026-06-16T00:01:00.000Z',
        email: 'requester@example.com',
        id: 'request-1',
        note: 'Need access',
        requested_at: '2026-06-16T00:01:00.000Z',
        resolution_note: null,
        resolved_at: null,
        resolved_by: null,
        status: 'pending',
        updated_at: '2026-06-16T00:01:00.000Z',
        user_id: 'user-2',
      },
    ]);

    await expect(getHiveAccessState()).resolves.toEqual({
      available: true,
      members: [
        {
          createdAt: '2026-06-16T00:00:00.000Z',
          enabled: true,
          id: 'member-1',
          notes: 'Research admin',
          userId: 'user-1',
        },
      ],
      requests: [
        {
          createdAt: '2026-06-16T00:01:00.000Z',
          email: 'requester@example.com',
          id: 'request-1',
          note: 'Need access',
          requestedAt: '2026-06-16T00:01:00.000Z',
          resolutionNote: null,
          resolvedAt: null,
          resolvedBy: null,
          status: 'pending',
          updatedAt: '2026-06-16T00:01:00.000Z',
          userId: 'user-2',
        },
      ],
    });

    expect(mocks.listHiveMembers).toHaveBeenCalledTimes(1);
    expect(mocks.listHiveAccessRequests).toHaveBeenCalledWith({
      status: 'pending',
    });
  });
});
