import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getFinanceRouteContext: vi.fn(),
  in: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: (...args: unknown[]) =>
    mocks.getFinanceRouteContext(...args),
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: (...args: unknown[]) =>
    mocks.resolveFinanceRouteAuthContext(...args),
}));

describe('finance invoice defaults route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ in: mocks.in });
    mocks.in.mockResolvedValue({
      data: [{ id: 'default_wallet_id', value: 'wallet-1' }],
      error: null,
    });
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: {
          withoutPermission: (permission: string) =>
            permission !== 'create_invoices',
        },
        sbAdmin: { from: mocks.from },
      },
    });
  });

  it('returns invoice defaults to invoice creators using finance auth', async () => {
    const { GET } = await import('./route');
    const request = new Request(
      'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=default_wallet_id,DEFAULT_CURRENCY'
    );
    const response = await GET(request, {
      params: Promise.resolve({ wsId: 'ws-1' }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      DEFAULT_CURRENCY: null,
      default_wallet_id: 'wallet-1',
    });
    expect(mocks.resolveFinanceRouteAuthContext).toHaveBeenCalledWith(request);
    expect(mocks.in).toHaveBeenCalledWith('id', [
      'default_wallet_id',
      'DEFAULT_CURRENCY',
    ]);
  });

  it('rejects config ids outside the invoice creation allowlist', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/v1/workspaces/ws-1/settings/configs?ids=SECRET_CONFIG'
      ),
      { params: Promise.resolve({ wsId: 'ws-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
