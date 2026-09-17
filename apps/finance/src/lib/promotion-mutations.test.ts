import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  afterEach(() => vi.unstubAllEnvs());
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
  it.each(['https://unregistered.example', 'http://unregistered.example'])(
    'rejects credentials to %s',
    async (origin) => {
      vi.stubEnv('INVENTORY_APP_URL', origin);
      const response = await forwardPromotionMutation(
        new Request('http://localhost/promotions', {
          method: 'POST',
          body: '{}',
        }),
        'workspace-1'
      );
      expect(response.status).toBe(503);
      expect(mocks.options).not.toHaveBeenCalled();
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );
  it('rejects production HTTP loopback but permits registered development loopback', async () => {
    vi.stubEnv('INVENTORY_APP_URL', 'http://localhost:7815');
    vi.stubEnv('NODE_ENV', 'production');
    const request = () =>
      new Request('http://localhost/promotions', {
        method: 'POST',
        body: '{}',
      });
    expect(
      (await forwardPromotionMutation(request(), 'workspace-1')).status
    ).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      (await forwardPromotionMutation(request(), 'workspace-1')).status
    ).toBe(409);
  });
  it('cancels the upstream request when the caller disconnects', async () => {
    const controller = new AbortController();
    const request = new Request('http://localhost/promotions', {
      method: 'DELETE',
      signal: controller.signal,
    });
    await forwardPromotionMutation(request, 'workspace-1', 'promotion-1');
    const signal = mocks.fetch.mock.calls[0]?.[1].signal as AbortSignal;
    expect(signal.aborted).toBe(false);
    controller.abort();
    expect(signal.aborted).toBe(true);
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
