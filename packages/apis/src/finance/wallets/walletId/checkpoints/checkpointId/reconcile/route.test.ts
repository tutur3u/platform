import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAccessibleWallet: vi.fn(),
}));

vi.mock('../../../../wallet-access', () => ({
  getAccessibleWallet: (
    ...args: Parameters<typeof mocks.getAccessibleWallet>
  ) => mocks.getAccessibleWallet(...args),
}));

const walletId = '00000000-0000-0000-0000-000000000001';
const checkpointId = '00000000-0000-0000-0000-000000000002';

function params({
  checkpoint = checkpointId,
  wallet = walletId,
}: {
  checkpoint?: string;
  wallet?: string;
} = {}) {
  return {
    params: Promise.resolve({
      checkpointId: checkpoint,
      walletId: wallet,
      wsId: 'workspace-1',
    }),
  };
}

function request(body: unknown = {}) {
  return new Request('http://localhost/api/checkpoints/reconcile', {
    body: JSON.stringify(body),
    method: 'POST',
  });
}

function malformedRequest() {
  return new Request('http://localhost/api/checkpoints/reconcile', {
    body: '{',
    method: 'POST',
  });
}

describe('wallet checkpoint reconciliation route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('rejects malformed route IDs before loading wallet access', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(request(), params({ wallet: 'not-a-uuid' }));

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON before loading wallet access', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(malformedRequest(), params());

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('rejects invalid reconciliation payloads before loading wallet access', async () => {
    const { POST } = await import('./route.js');
    const response = await POST(
      request({ basis: 'stale-client-value' }),
      params()
    );

    expect(response.status).toBe(400);
    expect(mocks.getAccessibleWallet).not.toHaveBeenCalled();
  });

  it('passes through create transaction permission failures', async () => {
    mocks.getAccessibleWallet.mockResolvedValue({
      response: Response.json(
        { message: 'Insufficient permissions' },
        { status: 403 }
      ),
    });

    const { POST } = await import('./route.js');
    const response = await POST(request(), params());

    expect(response.status).toBe(403);
  });

  it('creates interval reconciliations through the private recompute RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          checked_at: '2026-06-11T10:00:00.000Z',
          checkpoint_id: checkpointId,
          created: true,
          offset_amount: '-12.34',
          transaction_id: '00000000-0000-0000-0000-000000000003',
          wallet_id: walletId,
        },
      ],
      error: null,
    });
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
        userId: 'user-1',
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(
      request({
        basis: 'interval',
        category_id: '00000000-0000-0000-0000-000000000004',
        description: 'Reviewed reconciliation',
      }),
      params()
    );

    expect(response.status).toBe(200);
    expect(mocks.getAccessibleWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        requiredPermission: 'create_transactions',
        walletId,
      })
    );
    expect(rpc).toHaveBeenCalledWith(
      'create_wallet_checkpoint_reconciliation',
      {
        _actor_id: 'user-1',
        _basis: 'interval',
        _category_id: '00000000-0000-0000-0000-000000000004',
        _checkpoint_id: checkpointId,
        _description: 'Reviewed reconciliation',
        _wallet_id: walletId,
      }
    );
    await expect(response.json()).resolves.toEqual({
      checked_at: '2026-06-11T10:00:00.000Z',
      checkpoint_id: checkpointId,
      created: true,
      offset_amount: -12.34,
      transaction_id: '00000000-0000-0000-0000-000000000003',
      wallet_id: walletId,
    });
  });

  it('returns a clean no-op response when the recomputed offset is zero', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          checked_at: '2026-06-11T10:00:00.000Z',
          checkpoint_id: checkpointId,
          created: false,
          offset_amount: '0',
          transaction_id: null,
          wallet_id: walletId,
        },
      ],
      error: null,
    });
    mocks.getAccessibleWallet.mockResolvedValue({
      context: {
        sbAdmin: {
          schema: vi.fn(() => ({ rpc })),
        },
        userId: 'user-1',
      },
    });

    const { POST } = await import('./route.js');
    const response = await POST(request({ basis: 'checkpoint' }), params());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      checked_at: '2026-06-11T10:00:00.000Z',
      checkpoint_id: checkpointId,
      created: false,
      offset_amount: 0,
      transaction_id: null,
      wallet_id: walletId,
    });
  });
});
