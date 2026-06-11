import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

function createRequest(body?: unknown) {
  return new Request('http://localhost/api/checkpoints?limit=10', {
    body: body === undefined ? undefined : JSON.stringify(body),
    method: body === undefined ? 'GET' : 'POST',
  });
}

function createMalformedRequest() {
  return new Request('http://localhost/api/checkpoints', {
    body: '{',
    method: 'POST',
  });
}

function params(walletId = '00000000-0000-0000-0000-000000000001') {
  return {
    params: Promise.resolve({
      walletId,
      wsId: 'workspace-1',
    }),
  };
}

describe('wallet checkpoint route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects malformed wallet IDs before loading access context', async () => {
    const { GET } = await import('./route.js');
    const response = await GET(createRequest(), params('not-a-uuid'));

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON checkpoint create payloads', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(createMalformedRequest(), params());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Malformed JSON request body',
    });
  });

  it('rejects invalid checkpoint amounts and dates', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      createRequest({
        actual_balance: 'Infinity',
        checked_at: 'not-a-date',
      }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('passes through wallet permission failures', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      response: Response.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      createRequest({
        actual_balance: 100,
      }),
      params()
    );

    expect(response.status).toBe(403);
  });

  it('creates checkpoints with computed ledger balance and actor', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({
          data: {
            actual_balance: 120,
            checked_at: '2026-06-11T10:00:00.000Z',
            created_at: '2026-06-11T10:01:00.000Z',
            created_by: 'user-1',
            currency: 'VND',
            id: 'checkpoint-1',
            ledger_balance: 100,
            note: 'Audit',
            updated_at: '2026-06-11T10:01:00.000Z',
            wallet_id: '00000000-0000-0000-0000-000000000001',
          },
          error: null,
        }),
      }),
    });
    const sbAdmin = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({ insert })),
        rpc: vi.fn().mockResolvedValue({ data: 100, error: null }),
      })),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
        userId: 'user-1',
      },
      wallet: {
        currency: 'VND',
        id: '00000000-0000-0000-0000-000000000001',
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      createRequest({
        actual_balance: 120,
        checked_at: '2026-06-11T10:00:00.000Z',
        note: 'Audit',
      }),
      params()
    );

    expect(response.status).toBe(201);
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        actual_balance: 120,
        checked_at: '2026-06-11T10:00:00.000Z',
        created_by: 'user-1',
        currency: 'VND',
        ledger_balance: 100,
        note: 'Audit',
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      current_variance: 20,
      original_variance: 20,
    });
  });

  it('maps duplicate checkpoint timestamps to conflict responses', async () => {
    const sbAdmin = {
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: null,
                error: { code: '23505' },
              }),
            }),
          }),
        })),
        rpc: vi.fn().mockResolvedValue({ data: 100, error: null }),
      })),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
        userId: 'user-1',
      },
      wallet: {
        currency: 'VND',
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      createRequest({
        actual_balance: 100,
        checked_at: '2026-06-11T10:00:00.000Z',
      }),
      params()
    );

    expect(response.status).toBe(409);
  });

  it('lists checkpoints with latest and interval summaries', async () => {
    const checkpointRows = [
      {
        actual_balance: '120',
        checked_at: '2026-06-11T10:00:00.000Z',
        created_at: '2026-06-11T10:01:00.000Z',
        created_by: 'user-1',
        currency: 'VND',
        id: 'checkpoint-2',
        ledger_balance: '110',
        note: null,
        updated_at: '2026-06-11T10:01:00.000Z',
        wallet_id: '00000000-0000-0000-0000-000000000001',
      },
    ];
    const privateClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi
                  .fn()
                  .mockResolvedValue({ data: checkpointRows, error: null }),
              }),
            }),
          }),
        }),
      })),
      rpc: vi
        .fn()
        .mockResolvedValueOnce({ data: 115, error: null })
        .mockResolvedValueOnce({
          data: [
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
        }),
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

    const { GET } = await import('./route.js');
    const response = await GET(createRequest(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          current_ledger_balance: 115,
          current_variance: 5,
          original_variance: 10,
        },
      ],
      intervals: [
        {
          interval_variance: 5,
          is_clean: false,
        },
      ],
      latest: {
        id: 'checkpoint-2',
      },
    });
  });

  it('returns an empty checkpoint list while checkpoint storage is not migrated', async () => {
    const privateClient = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
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

    const { GET } = await import('./route.js');
    const response = await GET(createRequest(), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [],
      intervals: [],
      latest: null,
    });
  });

  it('returns storage-not-ready for checkpoint creates before migration', async () => {
    const sbAdmin = {
      schema: vi.fn(() => ({
        rpc: vi.fn().mockResolvedValue({
          data: null,
          error: {
            code: '42883',
            message:
              'function private.get_wallet_ledger_balance_at(uuid,timestamptz) does not exist',
          },
        }),
      })),
    };
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin,
        userId: 'user-1',
      },
      wallet: {
        currency: 'VND',
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      createRequest({
        actual_balance: 100,
        checked_at: '2026-06-11T10:00:00.000Z',
      }),
      params()
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      message: 'Wallet checkpoint storage is not ready',
    });
  });
});
