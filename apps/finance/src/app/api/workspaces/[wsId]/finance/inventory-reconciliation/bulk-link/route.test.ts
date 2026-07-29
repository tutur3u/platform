import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getFinanceRouteContext: vi.fn(),
  resolveFinanceRouteAuthContext: vi.fn(),
}));

vi.mock('@tuturuuu/apis/finance/request-access', () => ({
  getFinanceRouteContext: mocks.getFinanceRouteContext,
}));

vi.mock('@tuturuuu/finance-core/route-auth', () => ({
  resolveFinanceRouteAuthContext: mocks.resolveFinanceRouteAuthContext,
}));

const params = { params: Promise.resolve({ wsId: 'ws-1' }) };

describe('Inventory Finance bulk link route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveFinanceRouteAuthContext.mockResolvedValue({});
  });

  it('rejects requests over the atomic 100-entry limit before authorization', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/reconciliation/bulk-link', {
        body: JSON.stringify({
          entryIds: Array.from(
            { length: 101 },
            (_, index) =>
              `123e4567-e89b-42d3-a456-${String(index).padStart(12, '0')}`
          ),
          walletId: '123e4567-e89b-42d3-a456-426614174000',
        }),
        method: 'POST',
      }),
      params
    );
    expect(response.status).toBe(400);
    expect(mocks.getFinanceRouteContext).not.toHaveBeenCalled();
  });

  it('requires manage_finance', async () => {
    mocks.getFinanceRouteContext.mockResolvedValue({
      context: {
        normalizedWsId: 'ws-1',
        permissions: { withoutPermission: () => true },
        sbAdmin: {},
        user: { id: 'user-1' },
      },
    });
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/reconciliation/bulk-link', {
        body: JSON.stringify({
          entryIds: ['123e4567-e89b-42d3-a456-426614174001'],
          walletId: '123e4567-e89b-42d3-a456-426614174000',
        }),
        method: 'POST',
      }),
      params
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      message: 'Insufficient permissions',
    });
  });
});
