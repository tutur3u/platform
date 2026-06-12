import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../wallet-access', () => {
  return {
    flattenWalletCreditData: <T extends Record<string, unknown>>(wallet: T) => {
      const { credit_wallets, ...walletBase } = wallet as T & {
        credit_wallets?: {
          limit: number;
          statement_date: number;
          payment_date: number;
        } | null;
      };

      return {
        ...walletBase,
        ...(credit_wallets
          ? {
              limit: credit_wallets.limit,
              statement_date: credit_wallets.statement_date,
              payment_date: credit_wallets.payment_date,
            }
          : {}),
      };
    },
    getAccessibleWallet: (
      ...args: Parameters<typeof mocks.getAccessibleWallet>
    ) => mocks.getAccessibleWallet(...args),
  };
});

describe('wallet detail route', () => {
  function createUpdateClient({
    creditDeleteError,
    updatedWallet = { id: 'wallet-1' },
  }: {
    creditDeleteError?: unknown;
    updatedWallet?: { id: string } | null;
  } = {}) {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: updatedWallet,
      error: null,
    });
    const updateEqWs = vi.fn(() => ({
      maybeSingle,
    }));
    const updateEqWallet = vi.fn(() => ({
      eq: updateEqWs,
    }));
    const select = vi.fn(() => ({
      eq: updateEqWallet,
    }));
    const update = vi.fn(() => ({
      select,
    }));
    const creditUpsert = vi.fn().mockResolvedValue({
      data: null,
      error: null,
    });
    const creditDeleteEq = vi.fn().mockResolvedValue({
      data: null,
      error: creditDeleteError ?? null,
    });
    const creditDelete = vi.fn(() => ({
      eq: creditDeleteEq,
    }));
    const sbAdmin = {
      schema: vi.fn((schema: string) => {
        if (schema !== 'private') {
          throw new Error(`Unexpected schema: ${schema}`);
        }

        return {
          from: vi.fn((table: string) => {
            if (table !== 'workspace_wallets') {
              throw new Error(`Unexpected private table: ${table}`);
            }

            return {
              update,
            };
          }),
        };
      }),
      from: vi.fn((table: string) => {
        if (table !== 'credit_wallets') {
          throw new Error(`Unexpected table: ${table}`);
        }

        return {
          delete: creditDelete,
          upsert: creditUpsert,
        };
      }),
    };

    return {
      creditDelete,
      creditDeleteEq,
      creditUpsert,
      maybeSingle,
      sbAdmin,
      update,
      updateEqWallet,
      updateEqWs,
    };
  }

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns flattened wallet data from the shared wallet access helper', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        requiredPermission: 'view_transactions',
        sbAdmin: {},
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
        name: 'Primary Wallet',
        credit_wallets: {
          limit: 1200,
          statement_date: 15,
          payment_date: 25,
        },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      id: 'wallet-1',
      name: 'Primary Wallet',
      limit: 1200,
      statement_date: 15,
      payment_date: 25,
    });
  });

  it('attaches latest checkpoint audit fields to wallet detail responses', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          audited_balance: '130',
          checkpoint_ledger_balance: '100',
          latest_actual_balance: '125',
          latest_checked_at: '2026-06-11T10:00:00.000Z',
          latest_checkpoint_id: 'checkpoint-1',
          ledger_balance: '120',
          post_checkpoint_delta: '5',
          post_checkpoint_transaction_count: '2',
          status: 'unresolved',
          variance: '10',
          wallet_id: 'wallet-1',
        },
      ],
      error: null,
    });
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        requiredPermission: 'view_transactions',
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        balance: 120,
        id: 'wallet-1',
        name: 'Primary Wallet',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request('http://localhost/wallets/wallet-1'),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('get_wallet_checkpoint_audit_status', {
      _wallet_ids: ['wallet-1'],
    });
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        audit_balance: 130,
        audit_checked_at: '2026-06-11T10:00:00.000Z',
        audit_post_checkpoint_delta: 5,
        audit_status: 'unresolved',
        audit_variance: 10,
      })
    );
  });

  it('returns 400 for malformed wallet update JSON before wallet access', async () => {
    const { PUT } = await import('./route.js');
    const response = await PUT(
      new Request('http://localhost/wallets/wallet-1', {
        method: 'PUT',
        body: '{',
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: 'Malformed JSON request body',
    });
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('requires valid credit metadata for credit wallet updates', async () => {
    const { PUT } = await import('./route.js');
    const response = await PUT(
      new Request('http://localhost/wallets/wallet-1', {
        method: 'PUT',
        body: JSON.stringify({
          type: 'CREDIT',
          limit: -1,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        message: 'Invalid wallet data',
        errors: expect.arrayContaining([
          expect.objectContaining({ path: ['limit'] }),
          expect.objectContaining({ path: ['statement_date'] }),
          expect.objectContaining({ path: ['payment_date'] }),
        ]),
      })
    );
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('upserts credit metadata for credit wallet updates', async () => {
    const updateClient = createUpdateClient();
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        requiredPermission: 'update_wallets',
        sbAdmin: updateClient.sbAdmin,
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });

    const { PUT } = await import('./route.js');
    const response = await PUT(
      new Request('http://localhost/wallets/wallet-1', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Rewards',
          type: 'CREDIT',
          limit: 5000,
          statement_date: 4,
          payment_date: 24,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateClient.update).toHaveBeenCalledWith({
      name: 'Rewards',
      type: 'CREDIT',
    });
    expect(updateClient.creditUpsert).toHaveBeenCalledWith({
      wallet_id: 'wallet-1',
      statement_date: 4,
      payment_date: 24,
      limit: 5000,
    });
  });

  it('deletes credit metadata when explicitly switching to standard', async () => {
    const updateClient = createUpdateClient();
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        requiredPermission: 'update_wallets',
        sbAdmin: updateClient.sbAdmin,
        supabase: {},
        userId: 'user-1',
      },
      wallet: {
        id: 'wallet-1',
      },
    });

    const { PUT } = await import('./route.js');
    const response = await PUT(
      new Request('http://localhost/wallets/wallet-1', {
        method: 'PUT',
        body: JSON.stringify({
          name: 'Cash',
          type: 'STANDARD',
          limit: 5000,
          statement_date: 4,
          payment_date: 24,
        }),
      }),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
          walletId: 'wallet-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(updateClient.update).toHaveBeenCalledWith({
      name: 'Cash',
      type: 'STANDARD',
    });
    expect(updateClient.creditUpsert).not.toHaveBeenCalled();
    expect(updateClient.creditDelete).toHaveBeenCalled();
    expect(updateClient.creditDeleteEq).toHaveBeenCalledWith(
      'wallet_id',
      'wallet-1'
    );
  });
});
