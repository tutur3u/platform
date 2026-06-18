import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const createAdminClientMock = vi.fn();
const fetchRequireAttentionUserIdsMock = vi.fn();
const serverLoggerErrorMock = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: (...args: Parameters<typeof createAdminClientMock>) =>
    createAdminClientMock(...args),
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => {
    throw new Error('not-found');
  }),
}));

vi.mock('@/lib/require-attention-users', () => ({
  fetchRequireAttentionUserIds: (
    ...args: Parameters<typeof fetchRequireAttentionUserIdsMock>
  ) => fetchRequireAttentionUserIdsMock(...args),
}));

vi.mock('@/lib/user-referrals', () => ({
  listAvailableReferralUsers: vi.fn(),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof serverLoggerErrorMock>) =>
      serverLoggerErrorMock(...args),
  },
}));

import {
  getGroupData,
  getUserDetailData,
  loadOptionalUserDetailResource,
} from './data';

function createGroupQuery(result: {
  count: number | null;
  data: unknown[];
  error: unknown;
}) {
  const query = {
    eq: vi.fn(() => query),
    order: vi.fn().mockResolvedValue(result),
    select: vi.fn(() => query),
  };

  return query;
}

describe('user detail data loaders', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchRequireAttentionUserIdsMock.mockResolvedValue(new Set());
  });

  it('uses the explicit workspace group membership FK when loading groups', async () => {
    const groupQuery = createGroupQuery({
      data: [
        {
          id: 'group-1',
          name: 'Group 1',
          workspace_user_groups_users: [
            {
              role: 'STUDENT',
              user_id: 'user-1',
            },
          ],
        },
      ],
      count: 1,
      error: null,
    });
    const fromMock = vi.fn((table: string) => {
      if (table !== 'workspace_user_groups') {
        throw new Error(`Unexpected table lookup: ${table}`);
      }

      return groupQuery;
    });
    const privateSessionsQuery = {
      eq: vi.fn(() => privateSessionsQuery),
      in: vi.fn(() => privateSessionsQuery),
      order: vi.fn().mockResolvedValue({
        data: [
          {
            group_id: 'group-1',
            starts_at: '2026-01-12T00:00:00.000Z',
          },
        ],
        error: null,
      }),
      select: vi.fn(() => privateSessionsQuery),
    };
    const privateFromMock = vi.fn((table: string) => {
      if (table !== 'workspace_user_group_sessions') {
        throw new Error(`Unexpected private table lookup: ${table}`);
      }
      return privateSessionsQuery;
    });

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
      schema: vi.fn(() => ({
        from: privateFromMock,
      })),
    });

    await expect(
      getGroupData({ wsId: 'ws-1', userId: 'user-1' })
    ).resolves.toMatchObject({
      count: 1,
      data: [
        {
          id: 'group-1',
          sessions: ['2026-01-12'],
          workspace_user_groups_users: [
            {
              user_id: 'user-1',
            },
          ],
        },
      ],
    });

    expect(fromMock).toHaveBeenCalledWith('workspace_user_groups');
    expect(groupQuery.select).toHaveBeenCalledWith(
      'id, name, starting_date, ending_date, workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, role)',
      {
        count: 'exact',
      }
    );
    expect(groupQuery.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
    expect(groupQuery.eq).toHaveBeenCalledWith(
      'workspace_user_groups_users.user_id',
      'user-1'
    );
    expect(groupQuery.order).toHaveBeenCalledWith('name', {
      ascending: true,
    });
  });

  it('keeps primary user details loadable when require-attention lookup fails', async () => {
    fetchRequireAttentionUserIdsMock.mockRejectedValue(
      new Error('missing require-attention rpc')
    );
    const rpcMock = vi.fn().mockResolvedValue({
      data: {
        id: 'user-1',
        full_name: 'Alice Nguyen',
        display_name: 'Alice',
        avatar_url: null,
        email: 'alice@example.com',
        phone: null,
        birthday: null,
        gender: null,
        ethnicity: null,
        guardian: null,
        national_id: null,
        address: null,
        note: null,
        archived: false,
        archived_until: null,
        created_at: null,
        updated_at: null,
        group_count: 0,
        linked_users: [],
        referrer: null,
      },
      error: null,
    });

    createAdminClientMock.mockResolvedValue({
      rpc: rpcMock,
    });

    await expect(
      getUserDetailData({
        wsId: 'ws-1',
        userId: 'user-1',
        hasPrivateInfo: true,
        hasPublicInfo: true,
      })
    ).resolves.toMatchObject({
      display_name: 'Alice',
      full_name: 'Alice Nguyen',
      has_require_attention_feedback: false,
      id: 'user-1',
    });

    expect(serverLoggerErrorMock).toHaveBeenCalledWith(
      'Failed to load user detail require-attention flags',
      expect.objectContaining({
        loader: 'getUserDetailData',
        userId: 'user-1',
        wsId: 'ws-1',
      }),
      expect.any(Error)
    );
  });

  it('logs and falls back when an optional detail resource fails', async () => {
    await expect(
      loadOptionalUserDetailResource({
        fallback: { count: 0, data: [] },
        loader: async () => {
          throw new Error('reports unavailable');
        },
        name: 'reports',
        userId: 'user-1',
        wsId: 'ws-1',
      })
    ).resolves.toEqual({ count: 0, data: [] });

    expect(serverLoggerErrorMock).toHaveBeenCalledWith(
      'Failed to load user detail resource',
      expect.objectContaining({
        resource: 'reports',
        userId: 'user-1',
        wsId: 'ws-1',
      }),
      expect.any(Error)
    );
  });
});
