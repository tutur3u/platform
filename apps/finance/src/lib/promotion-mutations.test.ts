import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  fetch: vi.fn(),
  options: vi.fn(),
}));
vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.access,
}));
vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: vi.fn(),
}));
vi.mock('@tuturuuu/internal-api', () => ({
  createInternalApiClient: () => ({ fetch: mocks.fetch }),
  withForwardedInternalApiAuth: mocks.options,
}));

import { forwardPromotionMutation } from './promotion-mutations';

describe('Finance promotion mutations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: { withoutPermission: () => false },
      },
    });
    mocks.fetch.mockResolvedValue(
      new Response('{"message":"usage conflict"}', { status: 409 })
    );
  });
  it('preserves mutation payload and upstream failures, forwarding auth to the configured owner', async () => {
    const request = new Request('http://localhost/promotions', {
      method: 'PUT',
      body: '{"value":12.5}',
      headers: { cookie: 'session=test' },
    });
    const response = await forwardPromotionMutation(
      request,
      'personal',
      'promo/1'
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'usage conflict' });
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/v1/workspaces/workspace-1/promotions/promo%2F1',
      expect.objectContaining({ method: 'PUT', body: '{"value":12.5}' })
    );
    expect(mocks.options).toHaveBeenCalledWith(
      request.headers,
      expect.objectContaining({ baseUrl: expect.stringContaining('inventory') })
    );
  });
  it('never forwards a mutation when the corresponding permission is denied', async () => {
    mocks.access.mockResolvedValue({
      context: {
        normalizedWsId: 'workspace-1',
        permissions: {
          withoutPermission: (permission: string) =>
            permission === 'delete_inventory',
        },
      },
    });
    expect(
      (
        await forwardPromotionMutation(
          new Request('http://localhost/promotions', { method: 'DELETE' }),
          'workspace-1',
          'promo-1'
        )
      ).status
    ).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
});
