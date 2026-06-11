import { beforeEach, describe, expect, it, vi } from 'vitest';

const createAdminClientMock = vi.fn();

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
  fetchRequireAttentionUserIds: vi.fn().mockResolvedValue(new Set()),
}));

vi.mock('@/lib/user-referrals', () => ({
  listAvailableReferralUsers: vi.fn(),
}));

import { getGroupData } from './data';

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
  });

  it('uses the explicit workspace group membership FK when loading groups', async () => {
    const groupQuery = createGroupQuery({
      data: [
        {
          id: 'group-1',
          name: 'Group 1',
          sessions: [],
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

    createAdminClientMock.mockResolvedValue({
      from: fromMock,
    });

    await expect(
      getGroupData({ wsId: 'ws-1', userId: 'user-1' })
    ).resolves.toMatchObject({
      count: 1,
      data: [
        {
          id: 'group-1',
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
      'id, name, sessions, starting_date, ending_date, workspace_user_groups_users!workspace_user_roles_users_role_id_fkey!inner(user_id, role)',
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
});
