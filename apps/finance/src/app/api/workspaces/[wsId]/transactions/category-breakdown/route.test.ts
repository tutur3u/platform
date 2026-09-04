import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  privateRpc: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

import { GET } from './route';

const permissions = {
  withoutPermission: vi.fn(() => false),
};

describe('finance category breakdown route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const sbAdmin = {
      schema: vi.fn(() => ({ rpc: mocks.privateRpc })),
    };
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({ actor: true });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-id',
        permissions,
        sbAdmin,
        user: { id: 'actor-id' },
      },
    });
    mocks.privateRpc.mockResolvedValue({
      data: [{ category_name: 'Travel', total: 42 }],
      error: null,
    });
  });

  it('calls the private RPC with the verified app-session actor', async () => {
    const request = new Request(
      'https://finance.example/api/workspaces/personal/transactions/category-breakdown?type=expense&timezone=Asia%2FHo_Chi_Minh'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'personal' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { category_name: 'Travel', total: 42 },
    ]);
    expect(mocks.privateRpc).toHaveBeenCalledWith('get_category_breakdown', {
      _actor_id: 'actor-id',
      _anchor_to_latest: false,
      _end_date: undefined,
      _interval: 'daily',
      _start_date: undefined,
      _timezone: 'Asia/Ho_Chi_Minh',
      _transaction_type: 'expense',
      _wallet_ids: undefined,
      _ws_id: 'workspace-id',
      include_confidential: true,
    });
  });
});
