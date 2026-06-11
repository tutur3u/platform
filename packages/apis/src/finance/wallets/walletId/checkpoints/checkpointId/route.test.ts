import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

const walletId = '00000000-0000-0000-0000-000000000001';
const checkpointId = '00000000-0000-0000-0000-000000000002';

function params(overrides?: { checkpointId?: string; walletId?: string }) {
  return {
    params: Promise.resolve({
      checkpointId: overrides?.checkpointId ?? checkpointId,
      walletId: overrides?.walletId ?? walletId,
      wsId: 'workspace-1',
    }),
  };
}

function request(method: string, body?: unknown) {
  return new Request('http://localhost/api/checkpoints/checkpoint-1', {
    body: body === undefined ? undefined : JSON.stringify(body),
    method,
  });
}

describe('wallet checkpoint detail route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects malformed checkpoint IDs before access checks', async () => {
    const { DELETE } = await import('./route.js');
    const response = await DELETE(
      request('DELETE'),
      params({ checkpointId: 'bad-id' })
    );

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('recomputes ledger balance when checked_at changes', async () => {
    const existingSingle = vi.fn().mockResolvedValue({
      data: {
        actual_balance: 100,
        checked_at: '2026-06-10T10:00:00.000Z',
        created_at: '2026-06-10T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'VND',
        id: checkpointId,
        ledger_balance: 100,
        note: null,
        updated_at: '2026-06-10T10:01:00.000Z',
        wallet_id: walletId,
      },
      error: null,
    });
    const updateSingle = vi.fn().mockResolvedValue({
      data: {
        actual_balance: 110,
        checked_at: '2026-06-11T10:00:00.000Z',
        created_at: '2026-06-10T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'VND',
        id: checkpointId,
        ledger_balance: 105,
        note: 'Updated',
        updated_at: '2026-06-11T10:01:00.000Z',
        wallet_id: walletId,
      },
      error: null,
    });
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: updateSingle,
          }),
        }),
      }),
    });
    const privateClient = {
      from: vi
        .fn()
        .mockReturnValueOnce({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: existingSingle,
              }),
            }),
          }),
        })
        .mockReturnValueOnce({ update }),
      rpc: vi.fn().mockResolvedValue({ data: 105, error: null }),
    };
    const sbAdmin = {
      schema: vi.fn(() => privateClient),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
      },
      wallet: {
        currency: 'VND',
      },
    });

    const { PATCH } = await import('./route.js');
    const response = await PATCH(
      request('PATCH', {
        actual_balance: 110,
        checked_at: '2026-06-11T10:00:00.000Z',
        note: 'Updated',
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        actual_balance: 110,
        checked_at: '2026-06-11T10:00:00.000Z',
        ledger_balance: 105,
        note: 'Updated',
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      current_variance: 5,
      original_variance: 5,
    });
  });

  it('returns not found for wrong-wallet checkpoint deletes', async () => {
    const sbAdmin = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi
                    .fn()
                    .mockResolvedValue({ data: null, error: null }),
                }),
              }),
            }),
          }),
        })),
      })),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
      },
      wallet: {
        id: walletId,
      },
    });

    const { DELETE } = await import('./route.js');
    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(404);
  });

  it('returns storage-not-ready for checkpoint deletes before migration', async () => {
    const sbAdmin = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          delete: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                select: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
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
          }),
        })),
      })),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
      },
      wallet: {
        id: walletId,
      },
    });

    const { DELETE } = await import('./route.js');
    const response = await DELETE(request('DELETE'), params());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Wallet checkpoint storage is not ready',
    });
  });
});
