import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getWalletRouteContext: vi.fn(),
}));

vi.mock('../../wallet-access', () => ({
  getWalletRouteContext: (
    ...args: Parameters<typeof mocks.getWalletRouteContext>
  ) => mocks.getWalletRouteContext(...args),
}));

const walletId = '00000000-0000-0000-0000-000000000001';

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request() {
  return new Request('http://localhost/api/checkpoints/history?limit=10');
}

function createPrivateClient({
  auditStatuses,
  checkpointError,
  checkpointRows = [],
  intervalRows,
  wallets = [],
}: {
  auditStatuses?: unknown[];
  checkpointError?: { code?: string; message?: string } | null;
  checkpointRows?: unknown[];
  intervalRows?: unknown[];
  wallets?: unknown[];
}) {
  const checkpointGte = vi.fn();
  const rpc = vi.fn((name: string) => {
    if (name === 'get_wallet_ledger_balance_at') {
      return Promise.resolve({ data: 115, error: null });
    }

    if (name === 'list_wallet_checkpoint_intervals') {
      return Promise.resolve({
        data: intervalRows ?? [
          {
            actual_delta: 20,
            end_actual_balance: 120,
            end_checked_at: '2026-06-11T10:00:00.000Z',
            end_checkpoint_id: 'checkpoint-2',
            interval_variance: 5,
            ledger_delta: 15,
            start_actual_balance: 100,
            start_checked_at: '2026-06-10T10:00:00.000Z',
            start_checkpoint_id: 'checkpoint-1',
            transaction_count: 3,
          },
        ],
        error: null,
      });
    }

    if (name === 'get_wallet_checkpoint_audit_status') {
      return Promise.resolve({
        data: auditStatuses ?? [
          {
            audited_balance: '120',
            checkpoint_ledger_balance: '110',
            latest_actual_balance: '120',
            latest_checked_at: '2026-06-11T10:00:00.000Z',
            latest_checkpoint_id: 'checkpoint-2',
            ledger_balance: '115',
            post_checkpoint_delta: '0',
            post_checkpoint_transaction_count: '0',
            status: 'unresolved',
            variance: '5',
            wallet_id: walletId,
          },
        ],
        error: null,
      });
    }

    throw new Error(`Unexpected RPC: ${name}`);
  });

  const from = vi.fn((table: string) => {
    if (table === 'workspace_wallets') {
      const walletOrder = vi
        .fn()
        .mockResolvedValue({ data: wallets, error: null });
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              order: walletOrder,
            }),
            order: walletOrder,
          }),
        }),
      };
    }

    if (table === 'workspace_wallet_checkpoints') {
      const checkpointOrder = vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({
            data: checkpointError ? null : checkpointRows,
            error: checkpointError ?? null,
          }),
        }),
      });
      checkpointGte.mockReturnValue({
        order: checkpointOrder,
      });

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            gte: checkpointGte,
            order: checkpointOrder,
          }),
        }),
      };
    }

    throw new Error(`Unexpected private table: ${table}`);
  });

  return { checkpointGte, from, rpc };
}

