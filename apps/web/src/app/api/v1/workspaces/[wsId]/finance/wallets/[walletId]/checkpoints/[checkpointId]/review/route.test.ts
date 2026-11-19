import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PUT } from './route';

const deps = vi.hoisted(() => ({
  authorize: vi.fn(),
  rpc: vi.fn(),
  withoutPermission: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: deps.authorize,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));

const walletId = '78600000-0000-4000-8000-000000000011';
const checkpointId = '78600000-0000-4000-8000-000000000012';
const updated = '2026-11-01T12:00:00.123456+00:00';

function save(body: unknown) {
  return PUT(
    new Request('https://example.test/review', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ wsId: 'personal', walletId, checkpointId }) }
  );
}

describe('wallet checkpoint review', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    deps.withoutPermission.mockReturnValue(false);
    deps.authorize.mockResolvedValue({
      context: {
        normalizedWsId: 'normalized',
        permissions: { withoutPermission: deps.withoutPermission },
        user: { id: 'verified-actor' },
        sbAdmin: { schema: () => ({ rpc: deps.rpc }) },
      },
    });
  });

  it('uses the authenticated workspace actor and exact observation version', async () => {
    deps.rpc.mockResolvedValue({ data: { reviewed_at: updated }, error: null });
    const result = await save({ reviewed: true, expected_updated_at: updated });
    expect(result.status).toBe(200);
    expect(deps.rpc).toHaveBeenCalledWith('set_wallet_checkpoint_review', {
      _ws_id: 'normalized',
      _wallet_id: walletId,
      _checkpoint_id: checkpointId,
      _actor_id: 'verified-actor',
      _reviewed: true,
      _expected_updated_at: updated,
    });
  });

  it('rejects an actor supplied by the caller and blocks a read-only editor', async () => {
    const body = { reviewed: true, expected_updated_at: updated };
    expect((await save({ ...body, actor_id: 'forged' })).status).toBe(400);
    deps.withoutPermission.mockImplementation(
      (permission) => permission === 'update_wallets'
    );
    expect((await save(body)).status).toBe(403);
    expect(deps.rpc).not.toHaveBeenCalled();
  });

  it('returns conflict for older versions and hides inaccessible checkpoints', async () => {
    const body = { reviewed: false, expected_updated_at: updated };
    deps.rpc.mockResolvedValueOnce({ data: null, error: { code: 'PT409' } });
    deps.rpc.mockResolvedValueOnce({ data: null, error: null });
    expect((await save(body)).status).toBe(409);
    expect((await save(body)).status).toBe(404);
  });
});
