import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (...args: unknown[]) =>
    mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (...args: unknown[]) =>
    mocks.resolveFinanceRouteAuthContext(...args),
}));

describe('finance multi-group linked products route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.schema.mockReturnValue({ rpc: mocks.rpc });
    mocks.rpc.mockResolvedValue({
      data: [{ item: { group_id: 'group-1' } }],
      error: null,
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'create_invoices',
        },
        sbAdmin: { schema: mocks.schema },
      },
    });
  });

  it('returns linked products to invoice creators using finance auth', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/user-groups/linked-products?groupIds=group-1'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ group_id: 'group-1' }],
    });
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_user_group_linked_products_with_units',
      { p_group_ids: ['group-1'], p_ws_id: 'ws-1' }
    );
  });
});