describe('wallet checkpoint history route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns empty history when no wallets are accessible', async () => {
    const privateClient = createPrivateClient({ wallets: [] });
    mocks.getWalletRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          schema: vi.fn(() => privateClient),
        },
        userId: 'user-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      audit_statuses: [],
      checkpoints: [],
      intervals: [],
      latest_checkpoints: [],
      totals_by_currency: [],
      wallets: [],
    });
  });

  it('returns wallets with empty history while checkpoint storage is not migrated', async () => {
    const privateClient = createPrivateClient({
      checkpointError: {
        code: '42P01',
        message:
          'relation "private.workspace_wallet_checkpoints" does not exist',
      },
      wallets: [
        {
          balance: 100,
          currency: 'USD',
          icon: null,
          id: walletId,
          image_src: null,
          name: 'Cash',
          type: 'STANDARD',
        },
      ],
    });
    mocks.getWalletRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          schema: vi.fn(() => privateClient),
        },
        userId: 'user-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      checkpoints: [],
      intervals: [],
      wallets: [
        {
          id: walletId,
          name: 'Cash',
        },
      ],
    });
  });

  it('returns checkpoint history with audit statuses and interval ordering', async () => {
    const privateClient = createPrivateClient({
      checkpointRows: [
        {
          actual_balance: '120',
          checked_at: '2026-06-11T10:00:00.000Z',
          created_at: '2026-06-11T10:01:00.000Z',
          created_by: 'user-1',
          currency: 'USD',
          id: 'checkpoint-2',
          ledger_balance: '110',
          note: null,
          updated_at: '2026-06-11T10:01:00.000Z',
          wallet_id: walletId,
        },
      ],
      wallets: [
        {
          balance: 115,
          currency: 'USD',
          icon: null,
          id: walletId,
          image_src: null,
          name: 'Cash',
          type: 'STANDARD',
        },
      ],
    });
    mocks.getWalletRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          schema: vi.fn(() => privateClient),
        },
        userId: 'user-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      audit_statuses: [
        {
          audited_balance: 120,
          status: 'unresolved',
          variance: 5,
        },
      ],
      checkpoints: [
        {
          current_ledger_balance: 115,
          current_variance: 5,
        },
      ],
      intervals: [
        {
          currency: 'USD',
          interval_variance: 5,
          wallet_name: 'Cash',
        },
      ],
    });
  });

  it('limits non-manager checkpoint history to wallet viewing windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

    try {
      const privateClient = createPrivateClient({
        auditStatuses: [
          {
            audited_balance: '95',
            checkpoint_ledger_balance: '90',
            latest_actual_balance: '95',
            latest_checked_at: '2026-06-01T10:00:00.000Z',
            latest_checkpoint_id: 'checkpoint-old',
            ledger_balance: '115',
            post_checkpoint_delta: '20',
            post_checkpoint_transaction_count: '4',
            status: 'unresolved',
            variance: '5',
            wallet_id: walletId,
          },
        ],
        checkpointRows: [
          {
            actual_balance: '120',
            checked_at: '2026-06-10T10:00:00.000Z',
            created_at: '2026-06-10T10:01:00.000Z',
            created_by: 'user-1',
            currency: 'USD',
            id: 'checkpoint-visible',
            ledger_balance: '110',
            note: null,
            updated_at: '2026-06-10T10:01:00.000Z',
            wallet_id: walletId,
          },
          {
            actual_balance: '95',
            checked_at: '2026-06-01T10:00:00.000Z',
            created_at: '2026-06-01T10:01:00.000Z',
            created_by: 'user-1',
            currency: 'USD',
            id: 'checkpoint-old',
            ledger_balance: '90',
            note: null,
            updated_at: '2026-06-01T10:01:00.000Z',
            wallet_id: walletId,
          },
        ],
        intervalRows: [
          {
            actual_delta: 5,
            end_actual_balance: 95,
            end_checked_at: '2026-06-01T10:00:00.000Z',
            end_checkpoint_id: 'checkpoint-old',
            interval_variance: 1,
            ledger_delta: 4,
            start_actual_balance: 90,
            start_checked_at: '2026-05-31T10:00:00.000Z',
            start_checkpoint_id: 'checkpoint-older',
            transaction_count: 2,
          },
          {
            actual_delta: 20,
            end_actual_balance: 120,
            end_checked_at: '2026-06-10T10:00:00.000Z',
            end_checkpoint_id: 'checkpoint-visible',
            interval_variance: 5,
            ledger_delta: 15,
            start_actual_balance: 100,
            start_checked_at: '2026-06-09T10:00:00.000Z',
            start_checkpoint_id: 'checkpoint-window-start',
            transaction_count: 3,
          },
        ],
        wallets: [
          {
            balance: 115,
            currency: 'USD',
            icon: null,
            id: walletId,
            image_src: null,
            name: 'Cash',
            type: 'STANDARD',
          },
        ],
      });
      const publicFrom = vi.fn((table: string) => {
        if (table === 'workspace_role_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [{ role_id: 'role-1' }],
                  error: null,
                }),
              }),
            }),
          };
        }

        if (table === 'workspace_role_wallet_whitelist') {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    custom_days: null,
                    viewing_window: '7_days',
                    wallet_id: walletId,
                  },
                ],
                error: null,
              }),
            }),
          };
        }

        throw new Error(`Unexpected public table: ${table}`);
      });
      mocks.getWalletRouteContext.mockResolvedValue({
        context: {
          normalizedWsId: 'workspace-1',
          permissions: {
            withoutPermission: vi.fn(
              (permission: string) => permission === 'manage_finance'
            ),
          },
          sbAdmin: {
            from: publicFrom,
            schema: vi.fn(() => privateClient),
          },
          userId: 'user-1',
        },
      });

      const { GET } = await import('./route.js');
      const response = await GET(request(), params());

      expect(response.status).toBe(200);
      expect(privateClient.checkpointGte).toHaveBeenCalledWith(
        'checked_at',
        '2026-06-08T00:00:00.000Z'
      );
      await expect(response.json()).resolves.toMatchObject({
        audit_statuses: [
          {
            latest_checkpoint_id: null,
            latest_checked_at: null,
            post_checkpoint_transaction_count: 0,
            status: 'no_checkpoint',
            variance: 0,
          },
        ],
        checkpoints: [
          {
            id: 'checkpoint-visible',
          },
        ],
        intervals: [
          {
            end_checkpoint_id: 'checkpoint-visible',
          },
        ],
        latest_checkpoints: [
          {
            id: 'checkpoint-visible',
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });
});
