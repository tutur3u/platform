import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  getPermissions: vi.fn(),
  getUserGroupMemberships: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
  serverLogger: {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: mocks.getPermissions,
  normalizeWorkspaceId: mocks.normalizeWorkspaceId,
}));

vi.mock('@/app/[locale]/(dashboard)/[wsId]/users/groups/utils', () => ({
  fetchManagersForGroups: vi.fn(),
  getUserGroupMemberships: mocks.getUserGroupMemberships,
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: mocks.serverLogger,
}));

function request(search = '') {
  return new Request(`https://app.test/api${search}`);
}

function params() {
  return {
    params: Promise.resolve({
      groupId: 'group-1',
      wsId: 'ws-1',
    }),
  };
}

describe('group report dashboard route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.normalizeWorkspaceId.mockImplementation(async (wsId: string) => wsId);
  });

  it('returns a stable code for invalid query parameters', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      request(`?reportId=${'x'.repeat(300)}`),
      params()
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      code: 'REPORTS_INVALID_QUERY',
      message: 'Invalid query parameters',
    });
    expect(mocks.getPermissions).not.toHaveBeenCalled();
  });

  it('returns a stable code when report permissions are missing', async () => {
    const { GET } = await import('./route');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn(() => false),
    });

    const response = await GET(request(), params());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'REPORTS_PERMISSION_DENIED',
      message: 'Missing permission to view reports',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns a stable code when a non-manager cannot access the group', async () => {
    const { GET } = await import('./route');
    mocks.getPermissions.mockResolvedValue({
      containsPermission: vi.fn((permission: string) => {
        if (permission === 'view_user_groups_reports') return true;
        if (permission === 'manage_users') return false;
        return false;
      }),
    });
    mocks.getUserGroupMemberships.mockResolvedValue(['another-group']);

    const response = await GET(request(), params());

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'REPORTS_GROUP_FORBIDDEN',
      message: 'Missing access to this report group',
    });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });
});
