import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const linkedUserMaybeSingle = vi.fn();
  const transactionMaybeSingle = vi.fn();

  const adminSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'wallet_transactions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: transactionMaybeSingle,
            })),
          })),
        };
      }

      if (table === 'workspace_user_linked_users') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: linkedUserMaybeSingle,
              })),
            })),
          })),
        };
      }

      throw new Error(`Unexpected admin table: ${table}`);
    }),
  };

  return {
    adminSupabase,
    linkedUserMaybeSingle,
    transactionMaybeSingle,
  };
});

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(() => Promise.resolve(mocks.adminSupabase)),
}));

function createPermissions(granted: string[]) {
  return {
    containsPermission: vi.fn((permission: string) =>
      granted.includes(permission)
    ),
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  };
}

describe('finance transaction storage access', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.transactionMaybeSingle.mockResolvedValue({
      data: {
        creator_id: 'virtual-user-1',
        workspace_wallets: {
          ws_id: 'ws-1',
        },
      },
      error: null,
    });
    mocks.linkedUserMaybeSingle.mockResolvedValue({
      data: {
        virtual_user_id: 'virtual-user-1',
      },
      error: null,
    });
  });

  it('ignores paths outside finance transaction storage', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './finance-transaction-storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'drive/file.txt',
        permissions: createPermissions(['view_transactions']) as never,
        userId: 'user-1',
      })
    ).resolves.toBe(false);

    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
  });

  it('allows transaction viewers to read files in the same workspace', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './finance-transaction-storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        permissions: createPermissions(['view_transactions']) as never,
        userId: 'user-1',
      })
    ).resolves.toBe(true);
  });

  it('allows transaction creators to attach files to their own transaction', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './finance-transaction-storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'write',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1',
        permissions: createPermissions(['create_transactions']) as never,
        userId: 'user-1',
      })
    ).resolves.toBe(true);

    expect(mocks.linkedUserMaybeSingle).toHaveBeenCalled();
  });

  it('rejects files for transactions in another workspace', async () => {
    mocks.transactionMaybeSingle.mockResolvedValue({
      data: {
        creator_id: 'virtual-user-1',
        workspace_wallets: {
          ws_id: 'ws-2',
        },
      },
      error: null,
    });

    const { canAccessFinanceTransactionStoragePath } = await import(
      './finance-transaction-storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        permissions: createPermissions(['view_transactions']) as never,
        userId: 'user-1',
      })
    ).resolves.toBe(false);
  });
});
