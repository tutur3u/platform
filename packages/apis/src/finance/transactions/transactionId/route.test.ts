import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const verifyWorkspaceSingle = vi.fn();
  const confidentialSingle = vi.fn();
  const deleteEq = vi.fn();
  const getPermissions = vi.fn();

  const sessionSupabase = {
    auth: {
      getUser: vi.fn(),
    },
    from: vi.fn(),
    rpc: vi.fn(),
  };

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table !== 'wallet_transactions') {
        throw new Error(`Unexpected admin table: ${table}`);
      }

      return {
        select: vi.fn((query: string) => {
          if (query.includes('workspace_wallets!wallet_id')) {
            return {
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: verifyWorkspaceSingle,
                })),
              })),
            };
          }

          return {
            eq: vi.fn(() => ({
              single: confidentialSingle,
            })),
          };
        }),
        delete: vi.fn(() => ({
          eq: deleteEq,
        })),
      };
    }),
  };

  return {
    adminSupabase,
    confidentialSingle,
    deleteEq,
    getPermissions,
    sessionSupabase,
    verifyWorkspaceSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
  createClient: vi.fn(() => Promise.resolve(mocks.sessionSupabase)),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: (...args: Parameters<typeof mocks.getPermissions>) =>
    mocks.getPermissions(...args),
}));

describe('transaction detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.getPermissions.mockResolvedValue({
      withoutPermission: vi.fn(() => false),
    });
    mocks.verifyWorkspaceSingle.mockResolvedValue({
      data: {
        id: '8206f54b-4cae-4373-9a89-d09f80dd017d',
        workspace_wallets: {
          ws_id: '00000000-0000-0000-0000-000000000000',
        },
      },
      error: null,
    });
    mocks.confidentialSingle.mockResolvedValue({
      data: {
        is_amount_confidential: false,
        is_description_confidential: false,
        is_category_confidential: false,
      },
      error: null,
    });
    mocks.deleteEq.mockResolvedValue({
      error: null,
    });
  });

  it('deletes transactions through sbAdmin instead of the request client', async () => {
    const { DELETE } = await import('./route.js');

    const response = await DELETE(
      new Request('http://localhost/api/workspaces/ws-1/transactions/tx-1'),
      {
        params: Promise.resolve({
          transactionId: '8206f54b-4cae-4373-9a89-d09f80dd017d',
          wsId: '00000000-0000-0000-0000-000000000000',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: 'success' });
    expect(mocks.sessionSupabase.from).not.toHaveBeenCalled();
    expect(mocks.adminSupabase.from).toHaveBeenCalledWith(
      'wallet_transactions'
    );
    expect(mocks.deleteEq).toHaveBeenCalledWith(
      'id',
      '8206f54b-4cae-4373-9a89-d09f80dd017d'
    );
  });
});
