import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  rpc: vi.fn(),
  schema: vi.fn(),
  serverError: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (
    ...args: Parameters<typeof mocks.getFinanceRouteContext>
  ) => mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (
    ...args: Parameters<typeof mocks.resolveFinanceRouteAuthContext>
  ) => mocks.resolveFinanceRouteAuthContext(...args),
}));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  serverLogger: {
    error: (...args: Parameters<typeof mocks.serverError>) =>
      mocks.serverError(...args),
  },
}));

describe('multi-group linked products route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.schema.mockReturnValue({
      rpc: mocks.rpc,
    });
    mocks.rpc.mockResolvedValue({
      data: [{ item: { group_id: 'group-1' } }],
      error: null,
    });
  });

  it('lets invoice creators read linked products for selected groups', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_invoices']),
        sbAdmin: {
          schema: mocks.schema,
        },
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/linked-products?groupIds=group-1'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      items: [{ group_id: 'group-1' }],
    });
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_user_group_linked_products_with_units',
      {
        p_group_ids: ['group-1'],
        p_ws_id: 'ws-1',
      }
    );
  });

  it('rejects users without group view or invoice creation access', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions([]),
        sbAdmin: {
          schema: mocks.schema,
        },
      },
    });

    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/user-groups/linked-products?groupIds=group-1'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
