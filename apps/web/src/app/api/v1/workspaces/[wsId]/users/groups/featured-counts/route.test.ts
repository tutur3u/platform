import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const serverLoggerErrorMock = vi.fn();
const serverLoggerWarnMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof getPermissionsMock>) =>
    getPermissionsMock(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof serverLoggerErrorMock>) =>
      serverLoggerErrorMock(...args),
    warn: (...args: Parameters<typeof serverLoggerWarnMock>) =>
      serverLoggerWarnMock(...args),
  },
  withRequestLogDrain: (_options: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

import { POST } from './route';

describe('featured group counts route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => true,
    });
  });

  it('accepts large group filters from a POST body', async () => {
    const featuredGroupIds = Array.from(
      { length: 20 },
      (_, index) => `featured-group-${index + 1}`
    );
    const excludedGroups = Array.from(
      { length: 30 },
      (_, index) => `excluded-group-${index + 1}`
    );
    const rpcMock = vi.fn().mockResolvedValue({
      data: [{ group_id: featuredGroupIds[0], user_count: 12 }],
      error: null,
    });

    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/groups/featured-counts',
        {
          body: JSON.stringify({
            excludedGroups,
            featuredGroupIds,
            linkStatus: 'linked',
            q: 'alice',
            status: 'active',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith('get_featured_group_counts', {
      _excluded_groups: excludedGroups,
      _featured_group_ids: featuredGroupIds,
      _link_status: 'linked',
      _search_query: 'alice',
      _status: 'active',
      _ws_id: 'ws-1',
    });
    await expect(response.json()).resolves.toEqual({
      [featuredGroupIds[0] as string]: 12,
    });
  });
});
