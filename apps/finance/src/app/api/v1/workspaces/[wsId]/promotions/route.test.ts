import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  order: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  schema: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (...args: unknown[]) =>
    mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (...args: unknown[]) =>
    mocks.resolveFinanceRouteAuthContext(...args),
}));

describe('finance invoice promotions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.schema.mockReturnValue({ from: mocks.from });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.order.mockResolvedValue({
      data: [{ code: 'SAVE10', id: 'promo-1', promo_type: 'DISCOUNT' }],
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

  it('returns workspace promotions to invoice creators', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/promotions'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { code: 'SAVE10', id: 'promo-1', promo_type: 'DISCOUNT' },
    ]);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request);
    expect(mocks.eq).toHaveBeenCalledWith('ws_id', 'ws-1');
  });
});
