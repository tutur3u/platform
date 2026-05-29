import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  order: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock('../../request-access', () => {
  return {
    getFinanceRouteContext: (
      ...args: Parameters<typeof mocks.getFinanceRouteContext>
    ) => mocks.getFinanceRouteContext(...args),
    hasAnyFinancePermission: (
      permissions: { withoutPermission: (permission: string) => boolean },
      permissionIds: string[]
    ) =>
      permissionIds.some(
        (permissionId) => !permissions.withoutPermission(permissionId)
      ),
  };
});

describe('transaction categories route', () => {
  const withPermissions = (granted: string[]) => ({
    withoutPermission: vi.fn(
      (permission: string) => !granted.includes(permission)
    ),
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.order.mockResolvedValue({
      data: [{ id: 'category-1', name: 'Tuition' }],
      error: null,
    });
    mocks.rpc.mockReturnValue({
      order: mocks.order,
    });
  });

  it('lets invoice creators read transaction categories for invoice payment settings', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['create_invoices']),
        sbAdmin: {
          rpc: mocks.rpc,
        },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/categories'
      ),
      {
        params: Promise.resolve({
          wsId: 'ws-1',
        }),
      }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { id: 'category-1', name: 'Tuition' },
    ]);
    expect(mocks.rpc).toHaveBeenCalledWith(
      'get_transaction_categories_with_amount_by_workspace',
      {
        p_ws_id: 'ws-1',
      }
    );
  });

  it('rejects users without transaction view or invoice creation access', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions([]),
        sbAdmin: {
          rpc: mocks.rpc,
        },
      },
    });

    const { GET } = await import('./route.js');
    const response = await GET(
      new Request(
        'http://localhost/api/workspaces/ws-1/transactions/categories'
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
