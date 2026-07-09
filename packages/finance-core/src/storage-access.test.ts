import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const linkedUserMaybeSingle = vi.fn();
  const rpc = vi.fn();
  const transactionMaybeSingle = vi.fn();
  const walletMaybeSingle = vi.fn();

  const privateSupabase = {
    from: vi.fn((table: string) => {
      if (table === 'workspace_wallets') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: walletMaybeSingle,
            })),
          })),
        };
      }

      throw new Error(`Unexpected private table: ${table}`);
    }),
  };

  const adminSupabase = {
    schema: vi.fn((schema: string) => {
      if (schema !== 'private') {
        throw new Error(`Unexpected admin schema: ${schema}`);
      }

      return privateSupabase;
    }),
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
    rpc,
    transactionMaybeSingle,
    walletMaybeSingle,
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
        wallet_id: 'wallet-1',
      },
      error: null,
    });
    mocks.walletMaybeSingle.mockResolvedValue({
      data: {
        ws_id: 'ws-1',
      },
      error: null,
    });
    mocks.linkedUserMaybeSingle.mockResolvedValue({
      data: {
        virtual_user_id: 'virtual-user-1',
      },
      error: null,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ id: 'tx-1' }],
      error: null,
    });
  });

  it('ignores paths outside finance transaction storage', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'drive/file.txt',
        permissions: createPermissions(['view_transactions']) as never,
        supabase: { rpc: mocks.rpc } as never,
        userId: 'user-1',
      })
    ).resolves.toBe(false);

    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('uses finance transaction visibility for attachment reads', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        permissions: createPermissions(['view_transactions']) as never,
        supabase: { rpc: mocks.rpc } as never,
        userId: 'user-1',
      })
    ).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      {
        p_limit: 1,
        p_transaction_ids: ['tx-1'],
        p_user_id: 'user-1',
        p_ws_id: 'ws-1',
      }
    );
    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
  });

  it('rejects attachment reads when transaction visibility filters remove the row', async () => {
    mocks.rpc.mockResolvedValue({
      data: [],
      error: null,
    });

    const { canAccessFinanceTransactionStoragePath } = await import(
      './storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        permissions: createPermissions(['view_transactions']) as never,
        supabase: { rpc: mocks.rpc } as never,
        userId: 'user-1',
      })
    ).resolves.toBe(false);
    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
  });

  it('allows transaction creators to attach files to their own transaction', async () => {
    const { canAccessFinanceTransactionStoragePath } = await import(
      './storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'write',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1',
        permissions: createPermissions(['create_transactions']) as never,
        supabase: { rpc: mocks.rpc } as never,
        userId: 'user-1',
      })
    ).resolves.toBe(true);

    expect(mocks.linkedUserMaybeSingle).toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects attachment reads when transaction visibility lookup fails', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'permission lookup failed' },
    });

    const { canAccessFinanceTransactionStoragePath } = await import(
      './storage-access'
    );

    await expect(
      canAccessFinanceTransactionStoragePath({
        access: 'read',
        normalizedWsId: 'ws-1',
        path: 'finance/transactions/tx-1/receipt.pdf',
        permissions: createPermissions(['view_transactions']) as never,
        supabase: { rpc: mocks.rpc } as never,
        userId: 'user-1',
      })
    ).resolves.toBe(false);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_wallet_transactions_with_permissions',
      expect.objectContaining({
        p_transaction_ids: ['tx-1'],
        p_ws_id: 'ws-1',
      })
    );
    expect(mocks.adminSupabase.from).not.toHaveBeenCalled();
  });
});
