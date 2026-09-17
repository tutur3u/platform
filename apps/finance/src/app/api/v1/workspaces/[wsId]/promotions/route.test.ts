import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eq: vi.fn(),
  from: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  ilike: vi.fn(),
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
  it('pages and searches the workspace-scoped list for inventory viewers', async () => {
    const result = { data: [{ id: 'promo-2' }], count: 42, error: null };
    const query = Object.assign(Promise.resolve(result), {
      ilike: mocks.ilike,
      range: mocks.range,
    });
    mocks.order.mockReturnValue(query);
    mocks.ilike.mockReturnValue(query);
    mocks.range.mockReturnValue(query);
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'view_inventory',
        },
        sbAdmin: { schema: mocks.schema },
      },
    });
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/promotions?response=paginated&page=2&pageSize=20&q=Summer'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );
    expect(await response.json()).toEqual({ data: result.data, count: 42 });
    expect(mocks.range).toHaveBeenCalledWith(20, 39);
    expect(mocks.ilike).toHaveBeenCalledWith('name', '%Summer%');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('rejects callers without either promotion read permission', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        permissions: { withoutPermission: () => true },
        sbAdmin: { schema: mocks.schema },
      },
    });
    const { GET } = await import('./route');
    expect(
      (
        await GET(new Request('http://localhost/promotions'), {
          params: Promise.resolve({ wsId: 'ws-1' }),
        })
      ).status
    ).toBe(403);
    expect(mocks.schema).not.toHaveBeenCalled();
  });
});
