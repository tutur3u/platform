import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  expireCheckoutReservations: vi.fn(),
}));

vi.mock('@tuturuuu/inventory-core/commerce/checkouts', () => ({
  expireCheckoutReservations: (...args: unknown[]) =>
    mocks.expireCheckoutReservations(...args),
}));

vi.mock('@tuturuuu/utils/constants', () => ({ DEV_MODE: false }));

vi.mock('@/lib/infrastructure/log-drain', () => ({
  withCronLogDrain: (_context: unknown, callback: () => unknown) => callback(),
}));

describe('inventory checkout expiry cron', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'cron-secret');
  });

  it('rejects requests without the configured cron secret', async () => {
    const { GET } = await import('./route');
    const response = await GET(
      new Request(
        'http://localhost/api/cron/inventory/checkout-expiry'
      ) as never
    );

    expect(response.status).toBe(401);
    expect(mocks.expireCheckoutReservations).not.toHaveBeenCalled();
  });

  it('expires reservations in bounded batches until the queue is drained', async () => {
    mocks.expireCheckoutReservations
      .mockResolvedValueOnce(
        Array.from({ length: 1000 }, (_, index) => ({
          checkout_id: `checkout-${index}`,
          ws_id: 'ws-1',
        }))
      )
      .mockResolvedValueOnce([
        { checkout_id: 'checkout-final', ws_id: 'ws-1' },
      ]);
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/inventory/checkout-expiry', {
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      processed: { batches: 2, expired: 1001 },
    });
    expect(mocks.expireCheckoutReservations).toHaveBeenCalledTimes(2);
    expect(mocks.expireCheckoutReservations).toHaveBeenCalledWith({
      limit: 1000,
      now: expect.any(Date),
    });
  });

  it('returns a sanitized error when cleanup fails', async () => {
    mocks.expireCheckoutReservations.mockRejectedValue(
      new Error('database unavailable')
    );
    const { GET } = await import('./route');
    const response = await GET(
      new Request('http://localhost/api/cron/inventory/checkout-expiry', {
        headers: { Authorization: 'Bearer cron-secret' },
      }) as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: 'Internal Server Error',
    });
  });
});
