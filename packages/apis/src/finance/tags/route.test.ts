import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const getPermissions = vi.fn();
  const normalizeWorkspaceId = vi.fn();
  const tagOrder = vi.fn();

  const sessionSupabase = {};
  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'transaction_tags') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            order: tagOrder,
          })),
        })),
      };
    }),
  };

  return {
    adminSupabase,
    getPermissions,
    normalizeWorkspaceId,
    sessionSupabase,
    tagOrder,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
  normalizeWorkspaceId: (
    ...args: Parameters<typeof mocks.normalizeWorkspaceId>
  ) => mocks.normalizeWorkspaceId(...args),
}));

describe('finance tags route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.normalizeWorkspaceId.mockResolvedValue('ws-1');
    mocks.tagOrder.mockResolvedValue({
      data: [
        {
          id: 'tag-1',
          name: 'Bills',
          color: '#ff0000',
          description: 'Monthly bills',
          ws_id: 'ws-1',
          wallet_transaction_tags: [
            {
              transaction_id: 'tx-1',
              wallet_transactions: {
                amount: -250,
                wallet_id: 'wallet-1',
              },
            },
            {
              transaction_id: 'tx-2',
              wallet_transactions: {
                amount: 100,
                wallet_id: 'wallet-1',
              },
            },
          ],
        },
      ],
      error: null,
    });
  });

  it('returns tags enriched with aggregate amount and transaction count', async () => {
    const { GET } = await import('./route.js');

    const response = await GET(
      new Request('http://localhost/api/workspaces/ws-1/tags'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        id: 'tag-1',
        name: 'Bills',
        color: '#ff0000',
        description: 'Monthly bills',
        ws_id: 'ws-1',
        amount: 350,
        transaction_count: 2,
      },
    ]);
  });
});
