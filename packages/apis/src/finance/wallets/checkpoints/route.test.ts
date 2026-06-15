import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallets: vi.fn(),
  getWalletRouteContext: vi.fn(),
}));

vi.mock('../wallet-access', () => ({
  getAccessibleWallets: (
    ...args: Parameters<typeof mocks.getAccessibleWallets>
  ) => mocks.getAccessibleWallets(...args),
  getWalletRouteContext: (
    ...args: Parameters<typeof mocks.getWalletRouteContext>
  ) => mocks.getWalletRouteContext(...args),
}));

const walletIdA = '00000000-0000-0000-0000-000000000001';
const walletIdB = '00000000-0000-0000-0000-000000000002';

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function request(body?: unknown) {
  return new Request('http://localhost/api/wallets/checkpoints', {
    body: body === undefined ? undefined : JSON.stringify(body),
    method: body === undefined ? 'GET' : 'POST',
  });
}

describe('workspace wallet checkpoint route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('returns empty checkpoint summaries when no wallets are accessible', async () => {
    mocks.getWalletRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(
            (permission: string) => permission === 'manage_finance'
          ),
        },
        sbAdmin: {
          from: vi.fn(() => ({
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          })),
        },
        userId: 'user-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      latest_checkpoints: [],
      totals_by_currency: [],
      wallets: [],
    });
  });

  it('returns wallets with empty checkpoint summaries before checkpoint storage is migrated', async () => {
    const from = vi.fn((table: string) => {
      if (table === 'workspace_wallets') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: [
                  {
                    balance: 100,
                    currency: 'USD',
                    icon: null,
                    id: walletIdA,
                    image_src: null,
                    name: 'Cash',
                    type: 'STANDARD',
                  },
                ],
                error: null,
              }),
            }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  code: '42P01',
                  message:
                    'relation "private.workspace_wallet_checkpoints" does not exist',
                },
              }),
            }),
          }),
        }),
      };
    });
    mocks.getWalletRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: vi.fn(() => false),
        },
        sbAdmin: {
          schema: vi.fn(() => ({ from })),
        },
        userId: 'user-1',
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(request(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      latest_checkpoints: [],
      totals_by_currency: [],
      wallets: [
        {
          balance: 100,
          currency: 'USD',
          icon: null,
          id: walletIdA,
          image_src: null,
          name: 'Cash',
          type: 'STANDARD',
        },
      ],
    });
  });

  it('limits non-manager checkpoint summaries to wallet viewing windows', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-15T00:00:00.000Z'));

    try {
      const oldCheckpoint = {
        actual_balance: '40',
        checked_at: '2026-06-01T10:00:00.000Z',
        created_at: '2026-06-01T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'USD',
        id: 'checkpoint-old',
        ledger_balance: '38',
        note: null,
        updated_at: '2026-06-01T10:01:00.000Z',
        wallet_id: walletIdA,
      };
      const visibleCheckpoint = {
        actual_balance: '50',
        checked_at: '2026-06-10T10:00:00.000Z',
        created_at: '2026-06-10T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'USD',
        id: 'checkpoint-visible',
        ledger_balance: '48',
        note: null,
        updated_at: '2026-06-10T10:01:00.000Z',
        wallet_id: walletIdA,
      };

      const checkpointOrder = vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({
          data: [visibleCheckpoint, oldCheckpoint],
          error: null,
        }),
      });
      const checkpointGte = vi.fn().mockReturnValue({
        order: checkpointOrder,
      });
      const privateFrom = vi.fn((table: string) => {
        if (table === 'workspace_wallets') {
          const walletOrder = vi.fn().mockResolvedValue({
            data: [
              {
                balance: 50,
                currency: 'USD',
                icon: null,
                id: walletIdA,
                image_src: null,
                name: 'Cash',
                type: 'STANDARD',
              },
            ],
            error: null,
          });
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
                    wallet_id: walletIdA,
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
            schema: vi.fn(() => ({
              from: privateFrom,
              rpc: vi.fn().mockResolvedValue({ data: 52, error: null }),
            })),
          },
          userId: 'user-1',
        },
      });

      const { GET } = await import('./route.js');
      const response = await GET(request(), params());

      expect(response.status).toBe(200);
      expect(checkpointGte).toHaveBeenCalledWith(
        'checked_at',
        '2026-06-08T00:00:00.000Z'
      );
      await expect(response.json()).resolves.toMatchObject({
        latest_checkpoints: [
          {
            id: 'checkpoint-visible',
            wallet_id: walletIdA,
          },
        ],
        wallets: [
          {
            id: walletIdA,
            name: 'Cash',
          },
        ],
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('rejects duplicate wallet IDs before batch access checks', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      request({
        entries: [
          {
            actual_balance: 10,
            wallet_id: walletIdA,
          },
          {
            actual_balance: 20,
            wallet_id: walletIdA,
          },
        ],
      }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallets).not.toHaveBeenCalled();
  });

  it('rejects inaccessible wallets without calling the batch RPC', async () => {
    const rpc = vi.fn();
    mocks.getAccessibleWallets.mockResolvedValue({
      context: {
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
      },
      wallets: [{ id: walletIdA }],
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      request({
        entries: [
          {
            actual_balance: 10,
            wallet_id: walletIdA,
          },
          {
            actual_balance: 20,
            wallet_id: walletIdB,
          },
        ],
      }),
      params()
    );

    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('creates all checkpoint entries through the private batch RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          actual_balance: 10,
          checked_at: '2026-06-11T10:00:00.000Z',
          created_at: '2026-06-11T10:01:00.000Z',
          created_by: 'user-1',
          currency: 'USD',
          id: 'checkpoint-1',
          ledger_balance: 9,
          note: null,
          updated_at: '2026-06-11T10:01:00.000Z',
          wallet_id: walletIdA,
        },
        {
          actual_balance: 20,
          checked_at: '2026-06-11T10:00:00.000Z',
          created_at: '2026-06-11T10:01:00.000Z',
          created_by: 'user-1',
          currency: 'VND',
          id: 'checkpoint-2',
          ledger_balance: 20,
          note: 'Cash count',
          updated_at: '2026-06-11T10:01:00.000Z',
          wallet_id: walletIdB,
        },
      ],
      error: null,
    });
    mocks.getAccessibleWallets.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
        userId: 'user-1',
      },
      wallets: [{ id: walletIdA }, { id: walletIdB }],
    });

    const payload = {
      checked_at: '2026-06-11T10:00:00.000Z',
      entries: [
        {
          actual_balance: 10,
          wallet_id: walletIdA,
        },
        {
          actual_balance: 20,
          note: 'Cash count',
          wallet_id: walletIdB,
        },
      ],
    };

    const { POST } = await import('./route.js');
    const response = await POST(request(payload), params());

    expect(response.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith(
      'create_workspace_wallet_checkpoints_batch',
      {
        _actor_id: 'user-1',
        _checked_at: '2026-06-11T10:00:00.000Z',
        _entries: [
          {
            actual_balance: 10,
            note: null,
            wallet_id: walletIdA,
          },
          {
            actual_balance: 20,
            note: 'Cash count',
            wallet_id: walletIdB,
          },
        ],
        _ws_id: 'workspace-1',
      }
    );
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          current_variance: 1,
        },
        {
          current_variance: 0,
        },
      ],
      totals_by_currency: [
        {
          currency: 'USD',
          variance_total: 1,
        },
        {
          currency: 'VND',
          variance_total: 0,
        },
      ],
    });
  });

  it('maps duplicate batch timestamps to conflict responses', async () => {
    mocks.getAccessibleWallets.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        sbAdmin: {
          schema: vi.fn(() => ({
            rpc: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '23505' },
            }),
          })),
        },
        userId: 'user-1',
      },
      wallets: [{ id: walletIdA }],
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      request({
        checked_at: '2026-06-11T10:00:00.000Z',
        entries: [
          {
            actual_balance: 10,
            wallet_id: walletIdA,
          },
        ],
      }),
      params()
    );

    expect(response.status).toBe(409);
  });
});
