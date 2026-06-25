import { createClient } from '@tuturuuu/supabase/next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const workspacesEq = vi.fn();
  const usersMaybeSingle = vi.fn();
  const privateDetailsMaybeSingle = vi.fn();
  const taskBoardShareResults: Array<{ data: unknown; error: unknown }> = [];

  function createThenableQuery(result: { data: unknown; error: unknown }) {
    const query = {
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      select: vi.fn(() => query),
    };
    Object.defineProperty(query, 'then', {
      value: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown
      ) => Promise.resolve(result).then(resolve, reject),
    });

    return query;
  }

  const sessionSupabase = {
    auth: {
      getUser,
    },
    from: vi.fn((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: usersMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'user_private_details') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: privateDetailsMaybeSingle,
            })),
          })),
        };
      }

      throw new Error(`Unexpected session table: ${table}`);
    }),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspaces') {
        return {
          select: vi.fn(() => ({
            eq: workspacesEq,
          })),
        };
      }

      if (table === 'task_board_shares') {
        return createThenableQuery(
          taskBoardShareResults.shift() ?? { data: [], error: null }
        );
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    getUser,
    privateDetailsMaybeSingle,
    sessionSupabase,
    taskBoardShareResults,
    usersMaybeSingle,
    workspacesEq,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

describe('fetchWorkspaceSummaries', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.taskBoardShareResults.length = 0;
    mocks.getUser.mockResolvedValue({
      data: {
        user: {
          id: 'user-1',
        },
      },
    });
    mocks.usersMaybeSingle.mockResolvedValue({
      data: {
        display_name: 'Alex Nguyen',
        handle: 'alex',
        avatar_url: 'https://example.com/alex.png',
      },
    });
    mocks.privateDetailsMaybeSingle.mockResolvedValue({
      data: {
        email: 'alex@example.com',
      },
    });
  });

  it('uses the latest active subscription tier and personal profile overrides', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [
        {
          id: 'personal-ws',
          name: 'Personal',
          personal: true,
          avatar_url: 'legacy.png',
          logo_url: null,
          creator_id: 'user-1',
          workspace_members: [{ user_id: 'user-1' }],
          workspace_subscriptions: [
            {
              created_at: '2026-03-01T00:00:00.000Z',
              status: 'active',
              workspace_subscription_products: { tier: 'FREE' },
            },
            {
              created_at: '2026-03-20T00:00:00.000Z',
              status: 'active',
              workspace_subscription_products: { tier: 'PLUS' },
            },
          ],
        },
        {
          id: 'team-ws',
          name: 'Product',
          personal: false,
          avatar_url: null,
          logo_url: null,
          creator_id: 'owner-2',
          workspace_members: [{ user_id: 'user-1' }],
          workspace_subscriptions: [
            {
              created_at: '2026-03-25T00:00:00.000Z',
              status: 'inactive',
              workspace_subscription_products: { tier: 'ENTERPRISE' },
            },
            {
              created_at: '2026-03-10T00:00:00.000Z',
              status: 'active',
              workspace_subscription_products: { tier: 'PRO' },
            },
          ],
        },
      ],
      error: null,
    });

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    const workspaces = await fetchWorkspaceSummaries();

    expect(workspaces).toEqual([
      expect.objectContaining({
        access_type: 'member',
        id: 'personal-ws',
        name: 'Alex Nguyen',
        avatar_url: 'https://example.com/alex.png',
        tier: 'PLUS',
        created_by_me: true,
      }),
      expect.objectContaining({
        access_type: 'member',
        id: 'team-ws',
        name: 'Product',
        tier: 'PRO',
        created_by_me: false,
      }),
    ]);
  });

  it('includes direct board guest workspaces without adding them as member workspaces', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.taskBoardShareResults.push(
      {
        data: [
          {
            board_id: 'board-1',
            permission: 'edit',
            workspace_boards: {
              id: 'board-1',
              ws_id: 'guest-ws',
              workspaces: {
                id: 'guest-ws',
                name: 'Shared workspace',
                personal: false,
                avatar_url: null,
                logo_url: null,
                creator_id: 'owner-1',
                workspace_subscriptions: [
                  {
                    created_at: '2026-03-10T00:00:00.000Z',
                    status: 'active',
                    workspace_subscription_products: { tier: 'PRO' },
                  },
                ],
              },
            },
          },
        ],
        error: null,
      },
      { data: [], error: null }
    );

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    await expect(fetchWorkspaceSummaries()).resolves.toEqual([
      expect.objectContaining({
        access_type: 'guest',
        guest_board_count: 1,
        guest_highest_permission: 'edit',
        guest_landing_path: '/tasks/boards/board-1',
        guest_products: ['tasks'],
        id: 'guest-ws',
        name: 'Shared workspace',
        tier: 'PRO',
      }),
    ]);
  });

  it('keeps shared personal guest workspaces distinct from the current user profile', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [],
      error: null,
    });
    mocks.taskBoardShareResults.push(
      {
        data: [
          {
            board_id: 'board-1',
            permission: 'view',
            workspace_boards: {
              id: 'board-1',
              ws_id: 'owner-personal-ws',
              workspaces: {
                id: 'owner-personal-ws',
                name: 'Minh Personal',
                personal: true,
                avatar_url: 'https://example.com/minh.png',
                logo_url: null,
                creator_id: 'owner-1',
                workspace_subscriptions: [],
              },
            },
          },
        ],
        error: null,
      },
      { data: [], error: null }
    );

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    await expect(fetchWorkspaceSummaries()).resolves.toEqual([
      expect.objectContaining({
        access_type: 'guest',
        avatar_url: 'https://example.com/minh.png',
        guest_products: ['tasks'],
        id: 'owner-personal-ws',
        name: 'Minh Personal',
        personal: true,
      }),
    ]);
  });

  it('forwards request headers to createClient when provided', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [],
      error: null,
    });

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    const request = new Request('https://example.com/api/v1/workspaces', {
      headers: {
        Authorization: 'Bearer test-token',
      },
    });

    await fetchWorkspaceSummaries({ request });

    expect(createClient).toHaveBeenCalledWith(request);
  });

  it('uses a provided authenticated user without resolving Supabase auth again', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [],
      error: null,
    });

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    await fetchWorkspaceSummaries({
      supabase: mocks.sessionSupabase as never,
      userId: 'app-session-user',
    });

    expect(createClient).not.toHaveBeenCalled();
    expect(mocks.getUser).not.toHaveBeenCalled();
    expect(mocks.workspacesEq).toHaveBeenCalledWith(
      'workspace_members.user_id',
      'app-session-user'
    );
  });

  it('ranks workspace summaries with fuzzy search and applies the requested limit', async () => {
    mocks.workspacesEq.mockResolvedValue({
      data: [
        {
          id: 'alpha-ws',
          name: 'Alpha Workspace',
          personal: false,
          avatar_url: null,
          logo_url: null,
          creator_id: 'owner-2',
          workspace_members: [{ user_id: 'user-1' }],
          workspace_subscriptions: [],
        },
        {
          id: 'zeta-ws',
          name: 'Zeta Operations',
          personal: false,
          avatar_url: null,
          logo_url: null,
          creator_id: 'owner-3',
          workspace_members: [{ user_id: 'user-1' }],
          workspace_subscriptions: [],
        },
        {
          id: 'beta-ws',
          name: 'Beta Support',
          personal: false,
          avatar_url: null,
          logo_url: null,
          creator_id: 'owner-4',
          workspace_members: [{ user_id: 'user-1' }],
          workspace_subscriptions: [],
        },
      ],
      error: null,
    });

    const { fetchWorkspaceSummaries } = await import(
      '@tuturuuu/ui/lib/workspace-actions'
    );

    await expect(
      fetchWorkspaceSummaries({ limit: 1, query: 'zeta' })
    ).resolves.toEqual([
      expect.objectContaining({
        id: 'zeta-ws',
        name: 'Zeta Operations',
      }),
    ]);
  });
});
