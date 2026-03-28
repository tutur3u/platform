import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const workspacesEq = vi.fn();
  const usersMaybeSingle = vi.fn();
  const privateDetailsMaybeSingle = vi.fn();

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
      if (table !== 'workspaces') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: workspacesEq,
        })),
      };
    }),
  };

  return {
    adminSupabase,
    getUser,
    privateDetailsMaybeSingle,
    sessionSupabase,
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
        id: 'personal-ws',
        name: 'Alex Nguyen',
        avatar_url: 'https://example.com/alex.png',
        tier: 'PLUS',
        created_by_me: true,
      }),
      expect.objectContaining({
        id: 'team-ws',
        name: 'Product',
        tier: 'PRO',
        created_by_me: false,
      }),
    ]);
  });
});
