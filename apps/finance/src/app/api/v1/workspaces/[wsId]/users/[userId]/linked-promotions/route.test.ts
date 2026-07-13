import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  eqLinks: vi.fn(),
  eqPromotions: vi.fn(),
  from: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  in: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  schema: vi.fn(),
  selectLinks: vi.fn(),
  selectPromotions: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (...args: unknown[]) =>
    mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (...args: unknown[]) =>
    mocks.resolveFinanceRouteAuthContext(...args),
}));

describe('finance customer-linked promotions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.schema.mockReturnValue({ from: mocks.from });
    mocks.from.mockImplementation((table: string) =>
      table === 'user_linked_promotions'
        ? { select: mocks.selectLinks }
        : { select: mocks.selectPromotions }
    );
    mocks.selectLinks.mockReturnValue({ eq: mocks.eqLinks });
    mocks.eqLinks.mockResolvedValue({
      data: [{ promo_id: 'promo-1' }],
      error: null,
    });
    mocks.selectPromotions.mockReturnValue({ eq: mocks.eqPromotions });
    mocks.eqPromotions.mockReturnValue({ in: mocks.in });
    mocks.in.mockResolvedValue({
      data: [{ code: 'LOYALTY', id: 'promo-1' }],
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

  it('returns promotions linked to the selected invoice customer', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/users/user-1/linked-promotions'
    );
    const response = await GET(request, {
      params: Promise.resolve({ userId: 'user-1', wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      {
        promo_id: 'promo-1',
        workspace_promotions: { code: 'LOYALTY', id: 'promo-1' },
      },
    ]);
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request);
    expect(mocks.eqLinks).toHaveBeenCalledWith('user_id', 'user-1');
  });
});
