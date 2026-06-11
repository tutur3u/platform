import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();
const getPermissionsMock = vi.fn();
const serverLoggerErrorMock = vi.fn();

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
  },
  withRequestLogDrain: (_options: unknown, handler: () => Promise<Response>) =>
    handler(),
}));

import { POST } from './route';

describe('possible excluded user groups route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPermissionsMock.mockResolvedValue({
      containsPermission: () => true,
    });
  });

  it('accepts large included group filters from a POST body', async () => {
    const includedGroups = Array.from(
      { length: 70 },
      (_, index) => `included-group-${index + 1}`
    );
    const queryBuilder = {
      ilike: vi.fn(() => queryBuilder),
      order: vi.fn(() => queryBuilder),
      range: vi.fn().mockResolvedValue({
        count: 0,
        data: [],
        error: null,
      }),
      select: vi.fn(() => queryBuilder),
    };
    const rpcMock = vi.fn(() => queryBuilder);

    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/users/groups/possible-excluded',
        {
          body: JSON.stringify({
            includedGroups,
            page: 2,
            pageSize: 50,
            paginated: true,
            q: 'alice',
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
    expect(rpcMock).toHaveBeenCalledWith(
      'get_possible_excluded_groups',
      {
        _ws_id: 'ws-1',
        included_groups: includedGroups,
      },
      {
        count: 'exact',
      }
    );
    expect(queryBuilder.ilike).toHaveBeenCalledWith('name', '%alice%');
    expect(queryBuilder.range).toHaveBeenCalledWith(50, 99);
    await expect(response.json()).resolves.toMatchObject({
      count: 0,
      data: [],
      pageSize: 50,
    });
  });
});
