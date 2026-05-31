import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  categoriesEq: vi.fn(),
  categoriesOrder: vi.fn(),
  categoriesSelect: vi.fn(),
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
    mocks.categoriesOrder.mockResolvedValue({
      data: [
        {
          color: null,
          icon: null,
          id: 'category-1',
          is_expense: true,
          name: 'Tuition',
        },
      ],
      error: null,
    });
    mocks.categoriesEq.mockReturnValue({
      order: mocks.categoriesOrder,
    });
    mocks.categoriesSelect.mockReturnValue({
      eq: mocks.categoriesEq,
    });
    mocks.order.mockResolvedValue({
      data: [
        {
          amount: 1200,
          id: 'category-1',
          name: 'Tuition',
          transaction_count: 4,
        },
      ],
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
          from: vi.fn((table: string) => {
            if (table !== 'transaction_categories') {
              throw new Error(`Unexpected table: ${table}`);
            }

            return {
              select: mocks.categoriesSelect,
            };
          }),
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
      {
        color: null,
        icon: null,
        id: 'category-1',
        is_expense: true,
        name: 'Tuition',
      },
    ]);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.categoriesSelect).toHaveBeenCalledWith(
      'id,name,is_expense,icon,color'
    );
    expect(mocks.categoriesEq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });

  it('keeps transaction aggregates for users who can view transactions', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: withPermissions(['view_transactions']),
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
      {
        amount: 1200,
        id: 'category-1',
        name: 'Tuition',
        transaction_count: 4,
      },
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
